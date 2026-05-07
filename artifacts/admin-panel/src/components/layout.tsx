import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import brandLogo from "@assets/1_1778023047729.png";
import toovLogo from "@assets/TOOV_1778023131850.png";
import { Activity, LayoutDashboard, Settings, List, LogOut, Menu, Users, ShieldCheck, UserCircle2 } from "lucide-react";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "@/components/ui/sheet";

type Role = "owner" | "admin" | "viewer";

const baseNav = [
  { title: "Panel", url: "/", icon: LayoutDashboard, minRole: "viewer" as Role },
  { title: "Terminaller", url: "/kits", icon: List, minRole: "viewer" as Role },
  { title: "Senkronizasyon Kayıtları", url: "/sync-logs", icon: Activity, minRole: "viewer" as Role },
  { title: "Ayarlar", url: "/settings", icon: Settings, minRole: "admin" as Role },
  { title: "Kullanıcılar", url: "/admin/users", icon: Users, minRole: "admin" as Role },
  { title: "Denetim Kayıtları", url: "/audit-logs", icon: ShieldCheck, minRole: "admin" as Role },
  { title: "Profilim", url: "/profile", icon: UserCircle2, minRole: "viewer" as Role },
];

const ROLE_RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const logout = useLogout();
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const role = ((user as { role?: Role } | undefined)?.role ?? "viewer") as Role;
  const navItems = baseNav.filter((item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        qc.clear();
        window.location.href = "/login";
      },
      onError: () => {
        qc.clear();
        window.location.href = "/login";
      },
    });
  };

  const SidebarBody = ({ inDrawer = false }: { inDrawer?: boolean }) => (
    <>
      {!inDrawer && (
        <div className="h-24 flex items-center justify-center px-4 border-b border-border shrink-0">
          <img
            src={brandLogo}
            alt="Lacivert Teknoloji"
            className="max-h-16 w-auto object-contain"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-6 lg:py-8 px-4 space-y-2">
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

      <div className="p-4 lg:p-6 border-t border-border shrink-0">
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
                <span className="text-[10px] uppercase tracking-widest text-primary mt-0.5 font-mono">{role}</span>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" onClick={handleLogout} title="Çıkış Yap">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-background flex-col shrink-0">
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col bg-background">
          <SheetHeader className="h-16 px-4 border-b border-border shrink-0 flex flex-row items-center justify-start">
            <SheetTitle className="sr-only">Menü</SheetTitle>
            <img
              src={brandLogo}
              alt="Lacivert Teknoloji"
              className="max-h-10 w-auto object-contain"
            />
          </SheetHeader>
          <SidebarBody inDrawer />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-14 lg:h-20 border-b border-border flex items-center px-4 lg:px-10 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 rounded-lg text-foreground hover:bg-secondary -ml-1"
            onClick={() => setMobileOpen(true)}
            aria-label="Menüyü aç"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="lg:hidden">
            <img src={brandLogo} alt="Lacivert" className="h-8 w-auto object-contain" />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 lg:gap-3 text-[11px] lg:text-xs font-mono text-muted-foreground">
            <span className="hidden sm:inline">{new Date().toLocaleDateString('tr-TR')}</span>
            <span className="hidden sm:inline">•</span>
            <img src={toovLogo} alt="TOOV" className="h-5 lg:h-6 w-auto object-contain" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="py-6 px-4 sm:py-8 sm:px-6 lg:py-12 lg:px-10 max-w-[1200px] mx-auto w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
