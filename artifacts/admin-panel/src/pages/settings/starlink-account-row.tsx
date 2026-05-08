import React from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Pencil,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
} from "lucide-react";
import {
  useDeleteStarlinkAccount,
  useTestStarlinkAccountConnection,
  useSyncStarlinkAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import type { StarlinkAccount } from "./types";

export function StarlinkAccountRow({
  account,
  onEdit,
}: {
  account: StarlinkAccount;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const testMutation = useTestStarlinkAccountConnection();
  const deleteMutation = useDeleteStarlinkAccount();
  const syncMutation = useSyncStarlinkAccount();

  const displayName = account.label?.trim() || `Hesap #${account.id}`;

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
        onError: (err: unknown) => {
          toast({
            title: "Test Hatası",
            description:
              (err instanceof Error ? err.message : null) ||
              "Bağlantı testi başarısız.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSync = () => {
    syncMutation.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          toast({
            title: "Senkronizasyon Başlatıldı",
            description: `${displayName} için Tototheo senkronizasyonu başladı.`,
          });
          navigate("/sync-logs");
        },
        onError: (err: unknown) => {
          toast({
            title: "Senkronizasyon Başlatılamadı",
            description:
              (err instanceof Error ? err.message : null) ||
              "Bir senkronizasyon zaten çalışıyor olabilir.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          toast({
            title: "Hesap Silindi",
            description: `${displayName} ve tüm verisi temizlendi.`,
          });
          queryClient.invalidateQueries();
        },
        onError: (err: unknown) => {
          toast({
            title: "Silme Başarısız",
            description:
              (err instanceof Error ? err.message : null) || "Hesap silinemedi.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <li className="px-4 sm:px-6 lg:px-8 py-5 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-medium text-foreground truncate">
              {displayName}
            </span>
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
              {account.kitCount} Terminal
            </Badge>
            {!account.hasToken && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-[#dfa88f]/60 bg-[#dfa88f]/10 text-[#cf2d56] gap-1"
              >
                <AlertTriangle className="w-2.5 h-2.5" /> Token yok
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
            <span className="truncate">{account.apiBaseUrl}</span>
            <span>·</span>
            <span>her {account.syncIntervalMinutes} dk</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${
                account.lastSuccessSyncAt
                  ? "bg-[#1f8a65]"
                  : "bg-muted-foreground"
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
            onClick={handleSync}
            disabled={syncMutation.isPending || !account.isActive}
            title={
              !account.isActive ? "Pasif hesap senkronize edilemez" : undefined
            }
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Sync
          </Button>
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
                className="rounded-lg shadow-none h-8 px-3 text-[12px] border-[#cf2d56]/40 text-[#cf2d56] hover:bg-[#cf2d56]/10 hover:text-[#cf2d56]"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>"{displayName}" hesabını sil?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hesap ve TÜM verisi (terminaller, günlük/aylık kullanım
                  geçmişi) kalıcı olarak silinecek. Bu işlem{" "}
                  <strong>geri alınamaz</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">
                  Vazgeç
                </AlertDialogCancel>
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
