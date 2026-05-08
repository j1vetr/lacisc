import { logger } from "./logger";
import {
  runAllAccountsClaimed,
  isOrchestratorRunning,
  tryClaimRun,
} from "./sync-orchestrator";
import { runStarlinkSync, isStarlinkSyncRunning } from "./starlink-sync";
import { runLeobridgeSync, isLeobridgeSyncRunning } from "./leobridge-sync";
import * as progress from "./sync-progress";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

// Cron interval: every 30 minutes, aligned to :00 and :30 UTC.
// Each tick runs Starlink (Tototheo API) FIRST, then Satcom (Playwright
// scraper, full backfill). Live progress shows both phases sequentially.
const INTERVAL_MINUTES = 30;

function nextRunAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const minute = next.getUTCMinutes();
  const nextSlot = (Math.floor(minute / INTERVAL_MINUTES) + 1) * INTERVAL_MINUTES;
  // setUTCMinutes with a value >= 60 rolls the hour forward correctly.
  next.setUTCMinutes(nextSlot);
  return next;
}

export function startScheduler(): void {
  scheduleNext();
  const at = nextRunAt();
  logger.info(
    { nextRunAt: at.toISOString(), intervalMinutes: INTERVAL_MINUTES },
    `Sync scheduler started (every ${INTERVAL_MINUTES}m, Starlink → Satcom)`
  );
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function scheduleNext(): void {
  const delayMs = Math.max(1000, nextRunAt().getTime() - Date.now());
  schedulerTimer = setTimeout(async () => {
    await runScheduledTick();
    scheduleNext();
  }, delayMs);
}

// Sequential Starlink → Satcom tick. We deliberately do NOT run them in
// parallel: live progress UI is single-stream, and back-to-back keeps the
// status line readable for operators.
async function runScheduledTick(): Promise<void> {
  if (
    isOrchestratorRunning() ||
    isStarlinkSyncRunning() ||
    isLeobridgeSyncRunning()
  ) {
    logger.debug("Sync already running, skipping scheduled tick");
    return;
  }
  // Boot a combined run-state envelope so /sync-progress shows a single
  // continuous run wrapping all phases (Starlink → Leo Bridge → Satcom).
  progress.startCombinedRun();
  let starlinkOk = true;
  let leobridgeOk = true;
  let satcomOk = true;

  try {
    logger.info("Scheduled Starlink phase starting");
    const r = await runStarlinkSync();
    if (!r.success && r.terminalCount === 0) {
      // No-op result (disabled/unconfigured) — don't count as failure.
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
      // A manual sync slipped in between phases — leave it alone.
      logger.debug("Satcom orchestrator already claimed, skipping cron Satcom phase");
      satcomOk = true;
    } else {
      const r = await runAllAccountsClaimed({ forceFull: true });
      if (!r.success && r.recordsFound === 0 && r.message.includes("Aktif")) {
        // No active accounts — informational, not a hard failure.
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
