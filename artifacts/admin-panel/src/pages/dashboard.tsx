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
  Clock
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
  const { data: summary, isLoading, isError, error } = useGetDashboardSummary();
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
      <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Dashboard</h2>
        <p className="text-muted-foreground mb-4">{error?.message || "Failed to load dashboard data"}</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Operations Dashboard</h1>
          <p className="text-muted-foreground">Overview of satellite communication billing data.</p>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={syncNowMutation.isPending || summary?.lastSyncStatus === 'running'}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${(syncNowMutation.isPending || summary?.lastSyncStatus === 'running') ? 'animate-spin' : ''}`} />
          {syncNowMutation.isPending || summary?.lastSyncStatus === 'running' ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card hover:bg-card/80 transition-colors border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Active KITs</CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-foreground font-mono">
                {formatNumber(summary?.totalKits, 0)}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card hover:bg-card/80 transition-colors border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Volume (GB)</CardTitle>
            <HardDrive className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold text-foreground font-mono">
                {formatNumber(summary?.totalGb, 2)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card hover:bg-card/80 transition-colors border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Billing (USD)</CardTitle>
            <DollarSign className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-3xl font-bold text-foreground font-mono text-primary">
                {formatCurrency(summary?.totalUsd)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card hover:bg-card/80 transition-colors border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Period</CardTitle>
            <CalendarClock className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold text-foreground font-mono">
                {summary?.activePeriod || "-"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Latest Synchronization
            </CardTitle>
            <CardDescription>Status of the most recent portal scraper run</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border">
                  <div className="flex items-center gap-3">
                    {summary?.lastSyncStatus === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : summary?.lastSyncStatus === 'failed' ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : summary?.lastSyncStatus === 'running' ? (
                      <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />
                    ) : (
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium capitalize">{summary?.lastSyncStatus || "Never run"}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary?.lastSuccessSyncAt ? formatDate(summary.lastSuccessSyncAt) : "No timestamp"}
                      </p>
                    </div>
                  </div>
                  <Link href="/sync-logs" className="text-xs text-primary hover:underline font-medium">
                    View Logs
                  </Link>
                </div>

                {summary?.lastSyncError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="font-semibold mb-1">Error details:</p>
                    <p className="font-mono text-xs">{summary.lastSyncError}</p>
                  </div>
                )}

                {(summary?.lastSyncRecordsFound != null || summary?.lastSyncRecordsInserted != null) && (
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="p-3 bg-card border border-border rounded-md text-center">
                      <p className="text-xs text-muted-foreground mb-1">Found</p>
                      <p className="text-xl font-bold font-mono">{formatNumber(summary?.lastSyncRecordsFound, 0)}</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-md text-center">
                      <p className="text-xs text-muted-foreground mb-1">Inserted</p>
                      <p className="text-xl font-bold font-mono text-green-500">{formatNumber(summary?.lastSyncRecordsInserted, 0)}</p>
                    </div>
                    <div className="p-3 bg-card border border-border rounded-md text-center">
                      <p className="text-xs text-muted-foreground mb-1">Updated</p>
                      <p className="text-xl font-bold font-mono text-primary">{formatNumber(summary?.lastSyncRecordsUpdated, 0)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links / Actions */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Navigate to frequent tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link href="/cdr-records">
              <Button variant="outline" className="w-full justify-start h-12 text-left font-normal bg-secondary/30 hover:bg-secondary border-border">
                <Database className="w-4 h-4 mr-3 text-primary" />
                <div>
                  <div className="font-medium text-foreground">View All CDR Records</div>
                  <div className="text-xs text-muted-foreground font-sans">Search and filter raw billing data</div>
                </div>
              </Button>
            </Link>
            <Link href="/kits">
              <Button variant="outline" className="w-full justify-start h-12 text-left font-normal bg-secondary/30 hover:bg-secondary border-border">
                <List className="w-4 h-4 mr-3 text-primary" />
                <div>
                  <div className="font-medium text-foreground">KIT Summary</div>
                  <div className="text-xs text-muted-foreground font-sans">Aggregated data per terminal</div>
                </div>
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" className="w-full justify-start h-12 text-left font-normal bg-secondary/30 hover:bg-secondary border-border">
                <Settings className="w-4 h-4 mr-3 text-primary" />
                <div>
                  <div className="font-medium text-foreground">Portal Settings</div>
                  <div className="text-xs text-muted-foreground font-sans">Configure scraper credentials</div>
                </div>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
