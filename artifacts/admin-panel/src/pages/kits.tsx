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
  useGetLeobridgeTerminals,
  getGetLeobridgeTerminalsQueryKey,
  useGetLeobridgeSettings,
  getGetLeobridgeSettingsQueryKey,
  useGetMe,
  getGetMeQueryKey,
  useDeleteStarlinkTerminal,
  useDeleteLeobridgeTerminal,
  useUpdateKitManualPlan,
  useUpdateStarlinkTerminalManualPlan,
  useUpdateLeobridgeTerminalManualPlan,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Terminal,
  Server,
  Plus,
  Satellite,
  Trash2,
  Loader2,
  Pencil,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, gibToGb } from "@/lib/format";

import { useDocumentTitle } from "@/hooks/use-document-title";

type Source = "satcom" | "starlink" | "leobridge";

type UnifiedRow = {
  source: Source;
  kitNo: string;
  shipName: string | null;
  totalGb: number | null;
  planGb: number | null;
  manualPlanGb: number | null;
  // Satcom: portal'da KIT görünüyor (telemetri/lokasyon var) ama bu hesapta
  // henüz hiç fatura/CDR üretmemiş. Listede rozet ile işaretlenir.
  isIdle?: boolean;
};

const SOURCE_CLASS: Record<Source, string> = {
  satcom: "bg-[#a4400a] dark:bg-[#f4b896]",
  starlink: "bg-[#2563a6] dark:bg-[#9fbbe0]",
  leobridge: "bg-[#3a3aa6] dark:bg-[#a6a6dd]",
};
const SOURCE_LABEL: Record<Source, string> = {
  satcom: "SATCOM",
  starlink: "TOTOTHEO",
  leobridge: "NORWAY",
};

export default function Kits() {
  useDocumentTitle("KIT Özeti");
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const role = ((me as { role?: string } | undefined)?.role ?? "viewer") as
    | "owner"
    | "admin"
    | "viewer"
    | "customer";
  const isCustomer = role === "customer";

  const { data: satcomKits, isLoading: satcomLoading } = useGetKits(
    { kitNo: debouncedSearch || undefined, sortBy: "totalGib" },
    {
      query: {
        queryKey: getGetKitsQueryKey({ kitNo: debouncedSearch, sortBy: "totalGib" }),
      },
    }
  );

  const { data: starlinkSettings } = useGetStarlinkSettings({
    query: {
      queryKey: getGetStarlinkSettingsQueryKey(),
      staleTime: 60_000,
      enabled: !isCustomer,
    },
  });
  const starlinkActive = isCustomer
    ? true
    : !!starlinkSettings?.enabled && !!starlinkSettings?.hasToken;
  const { data: starlinkTerminals, isLoading: starlinkLoading } =
    useGetStarlinkTerminals({
      query: {
        queryKey: getGetStarlinkTerminalsQueryKey(),
        enabled: starlinkActive,
      },
    });

  const { data: leobridgeSettings } = useGetLeobridgeSettings({
    query: {
      queryKey: getGetLeobridgeSettingsQueryKey(),
      staleTime: 60_000,
      enabled: !isCustomer,
    },
  });
  const leobridgeActive = isCustomer
    ? true
    : !!leobridgeSettings?.enabled && !!leobridgeSettings?.hasPassword;
  const { data: leobridgeTerminals, isLoading: leobridgeLoading } =
    useGetLeobridgeTerminals({
      query: {
        queryKey: getGetLeobridgeTerminalsQueryKey(),
        enabled: leobridgeActive,
      },
    });

  const { data: accounts } = useListStationAccounts({
    query: {
      queryKey: getListStationAccountsQueryKey(),
      staleTime: 60_000,
      enabled: !isCustomer,
    },
  });
  const hasSatcomAccounts = isCustomer
    ? (satcomKits?.length ?? 0) > 0
    : (accounts?.length ?? 0) > 0;
  const canManageAccounts = role === "owner" || role === "admin";

  const unified: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: k.shipName ?? null,
        totalGb: gibToGb(k.totalGib),
        planGb: k.planAllowanceGb ?? null,
        manualPlanGb: k.manualPlanGb ?? null,
        isIdle: k.lastPeriod == null,
      });
    }
    for (const t of starlinkTerminals ?? []) {
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname || t.assetName || null,
        totalGb: t.currentPeriodTotalGb ?? null,
        planGb: t.manualPlanGb ?? t.planAllowanceGb ?? null,
        manualPlanGb: t.manualPlanGb ?? null,
      });
    }
    for (const t of leobridgeTerminals ?? []) {
      out.push({
        source: "leobridge",
        kitNo: t.kitSerialNumber,
        shipName: t.nickname ?? null,
        totalGb: t.currentPeriodTotalGb ?? null,
        planGb: t.manualPlanGb ?? t.planAllowanceGb ?? null,
        manualPlanGb: t.manualPlanGb ?? null,
      });
    }
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = q
      ? out.filter(
          (r) =>
            r.kitNo.toLowerCase().includes(q) ||
            (r.shipName ?? "").toLowerCase().includes(q)
        )
      : out;
    filtered.sort((a, b) => (b.totalGb ?? 0) - (a.totalGb ?? 0));
    return filtered;
  }, [satcomKits, starlinkTerminals, leobridgeTerminals, debouncedSearch]);

  const isLoading =
    satcomLoading ||
    (starlinkActive && starlinkLoading) ||
    (leobridgeActive && leobridgeLoading);
  const hasFilter = debouncedSearch.trim().length > 0;
  const hasAnySource = isCustomer
    ? true
    : hasSatcomAccounts || starlinkActive || leobridgeActive;
  const customerHasNoAssignments =
    isCustomer &&
    !satcomLoading &&
    !starlinkLoading &&
    !leobridgeLoading &&
    (satcomKits?.length ?? 0) === 0 &&
    (starlinkTerminals?.length ?? 0) === 0 &&
    (leobridgeTerminals?.length ?? 0) === 0;

  const handleRowClick = (kitNo: string, source: Source) => {
    const prefix =
      source === "starlink" ? "/starlink" : source === "leobridge" ? "/norway" : "/kits";
    setLocation(`${prefix}/${encodeURIComponent(kitNo)}`);
  };

  const counts = {
    satcom: unified.filter((r) => r.source === "satcom").length,
    starlink: unified.filter((r) => r.source === "starlink").length,
    leobridge: unified.filter((r) => r.source === "leobridge").length,
  };

  // Grid kolonları:
  // mobil (default): "Terminal | (Dönem+Kota tek hücrede sağda)" → 2 kolon
  // sm+:             "Terminal | Dönem GB | Kota" → 3 kolon
  const GRID = "grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_220px] gap-x-3 sm:gap-x-6 items-center";

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      {/* Header — başlık + UPPERCASE sayım soldan, arama sağdan */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2 min-w-0 w-full sm:w-auto">
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">
            KIT Özeti
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] tracking-[0.12em] uppercase text-muted-foreground font-medium tabular-nums">
            <span>{unified.length} TERMİNAL</span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_CLASS.satcom}`} />
              {counts.satcom} SATCOM
            </span>
            {starlinkActive && (
              <>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_CLASS.starlink}`} />
                  {counts.starlink} TOTOTHEO
                </span>
              </>
            )}
            {leobridgeActive && (
              <>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${SOURCE_CLASS.leobridge}`} />
                  {counts.leobridge} NORWAY
                </span>
              </>
            )}
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="KIT no veya gemi ara…"
            className="pl-10 h-10 bg-card border-border rounded-lg font-mono text-sm shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tablo — eyebrow header + hairline ayraçlar */}
      <div>
        <div className={`${GRID} px-1 py-2.5 border-b border-border`}>
          <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Terminal
          </span>
          <span className="hidden sm:block text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium text-right">
            Dönem GB
          </span>
          <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium text-right">
            <span className="sm:hidden">Kullanım</span>
            <span className="hidden sm:inline">Kota</span>
          </span>
        </div>

        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={`${GRID} px-1 py-3.5 border-b border-border`}>
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="w-1.5 h-1.5 rounded-full" />
                <div className="flex flex-col gap-1.5 min-w-0">
                  <Skeleton className="h-3.5 w-32 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
              <Skeleton className="h-4 w-16 ml-auto rounded hidden sm:block" />
              <Skeleton className="h-4 w-32 ml-auto rounded" />
            </div>
          ))
        ) : unified.length === 0 ? (
          <EmptyState
            customerHasNoAssignments={customerHasNoAssignments}
            hasAnySource={hasAnySource}
            hasFilter={hasFilter}
            debouncedSearch={debouncedSearch}
            canManageAccounts={canManageAccounts}
            isCustomer={isCustomer}
            onClearFilter={() => setSearch("")}
          />
        ) : (
          unified.map((r) => {
            const pct =
              r.planGb && r.planGb > 0 && r.totalGb != null
                ? Math.min(100, (r.totalGb / r.planGb) * 100)
                : null;
            const warn = pct !== null && pct >= 80;
            const canDelete =
              canManageAccounts &&
              (r.source === "starlink" || r.source === "leobridge");
            const canEdit = canManageAccounts;
            const rowPadding = canDelete && canEdit
              ? "pr-[72px]"
              : canDelete || canEdit
                ? "pr-9"
                : "";
            return (
              <div
                key={`${r.source}:${r.kitNo}`}
                className="relative group border-b border-border"
              >
                <button
                  onClick={() => handleRowClick(r.kitNo, r.source)}
                  className={`${GRID} w-full text-left px-1 py-3.5 hover:bg-secondary/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${rowPadding}`}
                >
                {/* Terminal */}
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${SOURCE_CLASS[r.source]}`}
                    title={SOURCE_LABEL[r.source]}
                  />
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[13px] sm:text-[14px] font-medium text-foreground truncate"
                      title={r.shipName || undefined}
                    >
                      {r.shipName || "—"}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] text-muted-foreground truncate">
                        {r.kitNo}
                      </span>
                      {/* Mobilde: Dönem GB sayısını KIT no yanında inline göster */}
                      <span className="sm:hidden font-mono text-[11px] text-foreground/70 whitespace-nowrap">
                        · {formatNumber(r.totalGb, 2)} GB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dönem GB — sadece sm+ */}
                <div className="hidden sm:block text-right font-mono text-[14px] text-foreground tabular-nums">
                  {formatNumber(r.totalGb, 2)}
                </div>

                {/* Kota / Kullanım barı */}
                <div className="flex items-center justify-end gap-3 min-w-0">
                  {r.isIdle ? (
                    <span
                      className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded-full px-2 py-0.5 whitespace-nowrap"
                      title="Bu hesapta henüz fatura/CDR üretmemiş — telemetri/lokasyon mevcut"
                    >
                      Henüz kullanım yok
                    </span>
                  ) : pct !== null ? (
                    <>
                      <div className="hidden sm:block flex-1 max-w-[110px] h-[3px] rounded-full bg-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${warn ? "bg-primary" : "bg-foreground"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className={`font-mono text-[11px] sm:text-[12px] whitespace-nowrap tabular-nums ${
                          warn ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        <span className="sm:hidden">%{Math.round(pct)} · </span>
                        {r.planGb} GB
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Tarifesiz
                    </span>
                  )}
                </div>
                </button>
                {canEdit && (
                  <KitManualPlanButton
                    source={r.source}
                    kitNo={r.kitNo}
                    shipName={r.shipName}
                    currentManualPlanGb={r.manualPlanGb}
                    offsetRight={canDelete ? "right-9" : "right-1"}
                  />
                )}
                {canDelete && r.source !== "satcom" && (
                  <KitDeleteButton
                    source={r.source}
                    kitNo={r.kitNo}
                    shipName={r.shipName}
                  />
                )}
              </div>
            );
          })
        )}

        {!isLoading && unified.length > 0 && (
          <div className={`${GRID} px-1 py-3.5`}>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Toplam
            </span>
            <span className="hidden sm:block text-right font-mono text-[13px] text-foreground tabular-nums">
              {formatNumber(
                unified.reduce((s, r) => s + (r.totalGb ?? 0), 0),
                2
              )}
            </span>
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

function KitManualPlanButton({
  source,
  kitNo,
  shipName,
  currentManualPlanGb,
  offsetRight,
}: {
  source: Source;
  kitNo: string;
  shipName: string | null;
  currentManualPlanGb: number | null;
  offsetRight: "right-1" | "right-9";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const updateSatcom = useUpdateKitManualPlan();
  const updateStarlink = useUpdateStarlinkTerminalManualPlan();
  const updateLeobridge = useUpdateLeobridgeTerminalManualPlan();

  const mutation =
    source === "starlink"
      ? updateStarlink
      : source === "leobridge"
        ? updateLeobridge
        : updateSatcom;

  const isPending = mutation.isPending;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue(currentManualPlanGb != null ? String(currentManualPlanGb) : "");
    setOpen(true);
  };

  const handleSave = () => {
    const trimmed = value.trim();
    const manualPlanGb = trimmed === "" ? null : parseFloat(trimmed);
    if (trimmed !== "" && (isNaN(manualPlanGb!) || manualPlanGb! < 0)) {
      toast({ title: "Geçersiz değer", description: "GB değeri 0 veya üzeri bir sayı olmalı.", variant: "destructive" });
      return;
    }

    const params =
      source === "satcom"
        ? { kitNo, data: { manualPlanGb } }
        : { kit: kitNo, data: { manualPlanGb } };

    (mutation.mutate as (p: typeof params, opts: object) => void)(params, {
      onSuccess: () => {
        toast({
          title: manualPlanGb == null ? "Kota Override Temizlendi" : "Kota Override Kaydedildi",
          description:
            manualPlanGb == null
              ? `${kitNo} için manuel kota kaldırıldı, otomatik değer kullanılacak.`
              : `${kitNo} için kota ${manualPlanGb} GB olarak ayarlandı.`,
        });
        queryClient.invalidateQueries();
        setOpen(false);
      },
      onError: (err: unknown) => {
        toast({
          title: "Kayıt Başarısız",
          description: (err instanceof Error ? err.message : null) || "Kota güncellenemedi.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <>
      <button
        type="button"
        title="Manuel kota düzenle"
        aria-label="Manuel kota düzenle"
        onClick={handleOpen}
        className={`absolute ${offsetRight} top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground hover:bg-secondary transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Pencil className={`w-3.5 h-3.5 ${currentManualPlanGb != null ? "text-primary" : ""}`} />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Manuel Kota Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{kitNo}</span>
              {shipName ? <span> — {shipName}</span> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-plan-input" className="text-sm">
                Kota (GB) <span className="text-muted-foreground font-normal">— boş bırakın = otomatik</span>
              </Label>
              <Input
                id="manual-plan-input"
                type="number"
                min={0}
                step="any"
                placeholder="Örn: 100"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono shadow-none"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
            {currentManualPlanGb != null && (
              <p className="text-xs text-muted-foreground">
                Mevcut override: <span className="font-mono text-foreground">{currentManualPlanGb} GB</span>.
                Boş bırakıp kaydet = override'ı temizle.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg shadow-none" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              className="rounded-lg shadow-none"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KitDeleteButton({
  source,
  kitNo,
  shipName,
}: {
  source: "starlink" | "leobridge";
  kitNo: string;
  shipName: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteStarlink = useDeleteStarlinkTerminal();
  const deleteLeobridge = useDeleteLeobridgeTerminal();
  const mutation = source === "starlink" ? deleteStarlink : deleteLeobridge;
  const sourceLabel = source === "starlink" ? "Tototheo (Starlink)" : "Norway (Leo Bridge)";

  const handleDelete = () => {
    mutation.mutate(
      { kit: kitNo },
      {
        onSuccess: () => {
          toast({
            title: "Terminal Silindi",
            description: `${kitNo} ${sourceLabel} kaynağından temizlendi.`,
          });
          queryClient.invalidateQueries();
        },
        onError: (err: unknown) => {
          toast({
            title: "Silme Başarısız",
            description:
              (err instanceof Error ? err.message : null) ||
              "Terminal silinemedi.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title="Terminali sil"
          aria-label="Terminali sil"
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Terminali sil?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{kitNo}</span>
            {shipName ? ` (${shipName})` : ""} terminali ve tüm geçmişi{" "}
            <strong>{sourceLabel}</strong> kaynağından kalıcı olarak silinecek.
            KIT hâlâ bu kaynakta aktifse bir sonraki senkronizasyonda tekrar
            eklenir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Vazgeç</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EmptyState({
  customerHasNoAssignments,
  hasAnySource,
  hasFilter,
  debouncedSearch,
  canManageAccounts,
  isCustomer,
  onClearFilter,
}: {
  customerHasNoAssignments: boolean;
  hasAnySource: boolean;
  hasFilter: boolean;
  debouncedSearch: string;
  canManageAccounts: boolean;
  isCustomer: boolean;
  onClearFilter: () => void;
}) {
  if (customerHasNoAssignments) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
          <Terminal className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Henüz size atanmış terminal yok</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Lütfen yöneticinizle iletişime geçin.
          </p>
        </div>
      </div>
    );
  }
  if (!hasAnySource) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
          <Server className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Henüz veri kaynağı yok</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            {canManageAccounts
              ? "KIT verisi görmek için bir Satcom portal hesabı ekleyin veya Tototheo entegrasyonunu açın."
              : "Henüz veri kaynağı yok. Bir yöneticinin Ayarlar'dan kaynak eklemesi gerekiyor."}
          </p>
        </div>
        {canManageAccounts && (
          <div className="flex gap-2 flex-wrap justify-center">
            <Link href="/settings">
              <Button className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none">
                <Plus className="w-4 h-4 mr-2" /> Satcom Hesap
              </Button>
            </Link>
            <Link href="/settings/starlink">
              <Button variant="outline" className="rounded-lg shadow-none">
                <Satellite className="w-4 h-4 mr-2" /> Tototheo Aç
              </Button>
            </Link>
          </div>
        )}
      </div>
    );
  }
  if (hasFilter) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
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
        <Button variant="outline" onClick={onClearFilter} className="rounded-lg shadow-none">
          Filtreyi Temizle
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
        <Terminal className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Henüz KIT verisi yok</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          İlk senkronizasyon turundan sonra terminaller burada listelenir.
        </p>
      </div>
      {!isCustomer && (
        <Link href="/sync-logs">
          <Button variant="outline" className="rounded-lg shadow-none">
            Senkronizasyon Sayfasına Git
          </Button>
        </Link>
      )}
    </div>
  );
}
