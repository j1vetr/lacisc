import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetKits,
  getGetKitsQueryKey,
  useListStationAccounts,
  getListStationAccountsQueryKey,
  useGetStarlinkTerminals,
  getGetStarlinkTerminalsQueryKey,
  useGetStarlinkSettings,
  getGetStarlinkSettingsQueryKey,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import {
  Search,
  ChevronDown,
  ArrowUpDown,
  Terminal,
  ArrowRight,
  Server,
  Plus,
  Satellite,
} from "lucide-react";

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

// Unified row type that covers both Satcom (CDR-aggregated) and Starlink
// (snapshot from Tototheo). `source` drives the badge + the column meanings.
type UnifiedRow = {
  source: "satcom" | "starlink";
  kitNo: string;
  shipName: string | null;
  totalGib: number | null;
  rowCountOrAlerts: number;
  lastPeriod: string | null;
  lastSyncedAt: string | null;
};

export default function Kits() {
  useDocumentTitle("KIT Özeti");
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"totalGib" | "lastSeen">("totalGib");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Satcom kits — server-side filter + sort.
  const { data: satcomKits, isLoading: satcomLoading } = useGetKits(
    { kitNo: debouncedSearch || undefined, sortBy },
    {
      query: {
        queryKey: getGetKitsQueryKey({ kitNo: debouncedSearch, sortBy }),
      },
    }
  );

  // Starlink terminals — fetched only when integration is enabled (cheap
  // settings ping decides this so we don't waste the Tototheo rate budget
  // on operators who only have Satcom).
  const { data: starlinkSettings } = useGetStarlinkSettings({
    query: { queryKey: getGetStarlinkSettingsQueryKey(), staleTime: 60_000 },
  });
  const starlinkActive = !!starlinkSettings?.enabled && !!starlinkSettings?.hasToken;
  const { data: starlinkTerminals, isLoading: starlinkLoading } =
    useGetStarlinkTerminals({
      query: {
        queryKey: getGetStarlinkTerminalsQueryKey(),
        enabled: starlinkActive,
      },
    });

  // Used to differentiate "no accounts configured" from "no matching kits".
  const { data: accounts } = useListStationAccounts({
    query: { queryKey: getListStationAccountsQueryKey(), staleTime: 60_000 },
  });
  const hasSatcomAccounts = (accounts?.length ?? 0) > 0;

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const role = ((me as { role?: string } | undefined)?.role ?? "viewer") as
    | "owner"
    | "admin"
    | "viewer";
  const canManageAccounts = role === "owner" || role === "admin";

  // Merge both sources into one list.
  const unified: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: k.shipName ?? null,
        totalGib: k.totalGib ?? null,
        rowCountOrAlerts: k.rowCount ?? 0,
        lastPeriod: k.lastPeriod ?? null,
        lastSyncedAt: k.lastSyncedAt ?? null,
      });
    }
    for (const t of starlinkTerminals ?? []) {
      const label = t.nickname || t.assetName || null;
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: label,
        totalGib: t.currentPeriodTotalGb ?? null,
        rowCountOrAlerts: t.activeAlertsCount ?? 0,
        lastPeriod: null,
        lastSyncedAt: t.updatedAt ?? null,
      });
    }
    // Apply search filter to merged list (Satcom is already server-filtered;
    // Starlink filtered client-side here so the search box covers both).
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = q
      ? out.filter(
          (r) =>
            r.kitNo.toLowerCase().includes(q) ||
            (r.shipName ?? "").toLowerCase().includes(q)
        )
      : out;
    // Sort the merged set (server sort doesn't span sources).
    filtered.sort((a, b) => {
      if (sortBy === "lastSeen") {
        const at = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
        const bt = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
        return bt - at;
      }
      return (b.totalGib ?? 0) - (a.totalGib ?? 0);
    });
    return filtered;
  }, [satcomKits, starlinkTerminals, debouncedSearch, sortBy]);

  const isLoading =
    satcomLoading || (starlinkActive && starlinkLoading);
  const hasFilter = debouncedSearch.trim().length > 0;
  const hasAnySource = hasSatcomAccounts || starlinkActive;

  const toggleSort = (col: "totalGib" | "lastSeen") => setSortBy(col);
  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col)
      return (
        <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 group-hover:opacity-100" />
      );
    return <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const handleRowClick = (kitNo: string) => {
    setLocation(`/kits/${encodeURIComponent(kitNo)}`);
  };

  const satcomCount = unified.filter((r) => r.source === "satcom").length;
  const starlinkCount = unified.filter((r) => r.source === "starlink").length;

  return (
    <div className="space-y-6 lg:space-y-8 flex flex-col lg:h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 lg:gap-6 shrink-0">
        <div className="space-y-2">
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">
            KIT Özeti
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Satcom CDR aggregasyonları + Starlink (Tototheo) terminalleri tek listede.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 shrink-0 items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ara: KIT no veya gemi/etiket..."
            className="pl-10 h-10 bg-card border-border rounded-lg font-mono text-sm shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge className="bg-[#fde0d0] text-[#a4400a] border-[#f4b896] hover:bg-[#fde0d0] uppercase tracking-widest text-[10px] font-semibold">
            Satcom · {satcomCount}
          </Badge>
          {starlinkActive && (
            <Badge className="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] hover:bg-[#dde9f7] uppercase tracking-widest text-[10px] font-semibold">
              Tototheo · {starlinkCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card flex-1 overflow-hidden flex flex-col min-h-0 shadow-none">
        <div className="overflow-x-auto overflow-y-auto flex-1 relative -webkit-overflow-scrolling-touch">
          <Table className="relative w-full text-[13px]">
            <Header className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <Row className="hover:bg-transparent border-none">
                <Head className="w-[260px] pl-4 sm:pl-8 font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">
                  Terminal
                </Head>
                <Head className="w-[110px] font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">
                  Kaynak
                </Head>
                <Head
                  className="w-[160px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12"
                  onClick={() => toggleSort("totalGib")}
                >
                  <div className="flex items-center justify-end">
                    Dönem GB <SortIcon col="totalGib" />
                  </div>
                </Head>
                <Head className="w-[120px] text-right font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12">
                  Kayıt / Uyarı
                </Head>
                <Head
                  className="w-[180px] text-right cursor-pointer hover:bg-secondary transition-colors group font-semibold uppercase tracking-widest text-[11px] text-muted-foreground h-12 pr-4 sm:pr-8"
                  onClick={() => toggleSort("lastSeen")}
                >
                  <div className="flex items-center justify-end">
                    Son Güncelleme <SortIcon col="lastSeen" />
                  </div>
                </Head>
              </Row>
            </Header>
            <Body className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <Row key={i} className="border-none h-14">
                    <Cell className="pl-4 sm:pl-8">
                      <Skeleton className="h-4 w-32 rounded" />
                    </Cell>
                    <Cell>
                      <Skeleton className="h-4 w-16 rounded" />
                    </Cell>
                    <Cell>
                      <Skeleton className="h-4 w-20 ml-auto rounded" />
                    </Cell>
                    <Cell>
                      <Skeleton className="h-4 w-12 ml-auto rounded" />
                    </Cell>
                    <Cell className="pr-4 sm:pr-8">
                      <Skeleton className="h-4 w-24 ml-auto rounded" />
                    </Cell>
                  </Row>
                ))
              ) : unified.length === 0 ? (
                <Row className="hover:bg-transparent border-none">
                  <Cell colSpan={5} className="h-64 text-center align-middle">
                    {!hasAnySource ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                          <Server className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Henüz veri kaynağı yok
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            {canManageAccounts
                              ? "KIT verisi görmek için bir Satcom portal hesabı ekleyin veya Starlink (Tototheo) entegrasyonunu açın."
                              : "Henüz veri kaynağı yok. Bir yöneticinin Ayarlar'dan kaynak eklemesi gerekiyor."}
                          </p>
                        </div>
                        {canManageAccounts && (
                          <div className="flex gap-2">
                            <Link href="/settings">
                              <Button className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none mt-1">
                                <Plus className="w-4 h-4 mr-2" /> Satcom Hesap
                              </Button>
                            </Link>
                            <Link href="/settings/starlink">
                              <Button
                                variant="outline"
                                className="rounded-lg shadow-none mt-1"
                              >
                                <Satellite className="w-4 h-4 mr-2" /> Starlink Aç
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : hasFilter ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                          <Search className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            "{debouncedSearch}" ile eşleşen terminal yok
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Filtreyi temizleyip tüm terminalleri görebilirsiniz.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setSearch("")}
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
                          <Button
                            variant="outline"
                            className="rounded-lg shadow-none mt-1"
                          >
                            Senkronizasyon Sayfasına Git
                          </Button>
                        </Link>
                      </div>
                    )}
                  </Cell>
                </Row>
              ) : (
                unified.map((row) => {
                  const isStar = row.source === "starlink";
                  return (
                    <Row
                      key={`${row.source}:${row.kitNo}`}
                      className="hover:bg-secondary transition-all cursor-pointer group border-none h-14"
                      onClick={() => handleRowClick(row.kitNo)}
                    >
                      <Cell className="pl-4 sm:pl-8">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-md bg-secondary text-muted-foreground">
                            {isStar ? (
                              <Satellite className="w-4 h-4" />
                            ) : (
                              <Terminal className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-[13px] text-foreground truncate max-w-[220px]">
                              {row.kitNo}
                            </span>
                            <span
                              className="text-[11px] text-muted-foreground truncate max-w-[220px]"
                              title={row.shipName || undefined}
                            >
                              {row.shipName || "—"}
                            </span>
                          </div>
                        </div>
                      </Cell>
                      <Cell>
                        {isStar ? (
                          <Badge className="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0] hover:bg-[#dde9f7] uppercase tracking-widest text-[9px] font-semibold">
                            Tototheo
                          </Badge>
                        ) : (
                          <Badge className="bg-[#fde0d0] text-[#a4400a] border-[#f4b896] hover:bg-[#fde0d0] uppercase tracking-widest text-[9px] font-semibold">
                            Satcom
                          </Badge>
                        )}
                      </Cell>
                      <Cell className="text-right font-mono text-[13px] text-foreground">
                        {formatNumber(row.totalGib, 2)}
                      </Cell>
                      <Cell className="text-right font-mono text-xs text-muted-foreground">
                        {isStar ? (
                          row.rowCountOrAlerts > 0 ? (
                            <span className="text-[#a4400a]">
                              {row.rowCountOrAlerts} uyarı
                            </span>
                          ) : (
                            "0 uyarı"
                          )
                        ) : (
                          formatNumber(row.rowCountOrAlerts, 0)
                        )}
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
                  );
                })
              )}
            </Body>
          </Table>
        </div>

        <div className="border-t border-border p-3 bg-card shrink-0 text-xs text-muted-foreground text-center">
          Toplam {unified.length} terminal listeleniyor. Detaylı görünüm için bir satıra tıklayın.
        </div>
      </div>
    </div>
  );
}
