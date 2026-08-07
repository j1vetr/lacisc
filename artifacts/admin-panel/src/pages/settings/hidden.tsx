import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHiddenTerminals,
  getListHiddenTerminalsQueryKey,
  useUpdateStationKitHidden,
  useUpdateStarlinkTerminalHidden,
  useUpdateLeobridgeTerminalHidden,
} from "@workspace/api-client-react";
import { Eye, EyeOff } from "lucide-react";

import SettingsLayout from "./layout";
import { Skeleton } from "@/components/ui/skeleton";

const SOURCE_LABEL: Record<string, string> = {
  satcom: "SATCOM",
  starlink: "TOTOTHEO",
  leobridge: "NORWAY",
};

export default function SettingsHidden() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListHiddenTerminals({
    query: { queryKey: getListHiddenTerminalsQueryKey() },
  });
  const satcomMutation = useUpdateStationKitHidden();
  const starlinkMutation = useUpdateStarlinkTerminalHidden();
  const leobridgeMutation = useUpdateLeobridgeTerminalHidden();
  const pending =
    satcomMutation.isPending || starlinkMutation.isPending || leobridgeMutation.isPending;

  const terminals = data?.terminals ?? [];

  const unhide = (kitNo: string, source: string) => {
    const onSuccess = () => {
      // Tüm listeler/harita/toplamlar etkilenir — geniş invalidation kasıtlı.
      queryClient.invalidateQueries();
    };
    if (source === "satcom") {
      satcomMutation.mutate({ kitNo, data: { hidden: false } }, { onSuccess });
    } else if (source === "starlink") {
      starlinkMutation.mutate({ kit: kitNo, data: { hidden: false } }, { onSuccess });
    } else {
      leobridgeMutation.mutate({ kit: kitNo, data: { hidden: false } }, { onSuccess });
    }
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
            {t("Görünmez Terminaller")}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {t(
              "Buradaki terminaller hiçbir listede, haritada, toplamda veya uyarıda gösterilmez. Geri göster ile tekrar görünür yapabilirsiniz.",
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : terminals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("Görünmez yapılmış terminal yok.")}
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {terminals.map((term) => (
              <div
                key={`${term.source}-${term.kitNo}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider bg-secondary text-muted-foreground shrink-0">
                    {SOURCE_LABEL[term.source] ?? term.source}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {term.name ?? "—"}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {term.kitNo}
                    </div>
                  </div>
                </div>
                <button
                  disabled={pending}
                  onClick={() => unhide(term.kitNo, term.source)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {t("Geri göster")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
