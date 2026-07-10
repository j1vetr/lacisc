import { Router, type IRouter } from "express";
import {
  db,
  leobridgeCredentials,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
  whatsappAlertState,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { encrypt, decrypt } from "../lib/crypto";
import { isCustomer, getAssignedKits } from "../lib/customer-scope";
import {
  runLeobridgeSync,
  runLeobridgeSyncForCredential,
  testLeobridgeConnection,
  isLeobridgeSyncRunning,
  getLeobridgeSettingsView,
  saveLeobridgeSettings,
  getActiveLeobridgeDecryptedPassword,
} from "../lib/leobridge-sync";
import {
  startCombinedRun,
  finishCombinedRun,
  isRunning as isAnySyncRunning,
} from "../lib/sync-progress";
import {
  applyDeduction,
  getDeductionForKit,
  getDeductionMapForPeriod,
  getDeductionsByPeriodForKit,
} from "../lib/ship-quota";

const DEFAULT_LEOBRIDGE_PORTAL_URL = "https://leobridge.spacenorway.com";

function leobridgeAccountSummary(
  c: typeof leobridgeCredentials.$inferSelect,
  kitCount: number,
) {
  return {
    id: c.id,
    label: c.label,
    portalUrl: c.portalUrl,
    username: c.username,
    isActive: c.isActive,
    syncIntervalMinutes: c.syncIntervalMinutes,
    lastSuccessSyncAt: c.lastSuccessSyncAt
      ? c.lastSuccessSyncAt.toISOString()
      : null,
    lastErrorMessage: c.lastErrorMessage,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    kitCount,
  };
}

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Settings (T001 shim — singleton API'sini koruyarak ilk active credential
// üzerinde okur/yazar). T004'te çoklu hesap UI ile değişecek.
// ---------------------------------------------------------------------------

router.get(
  "/leobridge/settings",
  requireAuth,
  requireRole("viewer"),
  async (_req: AuthRequest, res): Promise<void> => {
    res.json(await getLeobridgeSettingsView());
  },
);

router.put(
  "/leobridge/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { enabled, portalUrl, username, password } =
      (req.body ?? {}) as Record<string, unknown>;
    const updated = await saveLeobridgeSettings({
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      portalUrl: typeof portalUrl === "string" ? portalUrl : undefined,
      username:
        typeof username === "string" ? username : (username === null ? null : undefined),
      password:
        typeof password === "string"
          ? password
          : password === null
            ? null
            : undefined,
    });
    res.json(updated);
  },
);

router.post(
  "/leobridge/test-connection",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { portalUrl, username, password } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const view = await getLeobridgeSettingsView();
    const useUrl =
      typeof portalUrl === "string" && portalUrl.trim()
        ? portalUrl.trim().replace(/\/+$/, "")
        : view.portalUrl;
    const useUser =
      typeof username === "string" && username.trim()
        ? username.trim()
        : (view.username ?? "");
    let usePass = "";
    if (typeof password === "string" && password.length > 0) {
      usePass = password;
    } else {
      const stored = await getActiveLeobridgeDecryptedPassword();
      if (stored) usePass = stored;
    }
    if (!useUser || !usePass) {
      res.json({
        success: false,
        message: "Kullanıcı adı ve şifre gerekli.",
        terminalCount: 0,
      });
      return;
    }
    const result = await testLeobridgeConnection({
      portalUrl: useUrl,
      username: useUser,
      password: usePass,
    });
    res.json(result);
  },
);

router.post(
  "/leobridge/sync-now",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    if (isLeobridgeSyncRunning() || isAnySyncRunning()) {
      res.status(409).json({ error: "Bir senkronizasyon zaten çalışıyor." });
      return;
    }
    startCombinedRun();
    void (async () => {
      try {
        const result = await runLeobridgeSync();
        finishCombinedRun(
          result.success
            ? `Leo Bridge: ${result.message}`
            : `Leo Bridge başarısız: ${result.message}`,
          result.success,
        );
      } catch (err) {
        finishCombinedRun(
          `Leo Bridge senkronizasyonu başarısız: ${
            err instanceof Error ? err.message : String(err)
          }`,
          false,
        );
      }
    })();
    res.json({ success: true, message: "Leo Bridge senkronizasyonu başlatıldı." });
  },
);

// ---------------------------------------------------------------------------
// Multi-account CRUD (T003) — Satcom `/station/accounts` kalıbı
// ---------------------------------------------------------------------------

router.get(
  "/leobridge/accounts",
  requireAuth,
  requireRole("viewer"),
  async (_req, res): Promise<void> => {
    const accounts = await db
      .select()
      .from(leobridgeCredentials)
      .orderBy(asc(leobridgeCredentials.id));
    const counts = await db
      .select({
        credentialId: leobridgeTerminals.credentialId,
        n: count(),
      })
      .from(leobridgeTerminals)
      .groupBy(leobridgeTerminals.credentialId);
    const byCred = new Map(counts.map((r) => [r.credentialId, Number(r.n)]));
    res.json(
      accounts.map((c) => leobridgeAccountSummary(c, byCred.get(c.id) ?? 0)),
    );
  },
);

router.post(
  "/leobridge/accounts",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
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
    if (!username?.trim() || !password) {
      res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur." });
      return;
    }
    const [created] = await db
      .insert(leobridgeCredentials)
      .values({
        label: label ?? null,
        portalUrl:
          portalUrl?.trim().replace(/\/+$/, "") || DEFAULT_LEOBRIDGE_PORTAL_URL,
        username: username.trim(),
        encryptedPassword: encrypt(password),
        isActive: isActive ?? true,
        syncIntervalMinutes: syncIntervalMinutes ?? 30,
      })
      .returning();
    req.log.info({ id: created.id, label }, "Leobridge account created");
    await audit(req, {
      action: "leobridge.account.create",
      target: `account:${created.id}`,
      meta: { label, username: created.username, portalUrl: created.portalUrl },
    });
    res.json(leobridgeAccountSummary(created, 0));
  },
);

router.patch(
  "/leobridge/accounts/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
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
    const updates: Partial<typeof leobridgeCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (label !== undefined) updates.label = label;
    if (portalUrl !== undefined)
      updates.portalUrl =
        portalUrl.trim().replace(/\/+$/, "") || DEFAULT_LEOBRIDGE_PORTAL_URL;
    if (username !== undefined && username.trim())
      updates.username = username.trim();
    if (typeof password === "string" && password.length > 0)
      updates.encryptedPassword = encrypt(password);
    if (isActive !== undefined) updates.isActive = isActive;
    if (syncIntervalMinutes !== undefined)
      updates.syncIntervalMinutes = syncIntervalMinutes;

    const [updated] = await db
      .update(leobridgeCredentials)
      .set(updates)
      .where(eq(leobridgeCredentials.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Hesap bulunamadı." });
      return;
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(leobridgeTerminals)
      .where(eq(leobridgeTerminals.credentialId, id));
    await audit(req, {
      action: "leobridge.account.update",
      target: `account:${id}`,
      meta: {
        changedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
        passwordChanged:
          typeof password === "string" && password.length > 0,
      },
    });
    res.json(leobridgeAccountSummary(updated, Number(n ?? 0)));
  },
);

router.delete(
  "/leobridge/accounts/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz hesap ID." });
      return;
    }
    const deleted = await db
      .delete(leobridgeCredentials)
      .where(eq(leobridgeCredentials.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Hesap bulunamadı." });
      return;
    }
    req.log.warn({ id }, "Leobridge account deleted (cascade wiped data)");
    await audit(req, {
      action: "leobridge.account.delete",
      target: `account:${id}`,
    });
    res.json({ message: "Hesap ve tüm verisi silindi." });
  },
);

// Tek bir Leo Bridge (Norway) terminalini tüm verisiyle sil. KIT başka kaynağa
// taşındığında bayat satırı elle temizlemek için. Child tablolar credential'a
// FK ile bağlı (terminal'e değil) — manuel sileriz.
router.delete(
  "/leobridge/terminals/:kit",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit ?? "").trim();
    if (!kit) {
      res.status(400).json({ error: "Geçersiz KIT." });
      return;
    }
    const { daily, periodTotal, alertState, term } = await db.transaction(
      async (tx) => {
        const daily = await tx
          .delete(leobridgeTerminalDaily)
          .where(eq(leobridgeTerminalDaily.kitSerialNumber, kit))
          .returning({ id: leobridgeTerminalDaily.kitSerialNumber });
        const periodTotal = await tx
          .delete(leobridgeTerminalPeriodTotal)
          .where(eq(leobridgeTerminalPeriodTotal.kitSerialNumber, kit))
          .returning({ id: leobridgeTerminalPeriodTotal.kitSerialNumber });
        const alertState = await tx
          .delete(whatsappAlertState)
          .where(
            and(
              eq(whatsappAlertState.source, "leobridge"),
              eq(whatsappAlertState.kitNo, kit),
            ),
          )
          .returning({ id: whatsappAlertState.kitNo });
        const term = await tx
          .delete(leobridgeTerminals)
          .where(eq(leobridgeTerminals.kitSerialNumber, kit))
          .returning({ id: leobridgeTerminals.kitSerialNumber });
        return { daily, periodTotal, alertState, term };
      },
    );
    if (term.length === 0) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    req.log.warn(
      {
        kit,
        terminals: term.length,
        daily: daily.length,
        periodTotal: periodTotal.length,
        alertState: alertState.length,
      },
      "Leobridge terminal deleted manually",
    );
    await audit(req, {
      action: "leobridge.terminal.delete",
      target: `terminal:${kit}`,
    });
    res.json({ message: "Terminal ve tüm verisi silindi." });
  },
);

router.post(
  "/leobridge/accounts/:id/test-connection",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    const [c] = await db
      .select()
      .from(leobridgeCredentials)
      .where(eq(leobridgeCredentials.id, id))
      .limit(1);
    if (!c) {
      res
        .status(404)
        .json({ success: false, message: "Hesap bulunamadı.", terminalCount: 0 });
      return;
    }
    let password: string;
    try {
      password = decrypt(c.encryptedPassword);
    } catch {
      res.json({
        success: false,
        message: "Kayıtlı şifre çözülemedi.",
        terminalCount: 0,
      });
      return;
    }
    const result = await testLeobridgeConnection({
      portalUrl: c.portalUrl,
      username: c.username,
      password,
    });
    await audit(req, {
      action: "leobridge.account.test_connection",
      target: `account:${id}`,
      success: result.success,
      meta: {
        label: c.label,
        username: c.username,
        message: result.message,
        terminalCount: result.terminalCount,
      },
    });
    res.json(result);
  },
);

router.post(
  "/leobridge/accounts/:id/sync",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz hesap ID." });
      return;
    }
    if (isLeobridgeSyncRunning() || isAnySyncRunning()) {
      res
        .status(409)
        .json({ error: "Bir senkronizasyon zaten çalışıyor." });
      return;
    }
    startCombinedRun();
    void (async () => {
      try {
        const r = await runLeobridgeSyncForCredential(id);
        finishCombinedRun(
          r.success
            ? `Leo Bridge: ${r.message}`
            : `Leo Bridge başarısız: ${r.message}`,
          r.success,
        );
      } catch (err) {
        finishCombinedRun(
          `Leo Bridge hesap sync hata: ${
            err instanceof Error ? err.message : String(err)
          }`,
          false,
        );
      }
    })();
    await audit(req, {
      action: "leobridge.account.sync_now",
      target: `account:${id}`,
    });
    res.json({
      message: "Leo Bridge hesap senkronizasyonu başlatıldı.",
    });
  },
);

async function customerLeobridgeScope(
  req: AuthRequest,
): Promise<string[] | null> {
  if (!isCustomer(req.userRole)) return null;
  const scope = await getAssignedKits(req.userId!);
  return scope.leobridge;
}

router.get(
  "/leobridge/terminals",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const scope = await customerLeobridgeScope(req);
    const rows = await db
      .select()
      .from(leobridgeTerminals)
      .orderBy(leobridgeTerminals.kitSerialNumber);
    // De-dup: aynı KIT birden fazla credential'da olabilir; en son güncellenen
    // satırı tutuyoruz (T002'de source detection MAX(updatedAt)).
    const byKit = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = byKit.get(r.kitSerialNumber);
      if (!cur || r.updatedAt > cur.updatedAt) {
        byKit.set(r.kitSerialNumber, r);
      }
    }
    const filtered = Array.from(byKit.values()).filter((r) =>
      scope ? scope.includes(r.kitSerialNumber) : true,
    );
    const kits = filtered.map((r) => r.kitSerialNumber);
    const totals = new Map<string, { period: string; totalGb: number | null }>();
    if (kits.length > 0) {
      const all = await db
        .select()
        .from(leobridgeTerminalPeriodTotal)
        .where(inArray(leobridgeTerminalPeriodTotal.kitSerialNumber, kits));
      for (const t of all) {
        const cur = totals.get(t.kitSerialNumber);
        if (!cur || t.period > cur.period) {
          totals.set(t.kitSerialNumber, {
            period: t.period,
            totalGb: t.totalGb,
          });
        }
      }
    }
    // Task #37: gemi internet satışı kota düşümü — her KIT kendi (en son)
    // döneminden düşülür; farklı KIT'ler farklı dönemlerde olabileceğinden
    // dönem başına tek seferlik map fetch edilip tüm satırlarda paylaşılır.
    const periodsNeeded = Array.from(
      new Set(
        Array.from(totals.values())
          .map((v) => v.period)
          .filter((p): p is string => !!p),
      ),
    );
    const dedMapsByPeriod = new Map<string, Map<string, number>>();
    for (const p of periodsNeeded) {
      dedMapsByPeriod.set(p, await getDeductionMapForPeriod(p, "leobridge"));
    }
    res.json(
      filtered.map((r) => {
        const total = totals.get(r.kitSerialNumber);
        const dedGb = total?.period
          ? (dedMapsByPeriod.get(total.period)?.get(r.kitSerialNumber) ?? 0)
          : 0;
        const rawGb = total?.totalGb ?? null;
        return {
          kitSerialNumber: r.kitSerialNumber,
          serviceLineNumber: r.serviceLineNumber,
          nickname: r.nickname,
          addressLabel: r.addressLabel,
          lat: r.lat,
          lng: r.lng,
          isOnline: r.isOnline,
          lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
          updatedAt: r.updatedAt.toISOString(),
          currentPeriod: total?.period ?? null,
          currentPeriodTotalGb:
            dedGb > 0 && rawGb != null ? applyDeduction(rawGb, dedGb) : rawGb,
          planAllowanceGb: r.planAllowanceGb ?? null,
          manualPlanGb: r.manualPlanGb ?? null,
        };
      }),
    );
  },
);

async function ensureLeobridgeKitVisible(
  req: AuthRequest,
  kit: string,
): Promise<boolean> {
  const scope = await customerLeobridgeScope(req);
  if (scope === null) return true;
  return scope.includes(kit);
}

router.get(
  "/leobridge/terminals/:kit",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    if (!(await ensureLeobridgeKitVisible(req, kit))) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    // En son güncellenen satırı al (multi-account preferred row).
    const rows = await db
      .select()
      .from(leobridgeTerminals)
      .where(eq(leobridgeTerminals.kitSerialNumber, kit))
      .orderBy(desc(leobridgeTerminals.updatedAt))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    // T005 — multi-account: dönem toplamı aynı credential'dan gelsin
    // (rozet "Hesap A" derken total "Hesap B"den gelmesin).
    const [latest] = await db
      .select()
      .from(leobridgeTerminalPeriodTotal)
      .where(
        sql`${leobridgeTerminalPeriodTotal.kitSerialNumber} = ${kit}
            AND ${leobridgeTerminalPeriodTotal.credentialId} = ${row.credentialId}`,
      )
      .orderBy(desc(leobridgeTerminalPeriodTotal.period))
      .limit(1);
    // T005 — KIT detayında "Hesap: <label>" rozeti için credential meta.
    const [acc] = await db
      .select({
        id: leobridgeCredentials.id,
        label: leobridgeCredentials.label,
      })
      .from(leobridgeCredentials)
      .where(eq(leobridgeCredentials.id, row.credentialId))
      .limit(1);
    // Task #37: gemi internet satışı kota düşümü — GB-native değerden direkt çıkarılır.
    const deductionGb =
      latest?.totalGb != null && latest.period
        ? await getDeductionForKit(latest.period, "leobridge", kit)
        : 0;
    const effectiveCurrentPeriodTotalGb =
      latest?.totalGb != null && deductionGb > 0
        ? applyDeduction(latest.totalGb, deductionGb)
        : (latest?.totalGb ?? null);
    res.json({
      kitSerialNumber: row.kitSerialNumber,
      serviceLineNumber: row.serviceLineNumber,
      nickname: row.nickname,
      addressLabel: row.addressLabel,
      lat: row.lat,
      lng: row.lng,
      isOnline: row.isOnline,
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
      currentPeriod: latest?.period ?? null,
      currentPeriodTotalGb: effectiveCurrentPeriodTotalGb,
      deductionGb: deductionGb > 0 ? deductionGb : null,
      currentPeriodPriorityGb: latest?.priorityGb ?? null,
      currentPeriodStandardGb: latest?.standardGb ?? null,
      planAllowanceGb: row.manualPlanGb ?? row.planAllowanceGb ?? null,
      manualPlanGb: row.manualPlanGb ?? null,
      accountId: acc?.id ?? null,
      accountLabel: acc?.label ?? null,
    });
  },
);

// PATCH /leobridge/terminals/:kit/manual-plan — manuel kota override'ı kaydet / temizle.
// Body: { manualPlanGb: number | null }. Admin zorunlu.
router.patch(
  "/leobridge/terminals/:kit/manual-plan",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit ?? "").trim();
    if (!kit) {
      res.status(400).json({ error: "Geçersiz KIT." });
      return;
    }
    const raw = req.body?.manualPlanGb;
    let value: number | null;
    if (raw === null || raw === undefined || raw === "") {
      value = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: "manualPlanGb geçerli bir sayı olmalı (≥0) veya null." });
        return;
      }
      value = n;
    }
    const updated = await db
      .update(leobridgeTerminals)
      .set({ manualPlanGb: value })
      .where(eq(leobridgeTerminals.kitSerialNumber, kit))
      .returning({ kit: leobridgeTerminals.kitSerialNumber });
    if (updated.length === 0) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    res.json({ kitSerialNumber: kit, manualPlanGb: value });
  },
);

// T005 multi-account: aynı KIT birden fazla credential'da olabilir; daily/monthly
// endpoint'leri detail endpoint ile aynı credential'a (en son güncellenen satır)
// pin'lensin — aksi halde rozet "Hesap A" derken seri "Hesap B"den gelir.
async function resolveLatestCredentialId(kit: string): Promise<number | null> {
  const [row] = await db
    .select({ credentialId: leobridgeTerminals.credentialId })
    .from(leobridgeTerminals)
    .where(eq(leobridgeTerminals.kitSerialNumber, kit))
    .orderBy(desc(leobridgeTerminals.updatedAt))
    .limit(1);
  return row?.credentialId ?? null;
}

router.get(
  "/leobridge/terminals/:kit/daily",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    if (!(await ensureLeobridgeKitVisible(req, kit))) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    const period =
      typeof req.query.period === "string" && /^\d{6}$/.test(req.query.period)
        ? req.query.period
        : null;
    const credentialId = await resolveLatestCredentialId(kit);
    if (credentialId === null) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(leobridgeTerminalDaily)
      .where(
        sql`${leobridgeTerminalDaily.kitSerialNumber} = ${kit}
            AND ${leobridgeTerminalDaily.credentialId} = ${credentialId}`,
      )
      .orderBy(leobridgeTerminalDaily.dayDate);
    const filtered = period
      ? rows.filter((r) => r.dayDate.replace(/-/g, "").slice(0, 6) === period)
      : rows;
    res.json(
      filtered.map((r) => ({
        dayDate: r.dayDate,
        priorityGb: r.priorityGb,
        standardGb: r.standardGb,
        totalGb: r.totalGb,
        lastReadingAt: r.lastReadingAt
          ? r.lastReadingAt.toISOString()
          : null,
      })),
    );
  },
);

router.get(
  "/leobridge/terminals/:kit/monthly",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    if (!(await ensureLeobridgeKitVisible(req, kit))) {
      res.status(404).json({ error: "Terminal bulunamadı." });
      return;
    }
    const credentialId = await resolveLatestCredentialId(kit);
    if (credentialId === null) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(leobridgeTerminalPeriodTotal)
      .where(
        sql`${leobridgeTerminalPeriodTotal.kitSerialNumber} = ${kit}
            AND ${leobridgeTerminalPeriodTotal.credentialId} = ${credentialId}`,
      )
      .orderBy(desc(leobridgeTerminalPeriodTotal.period));
    // Task #37: her dönem satırına o dönemin gemi kota düşümü uygulanır —
    // header'daki efektif değerle aylık tablo tutarlı olsun diye.
    const dedByPeriod = await getDeductionsByPeriodForKit(
      rows.map((r) => r.period),
      "leobridge",
      kit,
    );
    res.json(
      rows.map((r) => {
        const dedGb = dedByPeriod.get(r.period) ?? 0;
        return {
          period: r.period,
          totalGb:
            r.totalGb != null && dedGb > 0
              ? applyDeduction(r.totalGb, dedGb)
              : r.totalGb,
          priorityGb: r.priorityGb,
          standardGb: r.standardGb,
          scrapedAt: r.scrapedAt ? r.scrapedAt.toISOString() : null,
        };
      }),
    );
  },
);

export default router;
