import { db, stationCredentials, stationSyncLogs } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "./logger";
import { decrypt } from "./crypto";
import { runSync } from "./scraper";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunning = false;

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
  }, 60 * 1000); // Check every minute, actual interval enforced by last sync time
}

async function runScheduledSync(): Promise<void> {
  if (syncRunning) {
    logger.debug("Sync already running, skipping scheduler tick");
    return;
  }

  try {
    const [settings] = await db
      .select()
      .from(stationCredentials)
      .orderBy(desc(stationCredentials.createdAt))
      .limit(1);

    if (!settings || !settings.isActive) {
      return;
    }

    const intervalMs = settings.syncIntervalMinutes * 60 * 1000;
    const now = Date.now();
    const lastSync = settings.lastSuccessSyncAt
      ? new Date(settings.lastSuccessSyncAt).getTime()
      : 0;

    if (now - lastSync < intervalMs) {
      return; // Not time yet
    }

    syncRunning = true;
    logger.info({ settingsId: settings.id }, "Scheduled sync starting");

    const logEntry = await db
      .insert(stationSyncLogs)
      .values({ status: "running", startedAt: new Date() })
      .returning();
    const logId = logEntry[0].id;

    try {
      const password = decrypt(settings.encryptedPassword);
      const result = await runSync(settings.portalUrl, settings.username, password, false);

      await db
        .update(stationSyncLogs)
        .set({
          status: result.success ? "success" : "failed",
          message: result.message,
          recordsFound: result.recordsFound,
          recordsInserted: result.recordsInserted,
          recordsUpdated: result.recordsUpdated,
          screenshotPath: result.screenshotPath ?? null,
          htmlSnapshotPath: result.htmlSnapshotPath ?? null,
          finishedAt: new Date(),
        })
        .where(eq(stationSyncLogs.id, logId));

      if (result.success) {
        await db
          .update(stationCredentials)
          .set({ lastSuccessSyncAt: new Date(), lastErrorMessage: null, updatedAt: new Date() })
          .where(eq(stationCredentials.id, settings.id));
        logger.info({ logId, ...result }, "Scheduled sync completed successfully");
      } else {
        await db
          .update(stationCredentials)
          .set({ lastErrorMessage: result.message, updatedAt: new Date() })
          .where(eq(stationCredentials.id, settings.id));
        logger.warn({ logId, message: result.message }, "Scheduled sync failed");
      }
    } catch (err) {
      logger.error({ err, logId }, "Scheduled sync error");
      await db
        .update(stationSyncLogs)
        .set({ status: "failed", message: (err as Error).message, finishedAt: new Date() })
        .where(eq(stationSyncLogs.id, logId));
      await db
        .update(stationCredentials)
        .set({ lastErrorMessage: (err as Error).message, updatedAt: new Date() })
        .where(eq(stationCredentials.id, settings.id));
    }
  } catch (err) {
    logger.error({ err }, "Scheduler error");
  } finally {
    syncRunning = false;
  }
}
