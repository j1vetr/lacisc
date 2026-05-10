import { useEffect, useMemo, useState } from "react";
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useCreateAdminUser,
  useUpdateAdminUser,
  useDeleteAdminUser,
  useResetAdminUserPassword,
  useGetMe,
  getGetMeQueryKey,
  useListAssignableKits,
  getListAssignableKitsQueryKey,
  useGetAssignedKits,
  getGetAssignedKitsQueryKey,
  useUpdateAssignedKits,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyRound, Plus, Trash2, Unlock, Pencil, ListChecks, Search } from "lucide-react";
import { PasswordStrength } from "@/components/password-strength";

type Role = "owner" | "admin" | "viewer" | "customer";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  viewer: "Operatör (yalnız okur)",
  customer: "Müşteri (görüntüleyici)",
};

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

  // Müşteri rolünde Create dialog atama'yı sıralı tetiklediği için tek-noktada
  // toast/invalidate yapamıyoruz; mutation'ı sade tutup hata yönetimini submit
  // handler'a bıraktık. Operatör/admin oluşturmada akış aynı.
  const createMut = useCreateAdminUser();
  const createAssignMut = useUpdateAssignedKits();
  const updateMut = useUpdateAdminUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "Güncellendi" });
        setEditOpen(null);
      },
      onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });
  const deleteMut = useDeleteAdminUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        toast({ title: "Silindi" });
      },
      onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });
  const resetMut = useResetAdminUserPassword({
    mutation: {
      onSuccess: () => {
        toast({ title: "Şifre sıfırlandı" });
        setResetOpen(null);
      },
      onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    username: "",
    phone: "",
    password: "",
    role: "admin" as Role,
  });
  const [createAssignedKits, setCreateAssignedKits] = useState<Set<string>>(
    new Set(),
  );

  const resetCreateForm = () => {
    setCreateForm({ name: "", email: "", username: "", phone: "", password: "", role: "admin" });
    setCreateAssignedKits(new Set());
  };

  const handleCreateSubmit = async () => {
    try {
      const created = await createMut.mutateAsync({
        data: {
          name: createForm.name,
          password: createForm.password,
          role: createForm.role,
          email: createForm.email.trim() || null,
          username: createForm.username.trim() || null,
          phone: createForm.phone.trim() || null,
        },
      });
      // Müşteri ise ve KIT seçildiyse ikinci PUT — atomik değil ama replace-all
      // olduğu için yeniden çalıştırmak güvenli. Hata olursa kullanıcı yine de
      // listede görünür ve ayrı modal ile atama tamamlanabilir.
      if (
        createForm.role === "customer" &&
        createAssignedKits.size > 0 &&
        created &&
        typeof (created as { id?: number }).id === "number"
      ) {
        try {
          await createAssignMut.mutateAsync({
            id: (created as { id: number }).id,
            data: { kitNos: Array.from(createAssignedKits) },
          });
        } catch (e) {
          toast({
            title: "Kullanıcı oluşturuldu, KIT atama başarısız",
            description:
              "Listeden satırın yanındaki KIT atama düğmesi ile tekrar deneyin.",
            variant: "destructive",
          });
          qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
          setCreateOpen(false);
          resetCreateForm();
          return;
        }
      }
      qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      toast({ title: "Kullanıcı oluşturuldu" });
      setCreateOpen(false);
      resetCreateForm();
    } catch (e) {
      toast({
        title: "Hata",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const [editOpen, setEditOpen] = useState<null | { id: number; name: string; username: string | null; phone: string; role: Role }>(null);
  const [resetOpen, setResetOpen] = useState<null | { id: number; label: string }>(null);
  const [resetPw, setResetPw] = useState("");
  const [assignOpen, setAssignOpen] = useState<null | { id: number; name: string; username: string | null }>(null);

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
                    <th className="text-left py-2 font-medium">Kullanıcı adı / E-posta</th>
                    <th className="text-left py-2 font-medium">Telefon</th>
                    <th className="text-left py-2 font-medium">Rol</th>
                    <th className="text-left py-2 font-medium">Atanmış KIT</th>
                    <th className="text-left py-2 font-medium">Son Giriş</th>
                    <th className="text-left py-2 font-medium">Durum</th>
                    <th className="text-right py-2 font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                    const isCustomer = u.role === "customer";
                    return (
                      <tr key={u.id} className="border-b border-border/60 hover:bg-secondary/40">
                        <td className="py-3">{u.name}</td>
                        <td className="py-3 font-mono text-xs">
                          <div className="flex flex-col">
                            {u.username && <span>{u.username}</span>}
                            {u.email && (
                              <span className={u.username ? "text-muted-foreground text-[11px]" : ""}>{u.email}</span>
                            )}
                            {!u.username && !u.email && <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="py-3 font-mono text-xs">
                          {u.phone ? (
                            <span>{u.phone}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={
                              isCustomer
                                ? "font-mono text-[10px] uppercase bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]"
                                : "font-mono text-[10px] uppercase"
                            }
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3 font-mono text-xs">
                          {isCustomer ? (
                            <span className="text-foreground">{u.assignedKitCount ?? 0}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
                          {isCustomer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="KIT atamalarını yönet"
                              onClick={() =>
                                setAssignOpen({ id: u.id, name: u.name, username: u.username ?? null })
                              }
                            >
                              <ListChecks className="w-4 h-4" />
                            </Button>
                          )}
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
                              setEditOpen({
                                id: u.id,
                                name: u.name,
                                username: u.username ?? null,
                                phone: u.phone ?? "",
                                role: u.role as Role,
                              })
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
                              setResetOpen({ id: u.id, label: u.username || u.email || u.name });
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
                                  `${u.username || u.email || u.name} kullanıcısı silinsin mi? Bu işlem geri alınamaz.`
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
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreateForm();
        }}
      >
        <DialogContent className={createForm.role === "customer" ? "max-w-2xl" : undefined}>
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
              <Label>Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => {
                  setCreateForm((f) => ({ ...f, role: v as Role }));
                  // Müşteri rolünden çıkıldığında seçili KIT'leri unut.
                  if (v !== "customer") setCreateAssignedKits(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{ROLE_LABEL.customer}</SelectItem>
                  <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                  <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                  {isOwner && <SelectItem value="owner">{ROLE_LABEL.owner}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Kullanıcı adı{" "}
                <span className="text-[11px] text-muted-foreground">
                  ({createForm.role === "customer" ? "zorunlu" : "opsiyonel"}, 3-32 karakter, küçük harf/rakam/_.-)
                </span>
              </Label>
              <Input
                value={createForm.username}
                placeholder={createForm.role === "customer" ? "musteri_adi" : "(otomatik türetilir)"}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                E-posta{" "}
                <span className="text-[11px] text-muted-foreground">
                  ({createForm.role === "customer" ? "opsiyonel" : "zorunlu"})
                </span>
              </Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Telefon{" "}
                <span className="text-[11px] text-muted-foreground">
                  (opsiyonel — WhatsApp eşik bildirimi için, örn. 905321234567)
                </span>
              </Label>
              <Input
                type="tel"
                value={createForm.phone}
                placeholder="905321234567"
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Şifre</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
              <PasswordStrength password={createForm.password} />
            </div>
            {createForm.role === "customer" && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label>
                  KIT atamaları{" "}
                  <span className="text-[11px] text-muted-foreground">
                    (oluşturma ile birlikte atanır — sonradan değiştirilebilir)
                  </span>
                </Label>
                <KitPickerInline
                  enabled={createOpen}
                  selected={createAssignedKits}
                  onChange={setCreateAssignedKits}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              İptal
            </Button>
            <Button
              disabled={createMut.isPending || createAssignMut.isPending}
              onClick={handleCreateSubmit}
            >
              {createForm.role === "customer" && createAssignedKits.size > 0
                ? `Oluştur (+${createAssignedKits.size} KIT)`
                : "Oluştur"}
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
                <Label>Kullanıcı adı</Label>
                <Input
                  value={editOpen.username ?? ""}
                  placeholder="(boş bırakılabilir — operatör hesapları için)"
                  onChange={(e) =>
                    setEditOpen((s) =>
                      s ? { ...s, username: e.target.value.toLowerCase() } : s
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Telefon{" "}
                  <span className="text-[11px] text-muted-foreground">
                    (WHATSAPP İÇİN GEREKLİ)
                  </span>
                </Label>
                <Input
                  type="tel"
                  value={editOpen.phone}
                  placeholder="905321234567"
                  onChange={(e) =>
                    setEditOpen((s) => (s ? { ...s, phone: e.target.value } : s))
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
                    <SelectItem value="customer">{ROLE_LABEL.customer}</SelectItem>
                    <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                    <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                    {isOwner && <SelectItem value="owner">{ROLE_LABEL.owner}</SelectItem>}
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
                  data: {
                    name: editOpen.name,
                    role: editOpen.role,
                    username: editOpen.username || null,
                    phone: editOpen.phone.trim() || null,
                  },
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
              {resetOpen?.label} için yeni bir şifre belirleyin. Politika gereksinimlerini karşılamalıdır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="password"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="Yeni şifre"
            autoComplete="new-password"
          />
          <PasswordStrength password={resetPw} />
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

      {/* KIT assignment dialog */}
      <AssignKitsDialog
        target={assignOpen}
        onClose={() => setAssignOpen(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KIT atama modalı — Satcom (turuncu) + Starlink (mavi) badge'lerle iki
// kategoriye ayrılmış çoklu seçim. Replace-all stratejisi: kayıt sırasında
// modaldaki seçim seti backend'e olduğu gibi PUT'lanır.
// ---------------------------------------------------------------------------

function AssignKitsDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { id: number; name: string; username: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const open = target !== null;
  const userId = target?.id ?? 0;

  const { data: assignableData, isLoading: kitsLoading } = useListAssignableKits({
    query: {
      queryKey: getListAssignableKitsQueryKey(),
      enabled: open,
      staleTime: 30_000,
    },
  });
  const { data: assignedData, isLoading: assignedLoading } = useGetAssignedKits(
    userId,
    {
      query: {
        queryKey: getGetAssignedKitsQueryKey(userId),
        enabled: open && userId > 0,
      },
    }
  );

  const assignable = assignableData?.kits ?? [];
  const initialSelected = useMemo(
    () => new Set((assignedData?.assignments ?? []).map((a) => a.kitNo)),
    [assignedData]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [touched, setTouched] = useState(false);

  // Modal hedefi (userId) değiştiğinde veya server'dan yeni atama listesi
  // geldiğinde local seçim setini SERVER ile senkronize et — kullanıcı
  // henüz dokunmadıysa. İki müşterinin atanmış sayıları eşit ama setleri
  // farklıysa boyut eşitliği yetmez; yeni `target.id` ile her zaman
  // resetlenir + assignedData içerikten sıfırdan kurulur.
  useEffect(() => {
    if (!open) return;
    if (!assignedData) return;
    setTouched(false);
    setSelected(new Set(initialSelected));
    // initialSelected reference değişimi bağımlı: assignedData ya da target
    // değiştiğinde useMemo onu yeniler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, assignedData]);

  const updateMut = useUpdateAssignedKits({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAssignedKitsQueryKey(userId) });
        onSaved();
        toast({ title: "Atamalar güncellendi" });
        onClose();
        setTouched(false);
      },
      onError: (e: Error) =>
        toast({ title: "Hata", description: e.message, variant: "destructive" }),
    },
  });

  const filtered = assignable.filter((k) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      k.kitNo.toLowerCase().includes(q) ||
      (k.label ?? "").toLowerCase().includes(q)
    );
  });
  const satcom = filtered.filter((k) => k.source === "satcom");
  const starlink = filtered.filter((k) => k.source === "starlink");
  const leobridge = filtered.filter((k) => k.source === "leobridge");

  const toggle = (kit: string) => {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kit)) next.delete(kit);
      else next.add(kit);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          setTouched(false);
          setSelected(new Set());
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>KIT atamaları</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{target?.name}</span>
            {target?.username && (
              <span className="font-mono text-xs ml-2 text-muted-foreground">
                @{target.username}
              </span>
            )}
            {" — "}seçilen KIT'leri bu müşteri panelinde görebilir.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="KIT no veya gemi adı ara…"
            className="pl-9"
          />
        </div>

        <div className="text-xs text-muted-foreground flex items-center justify-between">
          <span>
            {selected.size} seçili / {assignable.length} toplam
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setTouched(true);
                setSelected(new Set(filtered.map((k) => k.kitNo)));
              }}
            >
              Görüneni seç
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setTouched(true);
                setSelected(new Set());
              }}
            >
              Tümünü temizle
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] border border-border rounded-lg">
          {kitsLoading || assignedLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Yükleniyor…</div>
          ) : assignable.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Henüz hiç KIT verisi yok. Önce bir hesap senkronize edin.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {satcom.length > 0 && (
                <KitGroup
                  title="Satcom"
                  badgeClass="bg-[#fde0d0] text-[#a4400a] border-[#f4b896]"
                  items={satcom}
                  selected={selected}
                  onToggle={toggle}
                />
              )}
              {starlink.length > 0 && (
                <KitGroup
                  title="Tototheo"
                  badgeClass="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]"
                  items={starlink}
                  selected={selected}
                  onToggle={toggle}
                />
              )}
              {leobridge.length > 0 && (
                <KitGroup
                  title="Norway"
                  badgeClass="bg-[#dde2f7] text-[#3a3aa6] border-[#a6a6dd]"
                  items={leobridge}
                  selected={selected}
                  onToggle={toggle}
                />
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button
            disabled={updateMut.isPending}
            onClick={() =>
              updateMut.mutate({
                id: userId,
                data: { kitNos: Array.from(selected) },
              })
            }
          >
            Kaydet ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline KIT picker — Create dialog'da müşteri rolünde kullanılır. AssignKits
// modalındaki tam UI'ın hafif sürümü: aynı `useListAssignableKits` cache'ini
// paylaşır (staleTime 30sn), aynı Satcom/Tototheo gruplama + arama + toplu seç
// kontrolleri. Yükseklik daha kompakt (260px) çünkü Create dialog içinde başka
// alanlarla yan yana duruyor.
// ---------------------------------------------------------------------------

function KitPickerInline({
  enabled,
  selected,
  onChange,
}: {
  enabled: boolean;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { data: assignableData, isLoading } = useListAssignableKits({
    query: {
      queryKey: getListAssignableKitsQueryKey(),
      enabled,
      staleTime: 30_000,
    },
  });
  const assignable = assignableData?.kits ?? [];
  const [search, setSearch] = useState("");

  const filtered = assignable.filter((k) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      k.kitNo.toLowerCase().includes(q) ||
      (k.label ?? "").toLowerCase().includes(q)
    );
  });
  const satcom = filtered.filter((k) => k.source === "satcom");
  const starlink = filtered.filter((k) => k.source === "starlink");
  const leobridge = filtered.filter((k) => k.source === "leobridge");

  const toggle = (kit: string) => {
    const next = new Set(selected);
    if (next.has(kit)) next.delete(kit);
    else next.add(kit);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="KIT no veya gemi adı ara…"
          className="pl-9 h-8 text-xs"
        />
      </div>
      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          {selected.size} seçili / {assignable.length} toplam
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2"
            type="button"
            onClick={() => onChange(new Set(filtered.map((k) => k.kitNo)))}
          >
            Görüneni seç
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2"
            type="button"
            onClick={() => onChange(new Set())}
          >
            Tümünü temizle
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[260px] border border-border rounded-lg">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Yükleniyor…</div>
        ) : assignable.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Henüz hiç KIT verisi yok. Önce bir hesap senkronize edin.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {satcom.length > 0 && (
              <KitGroup
                title="Satcom"
                badgeClass="bg-[#fde0d0] text-[#a4400a] border-[#f4b896]"
                items={satcom}
                selected={selected}
                onToggle={toggle}
              />
            )}
            {starlink.length > 0 && (
              <KitGroup
                title="Tototheo"
                badgeClass="bg-[#dde9f7] text-[#2563a6] border-[#9fbbe0]"
                items={starlink}
                selected={selected}
                onToggle={toggle}
              />
            )}
            {leobridge.length > 0 && (
              <KitGroup
                title="Norway"
                badgeClass="bg-[#dde2f7] text-[#3a3aa6] border-[#a6a6dd]"
                items={leobridge}
                selected={selected}
                onToggle={toggle}
              />
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function KitGroup({
  title,
  badgeClass,
  items,
  selected,
  onToggle,
}: {
  title: string;
  badgeClass: string;
  items: Array<{ kitNo: string; label?: string | null; source: string }>;
  selected: Set<string>;
  onToggle: (kit: string) => void;
}) {
  return (
    <div>
      <div className="px-3 py-2 sticky top-0 bg-card border-b border-border flex items-center gap-2">
        <Badge className={`${badgeClass} uppercase tracking-widest text-[9px] font-semibold`}>
          {title}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {items.length} KIT
        </span>
      </div>
      {items.map((k) => (
        <label
          key={k.kitNo}
          className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/50 cursor-pointer"
        >
          <Checkbox
            checked={selected.has(k.kitNo)}
            onCheckedChange={() => onToggle(k.kitNo)}
          />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-mono text-[13px] truncate">{k.kitNo}</span>
            {k.label && (
              <span className="text-[11px] text-muted-foreground truncate">
                {k.label}
              </span>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
