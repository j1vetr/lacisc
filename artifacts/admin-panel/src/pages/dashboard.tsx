import { useMemo } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowRight } from "lucide-react";
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

// Renkler — light tabanlı, dark moda Tailwind dark: ile zaten override.
const SOURCE_DOT: Record<Source, string> = {
  satcom: "bg-[#a4400a] dark:bg-[#f4b896]",
  starlink: "bg-[#2563a6] dark:bg-[#9fbbe0]",
  leobridge: "bg-[#3a3aa6] dark:bg-[#a6a6dd]",
};
const SOURCE_BAR: Record<Source, string> = {
  satcom: "bg-[#a4400a] dark:bg-[#f4b896]",
  starlink: "bg-[#2563a6] dark:bg-[#9fbbe0]",
  leobridge: "bg-[#3a3aa6] dark:bg-[#a6a6dd]",
};
const SOURCE_PILL: Record<Source, string> = {
  satcom: "bg-[#fde0d0] text-[#a4400a] border-[#f4b896] dark:bg-[#3a1f10] dark:text-[#f4b896] dark:border-[#5a2f1a]",
  starlink: "bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] dark:bg-[#16263a] dark:text-[#9fbbe0] dark:border-[#2a3a55]",
  leobridge: "bg-[#dde2f7] text-[#3a3aa6] border-[#a6a6dd] dark:bg-[#1d1d3a] dark:text-[#a6a6dd] dark:border-[#2f2f55]",
};
const SOURCE_LABEL: Record<Source, string> = {
  satcom: "SATCOM",
  starlink: "TOTOTHEO",
  leobridge: "NORWAY",
};
const SOURCE_DETAIL_PREFIX: Record<Source, string> = {
  satcom: "/kits",
  starlink: "/starlink",
  leobridge: "/norway",
};

export default function Dashboard() {
  useDocumentTitle("Panel");

  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });
  const isCustomer = (me as { role?: string } | undefined)?.role === "customer";
  const customerRefetch = isCustomer ? 30_000 : false;

  const { data: summary, isLoading, isError, error } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: customerRefetch,
    },
  });

  const { data: satcomKits, isLoading: kitsLoading } = useGetKits(
    { sortBy: "totalGib" },
    {
      query: {
        queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }),
        refetchInterval: customerRefetch,
      },
    }
  );

  const { data: starlinkSettings } = useGetStarlinkSettings({
    query: { queryKey: getGetStarlinkSettingsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const starlinkActive = isCustomer ? true : !!starlinkSettings?.enabled && !!starlinkSettings?.hasToken;
  const { data: starlinkTerminals, isLoading: starlinkLoading } = useGetStarlinkTerminals({
    query: {
      queryKey: getGetStarlinkTerminalsQueryKey(),
      enabled: starlinkActive,
      refetchInterval: customerRefetch,
    },
  });

  const { data: leobridgeSettings } = useGetLeobridgeSettings({
    query: { queryKey: getGetLeobridgeSettingsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const leobridgeActive = isCustomer ? true : !!leobridgeSettings?.enabled && !!leobridgeSettings?.hasPassword;
  const { data: leobridgeTerminals, isLoading: leobridgeLoading } = useGetLeobridgeTerminals({
    query: {
      queryKey: getGetLeobridgeTerminalsQueryKey(),
      enabled: leobridgeActive,
      refetchInterval: customerRefetch,
    },
  });

  const { data: stationAccounts } = useListStationAccounts({
    query: { queryKey: getListStationAccountsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const { data: starlinkAccounts } = useListStarlinkAccounts({
    query: { queryKey: getListStarlinkAccountsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });
  const { data: leobridgeAccounts } = useListLeobridgeAccounts({
    query: { queryKey: getListLeobridgeAccountsQueryKey(), staleTime: 60_000, enabled: !isCustomer },
  });

  const queryClient = useQueryClient();

  // Toplamlar
  const satcomTotalGb = gibToGb(summary?.totalGib) ?? 0;
  const starlinkTotalGb = useMemo(
    () => (starlinkTerminals ?? []).reduce((s, t) => s + (t.currentPeriodTotalGb ?? 0), 0),
    [starlinkTerminals]
  );
  const leobridgeTotalGb = useMemo(
    () => (leobridgeTerminals ?? []).reduce((s, t) => s + (t.currentPeriodTotalGb ?? 0), 0),
    [leobridgeTerminals]
  );
  const totalGb = satcomTotalGb + (starlinkActive ? starlinkTotalGb : 0) + (leobridgeActive ? leobridgeTotalGb : 0);

  const satcomKitCount = summary?.totalKits ?? 0;
  const starlinkKitCount = starlinkTerminals?.length ?? 0;
  const leobridgeKitCount = leobridgeTerminals?.length ?? 0;
  const totalKits = satcomKitCount + (starlinkActive ? starlinkKitCount : 0) + (leobridgeActive ? leobridgeKitCount : 0);

  // Top movers
  const movers: MoverRow[] = useMemo(() => {
    const out: MoverRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: k.shipName ?? null,
        totalGb: gibToGb(k.totalGib) ?? 0,
        planGb: k.planAllowanceGb ?? null,
      });
    }
    if (starlinkActive) {
      for (const t of starlinkTerminals ?? []) {
        out.push({
          source: "starlink",
          kitNo: t.kitSerialNumber,
          shipName: t.nickname || t.assetName || null,
          totalGb: t.currentPeriodTotalGb ?? 0,
          planGb: t.planAllowanceGb ?? null,
        });
      }
    }
    if (leobridgeActive) {
      for (const t of leobridgeTerminals ?? []) {
        out.push({
          source: "leobridge",
          kitNo: t.kitSerialNumber,
          shipName: t.nickname ?? null,
          totalGb: t.currentPeriodTotalGb ?? 0,
          planGb: t.planAllowanceGb ?? null,
        });
      }
    }
    out.sort((a, b) => b.totalGb - a.totalGb);
    return out.slice(0, 8);
  }, [satcomKits, starlinkTerminals, leobridgeTerminals, starlinkActive, leobridgeActive]);

  const sourceCards: Array<{ source: Source; gb: number; kits: number; accounts: number; visible: boolean }> = [
    { source: "satcom",   gb: satcomTotalGb,   kits: satcomKitCount,   accounts: stationAccounts?.length ?? 0,    visible: true },
    { source: "starlink", gb: starlinkTotalGb, kits: starlinkKitCount, accounts: starlinkAccounts?.length ?? 0,   visible: starlinkActive },
    { source: "leobridge",gb: leobridgeTotalGb,kits: leobridgeKitCount,accounts: leobridgeAccounts?.length ?? 0,  visible: leobridgeActive },
  ];
  const visibleSources = sourceCards.filter((s) => s.visible);

  // Sistem durumu
  const sysStatus: { dotClass: string; label: string } =
    summary?.lastSyncStatus === "success" ? { dotClass: "bg-[#1f8a65] dark:bg-[#34c08e]", label: "AKTİF" }
    : summary?.lastSyncStatus === "failed" ? { dotClass: "bg-[#dfa88f]",                  label: "HATA" }
    : summary?.lastSyncStatus === "running" ? { dotClass: "bg-[#9fbbe0]",                 label: "ÇALIŞIYOR" }
    : { dotClass: "bg-muted-foreground/40",                                                 label: "BEKLİYOR" };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[50vh]">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-normal tracking-tight mb-2 text-foreground">Sistem Hatası</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">{error?.message || "Operasyon paneli yüklenemedi."}</p>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })}
          variant="outline"
          className="rounded-lg shadow-none"
        >
          Yeniden Dene
        </Button>
      </div>
    );
  }

  const moversLoading = kitsLoading || (starlinkActive && starlinkLoading) || (leobridgeActive && leobridgeLoading);

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-500">
      {/* === ÜST KPI: 3 kart, sayılar dikey ortalı === */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <KpiCard eyebrow="TOPLAM TERMİNAL">
          {isLoading ? (
            <Skeleton className="h-10 w-20 rounded" />
          ) : (
            <>
              <div className="font-mono tabular-nums text-3xl sm:text-[40px] leading-none font-normal tracking-tight text-foreground">
                {totalKits}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] uppercase tracking-[0.10em] font-medium text-muted-foreground font-mono tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_DOT.satcom}`} />
                  {satcomKitCount} SATCOM
                </span>
                {starlinkActive && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_DOT.starlink}`} />
                      {starlinkKitCount} TOTOTHEO
                    </span>
                  </>
                )}
                {leobridgeActive && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_DOT.leobridge}`} />
                      {leobridgeKitCount} NORWAY
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </KpiCard>

        <KpiCard eyebrow="AKTİF DÖNEM">
          {isLoading ? (
            <Skeleton className="h-10 w-32 rounded" />
          ) : (
            <div className="font-mono tabular-nums text-2xl sm:text-[36px] leading-none font-normal tracking-tight text-foreground">
              {summary?.activePeriod || "—"}
            </div>
          )}
        </KpiCard>

        <KpiCard eyebrow="SİSTEM DURUMU">
          {isLoading ? (
            <Skeleton className="h-10 w-24 rounded" />
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${sysStatus.dotClass}`} />
                <span className="text-xl sm:text-2xl font-medium text-foreground tracking-tight">{sysStatus.label}</span>
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-[0.10em] text-muted-foreground font-mono tabular-nums">
                SON SYNC ·{" "}
                {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "BEKLENİYOR"}
              </div>
            </>
          )}
        </KpiCard>
      </div>

      {/* === KAYNAK DAĞILIMI: tek satır stacked bar === */}
      {visibleSources.length > 0 && totalGb > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              KAYNAK DAĞILIMI · DÖNEM TERMİNAL TOPLAMI
            </span>
            <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
              {formatNumber(totalGb, 0)} GB
            </span>
          </div>
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-border">
            {visibleSources.map((s) => {
              const pct = (s.gb / totalGb) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={s.source}
                  className={SOURCE_BAR[s.source]}
                  style={{ width: `${pct}%` }}
                  title={`${SOURCE_LABEL[s.source]} · ${formatNumber(s.gb, 1)} GB`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.10em] font-medium text-muted-foreground font-mono tabular-nums">
            {visibleSources.map((s) => (
              <span key={s.source} className="inline-flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_DOT[s.source]}`} />
                {SOURCE_LABEL[s.source]} · {formatNumber(s.gb, 1)} GB
                <span className="opacity-50 hidden sm:inline">
                  · %{((s.gb / totalGb) * 100).toFixed(1)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* === ALT GRID: movers (lg:8) + kaynak kartları (lg:4) === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5 items-stretch">
        {/* Yüksek kullanım listesi */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card flex flex-col">
          <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              YÜKSEK KULLANIM · TERMİNAL
            </span>
            <Link href="/kits">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] uppercase tracking-[0.10em] text-muted-foreground hover:bg-secondary rounded-md"
              >
                TÜMÜ <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          {moversLoading ? (
            <div className="px-5 sm:px-6 pb-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : movers.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Henüz terminal verisi yok.
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {movers.map((m) => {
                const pct = m.planGb && m.planGb > 0 ? Math.min(100, (m.totalGb / m.planGb) * 100) : null;
                const warn = pct !== null && pct >= 80;
                return (
                  <Link
                    key={`${m.source}:${m.kitNo}`}
                    href={`${SOURCE_DETAIL_PREFIX[m.source]}/${encodeURIComponent(m.kitNo)}`}
                  >
                    <div
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_90px] items-center gap-3 sm:gap-5 px-5 sm:px-6 py-3 border-t border-border hover:bg-secondary/50 cursor-pointer transition-colors"
                    >
                      {/* Terminal */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${SOURCE_DOT[m.source]}`} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] sm:text-[14px] font-medium text-foreground truncate">
                            {m.shipName || "—"}
                          </span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[11px] text-muted-foreground truncate">
                              {m.kitNo}
                            </span>
                            <span className="sm:hidden font-mono text-[11px] text-muted-foreground">
                              · {SOURCE_LABEL[m.source]}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Plan progress (sm+) */}
                      <div className="hidden sm:flex flex-col gap-1">
                        {pct !== null ? (
                          <>
                            <div className="h-[3px] w-full rounded-full bg-border overflow-hidden">
                              <div
                                className={`h-full rounded-full ${warn ? "bg-primary" : "bg-foreground"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                              {formatNumber(m.totalGb, 1)} / {m.planGb} GB
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                            TARİFESİZ
                          </span>
                        )}
                      </div>

                      {/* Total GB */}
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-[13px] sm:text-[15px] text-foreground leading-tight">
                          {formatNumber(m.totalGb, 2)}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                          GB
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Sağ rail: kaynak kartları */}
        <div className="flex flex-col gap-3 sm:gap-4">
          {visibleSources.map((s) => (
            <div
              key={s.source}
              className="flex-1 rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-center min-h-[110px]"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_DOT[s.source]}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
                    {SOURCE_LABEL[s.source]}
                  </span>
                </div>
                {!isCustomer && (
                  <span className={`inline-flex items-center h-[18px] px-2 rounded-full border text-[9px] font-semibold uppercase tracking-[0.08em] ${SOURCE_PILL[s.source]}`}>
                    {s.accounts} HESAP
                  </span>
                )}
              </div>
              <div className="font-mono tabular-nums text-[22px] sm:text-[24px] leading-tight font-medium text-foreground">
                {formatNumber(s.gb, s.gb >= 1000 ? 0 : 1)}{" "}
                <span className="text-[12px] text-muted-foreground font-normal">GB</span>
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                {s.kits} TERMİNAL
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 min-h-[110px] sm:min-h-[130px] flex flex-col justify-center">
      <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-3">
        {eyebrow}
      </div>
      {children}
    </div>
  );
}
