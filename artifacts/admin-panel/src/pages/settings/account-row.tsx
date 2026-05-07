import React from "react";
import {
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Pencil,
  XCircle,
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";
import {
  useDeleteStationAccount,
  useTestStationAccountConnection,
  useWipeStationData,
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
import type { StationAccount } from "./types";

export function AccountRow({
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
        onError: (err: unknown) => {
          toast({
            title: "Test Hatası",
            description: (err instanceof Error ? err.message : null) || "Bağlantı testi başarısız.",
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
        onError: (err: unknown) => {
          toast({
            title: "Silme Başarısız",
            description: (err instanceof Error ? err.message : null) || "Hesap silinemedi.",
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
        onError: (err: unknown) => {
          toast({
            title: "Temizlik Başarısız",
            description: (err instanceof Error ? err.message : null) || "Veriler silinemedi.",
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
