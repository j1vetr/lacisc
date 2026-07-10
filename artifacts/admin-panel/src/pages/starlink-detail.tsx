import React, { useMemo, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const TerminalMap = lazy(() => import("@/components/terminal-map"));
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStarlinkTerminalDetail,
  getGetStarlinkTerminalDetailQueryKey,
  useGetStarlinkTerminalDaily,
  getGetStarlinkTerminalDailyQueryKey,
  useGetStarlinkTerminalMonthly,
  getGetStarlinkTerminalMonthlyQueryKey,
  useUpdateStarlinkTerminalManualPlan,
  useGetMe,
  getGetMeQueryKey,
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
import { useIsCustomer } from "@/hooks/use-is-customer";
import {
  Card,
  Pill,
  QuotaStat,
  MetricTile,
} from "@/components/kit-detail/primitives";

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

export default function StarlinkDetail({ kit }: { kit: string }) {
  const { t } = useTranslation();
  useDocumentTitle(kit);
  const isCustomer = useIsCustomer();
  const queryClient = useQueryClient();

  const { data: meData } = useGetMe({ query: { queryKey: getGetMeQueryKey(), staleTime: 60_000, retry: false } });
  const isAdmin = ["admin", "owner"].includes((meData as { role?: string } | undefined)?.role ?? "");

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [manualInputVal, setManualInputVal] = useState("");

  const manualPlanMutation = useUpdateStarlinkTerminalManualPlan();

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
  // Eski kayıtlarda ipv4 Postgres array literal olarak yazılmış olabilir
  // (örn. `{"143.105.184.160"}`). Görüntülerken temizle.
  const ipv4 = (() => {
    const raw = detail?.ipv4;
    if (!raw) return undefined;
    const cleaned = raw
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .join(", ");
    return cleaned || undefined;
  })();
  const plan = detail?.plan ?? undefined;
  const optIn = Boolean(detail?.optIn);
  const pingDropRate = detail?.pingDropRate ?? undefined;

  const content = (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Sticky dense header */}
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
          <Satellite className="w-4 h-4 text-muted-foreground shrink-0" />
          <h1 className="text-base sm:text-lg tracking-tight truncate min-w-0">
            {detailLoading ? <Skeleton className="h-5 w-40 inline-block align-middle" /> : shipName}
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
          {plan && (
            <span>
              <span className="text-foreground">{plan}</span>
            </span>
          )}
          {ipv4 && (
            <span>
              <span className="text-muted-foreground">IP Adresi:</span>{" "}
              <span className="text-foreground">{ipv4}</span>
            </span>
          )}
          {detail?.updatedAt && (
            <span className="ml-auto flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {t("Son Bağlantı")} {formatDate(detail.updatedAt)}
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
              <h2 className="text-sm font-semibold tracking-tight">{t("Canlı Telemetri")}</h2>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {detailLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] rounded-lg" />
              ))
            ) : (
              <>
                <MetricTile
                  label={t("Sinyal")}
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
                  label={t("Gecikme")}
                  value={detail?.latency != null ? detail.latency : "—"}
                  unit="ms"
                  icon={<Activity className="w-3 h-3" />}
                  tone={(detail?.latency ?? 999) < 80 ? "ok" : "neutral"}
                />
                <MetricTile
                  label={t("Ping Drop")}
                  value={
                    pingDropRate != null ? formatNumber(pingDropRate * 100, 2) : "—"
                  }
                  unit="%"
                  icon={<TrendingUp className="w-3 h-3" />}
                />
                <MetricTile
                  label={t("İndirme")}
                  value={
                    detail?.downloadSpeed != null
                      ? formatNumber(detail.downloadSpeed, 1)
                      : "—"
                  }
                  unit="Mbps"
                  icon={<Download className="w-3 h-3" />}
                />
                <MetricTile
                  label={t("Yükleme")}
                  value={
                    detail?.uploadSpeed != null
                      ? formatNumber(detail.uploadSpeed, 1)
                      : "—"
                  }
                  unit="Mbps"
                  icon={<Upload className="w-3 h-3" />}
                />
                <MetricTile
                  label={t("Engel Yok")}
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
              <h2 className="text-sm font-semibold tracking-tight">{t("Konum")}</h2>
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
                {t("Konum bilgisi yok.")}
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
            <h2 className="text-sm font-semibold tracking-tight">{t("Plan ve Kota")}</h2>
            <Pill tone="info">{periodLabel}</Pill>
          </div>
          {plan && (
            <span className="text-[10px] font-mono text-muted-foreground">{plan}</span>
          )}
        </div>
        <div className="p-6">
          {detailLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Sol: hero — kullanılan / tahsis */}
              <div className="lg:col-span-5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                  {t("Bu Dönem Kullanım")}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-5xl tracking-tight tabular-nums">
                    {formatNumber(used, 1)}
                  </span>
                  <span className="text-sm text-muted-foreground">GB</span>
                  {planAllowance != null && (
                    <span className="ml-2 text-sm font-mono text-muted-foreground">
                      / {formatNumber(planAllowance, 0)} GB
                    </span>
                  )}
                </div>
                {usedPct != null && (
                  <div className="mt-4">
                    <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 bg-[#f54e00]"
                        style={{ width: `${Math.min(usedPct, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>{t("%{{pct}} dolu", { pct: formatNumber(usedPct, 1) })}</span>
                      {planAllowance != null && (
                        <span>{t("%{{pct}} boş", { pct: formatNumber(100 - Math.min(usedPct, 100), 1) })}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sağ: 3'lü mini-stats */}
              <div className="lg:col-span-7 grid grid-cols-3 gap-3">
                <QuotaStat
                  label={t("Kullanılan")}
                  value={formatNumber(used, 1)}
                  unit="GB"
                  tone="primary"
                />
                <QuotaStat
                  label={t("Kalan")}
                  value={remaining != null ? formatNumber(remaining, 1) : "—"}
                  unit={remaining != null ? "GB" : undefined}
                  tone={
                    remaining != null && planAllowance != null && remaining / planAllowance < 0.1
                      ? "warn"
                      : "ok"
                  }
                />
                <QuotaStat
                  label={t("Toplam Tahsis")}
                  value={planAllowance != null ? formatNumber(planAllowance, 0) : "—"}
                  unit={planAllowance != null ? "GB" : undefined}
                  tone="muted"
                />
              </div>

              {planAllowance == null && (
                <div className="lg:col-span-12 text-xs text-muted-foreground">
                  {t("Plan tahsisi bilinmiyor — sadece kullanım gösteriliyor.")}
                </div>
              )}
            </div>
          )}

          {/* Manuel Kota Override */}
          {!detailLoading && (
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  {t("Manuel Kota")}
                </span>
                {detail?.manualPlanGb != null ? (
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono bg-[#f54e00]/10 text-[#f54e00] border border-[#f54e00]/20">
                    {t("Manuel: {{gb}} GB", { gb: formatNumber(detail.manualPlanGb, 0) })}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono bg-secondary text-muted-foreground">
                    {t("Otomatik")}
                  </span>
                )}
                {isAdmin && !manualEditMode && (
                  <button
                    onClick={() => {
                      setManualInputVal(detail?.manualPlanGb != null ? String(detail.manualPlanGb) : "");
                      setManualEditMode(true);
                    }}
                    className="ml-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("Düzenle")}
                  </button>
                )}
              </div>
              {isAdmin && manualEditMode && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={manualInputVal}
                    onChange={(e) => setManualInputVal(e.target.value)}
                    placeholder={t("GB (boş = otomatik)")}
                    className="h-8 w-40 rounded border border-border bg-background px-2.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    disabled={manualPlanMutation.isPending}
                    onClick={() => {
                      const val = manualInputVal.trim();
                      const parsed = val === "" ? null : parseFloat(val);
                      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) return;
                      manualPlanMutation.mutate(
                        { kit, data: { manualPlanGb: parsed } },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: getGetStarlinkTerminalDetailQueryKey(kit) });
                            setManualEditMode(false);
                          },
                        },
                      );
                    }}
                    className="h-8 px-3 rounded text-[12px] font-medium bg-foreground text-background disabled:opacity-50"
                  >
                    {manualPlanMutation.isPending ? "…" : t("Kaydet")}
                  </button>
                  {detail?.manualPlanGb != null && (
                    <button
                      disabled={manualPlanMutation.isPending}
                      onClick={() => {
                        manualPlanMutation.mutate(
                          { kit, data: { manualPlanGb: null } },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetStarlinkTerminalDetailQueryKey(kit) });
                              setManualEditMode(false);
                            },
                          },
                        );
                      }}
                      className="h-8 px-3 rounded text-[12px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {t("Temizle")}
                    </button>
                  )}
                  <button
                    onClick={() => setManualEditMode(false)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("İptal")}
                  </button>
                  {manualPlanMutation.isError && (
                    <span className="text-[11px] text-destructive">{t("Hata — tekrar deneyin.")}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Daily breakdown */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">{t("Günlük Tüketim")}</h2>
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
              {t("Bu dönem için günlük okuma yok.")}
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
                  stroke="#a8a79e"
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
            <h2 className="text-sm font-semibold tracking-tight">{t("Aylık Geçmiş")}</h2>
          </div>
        </div>
        {monthlyLoading ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !monthly || monthly.length === 0 ? (
          <div className="m-4 text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            {t("Henüz aylık veri yok.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[640px]">
              <thead className="bg-secondary/40">
                <tr>
                  {[
                    { label: t("Dönem"), align: "left", pad: "pl-4" },
                    { label: t("Toplam"), align: "right" },
                    { label: t("Kullanılan Miktar"), align: "right" },
                    { label: t("Tarama"), align: "right", pad: "pr-4" },
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
                      {formatNumber(r.packageUsageGb, 1)}{" "}
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

  if (isCustomer) {
    return (
      <div className="py-6 px-4 sm:py-8 sm:px-6 lg:py-10 lg:px-10 max-w-[1200px] mx-auto w-full">
        {content}
      </div>
    );
  }
  return content;
}
