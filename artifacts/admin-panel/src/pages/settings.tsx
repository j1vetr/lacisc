import React, { useEffect, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server, Settings as SettingsIcon, AlertTriangle, ShieldCheck, RefreshCw, Save } from "lucide-react";
import { 
  useGetStationSettings, 
  getGetStationSettingsQueryKey,
  useSaveStationSettings,
  useTestConnection,
  useSyncNow
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

const settingsSchema = z.object({
  portalUrl: z.string().url({ message: "Geçerli bir URL olmalıdır." }),
  username: z.string().min(1, { message: "Kullanıcı adı zorunludur." }),
  password: z.string().optional(),
  isActive: z.boolean().default(true),
  defaultBillingPeriod: z.string().optional().nullable(),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { data: settings, isLoading } = useGetStationSettings({ query: { queryKey: getGetStationSettingsQueryKey() } });
  const saveMutation = useSaveStationSettings();
  const testConnectionMutation = useTestConnection();
  const syncNowMutation = useSyncNow();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const initialized = useRef(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      portalUrl: "",
      username: "",
      password: "",
      isActive: true,
      defaultBillingPeriod: "",
      syncIntervalMinutes: 60,
    },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        portalUrl: settings.portalUrl,
        username: settings.username,
        password: "", // Şifre gösterilmez
        isActive: settings.isActive,
        defaultBillingPeriod: settings.defaultBillingPeriod || "",
        syncIntervalMinutes: settings.syncIntervalMinutes,
      });
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    const payload = {
      ...data,
      password: data.password ? data.password : null,
      defaultBillingPeriod: data.defaultBillingPeriod || null,
    };

    saveMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Ayarlar Kaydedildi", description: "Station Satcom yapılandırması güncellendi." });
          form.setValue("password", ""); 
          queryClient.invalidateQueries({ queryKey: getGetStationSettingsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Kayıt Başarısız", description: err.message || "Yapılandırma güncellenemedi.", variant: "destructive" });
        },
      }
    );
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast({ title: "Bağlantı Doğrulandı", description: res.message || "Portal bağlantısı başarılı." });
        } else {
          toast({ title: "Kimlik Doğrulama Başarısız", description: res.message || "Geçersiz kimlik bilgileri.", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "Sistem Hatası", description: err.message || "Test sırasında ağ hatası oluştu.", variant: "destructive" });
      },
    });
  };

  const handleSyncNow = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Senkronizasyon Başlatıldı", description: res.message || "Manuel kazıma işlemi kuyruğa alındı." });
      },
      onError: (err: any) => {
        toast({ title: "İşlem Başarısız", description: err.message || "Senkronizasyon kuyruğa alınamadı.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-3xl animate-in fade-in duration-500">
        <div>
          <Skeleton className="h-10 w-64 mb-2 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded" />
        </div>
        <Card className="border border-border bg-card shadow-none rounded-xl">
          <CardHeader><Skeleton className="h-8 w-48 rounded" /></CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-12 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-6">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-3xl animate-in fade-in duration-500 pb-12">
      <div className="space-y-2">
        <h1 className="text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">Ayarlar</h1>
        <p className="text-base text-muted-foreground">Arka plan kazıyıcı kimlik bilgileri ve otomatik senkronizasyon yönetimi.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
            <CardHeader className="bg-secondary/50 border-b border-border pb-5">
              <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
                <div className="p-1.5 bg-background rounded border border-border">
                  <Server className="w-4 h-4 text-foreground" />
                </div>
                Hedef Portal Kimlik Bilgileri
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-muted-foreground">
                Station Satcom faturalandırma portalı için kimlik doğrulama detayları.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <FormField
                control={form.control}
                name="portalUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Portal Adresi</FormLabel>
                    <FormControl>
                      <Input placeholder="https://portal.stationsatcom.com/login" {...field} className="font-mono text-sm bg-background border-border h-11 rounded-lg shadow-none" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Kullanıcı Adı</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} className="bg-background border-border h-11 rounded-lg text-sm shadow-none" />
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
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Şifre</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="•••••••• (Güvenlik için gizli)" {...field} className="bg-background border-border h-11 rounded-lg font-mono text-sm shadow-none" />
                      </FormControl>
                      <FormDescription className="text-xs">Mevcut şifreyi korumak için boş bırakın.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
            <CardHeader className="bg-secondary/50 border-b border-border pb-5">
              <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
                <div className="p-1.5 bg-background rounded border border-border">
                  <SettingsIcon className="w-4 h-4 text-foreground" />
                </div>
                Kazıyıcı Döngüsü
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="syncIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Senkronizasyon Aralığı (Dakika)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="font-mono text-sm bg-background border-border h-11 rounded-lg shadow-none" />
                      </FormControl>
                      <FormDescription className="text-xs">Otomatik işin çalışma sıklığı.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultBillingPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Zorunlu Dönem (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input placeholder="MM/YYYY" {...field} value={field.value ?? ""} className="font-mono text-sm bg-background border-border h-11 rounded-lg shadow-none" />
                      </FormControl>
                      <FormDescription className="text-xs">Ayarlanırsa dinamik tespiti ezer.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background shadow-none">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel className="text-sm font-medium text-foreground">Aktif</FormLabel>
                      <FormDescription className="text-xs">
                        Kapalı olduğunda arka planda veri çekme işlemi yapılmaz.
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
            </CardContent>
            
            {settings?.lastErrorMessage && (
              <div className="mx-8 mb-8 p-4 rounded-lg bg-[#cf2d56]/10 border border-[#cf2d56]/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#cf2d56] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-medium text-[#cf2d56]">Son Çalıştırma Hatası</p>
                  <p className="text-xs font-mono mt-1 text-[#cf2d56]/80 leading-relaxed">{settings.lastErrorMessage}</p>
                </div>
              </div>
            )}
            
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center bg-secondary/50 border-t border-border gap-4 py-5 px-8">
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${settings?.lastSuccessSyncAt ? 'bg-[#1f8a65]' : 'bg-muted-foreground'}`} />
                Son başarılı: <span className="text-foreground">{formatDate(settings?.lastSuccessSyncAt)}</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 sm:flex-none rounded-lg border-border hover:bg-secondary font-medium text-[13px] h-10 px-4 shadow-none text-foreground"
                  onClick={handleTestConnection}
                  disabled={testConnectionMutation.isPending}
                >
                  <ShieldCheck className={`w-4 h-4 mr-2 ${testConnectionMutation.isPending ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
                  Bağlantıyı Test Et
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  className="flex-1 sm:flex-none rounded-lg border-border hover:bg-secondary font-medium text-[13px] h-10 px-4 shadow-none text-foreground"
                  onClick={handleSyncNow}
                  disabled={syncNowMutation.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncNowMutation.isPending ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                  Şimdi Senkronize Et
                </Button>
                <Button 
                  type="submit"
                  className="flex-1 sm:flex-none rounded-lg font-medium text-[13px] h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
                  disabled={saveMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Değişiklikleri Kaydet
                </Button>
              </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
