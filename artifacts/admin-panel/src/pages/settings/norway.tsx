import React, { useState } from "react";
import { Globe, Plus } from "lucide-react";
import {
  useListLeobridgeAccounts,
  getListLeobridgeAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import SettingsLayout from "./layout";
import { LeobridgeAccountRow } from "./leobridge-account-row";
import { LeobridgeAccountFormDialog } from "./leobridge-account-form";
import type { LeobridgeAccount } from "./types";

export default function NorwayAccountsPage() {
  const { data: accounts, isLoading } = useListLeobridgeAccounts({
    query: { queryKey: getListLeobridgeAccountsQueryKey() },
  });
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<LeobridgeAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListLeobridgeAccountsQueryKey(),
    });

  return (
    <SettingsLayout>
      <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-secondary/50 border-b border-border pb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
                <div className="p-1.5 bg-background rounded border border-border">
                  <Globe className="w-4 h-4 text-foreground" />
                </div>
                Norway Hesapları
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-muted-foreground">
                Space Norway Leo Bridge portal hesapları. Aktif hesapların
                hepsi otomatik (her 30 dk) ve manuel sync turlarında sırayla
                taranır. Bir hesap düşerse diğerleri devam eder.
              </CardDescription>
            </div>
            <Button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none h-9 px-4"
            >
              <Plus className="w-4 h-4 mr-2" />
              Yeni Hesap
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Henüz Norway hesabı eklenmedi
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
                Senkronizasyon başlatabilmek için en az bir Leo Bridge portal
                hesabı tanımlamalısınız.
              </p>
              <Button
                onClick={() => setCreating(true)}
                className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-none"
              >
                <Plus className="w-4 h-4 mr-2" /> İlk Hesabı Ekle
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(accounts as LeobridgeAccount[]).map((a) => (
                <LeobridgeAccountRow
                  key={a.id}
                  account={a}
                  onEdit={() => setEditing(a)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <LeobridgeAccountFormDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        onSaved={refresh}
      />
      <LeobridgeAccountFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        account={editing}
        onSaved={refresh}
      />
    </SettingsLayout>
  );
}
