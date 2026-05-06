import React, { useEffect, useRef } from "react";
import { useGetSyncProgress, getGetSyncProgressQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

function levelStyle(level: string): { dot: string; text: string } {
  switch (level) {
    case "success":
      return { dot: "bg-[#1f8a65]", text: "text-foreground" };
    case "warn":
      return { dot: "bg-[#dfa88f]", text: "text-foreground" };
    case "error":
      return { dot: "bg-[#cf2d56]", text: "text-[#cf2d56]" };
    default:
      return { dot: "bg-muted-foreground", text: "text-muted-foreground" };
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface SyncProgressPanelProps {
  /** When false, the panel renders nothing. Caller decides visibility. */
  active?: boolean;
}

export function SyncProgressPanel({ active = true }: SyncProgressPanelProps) {
  const { data: progress } = useGetSyncProgress({
    query: {
      queryKey: getGetSyncProgressQueryKey(),
      // Poll fast while running, slow otherwise so we still pick up the
      // transition to "completed" state without spamming the network.
      refetchInterval: (query) => {
        const d = query.state.data as { running?: boolean } | undefined;
        return d?.running ? 1500 : 5000;
      },
      refetchIntervalInBackground: true,
    },
  });

  const feedRef = useRef<HTMLDivElement>(null);
  // Auto-scroll the activity feed to the bottom when new events arrive.
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress?.events.length]);

  if (!active || !progress) return null;
  // Hide entirely if nothing has ever run.
  if (!progress.running && !progress.lastMessage && progress.events.length === 0) {
    return null;
  }

  const acctTotal = progress.totalAccounts || 1;
  const acctIdx = progress.currentAccountIndex || 0;
  const periodTotal = progress.totalPeriods || 1;
  const periodIdx = progress.currentPeriodIndex || 0;
  const kitTotal = progress.totalKits || 1;
  const kitIdx = progress.currentKitIndex || 0;

  // Composite percentage: each account contributes (1/totalAccounts) of the
  // bar; within an account, periods × kits gives a fine-grained sub-percent.
  const perAccount = 100 / acctTotal;
  const subPct =
    progress.currentAccountIndex > 0
      ? ((periodIdx - 1) / periodTotal + kitIdx / (kitTotal * periodTotal)) * 100
      : 0;
  const completedAccountsPct = (acctIdx > 0 ? acctIdx - 1 : 0) * perAccount;
  const overall = progress.running
    ? Math.min(100, completedAccountsPct + (subPct / 100) * perAccount)
    : 100;

  return (
    <Card className="border border-border bg-card shadow-none rounded-xl overflow-hidden">
      <CardHeader className="pb-4 bg-secondary/40 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-background border border-border">
              {progress.running ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : progress.failures > 0 ? (
                <AlertCircle className="w-4 h-4 text-[#cf2d56]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#1f8a65]" />
              )}
            </div>
            <div>
              <CardTitle className="text-base font-normal tracking-tight">
                Senkronizasyon Akışı
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                {progress.running
                  ? "Çalışıyor — her hesap sırayla işleniyor"
                  : progress.lastMessage || "Beklemede"}
              </CardDescription>
            </div>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground tabular-nums whitespace-nowrap">
            {progress.running ? `${overall.toFixed(0)}%` : ""}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Progress bar + live coordinates */}
        <div className="space-y-3">
          <Progress value={overall} className="h-1.5 bg-border" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border p-2">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Hesap
              </div>
              <div className="font-mono text-[13px] text-foreground tabular-nums mt-0.5">
                {acctIdx} / {progress.totalAccounts}
              </div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                Dönem
              </div>
              <div className="font-mono text-[13px] text-foreground tabular-nums mt-0.5">
                {periodIdx} / {progress.totalPeriods}
              </div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                KIT
              </div>
              <div className="font-mono text-[13px] text-foreground tabular-nums mt-0.5">
                {kitIdx} / {progress.totalKits}
              </div>
            </div>
          </div>
          {progress.running && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60 border border-border text-[12px] flex-wrap">
              <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">Şu an:</span>
              <span className="font-medium text-foreground truncate">
                {progress.currentAccountLabel || "—"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-foreground">
                {progress.currentPeriod || "—"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-foreground truncate">
                {progress.currentKit || "—"}
              </span>
            </div>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-md border border-border p-2 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Bulunan
            </div>
            <div className="font-mono text-sm text-foreground tabular-nums mt-0.5">
              {progress.rowsFound}
            </div>
          </div>
          <div className="rounded-md border border-[#9fc9a2]/60 bg-[#9fc9a2]/10 p-2 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-foreground">
              Eklenen
            </div>
            <div className="font-mono text-sm text-foreground tabular-nums mt-0.5">
              {progress.rowsInserted}
            </div>
          </div>
          <div className="rounded-md border border-[#c0a8dd]/60 bg-[#c0a8dd]/10 p-2 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-foreground">
              Güncel.
            </div>
            <div className="font-mono text-sm text-foreground tabular-nums mt-0.5">
              {progress.rowsUpdated}
            </div>
          </div>
          <div
            className={`rounded-md border p-2 text-center ${
              progress.failures > 0
                ? "border-[#cf2d56]/40 bg-[#cf2d56]/10"
                : "border-border"
            }`}
          >
            <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              Atlanan
            </div>
            <div className="font-mono text-sm text-foreground tabular-nums mt-0.5">
              {progress.failures}
            </div>
          </div>
        </div>

        {/* Live event feed */}
        {progress.events.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              Canlı Akış
            </div>
            <div
              ref={feedRef}
              className="rounded-md border border-border bg-secondary/30 max-h-48 overflow-y-auto divide-y divide-border/60"
            >
              {progress.events.slice(-30).map((ev, idx) => {
                const s = levelStyle(ev.level);
                return (
                  <div
                    key={`${ev.ts}-${idx}`}
                    className="flex items-start gap-2 px-3 py-1.5 text-[11px] font-mono leading-snug"
                  >
                    <span className="text-muted-foreground tabular-nums shrink-0 mt-px">
                      {formatTime(ev.ts)}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${s.dot}`} />
                    <span className={`break-words ${s.text}`}>{ev.message}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-account final results (after completion) */}
        {!progress.running && progress.accountResults.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Hesap Sonuçları
            </div>
            <div className="space-y-1.5">
              {progress.accountResults.map((r) => (
                <div
                  key={r.credentialId}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[12px] ${
                    r.success
                      ? "border-[#9fc9a2]/40 bg-[#9fc9a2]/5"
                      : "border-[#cf2d56]/30 bg-[#cf2d56]/5"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#1f8a65] shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-[#cf2d56] shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">{r.label}</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {r.recordsFound} satır · +{r.recordsInserted} / ~{r.recordsUpdated}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
