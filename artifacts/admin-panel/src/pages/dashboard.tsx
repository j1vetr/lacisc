import React from "react";
import { Link } from "wouter";
import { 
  Database, 
  HardDrive, 
  DollarSign, 
  CalendarClock, 
  Activity, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  List,
  Settings
} from "lucide-react";
import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useSyncNow,
  useGetMe,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

export default function Dashboard() {
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: summary, isLoading, isError, error } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
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
  const firstName = user?.name?.split(' ')[0] || "Yönetici";

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 pb-6 border-b border-border">
        <div className="space-y-2">
          <h1 className="text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">Hoş geldin, {firstName}</h1>
          <p className="text-base text-muted-foreground">VSAT terminallerinizden en güncel veriler.</p>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-none transition-colors h-10 px-5 text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? "Senkronize Ediliyor..." : "Şimdi Senkronize Et"}
        </Button>
      </div>

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
        {/* Sync Status - Span 7 */}
        <Card className="border border-border bg-card shadow-none md:col-span-7 flex flex-col rounded-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-normal tracking-tight">Sistem Sağlığı</CardTitle>
                <CardDescription className="mt-1 text-sm">Son portal senkronizasyon durumu</CardDescription>
              </div>
              <Link href="/sync-logs">
                <Button variant="ghost" size="sm" className="text-xs h-8 text-foreground hover:bg-secondary rounded-lg">
                  Kayıtları Gör <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-5 rounded-xl border border-border bg-secondary/50">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    summary?.lastSyncStatus === 'success' ? 'bg-[#9fc9a2] text-foreground' : // mint
                    summary?.lastSyncStatus === 'failed' ? 'bg-[#dfa88f] text-foreground' : // peach
                    summary?.lastSyncStatus === 'running' ? 'bg-[#9fbbe0] text-foreground' : // blue
                    'bg-border text-muted-foreground'
                  }`}>
                    {summary?.lastSyncStatus === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                     summary?.lastSyncStatus === 'failed' ? <AlertCircle className="w-5 h-5" /> :
                     summary?.lastSyncStatus === 'running' ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                     <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium capitalize flex items-center gap-2 text-foreground">
                      {summary?.lastSyncStatus === 'success' ? 'Başarılı' : 
                       summary?.lastSyncStatus === 'failed' ? 'Başarısız' : 
                       summary?.lastSyncStatus === 'running' ? 'Çalışıyor' : 'Bekliyor'}
                    </h3>
                    <p className="text-[13px] text-muted-foreground font-mono mt-0.5">
                      {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "İlk senkronizasyon bekleniyor"}
                    </p>
                  </div>
                </div>

                {summary?.lastSyncError && (
                  <div className="p-5 rounded-xl border border-[#dfa88f] bg-[#dfa88f]/10">
                    <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Hata Detayı
                    </p>
                    <p className="text-xs font-mono text-foreground/80 leading-relaxed">{summary.lastSyncError}</p>
                  </div>
                )}

                {(summary?.lastSyncRecordsFound != null || summary?.lastSyncRecordsInserted != null) && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-5 rounded-xl border border-border bg-card flex flex-col items-center justify-center text-center">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Bulunan Kayıt</span>
                      <span className="text-2xl font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsFound, 0)}</span>
                    </div>
                    <div className="p-5 rounded-xl border border-[#9fc9a2] bg-[#9fc9a2]/10 flex flex-col items-center justify-center text-center">
                      <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">Eklenen</span>
                      <span className="text-2xl font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsInserted, 0)}</span>
                    </div>
                    <div className="p-5 rounded-xl border border-[#c0a8dd] bg-[#c0a8dd]/10 flex flex-col items-center justify-center text-center">
                      <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest mb-2">Güncellenen</span>
                      <span className="text-2xl font-normal font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsUpdated, 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links - Span 5 */}
        <Card className="border border-border bg-card shadow-none md:col-span-5 rounded-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-normal tracking-tight">Hızlı Erişim</CardTitle>
            <CardDescription className="mt-1 text-sm">Sık kullanılan görünümler</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/cdr-records">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-md bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-medium text-foreground">CDR Kayıtları</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Ham kullanım kayıtlarını filtrele</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>
              
              <Link href="/kits">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-md bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <List className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-medium text-foreground">KIT Özeti</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Terminal aggregasyonlarını görüntüle</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>

              <Link href="/settings">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-md bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-medium text-foreground">Ayarlar</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Kimlik bilgilerini yönet</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
