import React, { useEffect, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Server, Settings as SettingsIcon, AlertTriangle, ShieldCheck, RefreshCw, Save } from "lucide-react";
import { 
  useGetStationSettings, 
  getGetStationSettingsQueryKey,
  useSaveStationSettings,
  useTestConnection,
  useSyncNow
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

const settingsSchema = z.object({
  portalUrl: z.string().url({ message: "Must be a valid URL." }),
  username: z.string().min(1, { message: "Username is required." }),
  password: z.string().optional(),
  isActive: z.boolean().default(true),
  defaultBillingPeriod: z.string().optional().nullable(),
  syncIntervalMinutes: z.coerce.number().min(5).max(1440),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { data: settings, isLoading } = useGetStationSettings({ query: { queryKey: getGetStationSettingsQueryKey() } });
  const saveMutation = useSaveStationSettings();
  const testConnectionMutation = useTestConnection();
  const syncNowMutation = useSyncNow();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const initialized = useRef(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      portalUrl: "",
      username: "",
      password: "",
      isActive: true,
      defaultBillingPeriod: "",
      syncIntervalMinutes: 60,
    },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        portalUrl: settings.portalUrl,
        username: settings.username,
        password: "", // Never display password
        isActive: settings.isActive,
        defaultBillingPeriod: settings.defaultBillingPeriod || "",
        syncIntervalMinutes: settings.syncIntervalMinutes,
      });
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    const payload = {
      ...data,
      password: data.password ? data.password : null,
      defaultBillingPeriod: data.defaultBillingPeriod || null,
    };

    saveMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Settings Saved", description: "Station Satcom configuration updated successfully." });
          form.setValue("password", ""); 
          queryClient.invalidateQueries({ queryKey: getGetStationSettingsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Save Failed", description: err.message || "Failed to update configuration.", variant: "destructive" });
        },
      }
    );
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast({ title: "Connection Verified", description: res.message || "Successfully authenticated with the portal." });
        } else {
          toast({ title: "Authentication Failed", description: res.message || "Invalid credentials or portal down.", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "System Error", description: err.message || "Network error during test.", variant: "destructive" });
      },
    });
  };

  const handleSyncNow = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Sync Initiated", description: res.message || "Manual scraping job queued." });
      },
      onError: (err: any) => {
        toast({ title: "Operation Failed", description: err.message || "Could not queue sync job.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-4xl animate-in fade-in duration-500">
        <div>
          <Skeleton className="h-10 w-64 mb-2 rounded-lg" />
          <Skeleton className="h-5 w-96 rounded" />
        </div>
        <Card className="border-border/50 bg-card/40 backdrop-blur rounded-2xl">
          <CardHeader><Skeleton className="h-8 w-48 rounded" /></CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-14 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-6">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">System Configuration</h1>
        <p className="text-sm font-medium text-muted-foreground">Manage headless scraper credentials and operational cadence.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur rounded-2xl overflow-hidden">
            <CardHeader className="bg-secondary/10 border-b border-border/30 pb-5">
              <CardTitle className="text-lg font-semibold flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-md text-primary">
                  <Server className="w-4 h-4" />
                </div>
                Target Portal Credentials
              </CardTitle>
              <CardDescription className="mt-1">
                Authentication details for the third-party billing portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <FormField
                control={form.control}
                name="portalUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Login URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://portal.stationsatcom.com/login" {...field} className="font-mono text-sm bg-background border-border/60 h-11 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Admin Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} className="bg-background border-border/60 h-11 rounded-xl font-medium" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Password Override</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="•••••••• (Hidden for security)" {...field} className="bg-background border-border/60 h-11 rounded-xl font-mono" />
                      </FormControl>
                      <FormDescription className="text-[11px]">Leave blank to retain current key.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur rounded-2xl overflow-hidden">
            <CardHeader className="bg-secondary/10 border-b border-border/30 pb-5">
              <CardTitle className="text-lg font-semibold flex items-center gap-2.5">
                <div className="p-1.5 bg-purple-500/10 rounded-md text-purple-400">
                  <SettingsIcon className="w-4 h-4" />
                </div>
                Scraper Cadence
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="syncIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Interval (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="font-mono bg-background border-border/60 h-11 rounded-xl" />
                      </FormControl>
                      <FormDescription className="text-[11px]">Frequency of automated job execution.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultBillingPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Forced Period (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="MM/YYYY" {...field} value={field.value ?? ""} className="font-mono bg-background border-border/60 h-11 rounded-xl" />
                      </FormControl>
                      <FormDescription className="text-[11px]">Bypasses dynamic detection if set.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/60 p-5 bg-background shadow-sm">
                    <div className="space-y-1 pr-4">
                      <FormLabel className="text-base font-semibold">Automated Sync Engine</FormLabel>
                      <FormDescription className="text-xs">
                        When disabled, no background fetching will occur.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-primary"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            
            {settings?.lastErrorMessage && (
              <div className="mx-6 mb-6 p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex items-start gap-3">
                <div className="p-1.5 bg-destructive/10 rounded-md shrink-0">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-destructive">Recent Execution Failure</p>
                  <p className="text-xs font-mono mt-1.5 text-destructive/80 leading-relaxed max-h-24 overflow-y-auto">{settings.lastErrorMessage}</p>
                </div>
              </div>
            )}
            
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center bg-secondary/10 border-t border-border/30 gap-4 py-5 px-6">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${settings?.lastSuccessSyncAt ? 'bg-green-500' : 'bg-muted'}`} />
                Last success: <span className="font-mono text-foreground/80">{formatDate(settings?.lastSuccessSyncAt)}</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 sm:flex-none rounded-full border-border/60 hover:bg-secondary font-medium text-sm h-10 px-5"
                  onClick={handleTestConnection}
                  disabled={testConnectionMutation.isPending}
                >
                  <ShieldCheck className={`w-4 h-4 mr-2 ${testConnectionMutation.isPending ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
                  Test Auth
                </Button>
                <Button 
                  type="button" 
                  variant="secondary"
                  className="flex-1 sm:flex-none rounded-full font-medium text-sm h-10 px-5"
                  onClick={handleSyncNow}
                  disabled={syncNowMutation.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
                  Run Now
                </Button>
                <Button 
                  type="submit"
                  className="flex-1 sm:flex-none rounded-full font-semibold text-sm h-10 px-6 shadow-md shadow-primary/20"
                  disabled={saveMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Commit Changes
                </Button>
              </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
