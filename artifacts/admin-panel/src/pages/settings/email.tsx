import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Send, Loader2 } from "lucide-react";
import {
  useGetEmailSettings,
  getGetEmailSettingsQueryKey,
  useUpdateEmailSettings,
  useTestEmailSettings,
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
import { Textarea } from "@/components/ui/textarea";
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

import SettingsLayout from "./layout";

const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  fromEmail: z.string().email({ message: "Geçerli e-posta adresi olmalıdır." }).or(z.literal("")),
  fromName: z.string().min(1),
  alertRecipients: z.string().optional(),
  thresholdStepGib: z.coerce.number().min(10).max(10000),
});
type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>;

export default function EmailSettingsPage() {
  const { data: settings, isLoading } = useGetEmailSettings({
    query: { queryKey: getGetEmailSettingsQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateEmailSettings();
  const testMutation = useTestEmailSettings();

  const form = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      enabled: false,
      smtpHost: "",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPassword: "",
      fromEmail: "",
      fromName: "Station Satcom Admin",
      alertRecipients: "",
      thresholdStepGib: 100,
    },
  });

  React.useEffect(() => {
    if (!settings) return;
    form.reset({
      enabled: settings.enabled,
      smtpHost: settings.smtpHost || "",
      smtpPort: settings.smtpPort,
      smtpSecure: settings.smtpSecure,
      smtpUser: settings.smtpUser || "",
      smtpPassword: "",
      fromEmail: settings.fromEmail || "",
      fromName: settings.fromName,
      alertRecipients: settings.alertRecipients || "",
      thresholdStepGib: settings.thresholdStepGib,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.updatedAt]);

  const onSubmit = (values: EmailSettingsFormValues) => {
    const payload: Record<string, unknown> = {
      enabled: values.enabled,
      smtpHost: values.smtpHost?.trim() || null,
      smtpPort: values.smtpPort,
      smtpSecure: values.smtpSecure,
      smtpUser: values.smtpUser?.trim() || null,
      fromEmail: values.fromEmail?.trim() || null,
      fromName: values.fromName.trim(),
      alertRecipients: values.alertRecipients?.trim() || null,
      thresholdStepGib: values.thresholdStepGib,
    };
    if (values.smtpPassword && values.smtpPassword.length > 0) {
      payload.smtpPassword = values.smtpPassword;
    }
    updateMutation.mutate(
      { data: payload as any },
      {
        onSuccess: () => {
          toast({
            title: "E-posta Ayarları Kaydedildi",
            description: values.enabled
              ? "Eşik uyarıları aktif."
              : "Yapılandırma kaydedildi (uyarılar pasif).",
          });
          queryClient.invalidateQueries({ queryKey: getGetEmailSettingsQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Kayıt Başarısız",
            description: err?.message || "Ayarlar kaydedilemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleTest = () => {
    testMutation.mutate(
      { data: {} },
      {
        onSuccess: (res) => {
          toast({
            title: res.success ? "Test E-Postası Gönderildi" : "Test Başarısız",
            description: res.message,
            variant: res.success ? "default" : "destructive",
          });
        },
        onError: (err: any) => {
          toast({
            title: "Test Başarısız",
            description: err?.message || "Mail gönderilemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <SettingsLayout>
      <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-secondary/50 border-b border-border pb-5">
          <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-background rounded border border-border">
              <Mail className="w-4 h-4 text-foreground" />
            </div>
            E-posta Uyarıları
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-muted-foreground">
            Bir KIT, aktif dönemde her N GiB'lik eşiği geçtiğinde alıcılara tek bir bildirim
            gider. Aynı eşik bir daha mail göndermez (her dönem otomatik sıfırlanır).
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
                          Uyarıları Etkinleştir
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Kapatınca eşik geçişlerinde mail gönderilmez.
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="smtpHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                            SMTP Host
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="smtp.gmail.com"
                              {...field}
                              value={field.value ?? ""}
                              className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="smtpPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          Port
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="smtpSecure"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-border p-3 bg-background">
                      <div className="space-y-0.5 pr-3">
                        <FormLabel className="text-sm font-medium text-foreground">
                          SSL/TLS (port 465)
                        </FormLabel>
                        <FormDescription className="text-xs">
                          587/STARTTLS için kapalı bırakın, 465 doğrudan TLS için açın.
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="smtpUser"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          SMTP Kullanıcı
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="kullanici@ornek.com"
                            {...field}
                            value={field.value ?? ""}
                            className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          SMTP Şifre{" "}
                          {settings?.hasPassword && (
                            <span className="text-muted-foreground normal-case">
                              (değiştirmek için doldur)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={settings?.hasPassword ? "•••••••••" : ""}
                            {...field}
                            value={field.value ?? ""}
                            className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          Gönderen E-posta
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="alerts@ornek.com"
                            {...field}
                            value={field.value ?? ""}
                            className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                          Gönderen Adı
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="bg-background border-border h-10 rounded-lg text-sm shadow-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="alertRecipients"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Yönetici Mail Adresleri
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="ornek@firma.com, baska@firma.com"
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                          className="font-mono text-sm bg-background border-border rounded-lg shadow-none resize-none"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Birden fazla adres girebilirsiniz — virgülle, noktalı virgülle veya
                        yeni satırla ayırın.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thresholdStepGib"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                        Uyarı Eşik Adımı (GiB)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none max-w-[200px]"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Varsayılan 100 — KIT 100, 200, 300, ... GiB'i geçtiğinde mail gider.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-2 justify-end pt-2">
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
                    Test Maili Gönder
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
