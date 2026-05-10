import { db, schedulerSettings, stationSyncLogs, starlinkSyncLogs, leobridgeSyncLogs } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "./logger";
import {
  runAllAccountsClaimed,
  isOrchestratorRunning,
  tryClaimRun,
  releaseRun,
} from "./sync-orchestrator";
import { runStarlinkSync, isStarlinkSyncRunning } from "./starlink-sync";
import { runLeobridgeSync, isLeobridgeSyncRunning } from "./leobridge-sync";
import * as progress from "./sync-progress";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let cachedIntervalMinutes = 30;
let cachedEnabled = true;
let cachedNextRunAt: Date | null = null;

export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 360;
// Boot self-heal: only mark "running" rows that started > 60 min ago as
// orphaned. Satcom Playwright walks can legitimately take ~20 min; 60 min
// is conservative headroom + protects newly-started runs from being killed
// during a tiny window where app.listen() opens before startScheduler()
// completes (in case a manual sync request races boot).
const STUCK_THRESHOLD_MINUTES = 60;

async function readSettings(): Promise<{ intervalMinutes: number; enabled: boolean }> {
  const [row] = await db
    .select()
    .from(schedulerSettings)
    .where(eq(schedulerSettings.id, 1));
  if (!row) {
    await db
      .insert(schedulerSettings)
      .values({ id: 1, intervalMinutes: 30, enabled: true })
      .onConflictDoNothing();
    return { intervalMinutes: 30, enabled: true };
  }
  const interval = Math.max(
    MIN_INTERVAL_MINUTES,
    Math.min(MAX_INTERVAL_MINUTES, row.intervalMinutes)
  );
  return { intervalMinutes: interval, enabled: row.enabled };
}

function nextRunAt(intervalMinutes: number, now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const minute = next.getUTCMinutes();
  const nextSlot = (Math.floor(minute / intervalMinutes) + 1) * intervalMinutes;
  next.setUTCMinutes(nextSlot);
  return next;
}

// Self-heal: any sync_logs row left in "running" status > STUCK_THRESHOLD_MINUTES
// is orphaned (Satcom worst-case is ~20 min; 60 min headroom). Newly started
// runs (during the small race window where app.listen opens before
// startScheduler completes) are spared because their startedAt is fresh.
async function selfHealOrphanRunningLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60_000);
  const message = `Server yeniden başlatıldı — sync kesildi (${STUCK_THRESHOLD_MINUTES}dk+ "running" kaldığı için orphan sayıldı).`;
  const fixedAt = new Date();
  const tables = [
    { table: stationSyncLogs, name: "station_sync_logs" },
    { table: starlinkSyncLogs, name: "starlink_sync_logs" },
    { table: leobridgeSyncLogs, name: "leobridge_sync_logs" },
  ] as const;
  for (const { table, name } of tables) {
    const result = await db
      .update(table)
      .set({
        status: "failed",
        message,
        finishedAt: fixedAt,
      })
      .where(and(eq(table.status, "running"), lt(table.startedAt, cutoff)))
      .returning({ id: table.id });
    if (result.length > 0) {
      logger.warn(
        { table: name, count: result.length, thresholdMinutes: STUCK_THRESHOLD_MINUTES },
        "Self-heal: marked stuck running sync_logs as failed"
      );
    }
  }
}

export async function startScheduler(): Promise<void> {
  await selfHealOrphanRunningLogs();
  const { intervalMinutes, enabled } = await readSettings();
  cachedIntervalMinutes = intervalMinutes;
  cachedEnabled = enabled;
  if (!enabled) {
    cachedNextRunAt = null;
    logger.info({ intervalMinutes }, "Sync scheduler is DISABLED (admin toggle)");
    return;
  }
  scheduleNext();
  logger.info(
    { nextRunAt: cachedNextRunAt?.toISOString(), intervalMinutes },
    `Sync scheduler started (every ${intervalMinutes}m, Starlink → Leo Bridge → Satcom)`
  );
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  cachedNextRunAt = null;
}

export async function restartScheduler(): Promise<void> {
  stopScheduler();
  await startScheduler();
}

export function getSchedulerStatus(): {
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string | null;
  isRunning: boolean;
} {
  return {
    intervalMinutes: cachedIntervalMinutes,
    enabled: cachedEnabled,
    nextRunAt: cachedNextRunAt?.toISOString() ?? null,
    isRunning:
      isOrchestratorRunning() ||
      isStarlinkSyncRunning() ||
      isLeobridgeSyncRunning(),
  };
}

// "Soft cancel": releases the in-memory locks AND marks any DB row currently
// `running` as `cancelled`. Background promises still finish but their final
// status writes will see no matching rows (because we mark them done here).
export async function cancelRunningSync(): Promise<{
  cancelledRows: number;
  releasedFlags: string[];
}> {
  const flags: string[] = [];
  if (isOrchestratorRunning()) {
    releaseRun();
    flags.push("satcom");
  }
  // Starlink / Leo Bridge use their own internal flags; we cannot safely
  // unset them without breaking their result write. Instead we just mark DB
  // rows cancelled — the sync will keep running in background but the UI
  // immediately reflects "cancelled" state.
  if (isStarlinkSyncRunning()) flags.push("starlink (background continues)");
  if (isLeobridgeSyncRunning()) flags.push("leobridge (background continues)");

  const message = "Operatör tarafından iptal edildi.";
  const finishedAt = new Date();
  let cancelled = 0;
  for (const table of [stationSyncLogs, starlinkSyncLogs, leobridgeSyncLogs]) {
    const r = await db
      .update(table)
      .set({ status: "cancelled", message, finishedAt })
      .where(eq(table.status, "running"))
      .returning({ id: table.id });
    cancelled += r.length;
  }
  // Reset live progress so UI doesn't show stale "X% complete" forever.
  progress.finishCombinedRun(message, false);
  logger.warn({ cancelled, flags }, "Manual sync cancellation invoked");
  return { cancelledRows: cancelled, releasedFlags: flags };
}

function scheduleNext(): void {
  const at = nextRunAt(cachedIntervalMinutes);
  cachedNextRunAt = at;
  const delayMs = Math.max(1000, at.getTime() - Date.now());
  schedulerTimer = setTimeout(async () => {
    try {
      const { intervalMinutes, enabled } = await readSettings();
      cachedIntervalMinutes = intervalMinutes;
      cachedEnabled = enabled;
      if (!enabled) {
        logger.info("Scheduler disabled — skipping tick (will re-check in 1m)");
        cachedNextRunAt = new Date(Date.now() + 60_000);
        schedulerTimer = setTimeout(() => scheduleNext(), 60_000);
        return;
      }
      await runScheduledTick();
    } catch (err) {
      logger.error({ err }, "Scheduler tick fatal error");
    }
    scheduleNext();
  }, delayMs);
}

async function runScheduledTick(): Promise<void> {
  if (
    isOrchestratorRunning() ||
    isStarlinkSyncRunning() ||
    isLeobridgeSyncRunning()
  ) {
    logger.debug("Sync already running, skipping scheduled tick");
    return;
  }
  progress.startCombinedRun();
  let starlinkOk = true;
  let leobridgeOk = true;
  let satcomOk = true;

  try {
    logger.info("Scheduled Starlink phase starting");
    const r = await runStarlinkSync();
    if (!r.success && r.terminalCount === 0) {
      starlinkOk = true;
    } else {
      starlinkOk = r.success;
    }
  } catch (err) {
    starlinkOk = false;
    logger.error({ err }, "Scheduled Starlink phase crashed");
    progress.finishStarlinkPhase(
      `Starlink hata: ${(err as Error).message}`,
      false
    );
  }

  try {
    logger.info("Scheduled Leo Bridge phase starting");
    const r = await runLeobridgeSync();
    if (!r.success && r.terminalCount === 0) {
      leobridgeOk = true;
    } else {
      leobridgeOk = r.success;
    }
  } catch (err) {
    leobridgeOk = false;
    logger.error({ err }, "Scheduled Leo Bridge phase crashed");
    progress.finishLeobridgePhase(
      `Leo Bridge hata: ${(err as Error).message}`,
      false
    );
  }

  try {
    logger.info("Scheduled Satcom phase starting (forceFull)");
    if (!tryClaimRun()) {
      logger.debug("Satcom orchestrator already claimed, skipping cron Satcom phase");
      satcomOk = true;
    } else {
      const r = await runAllAccountsClaimed({ forceFull: true });
      if (!r.success && r.recordsFound === 0 && r.message.includes("Aktif")) {
        satcomOk = true;
      } else {
        satcomOk = r.success;
      }
    }
  } catch (err) {
    satcomOk = false;
    logger.error({ err }, "Scheduled Satcom phase crashed");
  }

  const ok = starlinkOk && leobridgeOk && satcomOk;
  progress.finishCombinedRun(
    ok
      ? "Otomatik tur tamamlandı (Starlink + Leo Bridge + Satcom)."
      : "Otomatik tur kısmen tamamlandı (bir veya daha fazla faz başarısız).",
    ok
  );
}

