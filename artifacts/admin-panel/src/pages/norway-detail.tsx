import React, { useMemo, useState, lazy, Suspense } from "react";

const TerminalMap = lazy(() => import("@/components/terminal-map"));
import { Link } from "wouter";
import {
  useGetLeobridgeTerminalDetail,
  getGetLeobridgeTerminalDetailQueryKey,
  useGetLeobridgeTerminalDaily,
  getGetLeobridgeTerminalDailyQueryKey,
  useGetLeobridgeTerminalMonthly,
  getGetLeobridgeTerminalMonthlyQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Globe,
  CalendarClock,
  Activity,
  Wifi,
  WifiOff,
  MapPin,
  Clock,
  Compass,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Card, Pill } from "@/components/kit-detail/primitives";

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

export default function NorwayDetail({ kit }: { kit: string }) {
  useDocumentTitle(kit);

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(
    undefined
  );

  const { data: detail, isLoading: detailLoading } =
    useGetLeobridgeTerminalDetail(kit, {
      query: {
        queryKey: getGetLeobridgeTerminalDetailQueryKey(kit),
        enabled: Boolean(kit),
      },
    });
  const { data: monthly, isLoading: monthlyLoading } =
    useGetLeobridgeTerminalMonthly(kit, {
      query: {
        queryKey: getGetLeobridgeTerminalMonthlyQueryKey(kit),
        enabled: Boolean(kit),
      },
    });

  const activePeriod = selectedPeriod ?? detail?.currentPeriod ?? null;
  const dailyParams = activePeriod ? { period: activePeriod } : {};
  const { data: daily, isLoading: dailyLoading } = useGetLeobridgeTerminalDaily(
    kit,
    dailyParams,
    {
      query: {
        queryKey: getGetLeobridgeTerminalDailyQueryKey(kit, dailyParams),
        enabled: Boolean(kit) && Boolean(activePeriod),
      },
    }
  );

  const periodLabel = formatPeriodLabel(activePeriod);

  const chartData = useMemo(
    () =>
      (daily ?? []).map((r) => ({
        day: formatDay(r.dayDate),
        gib: r.totalGb ?? 0,
      })),
    [daily]
  );

  // Last 6 months of monthly history with zero-fill for missing periods so
  // the bar chart always shows a stable 6-bucket axis (parity with required
  // monthly visualization spec).
  const monthlyChart = useMemo(() => {
    const byPeriod = new Map<string, number>();
    for (const m of monthly ?? []) {
      if (m.period) byPeriod.set(m.period, m.totalGb ?? 0);
    }
    const out: { period: string; label: string; gib: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const period = `${yyyy}${mm}`;
      out.push({
        period,
        label: `${mm}/${yyyy}`,
        gib: byPeriod.get(period) ?? 0,
      });
    }
    return out;
  }, [monthly]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  const shipName = detail?.nickname || "—";
  const used = detail?.currentPeriodTotalGb ?? 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Sticky dense header — same shape as Tototheo, but plan/ipv4 omitted */}
      <div className="rounded-lg border border-border bg-card sticky top-0 z-20 shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 border-b border-border flex-wrap">
          <Link href="/kits">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Terminaller
            </div>
          </Link>
          <span className="text-border">/</span>
          <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg tracking-tight truncate min-w-0">
            {detailLoading ? (
              <Skeleton className="h-5 w-40 inline-block align-middle" />
            ) : (
              shipName
            )}
          </h1>
          <span className="font-mono text-xs sm:text-sm text-muted-foreground truncate">
            {kit}
          </span>
          <Pill tone="info">Norway</Pill>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {!detailLoading && (
              <Pill tone={detail?.isOnline ? "ok" : "warn"}>
                {detail?.isOnline ? (
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
          </div>
        </div>
        <div className="px-4 sm:px-5 py-2 flex items-center gap-4 sm:gap-6 text-[11px] font-mono text-muted-foreground flex-wrap">
          {detail?.serviceLineNumber && (
            <span>
              <span className="text-muted-foreground">Servis Hattı:</span>{" "}
              <span className="text-foreground">{detail.serviceLineNumber}</span>
            </span>
          )}
          {detail?.updatedAt && (
            <span className="ml-auto flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Son Bağlantı{" "}
              {formatDate(detail.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Top row: usage hero (8) + Map (4) — no plan / no price */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">
                Bu Dönem Kullanım
              </h2>
              <Pill tone="info">{periodLabel}</Pill>
            </div>
          </div>
          <div className="p-6">
            {detailLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-5xl tracking-tight tabular-nums">
                  {formatNumber(used, 1)}
                </span>
                <span className="text-sm text-muted-foreground">GB</span>
                {detail?.currentPeriodPriorityGb != null && (
                  <span className="ml-4 text-xs font-mono text-muted-foreground">
                    Öncelikli: {formatNumber(detail.currentPeriodPriorityGb, 1)} GB
                  </span>
                )}
                {detail?.currentPeriodStandardGb != null && (
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    Standart: {formatNumber(detail.currentPeriodStandardGb, 1)} GB
                  </span>
                )}
              </div>
            )}
            {detail?.addressLabel && (
              <div className="mt-4 text-[12px] text-muted-foreground flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{detail.addressLabel}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Konum</h2>
            </div>
            {detail?.lastSeenAt && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {formatDate(detail.lastSeenAt)}
              </span>
            )}
          </div>
          <div className="relative h-[260px] bg-secondary">
            {detailLoading ? (
              <Skeleton className="absolute inset-0" />
            ) : detail?.lat != null && detail?.lng != null ? (
              <>
                <Suspense
                  fallback={<div className="absolute inset-0 bg-secondary" />}
                >
                  <TerminalMap lat={detail.lat} lng={detail.lng} zoom={3} />
                </Suspense>
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-card/90 backdrop-blur-sm border-t border-border flex justify-between text-[11px] font-mono z-[400] pointer-events-none">
                  <span>
                    <span className="text-muted-foreground">lat</span>{" "}
                    {detail.lat.toFixed(4)}
                  </span>
                  <span>
                    <span className="text-muted-foreground">lng</span>{" "}
                    {detail.lng.toFixed(4)}
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
              Bu dönem için günlük okuma yok.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="ssa-norway-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f54e00" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f54e00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e6e5e0" strokeDasharray="2 4" vertical={false} />
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
                  formatter={(v: number) => [`${formatNumber(v, 2)} GB`, "Veri"]}
                />
                <Area
                  type="monotone"
                  dataKey="gib"
                  stroke="#f54e00"
                  strokeWidth={2}
                  fill="url(#ssa-norway-grad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Monthly history */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Aylık Geçmiş</h2>
          </div>
        </div>
        <div className="p-4 border-b border-border">
          {monthlyLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e5e0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#7a7869" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e6e5e0" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#7a7869" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e6e5e0",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${formatNumber(v, 2)} GB`, "Toplam"]}
                />
                <Bar dataKey="gib" fill="#f54e00" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
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
            <table className="w-full text-[12px] min-w-[640px]">
              <thead className="bg-secondary/40">
                <tr>
                  {[
                    { label: "Dönem", alignClass: "text-left", pad: "pl-4" },
                    { label: "Toplam", alignClass: "text-right" },
                    { label: "Öncelikli", alignClass: "text-right" },
                    { label: "Standart", alignClass: "text-right" },
                    { label: "Tarama", alignClass: "text-right", pad: "pr-4" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`h-9 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold ${h.alignClass} ${h.pad ?? ""}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => (
                  <tr
                    key={r.period}
                    className="border-t border-border h-11 hover:bg-secondary/40 cursor-pointer"
                    onClick={() => setSelectedPeriod(r.period)}
                  >
                    <td className="pl-4 font-mono">{formatPeriodLabel(r.period)}</td>
                    <td className="text-right font-mono">
                      {formatNumber(r.totalGb, 1)} GB
                    </td>
                    <td className="text-right font-mono">
                      {formatNumber(r.priorityGb, 1)}{" "}
                      <span className="text-[11px] text-muted-foreground">GB</span>
                    </td>
                    <td className="text-right font-mono">
                      {formatNumber(r.standardGb, 1)}{" "}
                      <span className="text-[11px] text-muted-foreground">GB</span>
                    </td>
                    <td className="text-right pr-4 font-mono text-[11px] text-muted-foreground">
                      {r.scrapedAt ? formatDate(r.scrapedAt) : "-"}
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
