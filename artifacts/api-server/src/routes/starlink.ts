import { Router, type IRouter } from "express";
import {
  db,
  starlinkCredentials,
  starlinkTerminals,
  starlinkTerminalDaily,
  starlinkTerminalPeriodTotal,
} from "@workspace/db";
import { eq, asc, desc, sql, count } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { encrypt, decrypt } from "../lib/crypto";
import {
  getStarlinkSettingsView,
  saveStarlinkSettings,
  testStarlinkConnection,
  runStarlinkSync,
  runStarlinkSyncForCredential,
  isStarlinkSyncRunning,
} from "../lib/starlink-sync";
import * as progress from "../lib/sync-progress";
import { getAssignedKits, isCustomer } from "../lib/customer-scope";

const DEFAULT_STARLINK_BASE_URL = "https://starlink.tototheo.com";

function starlinkAccountSummary(
  c: typeof starlinkCredentials.$inferSelect,
  kitCount: number,
) {
  return {
    id: c.id,
    label: c.label,
    apiBaseUrl: c.apiBaseUrl,
    hasToken: !!c.encryptedToken,
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

async function customerStarlinkScope(req: AuthRequest): Promise<string[] | null> {
  if (!isCustomer(req.userRole)) return null;
  const scope = await getAssignedKits(req.userId!);
  return scope.starlink;
}

// ---------------------------------------------------------------------------
// Settings (singleton id=1) — token AES-GCM encrypted, never returned in GET.
// Customer rolü için 403 — settings ekranı UI'da zaten gizli.
// ---------------------------------------------------------------------------

router.get("/starlink/settings", requireAuth, requireRole("viewer"), async (_req, res): Promise<void> => {
  res.json(await getStarlinkSettingsView());
});

router.put(
  "/starlink/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as {
      enabled?: boolean;
      apiBaseUrl?: string;
      // undefined = keep, null/'' = clear, string = set new
      token?: string | null;
    };
    const updated = await saveStarlinkSettings({
      enabled: body.enabled,
      apiBaseUrl: body.apiBaseUrl,
      token: body.token,
    });
    await audit(req, {
      action: "starlink.settings.update",
      meta: {
        enabled: updated.enabled,
        apiBaseUrl: updated.apiBaseUrl,
        tokenChanged: body.token !== undefined,
      },
    });
    res.json(updated);
  }
);

router.post(
  "/starlink/test-connection",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as { apiBaseUrl?: string; token?: string | null };
    const view = await getStarlinkSettingsView();
    const baseUrl = body.apiBaseUrl?.trim() || view.apiBaseUrl;
    const result = await testStarlinkConnection(baseUrl, body.token ?? null);
    await audit(req, {
      action: "starlink.test_connection",
      success: result.success,
      meta: { message: result.message, terminalCount: result.terminalCount ?? null },
    });
    res.json(result);
  }
);

router.post(
  "/starlink/sync-now",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    if (isStarlinkSyncRunning()) {
      res.status(409).json({ error: "Starlink sync zaten devam ediyor." });
      return;
    }
    // Manual Starlink-only sync: wrap with combined run lifecycle so the live
    // progress UI flips back to idle when we're done. (The scheduler tick
    // handles this itself when running both phases — but a manual click only
    // hits this route, so we own the start/finish here.)
    progress.startCombinedRun();
    void runStarlinkSync()
      .then((r) => {
        logger.info({ ...r }, "Manual Starlink sync finished");
        progress.finishCombinedRun(r.message, r.success);
      })
      .catch((err) => {
        logger.error({ err }, "Manual Starlink sync crashed");
        progress.finishCombinedRun(
          `Starlink sync hata: ${(err as Error).message}`,
          false
        );
      });
    await audit(req, { action: "starlink.sync_now" });
    res.json({ success: true, message: "Starlink senkronizasyonu başlatıldı." });
  }
);

// ---------------------------------------------------------------------------
// Multi-account CRUD (T003) — Satcom `/station/accounts` kalıbı
// ---------------------------------------------------------------------------

router.get(
  "/starlink/accounts",
  requireAuth,
  requireRole("viewer"),
  async (_req, res): Promise<void> => {
    const accounts = await db
      .select()
      .from(starlinkCredentials)
      .orderBy(asc(starlinkCredentials.id));
    const counts = await db
      .select({
        credentialId: starlinkTerminals.credentialId,
        n: count(),
      })
      .from(starlinkTerminals)
      .groupBy(starlinkTerminals.credentialId);
    const byCred = new Map(counts.map((r) => [r.credentialId, Number(r.n)]));
    res.json(
      accounts.map((c) => starlinkAccountSummary(c, byCred.get(c.id) ?? 0)),
    );
  },
);

router.post(
  "/starlink/accounts",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { label, apiBaseUrl, token, isActive, syncIntervalMinutes } =
      req.body as {
        label?: string | null;
        apiBaseUrl?: string;
        token?: string;
        isActive?: boolean;
        syncIntervalMinutes?: number;
      };
    if (!token || !token.trim()) {
      res.status(400).json({ error: "Token zorunludur." });
      return;
    }
    const [created] = await db
      .insert(starlinkCredentials)
      .values({
        label: label ?? null,
        apiBaseUrl: apiBaseUrl?.trim() || DEFAULT_STARLINK_BASE_URL,
        encryptedToken: encrypt(token),
        isActive: isActive ?? true,
        syncIntervalMinutes: syncIntervalMinutes ?? 30,
      })
      .returning();
    req.log.info({ id: created.id, label }, "Starlink account created");
    await audit(req, {
      action: "starlink.account.create",
      target: `account:${created.id}`,
      meta: { label, apiBaseUrl: created.apiBaseUrl },
    });
    res.json(starlinkAccountSummary(created, 0));
  },
);

router.patch(
  "/starlink/accounts/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz hesap ID." });
      return;
    }
    const { label, apiBaseUrl, token, isActive, syncIntervalMinutes } =
      req.body as Partial<{
        label: string | null;
        apiBaseUrl: string;
        token: string | null;
        isActive: boolean;
        syncIntervalMinutes: number;
      }>;
    const updates: Partial<typeof starlinkCredentials.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (label !== undefined) updates.label = label;
    if (apiBaseUrl !== undefined)
      updates.apiBaseUrl = apiBaseUrl.trim() || DEFAULT_STARLINK_BASE_URL;
    // encrypted_token NOT NULL — clear istenirse atla, sadece dolu token set et.
    if (typeof token === "string" && token.trim())
      updates.encryptedToken = encrypt(token);
    if (isActive !== undefined) updates.isActive = isActive;
    if (syncIntervalMinutes !== undefined)
      updates.syncIntervalMinutes = syncIntervalMinutes;

    const [updated] = await db
      .update(starlinkCredentials)
      .set(updates)
      .where(eq(starlinkCredentials.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Hesap bulunamadı." });
      return;
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(starlinkTerminals)
      .where(eq(starlinkTerminals.credentialId, id));
    await audit(req, {
      action: "starlink.account.update",
      target: `account:${id}`,
      meta: {
        changedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
        tokenChanged: typeof token === "string" && Boolean(token.trim()),
      },
    });
    res.json(starlinkAccountSummary(updated, Number(n ?? 0)));
  },
);

router.delete(
  "/starlink/accounts/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz hesap ID." });
      return;
    }
    const deleted = await db
      .delete(starlinkCredentials)
      .where(eq(starlinkCredentials.id, id))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Hesap bulunamadı." });
      return;
    }
    req.log.warn({ id }, "Starlink account deleted (cascade wiped data)");
    await audit(req, {
      action: "starlink.account.delete",
      target: `account:${id}`,
    });
    res.json({ message: "Hesap ve tüm verisi silindi." });
  },
);

router.post(
  "/starlink/accounts/:id/test-connection",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    const [c] = await db
      .select()
      .from(starlinkCredentials)
      .where(eq(starlinkCredentials.id, id))
      .limit(1);
    if (!c) {
      res.status(404).json({ success: false, message: "Hesap bulunamadı." });
      return;
    }
    let token: string;
    try {
      token = decrypt(c.encryptedToken);
    } catch {
      res.json({ success: false, message: "Kayıtlı token çözülemedi." });
      return;
    }
    const result = await testStarlinkConnection(c.apiBaseUrl, token);
    await audit(req, {
      action: "starlink.account.test_connection",
      target: `account:${id}`,
      success: result.success,
      meta: {
        label: c.label,
        message: result.message,
        terminalCount: result.terminalCount ?? null,
      },
    });
    res.json(result);
  },
);

router.post(
  "/starlink/accounts/:id/sync",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz hesap ID." });
      return;
    }
    if (isStarlinkSyncRunning()) {
      res.status(409).json({ error: "Starlink sync zaten devam ediyor." });
      return;
    }
    progress.startCombinedRun();
    void runStarlinkSyncForCredential(id)
      .then((r) => {
        logger.info({ id, ...r }, "Manual Starlink credential sync finished");
        progress.finishCombinedRun(r.message, r.success);
      })
      .catch((err) => {
        logger.error({ err, id }, "Manual Starlink credential sync crashed");
        progress.finishCombinedRun(
          `Starlink hesap sync hata: ${(err as Error).message}`,
          false,
        );
      });
    await audit(req, {
      action: "starlink.account.sync_now",
      target: `account:${id}`,
    });
    res.json({
      message: "Starlink hesap senkronizasyonu başlatıldı.",
    });
  },
);

// ---------------------------------------------------------------------------
// Read endpoints (used by Terminaller list + KIT detay)
// ---------------------------------------------------------------------------

// All terminals — last known snapshot + current month's cumulative cycle GB
// (read from starlink_terminal_period_total for the current YYYYMM).
router.get("/starlink/terminals", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const period = activePeriod();
  const scope = await customerStarlinkScope(req);
  if (scope !== null && scope.length === 0) {
    res.json([]);
    return;
  }
  // Drizzle sql template JS array'ini text[] olarak bindleyemiyor; her KIT'i
  // ayrı param yapan IN listesi kullanıyoruz. Empty scope yukarıda erken
  // dönüş ile zaten yakalandı.
  const where = scope
    ? sql`WHERE t.kit_serial_number IN (${sql.join(
        scope.map((v) => sql`${v}`),
        sql`, `,
      )})`
    : sql``;
  // T002 — aynı KIT birden fazla credential'da olabilir; en son güncellenen
  // satırı al (DISTINCT ON kit_serial_number ORDER BY updated_at DESC).
  // Period total join'i de aynı credential'a sabitlenir, böylece "current
  // period" başka hesabın değerleri olmaz.
  const rows = await db.execute(sql`
    SELECT
      t.kit_serial_number    AS "kitSerialNumber",
      t.nickname             AS "nickname",
      t.asset_name           AS "assetName",
      t.is_online            AS "isOnline",
      t.activated            AS "activated",
      t.blocked              AS "blocked",
      t.signal_quality       AS "signalQuality",
      t.latency              AS "latency",
      t.obstruction          AS "obstruction",
      t.download_speed       AS "downloadSpeed",
      t.upload_speed         AS "uploadSpeed",
      t.lat                  AS "lat",
      t.lng                  AS "lng",
      t.last_fix_at          AS "lastFixAt",
      t.active_alerts_count  AS "activeAlertsCount",
      t.last_seen_at         AS "lastSeenAt",
      t.updated_at           AS "updatedAt",
      p.total_gb             AS "currentPeriodTotalGb",
      p.package_usage_gb     AS "currentPeriodPackageGb",
      p.priority_gb          AS "currentPeriodPriorityGb",
      p.overage_gb           AS "currentPeriodOverageGb"
    FROM (
      SELECT DISTINCT ON (kit_serial_number) *
      FROM starlink_terminals
      ORDER BY kit_serial_number, updated_at DESC
    ) t
    LEFT JOIN starlink_terminal_period_total p
      ON p.kit_serial_number = t.kit_serial_number
     AND p.credential_id = t.credential_id
     AND p.period = ${period}
    ${where}
    ORDER BY COALESCE(p.total_gb, 0) DESC
  `);
  res.json(
    (rows as unknown as { rows: Array<Record<string, unknown>> }).rows.map(
      (r) => ({
        ...r,
        lastFixAt: toIso(r.lastFixAt),
        lastSeenAt: toIso(r.lastSeenAt),
        updatedAt: toIso(r.updatedAt),
      })
    )
  );
});

router.get(
  "/starlink/terminals/:kit",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    const scope = await customerStarlinkScope(req);
    if (scope !== null && !scope.includes(kit)) {
      res.status(404).json({ error: "Starlink terminali bulunamadı." });
      return;
    }
    // T002 — multi-credential: en son güncellenen terminal satırını al,
    // dönem totalini AYNI credential'dan çek (cross-account karışmasın).
    const [t] = await db
      .select()
      .from(starlinkTerminals)
      .where(eq(starlinkTerminals.kitSerialNumber, kit))
      .orderBy(desc(starlinkTerminals.updatedAt))
      .limit(1);
    if (!t) {
      res.status(404).json({ error: "Starlink terminali bulunamadı." });
      return;
    }
    const period = activePeriod();
    const [currentPt] = await db
      .select()
      .from(starlinkTerminalPeriodTotal)
      .where(
        sql`${starlinkTerminalPeriodTotal.kitSerialNumber} = ${kit}
            AND ${starlinkTerminalPeriodTotal.credentialId} = ${t.credentialId}`,
      )
      .orderBy(desc(starlinkTerminalPeriodTotal.period))
      .limit(1);
    res.json({
      kitSerialNumber: t.kitSerialNumber,
      nickname: t.nickname,
      assetName: t.assetName,
      isOnline: t.isOnline,
      activated: t.activated,
      blocked: t.blocked,
      signalQuality: t.signalQuality,
      latency: t.latency,
      obstruction: t.obstruction,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      lat: t.lat,
      lng: t.lng,
      lastFixAt: t.lastFixAt ? t.lastFixAt.toISOString() : null,
      activeAlertsCount: t.activeAlertsCount,
      lastSeenAt: t.lastSeenAt ? t.lastSeenAt.toISOString() : null,
      plan: t.plan,
      planAllowanceGb: t.planAllowanceGb,
      ipv4: t.ipv4,
      optIn: t.optIn,
      pingDropRate: t.pingDropRate,
      updatedAt: t.updatedAt.toISOString(),
      currentPeriod: currentPt?.period ?? period,
      currentPeriodTotalGb: currentPt?.totalGb ?? null,
      currentPeriodPackageGb: currentPt?.packageUsageGb ?? null,
      currentPeriodPriorityGb: currentPt?.priorityGb ?? null,
      currentPeriodOverageGb: currentPt?.overageGb ?? null,
    });
  }
);

// Daily breakdown — returns per-day deltas (today.cumulative - yesterday.cumulative)
// for the requested period. Cycle resets on the 1st of each month, so the
// first day's delta = its cumulative reading.
router.get(
  "/starlink/terminals/:kit/daily",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    const scope = await customerStarlinkScope(req);
    if (scope !== null && !scope.includes(kit)) {
      res.status(404).json({ error: "Starlink terminali bulunamadı." });
      return;
    }
    let { period } = req.query as { period?: string };
    if (!period) period = activePeriod();
    if (!/^\d{6}$/.test(period)) {
      res.status(400).json({ error: "Geçersiz period." });
      return;
    }
    const year = period.slice(0, 4);
    const month = period.slice(4, 6);
    const startStr = `${year}-${month}-01`;
    // Compute next-month boundary to filter rows.
    const startDate = new Date(`${startStr}T00:00:00Z`);
    const next = new Date(startDate);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const endStr = next.toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(starlinkTerminalDaily)
      .where(
        sql`${starlinkTerminalDaily.kitSerialNumber} = ${kit}
            AND ${starlinkTerminalDaily.dayDate} >= ${startStr}
            AND ${starlinkTerminalDaily.dayDate} < ${endStr}`
      )
      .orderBy(asc(starlinkTerminalDaily.dayDate));

    // Build delta series. previous = 0 at month start (cycle reset).
    let prevPkg = 0;
    let prevPri = 0;
    let prevOvg = 0;
    const out = rows.map((r) => {
      const pkg = r.packageUsageGb ?? prevPkg;
      const pri = r.priorityGb ?? prevPri;
      const ovg = r.overageGb ?? prevOvg;
      // Guard against negative deltas if upstream resets mid-month: floor at 0.
      const dPkg = Math.max(0, pkg - prevPkg);
      const dPri = Math.max(0, pri - prevPri);
      const dOvg = Math.max(0, ovg - prevOvg);
      prevPkg = pkg;
      prevPri = pri;
      prevOvg = ovg;
      return {
        dayDate: r.dayDate,
        cumulativePackageGb: pkg,
        deltaPackageGb: dPkg,
        deltaPriorityGb: dPri,
        deltaOverageGb: dOvg,
        lastReadingAt: r.lastReadingAt ? r.lastReadingAt.toISOString() : null,
      };
    });
    res.json(out);
  }
);

router.get(
  "/starlink/terminals/:kit/monthly",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kit = String(req.params.kit);
    const scope = await customerStarlinkScope(req);
    if (scope !== null && !scope.includes(kit)) {
      res.status(404).json({ error: "Starlink terminali bulunamadı." });
      return;
    }
    const months = await db
      .select({
        period: starlinkTerminalPeriodTotal.period,
        totalGb: starlinkTerminalPeriodTotal.totalGb,
        packageUsageGb: starlinkTerminalPeriodTotal.packageUsageGb,
        priorityGb: starlinkTerminalPeriodTotal.priorityGb,
        overageGb: starlinkTerminalPeriodTotal.overageGb,
        scrapedAt: starlinkTerminalPeriodTotal.scrapedAt,
      })
      .from(starlinkTerminalPeriodTotal)
      .where(eq(starlinkTerminalPeriodTotal.kitSerialNumber, kit))
      .orderBy(desc(starlinkTerminalPeriodTotal.period));
    res.json(
      months.map((m) => ({
        ...m,
        scrapedAt: m.scrapedAt ? m.scrapedAt.toISOString() : null,
      }))
    );
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activePeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    // raw SQL returns timestamp without TZ as space-separated strings.
    return new Date(
      /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : v.replace(" ", "T") + "Z"
    ).toISOString();
  }
  return null;
}

export default router;
