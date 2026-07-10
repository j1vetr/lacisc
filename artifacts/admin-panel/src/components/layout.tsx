import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import brandLogo from "@assets/1_1778023047729.png";
import brandLogoWhite from "@assets/2_1778184166378.png";
import toovLogo from "@assets/TOOV_1778023131850.png";
import toovLogoWhite from "@assets/TOOV_(1)_1778184135138.png";
import { useThemedAsset } from "@/hooks/use-themed-asset";
import {
  Activity,
  LayoutDashboard,
  Settings,
  List,
  LogOut,
  Menu,
  Users,
  ShieldCheck,
  UserCircle2,
  Search,
  ChevronUp,
} from "lucide-react";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { CommandPalette } from "./command-palette";
import { ShortcutsHelp } from "./shortcuts-help";
import { SyncCompletionToast } from "./sync-completion-toast";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";

type Role = "owner" | "admin" | "viewer" | "customer";

const baseNav = [
  { title: "Panel", url: "/", icon: LayoutDashboard, minRole: "customer" as Role, group: "main" },
  { title: "Terminaller", url: "/kits", icon: List, minRole: "customer" as Role, group: "main" },
  { title: "Senkronizasyon Kayıtları", url: "/sync-logs", icon: Activity, minRole: "viewer" as Role, group: "ops" },
  { title: "Ayarlar", url: "/settings", icon: Settings, minRole: "admin" as Role, group: "admin" },
  { title: "Kullanıcılar", url: "/admin/users", icon: Users, minRole: "admin" as Role, group: "admin" },
  { title: "Denetim Kayıtları", url: "/audit-logs", icon: ShieldCheck, minRole: "admin" as Role, group: "admin" },
];

const ROLE_RANK: Record<Role, number> = { customer: -1, viewer: 0, admin: 1, owner: 2 };

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const toovSrc = useThemedAsset(toovLogo, toovLogoWhite);
  const brandSrc = useThemedAsset(brandLogo, brandLogoWhite);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navPrefix = useRef<{ key: string; ts: number } | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (isTyping) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      const k = e.key.toLowerCase();
      const now = Date.now();
      if (navPrefix.current && now - navPrefix.current.ts < 1500) {
        if (navPrefix.current.key === "g") {
          if (k === "p") { e.preventDefault(); setLocation("/"); }
          else if (k === "t") { e.preventDefault(); setLocation("/kits"); }
          else if (k === "l") { e.preventDefault(); setLocation("/sync-logs"); }
          else if (k === "s") { e.preventDefault(); setLocation("/settings"); }
          navPrefix.current = null;
          return;
        }
      }
      if (k === "g") {
        navPrefix.current = { key: "g", ts: now };
      } else {
        navPrefix.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = ((user as { role?: Role } | undefined)?.role ?? "viewer") as Role;
  const navItems = baseNav.filter((item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]);

  const mainNav = navItems.filter((n) => n.group === "main");
  const opsNav = navItems.filter((n) => n.group === "ops");
  const adminNav = navItems.filter((n) => n.group === "admin");

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { qc.clear(); window.location.href = "/login"; },
      onError: () => { qc.clear(); window.location.href = "/login"; },
    });
  };

  const NavItem = ({ item }: { item: typeof baseNav[number] }) => {
    const isActive =
      item.url === "/"
        ? location === "/"
        : location === item.url || location.startsWith(item.url + "/");
    return (
      <Link href={item.url}>
        <div
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
            isActive
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <item.icon
            className={`w-4 h-4 shrink-0 transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          />
          <span className="truncate">{t(item.title)}</span>
          {isActive && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
        </div>
      </Link>
    );
  };

  const NavSection = ({
    label,
    items,
  }: {
    label: string;
    items: typeof baseNav;
  }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-0.5">
        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
          {label}
        </p>
        {items.map((item) => (
          <NavItem key={item.title} item={item} />
        ))}
      </div>
    );
  };

  const SidebarBody = ({ inDrawer = false }: { inDrawer?: boolean }) => (
    <>
      {!inDrawer && (
        <div className="h-[72px] flex items-center px-5 border-b border-border shrink-0">
          <img
            src={brandSrc}
            alt="Lacivert Teknoloji"
            className="max-h-12 w-auto object-contain"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-4">
        <NavSection label={t("Ana")} items={mainNav} />
        {opsNav.length > 0 && (
          <>
            <div className="h-px bg-border mx-1" />
            <NavSection label={t("Operasyon")} items={opsNav} />
          </>
        )}
        {adminNav.length > 0 && (
          <>
            <div className="h-px bg-border mx-1" />
            <NavSection label={t("Yönetim")} items={adminNav} />
          </>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary transition-colors text-left"
        >
          {userLoading ? (
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          ) : (
            <Avatar className="h-8 w-8 shrink-0 border border-border">
              <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
                {user?.name?.substring(0, 2).toUpperCase() || "AD"}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex flex-col flex-1 min-w-0">
            {userLoading ? (
              <>
                <Skeleton className="h-2.5 w-16 mb-1.5" />
                <Skeleton className="h-2 w-12" />
              </>
            ) : (
              <>
                <span className="text-[13px] font-medium truncate text-foreground leading-tight">
                  {user?.name || t("Yönetici")}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-primary font-mono mt-0.5">
                  {role}
                </span>
              </>
            )}
          </div>
          <ChevronUp
            className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${
              userMenuOpen ? "" : "rotate-180"
            }`}
          />
        </button>

        {userMenuOpen && (
          <div className="border-t border-border bg-secondary/30">
            <Link href="/profile">
              <div className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-secondary transition-colors cursor-pointer">
                <UserCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                {t("Profilim")}
              </div>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-secondary transition-colors"
            >
              <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
              {t("Çıkış Yap")}
            </button>
          </div>
        )}
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
          <SheetHeader className="h-14 px-4 border-b border-border shrink-0 flex flex-row items-center justify-start">
            <SheetTitle className="sr-only">{t("Menü")}</SheetTitle>
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="max-h-9 w-auto object-contain"
            />
          </SheetHeader>
          <SidebarBody inDrawer />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 shrink-0 bg-background sticky top-0 z-20 gap-2">
          {/* Mobile: hamburger + logo */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary -ml-1"
            onClick={() => setMobileOpen(true)}
            aria-label={t("Menüyü aç")}
          >
            <Menu className="w-4 h-4" />
          </Button>
          <div className="lg:hidden">
            <img src={brandSrc} alt="Lacivert" className="h-7 w-auto object-contain" />
          </div>

          <div className="flex-1" />

          {/* Search icon — opens command palette */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPaletteOpen(true)}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t("Arama")}
            title={t("Arama (⌘K)")}
          >
            <Search className="w-4 h-4" />
          </Button>

          <LanguageSwitcher compact variant="solid" />
          <ThemeToggle />

          {/* TOOV brand mark */}
          <div className="hidden sm:flex items-center pl-1 border-l border-border ml-1">
            <img src={toovSrc} alt="TOOV" className="h-5 w-auto object-contain opacity-70" />
          </div>
        </header>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        {role !== "customer" && <SyncCompletionToast />}

        <main className="flex-1 overflow-y-auto">
          <div className="py-6 px-4 sm:py-8 sm:px-6 lg:py-10 lg:px-10 max-w-[1200px] mx-auto w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
