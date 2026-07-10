import React from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  useCreateLeobridgeAccount,
  useUpdateLeobridgeAccount,
} from "@workspace/api-client-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { LeobridgeAccount } from "./types";

const DEFAULT_PORTAL_URL = "https://leobridge.spacenorway.com";

const accountSchema = z.object({
  label: z.string().optional(),
  portalUrl: z.string().url({ message: "Geçerli bir URL olmalıdır." }),
  username: z.string().min(1, { message: "Kullanıcı adı zorunludur." }),
  password: z.string().optional(),
  isActive: z.boolean().default(true),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
});
type AccountFormValues = z.infer<typeof accountSchema>;

export function LeobridgeAccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  account?: LeobridgeAccount | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createMutation = useCreateLeobridgeAccount();
  const updateMutation = useUpdateLeobridgeAccount();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      label: "",
      portalUrl: DEFAULT_PORTAL_URL,
      username: "",
      password: "",
      isActive: true,
      syncIntervalMinutes: 30,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && account) {
      form.reset({
        label: account.label || "",
        portalUrl: account.portalUrl,
        username: account.username,
        password: "",
        isActive: account.isActive,
        syncIntervalMinutes: account.syncIntervalMinutes,
      });
    } else {
      form.reset({
        label: "",
        portalUrl: DEFAULT_PORTAL_URL,
        username: "",
        password: "",
        isActive: true,
        syncIntervalMinutes: 30,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, account?.id]);

  const onSubmit = (values: AccountFormValues) => {
    if (mode === "create" && !values.password?.trim()) {
      form.setError("password", {
        message: "Yeni hesap için şifre zorunludur.",
      });
      return;
    }
    if (mode === "create") {
      createMutation.mutate(
        {
          data: {
            label: values.label || null,
            portalUrl: values.portalUrl.trim(),
            username: values.username.trim(),
            password: values.password!,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: t("Hesap Eklendi"),
              description: t("{{name}} kuyruğa alındı.", { name: values.label || values.username }),
            });
            onSaved();
            onOpenChange(false);
          },
          onError: (err: unknown) => {
            toast({
              title: t("Kayıt Başarısız"),
              description:
                (err instanceof Error ? t(err.message) : null) ||
                t("Hesap eklenemedi."),
              variant: "destructive",
            });
          },
        },
      );
    } else if (account) {
      updateMutation.mutate(
        {
          id: account.id,
          data: {
            label: values.label || null,
            portalUrl: values.portalUrl.trim(),
            username: values.username.trim(),
            // boş şifre → değişmez (encrypted_password NOT NULL)
            password: values.password?.trim() ? values.password : null,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: t("Hesap Güncellendi"),
              description: t("{{name}} kaydedildi.", { name: values.label || values.username }),
            });
            onSaved();
            onOpenChange(false);
          },
          onError: (err: unknown) => {
            toast({
              title: t("Güncelleme Başarısız"),
              description:
                (err instanceof Error ? t(err.message) : null) ||
                t("Hesap güncellenemedi."),
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("Yeni Norway Hesabı") : t("Hesabı Düzenle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("Hesap eklendikten sonra otomatik sync turlarına dahil edilir.")
              : t("Şifre alanı boş bırakılırsa mevcut şifre korunur.")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Hesap Adı (Etiket)")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("Örn. Polar Filo")}
                      {...field}
                      value={field.value ?? ""}
                      className="bg-background border-border h-10 rounded-lg text-sm shadow-none"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t("UI'da kullanıcı adı yerine bu görünür.")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="portalUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                    {t("Portal Adresi")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={DEFAULT_PORTAL_URL}
                      {...field}
                      className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {t("Kullanıcı Adı")}
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
                      {t("Şifre")}{" "}
                      {mode === "edit" && (
                        <span className="text-muted-foreground normal-case">
                          ({t("opsiyonel")})
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={
                          mode === "edit" ? t("Değiştirmek için doldur") : ""
                        }
                        {...field}
                        value={field.value ?? ""}
                        className="bg-background border-border h-10 rounded-lg font-mono text-sm shadow-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border p-3 bg-background">
                  <div className="space-y-0.5 pr-3">
                    <FormLabel className="text-sm font-medium text-foreground">
                      {t("Aktif")}
                    </FormLabel>
                    <FormDescription className="text-xs">
                      {t("Pasif hesaplar sync turunda atlanır.")}
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-lg shadow-none"
              >
                {t("Vazgeç")}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
              >
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === "create" ? t("Hesabı Ekle") : t("Kaydet")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
