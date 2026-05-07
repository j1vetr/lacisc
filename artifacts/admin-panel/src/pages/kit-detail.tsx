import React, { useMemo, useState, lazy, Suspense } from "react";
import { Link, useRoute } from "wouter";
import {
  useGetKitDetail,
  getGetKitDetailQueryKey,
  useGetKitDaily,
  getGetKitDailyQueryKey,
  useGetKitMonthly,
  getGetKitMonthlyQueryKey,
  useGetKitSource,
  getGetKitSourceQueryKey,
  useGetKitLocation,
  getGetKitLocationQueryKey,
  useGetKitTelemetryHourly,
  getGetKitTelemetryHourlyQueryKey,
  useGetKitSubscriptions,
  getGetKitSubscriptionsQueryKey,
} from "@workspace/api-client-react";
import type { KitTelemetryHourlyPoint } from "@workspace/api-client-react";
import {
  ArrowLeft,
  Terminal,
  HardDrive,
  CalendarClock,
  Activity,
  Wifi,
  WifiOff,
  MapPin,
  Gauge,
  Clock,
  Download,
  Upload,
  Signal,
  TrendingUp,
  Radio,
  Compass,
  Phone,
  Briefcase,
  PlugZap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  Card,
  Pill,
  QuotaStat,
  MetricTile,
} from "@/components/kit-detail/primitives";
import StarlinkDetail from "./starlink-detail";

const TerminalMap = lazy(() => import("@/components/terminal-map"));

function formatPeriodLabel(period?: string | null) {
  if (!period) return "-";
  if (/^\d{6}$/.test(period)) {
    return `${period.slice(4, 6)}/${period.slice(0, 4)}`;
  }
  return period;
}

function formatDay(dayDate: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
    return `${dayDate.slice(8, 10)}.${dayDate.slice(5, 7)}`;
  }
  return dayDate;
}

function formatHourLabel(iso: string) {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm} ${hh}:00`;
  } catch {
    return iso;
  }
}

// Wrapper picks the correct view by asking the backend which data source the
// KIT belongs to. See git history for rationale.
export default function KitDetail() {
  const [, params] = useRoute("/kits/:kitNo");
  const rawKitNo = params?.kitNo ?? "";
  const kitNo = decodeURIComponent(rawKitNo);
  const { data: srcData, isLoading: srcLoading, error: srcError } = useGetKitSource(
    kitNo,
    {
      query: {
        queryKey: getGetKitSourceQueryKey(kitNo),
        enabled: Boolean(kitNo),
        staleTime: 5 * 60 * 1000,
        retry: 0,
      },
    },
  );

  if (!kitNo) {
    return <SatcomKitDetail kitNo={kitNo} />;
  }
  if (srcLoading) {
    return (
      <div className="space-y-3 animate-in fade-in duration-300">
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-8 h-[140px] rounded-lg" />
          <Skeleton className="lg:col-span-4 h-[140px] rounded-lg" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }
  const source: "satcom" | "starlink" =
    srcData?.source === "starlink" || srcData?.source === "satcom"
      ? srcData.source
      : srcError
        ? /^KITP\d/i.test(kitNo)
          ? "satcom"
          : "starlink"
        : "satcom";

  if (source === "starlink") {
    return <StarlinkDetail kit={kitNo} />;
  }
  return <SatcomKitDetail kitNo={kitNo} />;
}

type SparkPoint = { ts: string; label: string; value: number | null };

function buildSparkSeries(
  points: KitTelemetryHourlyPoint[] | undefined,
  picker: (p: KitTelemetryHourlyPoint) => number | null | undefined,
): SparkPoint[] {
  return (points ?? []).map((p) => {
    const v = picker(p);
    return {
      ts: p.intervalStart,
      label: formatHourLabel(p.intervalStart),
      value: v == null ? null : Number(v),
    };
  });
}

function MiniSparkline({
  data,
  unit,
  decimals = 1,
  gradientId,
}: {
  data: SparkPoint[];
  unit: string;
  decimals?: number;
  gradientId: string;
}) {
  const valid = data.filter((d) => d.value != null);
  if (valid.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-[11px] text-muted-foreground">
        Veri yok
      </div>
    );
  }
  if (valid.length === 1) {
    // Tek nokta sparkline çizilemiyor — büyük değeri tek başına göster.
    return (
      <div className="h-16 flex items-center justify-center font-mono text-base text-foreground">
        {formatNumber(valid[0].value!, decimals)}
        <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span>
      </div>
    );
  }
  return (
    <div className="h-16 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f54e00" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#f54e00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              background: "#fffefb",
              border: "1px solid #e6e5e0",
              borderRadius: 6,
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              padding: "4px 8px",
            }}
            labelStyle={{ fontSize: 10, color: "#a8a79e" }}
            formatter={(v: number) => [
              `${formatNumber(v, decimals)} ${unit}`,
              "",
            ]}
            labelFormatter={(l: string) => l}
            separator=""
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#f54e00"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            connectNulls
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SatcomKitDetail({ kitNo }: { kitNo: string }) {
  useDocumentTitle(kitNo);
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(
    undefined,
  );

  const { data: detail, isLoading: detailLoading } = useGetKitDetail(kitNo, {
    query: { queryKey: getGetKitDetailQueryKey(kitNo), enabled: Boolean(kitNo) },
  });
  const { data: monthly, isLoading: monthlyLoading } = useGetKitMonthly(kitNo, {
    query: {
      queryKey: getGetKitMonthlyQueryKey(kitNo),
      enabled: Boolean(kitNo),
    },
  });

  const dailyParams = selectedPeriod ? { period: selectedPeriod } : {};
  const { data: daily, isLoading: dailyLoading } = useGetKitDaily(
    kitNo,
    dailyParams,
    {
      query: {
        queryKey: getGetKitDailyQueryKey(kitNo, dailyParams),
        enabled: Boolean(kitNo),
      },
    },
  );

  const { data: location, isLoading: locationLoading } = useGetKitLocation(
    kitNo,
    {
      query: {
        queryKey: getGetKitLocationQueryKey(kitNo),
        enabled: Boolean(kitNo),
        retry: 0,
      },
    },
  );

  // Last 24h for "live" telemetry tile values; 7d for sparklines.
  const dayParams = { days: 1 };
  const weekParams = { days: 7 };
  const { data: telemetryDay, isLoading: telemetryDayLoading } =
    useGetKitTelemetryHourly(kitNo, dayParams, {
      query: {
        queryKey: getGetKitTelemetryHourlyQueryKey(kitNo, dayParams),
        enabled: Boolean(kitNo),
      },
    });
  const { data: telemetryWeek, isLoading: telemetryWeekLoading } =
    useGetKitTelemetryHourly(kitNo, weekParams, {
      query: {
        queryKey: getGetKitTelemetryHourlyQueryKey(kitNo, weekParams),
        enabled: Boolean(kitNo),
      },
    });

  const { data: subscriptions } =
    useGetKitSubscriptions(kitNo, {
      query: {
        queryKey: getGetKitSubscriptionsQueryKey(kitNo),
        enabled: Boolean(kitNo),
      },
    });

  const activePeriod = selectedPeriod ?? detail?.currentPeriod ?? null;
  const periodLabel = formatPeriodLabel(activePeriod);

  // Daily chart: aggregate CDR rows per day, GiB.
  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: string; gib: number }>();
    for (const r of daily ?? []) {
      const key = r.dayDate;
      const cur = byDay.get(key) ?? { day: formatDay(r.dayDate), gib: 0 };
      cur.gib += r.volumeGib ?? 0;
      byDay.set(key, cur);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }, [daily]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  // Last hourly bucket -> "live" metrics (Avg).
  const lastHour = useMemo(() => {
    const list = telemetryDay ?? [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) =>
      a.intervalStart < b.intervalStart ? 1 : -1,
    )[0];
  }, [telemetryDay]);

  const sparkSeries = useMemo(() => {
    const sorted = [...(telemetryWeek ?? [])].sort((a, b) =>
      a.intervalStart < b.intervalStart ? -1 : 1,
    );
    return {
      download: buildSparkSeries(sorted, (p) => p.downloadAvgMbps),
      upload: buildSparkSeries(sorted, (p) => p.uploadAvgMbps),
      latency: buildSparkSeries(sorted, (p) => p.latencyAvgMs),
      pingDrop: buildSparkSeries(sorted, (p) => p.pingDropAvgPct),
      obstruction: buildSparkSeries(sorted, (p) => p.obstructionAvgPct),
      signal: buildSparkSeries(sorted, (p) => p.signalQualityAvgPct),
    };
  }, [telemetryWeek]);

  const shipName = detail?.shipName || "—";
  const planName = detail?.activePlanName ?? null;
  const optOutGib = detail?.optOutGib ?? null;
  const stepAlertGib = detail?.stepAlertGib ?? null;
  const used = detail?.totalGib ?? 0;
  const allowance = optOutGib;
  const remaining =
    allowance != null ? Math.max(allowance - used, 0) : null;
  const usedPct =
    allowance && allowance > 0 ? (used / allowance) * 100 : null;

  const locActive = location ? location.active && !location.offline : false;
  // CardDetails enrichment durumu — null lastSessionActive durumunda harita
  // verisini kullan; aksi halde "Pasif" rozeti yanıltıcı olur.
  const onlineKnown =
    detail?.lastSessionActive != null || location != null;
  const isOnline =
    detail?.lastSessionActive != null
      ? Boolean(detail.lastSessionActive)
      : locActive;

  // Hangi opsiyonel alanlar gerçekten dolu? Boş kartları gizlemek için.
  const hasHeaderMeta = Boolean(
    detail?.mobileNumber ||
      detail?.costCenter ||
      detail?.lastSessionStart ||
      detail?.lastSyncedAt,
  );
  const hasPlanInfo = Boolean(
    planName != null || optOutGib != null || stepAlertGib != null,
  );
  const hasSubscriptions = (subscriptions ?? []).length > 0;
  const hasLastHour = lastHour != null;
  const cardDetailsCollected = Boolean(detail?.cardDetailsSyncedAt);

  // Helpers to render Avg values from `lastHour` with proper units / scaling.
  const fmtPct = (v?: number | null, dec = 1) =>
    v == null ? "—" : formatNumber(v, dec);
  const fmtNum = (v?: number | null, dec = 1) =>
    v == null ? "—" : formatNumber(v, dec);
  const minMaxHint = (
    min?: number | null,
    max?: number | null,
    unit?: string,
    dec = 1,
  ) => {
    if (min == null && max == null) return null;
    return (
      <>
        min {min == null ? "—" : formatNumber(min, dec)}
        {" / "}max {max == null ? "—" : formatNumber(max, dec)}
        {unit ? ` ${unit}` : ""}
      </>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Sticky dense header */}
      <div className="rounded-lg border border-border bg-card sticky top-0 z-20 shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 border-b border-border flex-wrap">
          <Link href="/kits">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Terminaller
            </div>
          </Link>
          <span className="text-border">/</span>
          <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg tracking-tight truncate min-w-0">
            {detailLoading ? (
              <Skeleton className="h-5 w-40 inline-block align-middle" />
            ) : (
              shipName
            )}
          </h1>
          <span className="font-mono text-xs sm:text-sm text-muted-foreground truncate">
            {kitNo}
          </span>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {!detailLoading && onlineKnown && (
              <Pill tone={isOnline ? "ok" : "warn"}>
                {isOnline ? (
                  <>
                    <Wifi className="w-2.5 h-2.5" /> Aktif
                  </>
                ) : (
                  <>
                    <WifiOff className="w-2.5 h-2.5" /> Pasif
                  </>
                )}
              </Pill>
            )}
            {planName && <Pill tone="info">{planName}</Pill>}
          </div>
        </div>
        {hasHeaderMeta && (
        <div className="px-4 sm:px-5 py-2 flex items-center gap-4 sm:gap-6 text-[11px] font-mono text-muted-foreground flex-wrap">
          {detail?.mobileNumber && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="w-3 h-3" />
              <span className="text-foreground">{detail.mobileNumber}</span>
            </span>
          )}
          {detail?.costCenter && (
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="w-3 h-3" />
              <span className="text-foreground">{detail.costCenter}</span>
            </span>
          )}
          {detail?.lastSessionStart && (
            <span className="inline-flex items-center gap-1.5">
              <PlugZap className="w-3 h-3" />
              <span className="text-muted-foreground">Son oturum:</span>{" "}
              <span className="text-foreground">
                {formatDate(detail.lastSessionStart)}
              </span>
              {detail.lastSessionType && (
                <span className="text-muted-foreground">
                  · {detail.lastSessionType}
                </span>
              )}
            </span>
          )}
          {detail?.lastSyncedAt && (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Son senkronizasyon {formatDate(detail.lastSyncedAt)}
            </span>
          )}
        </div>
        )}
      </div>

      {!detailLoading && !cardDetailsCollected && (
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-2.5 text-[12px] text-muted-foreground flex items-center gap-2">
          <PlugZap className="w-3.5 h-3.5" />
          Bu KIT için portal detay sayfası henüz taranmadı — plan, mobile
          numara, abonelik geçmişi ve oturum bilgileri sonraki senkronizasyondan
          sonra görünecek.
        </div>
      )}

      {/* Top row: Live telemetry (8) + Map (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">
                Canlı Telemetri
              </h2>
              {lastHour?.intervalStart && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  · {formatDate(lastHour.intervalStart)}
                </span>
              )}
            </div>
          </div>
          {!telemetryDayLoading && !hasLastHour ? (
            <div className="m-4 text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Saatlik telemetri henüz toplanmadı.
              <div className="mt-1 text-[11px]">
                Bir sonraki senkronizasyon turundan sonra burada anlık metrikler
                görünecek.
              </div>
            </div>
          ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {telemetryDayLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] rounded-lg" />
              ))
            ) : (
              <>
                <MetricTile
                  label="Sinyal"
                  value={fmtPct(lastHour?.signalQualityAvgPct, 0)}
                  unit="%"
                  icon={<Gauge className="w-3 h-3" />}
                  tone={
                    (lastHour?.signalQualityAvgPct ?? 0) >= 80
                      ? "ok"
                      : "neutral"
                  }
                  hint={minMaxHint(
                    lastHour?.signalQualityMinPct,
                    lastHour?.signalQualityMaxPct,
                    "%",
                    0,
                  )}
                />
                <MetricTile
                  label="Gecikme"
                  value={fmtNum(lastHour?.latencyAvgMs, 0)}
                  unit="ms"
                  icon={<Activity className="w-3 h-3" />}
                  tone={
                    (lastHour?.latencyAvgMs ?? 999) < 80 ? "ok" : "neutral"
                  }
                  hint={minMaxHint(
                    lastHour?.latencyMinMs,
                    lastHour?.latencyMaxMs,
                    "ms",
                    0,
                  )}
                />
                <MetricTile
                  label="Paket Kaybı"
                  value={fmtPct(lastHour?.pingDropAvgPct, 2)}
                  unit="%"
                  icon={<TrendingUp className="w-3 h-3" />}
                  tone={
                    (lastHour?.pingDropAvgPct ?? 0) > 2 ? "warn" : "neutral"
                  }
                  hint={minMaxHint(
                    lastHour?.pingDropMinPct,
                    lastHour?.pingDropMaxPct,
                    "%",
                    2,
                  )}
                />
                <MetricTile
                  label="İndirme"
                  value={fmtNum(lastHour?.downloadAvgMbps, 1)}
                  unit="Mbps"
                  icon={<Download className="w-3 h-3" />}
                  hint={minMaxHint(
                    lastHour?.downloadMinMbps,
                    lastHour?.downloadMaxMbps,
                    "Mbps",
                    1,
                  )}
                />
                <MetricTile
                  label="Yükleme"
                  value={fmtNum(lastHour?.uploadAvgMbps, 1)}
                  unit="Mbps"
                  icon={<Upload className="w-3 h-3" />}
                  hint={minMaxHint(
                    lastHour?.uploadMinMbps,
                    lastHour?.uploadMaxMbps,
                    "Mbps",
                    1,
                  )}
                />
                <MetricTile
                  label="Engel"
                  value={fmtPct(lastHour?.obstructionAvgPct, 2)}
                  unit="%"
                  icon={<Signal className="w-3 h-3" />}
                  tone={
                    (lastHour?.obstructionAvgPct ?? 0) > 1 ? "warn" : "ok"
                  }
                  hint={minMaxHint(
                    lastHour?.obstructionMinPct,
                    lastHour?.obstructionMaxPct,
                    "%",
                    2,
                  )}
                />
              </>
            )}
          </div>
          )}
        </Card>

        <Card className="lg:col-span-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Konum</h2>
            </div>
            {location?.lastSeenAt && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {formatDate(location.lastSeenAt)}
              </span>
            )}
          </div>
          <div className="relative h-[260px] bg-secondary">
            {locationLoading ? (
              <Skeleton className="absolute inset-0" />
            ) : location?.lat != null && location?.lng != null ? (
              <>
                <Suspense
                  fallback={<div className="absolute inset-0 bg-secondary" />}
                >
                  <TerminalMap
                    lat={location.lat}
                    lng={location.lng}
                    zoom={3}
                    online={locActive}
                  />
                </Suspense>
                <div className="absolute top-2 left-2 z-[400]">
                  <Pill tone={locActive ? "ok" : "neutral"}>
                    {locActive ? "Çevrimiçi" : "Çevrimdışı"}
                  </Pill>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-card/90 backdrop-blur-sm border-t border-border flex justify-between text-[11px] font-mono z-[400] pointer-events-none">
                  <span>
                    <span className="text-muted-foreground">lat</span>{" "}
                    {location.lat.toFixed(4)}
                  </span>
                  <span>
                    <span className="text-muted-foreground">lng</span>{" "}
                    {location.lng.toFixed(4)}
                  </span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 mr-1.5 opacity-50" />
                Konum bilgisi yok.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Plan & Quota */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              {hasPlanInfo ? "Plan ve Kota" : "Dönem Kullanımı"}
            </h2>
            <Pill tone="info">{periodLabel}</Pill>
          </div>
          {planName && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {planName}
            </span>
          )}
        </div>
        <div className="p-6">
          {detailLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !hasPlanInfo ? (
            <div className="flex flex-col gap-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Bu Dönem Kullanım
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-5xl tracking-tight tabular-nums">
                  {formatNumber(used, 1)}
                </span>
                <span className="text-sm text-muted-foreground">GiB</span>
                <span className="ml-3 text-[11px] font-mono text-muted-foreground">
                  · {detail?.rowCount ?? 0} CDR satırı
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Plan tahsisi ve eşik bilgileri portal detay sayfasından henüz
                alınmadı — yalnızca tüketim gösteriliyor.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                  Bu Dönem Kullanım
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-5xl tracking-tight tabular-nums">
                    {formatNumber(used, 1)}
                  </span>
                  <span className="text-sm text-muted-foreground">GiB</span>
                  {allowance != null && (
                    <span className="ml-2 text-sm font-mono text-muted-foreground">
                      / {formatNumber(allowance, 0)} GiB
                    </span>
                  )}
                </div>
                {usedPct != null && (
                  <div className="mt-4">
                    <div className="relative h-2.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
                          usedPct > 90
                            ? "bg-[#f54e00]"
                            : usedPct > 75
                              ? "bg-[#dfa88f]"
                              : "bg-foreground"
                        }`}
                        style={{ width: `${Math.min(usedPct, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>%{formatNumber(usedPct, 1)} dolu</span>
                      {allowance != null && (
                        <span>
                          %{formatNumber(100 - Math.min(usedPct, 100), 1)} boş
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 grid grid-cols-3 gap-3">
                <QuotaStat
                  label="Kullanılan"
                  value={formatNumber(used, 1)}
                  unit="GiB"
                  tone="primary"
                />
                <QuotaStat
                  label="Opt-Out Eşiği"
                  value={
                    optOutGib != null ? formatNumber(optOutGib, 0) : "—"
                  }
                  unit={optOutGib != null ? "GiB" : undefined}
                  tone={
                    remaining != null &&
                    allowance != null &&
                    remaining / allowance < 0.1
                      ? "warn"
                      : "ok"
                  }
                />
                <QuotaStat
                  label="Adım Uyarısı"
                  value={
                    stepAlertGib != null
                      ? formatNumber(stepAlertGib, 0)
                      : "—"
                  }
                  unit={stepAlertGib != null ? "GiB" : undefined}
                  tone="muted"
                />
              </div>

              {allowance == null && (
                <div className="lg:col-span-12 text-xs text-muted-foreground">
                  Plan tahsisi bilinmiyor — sadece kullanım gösteriliyor.
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Hourly trend sparklines (last 7 days) */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">
            Saatlik Trend (Son 7 Gün)
          </h2>
        </div>
        {telemetryWeekLoading ? (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (telemetryWeek ?? []).length === 0 ? (
          <div className="m-4 text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            Saatlik telemetri henüz toplanmadı.
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                key: "download",
                label: "İndirme",
                unit: "Mbps",
                series: sparkSeries.download,
                icon: <Download className="w-3 h-3" />,
                decimals: 1,
              },
              {
                key: "upload",
                label: "Yükleme",
                unit: "Mbps",
                series: sparkSeries.upload,
                icon: <Upload className="w-3 h-3" />,
                decimals: 1,
              },
              {
                key: "latency",
                label: "Gecikme",
                unit: "ms",
                series: sparkSeries.latency,
                icon: <Activity className="w-3 h-3" />,
                decimals: 0,
              },
              {
                key: "pingDrop",
                label: "Paket Kaybı",
                unit: "%",
                series: sparkSeries.pingDrop,
                icon: <TrendingUp className="w-3 h-3" />,
                decimals: 2,
              },
              {
                key: "obstruction",
                label: "Engel",
                unit: "%",
                series: sparkSeries.obstruction,
                icon: <Signal className="w-3 h-3" />,
                decimals: 2,
              },
              {
                key: "signal",
                label: "Sinyal",
                unit: "%",
                series: sparkSeries.signal,
                icon: <Gauge className="w-3 h-3" />,
                decimals: 0,
              },
            ].map((m) => (
              <div
                key={m.key}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  <span className="flex items-center gap-1">
                    {m.icon}
                    {m.label}
                  </span>
                  <span className="font-mono normal-case text-[10px] text-muted-foreground tracking-normal">
                    {m.unit}
                  </span>
                </div>
                <MiniSparkline
                  data={m.series}
                  unit={m.unit}
                  decimals={m.decimals}
                  gradientId={`ssa-spark-${m.key}`}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Daily breakdown */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              Günlük Tüketim
            </h2>
            <Pill>{periodLabel}</Pill>
          </div>
          {periodOptions.length > 0 && (
            <select
              aria-label="Dönem seçimi"
              value={activePeriod ?? undefined}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="h-8 px-2 rounded border border-border bg-card font-mono text-[11px] text-foreground"
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="p-4 h-56">
          {dailyLoading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Bu dönem için kayıt bulunamadı.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="ssa-satcom-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f54e00" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f54e00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#e6e5e0"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="#a8a79e"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e6e5e0" }}
                />
                <YAxis
                  stroke="#9fbbe0"
                  tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fffefb",
                    border: "1px solid #e6e5e0",
                    borderRadius: 6,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [
                    `${formatNumber(v, 2)} GiB`,
                    "Veri",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="gib"
                  stroke="#f54e00"
                  strokeWidth={2}
                  fill="url(#ssa-satcom-grad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Subscription history — sadece veri varsa göster */}
      {hasSubscriptions && (
        <Card>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              Abonelik Geçmişi
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground">
              {(subscriptions ?? []).length} kayıt
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="h-9 pl-4 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Plan
                  </th>
                  <th className="h-9 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Başlama
                  </th>
                  <th className="h-9 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Bitiş
                  </th>
                  <th className="h-9 pr-4 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Müşteri
                  </th>
                </tr>
              </thead>
              <tbody>
                {(subscriptions ?? []).map((s) => (
                  <tr
                    key={s.subscriptionId}
                    className="border-t border-border h-11 hover:bg-secondary/40"
                  >
                    <td className="pl-4 font-mono text-foreground">
                      {s.pricePlanName ?? "—"}
                    </td>
                    <td className="font-mono">{s.startDate ?? "—"}</td>
                    <td className="font-mono">{s.endDate ?? "—"}</td>
                    <td className="pr-4 truncate max-w-[220px]">
                      {s.customerName ?? s.customerId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Monthly summary */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Aylık Özet</h2>
        </div>
        {monthlyLoading ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !monthly || monthly.length === 0 ? (
          <div className="m-4 text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            Henüz aylık veri yok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="h-9 pl-4 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Dönem
                  </th>
                  <th className="h-9 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Toplam GiB
                  </th>
                  <th className="h-9 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Satır
                  </th>
                  <th className="h-9 pr-4 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Tarama
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr
                    key={row.period}
                    className="border-t border-border h-11 hover:bg-secondary/40 cursor-pointer"
                    onClick={() => setSelectedPeriod(row.period)}
                  >
                    <td className="pl-4 font-mono">
                      {formatPeriodLabel(row.period)}
                    </td>
                    <td className="text-right font-mono">
                      {formatNumber(row.totalGib, 2)}
                    </td>
                    <td className="text-right font-mono">{row.rowCount}</td>
                    <td className="text-right pr-4 font-mono text-[11px] text-muted-foreground">
                      {row.scrapedAt ? formatDate(row.scrapedAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
