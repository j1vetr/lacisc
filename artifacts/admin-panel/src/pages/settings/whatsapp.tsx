import { useEffect, useState } from "react";
import { MessageCircle, Send, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useGetWhatsappSettings,
  getGetWhatsappSettingsQueryKey,
  useUpdateWhatsappSettings,
  useTestWhatsappSettings,
  useListWhatsappThresholdRules,
  getListWhatsappThresholdRulesQueryKey,
  useCreateWhatsappThresholdRule,
  useDeleteWhatsappThresholdRule,
} from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";

import SettingsLayout from "./layout";

export default function WhatsappSettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useGetWhatsappSettings({
    query: { queryKey: getGetWhatsappSettingsQueryKey() },
  });
  const { data: rules = [] } = useListWhatsappThresholdRules({
    query: { queryKey: getListWhatsappThresholdRulesQueryKey() },
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const updateMut = useUpdateWhatsappSettings();
  const testMut = useTestWhatsappSettings();
  const createRuleMut = useCreateWhatsappThresholdRule();
  const deleteRuleMut = useDeleteWhatsappThresholdRule();

  const [enabled, setEnabled] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState(
    "https://my.wpileti.com/api/send-message",
  );
  const [apiKey, setApiKey] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [dailySendHour, setDailySendHour] = useState("13");
  const [overrideTest, setOverrideTest] = useState("");

  const [newMinPlan, setNewMinPlan] = useState("");
  const [newStep, setNewStep] = useState("");

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setEndpointUrl(settings.endpointUrl);
    setApiKey("");
    setTestRecipient(settings.testRecipient ?? "");
    setDailySendHour(String(settings.dailySendHour ?? 13));
  }, [settings?.updatedAt]);

  const handleSave = () => {
    // endpointUrl frontend'de read-only — backend allowlist enforce ediyor.
    const hour = Number(dailySendHour);
    const payload: Record<string, unknown> = {
      enabled,
      testRecipient: testRecipient.trim() || null,
      dailySendHour: Number.isFinite(hour)
        ? Math.max(0, Math.min(23, Math.trunc(hour)))
        : 13,
    };
    if (apiKey.length > 0) payload.apiKey = apiKey;
    updateMut.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({
            title: t("WhatsApp Ayarları Kaydedildi"),
            description: enabled
              ? t("Eşik bildirimleri aktif.")
              : t("Yapılandırma kaydedildi (bildirimler pasif)."),
          });
          setApiKey("");
          qc.invalidateQueries({ queryKey: getGetWhatsappSettingsQueryKey() });
        },
        onError: (err: unknown) => {
          toast({
            title: t("Kayıt Başarısız"),
            description: err instanceof Error ? t(err.message) : t("Ayarlar kaydedilemedi."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleTest = () => {
    testMut.mutate(
      { data: { to: overrideTest.trim() || null } },
      {
        onSuccess: (res) => {
          const statusLine =
            res.providerStatus != null ? `HTTP ${res.providerStatus}` : null;
          const bodyLine = res.providerBody
            ? res.providerBody.slice(0, 200)
            : null;
          const desc = [res.message, statusLine, bodyLine]
            .filter(Boolean)
            .join(" — ");
          toast({
            title: res.success ? t("Test Mesajı Gönderildi") : t("Test Başarısız"),
            description: desc,
            variant: res.success ? "default" : "destructive",
          });
        },
        onError: (err: unknown) => {
          toast({
            title: t("Test Başarısız"),
            description: err instanceof Error ? t(err.message) : t("Mesaj gönderilemedi."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCreateRule = () => {
    const step = Number(newStep);
    if (!Number.isFinite(step) || step < 1) {
      toast({
        title: t("Geçersiz adım"),
        description: t("Eşik adımı en az 1 GB olmalı."),
        variant: "destructive",
      });
      return;
    }
    const min = Number(newMinPlan);
    if (newMinPlan.trim() === "" || !Number.isFinite(min) || min <= 0) {
      toast({
        title: t("Geçersiz plan"),
        description: t(
          "Min plan > 0 sayı olmalı. Plan kotası bilinmeyen KIT'ler için yedek eşik (E-posta ayarları) kullanılır."
        ),
        variant: "destructive",
      });
      return;
    }
    createRuleMut.mutate(
      { data: { minPlanGb: min, stepGb: step } },
      {
        onSuccess: () => {
          setNewMinPlan("");
          setNewStep("");
          qc.invalidateQueries({
            queryKey: getListWhatsappThresholdRulesQueryKey(),
          });
          toast({ title: t("Kural eklendi") });
        },
        onError: (err: unknown) => {
          toast({
            title: t("Hata"),
            description: err instanceof Error ? t(err.message) : t("Kural eklenemedi."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDeleteRule = (id: number) => {
    if (!window.confirm(t("Bu eşik kuralını silmek istediğinize emin misiniz?"))) return;
    deleteRuleMut.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            queryKey: getListWhatsappThresholdRulesQueryKey(),
          });
          toast({ title: "Kural silindi" });
        },
        onError: (err: unknown) =>
          toast({
            title: t("Hata"),
            description: err instanceof Error ? t(err.message) : t("Silinemedi."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 bg-background rounded border border-border">
                <MessageCircle className="w-4 h-4 text-foreground" />
              </div>
              {t("WhatsApp Bildirimleri (wpileti.com)")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {t(
                "Plan-bazlı eşikleri aşan KIT'ler için anlık WhatsApp mesajı gönderir. Bildirimler YALNIZ \"müşteri\" rolündeki kullanıcılara, kendilerine atanmış KIT için gider (Kullanıcılar sayfasında telefon alanı dolu olmalı)."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            {isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-background">
                  <div className="space-y-0.5 pr-3">
                    <Label className="text-sm font-medium text-foreground">
                      {t("Bildirimleri Etkinleştir")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("Kapatınca eşik geçişlerinde mesaj gönderilmez.")}
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
                    {t("wpileti.com Endpoint URL")}
                  </Label>
                  <Input
                    value={endpointUrl}
                    readOnly
                    disabled
                    className="font-mono text-sm bg-secondary border-border h-10 rounded-lg shadow-none opacity-70 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Güvenlik nedeniyle (SSRF + API anahtarı koruması) endpoint sabitlenmiştir. Yalnız my.wpileti.com host'una izin verilir."
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("API Anahtarı")}
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    placeholder={
                      settings?.hasApiKey
                        ? t("(kayıtlı — değiştirmek için yenisini girin)")
                        : t("wpileti.com API anahtarı")
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

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Yedek Eşik (E-posta ayarlarından)")}
                  </Label>
                  <Input
                    value={
                      settings?.emailFallbackThresholdGb != null
                        ? `${settings.emailFallbackThresholdGb} GB`
                        : "—"
                    }
                    readOnly
                    disabled
                    className="font-mono text-sm bg-secondary border-border h-10 rounded-lg shadow-none opacity-70 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Plan kotası bilinmiyorsa veya aşağıdaki kurallardan hiçbiri eşleşmiyorsa devreye girer. Değer /settings/email sayfasındaki \"eşik adımı\"ndan okunur; WhatsApp ve e-posta tek ortak global eşiği paylaşır."
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Test Alıcısı")}
                  </Label>
                  <Input
                    value={testRecipient}
                    placeholder="905321234567"
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("\"Test Mesajı Gönder\" butonu varsayılan olarak buraya gönderir.")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Günlük Gönderim Saati (0-23)")}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={dailySendHour}
                    onChange={(e) => setDailySendHour(e.target.value)}
                    placeholder="13"
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Eşik bildirimleri her sync turunda değil, günde bir kez bu saatte (Türkiye saati) toplu olarak gönderilir. Gün boyunca biriken tüm uyarılar alıcı başına tek mesajda birleştirilir (wpileti.com anti-spam koruması)."
                    )}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    onClick={handleSave}
                    disabled={updateMut.isPending}
                    className="rounded-lg"
                  >
                    {updateMut.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {t("Ayarları Kaydet")}
                  </Button>
                </div>

                <div className="space-y-2 pt-4 border-t border-border">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Test Mesajı")}
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={overrideTest}
                      placeholder={t("Override alıcı (boş = test alıcısı)")}
                      onChange={(e) => setOverrideTest(e.target.value)}
                      className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleTest}
                      disabled={testMut.isPending || !settings?.hasApiKey}
                      className="rounded-lg"
                    >
                      {testMut.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {t("Test Mesajı Gönder")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight">
              {t("Plan-Bazlı Eşik Kuralları")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {t(
                "Her kural: min plan kotası → eşik adımı. Bir KIT'in kotası en yüksek eşleşen (min plan ≤ kota) kuralın adımını kullanır. Plan kotası bilinmeyen KIT'ler (Satcom dahil) için kural değil, doğrudan yukarıdaki yedek eşik (E-posta ayarları) devreye girer."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Min Plan (GB) — zorunlu, > 0")}
                  </Label>
                  <Input
                    type="number"
                    value={newMinPlan}
                    onChange={(e) => setNewMinPlan(e.target.value)}
                    placeholder={t("örn. 100")}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Eşik Adımı (GB)")}
                  </Label>
                  <Input
                    type="number"
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    placeholder={t("örn. 25")}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleCreateRule}
                    disabled={createRuleMut.isPending}
                    className="rounded-lg"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("Ekle")}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto pt-3">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground tracking-widest">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-medium">{t("Min Plan")}</th>
                      <th className="text-left py-2 font-medium">{t("Eşik Adımı")}</th>
                      <th className="text-right py-2 font-medium">{t("İşlem")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-6 text-center text-muted-foreground text-xs"
                        >
                          {t(
                            "Henüz kural yok. Bu durumda yukarıdaki \"Yedek Eşik (E-posta ayarlarından)\" değeri tüm KIT'ler için fallback olarak kullanılır; bildirim göndermek istemiyorsanız e-posta eşiğini de boş bırakın."
                          )}
                        </td>
                      </tr>
                    ) : (
                      rules.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border/60 hover:bg-secondary/40"
                        >
                          <td className="py-3 font-mono text-xs">
                            {r.minPlanGb == null ? (
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] uppercase"
                                title={t("Legacy catchall satırı — yeni mantıkta yok sayılır.")}
                              >
                                legacy
                              </Badge>
                            ) : (
                              <span>{r.minPlanGb} GB</span>
                            )}
                          </td>
                          <td className="py-3 font-mono text-xs">
                            {t("her {{step}} GB", { step: r.stepGb })}
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t("Sil")}
                              onClick={() => handleDeleteRule(r.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
