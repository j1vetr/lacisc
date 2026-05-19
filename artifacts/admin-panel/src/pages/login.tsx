import { useLocation } from "wouter";
import { useState } from "react";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import brandLogo from "@assets/1_1778023047729.png";
import brandLogoWhite from "@assets/2_1778184166378.png";
import toovLogo from "@assets/TOOV_1778023131850.png";
import toovLogoWhite from "@assets/TOOV_(1)_1778184135138.png";
import { useThemedAsset } from "@/hooks/use-themed-asset";
import { useLogin } from "@workspace/api-client-react";
import {
  Globe2,
  Activity,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Headphones,
} from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";

const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, { message: "KULLANICI ADI VEYA E-POSTA ZORUNLUDUR." }),
  password: z.string().min(1, { message: "ŞİFRE ZORUNLUDUR." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  useDocumentTitle("GİRİŞ");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const toovSrc = useThemedAsset(toovLogo, toovLogoWhite);
  const brandSrc = useThemedAsset(brandLogo, brandLogoWhite);

  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data: { usernameOrEmail: data.identifier, password: data.password } },
      {
        onSuccess: () => {
          setLocation("/");
        },
        onError: (err: Error) => {
          toast({
            title: "ERİŞİM REDDEDİLDİ",
            description: err.message || "GEÇERSİZ KİMLİK BİLGİLERİ.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#eef2f7] dark:bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[1080px] bg-white dark:bg-card rounded-3xl border border-[#e6e9ef] dark:border-border overflow-hidden shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] grid lg:grid-cols-[1.05fr_1fr]">
        {/* SOL PANEL — uydu + dünya görseli, logo, özellikler */}
        <aside className="hidden lg:flex relative flex-col p-10 xl:p-12 overflow-hidden bg-white dark:bg-card/50 min-h-[680px]">
          {/* Yumuşak arka plan vurgusu */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 100% 60% at 50% 35%, rgba(180,200,225,0.22) 0%, transparent 65%)",
            }}
          />
          {/* Yörünge halkaları */}
          <svg
            aria-hidden
            className="absolute inset-x-0 top-[8%] w-full h-[55%] pointer-events-none opacity-70"
            viewBox="0 0 600 500"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
          >
            <ellipse
              cx="300"
              cy="260"
              rx="290"
              ry="110"
              stroke="#cdd6e2"
              strokeWidth="1"
              strokeDasharray="2 6"
            />
            <ellipse
              cx="300"
              cy="260"
              rx="360"
              ry="145"
              stroke="#dfe5ee"
              strokeWidth="1"
              strokeDasharray="2 6"
            />
            <circle cx="90" cy="170" r="2" fill="#94a3b8" />
            <circle cx="520" cy="200" r="1.5" fill="#94a3b8" />
            <circle cx="200" cy="80" r="1.5" fill="#cbd5e1" />
            <circle cx="470" cy="50" r="2" fill="#cbd5e1" />
          </svg>

          {/* Logo — üstte */}
          <div className="relative z-10">
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* Özellikler — dikey ortalı */}
          <div className="relative z-10 flex-1 flex flex-col justify-center space-y-4">
            <FeatureRow
              icon={<Globe2 className="w-4 h-4" />}
              label="TÜM HATLAR TEK GÖRÜNÜMDE"
            />
            <FeatureRow
              icon={<Activity className="w-4 h-4" />}
              label="GERÇEK ZAMANLI KOTA TAKİBİ"
            />
          </div>

          {/* Geliştirici — altta */}
          <div className="relative z-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="font-semibold">GELİŞTİRİCİ</span>
            <img
              src={toovSrc}
              alt="TOOV"
              className="h-5 w-auto object-contain opacity-90"
            />
          </div>
        </aside>

        {/* SAĞ PANEL — form */}
        <main className="flex flex-col p-8 sm:p-10 lg:p-12 xl:px-14 justify-center bg-white dark:bg-card">
          {/* Mobilde marka */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="h-12 w-auto object-contain"
            />
          </div>

          <div className="space-y-2 mb-8">
            <div className="text-[12px] uppercase tracking-[0.22em] text-primary font-semibold">
              HOŞ GELDİNİZ
            </div>
            <h2 className="text-[32px] sm:text-[34px] leading-[1.1] font-semibold tracking-tight text-foreground uppercase">
              HESABINIZA
              <br />
              GİRİŞ YAPIN
            </h2>
            <p className="text-sm text-muted-foreground pt-1">
              Operasyon panelinize erişmek için kimlik bilgilerinizi girin.
            </p>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                      KULLANICI ADI VEYA E-POSTA
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <Input
                          placeholder="Kullanıcı adınız"
                          {...field}
                          autoComplete="username"
                          className="bg-[#f6f8fb] dark:bg-background border-[#e6e9ef] dark:border-border h-12 rounded-xl pl-10 text-sm focus-visible:ring-primary focus-visible:bg-white shadow-none"
                        />
                      </div>
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
                    <FormLabel className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                      ŞİFRE
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...field}
                          autoComplete="current-password"
                          className="bg-[#f6f8fb] dark:bg-background border-[#e6e9ef] dark:border-border h-12 rounded-xl pl-10 pr-11 text-sm font-mono tracking-widest focus-visible:ring-primary focus-visible:bg-white shadow-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/70 hover:text-foreground transition-colors"
                          aria-label={
                            showPassword ? "Şifreyi gizle" : "Şifreyi göster"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="group w-full h-12 rounded-xl font-semibold text-[15px] bg-primary text-primary-foreground hover:bg-primary/90 transition-all mt-2 shadow-[0_10px_28px_-8px_rgba(245,78,0,0.55)] hover:shadow-[0_14px_34px_-8px_rgba(245,78,0,0.7)] hover:-translate-y-[1px] active:translate-y-0 tracking-wide"
                disabled={loginMutation.isPending}
              >
                <span className="inline-flex items-center gap-2">
                  {loginMutation.isPending ? "GİRİŞ YAPILIYOR…" : "GİRİŞ YAP"}
                  {!loginMutation.isPending && (
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  )}
                </span>
              </Button>
            </form>
          </Form>

          <div className="mt-8 flex items-start gap-2.5 text-xs text-muted-foreground justify-center text-center">
            <Headphones className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Erişim sorunları için lütfen yöneticinizle iletişime geçin.
            </span>
          </div>

          {/* Mobilde alt: TOOV */}
          <div className="lg:hidden mt-8 pt-6 border-t border-border flex items-center justify-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              GELİŞTİRİCİ
            </span>
            <img
              src={toovSrc}
              alt="TOOV"
              className="h-5 w-auto object-contain opacity-90"
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white border border-[#e6e9ef] dark:bg-white/5 dark:border-border flex items-center justify-center text-foreground/70 shadow-[0_2px_6px_-2px_rgba(15,23,42,0.06)]">
        {icon}
      </div>
      <div className="text-[12px] font-semibold tracking-[0.08em] text-foreground">
        {label}
      </div>
    </div>
  );
}
