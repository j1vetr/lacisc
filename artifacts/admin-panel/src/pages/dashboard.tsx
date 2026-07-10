import { lazy, Suspense, useMemo } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, CheckCircle2, AlertTriangle, Clock, Loader2, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";

const FleetMap = lazy(() => import("@/components/fleet-map"));
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetKits,
  getGetKitsQueryKey,
  useGetStarlinkTerminals,
  getGetStarlinkTerminalsQueryKey,
  useGetStarlinkSettings,
  getGetStarlinkSettingsQueryKey,
  useGetLeobridgeTerminals,
  getGetLeobridgeTerminalsQueryKey,
  useGetLeobridgeSettings,
  getGetLeobridgeSettingsQueryKey,
  useListStationAccounts,
  getListStationAccountsQueryKey,
  useListStarlinkAccounts,
  getListStarlinkAccountsQueryKey,
  useListLeobridgeAccounts,
  getListLeobridgeAccountsQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useGetSyncLogs,
  getGetSyncLogsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDate, gibToGb } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";

type Source = "satcom" | "starlink" | "leobridge";

type MoverRow = {
  source: Source;
  kitNo: string;
  shipName: string | null;
  totalGb: number;
  planGb: number | null;
};

const SOURCE_DOT: Record<Source, string> = {
  satcom:    "bg-[#c25b1f] dark:bg-[#f4b896]",
  starlink:  "bg-[#2563a6] dark:bg-[#9fbbe0]",
  leobridge: "bg-[#5a4ea6] dark:bg-[#b0a8dd]",
};
const SOURCE_BAR: Record<Source, string> = {
  satcom:    "bg-[#c25b1f] dark:bg-[#f4b896]",
  starlink:  "bg-[#2563a6] dark:bg-[#9fbbe0]",
  leobridge: "bg-[#5a4ea6] dark:bg-[#b0a8dd]",
};
const SOURCE_PILL: Record<Source, string> = {
  satcom:    "bg-[#fde0d0] text-[#a4400a] border-[#f4b896] dark:bg-[#3a1f10] dark:text-[#f4b896] dark:border-[#5a2f1a]",
  starlink:  "bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] dark:bg-[#16263a] dark:text-[#9fbbe0] dark:border-[#2a3a55]",
  leobridge: "bg-[#e8e6f7] text-[#4a42a0] border-[#b0a8dd] dark:bg-[#1e1c3a] dark:text-[#b0a8dd] dark:border-[#353060]",
};
const SOURCE_LABEL: Record<Source, string> = {
  satcom:    "SATCOM",
  starlink:  "TOTOTHEO",
  leobridge: "NORWAY",
};
const SOURCE_DETAIL_PREFIX: Record<Source, string> = {
  satcom:    "/kits",
  starlink:  "/starlink",
  leobridge: "/norway",
};

/** "202607" → "01 Tem 2026 – 31 Tem 2026" */
function periodToDateRange(period: string | null | undefined): string | null {
  if (!period || period.length !== 6) return null;
  const y = parseInt(period.slice(0, 4), 10);
  const m = parseInt(period.slice(4, 6), 10);
  if (isNaN(y) || isNaN(m)) return null;
  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 0);
  const fmt = (d: Date) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t("Panel"));

  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });
  const isCustomer = (me as { role?: string } | undefined)?.role === "customer";
  const customerRefetch = isCustomer ? 30_000 : false;

  const { data: summary, isLoading, isError, error } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: customerRefetch },
  });
  const { data: satcomKits, isLoading: kitsLoading } = useGetKits(
    { sortBy: "totalGib" },
    { query: { queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }), refetchInterval: customerRefetch } }
  );
  const { data: starlinkSettings } = useGetStarlinkSettings({
    query: { queryKey: getGetStarlinkSettingsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const starlinkActive = isCustomer ? true : !!starlinkSettings?.enabled && !!starlinkSettings?.hasToken;
  const { data: starlinkTerminals, isLoading: starlinkLoading } = useGetStarlinkTerminals({
    query: { queryKey: getGetStarlinkTerminalsQueryKey(), enabled: starlinkActive, refetchInterval: customerRefetch },
  });
  const { data: leobridgeSettings } = useGetLeobridgeSettings({
    query: { queryKey: getGetLeobridgeSettingsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const leobridgeActive = isCustomer ? true : !!leobridgeSettings?.enabled && !!leobridgeSettings?.hasPassword;
  const { data: leobridgeTerminals, isLoading: leobridgeLoading } = useGetLeobridgeTerminals({
    query: { queryKey: getGetLeobridgeTerminalsQueryKey(), enabled: leobridgeActive, refetchInterval: customerRefetch },
  });
  const { data: stationAccounts }  = useListStationAccounts({  query: { queryKey: getListStationAccountsQueryKey(),  staleTime: 60_000, enabled: !isCustomer } });
  const { data: starlinkAccounts } = useListStarlinkAccounts({ query: { queryKey: getListStarlinkAccountsQueryKey(), staleTime: 60_000, enabled: !isCustomer } });
  const { data: leobridgeAccounts }= useListLeobridgeAccounts({query: { queryKey: getListLeobridgeAccountsQueryKey(),staleTime: 60_000, enabled: !isCustomer } });
  const { data: recentSyncLogs }   = useGetSyncLogs(
    { page: 1, limit: 6 },
    { query: { queryKey: getGetSyncLogsQueryKey({ page: 1, limit: 6 }), staleTime: 30_000, enabled: !isCustomer } }
  );

  const queryClient = useQueryClient();

  /* ── Aggregate totals ── */
  const satcomTotalGb   = gibToGb(summary?.totalGib) ?? 0;
  const starlinkTotalGb = useMemo(() => (starlinkTerminals ?? []).reduce((s, term) => s + (term.currentPeriodTotalGb ?? 0), 0), [starlinkTerminals]);
  const leobridgeTotalGb= useMemo(() => (leobridgeTerminals ?? []).reduce((s, term) => s + (term.currentPeriodTotalGb ?? 0), 0), [leobridgeTerminals]);
  const totalGb = satcomTotalGb + (starlinkActive ? starlinkTotalGb : 0) + (leobridgeActive ? leobridgeTotalGb : 0);

  const satcomKitCount   = summary?.totalKits ?? 0;
  const starlinkKitCount = starlinkTerminals?.length ?? 0;
  const leobridgeKitCount= leobridgeTerminals?.length ?? 0;
  const totalKits = satcomKitCount + (starlinkActive ? starlinkKitCount : 0) + (leobridgeActive ? leobridgeKitCount : 0);

  /* ── Unique vessel names ── */
  const uniqueVessels = useMemo(() => {
    const names = new Set<string>();
    for (const k of satcomKits ?? [])   { if (k.shipName)                      names.add(k.shipName); }
    for (const term of starlinkActive ? (starlinkTerminals ?? []) : []) {
      const n = term.nickname || term.assetName;
      if (n) names.add(n);
    }
    for (const term of leobridgeActive ? (leobridgeTerminals ?? []) : []) {
      if (term.nickname) names.add(term.nickname);
    }
    return names.size;
  }, [satcomKits, starlinkTerminals, leobridgeTerminals, starlinkActive, leobridgeActive]);

  /* ── Top movers ── */
  const movers: MoverRow[] = useMemo(() => {
    const out: MoverRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({ source: "satcom", kitNo: k.kitNo, shipName: k.shipName ?? null, totalGb: gibToGb(k.totalGib) ?? 0, planGb: k.planAllowanceGb ?? null });
    }
    if (starlinkActive) for (const term of starlinkTerminals ?? []) {
      out.push({ source: "starlink", kitNo: term.kitSerialNumber, shipName: term.nickname || term.assetName || null, totalGb: term.currentPeriodTotalGb ?? 0, planGb: term.planAllowanceGb ?? null });
    }
    if (leobridgeActive) for (const term of leobridgeTerminals ?? []) {
      out.push({ source: "leobridge", kitNo: term.kitSerialNumber, shipName: term.nickname ?? null, totalGb: term.currentPeriodTotalGb ?? 0, planGb: term.planAllowanceGb ?? null });
    }
    out.sort((a, b) => b.totalGb - a.totalGb);
    return out.slice(0, 8);
  }, [satcomKits, starlinkTerminals, leobridgeTerminals, starlinkActive, leobridgeActive]);

  const sourceCards: Array<{ source: Source; gb: number; kits: number; accounts: number; visible: boolean }> = [
    { source: "satcom",    gb: satcomTotalGb,    kits: satcomKitCount,    accounts: stationAccounts?.length ?? 0,  visible: true },
    { source: "starlink",  gb: starlinkTotalGb,  kits: starlinkKitCount,  accounts: starlinkAccounts?.length ?? 0, visible: starlinkActive },
    { source: "leobridge", gb: leobridgeTotalGb, kits: leobridgeKitCount, accounts: leobridgeAccounts?.length ?? 0,visible: leobridgeActive },
  ];
  const visibleSources = sourceCards.filter((s) => s.visible);

  /* ── System status ── */
  const sysStatus: { dotClass: string; label: string } =
    summary?.lastSyncStatus === "success" ? { dotClass: "bg-emerald-500 dark:bg-emerald-400", label: "AKTİF" }
    : summary?.lastSyncStatus === "failed" ? { dotClass: "bg-rose-500", label: "HATA" }
    : summary?.lastSyncStatus === "running"? { dotClass: "bg-sky-400 animate-pulse", label: "ÇALIŞIYOR" }
    : { dotClass: "bg-muted-foreground/40", label: "BEKLİYOR" };

  const moversLoading = kitsLoading || (starlinkActive && starlinkLoading) || (leobridgeActive && leobridgeLoading);
  const periodRange   = periodToDateRange(summary?.activePeriod);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[50vh]">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-normal tracking-tight mb-2">{t("Sistem Hatası")}</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          {(error?.message && t(error.message)) || t("Operasyon paneli yüklenemedi.")}
        </p>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })}
          variant="outline" className="rounded-lg shadow-none"
        >
          {t("Yeniden Dene")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-500">

      {/* ── GREETING ── */}
      <div className="mb-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
          {t("İyi günler")}, {me?.name || t("Operatör")} 🌊
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("Filo ve terminal operasyonlarınıza genel bakış.")}
        </p>
      </div>

      {/* ── 4 KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* 1. Toplam Terminal */}
        <KpiCard eyebrow={t("TOPLAM TERMİNAL")}>
          {isLoading ? <Skeleton className="h-9 w-16 rounded" /> : (
            <>
              <div className="font-mono tabular-nums text-[32px] sm:text-[40px] leading-none font-light tracking-tight text-foreground">
                {totalKits}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.09em] font-medium text-muted-foreground font-mono">
                <span className="inline-flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT.satcom}`} />
                  {satcomKitCount} Satcom
                </span>
                {starlinkActive && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT.starlink}`} />
                    {starlinkKitCount} Tototheo
                  </span>
                )}
                {leobridgeActive && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT.leobridge}`} />
                    {leobridgeKitCount} Normay
                  </span>
                )}
              </div>
            </>
          )}
        </KpiCard>

        {/* 2. Aktif Dönem */}
        <KpiCard eyebrow={t("AKTİF DÖNEM")}>
          {isLoading ? <Skeleton className="h-9 w-28 rounded" /> : (
            <>
              <div className="font-mono tabular-nums text-[26px] sm:text-[32px] leading-none font-light tracking-tight text-foreground">
                {summary?.activePeriod || "—"}
              </div>
              {periodRange && (
                <div className="mt-2 text-[11px] text-primary font-medium">
                  {periodRange}
                </div>
              )}
            </>
          )}
        </KpiCard>

        {/* 3. Sistem Durumu */}
        <KpiCard eyebrow={t("SİSTEM DURUMU")}>
          {isLoading ? <Skeleton className="h-9 w-20 rounded" /> : (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sysStatus.dotClass}`} />
                <span className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
                  {t(sysStatus.label)}
                </span>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.09em] text-muted-foreground font-mono">
                {t("SON SYNC")} · {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : t("BEKLENİYOR")}
              </div>
            </>
          )}
        </KpiCard>

        {/* 4. Aktif Gemiler */}
        <KpiCard eyebrow={t("AKTİF GEMİ")}>
          {moversLoading ? <Skeleton className="h-9 w-12 rounded" /> : (
            <>
              <div className="font-mono tabular-nums text-[32px] sm:text-[40px] leading-none font-light tracking-tight text-foreground">
                {uniqueVessels}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.09em] text-muted-foreground font-mono">
                {t("Canlı veri alınıyor")}
              </div>
            </>
          )}
        </KpiCard>
      </div>

      {/* ── HARITA + SON SENKRON ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* Fleet map — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {t("FİLO HARİTASI")}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              {t("CANLI")}
            </span>
          </div>
          <Suspense fallback={<div className="h-[300px] sm:h-[380px] rounded-lg bg-secondary/30 animate-pulse" />}>
            <FleetMap />
          </Suspense>
        </div>

        {/* Son Senkron Aktivitesi — 1/3 */}
        <div className="rounded-xl border border-border bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {t("SON SENKRON")}
            </span>
            <Link href="/sync-logs">
              <span className="text-[10px] text-primary hover:underline cursor-pointer">{t("Tümü")}</span>
            </Link>
          </div>
          <div className="flex-1 divide-y divide-border">
            {!recentSyncLogs?.logs?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Activity className="w-5 h-5 opacity-40" />
                <span className="text-xs">{t("Henüz senkron yok.")}</span>
              </div>
            ) : (
              recentSyncLogs.logs.map((log) => {
                const isSuccess = log.status === "success";
                const isFailed  = log.status === "failed";
                const isRunning = log.status === "running";
                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 shrink-0">
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : isFailed ? (
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                      ) : isRunning ? (
                        <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-foreground leading-tight truncate">
                        {isSuccess ? t("Senkron tamamlandı") : isFailed ? t("Senkron başarısız") : isRunning ? t("Çalışıyor…") : t("Bekliyor")}
                      </div>
                      {isSuccess && log.recordsFound != null && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {t("{{count}} kayıt bulundu", { count: log.recordsFound })}
                        </div>
                      )}
                      {isFailed && log.message && (
                        <div className="text-[10px] text-rose-500 mt-0.5 truncate">
                          {log.message}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {formatDate(log.startedAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── ALT ANALYTICS SATIRI ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* 1. Kaynak Dağılımı */}
        {visibleSources.length > 0 && totalGb > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium block mb-3">
              {t("KAYNAK DAĞILIMI")}
            </span>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-border mb-3">
              {visibleSources.map((s) => {
                const pct = (s.gb / totalGb) * 100;
                if (pct <= 0) return null;
                return (
                  <div key={s.source} className={SOURCE_BAR[s.source]} style={{ width: `${pct}%` }}
                    title={`${SOURCE_LABEL[s.source]} · ${formatNumber(s.gb, 1)} GB`}
                  />
                );
              })}
            </div>
            <div className="space-y-2">
              {visibleSources.map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${SOURCE_DOT[s.source]}`} />
                    <span className="text-[11px] font-medium text-foreground">{SOURCE_LABEL[s.source]}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[11px] text-foreground">{formatNumber(s.gb, 1)} GB</span>
                    <span className="font-mono text-[10px] text-muted-foreground ml-1.5">
                      %{((s.gb / totalGb) * 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{t("Toplam")}</span>
              <span className="font-mono text-[13px] font-medium text-foreground">{formatNumber(totalGb, 0)} GB</span>
            </div>
          </div>
        )}

        {/* 2. En Aktif Terminaller */}
        <div className={`rounded-xl border border-border bg-card flex flex-col ${visibleSources.length > 0 && totalGb > 0 ? "" : "lg:col-start-1"}`}>
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {t("EN AKTİF TERMİNALLER")}
            </span>
            <Link href="/kits">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:bg-secondary rounded">
                {t("Tümü")} <ArrowRight className="w-3 h-3 ml-0.5" />
              </Button>
            </Link>
          </div>
          {moversLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : movers.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">{t("Henüz terminal verisi yok.")}</div>
          ) : (
            <div className="divide-y divide-border flex-1">
              {movers.slice(0, 6).map((m) => {
                const pct = m.planGb && m.planGb > 0 ? Math.min(100, (m.totalGb / m.planGb) * 100) : null;
                const warn = pct !== null && pct >= 80;
                return (
                  <Link key={`${m.source}:${m.kitNo}`} href={`${SOURCE_DETAIL_PREFIX[m.source]}/${encodeURIComponent(m.kitNo)}`}>
                    <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/50 cursor-pointer transition-colors">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SOURCE_DOT[m.source]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground truncate">
                          {m.shipName || "—"}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{m.kitNo}</div>
                        {pct !== null && (
                          <div className="mt-1 h-[2px] w-full rounded-full bg-border overflow-hidden">
                            <div className={`h-full rounded-full ${warn ? "bg-primary" : "bg-foreground/50"}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-[12px] text-foreground">{formatNumber(m.totalGb, 1)}</div>
                        <div className="font-mono text-[9px] text-muted-foreground uppercase">GB</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Toplam Bant Genişliği */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            {t("BANT GENİŞLİĞİ KULLANIMI")}
          </span>
          {isLoading || moversLoading ? (
            <Skeleton className="h-14 w-24 rounded mt-3" />
          ) : (
            <>
              <div className="mt-3">
                <div className="font-mono tabular-nums text-[36px] sm:text-[44px] leading-none font-light tracking-tight text-foreground">
                  {formatNumber(totalGb, totalGb >= 100 ? 0 : 1)}
                </div>
                <div className="text-[13px] text-muted-foreground font-medium mt-1">GB</div>
              </div>
              <div className="mt-4 pt-3 border-t border-border text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                {periodRange || (summary?.activePeriod ? summary.activePeriod : "—")}
              </div>
            </>
          )}
        </div>

        {/* 4. Kaynak Detay Kartları */}
        <div className="flex flex-col gap-2.5">
          {visibleSources.map((s) => (
            <div key={s.source} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between min-h-[72px]">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${SOURCE_DOT[s.source]}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-foreground">{SOURCE_LABEL[s.source]}</span>
                </div>
                <div className="font-mono tabular-nums text-[20px] font-medium text-foreground leading-tight">
                  {formatNumber(s.gb, s.gb >= 1000 ? 0 : 1)}
                  <span className="text-[11px] text-muted-foreground font-normal ml-1">GB</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[13px] text-foreground">{s.kits}</div>
                <div className="text-[9px] uppercase tracking-[0.09em] text-muted-foreground">{t("terminal")}</div>
                {!isCustomer && s.accounts > 0 && (
                  <span className={`mt-1 inline-flex items-center h-4 px-1.5 rounded-full border text-[8px] font-semibold uppercase tracking-[0.06em] ${SOURCE_PILL[s.source]}`}>
                    {s.accounts} {t("hesap")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 min-h-[100px] sm:min-h-[120px] flex flex-col justify-center">
      <div className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground font-medium mb-2.5">
        {eyebrow}
      </div>
      {children}
    </div>
  );
}
