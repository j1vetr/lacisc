import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  Database,
  HardDrive,
  CalendarClock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Terminal,
  Satellite,
  Globe,
} from "lucide-react";
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
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate, gibToGb } from "@/lib/format";

import { useDocumentTitle } from "@/hooks/use-document-title";

type MergedKitRow = {
  source: "satcom" | "starlink" | "leobridge";
  kitNo: string;
  shipName: string | null;
  totalGib: number;
};

export default function Dashboard() {
  useDocumentTitle("Panel");
  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });
  const isCustomer = (me as { role?: string } | undefined)?.role === "customer";

  // Customer panelinde "Son Güncelleme" rozeti her 30 sn'de bir tazelenir
  // (yöneticinin sync'inden sonra elle yenilemeden güncel kalsın). Operatör
  // için varsayılan davranış (manuel/event-driven invalidation) korunur.
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

  // Starlink settings 403 dönecek customer için → enabled:false ile hiç
  // çağırma. Müşteri terminal listesini /starlink/terminals üzerinden
  // (atanmış scope ile) görüyor; entegrasyonun açık/kapalı olduğu bilgisine
  // operasyonel olarak ihtiyacı yok — terminal listesi boşsa zaten "0".
  const { data: starlinkSettings } = useGetStarlinkSettings({
    query: {
      queryKey: getGetStarlinkSettingsQueryKey(),
      staleTime: 60_000,
      enabled: !isCustomer,
    },
  });
  // Customer için: backend zaten yalnız atanmış Starlink KIT'lerini döner;
  // listenin var olması = entegrasyonun aktif olduğu anlamına gelir.
  const starlinkActive = isCustomer
    ? true
    : !!starlinkSettings?.enabled && !!starlinkSettings?.hasToken;
  const { data: starlinkTerminals, isLoading: starlinkLoading } =
    useGetStarlinkTerminals({
      query: {
        queryKey: getGetStarlinkTerminalsQueryKey(),
        enabled: starlinkActive,
        refetchInterval: customerRefetch,
      },
    });

  // Leo Bridge (Space Norway) — 3rd source, mirrors Starlink customer-tolerance.
  const { data: leobridgeSettings } = useGetLeobridgeSettings({
    query: {
      queryKey: getGetLeobridgeSettingsQueryKey(),
      staleTime: 60_000,
      enabled: !isCustomer,
    },
  });
  const leobridgeActive = isCustomer
    ? true
    : !!leobridgeSettings?.enabled && !!leobridgeSettings?.hasPassword;
  const { data: leobridgeTerminals, isLoading: leobridgeLoading } =
    useGetLeobridgeTerminals({
      query: {
        queryKey: getGetLeobridgeTerminalsQueryKey(),
        enabled: leobridgeActive,
        refetchInterval: customerRefetch,
      },
    });

  const queryClient = useQueryClient();

  // Merge top terminals from both sources for the headline list.
  const mergedTop: MergedKitRow[] = useMemo(() => {
    const out: MergedKitRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: k.shipName ?? null,
        totalGib: gibToGb(k.totalGib) ?? 0,
      });
    }
    for (const t of starlinkTerminals ?? []) {
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname || t.assetName || null,
        totalGib: t.currentPeriodTotalGb ?? 0,
      });
    }
    for (const t of leobridgeTerminals ?? []) {
      out.push({
        source: "leobridge",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname ?? null,
        totalGib: t.currentPeriodTotalGb ?? 0,
      });
    }
    out.sort((a, b) => b.totalGib - a.totalGib);
    return out;
  }, [satcomKits, starlinkTerminals, leobridgeTerminals]);

  // Combined KPIs — Satcom totals come from the summary endpoint (already
  // index-backed); Starlink totals are summed client-side from the terminal
  // snapshot we just fetched, so the dashboard reflects both sources.
  const starlinkKitCount = starlinkTerminals?.length ?? 0;
  const starlinkTotalGib = useMemo(
    () =>
      (starlinkTerminals ?? []).reduce(
        (s, t) => s + (t.currentPeriodTotalGb ?? 0),
        0
      ),
    [starlinkTerminals]
  );
  const leobridgeKitCount = leobridgeTerminals?.length ?? 0;
  const leobridgeTotalGib = useMemo(
    () =>
      (leobridgeTerminals ?? []).reduce(
        (s, t) => s + (t.currentPeriodTotalGb ?? 0),
        0
      ),
    [leobridgeTerminals]
  );
  const totalKitsCombined =
    (summary?.totalKits ?? 0) +
    (starlinkActive ? starlinkKitCount : 0) +
    (leobridgeActive ? leobridgeKitCount : 0);
  const totalGibCombined =
    (gibToGb(summary?.totalGib) ?? 0) +
    (starlinkActive ? starlinkTotalGib : 0) +
    (leobridgeActive ? leobridgeTotalGib : 0);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[50vh]">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-normal tracking-tight mb-2 text-foreground">Sistem Hatası</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">{error?.message || "Operasyon paneli yüklenemedi."}</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })} variant="outline" className="rounded-lg shadow-none">
          Yeniden Dene
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-6 grid-cols-2 xl:grid-cols-3">
        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Toplam KIT</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded" />
            ) : (
              <>
                <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                  {formatNumber(totalKitsCombined, 0)}
                </div>
                {(starlinkActive || leobridgeActive) && (
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 font-mono">
                    {summary?.totalKits ?? 0} satcom
                    {starlinkActive ? ` · ${starlinkKitCount} tototheo` : ""}
                    {leobridgeActive ? ` · ${leobridgeKitCount} norway` : ""}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Toplam GB (Aktif Dönem)</CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32 rounded" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                    {formatNumber(totalGibCombined, 2)}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">GB</span>
                </div>
                {(starlinkActive || leobridgeActive) && (
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 font-mono">
                    {formatNumber(gibToGb(summary?.totalGib) ?? 0, 1)} satcom
                    {starlinkActive
                      ? ` · ${formatNumber(starlinkTotalGib, 1)} tototheo`
                      : ""}
                    {leobridgeActive
                      ? ` · ${formatNumber(leobridgeTotalGib, 1)} norway`
                      : ""}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Aktif Dönem</CardTitle>
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded" />
            ) : (
              <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                {summary?.activePeriod || "-"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:gap-8 grid-cols-1 md:grid-cols-12">
        {/* KIT List - Span 8 */}
        <Card className="border border-border bg-card shadow-none md:col-span-8 flex flex-col rounded-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-normal tracking-tight">Terminaller</CardTitle>
                <CardDescription className="mt-1 text-sm uppercase tracking-wide">KIT BAZINDA TOPLAM VERİ KULLANIMI</CardDescription>
              </div>
              <Link href="/kits">
                <Button variant="ghost" size="sm" className="text-xs h-8 text-foreground hover:bg-secondary rounded-lg">
                  Tümü <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {kitsLoading ||
            (starlinkActive && starlinkLoading) ||
            (leobridgeActive && leobridgeLoading) ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : mergedTop.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Henüz KIT verisi yok.</div>
            ) : (
              <div className="divide-y divide-border">
                {mergedTop.map((row) => {
                  const isStar = row.source === "starlink";
                  const isLeo = row.source === "leobridge";
                  return (
                    <Link
                      key={`${row.source}:${row.kitNo}`}
                      href={`${isStar ? "/starlink" : isLeo ? "/norway" : "/kits"}/${encodeURIComponent(row.kitNo)}`}
                    >
                      <div className="flex items-center justify-between py-3 hover:bg-secondary/50 -mx-2 px-2 rounded-md cursor-pointer transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-md bg-secondary text-muted-foreground shrink-0">
                            {isStar ? (
                              <Satellite className="w-4 h-4" />
                            ) : isLeo ? (
                              <Globe className="w-4 h-4" />
                            ) : (
                              <Terminal className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[13px] text-foreground truncate">{row.kitNo}</span>
                              {isStar ? (
                                <Badge className="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] hover:bg-[#dde9f7] uppercase tracking-widest text-[9px] font-semibold shrink-0">
                                  Tototheo
                                </Badge>
                              ) : isLeo ? (
                                <Badge className="bg-[#dde2f7] text-[#3a3aa6] border-[#a6a6dd] hover:bg-[#dde2f7] uppercase tracking-widest text-[9px] font-semibold shrink-0">
                                  Norway
                                </Badge>
                              ) : (
                                <Badge className="bg-[#fde0d0] text-[#a4400a] border-[#f4b896] hover:bg-[#fde0d0] uppercase tracking-widest text-[9px] font-semibold shrink-0">
                                  Satcom
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate" title={row.shipName || undefined}>
                              {row.shipName || "—"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                          <div className="text-right min-w-[80px]">
                            <div className="font-mono text-[12px] sm:text-[13px] text-foreground">{formatNumber(row.totalGib, 2)}</div>
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">GB</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compact System Health - Span 4. Müşteri için sadece "son
            güncelleme" rozeti gösterilir; sync sağlığı/sayıları/kayıtlar
            butonu gizlenir. */}
        {isCustomer ? (
          <Card className="border border-border bg-card shadow-none md:col-span-4 rounded-xl flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-normal tracking-tight">Son Güncelleme</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-border text-muted-foreground">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground leading-tight">
                    {summary?.lastSuccessSyncAt ? "Veriler güncel" : "Veri bekleniyor"}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                    {summary?.lastSuccessSyncAt
                      ? formatDate(summary.lastSuccessSyncAt)
                      : "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
        <Card className="border border-border bg-card shadow-none md:col-span-4 rounded-xl flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-normal tracking-tight">Sistem Sağlığı</CardTitle>
              <Link href="/sync-logs">
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground hover:bg-secondary rounded-md">
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    summary?.lastSyncStatus === 'success' ? 'bg-[#9fc9a2] text-foreground' :
                    summary?.lastSyncStatus === 'failed' ? 'bg-[#dfa88f] text-foreground' :
                    summary?.lastSyncStatus === 'running' ? 'bg-[#9fbbe0] text-foreground' :
                    'bg-border text-muted-foreground'
                  }`}>
                    {summary?.lastSyncStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                     summary?.lastSyncStatus === 'failed' ? <AlertCircle className="w-4 h-4" /> :
                     summary?.lastSyncStatus === 'running' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                     <Clock className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground leading-tight">
                      {summary?.lastSyncStatus === 'success' ? 'Başarılı' :
                       summary?.lastSyncStatus === 'failed' ? 'Başarısız' :
                       summary?.lastSyncStatus === 'running' ? 'Çalışıyor' : 'Bekliyor'}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                      Satcom: {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "İlk sync bekleniyor"}
                    </div>
                  </div>
                </div>

                {starlinkActive && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-[#9fbbe0]/60 bg-[#dde9f7]/40">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#9fbbe0] text-foreground">
                      <Satellite className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground leading-tight">
                        Tototheo
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                        {starlinkSettings?.lastSyncAt
                          ? formatDate(starlinkSettings.lastSyncAt)
                          : "İlk sync bekleniyor"}
                      </div>
                    </div>
                  </div>
                )}

                {leobridgeActive && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-[#a6a6dd]/60 bg-[#dde2f7]/40">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#a6a6dd] text-foreground">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground leading-tight">
                        Norway
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                        {leobridgeSettings?.lastSyncAt
                          ? formatDate(leobridgeSettings.lastSyncAt)
                          : "İlk sync bekleniyor"}
                      </div>
                    </div>
                  </div>
                )}

                {summary?.lastSyncError && (
                  <div className="p-3 rounded-lg border border-[#dfa88f] bg-[#dfa88f]/10">
                    <p className="text-[11px] font-medium text-foreground mb-1 flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3" /> Hata
                    </p>
                    <p className="text-[10px] font-mono text-foreground/70 leading-relaxed line-clamp-3">{summary.lastSyncError}</p>
                  </div>
                )}

                {(summary?.lastSyncRecordsFound != null || summary?.lastSyncRecordsInserted != null) && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-md border border-border text-center">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bulunan</div>
                      <div className="text-base font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsFound, 0)}</div>
                    </div>
                    <div className="p-2.5 rounded-md border border-[#9fc9a2]/60 bg-[#9fc9a2]/10 text-center">
                      <div className="text-[9px] font-semibold text-foreground uppercase tracking-wider mb-1">Eklenen</div>
                      <div className="text-base font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsInserted, 0)}</div>
                    </div>
                    <div className="p-2.5 rounded-md border border-[#c0a8dd]/60 bg-[#c0a8dd]/10 text-center">
                      <div className="text-[9px] font-semibold text-foreground uppercase tracking-wider mb-1">Güncel.</div>
                      <div className="text-base font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsUpdated, 0)}</div>
                    </div>
                  </div>
                )}

                <Link href="/sync-logs" className="mt-auto block">
                  <Button
                    variant="outline"
                    className="w-full rounded-lg border-border hover:bg-secondary shadow-none h-10 text-sm font-medium"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    SENKRONİZASYON KAYITLARI
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
