import { useMemo, useState, lazy, Suspense } from "react";
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
  Clock,
  Compass,
  Zap,
  Gauge,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const TerminalMap = lazy(() => import("@/components/terminal-map"));

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useIsCustomer } from "@/hooks/use-is-customer";
import { Card, Pill } from "@/components/kit-detail/primitives";

function formatPeriodLabel(period?: string | null) {
  if (!period) return "—";
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

function fmtCoord(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

export default function NorwayDetail({ kit }: { kit: string }) {
  useDocumentTitle(kit);
  const isCustomer = useIsCustomer();

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(
    undefined,
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
    },
  );

  const periodLabel = formatPeriodLabel(activePeriod);

  const dailyChart = useMemo(
    () =>
      (daily ?? []).map((r) => ({
        day: formatDay(r.dayDate),
        priority: r.priorityGb ?? 0,
        standard: r.standardGb ?? 0,
        total: r.totalGb ?? 0,
      })),
    [daily],
  );

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    if (detail?.currentPeriod) set.add(detail.currentPeriod);
    (monthly ?? []).forEach((m) => m.period && set.add(m.period));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [monthly, detail?.currentPeriod]);

  const monthlyChart = useMemo(
    () =>
      (monthly ?? [])
        .slice()
        .sort((a, b) => (a.period < b.period ? -1 : 1))
        .map((m) => ({
          period: m.period ?? "",
          label: formatPeriodLabel(m.period),
          total: m.totalGb ?? 0,
          priority: m.priorityGb ?? 0,
          standard: m.standardGb ?? 0,
        })),
    [monthly],
  );

  const shipName = detail?.nickname || "—";
  const total = detail?.currentPeriodTotalGb ?? 0;
  const priority = detail?.currentPeriodPriorityGb ?? 0;
  const standard = detail?.currentPeriodStandardGb ?? 0;
  // Aktif fatura döngüsü kotası (recurring data block toplamı, decimal GB).
  // Tototheo `planAllowanceGB` muadili — varsa kullanım/kota progress.
  const planAllowanceGb = detail?.planAllowanceGb ?? null;
  const usedPct =
    planAllowanceGb && planAllowanceGb > 0
      ? Math.min((total / planAllowanceGb) * 100, 100)
      : null;
  const remainingGb =
    planAllowanceGb != null ? Math.max(planAllowanceGb - total, 0) : null;
  const priorityPct =
    total > 0 ? Math.round((priority / total) * 100) : 0;

  const content = (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Header — Norway-tailored: name + KIT + source/account/online status */}
      <div className="rounded-lg border border-border bg-card sticky top-0 z-20 shadow-[0_1px_0_0_hsl(var(--border))]">
        <div className="px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 border-b border-border flex-wrap">
          {!isCustomer && (
            <>
              <Link href="/kits">
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Terminaller
                </div>
              </Link>
              <span className="text-border">/</span>
            </>
          )}
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
          {detail?.lastSeenAt && (
            <span className="ml-auto flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-3 h-3" /> SON SENKRON:{" "}
              {formatDate(detail.lastSeenAt)}
            </span>
          )}
        </div>
      </div>

      {/* Top: usage hero (col-7) + Map (col-5). No plan, no price, no address. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-7">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              Bu Dönem Kullanım
            </h2>
            <Pill tone="info">{periodLabel}</Pill>
          </div>
          <div className="px-5 py-6">
            {detailLoading ? (
              <Skeleton className="h-20 w-2/3" />
            ) : (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-mono text-[56px] leading-none tracking-tight tabular-nums">
                  {formatNumber(total, 1)}
                </span>
                <span className="text-base text-muted-foreground">GB</span>
                {planAllowanceGb != null && (
                  <span className="text-sm font-mono text-muted-foreground">
                    / {formatNumber(planAllowanceGb, 0)} GB
                  </span>
                )}
              </div>
            )}

            {/* Kullanım / Kota progress — yalnızca recurring data block toplamı varsa. */}
            {!detailLoading && planAllowanceGb != null && (
              <div className="mt-5">
                <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 bg-[#f54e00]"
                    style={{ width: `${usedPct ?? 0}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span>%{formatNumber(usedPct ?? 0, 1)} dolu</span>
                  {remainingGb != null && (
                    <span>
                      {formatNumber(remainingGb, 1)} GB kalan
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Priority / Standard split */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
                  <Zap className="w-3 h-3" />
                  Öncelikli
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-2xl tabular-nums">
                    {detailLoading ? "—" : formatNumber(priority, 1)}
                  </span>
                  <span className="text-xs text-muted-foreground">GB</span>
                  {!detailLoading && total > 0 && (
                    <span className="ml-2 text-[11px] font-mono text-muted-foreground">
                      %{priorityPct}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
                  <Gauge className="w-3 h-3" />
                  Standart
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-2xl tabular-nums">
                    {detailLoading ? "—" : formatNumber(standard, 1)}
                  </span>
                  <span className="text-xs text-muted-foreground">GB</span>
                  {!detailLoading && total > 0 && (
                    <span className="ml-2 text-[11px] font-mono text-muted-foreground">
                      %{Math.max(0, 100 - priorityPct)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stacked composition bar */}
            {!detailLoading && total > 0 && (
              <div className="mt-5">
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-[#f54e00]"
                    style={{ width: `${priorityPct}%` }}
                    title={`Öncelikli ${formatNumber(priority, 1)} GB`}
                  />
                  <div
                    className="h-full bg-[#c4c2bc]"
                    style={{ width: `${Math.max(0, 100 - priorityPct)}%` }}
                    title={`Standart ${formatNumber(standard, 1)} GB`}
                  />
                </div>
                <div className="mt-2 flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-[#f54e00]" />
                    Öncelikli
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-[#c4c2bc]" />
                    Standart
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-5 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Konum</h2>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {fmtCoord(detail?.lat)} , {fmtCoord(detail?.lng)}
            </span>
          </div>
          <div className="relative flex-1 min-h-[280px] bg-secondary">
            {detailLoading ? (
              <Skeleton className="absolute inset-0" />
            ) : detail?.lat != null && detail?.lng != null ? (
              <Suspense
                fallback={<div className="absolute inset-0 bg-secondary" />}
              >
                <TerminalMap lat={detail.lat} lng={detail.lng} zoom={4} />
              </Suspense>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                <Compass className="w-3.5 h-3.5 mr-1.5 opacity-50" />
                Konum bilgisi yok.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Daily breakdown — area chart (priority + standard stacked totals shown as 'total' line) */}
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
        <div className="p-4 h-64">
          {dailyLoading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : dailyChart.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Bu dönem için günlük okuma yok.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyChart}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid
                  stroke="#e6e5e0"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="#a8a79e"
                  tick={{
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "#e6e5e0" }}
                />
                <YAxis
                  stroke="#a8a79e"
                  tick={{
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--background, #fffefb)",
                    border: "1px solid #e6e5e0",
                    borderRadius: 6,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                  }}
                  formatter={(v: number, name) => [
                    `${formatNumber(v, 2)} GB`,
                    name === "priority"
                      ? "Öncelikli"
                      : name === "standard"
                        ? "Standart"
                        : "Toplam",
                  ]}
                />
                <Bar
                  stackId="1"
                  dataKey="priority"
                  fill="#f54e00"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  stackId="1"
                  dataKey="standard"
                  fill="#c4c2bc"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Monthly history — bar chart + compact table side-by-side on lg */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              Aylık Geçmiş
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {monthlyChart.length} dönem
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          <div className="lg:col-span-7 p-4 border-b lg:border-b-0 lg:border-r border-border h-56">
            {monthlyLoading ? (
              <Skeleton className="h-full w-full" />
            ) : monthlyChart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Henüz aylık veri yok.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChart}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e6e5e0"
                    vertical={false}
                  />
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
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--background, #fff)",
                      border: "1px solid #e6e5e0",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [
                      `${formatNumber(v, 2)} GB`,
                      "Toplam",
                    ]}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {monthlyChart.map((m) => (
                      <Cell
                        key={m.period}
                        fill={
                          m.period === activePeriod ? "#f54e00" : "#dfa88f"
                        }
                        cursor="pointer"
                        onClick={() => setSelectedPeriod(m.period)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="lg:col-span-5 overflow-x-auto">
            {monthlyLoading ? (
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !monthly || monthly.length === 0 ? (
              <div className="m-4 text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                Henüz aylık veri yok.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-secondary/40">
                  <tr>
                    {[
                      { label: "Dönem", alignClass: "text-left", pad: "pl-4" },
                      { label: "Öncelikli", alignClass: "text-right" },
                      { label: "Standart", alignClass: "text-right" },
                      {
                        label: "Toplam",
                        alignClass: "text-right",
                        pad: "pr-4",
                      },
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
                  {monthly.map((r) => {
                    const active = r.period === activePeriod;
                    return (
                      <tr
                        key={r.period}
                        className={`border-t border-border h-11 cursor-pointer transition-colors ${active ? "bg-secondary/60" : "hover:bg-secondary/40"}`}
                        onClick={() =>
                          r.period && setSelectedPeriod(r.period)
                        }
                      >
                        <td className="pl-4 font-mono">
                          {formatPeriodLabel(r.period)}
                        </td>
                        <td className="text-right font-mono">
                          {formatNumber(r.priorityGb, 1)}
                        </td>
                        <td className="text-right font-mono">
                          {formatNumber(r.standardGb, 1)}
                        </td>
                        <td className="text-right pr-4 font-mono font-semibold">
                          {formatNumber(r.totalGb, 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>
    </div>
  );

  if (isCustomer) {
    return (
      <div className="py-6 px-4 sm:py-8 sm:px-6 lg:py-10 lg:px-10 max-w-[1200px] mx-auto w-full">
        {content}
      </div>
    );
  }
  return content;
}
