import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetMe,
  getGetMeQueryKey,
  useChangePassword,
  useTerminateAllSessions,
  useListSessions,
  useRevokeSession,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PasswordStrength } from "@/components/password-strength";
import { LogOut, Monitor, X } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function Profile() {
  const { t } = useTranslation();
  useDocumentTitle(t("Profilim"));
  const PASSWORD_RULES = [
    t("En az 12 karakter"),
    t("En az bir büyük ve bir küçük harf"),
    t("En az bir rakam"),
    t("En az bir özel karakter (örn. !@#$)"),
  ];
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { toast } = useToast();
  const qc = useQueryClient();
  const change = useChangePassword();
  const terminate = useTerminateAllSessions({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Tüm oturumlar sonlandırıldı") });
        qc.clear();
        window.location.href = "/login";
      },
      onError: (e: Error) =>
        toast({ title: t("Sonlandırılamadı"), description: t(e.message), variant: "destructive" }),
    },
  });

  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNewPw] = useState("");
  const [confirmPassword, setConfirm] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t("Şifreler eşleşmiyor"), variant: "destructive" });
      return;
    }
    change.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({ title: t("Şifre güncellendi") });
          setCurrent("");
          setNewPw("");
          setConfirm("");
        },
        onError: (err: Error) => {
          toast({
            title: t("Güncellenemedi"),
            description: t(err.message) || t("Bilinmeyen hata"),
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">{t("Profilim")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("Hesap bilgileriniz ve şifre yönetimi.")}</p>
      </div>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("Hesap")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">{t("Ad")}</span>
            <span className="col-span-2 font-medium">{user?.name ?? "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">{t("E-posta")}</span>
            <span className="col-span-2 font-mono">{user?.email ?? "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">{t("Rol")}</span>
            <span className="col-span-2 uppercase tracking-widest text-primary text-xs font-mono">
              {(user as { role?: string } | undefined)?.role ?? "—"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">{t("Son giriş")}</span>
            <span className="col-span-2 font-mono text-xs">
              {(user as { lastLoginAt?: string } | undefined)?.lastLoginAt
                ? new Date((user as { lastLoginAt: string }).lastLoginAt).toLocaleString("tr-TR")
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("Şifre Değiştir")}</CardTitle>
          <CardDescription className="text-xs">
            <ul className="list-disc list-inside space-y-0.5">
              {PASSWORD_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="current">{t("Mevcut şifre")}</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">{t("Yeni şifre")}</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPw(e.target.value)}
                required
                autoComplete="new-password"
              />
              <PasswordStrength password={newPassword} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("Yeni şifre (tekrar)")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? t("Kaydediliyor…") : t("Şifreyi Güncelle")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <SessionsCard />
    </div>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useListSessions({
    query: { queryKey: getListSessionsQueryKey(), refetchInterval: 30_000 },
  });
  const terminate = useTerminateAllSessions({
    mutation: {
      onSuccess: () => {
        toast({ title: t("Tüm oturumlar sonlandırıldı") });
        qc.clear();
        window.location.href = "/login";
      },
      onError: (e: Error) =>
        toast({ title: t("Sonlandırılamadı"), description: t(e.message), variant: "destructive" }),
    },
  });
  const revoke = useRevokeSession({
    mutation: {
      onSuccess: (_d, vars) => {
        toast({ title: t("Oturum sonlandırıldı") });
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        // If we revoked our own session, server cleared the cookie — bounce.
        const wasCurrent = sessions?.find((s) => s.id === vars.id)?.current;
        if (wasCurrent) {
          qc.clear();
          window.location.href = "/login";
        }
      },
      onError: (e: Error) =>
        toast({ title: t("Sonlandırılamadı"), description: t(e.message), variant: "destructive" }),
    },
  });

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-medium">{t("Aktif Oturumlar")}</CardTitle>
          <CardDescription className="text-xs">
            {t("Bu hesapla giriş yapılmış cihaz/tarayıcılar. Tek tek veya hepsini birden sonlandırabilirsiniz.")}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={terminate.isPending}
          onClick={() => {
            if (window.confirm(t("Tüm cihazlardaki oturumlarınız sonlandırılsın mı?"))) {
              terminate.mutate();
            }
          }}
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          {t("Tümünü Sonlandır")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t("Yükleniyor…")}</div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("Aktif oturum bulunamadı.")}</div>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-xs truncate">{s.userAgent || t("Bilinmeyen istemci")}</span>
                    {s.current && (
                      <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded">
                        {t("Bu oturum")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground font-mono">
                    {t("{{ip}} · Son etkin {{date}}", {
                      ip: s.ip ?? "—",
                      date: new Date(s.lastSeenAt).toLocaleString("tr-TR"),
                    })}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (window.confirm(s.current ? t("Mevcut oturum sonlandırılsın mı? Yeniden giriş yapmanız gerekir.") : t("Bu oturum sonlandırılsın mı?"))) {
                      revoke.mutate({ id: s.id });
                    }
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  {t("Sonlandır")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
