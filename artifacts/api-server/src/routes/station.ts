import { Router, type IRouter } from "express";
import {
  db,
  stationCredentials,
  stationSyncLogs,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
} from "@workspace/db";
import { eq, asc, desc, sql, count } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runSync } from "../lib/scraper";
import {
  runAllAccounts,
  isOrchestratorRunning,
  tryClaimRun,
} from "../lib/sync-orchestrator";
import * as progress from "../lib/sync-progress";

const router: IRouter = Router();

function accountSummary(
  c: typeof stationCredentials.$inferSelect,
  kitCount: number
) {
  return {
    id: c.id,
    label: c.label,
    portalUrl: c.portalUrl,
    username: c.username,
    isActive: c.isActive,
    syncIntervalMinutes: c.syncIntervalMinutes,
    lastSuccessSyncAt: c.lastSuccessSyncAt,
    lastErrorMessage: c.lastErrorMessage,
    firstFullSyncAt: c.firstFullSyncAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    kitCount,
  };
}

// =============================================================================
// Multi-account CRUD
// =============================================================================

router.get("/station/accounts", requireAuth, async (_req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(stationCredentials)
    .orderBy(asc(stationCredentials.id));

  // Per-account kit counts.
  const counts = await db
    .select({
      credentialId: stationKits.credentialId,
      n: count(),
    })
    .from(stationKits)
    .groupBy(stationKits.credentialId);
  const byCred = new Map(counts.map((r) => [r.credentialId, Number(r.n)]));

  res.json(accounts.map((c) => accountSummary(c, byCred.get(c.id) ?? 0)));
});

router.post("/station/accounts", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const {
    label,
    portalUrl,
    username,
    password,
    isActive,
    syncIntervalMinutes,
  } = req.body as {
    label?: string | null;
    portalUrl?: string;
    username?: string;
    password?: string;
    isActive?: boolean;
    syncIntervalMinutes?: number;
  };
  if (!portalUrl || !username || !password) {
    res
      .status(400)
      .json({ error: "Portal adresi, kullanıcı adı ve şifre zorunludur." });
    return;
  }
  const [created] = await db
    .insert(stationCredentials)
    .values({
      label: label ?? null,
      portalUrl,
      username,
      encryptedPassword: encrypt(password),
      isActive: isActive ?? true,
      syncIntervalMinutes: syncIntervalMinutes ?? 30,
    })
    .returning();
  req.log.info({ id: created.id, label }, "Station account created");
  res.json(accountSummary(created, 0));
});

router.patch("/station/accounts/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz hesap ID." });
    return;
  }
  const {
    label,
    portalUrl,
    username,
    password,
    isActive,
    syncIntervalMinutes,
  } = req.body as Partial<{
    label: string | null;
    portalUrl: string;
    username: string;
    password: string | null;
    isActive: boolean;
    syncIntervalMinutes: number;
  }>;
  const updates: Partial<typeof stationCredentials.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (label !== undefined) updates.label = label;
  if (portalUrl !== undefined) updates.portalUrl = portalUrl;
  if (username !== undefined) updates.username = username;
  if (password && password.trim()) updates.encryptedPassword = encrypt(password);
  if (isActive !== undefined) updates.isActive = isActive;
  if (syncIntervalMinutes !== undefined)
    updates.syncIntervalMinutes = syncIntervalMinutes;

  const [updated] = await db
    .update(stationCredentials)
    .set(updates)
    .where(eq(stationCredentials.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Hesap bulunamadı." });
    return;
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(stationKits)
    .where(eq(stationKits.credentialId, id));
  res.json(accountSummary(updated, Number(n ?? 0)));
});

router.delete("/station/accounts/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz hesap ID." });
    return;
  }
  const deleted = await db
    .delete(stationCredentials)
    .where(eq(stationCredentials.id, id))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Hesap bulunamadı." });
    return;
  }
  req.log.warn({ id }, "Station account deleted (cascade wiped data)");
  res.json({ message: "Hesap ve tüm verisi silindi." });
});

router.post(
  "/station/accounts/:id/test-connection",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    const [c] = await db
      .select()
      .from(stationCredentials)
      .where(eq(stationCredentials.id, id))
      .limit(1);
    if (!c) {
      res.status(404).json({ success: false, message: "Hesap bulunamadı." });
      return;
    }
    try {
      const password = decrypt(c.encryptedPassword);
      const result = await runSync({
        credentialId: c.id,
        portalUrl: c.portalUrl,
        username: c.username,
        password,
        testOnly: true,
      });
      res.json({ success: result.success, message: result.message });
    } catch (err) {
      req.log.error({ err, id }, "Test connection failed");
      res.json({
        success: false,
        message: `Bağlantı başarısız: ${(err as Error).message}`,
      });
    }
  }
);

// =============================================================================
// Legacy single-account settings (geriye dönük uyumluluk — ilk hesabı kullanır)
// =============================================================================

async function firstAccount() {
  const [c] = await db
    .select()
    .from(stationCredentials)
    .orderBy(asc(stationCredentials.id))
    .limit(1);
  return c;
}

router.get("/station/settings", requireAuth, async (_req, res): Promise<void> => {
  const settings = await firstAccount();
  if (!settings) {
    res.status(404).json({ error: "Henüz portal ayarı yapılandırılmadı." });
    return;
  }
  res.json({
    id: settings.id,
    label: settings.label,
    portalUrl: settings.portalUrl,
    username: settings.username,
    isActive: settings.isActive,
    defaultBillingPeriod: settings.defaultBillingPeriod,
    syncIntervalMinutes: settings.syncIntervalMinutes,
    lastSuccessSyncAt: settings.lastSuccessSyncAt,
    lastErrorMessage: settings.lastErrorMessage,
    firstFullSyncAt: settings.firstFullSyncAt,
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
  const existing = await firstAccount();
  let encryptedPassword = existing?.encryptedPassword;
  if (password && password.trim()) encryptedPassword = encrypt(password);
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

  req.log.info({ settingsId: saved.id }, "Station settings saved (legacy)");
  res.json({
    id: saved.id,
    label: saved.label,
    portalUrl: saved.portalUrl,
    username: saved.username,
    isActive: saved.isActive,
    defaultBillingPeriod: saved.defaultBillingPeriod,
    syncIntervalMinutes: saved.syncIntervalMinutes,
    lastSuccessSyncAt: saved.lastSuccessSyncAt,
    lastErrorMessage: saved.lastErrorMessage,
    firstFullSyncAt: saved.firstFullSyncAt,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  });
});

router.post("/station/test-connection", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const settings = await firstAccount();
  if (!settings) {
    res.json({ success: false, message: "Önce portal ayarlarını kaydedin." });
    return;
  }
  if (!settings.isActive) {
    res.json({ success: false, message: "Portal ayarları pasif." });
    return;
  }
  try {
    const password = decrypt(settings.encryptedPassword);
    const result = await runSync({
      credentialId: settings.id,
      portalUrl: settings.portalUrl,
      username: settings.username,
      password,
      testOnly: true,
    });
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Test connection failed");
    res.json({
      success: false,
      message: `Bağlantı başarısız: ${(err as Error).message}`,
    });
  }
});

// =============================================================================
// Sync orchestration + live progress
// =============================================================================

router.post("/station/sync-now", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  // Atomic claim BEFORE any async work — guarantees two concurrent requests
  // cannot both pass the gate.
  if (!tryClaimRun()) {
    res.status(409).json({ error: "Senkronizasyon zaten devam ediyor." });
    return;
  }
  // Pre-check: at least one active account must exist so we don't lie to the
  // user with "started" + "0 / 0 / 0".
  const [active] = await db
    .select({ id: stationCredentials.id })
    .from(stationCredentials)
    .where(eq(stationCredentials.isActive, true))
    .limit(1);
  if (!active) {
    // Release the claim — runAllAccounts() will re-claim atomically when called.
    // Since we already hold `running=true`, we need to release explicitly.
    // The simplest path: call runAllAccounts() now (inside which the no-active
    // guard fires and returns), and have its finally release the lock.
    void runAllAccounts().catch(() => {});
    res.status(400).json({ error: "Aktif portal hesabı bulunamadı." });
    return;
  }
  // Fire-and-forget — claim already held, runAllAccounts() reuses it.
  void runAllAccounts()
    .then((r) => {
      logger.info({ ...r }, "Multi-account sync finished");
    })
    .catch((err) => {
      logger.error({ err }, "Multi-account sync crashed");
    });
  res.json({
    success: true,
    message: "Senkronizasyon başlatıldı.",
    recordsFound: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
  });
});

router.get("/station/sync-progress", requireAuth, async (_req, res): Promise<void> => {
  res.json(progress.getProgress());
});

// =============================================================================
// Wipe data (single account or all)
// =============================================================================

router.post("/station/wipe-data", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (isOrchestratorRunning()) {
    res
      .status(409)
      .json({ error: "Senkronizasyon devam ediyor — önce tamamlanmasını bekleyin." });
    return;
  }
  const credentialIdRaw = req.query.credentialId;
  let credentialId: number | null = null;
  if (credentialIdRaw !== undefined && credentialIdRaw !== "") {
    // Param present → must be a valid integer; otherwise reject so an invalid
    // value can NEVER be silently treated as "wipe everything".
    const parsed =
      typeof credentialIdRaw === "string"
        ? parseInt(credentialIdRaw, 10)
        : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      res.status(400).json({ error: "Geçersiz credentialId." });
      return;
    }
    credentialId = parsed;
  }

  let dailyDel, totalDel, kitsDel, logsDel;
  if (credentialId !== null) {
    dailyDel = await db
      .delete(stationKitDaily)
      .where(eq(stationKitDaily.credentialId, credentialId))
      .returning({ id: stationKitDaily.cdrId });
    totalDel = await db
      .delete(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.credentialId, credentialId))
      .returning({ id: stationKitPeriodTotal.kitNo });
    kitsDel = await db
      .delete(stationKits)
      .where(eq(stationKits.credentialId, credentialId))
      .returning({ id: stationKits.kitNo });
    logsDel = await db
      .delete(stationSyncLogs)
      .where(eq(stationSyncLogs.credentialId, credentialId))
      .returning({ id: stationSyncLogs.id });
    await db
      .update(stationCredentials)
      .set({
        firstFullSyncAt: null,
        lastSuccessSyncAt: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(stationCredentials.id, credentialId));
  } else {
    dailyDel = await db.delete(stationKitDaily).returning({ id: stationKitDaily.cdrId });
    totalDel = await db
      .delete(stationKitPeriodTotal)
      .returning({ id: stationKitPeriodTotal.kitNo });
    kitsDel = await db.delete(stationKits).returning({ id: stationKits.kitNo });
    logsDel = await db.delete(stationSyncLogs).returning({ id: stationSyncLogs.id });
    await db
      .update(stationCredentials)
      .set({
        firstFullSyncAt: null,
        lastSuccessSyncAt: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      });
  }

  const deleted = {
    kitDaily: dailyDel.length,
    kitPeriodTotal: totalDel.length,
    kits: kitsDel.length,
    syncLogs: logsDel.length,
  };
  req.log.warn({ deleted, credentialId }, "Station data wiped by admin");

  res.json({
    success: true,
    message:
      credentialId !== null
        ? `Hesap #${credentialId}: ${deleted.kits} KIT, ${deleted.kitPeriodTotal} dönem toplamı, ${deleted.kitDaily} CDR, ${deleted.syncLogs} sync kaydı silindi.`
        : `Tüm veriler temizlendi: ${deleted.kits} KIT, ${deleted.kitPeriodTotal} dönem toplamı, ${deleted.kitDaily} CDR, ${deleted.syncLogs} sync kaydı silindi.`,
    deleted,
  });
});

// Suppress unused-import warning (sql/desc kept for future extensions).
void sql;
void desc;

export default router;
