import React from "react";
import { Link, useLocation } from "wouter";
import brandLogo from "@assets/1_1778023047729.png";
import { Activity, Database, LayoutDashboard, Settings, List, LogOut } from "lucide-react";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { title: "Panel", url: "/", icon: LayoutDashboard },
  { title: "CDR Kayıtları", url: "/cdr-records", icon: Database },
  { title: "KIT Özeti", url: "/kits", icon: List },
  { title: "Senkronizasyon Kayıtları", url: "/sync-logs", icon: Activity },
  { title: "Ayarlar", url: "/settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const logout = useLogout();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
      },
    });
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-background flex flex-col shrink-0">
        <div className="h-24 flex items-center justify-center px-4 border-b border-border shrink-0">
          <img
            src={brandLogo}
            alt="Lacivert Teknoloji"
            className="max-h-16 w-auto object-contain"
          />
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.url;
            return (
              <Link key={item.title} href={item.url}>
                <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isActive ? "bg-card border border-border text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.title}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-border shrink-0">
          <div className="flex items-center gap-3">
            {userLoading ? (
              <Skeleton className="h-9 w-9 rounded-full" />
            ) : (
              <Avatar className="h-9 w-9 border border-border">
                <AvatarFallback className="bg-card text-xs text-foreground font-medium">
                  {user?.name?.substring(0, 2).toUpperCase() || "AD"}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              {userLoading ? (
                <>
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold truncate text-foreground">{user?.name || "Yönetici"}</span>
                  <span className="text-[11px] text-muted-foreground truncate">{user?.email || "admin@example.com"}</span>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" onClick={handleLogout} title="Çıkış Yap">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 border-b border-border flex items-center px-10 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            {new Date().toLocaleDateString('tr-TR')} • OP-MERKEZİ
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="py-12 px-10 max-w-[1200px] mx-auto w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
