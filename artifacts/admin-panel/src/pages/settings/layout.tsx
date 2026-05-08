import React from "react";
import { Link, useLocation } from "wouter";
import { Server, Mail, AlertTriangle, Satellite, Globe } from "lucide-react";
import { useDocumentTitle } from "@/hooks/use-document-title";

const TABS = [
  { href: "/settings", label: "SATCOM", icon: Server },
  { href: "/settings/starlink", label: "TOTOTHEO", icon: Satellite },
  { href: "/settings/norway", label: "NORWAY", icon: Globe },
  { href: "/settings/email", label: "E-posta & Alarmlar", icon: Mail },
  { href: "/settings/danger", label: "Tehlike Bölgesi", icon: AlertTriangle },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  useDocumentTitle("Ayarlar");
  const [location] = useLocation();

  return (
    <div className="space-y-6 lg:space-y-8 max-w-5xl animate-in fade-in duration-500 pb-8 lg:pb-12">
      <div className="space-y-2">
        <h1 className="text-[28px] sm:text-[40px] leading-[1.1] font-normal tracking-[-0.02em] text-foreground">
          Ayarlar
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Her gece 01:00 da senkronize sağlanır.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => {
          const active = location === t.href;
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <div
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors whitespace-nowrap border-b-2 -mb-[1px] ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
