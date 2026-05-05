import React, { useState } from "react";
import { useGetCdrRecords, getGetCdrRecordsQueryKey } from "@workspace/api-client-react";
import { Download, Search, ChevronDown, ChevronUp, ArrowUpDown, Filter } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export default function CdrRecords() {
  const [page, setPage] = useState(1);
  const [kitNo, setKitNo] = useState("");
  const [period, setPeriod] = useState("");
  const [sortBy, setSortBy] = useState<"totalVolumeGbNumeric" | "totalPrice" | "syncedAt" | "startCdr" | undefined>("syncedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [debouncedKitNo, setDebouncedKitNo] = useState(window.sessionStorage.getItem("cdr_filter_kit") || "");
  const [debouncedPeriod, setDebouncedPeriod] = useState("");

  React.useEffect(() => {
    if (debouncedKitNo) setKitNo(debouncedKitNo);
    window.sessionStorage.removeItem("cdr_filter_kit");
  }, []);

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
      setSortOrder("desc");
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 group-hover:opacity-100" />;
    return sortOrder === "asc" ? <ChevronUp className="w-3 h-3 ml-1 text-primary" /> : <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
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
    <div className="space-y-8 flex flex-col h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 shrink-0">
        <div className="space-y-2">
          <h1 className="text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">CDR Kayıtları</h1>
          <p className="text-base text-muted-foreground">Terminallere göre eşlenmiş ham kullanım kayıtları.</p>
        </div>
        <Button onClick={handleExport} className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-none h-10 px-5 text-sm font-medium">
          <Download className="w-4 h-4 mr-2" />
          CSV İndir
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 shrink-0">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ara: KIT No..."
            className="pl-10 h-10 bg-card border-border rounded-lg font-mono text-sm shadow-none"
            value={kitNo}
            onChange={(e) => setKitNo(e.target.value)}
          />
        </div>
        <div className="relative w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Dönem (MM/YYYY)"
            className="pl-10 h-10 bg-card border-border rounded-lg font-mono text-sm shadow-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-none">
        <div className="overflow-auto flex-1 relative">
          <Table className="relative w-full text-[13px]">
            <Header className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[140px] pl-6 font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Terminal</Head>
                <Head className="w-[100px] font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Dönem</Head>
                <Head className="w-[120px] cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12" onClick={() => toggleSort("startCdr")}>
                  <div className="flex items-center">Başlangıç <SortIcon col="startCdr" /></div>
                </Head>
                <Head className="w-[120px] font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Müşteri Kodu</Head>
                <Head className="w-[180px] font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Servis</Head>
                <Head className="w-[100px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12" onClick={() => toggleSort("totalVolumeGbNumeric")}>
                  <div className="flex items-center justify-end">Toplam Veri <SortIcon col="totalVolumeGbNumeric" /></div>
                </Head>
                <Head className="w-[120px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12" onClick={() => toggleSort("totalPrice")}>
                  <div className="flex items-center justify-end">Tutar <SortIcon col="totalPrice" /></div>
                </Head>
                <Head className="w-[160px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12 pr-6" onClick={() => toggleSort("syncedAt")}>
                  <div className="flex items-center justify-end">Senkronize Edildi <SortIcon col="syncedAt" /></div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <Row key={i} className="border-none">
                    <Cell className="pl-6 h-12"><Skeleton className="h-4 w-20 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-20 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-16 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-32 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-16 ml-auto rounded" /></Cell>
                    <Cell className="pr-6"><Skeleton className="h-4 w-24 ml-auto rounded" /></Cell>
                  </Row>
                ))
              ) : data?.records.length === 0 ? (
                <Row className="hover:bg-transparent border-none">
                  <Cell colSpan={8} className="h-48 text-center text-muted-foreground font-medium">
                    Kayıt yok.
                  </Cell>
                </Row>
              ) : (
                data?.records.map((row) => (
                  <Row key={row.id} className="hover:bg-secondary transition-colors border-none h-12">
                    <Cell className="pl-6 py-2">
                      <Badge variant="secondary" className="bg-secondary text-foreground border-none rounded-[4px] font-mono px-1.5 py-0.5 tracking-tight text-[11px]">
                        {row.kitNo}
                      </Badge>
                    </Cell>
                    <Cell className="font-mono text-xs text-muted-foreground">{row.period || "-"}</Cell>
                    <Cell className="text-xs whitespace-nowrap font-medium text-foreground">{row.startCdr ? row.startCdr.split(' ')[0] : "-"}</Cell>
                    <Cell className="text-xs truncate max-w-[120px] font-medium text-foreground">{row.customerCode || "-"}</Cell>
                    <Cell className="text-xs">
                      <div className="truncate max-w-[160px] font-medium text-foreground">{row.product || "-"}</div>
                      <div className="truncate max-w-[160px] text-muted-foreground mt-0.5">{row.service || "-"}</div>
                    </Cell>
                    <Cell className="text-right font-mono text-xs">
                      <span className="text-foreground">{row.totalVolumeGbNumeric != null ? formatNumber(row.totalVolumeGbNumeric, 4) : "-"}</span>
                    </Cell>
                    <Cell className="text-right font-mono text-[13px] font-medium text-foreground">
                      {formatCurrency(row.totalPrice, row.currency || "USD")}
                    </Cell>
                    <Cell className="text-right text-[11px] font-mono text-muted-foreground whitespace-nowrap pr-6">
                      {formatDate(row.syncedAt)}
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        {/* Pagination */}
        <div className="border-t border-border p-3 px-6 flex items-center justify-between bg-card shrink-0">
          <div className="text-[13px] text-muted-foreground">
            {isFetching && <span className="mr-4 text-primary">Yükleniyor...</span>}
            Toplam {formatNumber(data?.total || 0, 0)} kaydın {data?.records.length || 0} kadarı gösteriliyor
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 rounded-lg px-4 text-xs font-medium border-border hover:bg-secondary shadow-none"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Önceki
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
              Sonraki
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
