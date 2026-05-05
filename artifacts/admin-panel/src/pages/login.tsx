import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import brandLogo from "@assets/1_1778023047729.png";
import toovLogo from "@assets/TOOV_1778023131850.png";
import { useLogin } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email({ message: "Lütfen geçerli bir e-posta adresi girin." }),
  password: z.string().min(1, { message: "Şifre zorunludur." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          localStorage.setItem("auth_token", res.token);
          setLocation("/");
        },
        onError: (err: any) => {
          toast({
            title: "Erişim Reddedildi",
            description: err.message || "Geçersiz kimlik bilgileri.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[420px] bg-card border border-border shadow-none rounded-xl overflow-hidden">
        <div className="h-1 w-full bg-primary" />
        <CardHeader className="space-y-6 pt-10 pb-8 text-center px-10">
          <img
            src={brandLogo}
            alt="Lacivert Teknoloji"
            className="mx-auto max-h-24 w-auto object-contain"
          />
          <div className="space-y-1">
            <CardTitle className="text-2xl font-normal tracking-[-0.02em] text-foreground">Yönetici Girişi</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-10 pb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">E-posta</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin@stationsatcom.com" 
                          {...field} 
                          autoComplete="email"
                          className="bg-background border-border h-11 rounded-lg text-sm focus-visible:ring-primary shadow-none"
                        />
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
                      <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Şifre</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          {...field} 
                          autoComplete="current-password"
                          className="bg-background border-border h-11 rounded-lg text-sm font-mono tracking-widest focus-visible:ring-primary shadow-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 rounded-lg font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-none transition-colors" 
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Yükleniyor..." : "Oturumu Başlat"}
              </Button>
            </form>
          </Form>
          <div className="mt-8 pt-6 border-t border-border flex items-center justify-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Geliştirici
            </span>
            <img src={toovLogo} alt="TOOV" className="h-5 w-auto object-contain opacity-80" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
