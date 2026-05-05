import React from "react";
import { Link } from "wouter";
import {
  Database,
  HardDrive,
  DollarSign,
  CalendarClock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Terminal,
} from "lucide-react";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useSyncNow,
  useGetKits,
  getGetKitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Dashboard() {
  useDocumentTitle("Panel");
  const { data: summary, isLoading, isError, error } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: kits, isLoading: kitsLoading } = useGetKits(
    { sortBy: "totalGb" },
    { query: { queryKey: getGetKitsQueryKey({ sortBy: "totalGb" }) } }
  );
  const syncNowMutation = useSyncNow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSync = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: "Senkronizasyon Başladı",
          description: res.message || "Manuel senkronizasyon tetiklendi.",
        });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Senkronizasyon Başarısız",
          description: err.message || "Senkronizasyon başlatılamadı.",
          variant: "destructive",
        });
      }
    });
  };

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

  const isSyncing = syncNowMutation.isPending || summary?.lastSyncStatus === 'running';

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Toplam KIT</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded" />
            ) : (
              <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                {formatNumber(summary?.totalKits, 0)}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Toplam GB</CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32 rounded" />
            ) : (
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                  {formatNumber(summary?.totalGb, 2)}
                </div>
                <span className="text-sm font-medium text-muted-foreground">GB</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Toplam Tutar</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-36 rounded" />
            ) : (
              <div className="text-3xl font-normal tracking-tight text-foreground font-mono">
                {formatCurrency(summary?.totalUsd)}
              </div>
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

      <div className="grid gap-8 md:grid-cols-12">
        {/* KIT List - Span 8 */}
        <Card className="border border-border bg-card shadow-none md:col-span-8 flex flex-col rounded-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-normal tracking-tight">Terminaller</CardTitle>
                <CardDescription className="mt-1 text-sm">KIT bazında toplam kullanım ve faturalama</CardDescription>
              </div>
              <Link href="/kits">
                <Button variant="ghost" size="sm" className="text-xs h-8 text-foreground hover:bg-secondary rounded-lg">
                  Tümü <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {kitsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : !kits || kits.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Henüz KIT verisi yok.</div>
            ) : (
              <div className="divide-y divide-border">
                {kits.map((row) => (
                  <Link key={row.kitNo} href={`/cdr-records?kitNo=${encodeURIComponent(row.kitNo)}`}>
                    <div className="flex items-center justify-between py-3 hover:bg-secondary/50 -mx-2 px-2 rounded-md cursor-pointer transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-md bg-secondary text-muted-foreground shrink-0">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[13px] text-foreground truncate">{row.kitNo}</span>
                          <span className="text-[11px] text-muted-foreground truncate" title={row.shipName || undefined}>
                            {row.shipName || "—"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right">
                          <div className="font-mono text-[13px] text-foreground">{formatNumber(row.totalGb, 2)}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">GB</div>
                        </div>
                        <div className="text-right min-w-[90px]">
                          <div className="font-mono text-[13px] text-foreground">{formatCurrency(row.totalPrice)}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tutar</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compact System Health - Span 4 */}
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
                      {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "İlk sync bekleniyor"}
                    </div>
                  </div>
                </div>

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

                <Button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="mt-auto w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none transition-colors h-10 text-sm font-medium"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? "Senkronize ediliyor..." : "Şimdi senkronize et"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
