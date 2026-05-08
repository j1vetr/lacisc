import { Router, type IRouter } from "express";
import {
  db,
  leobridgeSettings,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { encrypt, decrypt } from "../lib/crypto";
import { isCustomer, getAssignedKits } from "../lib/customer-scope";
import {
  runLeobridgeSync,
  testLeobridgeConnection,
  ensureLeobridgeSettingsRow,
  isLeobridgeSyncRunning,
} from "../lib/leobridge-sync";
import {
  startCombinedRun,
  finishCombinedRun,
  isRunning as isAnySyncRunning,
} from "../lib/sync-progress";

const router: IRouter = Router();

async function loadSettingsRow() {
  await ensureLeobridgeSettingsRow();
  const [row] = await db
    .select()
    .from(leobridgeSettings)
    .where(eq(leobridgeSettings.id, 1))
    .limit(1);
  return row!;
}

function publicSettings(row: Awaited<ReturnType<typeof loadSettingsRow>>) {
  return {
    enabled: row.enabled,
    portalUrl: row.portalUrl,
    username: row.username ?? null,
    hasPassword: Boolean(row.encryptedPassword),
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastErrorMessage: row.lastErrorMessage ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get(
  "/leobridge/settings",
  requireAuth,
  requireRole("viewer"),
  async (_req: AuthRequest, res): Promise<void> => {
    const row = await loadSettingsRow();
    res.json(publicSettings(row));
  }
);

router.put(
  "/leobridge/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { enabled, portalUrl, username, password } =
      (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<typeof leobridgeSettings.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (typeof portalUrl === "string" && portalUrl.trim()) {
      patch.portalUrl = portalUrl.trim().replace(/\/+$/, "");
    }
    if (typeof username === "string") patch.username = username.trim() || null;
    if (password === null || password === "") {
      patch.encryptedPassword = null;
    } else if (typeof password === "string") {
      patch.encryptedPassword = encrypt(password);
    }
    await ensureLeobridgeSettingsRow();
    await db
      .update(leobridgeSettings)
      .set(patch)
      .where(eq(leobridgeSettings.id, 1));
    const row = await loadSettingsRow();
    res.json(publicSettings(row));
  }
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
    const row = await loadSettingsRow();
    const useUrl =
      typeof portalUrl === "string" && portalUrl.trim()
        ? portalUrl.trim().replace(/\/+$/, "")
        : row.portalUrl;
    const useUser =
      typeof username === "string" && username.trim()
        ? username.trim()
        : (row.username ?? "");
    let usePass = "";
    if (typeof password === "string" && password.length > 0) {
      usePass = password;
    } else if (row.encryptedPassword) {
      try {
        usePass = decrypt(row.encryptedPassword);
      } catch {
        /* ignore — will fail below */
      }
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
  }
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
    // Wrap with combined-run lifecycle so /sync-progress correctly flips
    // running=false even when Leo runs standalone.
    startCombinedRun();
    void (async () => {
      try {
        const result = await runLeobridgeSync();
        finishCombinedRun(
          result.success
            ? `Leo Bridge: ${result.message}`
            : `Leo Bridge başarısız: ${result.message}`,
          result.success
        );
      } catch (err) {
        finishCombinedRun(
          `Leo Bridge senkronizasyonu başarısız: ${
            err instanceof Error ? err.message : String(err)
          }`,
          false
        );
      }
    })();
    res.json({ success: true, message: "Leo Bridge senkronizasyonu başlatıldı." });
  }
);

async function customerLeobridgeScope(
  req: AuthRequest
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
    const filtered = scope
      ? rows.filter((r) => scope.includes(r.kitSerialNumber))
      : rows;
    // Attach current period total (latest period in period_total).
    const kits = filtered.map((r) => r.kitSerialNumber);
    let totals = new Map<string, { period: string; totalGb: number | null }>();
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
      }))
    );
  }
);

async function ensureLeobridgeKitVisible(
  req: AuthRequest,
  kit: string
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
    const [row] = await db
      .select()
      .from(leobridgeTerminals)
      .where(eq(leobridgeTerminals.kitSerialNumber, kit))
      .limit(1);
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
  }
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
      }))
    );
  }
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
      }))
    );
  }
);

export default router;
