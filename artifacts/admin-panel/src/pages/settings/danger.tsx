import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useWipeStationData } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

import SettingsLayout from "./layout";

export default function DangerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wipeMutation = useWipeStationData();

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
    <SettingsLayout>
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
    </SettingsLayout>
  );
}
