import { useState } from "react";
import { Map } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useGetMapSettings,
  getGetMapSettingsQueryKey,
  useUpdateMapSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import SettingsLayout from "./layout";

export default function MapSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useGetMapSettings({
    query: { queryKey: getGetMapSettingsQueryKey() },
  });

  const updateMut = useUpdateMapSettings();

  const [apiKey, setApiKey] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetMapSettingsQueryKey() });

  const handleSave = () => {
    const payload: Record<string, unknown> = {};
    if (apiKey.length > 0) payload.apiKey = apiKey;
    else return; // Boşsa kaydetme — kullanıcı bir şey girmediyse yoksay.

    updateMut.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: t("Ayarlar Kaydedildi") });
          setApiKey("");
          invalidate();
        },
        onError: (err: unknown) =>
          toast({
            title: t("Kayıt Başarısız"),
            description:
              err instanceof Error ? t(err.message) : t("Ayarlar kaydedilemedi."),
            variant: "destructive",
          }),
      }
    );
  };

  const handleClear = () => {
    updateMut.mutate(
      { data: { apiKey: null } },
      {
        onSuccess: () => {
          toast({ title: t("Anahtar silindi.") });
          setApiKey("");
          invalidate();
        },
        onError: (err: unknown) =>
          toast({
            title: t("Kayıt Başarısız"),
            description:
              err instanceof Error ? t(err.message) : t("Ayarlar kaydedilemedi."),
            variant: "destructive",
          }),
      }
    );
  };

  const isSaving = updateMut.isPending;

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
          <CardHeader className="bg-secondary/50 border-b border-border pb-5">
            <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 bg-background rounded border border-border">
                <Map className="w-4 h-4 text-foreground" />
              </div>
              {t("Harita Ayarları (CARTO Basemaps)")}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              {t(
                "CARTO Basemaps harita katmanı için API anahtarı. Anahtar girilmezse haritalar yüklenmeye devam eder ancak CARTO ticari kullanım filigranı gösterebilir. Domain kısıtlamalı anahtar tercih edilir."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
            {isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <div className="space-y-5">
                {/* Durum */}
                <div className="flex items-center gap-2 text-sm">
                  {settings?.hasApiKey ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      {t("Harita anahtarı kayıtlı.")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
                      {t("Harita anahtarı girilmemiş.")}
                    </span>
                  )}
                </div>

                {/* API Anahtarı */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("CARTO API Anahtarı")}
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    placeholder={
                      settings?.hasApiKey
                        ? t("(kayıtlı — değiştirmek için yenisini girin)")
                        : t("CARTO API anahtarınızı girin")
                    }
                    onChange={(e) => setApiKey(e.target.value)}
                    className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                    autoComplete="off"
                  />
                  {settings?.hasApiKey && (
                    <p className="text-xs text-muted-foreground">
                      {t("Kayıtlı bir anahtar var. Boş bırakırsanız değişmez.")}
                    </p>
                  )}
                </div>

                {/* Eylemler */}
                <div className="flex flex-wrap gap-3 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || apiKey.length === 0}
                    className="rounded-lg"
                  >
                    {isSaving ? t("Kaydediliyor…") : t("Kaydet")}
                  </Button>
                  {settings?.hasApiKey && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClear}
                      disabled={isSaving}
                      className="rounded-lg text-destructive border-destructive/40 hover:bg-destructive/10"
                    >
                      {t("Anahtarı Temizle")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
