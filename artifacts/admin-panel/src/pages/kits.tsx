import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetKits,
  getGetKitsQueryKey,
  useListStationAccounts,
  getListStationAccountsQueryKey,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Search, ChevronDown, ArrowUpDown, Terminal, ArrowRight, Server, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
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

import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Kits() {
  useDocumentTitle("KIT Özeti");
  const [, setLocation] = useLocation();
  const [kitNo, setKitNo] = useState("");
  const [sortBy, setSortBy] = useState<"totalGib" | "lastSeen" | undefined>("totalGib");
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

  // Used to differentiate "no accounts configured" from "no matching kits".
  const { data: accounts } = useListStationAccounts({
    query: { queryKey: getListStationAccountsQueryKey(), staleTime: 60_000 },
  });
  const hasAccounts = (accounts?.length ?? 0) > 0;
  const hasFilter = debouncedKitNo.trim().length > 0;

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const role = ((me as { role?: string } | undefined)?.role ?? "viewer") as "owner" | "admin" | "viewer";
  const canManageAccounts = role === "owner" || role === "admin";

  const toggleSort = (col: "totalGib" | "lastSeen") => {
    setSortBy(col);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 group-hover:opacity-100" />;
    return <ChevronDown className="w-3 h-3 ml-1 text-primary" />; 
  };

  const handleRowClick = (clickedKitNo: string) => {
    setLocation(`/kits/${encodeURIComponent(clickedKitNo)}`);
  };

  return (
    <div className="space-y-6 lg:space-y-8 flex flex-col lg:h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 lg:gap-6 shrink-0">
        <div className="space-y-2">
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">KIT Özeti</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Terminal bazlı aggregasyonlar ve toplam kullanımlar.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 shrink-0">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ara: Terminal KIT..."
            className="pl-10 h-10 bg-card border-border rounded-lg font-mono text-sm shadow-none"
            value={kitNo}
            onChange={(e) => setKitNo(e.target.value)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-none">
        <div className="overflow-x-auto overflow-y-auto flex-1 relative -webkit-overflow-scrolling-touch">
          <Table className="relative w-full text-[13px]">
            <Header className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[240px] pl-4 sm:pl-8 font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Terminal No</Head>
                <Head className="w-[160px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12" onClick={() => toggleSort("totalGib")}>
                  <div className="flex items-center justify-end">Toplam Veri (GiB) <SortIcon col="totalGib" /></div>
                </Head>
                <Head className="w-[120px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Kayıt Sayısı</Head>
                <Head className="w-[120px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">Son Dönem</Head>
                <Head className="w-[180px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12 pr-4 sm:pr-8" onClick={() => toggleSort("lastSeen")}>
                  <div className="flex items-center justify-end">Son Güncelleme <SortIcon col="lastSeen" /></div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <Row key={i} className="border-none h-14">
                    <Cell className="pl-4 sm:pl-8"><Skeleton className="h-4 w-32 rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-20 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-12 ml-auto rounded" /></Cell>
                    <Cell><Skeleton className="h-4 w-16 ml-auto rounded" /></Cell>
                    <Cell className="pr-4 sm:pr-8"><Skeleton className="h-4 w-24 ml-auto rounded" /></Cell>
                  </Row>
                ))
              ) : kits?.length === 0 ? (
                <Row className="hover:bg-transparent border-none">
                  <Cell colSpan={5} className="h-64 text-center align-middle">
                    {!hasAccounts ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                          <Server className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Henüz portal hesabı yok
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            {canManageAccounts
                              ? "KIT verisi görmek için önce en az bir Station Satcom portal hesabı eklemelisiniz."
                              : "Henüz portal hesabı eklenmemiş. Bir yöneticinin Ayarlar'dan hesap eklemesi gerekiyor."}
                          </p>
                        </div>
                        {canManageAccounts && (
                          <Link href="/settings">
                            <Button className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none mt-1">
                              <Plus className="w-4 h-4 mr-2" /> Hesap Ekle
                            </Button>
                          </Link>
                        )}
                      </div>
                    ) : hasFilter ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                          <Search className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            "{debouncedKitNo}" ile eşleşen terminal yok
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Filtreyi temizleyip tüm terminalleri görebilirsiniz.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setKitNo("")}
                          className="rounded-lg shadow-none mt-1"
                        >
                          Filtreyi Temizle
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                          <Terminal className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Henüz KIT verisi yok
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            İlk senkronizasyon turundan sonra terminaller burada listelenir.
                          </p>
                        </div>
                        <Link href="/sync-logs">
                          <Button variant="outline" className="rounded-lg shadow-none mt-1">
                            Senkronizasyon Sayfasına Git
                          </Button>
                        </Link>
                      </div>
                    )}
                  </Cell>
                </Row>
              ) : (
                kits?.map((row) => (
                  <Row 
                    key={row.kitNo} 
                    className="hover:bg-secondary transition-all cursor-pointer group border-none h-14"
                    onClick={() => handleRowClick(row.kitNo)}
                  >
                    <Cell className="pl-4 sm:pl-8">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-secondary text-muted-foreground">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-mono text-[13px] text-foreground">{row.kitNo}</span>
                          <span className="text-[11px] text-muted-foreground truncate max-w-[220px]" title={row.shipName || undefined}>
                            {row.shipName || "—"}
                          </span>
                        </div>
                      </div>
                    </Cell>
                    <Cell className="text-right font-mono text-[13px] text-foreground">
                      {formatNumber(row.totalGib, 2)}
                    </Cell>
                    <Cell className="text-right font-mono text-xs text-muted-foreground">
                      {formatNumber(row.rowCount, 0)}
                    </Cell>
                    <Cell className="text-right font-mono text-[11px] text-foreground">
                      {row.lastPeriod || "-"}
                    </Cell>
                    <Cell className="text-right pr-4 sm:pr-8">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                          {formatDate(row.lastSyncedAt)}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </Cell>
                  </Row>
                ))
              )}
            </Body>
          </Table>
        </div>
        
        <div className="border-t border-border p-3 bg-card shrink-0 text-xs text-muted-foreground text-center">
          Toplam {kits?.length || 0} tekil terminal listeleniyor. Detaylı görünüm için bir satıra tıklayın.
        </div>
      </div>
    </div>
  );
}
