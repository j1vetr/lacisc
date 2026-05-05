import React, { useState } from "react";
import { useGetCdrRecords, getGetCdrRecordsQueryKey } from "@workspace/api-client-react";
import { Download, Search, ChevronDown, ChevronUp, ArrowUpDown, Filter } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody as Body,
  TableCell as Cell,
  TableHead as Head,
  TableHeader as Header,
  TableRow as Row,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

export default function CdrRecords() {
  const [page, setPage] = useState(1);
  const [kitNo, setKitNo] = useState("");
  const [period, setPeriod] = useState("");
  const [sortBy, setSortBy] = useState<"totalVolumeGbNumeric" | "totalPrice" | "syncedAt" | "startCdr" | undefined>("syncedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [debouncedKitNo, setDebouncedKitNo] = useState("");
  const [debouncedPeriod, setDebouncedPeriod] = useState("");

  // Simple debounce for search inputs
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKitNo(kitNo);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [kitNo]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPeriod(period);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [period]);

  const { data, isLoading, isFetching } = useGetCdrRecords(
    {
      page,
      limit: 50,
      kitNo: debouncedKitNo || undefined,
      period: debouncedPeriod || undefined,
      sortBy,
      sortOrder,
    },
    { query: { queryKey: getGetCdrRecordsQueryKey({
      page, limit: 50, kitNo: debouncedKitNo, period: debouncedPeriod, sortBy, sortOrder
    }) } }
  );

  const toggleSort = (col: "totalVolumeGbNumeric" | "totalPrice" | "syncedAt" | "startCdr") => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc"); // Default to desc for new sorts
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  const handleExport = () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    const url = new URL("/api/station/export-csv", window.location.origin);
    if (debouncedKitNo) url.searchParams.append("kitNo", debouncedKitNo);
    if (debouncedPeriod) url.searchParams.append("period", debouncedPeriod);

    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cdr-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Raw CDR Data</h1>
          <p className="text-sm text-muted-foreground">Comprehensive Call Detail Records from portal.</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 shrink-0 p-4 bg-card border border-border rounded-lg shadow-sm">
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search KIT Number..."
            className="pl-9 bg-background font-mono text-sm"
            value={kitNo}
            onChange={(e) => setKitNo(e.target.value)}
          />
        </div>
        <div className="relative w-40">
          <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Period (01/2024)"
            className="pl-9 bg-background font-mono text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="border border-border rounded-md bg-card flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-sm">
            <Header className="sticky top-0 z-10 bg-card/95 backdrop-blur shadow-[0_1px_0_0_var(--color-border)]">
              <Row>
                <Head className="w-[140px] pl-4">KIT No</Head>
                <Head className="w-[120px]">Period</Head>
                <Head className="w-[100px] cursor-pointer hover:text-primary" onClick={() => toggleSort("startCdr")}>
                  <div className="flex items-center">Date <SortIcon col="startCdr" /></div>
                </Head>
                <Head className="w-[120px]">Customer</Head>
                <Head className="w-[140px]">Product / Service</Head>
                <Head className="w-[100px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("totalVolumeGbNumeric")}>
                  <div className="flex items-center justify-end">GB <SortIcon col="totalVolumeGbNumeric" /></div>
                </Head>
                <Head className="w-[120px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("totalPrice")}>
                  <div className="flex items-center justify-end">Price <SortIcon col="totalPrice" /></div>
                </Head>
                <Head className="w-[160px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("syncedAt")}>
                  <div className="flex items-center justify-end">Synced <SortIcon col="syncedAt" /></div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <Row key={i}>
                    <Cell className="pl-4"><Skeleton className="h-6 w-24" /></Cell>
                    <Cell><Skeleton className="h-4 w-16" /></Cell>
                    <Cell><Skeleton className="h-4 w-20" /></Cell>
                    <Cell><Skeleton className="h-4 w-24" /></Cell>
                    <Cell><Skeleton className="h-4 w-32" /></Cell>
                    <Cell><Skeleton className="h-4 w-16 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-20 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-24 ml-auto" /></Cell>
                  </Row>
                ))
              ) : data?.records.length === 0 ? (
                <Row>
                  <Cell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No CDR records found matching the filters.
                  </Cell>
                </Row>
              ) : (
                data?.records.map((row) => (
                  <Row key={row.id} className="hover:bg-secondary/40 transition-colors">
                    <Cell className="font-mono font-medium pl-4 py-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 rounded font-mono px-2 py-0.5 tracking-tight">
                        {row.kitNo}
                      </Badge>
                    </Cell>
                    <Cell className="font-mono text-xs text-muted-foreground">{row.period || "-"}</Cell>
                    <Cell className="text-xs whitespace-nowrap">{row.startCdr ? row.startCdr.split(' ')[0] : "-"}</Cell>
                    <Cell className="text-xs truncate max-w-[120px]">{row.customerCode || "-"}</Cell>
                    <Cell className="text-xs">
                      <div className="truncate max-w-[140px] font-medium">{row.product || "-"}</div>
                      <div className="truncate max-w-[140px] text-muted-foreground">{row.service || "-"}</div>
                    </Cell>
                    <Cell className="text-right font-mono text-xs">
                      {row.totalVolumeGbNumeric != null ? formatNumber(row.totalVolumeGbNumeric, 4) : "-"}
                    </Cell>
                    <Cell className="text-right font-mono text-xs font-medium text-primary/90">
                      {row.currency} {formatNumber(row.totalPrice)}
                    </Cell>
                    <Cell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(row.syncedAt)}
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
            {isFetching && <span className="mr-4 animate-pulse">Loading...</span>}
            Showing {data?.records.length || 0} of {formatNumber(data?.total || 0, 0)} records
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Previous
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
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
