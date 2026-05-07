import { useState } from "react";
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  useResetAdminUserPassword,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Plus, Trash2, Unlock, Pencil } from "lucide-react";

type Role = "owner" | "admin" | "viewer";

function fmt(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("tr-TR");
}

export default function AdminUsers() {
  useDocumentTitle("Kullanıcılar");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isOwner = (me as { role?: Role } | undefined)?.role === "owner";
  const { data: users = [], isLoading } = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey() },
  });

  const createMut = useCreateAdminUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "Kullanıcı oluşturuldu" });
        setCreateOpen(false);
      },
      onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });
  const updateMut = useUpdateAdminUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "Güncellendi" });
        setEditOpen(null);
      },
      onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });
  const deleteMut = useDeleteAdminUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "Silindi" });
      },
      onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });
  const resetMut = useResetAdminUserPassword({
    mutation: {
      onSuccess: () => {
        toast({ title: "Şifre sıfırlandı" });
        setResetOpen(null);
      },
      onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "admin" as Role });

  const [editOpen, setEditOpen] = useState<null | { id: number; name: string; role: Role }>(null);
  const [resetOpen, setResetOpen] = useState<null | { id: number; email: string }>(null);
  const [resetPw, setResetPw] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Kullanıcılar</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistem kullanıcılarını ve rollerini yönetin.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Yeni Kullanıcı
        </Button>
      </div>

      <Card className="shadow-none border-border">
        <CardHeader>
          <CardTitle className="text-base font-medium">Liste</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground tracking-widest">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium">Ad</th>
                    <th className="text-left py-2 font-medium">E-posta</th>
                    <th className="text-left py-2 font-medium">Rol</th>
                    <th className="text-left py-2 font-medium">Son Giriş</th>
                    <th className="text-left py-2 font-medium">Durum</th>
                    <th className="text-right py-2 font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                    return (
                      <tr key={u.id} className="border-b border-border/60 hover:bg-secondary/40">
                        <td className="py-3">{u.name}</td>
                        <td className="py-3 font-mono text-xs">{u.email}</td>
                        <td className="py-3">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3 font-mono text-xs">{fmt(u.lastLoginAt)}</td>
                        <td className="py-3">
                          {locked ? (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                              Kilitli
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Aktif</span>
                          )}
                        </td>
                        <td className="py-3 text-right space-x-1">
                          {locked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Kilidi aç"
                              onClick={() =>
                                updateMut.mutate({ id: u.id, data: { unlock: true } })
                              }
                            >
                              <Unlock className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Düzenle"
                            onClick={() =>
                              setEditOpen({ id: u.id, name: u.name, role: u.role as Role })
                            }
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Şifre sıfırla"
                            onClick={() => {
                              setResetPw("");
                              setResetOpen({ id: u.id, email: u.email });
                            }}
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Sil"
                            disabled={u.id === me?.id || (u.role === "owner" && !isOwner)}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${u.email} kullanıcısı silinsin mi? Bu işlem geri alınamaz.`
                                )
                              ) {
                                deleteMut.mutate({ id: u.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni kullanıcı</DialogTitle>
            <DialogDescription>
              Şifre en az 12 karakter, büyük/küçük harf, rakam ve özel karakter içermelidir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ad</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Şifre</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as Role }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (yalnız okur)</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isOwner && <SelectItem value="owner">Owner (sahip)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={createMut.isPending}
              onClick={() => createMut.mutate({ data: createForm })}
            >
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editOpen} onOpenChange={(o) => !o && setEditOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcıyı düzenle</DialogTitle>
          </DialogHeader>
          {editOpen && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ad</Label>
                <Input
                  value={editOpen.name}
                  onChange={(e) =>
                    setEditOpen((s) => (s ? { ...s, name: e.target.value } : s))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  value={editOpen.role}
                  onValueChange={(v) =>
                    setEditOpen((s) => (s ? { ...s, role: v as Role } : s))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(null)}>
              İptal
            </Button>
            <Button
              disabled={updateMut.isPending}
              onClick={() => {
                if (!editOpen) return;
                updateMut.mutate({
                  id: editOpen.id,
                  data: { name: editOpen.name, role: editOpen.role },
                });
              }}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <AlertDialog open={!!resetOpen} onOpenChange={(o) => !o && setResetOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Şifreyi sıfırla</AlertDialogTitle>
            <AlertDialogDescription>
              {resetOpen?.email} için yeni bir şifre belirleyin. Politika gereksinimlerini karşılamalıdır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="Yeni şifre"
            autoComplete="new-password"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!resetOpen) return;
                resetMut.mutate({ id: resetOpen.id, data: { newPassword: resetPw } });
              }}
            >
              Sıfırla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
