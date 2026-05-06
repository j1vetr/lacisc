import { Router, type IRouter } from "express";
import {
  db,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
  stationSyncLogs,
  stationCredentials,
} from "@workspace/db";
import { eq, desc, asc, and, sql, count, max } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// --- /station/kits — terminaller listesi (en güncel period totalleri) ---
router.get("/station/kits", requireAuth, async (req, res): Promise<void> => {
  const { sortBy = "totalGib" } = req.query as Record<string, string>;
  const allowed = new Set(["totalGib", "totalUsd", "lastSeen"]);
  const safeSort = allowed.has(sortBy) ? sortBy : "totalGib";

  // For each (credential, kit), take the row from station_kit_period_total
  // whose period is the maximum (newest). Joining on (credential_id, kit_no)
  // keeps multi-account data correctly partitioned.
  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (credential_id, kit_no)
        credential_id, kit_no, period, total_gib, total_usd, row_count, scraped_at
      FROM station_kit_period_total
      ORDER BY credential_id, kit_no, period DESC
    )
    SELECT
      l.kit_no        AS "kitNo",
      l.period        AS "lastPeriod",
      l.total_gib     AS "totalGib",
      l.total_usd     AS "totalUsd",
      l.row_count     AS "rowCount",
      l.scraped_at    AS "lastSyncedAt",
      k.ship_name     AS "shipName",
      l.credential_id AS "credentialId",
      c.label         AS "accountLabel",
      c.username      AS "accountUsername"
    FROM latest l
    LEFT JOIN station_kits k
      ON k.kit_no = l.kit_no AND k.credential_id = l.credential_id
    LEFT JOIN station_credentials c ON c.id = l.credential_id
  `);
  const list = (
    rows as unknown as {
      rows: Array<{
        kitNo: string;
        lastPeriod: string | null;
        totalGib: number | null;
        totalUsd: number | null;
        rowCount: number;
        lastSyncedAt: string | null;
        shipName: string | null;
      }>;
    }
  ).rows;

  list.sort((a, b) => {
    if (safeSort === "totalGib") return (b.totalGib ?? 0) - (a.totalGib ?? 0);
    if (safeSort === "totalUsd") return (b.totalUsd ?? 0) - (a.totalUsd ?? 0);
    if (safeSort === "lastSeen") {
      const ta = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
      const tb = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
      return tb - ta;
    }
    return 0;
  });

  res.json(list);
});

// --- /station/kits/:kitNo — KIT detayı + aktif dönem özeti ---
router.get("/station/kits/:kitNo", requireAuth, async (req, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);

  const [kitMeta] = await db
    .select()
    .from(stationKits)
    .where(eq(stationKits.kitNo, kitNo))
    .limit(1);

  const [latest] = await db
    .select()
    .from(stationKitPeriodTotal)
    .where(eq(stationKitPeriodTotal.kitNo, kitNo))
    .orderBy(desc(stationKitPeriodTotal.period))
    .limit(1);

  if (!kitMeta && !latest) {
    res.status(404).json({ error: "KIT bulunamadı." });
    return;
  }

  res.json({
    kitNo,
    shipName: kitMeta?.shipName ?? null,
    currentPeriod: latest?.period ?? null,
    totalGib: latest?.totalGib ?? null,
    totalUsd: latest?.totalUsd ?? null,
    rowCount: latest?.rowCount ?? 0,
    lastSyncedAt: latest?.scrapedAt ?? null,
  });
});

// --- /station/kits/:kitNo/daily?period=YYYYMM — günlük CDR satırları ---
router.get("/station/kits/:kitNo/daily", requireAuth, async (req, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);
  let { period } = req.query as { period?: string };

  if (!period) {
    const [latest] = await db
      .select({ p: stationKitPeriodTotal.period })
      .from(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.kitNo, kitNo))
      .orderBy(desc(stationKitPeriodTotal.period))
      .limit(1);
    period = latest?.p ?? undefined;
  }

  if (!period) {
    res.json([]);
    return;
  }

  const points = await db
    .select({
      dayDate: stationKitDaily.dayDate,
      volumeGib: stationKitDaily.volumeGib,
      chargeUsd: stationKitDaily.chargeUsd,
      service: stationKitDaily.service,
      cdrId: stationKitDaily.cdrId,
    })
    .from(stationKitDaily)
    .where(and(eq(stationKitDaily.kitNo, kitNo), eq(stationKitDaily.period, period)))
    .orderBy(asc(stationKitDaily.dayDate), asc(stationKitDaily.cdrId));

  res.json(points);
});

// --- /station/kits/:kitNo/monthly — tüm dönem totalleri ---
router.get("/station/kits/:kitNo/monthly", requireAuth, async (req, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);
  const months = await db
    .select({
      period: stationKitPeriodTotal.period,
      totalGib: stationKitPeriodTotal.totalGib,
      totalUsd: stationKitPeriodTotal.totalUsd,
      rowCount: stationKitPeriodTotal.rowCount,
      scrapedAt: stationKitPeriodTotal.scrapedAt,
    })
    .from(stationKitPeriodTotal)
    .where(eq(stationKitPeriodTotal.kitNo, kitNo))
    .orderBy(desc(stationKitPeriodTotal.period));
  res.json(months);
});

// --- /station/summary — dashboard KPI'ları (aktif period bazlı) ---
router.get("/station/summary", requireAuth, async (_req, res): Promise<void> => {
  // En güncel period: tüm KIT'ler arasında en büyük period.
  const [activeRow] = await db
    .select({ p: max(stationKitPeriodTotal.period) })
    .from(stationKitPeriodTotal);
  const activePeriod = activeRow?.p ?? null;

  let totalKits = 0;
  let totalGib = 0;
  let totalUsd = 0;

  if (activePeriod) {
    const [agg] = await db
      .select({
        kitCount: count(),
        gib: sql<number>`COALESCE(SUM(${stationKitPeriodTotal.totalGib}), 0)`.mapWith(Number),
        usd: sql<number>`COALESCE(SUM(${stationKitPeriodTotal.totalUsd}), 0)`.mapWith(Number),
      })
      .from(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.period, activePeriod));
    totalKits = Number(agg?.kitCount ?? 0);
    totalGib = Number(agg?.gib ?? 0);
    totalUsd = Number(agg?.usd ?? 0);
  }

  const [lastLog] = await db
    .select()
    .from(stationSyncLogs)
    .orderBy(desc(stationSyncLogs.startedAt))
    .limit(1);

  const [settings] = await db
    .select()
    .from(stationCredentials)
    .orderBy(desc(stationCredentials.createdAt))
    .limit(1);

  res.json({
    totalKits,
    totalGib,
    totalUsd,
    activePeriod,
    lastSuccessSyncAt: settings?.lastSuccessSyncAt ?? null,
    lastSyncStatus: lastLog?.status ?? null,
    lastSyncError: lastLog?.status === "failed" ? lastLog.message : null,
    lastSyncRecordsFound: lastLog?.recordsFound ?? null,
    lastSyncRecordsInserted: lastLog?.recordsInserted ?? null,
    lastSyncRecordsUpdated: lastLog?.recordsUpdated ?? null,
  });
});

// --- /station/sync-logs ---
router.get("/station/sync-logs", requireAuth, async (req, res): Promise<void> => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const [logs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(stationSyncLogs)
      .orderBy(desc(stationSyncLogs.startedAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: count() }).from(stationSyncLogs),
  ]);

  res.json({
    logs,
    total: Number(total),
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(Number(total) / limitNum),
  });
});

export default router;
