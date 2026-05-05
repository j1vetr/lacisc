import React, { useState } from "react";
import { useLocation } from "wouter";
import { useGetKits, getGetKitsQueryKey } from "@workspace/api-client-react";
import { Search, ChevronDown, ChevronUp, ArrowUpDown, Terminal } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody as Body,
  TableCell as Cell,
  TableHead as Head,
  TableHeader as Header,
  TableRow as Row,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

export default function Kits() {
  const [, setLocation] = useLocation();
  const [kitNo, setKitNo] = useState("");
  const [sortBy, setSortBy] = useState<"totalGb" | "totalPrice" | "lastSeen" | undefined>("totalPrice");

  const [debouncedKitNo, setDebouncedKitNo] = useState("");

  // Simple debounce for search inputs
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKitNo(kitNo);
    }, 300);
    return () => clearTimeout(timer);
  }, [kitNo]);

  const { data: kits, isLoading } = useGetKits(
    { kitNo: debouncedKitNo || undefined, sortBy },
    { query: { queryKey: getGetKitsQueryKey({ kitNo: debouncedKitNo, sortBy }) } }
  );

  const toggleSort = (col: "totalGb" | "totalPrice" | "lastSeen") => {
    setSortBy(col);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return <ChevronDown className="w-3 h-3 ml-1" />; // API only supports desc for now based on params
  };

  const handleRowClick = (clickedKitNo: string) => {
    // Navigate to CDRs with this kit number pre-filled
    // We would need to pass this via state or URL params. Wouter handles simple paths best.
    // For now, we'll just push history state but ideally the CDR page would read from URL params
    window.sessionStorage.setItem("cdr_filter_kit", clickedKitNo);
    setLocation("/cdr-records");
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KIT Summary</h1>
          <p className="text-sm text-muted-foreground">Aggregated usage and billing by terminal identifier.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 shrink-0 p-4 bg-card border border-border rounded-lg shadow-sm">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search KIT Number..."
            className="pl-9 bg-background font-mono text-sm"
            value={kitNo}
            onChange={(e) => setKitNo(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="border border-border rounded-md bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-sm">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-sm">
            <Header className="sticky top-0 z-10 bg-card/95 backdrop-blur shadow-[0_1px_0_0_var(--color-border)]">
              <Row>
                <Head className="w-[200px] pl-6">Terminal KIT</Head>
                <Head className="w-[120px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("totalGb")}>
                  <div className="flex items-center justify-end">Total Volume (GB) <SortIcon col="totalGb" /></div>
                </Head>
                <Head className="w-[140px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("totalPrice")}>
                  <div className="flex items-center justify-end">Total Billed <SortIcon col="totalPrice" /></div>
                </Head>
                <Head className="w-[100px] text-right">Records</Head>
                <Head className="w-[120px] text-right">Last Period</Head>
                <Head className="w-[160px] text-right cursor-pointer hover:text-primary" onClick={() => toggleSort("lastSeen")}>
                  <div className="flex items-center justify-end">Last Seen <SortIcon col="lastSeen" /></div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <Row key={i}>
                    <Cell className="pl-6"><Skeleton className="h-6 w-32" /></Cell>
                    <Cell><Skeleton className="h-4 w-20 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-24 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-16 ml-auto" /></Cell>
                    <Cell><Skeleton className="h-4 w-24 ml-auto" /></Cell>
                  </Row>
                ))
              ) : kits?.length === 0 ? (
                <Row>
                  <Cell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No KITs found.
                  </Cell>
                </Row>
              ) : (
                kits?.map((row) => (
                  <Row 
                    key={row.kitNo} 
                    className="hover:bg-secondary/40 transition-colors cursor-pointer group"
                    onClick={() => handleRowClick(row.kitNo)}
                  >
                    <Cell className="font-mono font-medium pl-6 py-3">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        <Badge variant="outline" className="bg-background text-foreground border-border group-hover:border-primary/50 group-hover:text-primary transition-colors rounded font-mono px-2 py-0.5 tracking-tight text-sm">
                          {row.kitNo}
                        </Badge>
                      </div>
                    </Cell>
                    <Cell className="text-right font-mono text-sm">
                      {formatNumber(row.totalGb, 2)}
                    </Cell>
                    <Cell className="text-right font-mono text-sm font-medium text-primary">
                      {formatCurrency(row.totalPrice)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-muted-foreground">
                      {formatNumber(row.recordCount, 0)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-muted-foreground">
                      {row.lastPeriod || "-"}
                    </Cell>
                    <Cell className="text-right text-xs text-muted-foreground whitespace-nowrap pr-6">
                      {formatDate(row.lastSyncedAt)}
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        <div className="border-t border-border p-3 bg-card shrink-0 text-xs text-muted-foreground text-center">
          Showing {kits?.length || 0} unique terminals. Click a row to view specific CDRs.
        </div>
      </div>
    </div>
  );
}
