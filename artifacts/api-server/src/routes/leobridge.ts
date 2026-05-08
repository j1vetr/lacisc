import { Router, type IRouter } from "express";
import {
  db,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { isCustomer, getAssignedKits } from "../lib/customer-scope";
import {
  runLeobridgeSync,
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
    res.json(
      filtered.map((r) => ({
        kitSerialNumber: r.kitSerialNumber,
        serviceLineNumber: r.serviceLineNumber,
        nickname: r.nickname,
        addressLabel: r.addressLabel,
        lat: r.lat,
        lng: r.lng,
        isOnline: r.isOnline,
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
        updatedAt: r.updatedAt.toISOString(),
        currentPeriod: totals.get(r.kitSerialNumber)?.period ?? null,
        currentPeriodTotalGb: totals.get(r.kitSerialNumber)?.totalGb ?? null,
      })),
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
    const [latest] = await db
      .select()
      .from(leobridgeTerminalPeriodTotal)
      .where(eq(leobridgeTerminalPeriodTotal.kitSerialNumber, kit))
      .orderBy(desc(leobridgeTerminalPeriodTotal.period))
      .limit(1);
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
      currentPeriodTotalGb: latest?.totalGb ?? null,
      currentPeriodPriorityGb: latest?.priorityGb ?? null,
      currentPeriodStandardGb: latest?.standardGb ?? null,
    });
  },
);

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
    const rows = await db
      .select()
      .from(leobridgeTerminalDaily)
      .where(eq(leobridgeTerminalDaily.kitSerialNumber, kit))
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
    const rows = await db
      .select()
      .from(leobridgeTerminalPeriodTotal)
      .where(eq(leobridgeTerminalPeriodTotal.kitSerialNumber, kit))
      .orderBy(desc(leobridgeTerminalPeriodTotal.period));
    res.json(
      rows.map((r) => ({
        period: r.period,
        totalGb: r.totalGb,
        priorityGb: r.priorityGb,
        standardGb: r.standardGb,
        scrapedAt: r.scrapedAt ? r.scrapedAt.toISOString() : null,
      })),
    );
  },
);

export default router;
