import { useMemo, useState } from "react";
import { Ship, RefreshCw, Loader2, Pencil, RotateCcw, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useGetShipQuotaSettings,
  getGetShipQuotaSettingsQueryKey,
  useUpdateShipQuotaSettings,
  useSyncShipQuotasNow,
  useListShipQuotaDeductions,
  getListShipQuotaDeductionsQueryKey,
  useUpdateShipQuotaDeduction,
} from "@workspace/api-client-react";
import type { ShipQuotaDeduction, ShipQuotaSource } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

import SettingsLayout from "./layout";

const SOURCE_LABEL: Record<ShipQuotaSource, string> = {
  satcom: "Satcom",
  starlink: "Tototheo",
  leobridge: "Norway",
};

const NONE_VALUE = "__none__";

const DEDUCTION_GRID =
  "grid grid-cols-[minmax(180px,1.5fr)_minmax(180px,1.2fr)_140px_72px_44px] gap-x-4 items-center";

export default function ShipQuotaSettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useGetShipQuotaSettings({
    query: { queryKey: getGetShipQuotaSettingsQueryKey() },
  });
  const [periodFilter, setPeriodFilter] = useState("");
  const { data: deductions = [], isLoading: deductionsLoading } =
    useListShipQuotaDeductions(
      periodFilter.trim() ? { period: periodFilter.trim() } : undefined,
      {
        query: {
          queryKey: getListShipQuotaDeductionsQueryKey(
            periodFilter.trim() ? { period: periodFilter.trim() } : undefined
          ),
        },
      }
    );

  const qc = useQueryClient();
  const { toast } = useToast();

  const updateSettingsMut = useUpdateShipQuotaSettings();
  const syncMut = useSyncShipQuotasNow();
  const updateDeductionMut = useUpdateShipQuotaDeduction();

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState<ShipQuotaDeduction | null>(null);
  const [manualSource, setManualSource] = useState<string>(NONE_VALUE);
  const [manualKitNo, setManualKitNo] = useState("");
  const [manualGb, setManualGb] = useState("");

  useMemo(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
  }, [settings?.updatedAt]);

  const invalidateSettings = () =>
    qc.invalidateQueries({ queryKey: getGetShipQuotaSettingsQueryKey() });
  const invalidateDeductions = () =>
    qc.invalidateQueries({ queryKey: ["/api/ship-quotas/deductions"] });

  const handleSaveSettings = () => {
    const payload: Record<string, unknown> = { enabled };
    if (apiKey.length > 0) payload.apiKey = apiKey;
    updateSettingsMut.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({
            title: t("Ayarlar Kaydedildi"),
            description: enabled
              ? t("Gemi kota düşümü aktif.")
              : t("Yapılandırma kaydedildi (düşüm pasif — ham kullanım gösterilir)."),
          });
          setApiKey("");
          invalidateSettings();
        },
        onError: (err: unknown) => {
          toast({
            title: t("Kayıt Başarısız"),
            description:
              err instanceof Error ? t(err.message) : t("Ayarlar kaydedilemedi."),
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSyncNow = () => {
    syncMut.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: res.ok ? t("Senkronizasyon Tamamlandı") : t("Senkronizasyon Başarısız"),
          description: res.ok
            ? t("Dönem {{period}}: {{matched}} eşleşti, {{unmatched}} eşleşmedi.", { period: res.period, matched: res.matched, unmatched: res.unmatched })
            : res.error,
          variant: res.ok ? "default" : "destructive",
        });
        invalidateSettings();
        invalidateDeductions();
      },
      onError: (err: unknown) => {
        toast({
          title: t("Senkronizasyon Başarısız"),
          description: err instanceof Error ? t(err.message) : t("Senkronize edilemedi."),
          variant: "destructive",
        });
      },
    });
  };

  const handleToggleActive = (row: ShipQuotaDeduction, isActive: boolean) => {
    updateDeductionMut.mutate(
      { id: row.id, data: { isActive } },
      {
        onSuccess: () => invalidateDeductions(),
        onError: (err: unknown) =>
          toast({
            title: t("Hata"),
            description: err instanceof Error ? t(err.message) : t("Güncellenemedi."),
            variant: "destructive",
          }),
      }
    );
  };

  const openEdit = (row: ShipQuotaDeduction) => {
    setEditing(row);
    setManualSource(row.manualSource ?? NONE_VALUE);
    setManualKitNo(row.manualKitNo ?? "");
    setManualGb(row.manualGb != null ? String(row.manualGb) : "");
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    const gb = manualGb.trim() === "" ? null : Number(manualGb);
    if (gb != null && (!Number.isFinite(gb) || gb < 0)) {
      toast({
        title: t("Geçersiz değer"),
        description: t("Manuel GB >= 0 sayı olmalı veya boş bırakılmalı."),
        variant: "destructive",
      });
      return;
    }
    updateDeductionMut.mutate(
      {
        id: editing.id,
        data: {
          manualSource:
            manualSource === NONE_VALUE ? null : (manualSource as ShipQuotaSource),
          manualKitNo: manualKitNo.trim() || null,
          manualGb: gb,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("Kayıt güncellendi") });
          setEditing(null);
          invalidateDeductions();
        },
        onError: (err: unknown) =>
          toast({
            title: t("Hata"),
            description: err instanceof Error ? t(err.message) : t("Güncellenemedi."),
            variant: "destructive",
          }),
      }
    );
  };

  const handleResetToAuto = () => {
    setManualSource(NONE_VALUE);
    setManualKitNo("");
    setManualGb("");
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 bg-background rounded border border-border">
                <Ship className="w-4 h-4 text-foreground" />
              </div>
              {t("Gemi İnternet Satışı Kota Düşümü")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {t("Bazı gemiler bant genişliğini üçüncü taraflara yeniden satıyor. Harici adegloba API'sinden saatlik çekilen aylık yeniden-satış hacmi, KIT'in ham kullanımından düşülüp dashboard, liste, detay ve e-posta/WhatsApp eşik karşılaştırmalarında gösterilir.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-background">
                  <div className="space-y-0.5 pr-3">
                    <Label className="text-sm font-medium text-foreground">
                      {t("Kota Düşümünü Etkinleştir")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("Kapatınca ham kullanım hiçbir yerde düşülmeden gösterilir.")}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("API Anahtarı (x-api-key)")}
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    placeholder={
                      settings?.hasApiKey
                        ? t("(kayıtlı — değiştirmek için yenisini girin)")
                        : t("adegloba API anahtarı")
                    }
                    onChange={(e) => setApiKey(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                  />
                  {settings?.hasApiKey && (
                    <p className="text-xs text-muted-foreground">
                      {t("Kayıtlı bir anahtar var. Boş bırakırsanız değişmez.")}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {t("Son Senkron")}
                    </Label>
                    <p className="text-sm font-mono">
                      {settings?.lastSyncAt
                        ? formatDate(settings.lastSyncAt)
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {t("Durum")}
                    </Label>
                    <p className="text-sm">
                      {settings?.lastSyncStatus === "success" ? (
                        <Badge className="bg-emerald-600/15 text-emerald-600 border-emerald-600/30">
                          {t("Başarılı")}
                        </Badge>
                      ) : settings?.lastSyncStatus === "failed" ? (
                        <Badge variant="destructive">{t("Başarısız")}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {t("Son Dönem")}
                    </Label>
                    <p className="text-sm font-mono">
                      {settings?.lastPeriod ?? "—"}
                    </p>
                  </div>
                </div>

                {settings?.lastErrorMessage && (
                  <p className="text-xs text-destructive">
                    {settings.lastErrorMessage}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={handleSyncNow}
                    disabled={syncMut.isPending || !settings?.hasApiKey}
                    className="rounded-lg"
                  >
                    {syncMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {t("Şimdi Senkronize Et")}
                  </Button>
                  <Button
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMut.isPending}
                    className="rounded-lg"
                  >
                    {updateSettingsMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {t("Ayarları Kaydet")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight">
              {t("Eşleşme / Düşüm Satırları")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {t(
                "Her satır dış API'den gelen bir gemiyi temsil eder. Otomatik eşleşme KIT numarası, sonra gemi adına göre yapılır; gerekirse \"Düzenle\" ile manuel olarak düzeltebilir veya satırı devre dışı bırakabilirsiniz."
              )}
            </CardDescription>
            <div className="pt-3 flex items-center gap-3">
              <Input
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                placeholder={t("Dönem filtrele (YYYYMM) — boş = tümü")}
                className="font-mono text-sm bg-background border-border h-9 rounded-lg shadow-none max-w-xs"
              />
              {!deductionsLoading && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {t("{{count}} kayıt", { count: deductions.length })}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            {deductionsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : deductions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-xs rounded-lg border border-dashed border-border">
                {t("Kayıt yok. \"Şimdi Senkronize Et\" ile ilk senkronu çalıştırın.")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className={`${DEDUCTION_GRID} px-2 py-2.5 border-b border-border`}>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                      {t("Gemi")}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                      {t("Eşleşme")}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium text-right">
                      {t("Kullanım (GB)")}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium text-center">
                      {t("Aktif")}
                    </span>
                    <span />
                  </div>

                  {deductions.map((row) => {
                    const reduced = row.effectiveGb !== row.apiTotalGb;
                    const quotaPct =
                      row.planAllowanceGb &&
                      row.planAllowanceGb > 0 &&
                      row.kitEffectiveUsageGb != null
                        ? Math.min(100, (row.kitEffectiveUsageGb / row.planAllowanceGb) * 100)
                        : null;
                    const quotaWarn = quotaPct !== null && quotaPct >= 80;
                    return (
                      <div
                        key={row.id}
                        className={`${DEDUCTION_GRID} px-2 py-3.5 border-b border-border/60 hover:bg-secondary/40 transition-colors ${
                          !row.isActive ? "opacity-50" : ""
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <p
                            className="text-sm font-medium text-foreground truncate"
                            title={row.externalShipName}
                          >
                            {row.externalShipName}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground truncate">
                            {row.period}
                            {row.externalKitNumber ? ` · ${row.externalKitNumber}` : ""}
                          </p>
                          {quotaPct !== null && (
                            <div
                              className="flex items-center gap-1.5 mt-1.5"
                              title={t("Efektif kullanım: {{used}} / {{plan}} GB", { used: row.kitEffectiveUsageGb?.toFixed(1), plan: row.planAllowanceGb })}
                            >
                              <div className="flex-1 max-w-[90px] h-[3px] rounded-full bg-border overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    quotaWarn ? "bg-primary" : "bg-foreground"
                                  }`}
                                  style={{ width: `${quotaPct}%` }}
                                />
                              </div>
                              <span
                                className={`font-mono text-[10px] whitespace-nowrap ${
                                  quotaWarn ? "text-primary" : "text-muted-foreground"
                                }`}
                              >
                                {row.kitEffectiveUsageGb?.toFixed(1)}/{row.planAllowanceGb} GB
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 pr-3">
                          {row.effectiveSource && row.effectiveKitNo ? (
                            <>
                              <p className="text-sm text-foreground truncate">
                                {SOURCE_LABEL[row.effectiveSource]}{" "}
                                <span className="font-mono text-muted-foreground">
                                  {row.effectiveKitNo}
                                </span>
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {row.manualSource ? t("manuel") : row.matchMethod}
                              </p>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {t("eşleşmedi")}
                            </Badge>
                          )}
                        </div>

                        <div className="text-right">
                          {reduced ? (
                            <div className="flex items-center justify-end gap-1.5 font-mono text-xs whitespace-nowrap">
                              <span className="text-muted-foreground line-through">
                                {row.apiTotalGb.toFixed(2)}
                              </span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-foreground text-sm">
                                {row.effectiveGb.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-sm text-foreground">
                              {row.apiTotalGb.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <div className="flex justify-center">
                          <Switch
                            checked={row.isActive}
                            onCheckedChange={(v) => handleToggleActive(row, v)}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("Düzenle")}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Eşleşmeyi Düzelt")}</DialogTitle>
            <DialogDescription>
              {editing?.externalShipName} ({editing?.externalKitNumber || "—"}) —{" "}
              {editing?.period}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                {t("Kaynak")}
              </Label>
              <Select value={manualSource} onValueChange={setManualSource}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder={t("Otomatik")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{t("Otomatik eşleşme")}</SelectItem>
                  <SelectItem value="satcom">Satcom</SelectItem>
                  <SelectItem value="starlink">Tototheo</SelectItem>
                  <SelectItem value="leobridge">Norway</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                KIT No
              </Label>
              <Input
                value={manualKitNo}
                onChange={(e) => setManualKitNo(e.target.value)}
                disabled={manualSource === NONE_VALUE}
                placeholder={t("örn. KITP00414241")}
                className="font-mono text-sm h-10 rounded-lg shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                {t("Manuel GB (boş = API değerini kullan)")}
              </Label>
              <Input
                type="number"
                min={0}
                value={manualGb}
                onChange={(e) => setManualGb(e.target.value)}
                placeholder={editing ? editing.apiTotalGb.toFixed(2) : ""}
                className="font-mono text-sm h-10 rounded-lg shadow-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleResetToAuto} className="rounded-lg">
              <RotateCcw className="w-4 h-4 mr-2" />
              {t("Otomatiğe Dön")}
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateDeductionMut.isPending}
              className="rounded-lg"
            >
              {updateDeductionMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("Kaydet")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
