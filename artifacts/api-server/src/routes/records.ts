import { Router, type IRouter } from "express";
import {
  db,
  stationCdrRecords,
  stationSyncLogs,
  stationCredentials,
  stationKits,
} from "@workspace/db";
import {
  eq,
  desc,
  asc,
  like,
  and,
  sql,
  count,
  sum,
  max,
  getTableColumns,
} from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/station/cdr-records", requireAuth, async (req, res): Promise<void> => {
  const {
    page = "1",
    limit = "50",
    kitNo,
    period,
    customerCode,
    product,
    service,
    sortBy = "syncedAt",
    sortOrder = "desc",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (kitNo) conditions.push(like(stationCdrRecords.kitNo, `%${kitNo}%`));
  if (period) conditions.push(eq(stationCdrRecords.period, period));
  if (customerCode) conditions.push(like(stationCdrRecords.customerCode, `%${customerCode}%`));
  if (product) conditions.push(like(stationCdrRecords.product, `%${product}%`));
  if (service) conditions.push(like(stationCdrRecords.service, `%${service}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allowedSortColumns = {
    totalVolumeGbNumeric: stationCdrRecords.totalVolumeGbNumeric,
    totalPrice: stationCdrRecords.totalPrice,
    syncedAt: stationCdrRecords.syncedAt,
    startCdr: stationCdrRecords.startCdr,
  } as const;

  type SortKey = keyof typeof allowedSortColumns;

  const sortCol =
    sortBy in allowedSortColumns
      ? allowedSortColumns[sortBy as SortKey]
      : stationCdrRecords.syncedAt;

  const orderFn = sortOrder === "asc" ? asc : desc;

  const [records, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(stationCdrRecords),
        shipName: stationKits.shipName,
      })
      .from(stationCdrRecords)
      .leftJoin(stationKits, eq(stationKits.kitNo, stationCdrRecords.kitNo))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(stationCdrRecords)
      .where(whereClause),
  ]);

  res.json({
    records,
    total: Number(total),
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(Number(total) / limitNum),
  });
});

router.get("/station/kits", requireAuth, async (req, res): Promise<void> => {
  const { kitNo, sortBy = "totalGb" } = req.query as Record<string, string>;

  const allowedSorts = ["totalGb", "totalPrice", "lastSeen"];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : "totalGb";

  const query = db
    .select({
      kitNo: stationCdrRecords.kitNo,
      shipName: stationKits.shipName,
      totalGb: sum(stationCdrRecords.totalVolumeGbNumeric).mapWith(Number),
      totalPrice: sql<number>`SUM(CAST(NULLIF(REGEXP_REPLACE(${stationCdrRecords.totalPrice}, '[^0-9.]', '', 'g'), '') AS NUMERIC))`.mapWith(Number),
      recordCount: count(),
      lastPeriod: max(stationCdrRecords.period),
      lastSyncedAt: max(stationCdrRecords.syncedAt),
    })
    .from(stationCdrRecords)
    .leftJoin(stationKits, eq(stationKits.kitNo, stationCdrRecords.kitNo))
    .groupBy(stationCdrRecords.kitNo, stationKits.shipName);

  if (kitNo) {
    query.where(like(stationCdrRecords.kitNo, `%${kitNo}%`));
  }

  const sortMap: Record<string, ReturnType<typeof desc>> = {};
  const results = await query;

  results.sort((a, b) => {
    if (safeSort === "totalGb") return (b.totalGb ?? 0) - (a.totalGb ?? 0);
    if (safeSort === "totalPrice") return (b.totalPrice ?? 0) - (a.totalPrice ?? 0);
    if (safeSort === "lastSeen") {
      const da = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
      const db2 = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
      return db2 - da;
    }
    return 0;
  });

  res.json(results);
});

router.get("/station/summary", requireAuth, async (_req, res): Promise<void> => {
  const [cdrStats] = await db
    .select({
      totalKits: sql<number>`COUNT(DISTINCT ${stationCdrRecords.kitNo})`.mapWith(Number),
      totalGb: sum(stationCdrRecords.totalVolumeGbNumeric).mapWith(Number),
      totalUsd: sql<number>`SUM(CAST(NULLIF(REGEXP_REPLACE(${stationCdrRecords.totalPrice}, '[^0-9.]', '', 'g'), '') AS NUMERIC))`.mapWith(Number),
      activePeriod: max(stationCdrRecords.period),
    })
    .from(stationCdrRecords);

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
    totalKits: cdrStats?.totalKits ?? 0,
    totalGb: cdrStats?.totalGb ?? 0,
    totalUsd: cdrStats?.totalUsd ?? 0,
    activePeriod: cdrStats?.activePeriod ?? null,
    lastSuccessSyncAt: settings?.lastSuccessSyncAt ?? null,
    lastSyncStatus: lastLog?.status ?? null,
    lastSyncError: lastLog?.status === "failed" ? lastLog.message : null,
    lastSyncRecordsFound: lastLog?.recordsFound ?? null,
    lastSyncRecordsInserted: lastLog?.recordsInserted ?? null,
    lastSyncRecordsUpdated: lastLog?.recordsUpdated ?? null,
  });
});

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

router.get("/station/export-csv", requireAuth, async (req, res): Promise<void> => {
  const { kitNo, period } = req.query as Record<string, string>;

  const conditions = [];
  if (kitNo) conditions.push(like(stationCdrRecords.kitNo, `%${kitNo}%`));
  if (period) conditions.push(eq(stationCdrRecords.period, period));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const records = await db
    .select()
    .from(stationCdrRecords)
    .where(whereClause)
    .orderBy(desc(stationCdrRecords.syncedAt))
    .limit(10000);

  const headers = [
    "KIT No",
    "Product",
    "Service",
    "Customer Code",
    "Total Volume Data",
    "Total Volume GB",
    "Currency",
    "Total Price",
    "Period",
    "CDR ID",
    "Start CDR",
    "End CDR",
    "Synced At",
  ];

  const rows = records.map((r) => [
    r.kitNo,
    r.product ?? "",
    r.service ?? "",
    r.customerCode ?? "",
    r.totalVolumeData ?? "",
    r.totalVolumeGbNumeric?.toString() ?? "",
    r.currency ?? "",
    r.totalPrice ?? "",
    r.period ?? "",
    r.cdrId ?? "",
    r.startCdr ?? "",
    r.endCdr ?? "",
    r.syncedAt.toISOString(),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cdr-records-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
});

export default router;
