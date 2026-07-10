import { useMemo, useState } from "react";
import { Ship, RefreshCw, Loader2, Pencil, RotateCcw } from "lucide-react";
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

export default function ShipQuotaSettingsPage() {
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
            title: "Ayarlar Kaydedildi",
            description: enabled
              ? "Gemi kota düşümü aktif."
              : "Yapılandırma kaydedildi (düşüm pasif — ham kullanım gösterilir).",
          });
          setApiKey("");
          invalidateSettings();
        },
        onError: (err: unknown) => {
          toast({
            title: "Kayıt Başarısız",
            description:
              err instanceof Error ? err.message : "Ayarlar kaydedilemedi.",
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
          title: res.ok ? "Senkronizasyon Tamamlandı" : "Senkronizasyon Başarısız",
          description: res.ok
            ? `Dönem ${res.period}: ${res.matched} eşleşti, ${res.unmatched} eşleşmedi.`
            : res.error,
          variant: res.ok ? "default" : "destructive",
        });
        invalidateSettings();
        invalidateDeductions();
      },
      onError: (err: unknown) => {
        toast({
          title: "Senkronizasyon Başarısız",
          description: err instanceof Error ? err.message : "Senkronize edilemedi.",
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
            title: "Hata",
            description: err instanceof Error ? err.message : "Güncellenemedi.",
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
        title: "Geçersiz değer",
        description: "Manuel GB >= 0 sayı olmalı veya boş bırakılmalı.",
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
          toast({ title: "Kayıt güncellendi" });
          setEditing(null);
          invalidateDeductions();
        },
        onError: (err: unknown) =>
          toast({
            title: "Hata",
            description: err instanceof Error ? err.message : "Güncellenemedi.",
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
              Gemi İnternet Satışı Kota Düşümü
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Bazı gemiler bant genişliğini üçüncü taraflara yeniden satıyor.
              Harici adegloba API'sinden saatlik çekilen aylık yeniden-satış
              hacmi, KIT'in ham kullanımından düşülüp dashboard, liste, detay
              ve e-posta/WhatsApp eşik karşılaştırmalarında gösterilir.
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
                      Kota Düşümünü Etkinleştir
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Kapatınca ham kullanım hiçbir yerde düşülmeden gösterilir.
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
                    API Anahtarı (x-api-key)
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    placeholder={
                      settings?.hasApiKey
                        ? "(kayıtlı — değiştirmek için yenisini girin)"
                        : "adegloba API anahtarı"
                    }
                    onChange={(e) => setApiKey(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                  />
                  {settings?.hasApiKey && (
                    <p className="text-xs text-muted-foreground">
                      Kayıtlı bir anahtar var. Boş bırakırsanız değişmez.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Son Senkron
                    </Label>
                    <p className="text-sm font-mono">
                      {settings?.lastSyncAt
                        ? formatDate(settings.lastSyncAt)
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Durum
                    </Label>
                    <p className="text-sm">
                      {settings?.lastSyncStatus === "success" ? (
                        <Badge className="bg-emerald-600/15 text-emerald-600 border-emerald-600/30">
                          Başarılı
                        </Badge>
                      ) : settings?.lastSyncStatus === "failed" ? (
                        <Badge variant="destructive">Başarısız</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Son Dönem
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
                    Şimdi Senkronize Et
                  </Button>
                  <Button
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMut.isPending}
                    className="rounded-lg"
                  >
                    {updateSettingsMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Ayarları Kaydet
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight">
              Eşleşme / Düşüm Satırları
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Her satır dış API'den gelen bir gemiyi temsil eder. Otomatik
              eşleşme KIT numarası, sonra gemi adına göre yapılır; gerekirse
              "Düzenle" ile manuel olarak düzeltebilir veya satırı devre dışı
              bırakabilirsiniz.
            </CardDescription>
            <div className="pt-3">
              <Input
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                placeholder="Dönem filtrele (YYYYMM) — boş = tümü"
                className="font-mono text-sm bg-background border-border h-9 rounded-lg shadow-none max-w-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            {deductionsLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground tracking-widest">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium">Dönem</th>
                      <th className="text-left py-2 font-medium">Gemi</th>
                      <th className="text-left py-2 font-medium">Dış KIT</th>
                      <th className="text-right py-2 font-medium">API GB</th>
                      <th className="text-left py-2 font-medium">Eşleşme</th>
                      <th className="text-right py-2 font-medium">Efektif GB</th>
                      <th className="text-center py-2 font-medium">Aktif</th>
                      <th className="text-right py-2 font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-6 text-center text-muted-foreground text-xs"
                        >
                          Kayıt yok. "Şimdi Senkronize Et" ile ilk senkronu
                          çalıştırın.
                        </td>
                      </tr>
                    ) : (
                      deductions.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-border/60 hover:bg-secondary/40 ${
                            !row.isActive ? "opacity-50" : ""
                          }`}
                        >
                          <td className="py-3 font-mono text-xs">{row.period}</td>
                          <td className="py-3 text-xs">{row.externalShipName}</td>
                          <td className="py-3 font-mono text-xs">
                            {row.externalKitNumber || "—"}
                          </td>
                          <td className="py-3 text-right font-mono text-xs">
                            {row.apiTotalGb.toFixed(2)}
                          </td>
                          <td className="py-3 text-xs">
                            {row.effectiveSource && row.effectiveKitNo ? (
                              <span className="flex flex-col">
                                <span>
                                  {SOURCE_LABEL[row.effectiveSource]} ·{" "}
                                  <span className="font-mono">
                                    {row.effectiveKitNo}
                                  </span>
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                  {row.manualSource ? "manuel" : row.matchMethod}
                                </span>
                              </span>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                eşleşmedi
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 text-right font-mono text-xs">
                            {row.effectiveGb.toFixed(2)}
                          </td>
                          <td className="py-3 text-center">
                            <Switch
                              checked={row.isActive}
                              onCheckedChange={(v) => handleToggleActive(row, v)}
                              className="data-[state=checked]:bg-primary"
                            />
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Düzenle"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eşleşmeyi Düzelt</DialogTitle>
            <DialogDescription>
              {editing?.externalShipName} ({editing?.externalKitNumber || "—"}) —{" "}
              {editing?.period}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Kaynak
              </Label>
              <Select value={manualSource} onValueChange={setManualSource}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Otomatik" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Otomatik eşleşme</SelectItem>
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
                placeholder="örn. KITP00414241"
                className="font-mono text-sm h-10 rounded-lg shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Manuel GB (boş = API değerini kullan)
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
              Otomatiğe Dön
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateDeductionMut.isPending}
              className="rounded-lg"
            >
              {updateDeductionMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
