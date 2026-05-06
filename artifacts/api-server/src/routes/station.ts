import { Router, type IRouter } from "express";
import { db, stationCredentials, stationSyncLogs } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runSync } from "../lib/scraper";

const router: IRouter = Router();

router.get("/station/settings", requireAuth, async (_req, res): Promise<void> => {
  const [settings] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);

  if (!settings) {
    res.status(404).json({ error: "Henüz portal ayarı yapılandırılmadı." });
    return;
  }

  res.json({
    id: settings.id,
    portalUrl: settings.portalUrl,
    username: settings.username,
    isActive: settings.isActive,
    defaultBillingPeriod: settings.defaultBillingPeriod,
    syncIntervalMinutes: settings.syncIntervalMinutes,
    lastSuccessSyncAt: settings.lastSuccessSyncAt,
    lastErrorMessage: settings.lastErrorMessage,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  });
});

router.post("/station/settings", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const {
    portalUrl,
    username,
    password,
    isActive,
    defaultBillingPeriod,
    syncIntervalMinutes,
  } = req.body as {
    portalUrl?: string;
    username?: string;
    password?: string;
    isActive?: boolean;
    defaultBillingPeriod?: string;
    syncIntervalMinutes?: number;
  };

  if (!portalUrl || !username) {
    res.status(400).json({ error: "Portal adresi ve kullanıcı adı zorunludur." });
    return;
  }

  const [existing] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);

  let encryptedPassword = existing?.encryptedPassword;
  if (password && password.trim()) {
    encryptedPassword = encrypt(password);
  }

  if (!encryptedPassword) {
    res.status(400).json({ error: "Yeni ayar oluştururken şifre zorunludur." });
    return;
  }

  let saved;
  if (existing) {
    const [updated] = await db
      .update(stationCredentials)
      .set({
        portalUrl,
        username,
        encryptedPassword,
        isActive: isActive ?? true,
        defaultBillingPeriod: defaultBillingPeriod ?? null,
        syncIntervalMinutes: syncIntervalMinutes ?? 30,
        updatedAt: new Date(),
      })
      .where(eq(stationCredentials.id, existing.id))
      .returning();
    saved = updated;
  } else {
    const [created] = await db
      .insert(stationCredentials)
      .values({
        portalUrl,
        username,
        encryptedPassword,
        isActive: isActive ?? true,
        defaultBillingPeriod: defaultBillingPeriod ?? null,
        syncIntervalMinutes: syncIntervalMinutes ?? 30,
      })
      .returning();
    saved = created;
  }

  req.log.info({ settingsId: saved.id }, "Station settings saved");

  res.json({
    id: saved.id,
    portalUrl: saved.portalUrl,
    username: saved.username,
    isActive: saved.isActive,
    defaultBillingPeriod: saved.defaultBillingPeriod,
    syncIntervalMinutes: saved.syncIntervalMinutes,
    lastSuccessSyncAt: saved.lastSuccessSyncAt,
    lastErrorMessage: saved.lastErrorMessage,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  });
});

router.post("/station/test-connection", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [settings] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);

  if (!settings) {
    res.json({ success: false, message: "Önce portal ayarlarını kaydedin." });
    return;
  }

  if (!settings.isActive) {
    res.json({ success: false, message: "Portal ayarları pasif. Önce 'Aktif' anahtarını açın." });
    return;
  }

  try {
    const password = decrypt(settings.encryptedPassword);
    const result = await runSync(
      settings.portalUrl,
      settings.username,
      password,
      true
    );
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Test connection failed");
    res.json({ success: false, message: `Bağlantı başarısız: ${(err as Error).message}` });
  }
});

let syncRunning = false;

router.post("/station/sync-now", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (syncRunning) {
    res.status(409).json({ error: "Senkronizasyon zaten devam ediyor." });
    return;
  }

  const [settings] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);

  if (!settings || !settings.isActive) {
    res.json({
      success: false,
      message: "Aktif portal ayarı bulunamadı.",
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
    });
    return;
  }

  syncRunning = true;
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
    } else {
      await db
        .update(stationCredentials)
        .set({ lastErrorMessage: result.message, updatedAt: new Date() })
        .where(eq(stationCredentials.id, settings.id));
    }

    req.log.info({ logId, ...result }, "Sync completed");
    res.json({
      success: result.success,
      message: result.message,
      recordsFound: result.recordsFound,
      recordsInserted: result.recordsInserted,
      recordsUpdated: result.recordsUpdated,
    });
  } catch (err) {
    logger.error({ err, logId }, "Sync error");
    await db
      .update(stationSyncLogs)
      .set({
        status: "failed",
        message: (err as Error).message,
        finishedAt: new Date(),
      })
      .where(eq(stationSyncLogs.id, logId));

    await db
      .update(stationCredentials)
      .set({ lastErrorMessage: (err as Error).message, updatedAt: new Date() })
      .where(eq(stationCredentials.id, settings.id));

    res.json({
      success: false,
      message: (err as Error).message,
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
    });
  } finally {
    syncRunning = false;
  }
});

export { syncRunning };
export default router;
