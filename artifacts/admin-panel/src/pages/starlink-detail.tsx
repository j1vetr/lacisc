import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetStarlinkTerminalDetail,
  getGetStarlinkTerminalDetailQueryKey,
  useGetStarlinkTerminalDaily,
  getGetStarlinkTerminalDailyQueryKey,
  useGetStarlinkTerminalMonthly,
  getGetStarlinkTerminalMonthlyQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Satellite,
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
  Eye,
  Signal,
  TrendingUp,
  ShieldAlert,
  Radio,
  Compass,
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

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card ${className}`}
    >
      {children}
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-secondary text-muted-foreground border-border",
    ok: "bg-[#9fc9a2]/30 text-foreground border-[#9fc9a2]",
    warn: "bg-[#dfa88f]/30 text-foreground border-[#dfa88f]",
    info: "bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-widest border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function MetricTile({
  label,
  value,
  unit,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "info";
}) {
  const accents: Record<string, string> = {
    neutral: "border-l-border",
    ok: "border-l-[#9fc9a2]",
    warn: "border-l-[#dfa88f]",
    info: "border-l-[#9fbbe0]",
  };
  return (
    <div
      className={`rounded-lg border border-border border-l-2 ${accents[tone]} bg-card px-3 py-2.5`}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-base text-foreground">{value}</span>
        {unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export default function StarlinkDetail({ kit }: { kit: string }) {
  useDocumentTitle(kit);

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  const { data: detail, isLoading: detailLoading } = useGetStarlinkTerminalDetail(
    kit,
    {
      query: {
        queryKey: getGetStarlinkTerminalDetailQueryKey(kit),
        enabled: Boolean(kit),
      },
    }
  );
  const { data: monthly, isLoading: monthlyLoading } = useGetStarlinkTerminalMonthly(
    kit,
    {
      query: {
        queryKey: getGetStarlinkTerminalMonthlyQueryKey(kit),
        enabled: Boolean(kit),
      },
    }
  );

  const dailyParams = selectedPeriod ? { period: selectedPeriod } : {};
  const { data: daily, isLoading: dailyLoading } = useGetStarlinkTerminalDaily(
    kit,
    dailyParams,
    {
      query: {
        queryKey: getGetStarlinkTerminalDailyQueryKey(kit, dailyParams),
        enabled: Boolean(kit),
      },
    }
  );

  const activePeriod = selectedPeriod ?? detail?.currentPeriod ?? null;
  const periodLabel = formatPeriodLabel(activePeriod);

  const chartData = useMemo(
    () =>
      (daily ?? []).map((r) => ({
        day: formatDay(r.dayDate),
        gib: r.deltaPackageGb ?? 0,
      })),
    [daily]
  );

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  const shipName = detail?.nickname || detail?.assetName || "—";
  const planAllowance =
    typeof detail?.planAllowanceGb === "number" ? detail.planAllowanceGb : null;
  const used = detail?.currentPeriodTotalGb ?? 0;
  const remaining = planAllowance != null ? Math.max(planAllowance - used, 0) : null;
  const usedPct = planAllowance && planAllowance > 0 ? (used / planAllowance) * 100 : null;
  const ipv4 = detail?.ipv4 ?? undefined;
  const plan = detail?.plan ?? undefined;
  const optIn = Boolean(detail?.optIn);
  const pingDropRate = detail?.pingDropRate ?? undefined;

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
          <Satellite className="w-4 h-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg tracking-tight truncate min-w-0">
            {detailLoading ? <Skeleton className="h-5 w-40 inline-block align-middle" /> : shipName}
          </h1>
          <span className="font-mono text-xs sm:text-sm text-muted-foreground truncate">
            {kit}
          </span>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <Pill tone="info">Tototheo</Pill>
            {!detailLoading && (
              <Pill tone={detail?.isOnline ? "ok" : "warn"}>
                {detail?.isOnline ? (
                  <>
                    <Wifi className="w-2.5 h-2.5" /> Online
                  </>
                ) : (
                  <>
                    <WifiOff className="w-2.5 h-2.5" /> Offline
                  </>
                )}
              </Pill>
            )}
            {optIn && <Pill>Opt-In</Pill>}
          </div>
        </div>
        <div className="px-4 sm:px-5 py-2 flex items-center gap-4 sm:gap-6 text-[11px] font-mono text-muted-foreground flex-wrap">
          {plan && (
            <span>
              <span className="text-foreground">{plan}</span>
            </span>
          )}
          {ipv4 && (
            <span>
              IPv4 <span className="text-foreground">{ipv4}</span>
            </span>
          )}
          {detail?.updatedAt && (
            <span className="ml-auto flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Son sync {formatDate(detail.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Top row: Live telemetry (8) + Map (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Canlı Telemetri</h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              Tototheo portalından
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {detailLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] rounded-lg" />
              ))
            ) : (
              <>
                <MetricTile
                  label="Sinyal"
                  value={
                    detail?.signalQuality != null
                      ? formatNumber(detail.signalQuality * 100, 0)
                      : "—"
                  }
                  unit="%"
                  icon={<Gauge className="w-3 h-3" />}
                  tone={(detail?.signalQuality ?? 0) >= 0.8 ? "ok" : "neutral"}
                />
                <MetricTile
                  label="Gecikme"
                  value={detail?.latency != null ? detail.latency : "—"}
                  unit="ms"
                  icon={<Activity className="w-3 h-3" />}
                  tone={(detail?.latency ?? 999) < 80 ? "ok" : "neutral"}
                />
                <MetricTile
                  label="Ping Drop"
                  value={
                    pingDropRate != null ? formatNumber(pingDropRate * 100, 2) : "—"
                  }
                  unit="%"
                  icon={<TrendingUp className="w-3 h-3" />}
                />
                <MetricTile
                  label="Engellenme"
                  value={
                    detail?.obstruction != null
                      ? formatNumber(detail.obstruction * 100, 2)
                      : "—"
                  }
                  unit="%"
                  icon={<Eye className="w-3 h-3" />}
                />
                <MetricTile
                  label="İndirme"
                  value={
                    detail?.downloadSpeed != null
                      ? formatNumber(detail.downloadSpeed, 1)
                      : "—"
                  }
                  unit="Mbps"
                  icon={<Download className="w-3 h-3" />}
                />
                <MetricTile
                  label="Yükleme"
                  value={
                    detail?.uploadSpeed != null
                      ? formatNumber(detail.uploadSpeed, 1)
                      : "—"
                  }
                  unit="Mbps"
                  icon={<Upload className="w-3 h-3" />}
                />
                <MetricTile
                  label="Aktif Uyarı"
                  value={String(detail?.activeAlertsCount ?? 0)}
                  icon={<ShieldAlert className="w-3 h-3" />}
                  tone={(detail?.activeAlertsCount ?? 0) > 0 ? "warn" : "neutral"}
                />
                <MetricTile
                  label="Engel Yok"
                  value={
                    detail?.obstruction != null
                      ? formatNumber((1 - detail.obstruction) * 100, 1)
                      : "—"
                  }
                  unit="%"
                  icon={<Signal className="w-3 h-3" />}
                  tone="ok"
                />
              </>
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
          <div className="relative h-[214px] bg-gradient-to-br from-[#dde9f7] to-secondary">
            {detailLoading ? (
              <Skeleton className="absolute inset-0" />
            ) : detail?.lat != null && detail?.lng != null ? (
              <>
                <svg className="absolute inset-0 w-full h-full opacity-40">
                  <defs>
                    <pattern id="ssa-map-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                      <path
                        d="M 24 0 L 0 0 0 24"
                        fill="none"
                        stroke="#9fbbe0"
                        strokeWidth="0.5"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#ssa-map-grid)" />
                </svg>
                <div className="absolute" style={{ left: "50%", top: "44%" }}>
                  <div className="relative">
                    <div className="absolute -inset-3 rounded-full bg-[#f54e00]/20 animate-pulse" />
                    <MapPin className="w-6 h-6 text-[#f54e00] fill-[#f54e00] relative" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-card/90 border-t border-border flex justify-between text-[11px] font-mono">
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
                Konum bilgisi yok.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Plan & Quota — full width */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Plan ve Kota</h2>
            <Pill tone="info">{periodLabel}</Pill>
          </div>
          {plan && (
            <span className="text-[10px] font-mono text-muted-foreground">{plan}</span>
          )}
        </div>
        <div className="p-4 space-y-4">
          {detailLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Kullanılan
                  </div>
                  <div className="font-mono text-3xl mt-0.5">
                    {formatNumber(used, 1)}{" "}
                    <span className="text-sm text-muted-foreground">GB</span>
                  </div>
                </div>
                {remaining != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Kalan
                    </div>
                    <div className="font-mono text-2xl mt-0.5">
                      {formatNumber(remaining, 1)}{" "}
                      <span className="text-sm text-muted-foreground">GB</span>
                    </div>
                  </div>
                )}
                {planAllowance != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Tahsis
                    </div>
                    <div className="font-mono text-2xl mt-0.5 text-muted-foreground">
                      {formatNumber(planAllowance, 0)}{" "}
                      <span className="text-sm">GB</span>
                    </div>
                  </div>
                )}
                {usedPct != null && (
                  <div className="ml-auto text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Doluluk
                    </div>
                    <div
                      className={`font-mono text-3xl mt-0.5 ${usedPct > 80 ? "text-[#dfa88f]" : ""}`}
                    >
                      {formatNumber(usedPct, 1)}%
                    </div>
                  </div>
                )}
              </div>
              {usedPct != null && planAllowance != null && (
                <>
                  <div className="relative h-3 bg-secondary rounded-sm overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-300"
                      style={{ width: `${Math.min(usedPct, 100)}%` }}
                    />
                    {[25, 50, 75].map((p) => (
                      <div
                        key={p}
                        className="absolute inset-y-0 w-px bg-card/40"
                        style={{ left: `${p}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                    <span>0</span>
                    <span>{formatNumber(planAllowance * 0.25, 0)}</span>
                    <span>{formatNumber(planAllowance * 0.5, 0)}</span>
                    <span>{formatNumber(planAllowance * 0.75, 0)}</span>
                    <span>{formatNumber(planAllowance, 0)} GB</span>
                  </div>
                </>
              )}
              {planAllowance == null && (
                <div className="text-xs text-muted-foreground">
                  Plan tahsisi bilinmiyor — sadece kullanım gösteriliyor.
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Daily breakdown */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Günlük Tüketim</h2>
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
                  <linearGradient id="ssa-starlink-grad" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#ssa-starlink-grad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Monthly history with inline progress */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Aylık Geçmiş</h2>
            <span className="text-[10px] text-muted-foreground font-mono">
              poolPlanMonthlyUsage
            </span>
          </div>
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
                    { label: "Dönem", align: "left", pad: "pl-4" },
                    { label: "Toplam", align: "right" },
                    { label: "Paket", align: "right" },
                    { label: "Öncelik", align: "right" },
                    { label: "Aşım", align: "right" },
                    { label: "Doluluk", align: "left" },
                    { label: "Tarama", align: "right", pad: "pr-4" },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`h-9 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-${h.align} ${h.pad ?? ""}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => {
                  const fill =
                    planAllowance && planAllowance > 0 && r.totalGb != null
                      ? Math.min((r.totalGb / planAllowance) * 100, 100)
                      : null;
                  return (
                    <tr
                      key={r.period}
                      className="border-t border-border h-11 hover:bg-secondary/40 cursor-pointer"
                      onClick={() => setSelectedPeriod(r.period)}
                    >
                      <td className="pl-4 font-mono">{formatPeriodLabel(r.period)}</td>
                      <td className="text-right font-mono">
                        {formatNumber(r.totalGb, 1)} GB
                      </td>
                      <td className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatNumber(r.packageUsageGb, 1)}
                      </td>
                      <td className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatNumber(r.priorityGb, 1)}
                      </td>
                      <td className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatNumber(r.overageGb, 1)}
                      </td>
                      <td>
                        {fill != null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-secondary rounded-sm overflow-hidden max-w-[140px]">
                              <div
                                className="h-full bg-foreground"
                                style={{ width: `${fill}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
                              {formatNumber(fill, 0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right pr-4 font-mono text-[11px] text-muted-foreground">
                        {r.scrapedAt ? formatDate(r.scrapedAt) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
