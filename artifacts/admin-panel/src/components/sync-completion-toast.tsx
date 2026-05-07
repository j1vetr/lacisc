import { useEffect, useRef } from "react";
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
        title: failed ? "Senkronizasyon Tamamlandı (Hatalı)" : "Senkronizasyon Tamamlandı",
        description:
          progress.lastMessage ||
          `${progress.rowsFound} satır · +${progress.rowsInserted} eklendi · ~${progress.rowsUpdated} güncellendi`,
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
  ]);

  return null;
}
