import { db, stationCredentials } from "@workspace/db";
import { asc } from "drizzle-orm";
import { logger } from "./logger";
import { runAllAccounts, isOrchestratorRunning } from "./sync-orchestrator";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

export function startScheduler(): void {
  scheduleNext();
  logger.info("Sync scheduler started");
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function scheduleNext(): void {
  schedulerTimer = setTimeout(async () => {
    await runScheduledSync();
    scheduleNext();
  }, 60 * 1000);
}

// Tick: if ANY active account is due (last sync older than its interval), run
// the full multi-account orchestrator. Per-account staggering is implicitly
// handled by `lastSuccessSyncAt`.
async function runScheduledSync(): Promise<void> {
  if (isOrchestratorRunning()) {
    logger.debug("Sync already running, skipping scheduler tick");
    return;
  }
  try {
    const accounts = await db
      .select()
      .from(stationCredentials)
      .orderBy(asc(stationCredentials.id));

    const now = Date.now();
    const dueAny = accounts.some((c) => {
      if (!c.isActive) return false;
      const intervalMs = c.syncIntervalMinutes * 60 * 1000;
      const lastSync = c.lastSuccessSyncAt
        ? new Date(c.lastSuccessSyncAt).getTime()
        : 0;
      return now - lastSync >= intervalMs;
    });
    if (!dueAny) return;

    logger.info("Scheduled multi-account sync triggered");
    await runAllAccounts();
  } catch (err) {
    logger.error({ err }, "Scheduler error");
  }
}
