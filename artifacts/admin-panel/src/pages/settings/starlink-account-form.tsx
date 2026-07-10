import React from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  useCreateStarlinkAccount,
  useUpdateStarlinkAccount,
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
import type { StarlinkAccount } from "./types";

const DEFAULT_BASE_URL = "https://starlink.tototheo.com";

const accountSchema = z.object({
  label: z.string().optional(),
  apiBaseUrl: z.string().url({ message: "Geçerli bir URL olmalıdır." }),
  token: z.string().optional(),
  isActive: z.boolean().default(true),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
});
type AccountFormValues = z.infer<typeof accountSchema>;

export function StarlinkAccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  account?: StarlinkAccount | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createMutation = useCreateStarlinkAccount();
  const updateMutation = useUpdateStarlinkAccount();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      label: "",
      apiBaseUrl: DEFAULT_BASE_URL,
      token: "",
      isActive: true,
      syncIntervalMinutes: 30,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && account) {
      form.reset({
        label: account.label || "",
        apiBaseUrl: account.apiBaseUrl,
        token: "",
        isActive: account.isActive,
        syncIntervalMinutes: account.syncIntervalMinutes,
      });
    } else {
      form.reset({
        label: "",
        apiBaseUrl: DEFAULT_BASE_URL,
        token: "",
        isActive: true,
        syncIntervalMinutes: 30,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, account?.id]);

  const onSubmit = (values: AccountFormValues) => {
    if (mode === "create" && !values.token?.trim()) {
      form.setError("token", { message: "Yeni hesap için token zorunludur." });
      return;
    }
    if (mode === "create") {
      createMutation.mutate(
        {
          data: {
            label: values.label || null,
            apiBaseUrl: values.apiBaseUrl.trim(),
            token: values.token!,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: t("Hesap Eklendi"),
              description: t("{{name}} kuyruğa alındı.", { name: values.label || t("Yeni hesap") }),
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
            apiBaseUrl: values.apiBaseUrl.trim(),
            // boş token → değişmez (encrypted_token NOT NULL)
            token: values.token?.trim() ? values.token : null,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: t("Hesap Güncellendi"),
              description: `${values.label || `#${account.id}`} kaydedildi.`,
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
            {mode === "create" ? t("Yeni Tototheo Hesabı") : t("Hesabı Düzenle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("Hesap eklendikten sonra otomatik sync turlarına dahil edilir.")
              : t("Token alanı boş bırakılırsa mevcut token korunur.")}
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
                      placeholder={t("Örn. Yılmazlar Filo")}
                      {...field}
                      value={field.value ?? ""}
                      className="bg-background border-border h-10 rounded-lg text-sm shadow-none"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t("UI'da hesap rozeti olarak görünür.")}
                  </FormDescription>
                  <FormMessage />
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
                      placeholder={DEFAULT_BASE_URL}
                      {...field}
                      className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t("Tototheo Swagger sayfasındaki temel adres. Genellikle değiştirilmez.")}
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
                    {mode === "edit" && (
                      <span className="text-muted-foreground normal-case">
                        ({t("değiştirmek için doldur")})
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        mode === "edit" ? "•••••••••" : "eyJhbGciOi..."
                      }
                      {...field}
                      value={field.value ?? ""}
                      className="font-mono text-sm bg-background border-border h-10 rounded-lg shadow-none"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t("AES-256-GCM ile şifrelenmiş olarak saklanır. Bu sayfada bir daha gösterilmez.")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
