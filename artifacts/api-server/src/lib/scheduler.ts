import { db, stationCredentials } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { logger } from "./logger";
import { runAllAccounts, isOrchestratorRunning } from "./sync-orchestrator";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

// Daily cron: run once per day at 01:00 Europe/Istanbul (UTC+3, no DST) =
// 22:00 UTC of the previous calendar day. We model this by computing the
// next 22:00 UTC and arming a single setTimeout, then re-arming after the
// run completes.
function nextRunAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(22, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function startScheduler(): void {
  scheduleNext();
  const at = nextRunAt();
  logger.info({ nextRunAt: at.toISOString() }, "Sync scheduler started (daily 01:00 TRT)");
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
    await runScheduledSync();
    scheduleNext();
  }, delayMs);
}

// Daily tick: if there is at least one active account, run the multi-account
// orchestrator. Per-account interval is no longer consulted.
async function runScheduledSync(): Promise<void> {
  if (isOrchestratorRunning()) {
    logger.debug("Sync already running, skipping scheduled tick");
    return;
  }
  try {
    const [active] = await db
      .select({ id: stationCredentials.id })
      .from(stationCredentials)
      .where(eq(stationCredentials.isActive, true))
      .orderBy(asc(stationCredentials.id))
      .limit(1);
    if (!active) {
      logger.info("Daily scheduler tick: no active accounts, skipping");
      return;
    }
    logger.info("Daily scheduled multi-account sync triggered");
    await runAllAccounts();
  } catch (err) {
    logger.error({ err }, "Scheduler error");
  }
}
