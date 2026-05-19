import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import brandLogo from "@assets/1_1778023047729.png";
import brandLogoWhite from "@assets/2_1778184166378.png";
import toovLogo from "@assets/TOOV_1778023131850.png";
import toovLogoWhite from "@assets/TOOV_(1)_1778184135138.png";
import { useThemedAsset } from "@/hooks/use-themed-asset";
import { useLogin } from "@workspace/api-client-react";
import { Globe2, ShieldCheck, Activity } from "lucide-react";

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

// Tek alan: kullanıcı adı veya e-posta. Server her ikisini de OR'lar.
// Eski operatör hesapları e-posta ile, müşteri hesapları kullanıcı adı ile
// giriş yapar; UI bu ayrımı bilmez.
const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, { message: "Kullanıcı adı veya e-posta zorunludur." }),
  password: z.string().min(1, { message: "Şifre zorunludur." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Login() {
  useDocumentTitle("Giriş");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const toovSrc = useThemedAsset(toovLogo, toovLogoWhite);
  const brandSrc = useThemedAsset(brandLogo, brandLogoWhite);

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
            title: "Erişim Reddedildi",
            description: err.message || "Geçersiz kimlik bilgileri.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* SOL PANEL — marka + tagline. Mobilde gizlenir. */}
      <aside className="hidden lg:flex lg:w-[44%] xl:w-[40%] relative overflow-hidden border-r border-border">
        {/* Hairline grid arka plan */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(var(--border-rgb, 230 229 224) / 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--border-rgb, 230 229 224) / 0.55) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
          }}
        />
        {/* Sıcak vurgu blob */}
        <div
          aria-hidden
          className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.12]"
          style={{ background: "#f54e00" }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div>
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="h-16 w-auto object-contain"
            />
          </div>

          <div className="space-y-8 max-w-[440px]">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Uydu Operasyon Paneli
              </div>
              <h1 className="text-[2.5rem] leading-[1.1] font-normal tracking-[-0.025em] text-foreground">
                Filonuzun tüm uydu hattı,{" "}
                <span className="text-primary">tek panelde</span>.
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Satcom, Tototheo Starlink ve Leo Bridge hatlarınızı gerçek
                zamanlı kota, lokasyon ve fatura görünürlüğüyle tek yerden
                yönetin.
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <FeatureRow
                icon={<Globe2 className="w-4 h-4" />}
                label="Üç kaynak, tek görünüm"
                hint="Satcom · Starlink · Norway"
              />
              <FeatureRow
                icon={<Activity className="w-4 h-4" />}
                label="Gerçek zamanlı kota takibi"
                hint="WhatsApp & e-posta eşik uyarıları"
              />
              <FeatureRow
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Müşteri bazlı erişim"
                hint="Yalnız kendi KIT'leriniz"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="font-medium">Geliştirici</span>
            <img
              src={toovSrc}
              alt="TOOV"
              className="h-5 w-auto object-contain opacity-80"
            />
          </div>
        </div>
      </aside>

      {/* SAĞ PANEL — form. */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobilde marka */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="h-14 w-auto object-contain mb-4"
            />
          </div>

          <div className="space-y-2 mb-10">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Hoş geldiniz
            </div>
            <h2 className="text-[28px] leading-tight font-normal tracking-[-0.02em] text-foreground">
              Hesabınıza giriş yapın
            </h2>
            <p className="text-sm text-muted-foreground">
              Operasyon panelinize erişmek için kimlik bilgilerinizi girin.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Kullanıcı adı veya e-posta
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Kullanıcı adınız"
                        {...field}
                        autoComplete="username"
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
                    <FormLabel className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Şifre
                    </FormLabel>
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
              <Button
                type="submit"
                className="w-full h-11 rounded-lg font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-none transition-colors mt-2"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Giriş yapılıyor…" : "Giriş yap"}
              </Button>
            </form>
          </Form>

          <p className="mt-10 text-xs text-muted-foreground text-center leading-relaxed">
            Erişim sorunları için lütfen yöneticinizle iletişime geçin.
          </p>

          {/* Mobilde alt: TOOV */}
          <div className="lg:hidden mt-12 pt-6 border-t border-border flex items-center justify-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              Geliştirici
            </span>
            <img
              src={toovSrc}
              alt="TOOV"
              className="h-5 w-auto object-contain opacity-80"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureRow({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-[#eeede9] dark:bg-white/5 flex items-center justify-center text-foreground/80">
        {icon}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-medium text-foreground leading-tight">
          {label}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      </div>
    </div>
  );
}
