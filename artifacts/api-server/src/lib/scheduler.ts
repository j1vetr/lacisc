import { logger } from "./logger";
import { runAllAccounts, isOrchestratorRunning } from "./sync-orchestrator";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

// Cron interval: every 3 hours, aligned to fixed UTC boundaries
// (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC).
// Each tick runs the same code path as the manual "Şimdi Senkronize Et"
// button (forceFull: true) so the dashboard / kit list always reflect a
// fresh full backfill instead of just the current+previous period.
const INTERVAL_HOURS = 3;

function nextRunAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  const currentHour = next.getUTCHours();
  const nextSlot = (Math.floor(currentHour / INTERVAL_HOURS) + 1) * INTERVAL_HOURS;
  next.setUTCHours(nextSlot);
  // setUTCHours with a value >= 24 rolls the date forward correctly.
  return next;
}

export function startScheduler(): void {
  scheduleNext();
  const at = nextRunAt();
  logger.info(
    { nextRunAt: at.toISOString(), intervalHours: INTERVAL_HOURS },
    `Sync scheduler started (every ${INTERVAL_HOURS}h, full backfill)`
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
    await runScheduledSync();
    scheduleNext();
  }, delayMs);
}

// Tick handler: kick off a full multi-account backfill — same code path as
// the manual "Şimdi Senkronize Et" button. If an orchestrator run is already
// in flight (e.g. operator hit the manual button right before the cron
// fires) the orchestrator's own atomic claim returns success:false and we
// log+skip. We do NOT call isOrchestratorRunning() here as a pre-check —
// that would race against the claim; we just trust the orchestrator's lock.
async function runScheduledSync(): Promise<void> {
  if (isOrchestratorRunning()) {
    logger.debug("Sync already running, skipping scheduled tick");
    return;
  }
  try {
    logger.info("Scheduled multi-account sync triggered (forceFull)");
    const result = await runAllAccounts({ forceFull: true });
    if (!result.success) {
      logger.info({ message: result.message }, "Scheduled tick produced no work");
    }
  } catch (err) {
    logger.error({ err }, "Scheduler error");
  }
}
