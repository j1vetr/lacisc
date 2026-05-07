import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Satellite, Send, Loader2, RefreshCw } from "lucide-react";
import {
  useGetStarlinkSettings,
  getGetStarlinkSettingsQueryKey,
  useUpdateStarlinkSettings,
  useTestStarlinkConnection,
  useSyncStarlinkNow,
  type StarlinkSettingsUpdate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";

import SettingsLayout from "./layout";

const schema = z.object({
  enabled: z.boolean(),
  apiBaseUrl: z.string().min(1, "Geçerli bir URL girin."),
  token: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function StarlinkSettingsPage() {
  const { data: settings, isLoading } = useGetStarlinkSettings({
    query: { queryKey: getGetStarlinkSettingsQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateStarlinkSettings();
  const testMutation = useTestStarlinkConnection();
  const syncMutation = useSyncStarlinkNow();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: false,
      apiBaseUrl: "https://starlink.tototheo.com",
      token: "",
    },
  });

  React.useEffect(() => {
    if (!settings) return;
    form.reset({
      enabled: settings.enabled,
      apiBaseUrl: settings.apiBaseUrl,
      token: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.updatedAt]);

  const onSubmit = (values: FormValues) => {
    const payload: StarlinkSettingsUpdate = {
      enabled: values.enabled,
      apiBaseUrl: values.apiBaseUrl.trim(),
    };
    if (values.token && values.token.length > 0) {
      payload.token = values.token;
    }
    updateMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({
            title: "Starlink Ayarları Kaydedildi",
            description: values.enabled
              ? "Otomatik senkronizasyon her 30 dakikada bir çalışacak."
              : "Yapılandırma kaydedildi (entegrasyon pasif).",
          });
          queryClient.invalidateQueries({
            queryKey: getGetStarlinkSettingsQueryKey(),
          });
          form.setValue("token", "");
        },
        onError: (err: unknown) => {
          toast({
            title: "Kayıt Başarısız",
            description: err instanceof Error ? err.message : "Ayarlar kaydedilemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleTest = () => {
    const values = form.getValues();
    testMutation.mutate(
      {
        data: {
          apiBaseUrl: values.apiBaseUrl.trim(),
          token: values.token && values.token.length > 0 ? values.token : null,
        },
      },
      {
        onSuccess: (res) => {
          toast({
            title: res.success ? "Bağlantı Başarılı" : "Bağlantı Başarısız",
            description: res.message,
            variant: res.success ? "default" : "destructive",
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Test Başarısız",
            description: err instanceof Error ? err.message : "Test yapılamadı.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSyncNow = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Senkronizasyon Başlatıldı",
          description:
            "Tototheo'dan tüm terminaller arka planda çekiliyor. İlerlemeyi panelin üst kısmından takip edebilirsiniz.",
        });
      },
      onError: (err: unknown) => {
        toast({
          title: "Senkronizasyon Başlatılamadı",
          description: err instanceof Error ? err.message : "Hata oluştu.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <SettingsLayout>
      <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-secondary/50 border-b border-border pb-5">
          <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-background rounded border border-border">
              <Satellite className="w-4 h-4 text-foreground" />
            </div>
            Starlink (Tototheo) API
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-muted-foreground">
            TM Starlink portalından (Tototheo) terminal envanterini ve aylık kullanımı
            otomatik olarak çeker. Token kayıtlıyken her 30 dakikada bir senkronizasyon
            çalışır (Starlink önce, ardından Satcom).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 lg:p-8">
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border p-3 bg-background">
                      <div className="space-y-0.5 pr-3">
                        <FormLabel className="text-sm font-medium text-foreground">
                          Entegrasyonu Etkinleştir
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Kapalıyken cron Starlink fazını atlar.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-primary"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="apiBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        API Base URL
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://starlink.tototheo.com"
                          {...field}
                          className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Tototheo Swagger sayfasındaki temel adres. Genellikle değiştirilmez.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Bearer Token{" "}
                        {settings?.hasToken && (
                          <span className="text-muted-foreground normal-case">
                            (değiştirmek için doldur)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={settings?.hasToken ? "•••••••••" : "eyJhbGciOi..."}
                          {...field}
                          value={field.value ?? ""}
                          className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        AES-256-GCM ile şifrelenmiş olarak saklanır. Bu sayfada bir daha
                        gösterilmez.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1.5 font-mono">
                  <div>
                    <span className="uppercase tracking-widest text-[10px] mr-2">Son Sync:</span>
                    {settings?.lastSyncAt ? formatDate(settings.lastSyncAt) : "—"}
                  </div>
                  {settings?.lastErrorMessage && (
                    <div className="text-[#dfa88f]">
                      <span className="uppercase tracking-widest text-[10px] mr-2">Son Hata:</span>
                      {settings.lastErrorMessage}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSyncNow}
                    disabled={syncMutation.isPending || !settings?.enabled || !settings?.hasToken}
                    className="rounded-lg shadow-none h-10 px-4"
                    title={
                      !settings?.hasToken
                        ? "Önce token kaydedin"
                        : !settings?.enabled
                          ? "Önce entegrasyonu açın"
                          : "Şimdi senkronize et"
                    }
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Şimdi Senkronize Et
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={testMutation.isPending}
                    className="rounded-lg shadow-none h-10 px-4"
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Bağlantıyı Test Et
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none h-10 px-4"
                  >
                    {updateMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Kaydet
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
