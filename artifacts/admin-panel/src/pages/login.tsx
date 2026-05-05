import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Satellite, Command } from "lucide-react";
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
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
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
            title: "Access Denied",
            description: err.message || "Invalid secure credentials.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background bg-[url('/noise.png')] bg-repeat p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-background to-background pointer-events-none opacity-50" />
      
      <Card className="w-full max-w-[420px] relative z-10 border-border/40 shadow-2xl bg-card/60 backdrop-blur-2xl rounded-3xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/50 to-transparent" />
        <CardHeader className="space-y-4 pt-10 pb-8 text-center px-10">
          <div className="mx-auto bg-background/50 p-4 rounded-2xl w-16 h-16 flex items-center justify-center border border-border/50 shadow-inner mb-2">
            <Command className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">System Auth</CardTitle>
            <CardDescription className="text-sm font-medium">
              Station Satcom Operations Center
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-10 pb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Clearance Email</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="admin@stationsatcom.com" 
                          {...field} 
                          autoComplete="email"
                          className="bg-background/80 border-border/50 h-12 rounded-xl text-sm"
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
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Passkey</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          {...field} 
                          autoComplete="current-password"
                          className="bg-background/80 border-border/50 h-12 rounded-xl text-sm font-mono tracking-widest"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl font-semibold text-[15px] shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" 
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Verifying..." : "Initialize Session"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
