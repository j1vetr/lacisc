import React from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, Send, Loader2, RefreshCw } from "lucide-react";
import {
  useGetLeobridgeSettings,
  getGetLeobridgeSettingsQueryKey,
  useUpdateLeobridgeSettings,
  useTestLeobridgeConnection,
  useSyncLeobridgeNow,
  type LeobridgeSettingsUpdate,
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
  portalUrl: z.string().min(1, "Geçerli bir URL girin."),
  username: z.string().min(1, "Kullanıcı adı gerekli."),
  password: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function NorwaySettingsPage() {
  const { data: settings, isLoading } = useGetLeobridgeSettings({
    query: { queryKey: getGetLeobridgeSettingsQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const updateMutation = useUpdateLeobridgeSettings();
  const testMutation = useTestLeobridgeConnection();
  const syncMutation = useSyncLeobridgeNow();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: false,
      portalUrl: "https://leobridge.spacenorway.com",
      username: "",
      password: "",
    },
  });

  React.useEffect(() => {
    if (!settings) return;
    form.reset({
      enabled: settings.enabled,
      portalUrl: settings.portalUrl,
      username: settings.username ?? "",
      password: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.updatedAt]);

  const onSubmit = (values: FormValues) => {
    const payload: LeobridgeSettingsUpdate = {
      enabled: values.enabled,
      portalUrl: values.portalUrl.trim(),
      username: values.username.trim(),
    };
    if (values.password && values.password.length > 0) {
      payload.password = values.password;
    }
    updateMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({
            title: "Norway Ayarları Kaydedildi",
            description: values.enabled
              ? "Otomatik senkronizasyon her 30 dakikada bir çalışacak."
              : "Yapılandırma kaydedildi (entegrasyon pasif).",
          });
          queryClient.invalidateQueries({
            queryKey: getGetLeobridgeSettingsQueryKey(),
          });
          form.setValue("password", "");
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
          portalUrl: values.portalUrl.trim(),
          username: values.username.trim(),
          password:
            values.password && values.password.length > 0 ? values.password : null,
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
          title: "Norway Senkronizasyonu Başlatıldı",
          description:
            "Sadece Leo Bridge terminalleri çekiliyor. İlerlemeyi senkronizasyon kayıtlarından takip edebilirsiniz.",
        });
        navigate("/sync-logs");
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
              <Globe className="w-4 h-4 text-foreground" />
            </div>
            Leo Bridge (Space Norway)
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-muted-foreground">
            Space Norway'in Leo Bridge portalından Starlink terminallerini ve
            günlük/aylık veri kullanımını otomatik olarak çeker. Şifre kayıtlıyken
            her 30 dakikada bir otomatik senkronizasyon çalışır.
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
                          Kapalıyken otomatik tur Norway fazını atlar.
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
                  name="portalUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Portal URL
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://leobridge.spacenorway.com"
                          {...field}
                          className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Leo Bridge portalının temel adresi. Genellikle değiştirilmez.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Kullanıcı Adı
                      </FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="username"
                          placeholder="abdullah-ty1"
                          {...field}
                          className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Şifre{" "}
                        {settings?.hasPassword && (
                          <span className="text-muted-foreground normal-case">
                            (değiştirmek için doldur)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={settings?.hasPassword ? "•••••••••" : "Portal şifresi"}
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
                    disabled={
                      syncMutation.isPending ||
                      !settings?.enabled ||
                      !settings?.hasPassword
                    }
                    className="rounded-lg shadow-none h-10 px-4"
                    title={
                      !settings?.hasPassword
                        ? "Önce şifre kaydedin"
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
