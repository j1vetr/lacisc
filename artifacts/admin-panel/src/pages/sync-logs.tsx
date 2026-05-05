import React, { useState } from "react";
import { useGetSyncLogs, getGetSyncLogsQueryKey } from "@workspace/api-client-react";
import { CheckCircle2, AlertCircle, RefreshCw, Clock } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody as Body,
  TableCell as Cell,
  TableHead as Head,
  TableHeader as Header,
  TableRow as Row,
} from "@/components/ui/table";
import { formatNumber, formatDate } from "@/lib/format";

export default function SyncLogs() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isFetching } = useGetSyncLogs(
    { page, limit },
    { query: { queryKey: getGetSyncLogsQueryKey({ page, limit }), refetchInterval: 10000 } }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 shadow-none rounded-full px-3"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Success</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 shadow-none rounded-full px-3"><AlertCircle className="w-3.5 h-3.5 mr-1.5" /> Failed</Badge>;
      case 'running':
        return <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20 shadow-none rounded-full px-3"><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running</Badge>;
      default:
        return <Badge variant="outline" className="shadow-none capitalize rounded-full px-3"><Clock className="w-3.5 h-3.5 mr-1.5" /> {status}</Badge>;
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
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 shrink-0">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sync History</h1>
          <p className="text-sm text-muted-foreground font-medium">Detailed logs of all portal scraping operations.</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur flex-1 overflow-hidden flex flex-col min-h-0 shadow-sm mt-2">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-sm">
            <Header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[160px] pl-8 font-semibold uppercase tracking-wider text-xs">Operation Status</Head>
                <Head className="w-[200px] font-semibold uppercase tracking-wider text-xs">Initiated At</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-wider text-xs">Runtime</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-wider text-xs">Parsed</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-wider text-xs">New</Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-wider text-xs">Updated</Head>
                <Head className="w-full pl-8 font-semibold uppercase tracking-wider text-xs">System Output</Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <Row key={i} className="border-none">
                    <Cell className="pl-8 py-3"><Skeleton className="h-6 w-24 rounded-full" /></Cell>
                    <Cell><Skeleton className="h-4 w-36 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell className="pl-8"><Skeleton className="h-4 w-full max-w-lg rounded" /></Cell>
                  </Row>
                ))
              ) : data?.logs.length === 0 ? (
                <Row className="hover:bg-transparent">
                  <Cell colSpan={7} className="h-48 text-center text-muted-foreground font-medium">
                    No sync operations recorded.
                  </Cell>
                </Row>
              ) : (
                data?.logs.map((row) => (
                  <Row key={row.id} className="hover:bg-secondary/20 transition-colors border-none">
                    <Cell className="pl-8 py-3.5">
                      {getStatusBadge(row.status)}
                    </Cell>
                    <Cell className="text-xs font-mono font-medium text-foreground/80 whitespace-nowrap">
                      {formatDate(row.startedAt)}
                    </Cell>
                    <Cell className="text-right text-xs font-mono font-medium text-muted-foreground">
                      {getDuration(row.startedAt, row.finishedAt)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs font-medium">
                      <span className="bg-secondary/50 px-2 py-0.5 rounded-md">{row.recordsFound != null ? formatNumber(row.recordsFound, 0) : "-"}</span>
                    </Cell>
                    <Cell className="text-right font-mono text-xs font-semibold text-green-500/90">
                      {row.recordsInserted != null && row.recordsInserted > 0 ? `+${formatNumber(row.recordsInserted, 0)}` : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-xs font-semibold text-primary/90">
                      {row.recordsUpdated != null && row.recordsUpdated > 0 ? `+${formatNumber(row.recordsUpdated, 0)}` : "-"}
                    </Cell>
                    <Cell className="pl-8 text-xs pr-8">
                      <div className={`truncate max-w-[400px] xl:max-w-[700px] ${row.status === 'failed' ? 'text-destructive font-mono font-medium' : 'text-muted-foreground'}`} title={row.message || ""}>
                        {row.message || "Operation completed normally"}
                      </div>
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        {/* Pagination */}
        <div className="border-t border-border/30 p-3 px-6 flex items-center justify-between bg-card/60 shrink-0 backdrop-blur-md">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-3">
            {isFetching && <span className="flex items-center text-primary"><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> Live tracking</span>}
            <span>Records {((page - 1) * limit) + 1}-{Math.min(page * limit, data?.total || 0)} of {formatNumber(data?.total || 0, 0)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 rounded-full px-4 text-xs font-medium border-border/60 hover:bg-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Newer
            </Button>
            <div className="text-xs font-semibold font-mono bg-secondary/50 px-3 py-1.5 rounded-full">
              {page} / {data?.totalPages || 1}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="h-8 rounded-full px-4 text-xs font-medium border-border/60 hover:bg-secondary" 
              onClick={() => setPage(p => p + 1)}
              disabled={page >= (data?.totalPages || 1) || isLoading}
            >
              Older
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
