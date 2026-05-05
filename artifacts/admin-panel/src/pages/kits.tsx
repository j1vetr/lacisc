import React, { useState } from "react";
import { useLocation } from "wouter";
import { useGetKits, getGetKitsQueryKey } from "@workspace/api-client-react";
import { Search, ChevronDown, ArrowUpDown, Terminal, ArrowRight } from "lucide-react";

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
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 group-hover:opacity-100" />;
    return <ChevronDown className="w-3 h-3 ml-1 text-primary" />; 
  };

  const handleRowClick = (clickedKitNo: string) => {
    window.sessionStorage.setItem("cdr_filter_kit", clickedKitNo);
    setLocation("/cdr-records");
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 shrink-0">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terminal Directory</h1>
          <p className="text-sm text-muted-foreground font-medium">Aggregated performance and billing per KIT.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 shrink-0 p-1">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Terminal KIT..."
            className="pl-10 h-11 bg-card/40 border-border/50 rounded-xl font-mono text-sm shadow-sm backdrop-blur"
            value={kitNo}
            onChange={(e) => setKitNo(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur flex-1 overflow-hidden flex flex-col min-h-0 shadow-sm">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-sm">
            <Header className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[240px] pl-8 font-semibold uppercase tracking-wider text-xs">Terminal Identifier</Head>
                <Head className="w-[140px] text-right cursor-pointer hover:bg-secondary/30 transition-colors group font-semibold uppercase tracking-wider text-xs" onClick={() => toggleSort("totalGb")}>
                  <div className="flex items-center justify-end">Volume (GB) <SortIcon col="totalGb" /></div>
                </Head>
                <Head className="w-[160px] text-right cursor-pointer hover:bg-secondary/30 transition-colors group font-semibold uppercase tracking-wider text-xs" onClick={() => toggleSort("totalPrice")}>
                  <div className="flex items-center justify-end">Total Billed <SortIcon col="totalPrice" /></div>
                </Head>
                <Head className="w-[100px] text-right font-semibold uppercase tracking-wider text-xs">Entries</Head>
                <Head className="w-[120px] text-right font-semibold uppercase tracking-wider text-xs">Period</Head>
                <Head className="w-[180px] text-right cursor-pointer hover:bg-secondary/30 transition-colors group font-semibold uppercase tracking-wider text-xs pr-8" onClick={() => toggleSort("lastSeen")}>
                  <div className="flex items-center justify-end">Last Updated <SortIcon col="lastSeen" /></div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <Row key={i} className="border-none">
                    <Cell className="pl-8 py-4"><Skeleton className="h-6 w-32 rounded-md" /></Cell>
                    <Cell><Skeleton className="h-5 w-20 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-5 w-24 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-5 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-5 w-16 ml-auto rounded" /></Cell>
                    <Cell className="pr-8"><Skeleton className="h-5 w-24 ml-auto rounded" /></Cell>
                  </Row>
                ))
              ) : kits?.length === 0 ? (
                <Row className="hover:bg-transparent">
                  <Cell colSpan={6} className="h-48 text-center text-muted-foreground font-medium">
                    No terminals matched your search.
                  </Cell>
                </Row>
              ) : (
                kits?.map((row) => (
                  <Row 
                    key={row.kitNo} 
                    className="hover:bg-secondary/30 transition-all cursor-pointer group border-none"
                    onClick={() => handleRowClick(row.kitNo)}
                  >
                    <Cell className="pl-8 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-secondary/50 group-hover:bg-primary/10 transition-colors">
                          <Terminal className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <Badge variant="secondary" className="bg-transparent text-foreground border-border group-hover:border-primary/30 group-hover:text-primary transition-colors rounded-md font-mono px-2.5 py-1 tracking-tight text-[13px] shadow-sm">
                          {row.kitNo}
                        </Badge>
                      </div>
                    </Cell>
                    <Cell className="text-right font-mono text-sm font-medium text-foreground/90">
                      {formatNumber(row.totalGb, 2)}
                    </Cell>
                    <Cell className="text-right font-mono text-sm font-semibold text-green-500/90">
                      {formatCurrency(row.totalPrice)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-muted-foreground">
                      <span className="bg-secondary/50 px-2 py-0.5 rounded-full">{formatNumber(row.recordCount, 0)}</span>
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-muted-foreground font-medium">
                      {row.lastPeriod || "-"}
                    </Cell>
                    <Cell className="text-right pr-8">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {formatDate(row.lastSyncedAt)}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        <div className="border-t border-border/30 p-3 bg-card/60 shrink-0 text-xs font-medium text-muted-foreground text-center backdrop-blur-md">
          {kits?.length || 0} unique terminals available. Click a row to inspect detailed billing entries.
        </div>
      </div>
    </div>
  );
}
