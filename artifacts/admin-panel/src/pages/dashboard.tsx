import React from "react";
import { Link } from "wouter";
import { 
  Database, 
  HardDrive, 
  DollarSign, 
  CalendarClock, 
  Activity, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  List,
  Settings
} from "lucide-react";
import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useSyncNow 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

export default function Dashboard() {
  const { data: summary, isLoading, isError, error } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const syncNowMutation = useSyncNow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSync = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({
          title: "Sync Started",
          description: res.message || "Manual synchronization has been triggered.",
        });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Sync Failed",
          description: err.message || "Failed to trigger synchronization.",
          variant: "destructive",
        });
      }
    });
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[50vh]">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">System Error</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">{error?.message || "Failed to load operations dashboard."}</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })} variant="outline" className="rounded-full">
          Retry Connection
        </Button>
      </div>
    );
  }

  const isSyncing = syncNowMutation.isPending || summary?.lastSyncStatus === 'running';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Welcome back, Admin</h1>
          <p className="text-muted-foreground text-sm font-medium">Here's the latest from your VSAT terminals.</p>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 transition-all duration-300"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? "Syncing Data..." : "Force Sync"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur hover:bg-card/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Terminals</CardTitle>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Database className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded" />
            ) : (
              <div className="text-4xl font-semibold tracking-tight text-foreground font-mono">
                {formatNumber(summary?.totalKits, 0)}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur hover:bg-card/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Network Volume</CardTitle>
            <div className="p-2 bg-primary/10 rounded-lg">
              <HardDrive className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-32 rounded" />
            ) : (
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-semibold tracking-tight text-foreground font-mono">
                  {formatNumber(summary?.totalGb, 2)}
                </div>
                <span className="text-sm font-medium text-muted-foreground">GB</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur hover:bg-card/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Invoiced</CardTitle>
            <div className="p-2 bg-green-500/10 rounded-lg">
              <DollarSign className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-36 rounded" />
            ) : (
              <div className="text-4xl font-semibold tracking-tight text-green-500 font-mono">
                {formatCurrency(summary?.totalUsd)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur hover:bg-card/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Period</CardTitle>
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <CalendarClock className="w-4 h-4 text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-10 w-28 rounded" />
            ) : (
              <div className="text-4xl font-semibold tracking-tight text-foreground font-mono">
                {summary?.activePeriod || "-"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Sync Status - Span 7 */}
        <Card className="border-border/50 shadow-sm md:col-span-7 flex flex-col">
          <CardHeader className="border-b border-border/30 bg-secondary/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  System Health
                </CardTitle>
                <CardDescription className="mt-1">Last portal synchronization status</CardDescription>
              </div>
              <Link href="/sync-logs">
                <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground hover:text-primary">
                  View Logs <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col justify-center">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full rounded-xl" />
                <div className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-background border border-border/50 shadow-sm">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                    summary?.lastSyncStatus === 'success' ? 'bg-green-500/10 text-green-500' :
                    summary?.lastSyncStatus === 'failed' ? 'bg-destructive/10 text-destructive' :
                    summary?.lastSyncStatus === 'running' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {summary?.lastSyncStatus === 'success' ? <CheckCircle2 className="w-6 h-6" /> :
                     summary?.lastSyncStatus === 'failed' ? <AlertCircle className="w-6 h-6" /> :
                     summary?.lastSyncStatus === 'running' ? <RefreshCw className="w-6 h-6 animate-spin" /> :
                     <Clock className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold capitalize flex items-center gap-2">
                      {summary?.lastSyncStatus || "Pending"}
                      {summary?.lastSyncStatus === 'running' && <span className="flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />}
                    </h3>
                    <p className="text-sm text-muted-foreground font-mono mt-1">
                      {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "Awaiting first sync"}
                    </p>
                  </div>
                </div>

                {summary?.lastSyncError && (
                  <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                    <p className="text-sm font-semibold text-destructive mb-1 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Error Details
                    </p>
                    <p className="text-xs font-mono text-destructive/80 leading-relaxed">{summary.lastSyncError}</p>
                  </div>
                )}

                {(summary?.lastSyncRecordsFound != null || summary?.lastSyncRecordsInserted != null) && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-border/50 bg-secondary/20 flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Parsed</span>
                      <span className="text-2xl font-semibold font-mono text-foreground">{formatNumber(summary?.lastSyncRecordsFound, 0)}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-medium text-green-500/70 uppercase tracking-wider mb-2">New</span>
                      <span className="text-2xl font-semibold font-mono text-green-500">{formatNumber(summary?.lastSyncRecordsInserted, 0)}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-medium text-primary/70 uppercase tracking-wider mb-2">Updated</span>
                      <span className="text-2xl font-semibold font-mono text-primary">{formatNumber(summary?.lastSyncRecordsUpdated, 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links - Span 5 */}
        <Card className="border-border/50 shadow-sm md:col-span-5">
          <CardHeader className="border-b border-border/30 bg-secondary/10 pb-4">
            <CardTitle className="text-lg font-semibold">Shortcuts</CardTitle>
            <CardDescription className="mt-1">Jump to frequent views</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              <Link href="/cdr-records">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background hover:bg-secondary/40 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">CDR Database</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Filter raw usage logs</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>
              
              <Link href="/kits">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background hover:bg-secondary/40 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <List className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Terminal Directory</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">View KIT aggregations</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>

              <Link href="/settings">
                <div className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background hover:bg-secondary/40 transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Portal Config</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage credentials</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
