import React, { useState } from "react";
import { Server, Plus } from "lucide-react";
import {
  useListStationAccounts,
  getListStationAccountsQueryKey,
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
import { AccountRow } from "./account-row";
import { AccountFormDialog } from "./account-form";
import type { StationAccount } from "./types";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useListStationAccounts({
    query: { queryKey: getListStationAccountsQueryKey() },
  });
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<StationAccount | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListStationAccountsQueryKey() });

  return (
    <SettingsLayout>
      <Card className="border border-border shadow-none bg-card rounded-xl overflow-hidden">
        <CardHeader className="bg-secondary/50 border-b border-border pb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-lg font-normal tracking-tight flex items-center gap-2.5">
                <div className="p-1.5 bg-background rounded border border-border">
                  <Server className="w-4 h-4 text-foreground" />
                </div>
                Portal Hesapları
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-muted-foreground">
                Aktif hesapların hepsi otomatik ve manuel sync turlarında sırayla taranır.
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
                <Server className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Henüz portal hesabı eklenmedi
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
                Senkronizasyon başlatabilmek için en az bir Station Satcom portal hesabı eklemelisiniz.
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

      <AccountFormDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        onSaved={refresh}
      />
      <AccountFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        account={editing}
        onSaved={refresh}
      />
    </SettingsLayout>
  );
}
