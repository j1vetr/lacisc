import { useState } from "react";
import {
  useGetMe,
  getGetMeQueryKey,
  useChangePassword,
  useTerminateAllSessions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PasswordStrength } from "@/components/password-strength";
import { LogOut } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const PASSWORD_RULES = [
  "En az 12 karakter",
  "En az bir büyük ve bir küçük harf",
  "En az bir rakam",
  "En az bir özel karakter (örn. !@#$)",
];

export default function Profile() {
  useDocumentTitle("Profilim");
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { toast } = useToast();
  const qc = useQueryClient();
  const change = useChangePassword();
  const terminate = useTerminateAllSessions({
    mutation: {
      onSuccess: () => {
        toast({ title: "Tüm oturumlar sonlandırıldı" });
        qc.clear();
        window.location.href = "/login";
      },
      onError: (e: Error) =>
        toast({ title: "Sonlandırılamadı", description: e.message, variant: "destructive" }),
    },
  });

  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNewPw] = useState("");
  const [confirmPassword, setConfirm] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Şifreler eşleşmiyor", variant: "destructive" });
      return;
    }
    change.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Şifre güncellendi" });
          setCurrent("");
          setNewPw("");
          setConfirm("");
        },
        onError: (err: Error) => {
          toast({
            title: "Güncellenemedi",
            description: err.message || "Bilinmeyen hata",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Profilim</h1>
        <p className="text-sm text-muted-foreground mt-1">Hesap bilgileriniz ve şifre yönetimi.</p>
      </div>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Hesap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Ad</span>
            <span className="col-span-2 font-medium">{user?.name ?? "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">E-posta</span>
            <span className="col-span-2 font-mono">{user?.email ?? "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Rol</span>
            <span className="col-span-2 uppercase tracking-widest text-primary text-xs font-mono">
              {(user as { role?: string } | undefined)?.role ?? "—"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Son giriş</span>
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
          <CardTitle className="text-base font-medium">Şifre Değiştir</CardTitle>
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
              <Label htmlFor="current">Mevcut şifre</Label>
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
              <Label htmlFor="new">Yeni şifre</Label>
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
              <Label htmlFor="confirm">Yeni şifre (tekrar)</Label>
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
              {change.isPending ? "Kaydediliyor…" : "Şifreyi Güncelle"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Aktif Oturumlar</CardTitle>
          <CardDescription className="text-xs">
            Sistem JWT tabanlıdır; aktif oturum listesi tutulmaz. Bu işlem
            sizin tüm cihaz/tarayıcılarınızdaki oturumları (mevcut dahil) anında
            geçersiz kılar — yeniden giriş yapmanız gerekir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={terminate.isPending}
            onClick={() => {
              if (window.confirm("Tüm cihazlardaki oturumlarınız sonlandırılsın mı?")) {
                terminate.mutate();
              }
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Tüm Oturumları Sonlandır
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
