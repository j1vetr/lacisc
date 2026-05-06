import React, { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Server,
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";
import {
  useListStationAccounts,
  getListStationAccountsQueryKey,
  useCreateStationAccount,
  useUpdateStationAccount,
  useDeleteStationAccount,
  useTestStationAccountConnection,
  useWipeStationData,
  useGetEmailSettings,
  getGetEmailSettingsQueryKey,
  useUpdateEmailSettings,
  useTestEmailSettings,
} from "@workspace/api-client-react";
import { Mail, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";

// ---------------------------------------------------------------------------
// Form schema. Password is optional on edit (kept blank → server preserves
// existing). On create the dialog enforces it via a separate runtime check.
// ---------------------------------------------------------------------------
const accountSchema = z.object({
  label: z.string().optional(),
  portalUrl: z.string().url({ message: "Geçerli bir URL olmalıdır." }),
  username: z.string().min(1, { message: "Kullanıcı adı zorunludur." }),
  password: z.string().optional(),
  isActive: z.boolean().default(true),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
});
type AccountFormValues = z.infer<typeof accountSchema>;

type StationAccount = {
  id: number;
  label?: string | null;
  portalUrl: string;
  username: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSuccessSyncAt?: string | null;
  lastErrorMessage?: string | null;
  firstFullSyncAt?: string | null;
  kitCount: number;
};

export default function Settings() {
  useDocumentTitle("Ayarlar");
  const { data: accounts, isLoading } = useListStationAccounts({
    query: { queryKey: getListStationAccountsQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wipeMutation = useWipeStationData();

  const [editing, setEditing] = useState<StationAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListStationAccountsQueryKey() });

  const handleWipeAll = () => {
    wipeMutation.mutate(
      { params: {} },
      {
        onSuccess: (res) => {
          toast({
            title: "Tüm Veriler Temizlendi",
            description: res.message || "Tüm hesapların verisi silindi.",
          });
          queryClient.invalidateQueries();
        },
        onError: (err: any) => {
          toast({
            title: "Temizlik Başarısız",
            description: err?.message || "Veriler silinemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6 lg:space-y-10 max-w-5xl animate-in fade-in duration-500 pb-8 lg:pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">
            Ayarlar
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Her gece 01:00 da senkronize sağlanır.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none h-10 px-4"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Hesap
        </Button>
      </div>

      {/* Account list */}
      <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-secondary/50 border-b border-border pb-5">
          <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
            <div className="p-1.5 bg-background rounded border border-border">
              <Server className="w-4 h-4 text-foreground" />
            </div>
            Portal Hesapları
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-muted-foreground">
            Aktif hesapların hepsi otomatik ve manuel sync turlarında sırayla taranır.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">Henüz hesap eklenmedi.</p>
              <Button
                onClick={() => setCreating(true)}
                variant="outline"
                className="mt-4 rounded-lg shadow-none"
              >
                <Plus className="w-4 h-4 mr-2" /> İlk Hesabı Ekle
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(accounts as StationAccount[]).map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  onEdit={() => setEditing(a)}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Email alert settings */}
      <EmailSettingsCard />

      {/* Danger zone (global) */}
      <Card className="border border-[#cf2d56]/30 shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-[#cf2d56]/5 border-b border-[#cf2d56]/20 pb-5">
          <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5 text-[#cf2d56]">
            <div className="p-1.5 bg-background rounded border border-[#cf2d56]/30">
              <AlertTriangle className="w-4 h-4 text-[#cf2d56]" />
            </div>
            Tehlike Bölgesi
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-muted-foreground">
            Aşağıdaki işlem TÜM hesapların verisini siler. Geri alınamaz.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 rounded-lg border border-[#cf2d56]/20 bg-background">
            <div className="space-y-1 pr-4">
              <p className="text-sm font-medium text-foreground">
                Tüm Hesapların Tüm Verisini Sil
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                KIT'ler, dönem toplamları, CDR satırları ve sync kayıtları silinir. Hesap
                kimlik bilgileri korunur. Sonraki sync tüm geçmişi yeniden çeker.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="rounded-lg border-[#cf2d56]/40 text-[#cf2d56] hover:bg-[#cf2d56]/10 hover:text-[#cf2d56] font-medium text-[13px] h-10 px-4 shadow-none whitespace-nowrap shrink-0"
                  disabled={wipeMutation.isPending}
                >
                  <Trash2
                    className={`w-4 h-4 mr-2 ${wipeMutation.isPending ? "animate-pulse" : ""}`}
                  />
                  Tüm Verileri Temizle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Tüm hesapların verisi silinsin mi?</AlertDialogTitle>
                  <AlertDialogDescription className="leading-relaxed">
                    Bu işlem <strong>geri alınamaz</strong>. Tüm KIT'ler, dönem toplamları,
                    CDR kayıtları ve sync geçmişi silinecek. Portal kimlik bilgileri (URL,
                    kullanıcı, şifre) korunur.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-lg">Vazgeç</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleWipeAll}
                    className="rounded-lg bg-[#cf2d56] text-white hover:bg-[#cf2d56]/90"
                  >
                    Evet, hepsini sil
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <AccountFormDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        onSaved={refresh}
      />
      {/* Edit dialog */}
      <AccountFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        account={editing}
        onSaved={refresh}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single account row with quick actions (test, wipe-just-this, edit, delete).
// ---------------------------------------------------------------------------
function AccountRow({
  account,
  onEdit,
  onChanged,
}: {
  account: StationAccount;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const testMutation = useTestStationAccountConnection();
  const deleteMutation = useDeleteStationAccount();
  const wipeMutation = useWipeStationData();

  const handleTest = () => {
    testMutation.mutate(
      { id: account.id },
      {
        onSuccess: (res) => {
          toast({
            title: res.success ? "Bağlantı Doğrulandı" : "Bağlantı Başarısız",
            description: res.message,
            variant: res.success ? "default" : "destructive",
          });
        },
        onError: (err: any) => {
          toast({
            title: "Test Hatası",
            description: err?.message || "Bağlantı testi başarısız.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          toast({
            title: "Hesap Silindi",
            description: `${account.label || account.username} ve tüm verisi temizlendi.`,
          });
          queryClient.invalidateQueries();
        },
        onError: (err: any) => {
          toast({
            title: "Silme Başarısız",
            description: err?.message || "Hesap silinemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleWipeOne = () => {
    wipeMutation.mutate(
      { params: { credentialId: account.id } },
      {
        onSuccess: (res) => {
          toast({
            title: "Hesap Verisi Temizlendi",
            description: res.message,
          });
          onChanged();
          queryClient.invalidateQueries();
        },
        onError: (err: any) => {
          toast({
            title: "Temizlik Başarısız",
            description: err?.message || "Veriler silinemedi.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const displayName = account.label?.trim() || account.username;

  return (
    <li className="px-4 sm:px-6 lg:px-8 py-5 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-medium text-foreground truncate">{displayName}</span>
            {account.isActive ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-[#9fc9a2]/60 bg-[#9fc9a2]/10 text-foreground gap-1"
              >
                <Power className="w-2.5 h-2.5" /> Aktif
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-border text-muted-foreground gap-1"
              >
                <PowerOff className="w-2.5 h-2.5" /> Pasif
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 border-border text-muted-foreground font-mono"
            >
              {account.kitCount} KIT
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
            <span className="truncate">{account.portalUrl}</span>
            <span>·</span>
            <span>{account.username}</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${
                account.lastSuccessSyncAt ? "bg-[#1f8a65]" : "bg-muted-foreground"
              }`}
            />
            Son başarılı: {formatDate(account.lastSuccessSyncAt) || "—"}
          </div>
          {account.lastErrorMessage && (
            <div className="text-[11px] font-mono text-[#cf2d56] flex items-start gap-1.5 max-w-xl">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{account.lastErrorMessage}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg shadow-none h-8 px-3 text-[12px]"
            onClick={handleTest}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            )}
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg shadow-none h-8 px-3 text-[12px]"
            onClick={onEdit}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Düzenle
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg shadow-none h-8 px-3 text-[12px] border-[#dfa88f]/50 text-foreground hover:bg-[#dfa88f]/10"
                disabled={wipeMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Veriyi Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  "{displayName}" hesabının verisi silinsin mi?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Bu hesaba bağlı KIT'ler, dönem toplamları ve CDR'lar silinecek. Hesap
                  kimlik bilgileri korunur; sonraki sync geçmişi yeniden çeker.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleWipeOne}
                  className="rounded-lg bg-[#cf2d56] text-white hover:bg-[#cf2d56]/90"
                >
                  Evet, verileri sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg shadow-none h-8 px-3 text-[12px] border-[#cf2d56]/40 text-[#cf2d56] hover:bg-[#cf2d56]/10 hover:text-[#cf2d56]"
                disabled={deleteMutation.isPending}
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>"{displayName}" hesabını sil?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hesap ve TÜM verisi (KIT'ler, dönem toplamları, CDR'lar) kalıcı olarak
                  silinecek. Bu işlem <strong>geri alınamaz</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="rounded-lg bg-[#cf2d56] text-white hover:bg-[#cf2d56]/90"
                >
                  Evet, hesabı sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog. Mode determines whether password is required.
// ---------------------------------------------------------------------------
function AccountFormDialog({
  open,
  onOpenChange,
  mode,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  account?: StationAccount | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createMutation = useCreateStationAccount();
  const updateMutation = useUpdateStationAccount();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      label: "",
      portalUrl: "https://portal.stationsatcom.com/Account/Login",
      username: "",
      password: "",
      isActive: true,
      syncIntervalMinutes: 30,
    },
  });

  // Reset whenever the dialog opens with a new context.
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
        portalUrl: "https://portal.stationsatcom.com/Account/Login",
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
      form.setError("password", { message: "Yeni hesap için şifre zorunludur." });
      return;
    }
    if (mode === "create") {
      createMutation.mutate(
        {
          data: {
            label: values.label || null,
            portalUrl: values.portalUrl,
            username: values.username,
            password: values.password!,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Hesap Eklendi",
              description: `${values.label || values.username} kuyruğa alındı.`,
            });
            onSaved();
            onOpenChange(false);
          },
          onError: (err: any) => {
            toast({
              title: "Kayıt Başarısız",
              description: err?.message || "Hesap eklenemedi.",
              variant: "destructive",
            });
          },
        }
      );
    } else if (account) {
      updateMutation.mutate(
        {
          id: account.id,
          data: {
            label: values.label || null,
            portalUrl: values.portalUrl,
            username: values.username,
            password: values.password?.trim() ? values.password : null,
            isActive: values.isActive,
            syncIntervalMinutes: values.syncIntervalMinutes,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Hesap Güncellendi",
              description: `${values.label || values.username} kaydedildi.`,
            });
            onSaved();
            onOpenChange(false);
          },
          onError: (err: any) => {
            toast({
              title: "Güncelleme Başarısız",
              description: err?.message || "Hesap güncellenemedi.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Yeni Portal Hesabı" : "Hesabı Düzenle"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Hesap eklendikten sonra otomatik sync turlarına dahil edilir."
              : "Şifre alanı boş bırakılırsa mevcut şifre korunur."}
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
                    Hesap Adı (Etiket)
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Örn. Yılmazlar Balık"
                      {...field}
                      value={field.value ?? ""}
                      className="bg-background border-border h-10 rounded-lg text-sm shadow-none"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    UI'da kullanıcı adı yerine bu görünür.
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
                    Portal Adresi
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://portal.stationsatcom.com/Account/Login"
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
                      Kullanıcı Adı
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Şifre {mode === "edit" && <span className="text-muted-foreground normal-case">(opsiyonel)</span>}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={mode === "edit" ? "Değiştirmek için doldur" : ""}
                        {...field}
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
                    <FormLabel className="text-sm font-medium text-foreground">Aktif</FormLabel>
                    <FormDescription className="text-xs">
                      Pasif hesaplar sync turunda atlanır.
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
                Vazgeç
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
              >
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === "create" ? "Hesabı Ekle" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Email alert settings card — SMTP transport + recipient list + test send.
// Single-row config; password field is write-only (never returned by API).
// ---------------------------------------------------------------------------
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

function EmailSettingsCard() {
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

  // Hydrate the form when the settings load.
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
    // Only send the password when the user typed something — empty stays unchanged.
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
  );
}

// Suppress unused warning for an icon kept in case we expand the row UI later.
void CheckCircle2;
