import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetSyncProgress,
  getGetSyncProgressQueryKey,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Globally-mounted observer that watches the sync-progress endpoint and fires
 * a toast on every running→idle transition, so operators see the result even
 * when they navigate away from the page that triggered the sync.
 *
 * Polls only while authenticated (no /me result → render nothing).
 */
export function SyncCompletionToast() {
  const { t } = useTranslation();
  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000, retry: false },
  });
  const authenticated = !!me;

  const { data: progress } = useGetSyncProgress({
    query: {
      queryKey: getGetSyncProgressQueryKey(),
      enabled: authenticated,
      refetchInterval: 3_000,
      refetchIntervalInBackground: true,
    },
  });

  const { toast } = useToast();
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!progress) return;
    if (wasRunning.current && !progress.running) {
      const failed = progress.failures > 0;
      toast({
        title: failed
          ? t("Senkronizasyon Tamamlandı (Hatalı)")
          : t("Senkronizasyon Tamamlandı"),
        description:
          progress.lastMessage ||
          t("{{found}} satır · +{{inserted}} eklendi · ~{{updated}} güncellendi", {
            found: progress.rowsFound,
            inserted: progress.rowsInserted,
            updated: progress.rowsUpdated,
          }),
        variant: failed ? "destructive" : "default",
      });
    }
    wasRunning.current = progress.running;
  }, [
    progress?.running,
    progress?.failures,
    progress?.lastMessage,
    progress?.rowsFound,
    progress?.rowsInserted,
    progress?.rowsUpdated,
    toast,
    t,
  ]);

  return null;
}
