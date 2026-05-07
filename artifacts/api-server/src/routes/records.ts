import { Router, type IRouter } from "express";
import {
  db,
  stationKits,
  stationKitDaily,
  stationKitPeriodTotal,
  stationSyncLogs,
  stationCredentials,
  stationKitLocation,
  stationKitTelemetryHourly,
  stationKitSubscriptionHistory,
} from "@workspace/db";
import { eq, desc, asc, and, gte, inArray, sql, count, max } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import {
  getAssignedKits,
  isCustomer,
  classifyKitDb,
} from "../lib/customer-scope";
import {
  GetKitLocationParams,
  GetKitLocationResponse,
  GetKitLocationsResponse,
  GetKitTelemetryHourlyParams,
  GetKitTelemetryHourlyQueryParams,
  GetKitTelemetryHourlyResponse,
  GetKitSubscriptionsParams,
  GetKitSubscriptionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Returns the Satcom KIT subset a customer can see, or `null` for operators
// (no filtering). Empty array = customer with zero assignments → endpoints
// must yield an empty list, never the full set.
async function customerSatcomScope(req: AuthRequest): Promise<string[] | null> {
  if (!isCustomer(req.userRole)) return null;
  const scope = await getAssignedKits(req.userId!);
  return scope.satcom;
}

// --- /station/kits — terminaller listesi (en güncel period totalleri) ---
router.get("/station/kits", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { sortBy = "totalGib" } = req.query as Record<string, string>;
  const allowed = new Set(["totalGib", "totalUsd", "lastSeen"]);
  const safeSort = allowed.has(sortBy) ? sortBy : "totalGib";

  const scope = await customerSatcomScope(req);
  if (scope !== null && scope.length === 0) {
    res.json([]);
    return;
  }

  // For each (credential, kit), take the row from station_kit_period_total
  // whose period is the maximum (newest). Joining on (credential_id, kit_no)
  // keeps multi-account data correctly partitioned. For customer accounts we
  // append a WHERE on l.kit_no = ANY(...) so unassigned KITs are filtered
  // out at the SQL layer (no over-fetch + leak).
  // Drizzle'ın sql template tag'i bir JS array'ini tek `text[]` PG param'ı
  // olarak bindleyemiyor — array'i tek string'e düzleştiriyor ve sorgu
  // "malformed array literal" benzeri bir hata ile düşüyor. Bunun yerine
  // her KIT'i ayrı param yapan IN listesi üretiyoruz. Empty scope yukarıda
  // erken dönüş ile yakalandığı için IN () üretme riski yok.
  const where = scope
    ? sql`WHERE l.kit_no IN (${sql.join(
        scope.map((v) => sql`${v}`),
        sql`, `,
      )})`
    : sql``;
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
    ${where}
  `);
  const list = (
    rows as unknown as {
      rows: Array<{
        kitNo: string;
        lastPeriod: string | null;
        totalGib: number | null;
        totalUsd: number | null;
        rowCount: number;
        lastSyncedAt: string | Date | null;
        shipName: string | null;
      }>;
    }
  ).rows.map((r) => ({
    ...r,
    // Postgres `timestamp` (timezone'suz) raw SQL'de Z'siz string döner.
    // Drizzle ORM yolu (kit-detail) Date → ISO+Z üretiyor; tutarlı olmak için
    // string gelirse UTC kabul edip ISO'ya çeviriyoruz.
    lastSyncedAt:
      r.lastSyncedAt == null
        ? null
        : r.lastSyncedAt instanceof Date
          ? r.lastSyncedAt.toISOString()
          : new Date(
              /[zZ]|[+-]\d{2}:?\d{2}$/.test(r.lastSyncedAt)
                ? r.lastSyncedAt
                : r.lastSyncedAt.replace(" ", "T") + "Z",
            ).toISOString(),
  }));

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

// --- /station/kits/:kitNo/source — sayfalanan KIT'in Satcom/Starlink ayrımı ---
// Frontend dispatcher (kit-detail.tsx) ve customer-scope bunu kullanarak
// "KITP\d" tahmin kuralından kurtulur — Tototheo serileri de bu prefix'le
// gelebildiği için tahmin yanlış sınıflandırma üretiyor.
router.get(
  "/station/kits/:kitNo/source",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const kitNo = String(req.params.kitNo);
    const source = await classifyKitDb(kitNo);
    // Müşteri ise atanmamış KIT'lerin varlığını da sızdırma — 404 dön.
    if (isCustomer(req.userRole)) {
      const scope = await getAssignedKits(req.userId!);
      if (!scope.all.includes(kitNo)) {
        res.status(404).json({ error: "KIT bulunamadı." });
        return;
      }
    }
    if (source === "unknown") {
      res.status(404).json({ error: "KIT bulunamadı." });
      return;
    }
    res.json({ kitNo, source });
  },
);

// --- /station/kits/:kitNo — KIT detayı + aktif dönem özeti ---
router.get("/station/kits/:kitNo", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);
  const scope = await customerSatcomScope(req);
  if (scope !== null && !scope.includes(kitNo)) {
    res.status(404).json({ error: "KIT bulunamadı." });
    return;
  }

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
    // CardDetails enrichment alanları (Task #20). İlk sync tamamlanmadan
    // önce tümü null'dır.
    imsi: kitMeta?.imsi ?? null,
    imei: kitMeta?.imei ?? null,
    mobileNumber: kitMeta?.mobileNumber ?? null,
    costCenter: kitMeta?.costCenter ?? null,
    activationDate: kitMeta?.activationDate ?? null,
    activePlanName: kitMeta?.activePlanName ?? null,
    activePlanStartedAt: kitMeta?.activePlanStartedAt ?? null,
    activeSubscriptionId: kitMeta?.activeSubscriptionId ?? null,
    optOutGib: kitMeta?.optOutGib ?? null,
    stepAlertGib: kitMeta?.stepAlertGib ?? null,
    lastSessionStart: kitMeta?.lastSessionStart ?? null,
    lastSessionEnd: kitMeta?.lastSessionEnd ?? null,
    lastSessionActive: kitMeta?.lastSessionActive ?? null,
    lastSessionType: kitMeta?.lastSessionType ?? null,
    cardDetailsSyncedAt: kitMeta?.cardDetailsSyncedAt ?? null,
  });
});

// --- Task #20 enrichment endpoints --------------------------------------

// Tek KIT konumu — Map sayfası snapshot'ı.
router.get(
  "/station/kits/:kitNo/location",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const params = GetKitLocationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Geçersiz KIT no." });
      return;
    }
    const { kitNo } = params.data;
    const scope = await customerSatcomScope(req);
    if (scope !== null && !scope.includes(kitNo)) {
      res.status(404).json({ error: "KIT bulunamadı." });
      return;
    }
    const [row] = await db
      .select({
        kitNo: stationKitLocation.kitNo,
        lat: stationKitLocation.lat,
        lng: stationKitLocation.lng,
        active: stationKitLocation.active,
        offline: stationKitLocation.offline,
        icon: stationKitLocation.icon,
        customerId: stationKitLocation.customerId,
        lastSeenAt: stationKitLocation.lastSeenAt,
        shipName: stationKits.shipName,
      })
      .from(stationKitLocation)
      .leftJoin(stationKits, eq(stationKits.kitNo, stationKitLocation.kitNo))
      .where(eq(stationKitLocation.kitNo, kitNo))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "KIT konum verisi yok." });
      return;
    }
    const parsed = GetKitLocationResponse.safeParse(row);
    if (!parsed.success) {
      req.log.error(
        { kitNo, issues: parsed.error.issues },
        "GetKitLocationResponse zod parse failed"
      );
      res.status(500).json({ error: "Sunucu yanıtı doğrulanamadı." });
      return;
    }
    res.json(parsed.data);
  }
);

// Tüm Satcom KIT konumları — Map widget'i için.
router.get(
  "/station/locations",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const scope = await customerSatcomScope(req);
    if (scope !== null && scope.length === 0) {
      res.json([]);
      return;
    }
    const baseQuery = db
      .select({
        kitNo: stationKitLocation.kitNo,
        lat: stationKitLocation.lat,
        lng: stationKitLocation.lng,
        active: stationKitLocation.active,
        offline: stationKitLocation.offline,
        icon: stationKitLocation.icon,
        customerId: stationKitLocation.customerId,
        lastSeenAt: stationKitLocation.lastSeenAt,
        shipName: stationKits.shipName,
      })
      .from(stationKitLocation)
      .leftJoin(stationKits, eq(stationKits.kitNo, stationKitLocation.kitNo));
    const rows = scope
      ? await baseQuery.where(inArray(stationKitLocation.kitNo, scope))
      : await baseQuery;
    const parsed = GetKitLocationsResponse.safeParse(rows);
    if (!parsed.success) {
      req.log.error(
        { issues: parsed.error.issues },
        "GetKitLocationsResponse zod parse failed"
      );
      res.status(500).json({ error: "Sunucu yanıtı doğrulanamadı." });
      return;
    }
    res.json(parsed.data);
  }
);

// Saatlik telemetri (varsayılan son 7 gün, max 30).
router.get(
  "/station/kits/:kitNo/telemetry/hourly",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const params = GetKitTelemetryHourlyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Geçersiz KIT no." });
      return;
    }
    const query = GetKitTelemetryHourlyQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Geçersiz sorgu (days 1-30)." });
      return;
    }
    const { kitNo } = params.data;
    const scope = await customerSatcomScope(req);
    if (scope !== null && !scope.includes(kitNo)) {
      res.status(404).json({ error: "KIT bulunamadı." });
      return;
    }
    const days = query.data.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        intervalStart: stationKitTelemetryHourly.intervalStart,
        downloadMinMbps: stationKitTelemetryHourly.downloadMinMbps,
        downloadAvgMbps: stationKitTelemetryHourly.downloadAvgMbps,
        downloadMaxMbps: stationKitTelemetryHourly.downloadMaxMbps,
        uploadMinMbps: stationKitTelemetryHourly.uploadMinMbps,
        uploadAvgMbps: stationKitTelemetryHourly.uploadAvgMbps,
        uploadMaxMbps: stationKitTelemetryHourly.uploadMaxMbps,
        latencyMinMs: stationKitTelemetryHourly.latencyMinMs,
        latencyAvgMs: stationKitTelemetryHourly.latencyAvgMs,
        latencyMaxMs: stationKitTelemetryHourly.latencyMaxMs,
        pingDropMinPct: stationKitTelemetryHourly.pingDropMinPct,
        pingDropAvgPct: stationKitTelemetryHourly.pingDropAvgPct,
        pingDropMaxPct: stationKitTelemetryHourly.pingDropMaxPct,
        obstructionMinPct: stationKitTelemetryHourly.obstructionMinPct,
        obstructionAvgPct: stationKitTelemetryHourly.obstructionAvgPct,
        obstructionMaxPct: stationKitTelemetryHourly.obstructionMaxPct,
        signalQualityMinPct: stationKitTelemetryHourly.signalQualityMinPct,
        signalQualityAvgPct: stationKitTelemetryHourly.signalQualityAvgPct,
        signalQualityMaxPct: stationKitTelemetryHourly.signalQualityMaxPct,
      })
      .from(stationKitTelemetryHourly)
      .where(
        and(
          eq(stationKitTelemetryHourly.kitNo, kitNo),
          gte(stationKitTelemetryHourly.intervalStart, since)
        )
      )
      .orderBy(asc(stationKitTelemetryHourly.intervalStart));
    const parsed = GetKitTelemetryHourlyResponse.safeParse(rows);
    if (!parsed.success) {
      req.log.error(
        { kitNo, issues: parsed.error.issues },
        "GetKitTelemetryHourlyResponse zod parse failed"
      );
      res.status(500).json({ error: "Sunucu yanıtı doğrulanamadı." });
      return;
    }
    res.json(parsed.data);
  }
);

// Abonelik geçmişi.
router.get(
  "/station/kits/:kitNo/subscriptions",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const params = GetKitSubscriptionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Geçersiz KIT no." });
      return;
    }
    const { kitNo } = params.data;
    const scope = await customerSatcomScope(req);
    if (scope !== null && !scope.includes(kitNo)) {
      res.status(404).json({ error: "KIT bulunamadı." });
      return;
    }
    const rows = await db
      .select({
        subscriptionId: stationKitSubscriptionHistory.subscriptionId,
        startDate: stationKitSubscriptionHistory.startDate,
        endDate: stationKitSubscriptionHistory.endDate,
        customerId: stationKitSubscriptionHistory.customerId,
        customerName: stationKitSubscriptionHistory.customerName,
        pricePlanName: stationKitSubscriptionHistory.pricePlanName,
        scrapedAt: stationKitSubscriptionHistory.scrapedAt,
      })
      .from(stationKitSubscriptionHistory)
      .where(eq(stationKitSubscriptionHistory.kitNo, kitNo))
      .orderBy(desc(stationKitSubscriptionHistory.startDate));
    const parsed = GetKitSubscriptionsResponse.safeParse(rows);
    if (!parsed.success) {
      req.log.error(
        { kitNo, issues: parsed.error.issues },
        "GetKitSubscriptionsResponse zod parse failed"
      );
      res.status(500).json({ error: "Sunucu yanıtı doğrulanamadı." });
      return;
    }
    res.json(parsed.data);
  }
);

// --- /station/kits/:kitNo/daily?period=YYYYMM — günlük CDR satırları ---
router.get("/station/kits/:kitNo/daily", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);
  const scope = await customerSatcomScope(req);
  if (scope !== null && !scope.includes(kitNo)) {
    res.status(404).json({ error: "KIT bulunamadı." });
    return;
  }
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
router.get("/station/kits/:kitNo/monthly", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const kitNo = String(req.params.kitNo);
  const scope = await customerSatcomScope(req);
  if (scope !== null && !scope.includes(kitNo)) {
    res.status(404).json({ error: "KIT bulunamadı." });
    return;
  }
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
router.get("/station/summary", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const scope = await customerSatcomScope(req);
  // En güncel period: tüm KIT'ler arasında en büyük period — customer'da
  // sadece atanmış KIT'lere bakar.
  const activeQuery = scope
    ? db
        .select({ p: max(stationKitPeriodTotal.period) })
        .from(stationKitPeriodTotal)
        .where(scope.length > 0 ? inArray(stationKitPeriodTotal.kitNo, scope) : sql`false`)
    : db.select({ p: max(stationKitPeriodTotal.period) }).from(stationKitPeriodTotal);
  const [activeRow] = await activeQuery;
  const activePeriod = activeRow?.p ?? null;

  let totalKits = 0;
  let totalGib = 0;
  let totalUsd = 0;

  if (activePeriod) {
    const baseWhere = eq(stationKitPeriodTotal.period, activePeriod);
    const where = scope
      ? scope.length > 0
        ? and(baseWhere, inArray(stationKitPeriodTotal.kitNo, scope))
        : sql`false`
      : baseWhere;
    const [agg] = await db
      .select({
        kitCount: count(),
        gib: sql<number>`COALESCE(SUM(${stationKitPeriodTotal.totalGib}), 0)`.mapWith(Number),
        usd: sql<number>`COALESCE(SUM(${stationKitPeriodTotal.totalUsd}), 0)`.mapWith(Number),
      })
      .from(stationKitPeriodTotal)
      .where(where as never);
    totalKits = Number(agg?.kitCount ?? 0);
    totalGib = Number(agg?.gib ?? 0);
    totalUsd = Number(agg?.usd ?? 0);
  }

  // Operatör sync sağlığı sadece operatörlere gösterilir; customer'a yalnızca
  // "son güncelleme" zamanı (atanmış KIT'lerinin en son scrapedAt'i) verilir.
  let lastSuccessSyncAt: Date | string | null = null;
  let lastSyncStatus: string | null = null;
  let lastSyncError: string | null = null;
  let lastSyncRecordsFound: number | null = null;
  let lastSyncRecordsInserted: number | null = null;
  let lastSyncRecordsUpdated: number | null = null;

  if (scope) {
    if (scope.length > 0) {
      const [row] = await db
        .select({
          scrapedAt: max(stationKitPeriodTotal.scrapedAt),
        })
        .from(stationKitPeriodTotal)
        .where(inArray(stationKitPeriodTotal.kitNo, scope));
      lastSuccessSyncAt = row?.scrapedAt ?? null;
    }
  } else {
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

    lastSuccessSyncAt = settings?.lastSuccessSyncAt ?? null;
    lastSyncStatus = lastLog?.status ?? null;
    lastSyncError = lastLog?.status === "failed" ? lastLog.message : null;
    lastSyncRecordsFound = lastLog?.recordsFound ?? null;
    lastSyncRecordsInserted = lastLog?.recordsInserted ?? null;
    lastSyncRecordsUpdated = lastLog?.recordsUpdated ?? null;
  }

  res.json({
    totalKits,
    totalGib,
    totalUsd,
    activePeriod,
    lastSuccessSyncAt,
    lastSyncStatus,
    lastSyncError,
    lastSyncRecordsFound,
    lastSyncRecordsInserted,
    lastSyncRecordsUpdated,
  });
});

// --- /station/sync-logs ---
// Operatör-only (viewer+). Customer 403 alır → /sync-logs sayfasını UI zaten
// gizliyor ama defans amaçlı sunucu da kontrol ediyor.
router.get("/station/sync-logs", requireAuth, requireRole("viewer"), async (req, res): Promise<void> => {
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
