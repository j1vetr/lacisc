import React, { useState } from "react";
import {
  useGetSyncLogs,
  getGetSyncLogsQueryKey,
  useSyncNow,
  getGetDashboardSummaryQueryKey,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, RefreshCw, Clock } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncProgressPanel } from "@/components/sync-progress-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody as Body,
  TableCell as Cell,
  TableHead as Head,
  TableHeader as Header,
  TableRow as Row,
} from "@/components/ui/table";
import { formatNumber, formatDate } from "@/lib/format";

import { useDocumentTitle } from "@/hooks/use-document-title";

export default function SyncLogs() {
  useDocumentTitle("Senkronizasyon");
  const [page, setPage] = useState(1);
  const limit = 20;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isFetching } = useGetSyncLogs(
    { page, limit },
    { query: { queryKey: getGetSyncLogsQueryKey({ page, limit }), refetchInterval: 10000 } }
  );

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const canWrite = ((me as { role?: string } | undefined)?.role ?? "viewer") !== "viewer";
  const syncNowMutation = useSyncNow();
  const isSyncing =
    syncNowMutation.isPending ||
    data?.logs.some((l) => l.status === "running") === true;

  const handleSync = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: "Senkronizasyon Başladı",
          description: res.message || "Manuel senkronizasyon tetiklendi.",
        });
        queryClient.invalidateQueries({ queryKey: getGetSyncLogsQueryKey({ page, limit }) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: (err: Error) => {
        toast({
          title: "Senkronizasyon Başarısız",
          description: err.message || "Senkronizasyon başlatılamadı.",
          variant: "destructive",
        });
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-[#9fc9a2] text-foreground hover:bg-[#9fc9a2]/90 border-none shadow-none rounded-[9999px] px-3 font-medium text-[11px] tracking-wide"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> BAŞARILI</Badge>;
      case 'failed':
        return <Badge className="bg-[#dfa88f] text-foreground hover:bg-[#dfa88f]/90 border-none shadow-none rounded-[9999px] px-3 font-medium text-[11px] tracking-wide"><AlertCircle className="w-3.5 h-3.5 mr-1.5" /> BAŞARISIZ</Badge>;
      case 'running':
        return <Badge className="bg-[#9fbbe0] text-foreground hover:bg-[#9fbbe0]/90 border-none shadow-none rounded-[9999px] px-3 font-medium text-[11px] tracking-wide"><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> ÇALIŞIYOR</Badge>;
      default:
        return <Badge variant="outline" className="border-border text-muted-foreground shadow-none rounded-[9999px] px-3 font-medium text-[11px] tracking-wide uppercase"><Clock className="w-3.5 h-3.5 mr-1.5" /> BEKLEMEDE</Badge>;
    }
  };

  const getDuration = (start: string, end?: string | null) => {
    if (!end) return "-";
    try {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      const diffStr = ((e - s) / 1000).toFixed(1);
      return `${diffStr}s`;
    } catch {
      return "-";
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8 flex flex-col lg:h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 lg:gap-6 shrink-0">
        <div className="space-y-2">
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">Senkronizasyon Kayıtları</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Portal üzerinden yapılan tüm veri çekme işlemlerinin kronolojik dökümü.</p>
        </div>
        {canWrite && (
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none transition-colors h-10 px-5 text-sm font-medium shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "SENKRONİZE EDİLİYOR..." : "ŞİMDİ SENKRONİZE ET"}
          </Button>
        )}
      </div>

      {/* Live progress — only renders while running (panel auto-hides when idle) */}
      <div className="shrink-0">
        <SyncProgressPanel />
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-none">
        <div className="overflow-x-auto overflow-y-auto flex-1 relative">
          <Table className="relative w-full text-[13px]">
            <Header className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[160px] pl-4 sm:pl-8 font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Durum</Head>
                <Head className="w-[200px] font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Başlangıç</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Süre</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Bulunan Kayıt</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Eklenen</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Güncellenen</Head>
                <Head className="w-full pl-4 sm:pl-8 font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Hata / Mesaj</Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <Row key={i} className="border-none h-14">
                    <Cell className="pl-4 sm:pl-8"><Skeleton className="h-6 w-24 rounded-full" /></Cell>
                    <Cell><Skeleton className="h-4 w-32 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell className="pl-4 sm:pl-8"><Skeleton className="h-4 w-full max-w-lg rounded" /></Cell>
                  </Row>
                ))
              ) : data?.logs.length === 0 ? (
                <Row className="hover:bg-transparent border-none">
                  <Cell colSpan={7} className="h-48 text-center text-muted-foreground font-medium">
                    Kayıt yok.
                  </Cell>
                </Row>
              ) : (
                data?.logs.map((row) => (
                  <Row key={row.id} className="hover:bg-secondary transition-colors border-none h-14">
                    <Cell className="pl-4 sm:pl-8">
                      {getStatusBadge(row.status)}
                    </Cell>
                    <Cell className="text-[11px] font-mono text-foreground whitespace-nowrap">
                      {formatDate(row.startedAt)}
                    </Cell>
                    <Cell className="text-right text-[11px] font-mono text-muted-foreground">
                      {getDuration(row.startedAt, row.finishedAt)}
                    </Cell>
                    <Cell className="text-right font-mono text-[13px] text-foreground">
                      {row.recordsFound != null ? formatNumber(row.recordsFound, 0) : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-[13px] text-foreground">
                      {row.recordsInserted != null && row.recordsInserted > 0 ? `+${formatNumber(row.recordsInserted, 0)}` : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-[13px] text-foreground">
                      {row.recordsUpdated != null && row.recordsUpdated > 0 ? `+${formatNumber(row.recordsUpdated, 0)}` : "-"}
                    </Cell>
                    <Cell className="pl-4 sm:pl-8 text-xs pr-4 sm:pr-8">
                      <div className={`truncate max-w-[400px] xl:max-w-[700px] ${row.status === 'failed' ? 'text-destructive font-mono' : 'text-muted-foreground'}`} title={row.message || ""}>
                        {row.message || "-"}
                      </div>
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        {/* Pagination */}
        <div className="border-t border-border p-3 px-4 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card shrink-0">
          <div className="text-[12px] sm:text-[13px] text-muted-foreground flex items-center gap-3 flex-wrap">
            {isFetching && <span className="flex items-center text-primary"><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> Yükleniyor</span>}
            <span>Kayıtlar {((page - 1) * limit) + 1}-{Math.min(page * limit, data?.total || 0)} / {formatNumber(data?.total || 0, 0)}</span>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 rounded-lg px-4 text-xs font-medium border-border hover:bg-secondary shadow-none"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Yeni
            </Button>
            <div className="text-xs font-mono bg-secondary px-3 py-1.5 rounded-lg text-foreground">
              {page} / {data?.totalPages || 1}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="h-8 rounded-lg px-4 text-xs font-medium border-border hover:bg-secondary shadow-none" 
              onClick={() => setPage(p => p + 1)}
              disabled={page >= (data?.totalPages || 1) || isLoading}
            >
              Eski
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
