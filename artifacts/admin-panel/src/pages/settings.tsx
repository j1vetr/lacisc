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
  const { data: settings, isLoading } = useGetStationSettings();
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
    // Only send password if it was changed
    const payload = {
      ...data,
      password: data.password ? data.password : null,
      defaultBillingPeriod: data.defaultBillingPeriod || null,
    };

    saveMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Settings Saved", description: "Station Satcom configuration updated." });
          form.setValue("password", ""); // Reset password field
          queryClient.invalidateQueries({ queryKey: getGetStationSettingsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to save settings.", variant: "destructive" });
        },
      }
    );
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.success) {
          toast({ title: "Connection Successful", description: res.message || "Successfully connected to the portal." });
        } else {
          toast({ title: "Connection Failed", description: res.message || "Failed to connect to the portal.", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "An error occurred during test.", variant: "destructive" });
      },
    });
  };

  const handleSyncNow = () => {
    syncNowMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Sync Started", description: res.message || "Manual synchronization triggered." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to trigger sync.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Card>
          <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portal Configuration</h1>
        <p className="text-muted-foreground">Manage Station Satcom scraper credentials and behavior.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Connection Details
              </CardTitle>
              <CardDescription>
                Credentials used by the backend headless browser to scrape CDR data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="portalUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portal Login URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://portal.stationsatcom.com/login" {...field} className="font-mono text-sm bg-secondary/30" />
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
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} className="bg-secondary/30" />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="•••••••• (leave blank to keep current)" {...field} className="bg-secondary/30" />
                      </FormControl>
                      <FormDescription>Only enter to update the saved password.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-primary" />
                Scraper Behavior
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="syncIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Auto-Sync Interval (minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="font-mono bg-secondary/30" />
                      </FormControl>
                      <FormDescription>How often the background job runs.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultBillingPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Billing Period</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 01/2024" {...field} className="font-mono bg-secondary/30" />
                      </FormControl>
                      <FormDescription>Overrides auto-detect if specified.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-secondary/10">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Automatic Sync</FormLabel>
                      <FormDescription>
                        Toggle the background scraper job on or off.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            
            {settings?.lastErrorMessage && (
              <div className="mx-6 mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Last Sync Error</p>
                  <p className="text-xs font-mono mt-1 text-destructive/80 break-all">{settings.lastErrorMessage}</p>
                </div>
              </div>
            )}
            
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center bg-secondary/10 border-t border-border gap-4 py-4">
              <div className="text-sm text-muted-foreground">
                Last successful sync: <span className="font-mono text-foreground">{formatDate(settings?.lastSuccessSyncAt)}</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1 sm:flex-none border-border"
                  onClick={handleTestConnection}
                  disabled={testConnectionMutation.isPending}
                >
                  <ShieldCheck className={`w-4 h-4 mr-2 ${testConnectionMutation.isPending ? 'animate-pulse' : ''}`} />
                  Test Auth
                </Button>
                <Button 
                  type="button" 
                  variant="secondary"
                  className="flex-1 sm:flex-none"
                  onClick={handleSyncNow}
                  disabled={syncNowMutation.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
                  Run Now
                </Button>
                <Button 
                  type="submit"
                  className="flex-1 sm:flex-none font-semibold"
                  disabled={saveMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Config
                </Button>
              </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
