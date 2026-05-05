import React, { useState } from "react";
import { useGetSyncLogs, getGetSyncLogsQueryKey } from "@workspace/api-client-react";
import { Activity, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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
    { query: { queryKey: getGetSyncLogsQueryKey({ page, limit }), refetchInterval: 10000 } } // Auto-refresh logs
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 shadow-none"><CheckCircle2 className="w-3 h-3 mr-1" /> Success</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 shadow-none"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case 'running':
        return <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20 shadow-none"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running</Badge>;
      default:
        return <Badge variant="outline" className="shadow-none capitalize">{status}</Badge>;
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
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sync History</h1>
          <p className="text-sm text-muted-foreground">Log of automated and manual portal scraper runs.</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="border border-border rounded-md bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-sm">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-sm">
            <Header className="sticky top-0 z-10 bg-card/95 backdrop-blur shadow-[0_1px_0_0_var(--color-border)]">
              <Row>
                <Head className="w-[120px] pl-6">Status</Head>
                <Head className="w-[180px]">Started At</Head>
                <Head className="w-[100px] text-right">Duration</Head>
                <Head className="w-[100px] text-right">Found</Head>
                <Head className="w-[100px] text-right">Inserted</Head>
                <Head className="w-[100px] text-right">Updated</Head>
                <Head className="w-full pl-6">Message / Error</Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <Row key={i}>
                    <Cell className="pl-6"><Skeleton className="h-6 w-20" /></Cell>
                    <Cell><Skeleton className="h-4 w-32" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto" /></Cell>
                    <Cell className="pl-6"><Skeleton className="h-4 w-full max-w-md" /></Cell>
                  </Row>
                ))
              ) : data?.logs.length === 0 ? (
                <Row>
                  <Cell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No sync logs recorded yet.
                  </Cell>
                </Row>
              ) : (
                data?.logs.map((row) => (
                  <Row key={row.id} className="hover:bg-secondary/40 transition-colors">
                    <Cell className="pl-6 py-3">
                      {getStatusBadge(row.status)}
                    </Cell>
                    <Cell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(row.startedAt)}
                    </Cell>
                    <Cell className="text-right text-xs font-mono text-muted-foreground">
                      {getDuration(row.startedAt, row.finishedAt)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs">
                      {row.recordsFound != null ? formatNumber(row.recordsFound, 0) : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-green-500/80">
                      {row.recordsInserted != null ? formatNumber(row.recordsInserted, 0) : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-primary/80">
                      {row.recordsUpdated != null ? formatNumber(row.recordsUpdated, 0) : "-"}
                    </Cell>
                    <Cell className="pl-6 text-xs pr-6">
                      <div className={`truncate max-w-[400px] xl:max-w-[600px] ${row.status === 'failed' ? 'text-destructive font-mono' : 'text-muted-foreground'}`} title={row.message || ""}>
                        {row.message || "-"}
                      </div>
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        {/* Pagination Footer */}
        <div className="border-t border-border p-3 flex items-center justify-between bg-card shrink-0">
          <div className="text-xs text-muted-foreground">
            {isFetching && <span className="mr-4 animate-pulse text-primary">Refreshing...</span>}
            Showing {data?.logs.length || 0} of {formatNumber(data?.total || 0, 0)} logs
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Newer
            </Button>
            <div className="text-xs font-medium mx-2 font-mono">
              Page {page} of {data?.totalPages || 1}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="h-8" 
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
