import React from "react";
import { Clock, Loader2, AlertTriangle, Power, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useGetSchedulerSettings,
  getGetSchedulerSettingsQueryKey,
  useUpdateSchedulerSettings,
  useCancelRunningSync,
} from "@workspace/api-client-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

import SettingsLayout from "./layout";

const PRESETS = [15, 30, 60, 120, 180, 360];

export default function SchedulerSettingsPage() {
  const { t } = useTranslation();
  const formatPreset = (min: number) => {
    if (min < 60) return t("{{min}} dakika", { min });
    const h = min / 60;
    return Number.isInteger(h)
      ? t("{{h}} saat", { h })
      : t("{{h}} saat", { h: h.toFixed(1) });
  };
  const { data, isLoading, refetch } = useGetSchedulerSettings({
    query: {
      queryKey: getGetSchedulerSettingsQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateSchedulerSettings();
  const cancelMutation = useCancelRunningSync();

  const [intervalMinutes, setIntervalMinutes] = React.useState<number>(30);
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    if (!dirty) {
      setIntervalMinutes(data.intervalMinutes);
      setEnabled(data.enabled);
    }
  }, [data, dirty]);

  const min = data?.minIntervalMinutes ?? 15;
  const max = data?.maxIntervalMinutes ?? 360;

  const onSave = async () => {
    if (intervalMinutes < min || intervalMinutes > max) {
      toast({
        variant: "destructive",
        title: t("Geçersiz aralık"),
        description: t("Aralık {{min}} ile {{max}} dakika arasında olmalı.", { min, max }),
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        data: { intervalMinutes, enabled },
      });
      setDirty(false);
      await queryClient.invalidateQueries({
        queryKey: getGetSchedulerSettingsQueryKey(),
      });
      toast({
        title: t("Kaydedildi"),
        description: enabled
          ? t("Otomatik sync her {{interval}} çalışacak.", { interval: formatPreset(intervalMinutes) })
          : t("Otomatik sync devre dışı bırakıldı."),
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: t("Kaydedilemedi"),
        description: t((e as Error).message),
      });
    }
  };

  const onCancel = async () => {
    if (
      !confirm(
        t(
          "Çalışan sync'leri iptal etmek istiyor musunuz? Devam eden Playwright/Starlink/Leo Bridge işlemleri arka planda tamamlanabilir, ancak DB kayıtları 'cancelled' olarak işaretlenecek.",
        ),
      )
    )
      return;
    try {
      const r = await cancelMutation.mutateAsync();
      toast({
        title: t("İptal istendi"),
        description: t(r.message),
      });
      await refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: t("İptal başarısız"),
        description: t((e as Error).message),
      });
    }
  };

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-normal">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t("Otomatik senkronizasyon zamanlayıcı")}
            </CardTitle>
            <CardDescription>
              {t(
                "Cron tüm hesaplar için Starlink → Leo Bridge → Satcom sırasıyla çalışır. Aralığı azaltmak portal yüküne dikkat ederek yapılmalı; Satcom Playwright taraması en kötü ~20 dakika sürebilir.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
                  <div>
                    <Label className="text-sm font-medium">{t("Otomatik sync etkin")}</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("Kapatırsan cron durur. Manuel \"Sync\" butonları çalışmaya devam eder.")}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => {
                      setEnabled(v);
                      setDirty(true);
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">{t("Aralık")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant={intervalMinutes === p ? "default" : "outline"}
                        onClick={() => {
                          setIntervalMinutes(p);
                          setDirty(true);
                        }}
                      >
                        {formatPreset(p)}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={min}
                      max={max}
                      step={1}
                      value={intervalMinutes}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v)) {
                          setIntervalMinutes(v);
                          setDirty(true);
                        }
                      }}
                      className="w-32 font-mono"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("dakika ({{min}}–{{max}})", { min, max })}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-md border border-border p-4 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("Sıradaki çalışma")}
                    </div>
                    <div className="mt-1 font-mono">
                      {data?.enabled ? formatDate(data.nextRunAt) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("Şu an")}
                    </div>
                    <div className="mt-1">
                      {data?.isRunning ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("Sync çalışıyor")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("Boşta")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={onSave}
                    disabled={!dirty || updateMutation.isPending}
                  >
                    {updateMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t("Kaydet")}
                  </Button>
                  {dirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (!data) return;
                        setIntervalMinutes(data.intervalMinutes);
                        setEnabled(data.enabled);
                        setDirty(false);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t("Geri al")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-normal">
              <Power className="h-4 w-4 text-muted-foreground" />
              {t("Çalışan sync'i durdur")}
            </CardTitle>
            <CardDescription>
              {t("Tüm")} <code className="text-xs">sync_logs</code>{" "}
              {t(
                "tablolarındaki \"running\" kayıtları \"cancelled\" olarak işaretler ve Satcom hesap-içi kilidini serbest bırakır. Server yeniden başlatıldığında sıkışan satırlar zaten otomatik olarak \"failed\" olur (boot self-heal).",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 mb-4 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                {t(
                  "Soft-cancel: arka plandaki Playwright/Starlink/Leo Bridge isteği tamamen kesilemez — devam edebilir ve final yazımı sessizce no-op olur. Acil durumlarda kullanın.",
                )}
              </span>
            </div>
            <Button
              variant="destructive"
              onClick={onCancel}
              disabled={cancelMutation.isPending || !data?.isRunning}
            >
              {cancelMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {data?.isRunning ? t("Çalışan sync'i durdur") : t("Aktif sync yok")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}

void Select;
void SelectContent;
void SelectItem;
void SelectTrigger;
void SelectValue;
