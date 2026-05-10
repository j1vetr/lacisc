import { Router, type IRouter } from "express";
import {
  db,
  stationCredentials,
  stationSyncLogs,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
  starlinkCredentials,
  starlinkTerminals,
  starlinkTerminalDaily,
  starlinkTerminalPeriodTotal,
  starlinkSyncLogs,
  leobridgeCredentials,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
  leobridgeSyncLogs,
} from "@workspace/db";
import { eq, asc, desc, sql, count } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { runSync } from "../lib/scraper";
import {
  runAllAccountsClaimed,
  isOrchestratorRunning,
  tryClaimRun,
  releaseRun,
} from "../lib/sync-orchestrator";
import { runStarlinkSync, isStarlinkSyncRunning } from "../lib/starlink-sync";
import { runLeobridgeSync, isLeobridgeSyncRunning } from "../lib/leobridge-sync";
import * as progress from "../lib/sync-progress";
import { flushAllPendingDigests } from "../lib/whatsapp";
import {
  getEmailSettings,
  saveEmailSettings,
  sendTestEmail,
} from "../lib/alerts";
import { UpdateEmailSettingsBody } from "@workspace/api-zod";

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

router.get("/station/accounts", requireAuth, requireRole("viewer"), async (_req, res): Promise<void> => {
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

router.post("/station/accounts", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
  await audit(req, {
    action: "station.account.create",
    target: `account:${created.id}`,
    meta: { label, username, portalUrl },
  });
  res.json(accountSummary(created, 0));
});

router.patch("/station/accounts/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
  await audit(req, {
    action: "station.account.update",
    target: `account:${id}`,
    meta: {
      changedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
      passwordChanged: Boolean(password && password.trim()),
    },
  });
  res.json(accountSummary(updated, Number(n ?? 0)));
});

router.delete("/station/accounts/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
  await audit(req, {
    action: "station.account.delete",
    target: `account:${id}`,
  });
  res.json({ message: "Hesap ve tüm verisi silindi." });
});

router.post(
  "/station/accounts/:id/test-connection",
  requireAuth,
  requireRole("admin"),
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
        credentialLabel: c.label || c.username,
        portalUrl: c.portalUrl,
        username: c.username,
        password,
        testOnly: true,
      });
      await audit(req, {
        action: "station.account.test_connection",
        target: `account:${id}`,
        success: result.success,
        meta: { label: c.label, username: c.username, message: result.message },
      });
      res.json({ success: result.success, message: result.message });
    } catch (err) {
      req.log.error({ err, id }, "Test connection failed");
      await audit(req, {
        action: "station.account.test_connection",
        target: `account:${id}`,
        success: false,
        meta: { error: (err as Error).message },
      });
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

router.get("/station/settings", requireAuth, requireRole("viewer"), async (_req, res): Promise<void> => {
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

router.post("/station/settings", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
  await audit(req, {
    action: "station.settings.update",
    target: `account:${saved.id}`,
    meta: {
      passwordChanged: Boolean(password && password.trim()),
      isActive: saved.isActive,
      portalUrl: saved.portalUrl,
      username: saved.username,
    },
  });
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

router.post("/station/test-connection", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
      credentialLabel: settings.label || settings.username,
      portalUrl: settings.portalUrl,
      username: settings.username,
      password,
      testOnly: true,
    });
    await audit(req, {
      action: "station.test_connection",
      target: `account:${settings.id}`,
      success: result.success,
      meta: { username: settings.username, message: result.message },
    });
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    req.log.error({ err }, "Test connection failed");
    await audit(req, {
      action: "station.test_connection",
      target: `account:${settings.id}`,
      success: false,
      meta: { error: (err as Error).message },
    });
    res.json({
      success: false,
      message: `Bağlantı başarısız: ${(err as Error).message}`,
    });
  }
});

// =============================================================================
// Sync orchestration + live progress
// =============================================================================

router.post("/station/sync-now", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
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
    // We already hold the lock. runAllAccountsClaimed() runs the no-active
    // guard and releases the lock in its own finally — fire-and-forget so
    // the HTTP response isn't blocked.
    void runAllAccountsClaimed({ forceFull: true }).catch(() => {});
    res.status(400).json({ error: "Aktif portal hesabı bulunamadı." });
    return;
  }
  // Fire-and-forget — claim already held, runAllAccountsClaimed() reuses it
  // and releases on completion. Manual button always forces a full backfill
  // (202601 → current) for every account. Phases run in the same order as the
  // 30-min cron: Tototheo (Starlink) → Leo Bridge (Norway) → Satcom. All three
  // phases share a single combined run-state envelope so /sync-progress shows
  // one continuous run.
  progress.startCombinedRun();
  void (async () => {
    let starlinkOk = true;
    let leobridgeOk = true;
    let satcomOk = true;

    // Phase 1: Tototheo Starlink. Has its own internal lock; we reuse the
    // orchestrator claim only as a coarse "manual run is alive" gate.
    try {
      if (isStarlinkSyncRunning()) {
        logger.debug("Starlink sync already in flight, skipping chained phase");
      } else {
        const r = await runStarlinkSync();
        logger.info({ ...r }, "Manual Starlink phase finished");
        starlinkOk =
          r.success || (!r.success && r.terminalCount === 0); // disabled = soft-ok
      }
    } catch (err) {
      starlinkOk = false;
      logger.error({ err }, "Manual Starlink phase crashed");
    }

    // Phase 2: Leo Bridge / Space Norway.
    try {
      if (isLeobridgeSyncRunning()) {
        logger.debug("Leo Bridge sync already in flight, skipping chained phase");
      } else {
        const r = await runLeobridgeSync();
        logger.info({ ...r }, "Manual Leo Bridge phase finished");
        leobridgeOk =
          r.success || (!r.success && r.terminalCount === 0); // disabled = soft-ok
      }
    } catch (err) {
      leobridgeOk = false;
      logger.error({ err }, "Manual Leo Bridge phase crashed");
    }

    // Phase 3: Satcom (Playwright). runAllAccountsClaimed() releases the lock
    // in its own finally{}, so the orchestrator claim we hold from the gate
    // above is the one it consumes here.
    try {
      const r = await runAllAccountsClaimed({ forceFull: true });
      logger.info({ ...r }, "Manual Satcom phase finished");
      satcomOk =
        r.success ||
        (r.recordsFound === 0 && r.message.includes("Aktif"));
    } catch (err) {
      satcomOk = false;
      logger.error({ err }, "Manual Satcom phase crashed");
      // Lock is held by runAllAccountsClaimed(); ensure we release on hard crash.
      try { releaseRun(); } catch { /* already released */ }
    }

    // WhatsApp digest: tur boyunca biriken tüm pending alert'leri tek seferde
    // alıcı başına TEK mesajda topla. Debounce penceresi (60 sn) Satcom
    // scraper'ının KIT'ler arası 30-60 sn boşluklarına takılabildiği için
    // burada zorla flush ediyoruz — bir sync turu = her alıcıya en fazla 1
    // (veya 20+ KIT'te bölünmüş seri) mesaj garantisi.
    try {
      await flushAllPendingDigests();
    } catch (err) {
      logger.error({ err }, "Manual run sonrası WhatsApp digest flush hatası");
    }

    const ok = starlinkOk && leobridgeOk && satcomOk;
    progress.finishCombinedRun(
      ok
        ? "Manuel tur tamamlandı (Tototheo + Leo Bridge + Satcom)."
        : "Manuel tur kısmen tamamlandı (bir veya daha fazla faz başarısız).",
      ok
    );
  })();
  await audit(req, { action: "station.sync_now" });
  res.json({
    success: true,
    message: "Senkronizasyon başlatıldı (Tototheo → Leo Bridge → Satcom).",
    recordsFound: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
  });
});

router.get("/station/sync-progress", requireAuth, requireRole("viewer"), async (_req, res): Promise<void> => {
  res.json(progress.getProgress());
});

// =============================================================================
// Wipe data (single account or all)
// =============================================================================

router.post("/station/wipe-data", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  if (
    isOrchestratorRunning() ||
    isStarlinkSyncRunning() ||
    isLeobridgeSyncRunning()
  ) {
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

  // ── Starlink + Norway: yalnız "Tümünü Sil" akışında temizlenir.
  // Per-account wipe Satcom-özel; Starlink/Norway için hesap silindiğinde
  // zaten cascade çalışıyor.
  let starlinkDeleted = { terminals: 0, daily: 0, periodTotal: 0, syncLogs: 0 };
  let leobridgeDeleted = { terminals: 0, daily: 0, periodTotal: 0, syncLogs: 0 };
  if (credentialId === null) {
    const slDaily = await db
      .delete(starlinkTerminalDaily)
      .returning({ id: starlinkTerminalDaily.kitSerialNumber });
    const slTotal = await db
      .delete(starlinkTerminalPeriodTotal)
      .returning({ id: starlinkTerminalPeriodTotal.kitSerialNumber });
    const slTerm = await db
      .delete(starlinkTerminals)
      .returning({ id: starlinkTerminals.kitSerialNumber });
    const slLogs = await db
      .delete(starlinkSyncLogs)
      .returning({ id: starlinkSyncLogs.id });
    await db
      .update(starlinkCredentials)
      .set({
        lastSuccessSyncAt: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      });
    starlinkDeleted = {
      terminals: slTerm.length,
      daily: slDaily.length,
      periodTotal: slTotal.length,
      syncLogs: slLogs.length,
    };

    const lbDaily = await db
      .delete(leobridgeTerminalDaily)
      .returning({ id: leobridgeTerminalDaily.kitSerialNumber });
    const lbTotal = await db
      .delete(leobridgeTerminalPeriodTotal)
      .returning({ id: leobridgeTerminalPeriodTotal.kitSerialNumber });
    const lbTerm = await db
      .delete(leobridgeTerminals)
      .returning({ id: leobridgeTerminals.kitSerialNumber });
    const lbLogs = await db
      .delete(leobridgeSyncLogs)
      .returning({ id: leobridgeSyncLogs.id });
    await db
      .update(leobridgeCredentials)
      .set({
        lastSuccessSyncAt: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      });
    leobridgeDeleted = {
      terminals: lbTerm.length,
      daily: lbDaily.length,
      periodTotal: lbTotal.length,
      syncLogs: lbLogs.length,
    };
  }

  const deleted = {
    kitDaily: dailyDel.length,
    kitPeriodTotal: totalDel.length,
    kits: kitsDel.length,
    syncLogs: logsDel.length,
    starlink: starlinkDeleted,
    leobridge: leobridgeDeleted,
  };
  req.log.warn({ deleted, credentialId }, "Station data wiped by admin");
  await audit(req, {
    action: "station.wipe_data",
    target: credentialId !== null ? `account:${credentialId}` : "all",
    meta: deleted,
  });

  res.json({
    success: true,
    message:
      credentialId !== null
        ? `Hesap #${credentialId}: ${deleted.kits} KIT, ${deleted.kitPeriodTotal} dönem toplamı, ${deleted.kitDaily} CDR, ${deleted.syncLogs} sync kaydı silindi.`
        : `Tüm veriler temizlendi — Satcom: ${deleted.kits} KIT / ${deleted.kitPeriodTotal} dönem / ${deleted.kitDaily} CDR · Starlink: ${starlinkDeleted.terminals} terminal / ${starlinkDeleted.periodTotal} dönem · Norway: ${leobridgeDeleted.terminals} terminal / ${leobridgeDeleted.periodTotal} dönem.`,
    deleted,
  });
});

// =============================================================================
// E-posta uyarı ayarları
// =============================================================================

router.get("/station/email-settings", requireAuth, requireRole("viewer"), async (_req, res): Promise<void> => {
  const settings = await getEmailSettings();
  res.json(settings);
});

router.put("/station/email-settings", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const parsed = UpdateEmailSettingsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Geçersiz e-posta ayarları.",
      details: parsed.error.issues,
    });
    return;
  }
  const updated = await saveEmailSettings(parsed.data);
  await audit(req, {
    action: "station.email_settings.update",
    meta: { enabled: updated.enabled, thresholdStepGib: updated.thresholdStepGib },
  });
  res.json(updated);
});

router.post("/station/email-settings/test", requireAuth, requireRole("admin"), async (req: AuthRequest, res): Promise<void> => {
  const body = (req.body ?? {}) as { to?: string };
  const result = await sendTestEmail(body.to);
  await audit(req, {
    action: "station.email_settings.test",
    success: Boolean((result as { ok?: boolean }).ok ?? true),
    meta: { to: body.to ?? null },
  });
  res.json(result);
});

// Suppress unused-import warning (sql/desc kept for future extensions).
void sql;
void desc;

export default router;
