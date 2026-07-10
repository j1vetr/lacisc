import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
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
  { title: "Panel",                    url: "/",            icon: LayoutDashboard, minRole: "customer" as Role },
  { title: "Terminaller",              url: "/kits",        icon: List,            minRole: "customer" as Role },
  { title: "Senkronizasyon Kayıtları", url: "/sync-logs",   icon: Activity,        minRole: "viewer"   as Role },
  { title: "Ayarlar",                  url: "/settings",    icon: Settings,        minRole: "admin"    as Role },
  { title: "Kullanıcılar",             url: "/admin/users", icon: Users,           minRole: "admin"    as Role },
  { title: "Denetim Kayıtları",        url: "/audit-logs",  icon: ShieldCheck,     minRole: "admin"    as Role },
  { title: "Profilim",                 url: "/profile",     icon: UserCircle2,     minRole: "viewer"   as Role },
];

const ROLE_RANK: Record<Role, number> = { customer: -1, viewer: 0, admin: 1, owner: 2 };

const ROLE_LABEL: Record<Role, string> = {
  owner:    "Owner",
  admin:    "Admin",
  viewer:   "Viewer",
  customer: "Customer",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const toovSrc = useThemedAsset(toovLogo, toovLogoWhite);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navPrefix = useRef<{ key: string; ts: number } | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable === true;

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
      if (k === "g") navPrefix.current = { key: "g", ts: now };
      else navPrefix.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = ((user as { role?: Role } | undefined)?.role ?? "viewer") as Role;
  const navItems = baseNav.filter((item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { qc.clear(); window.location.href = "/login"; },
      onError:   () => { qc.clear(); window.location.href = "/login"; },
    });
  };

  /* ── Sidebar nav body (shared desktop + mobile drawer) ── */
  const SidebarBody = ({ inDrawer = false }: { inDrawer?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      {!inDrawer && (
        <div className="h-20 flex items-center px-5 border-b border-white/[0.08] shrink-0">
          <img
            src={brandLogoWhite}
            alt="Lacivert Teknoloji"
            className="max-h-10 w-auto object-contain"
          />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
          return (
            <Link key={item.title} href={item.url}>
              <div
                className={`
                  group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
                  transition-all duration-150 cursor-pointer select-none
                  ${isActive
                    ? "bg-white/[0.10] text-white shadow-sm"
                    : "text-[#8fa4c0] hover:bg-white/[0.06] hover:text-[#c8d8ed]"
                  }
                `}
              >
                {/* Active indicator — left orange bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[#f54e00]" />
                )}
                <item.icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[#8fa4c0] group-hover:text-[#c8d8ed]"}`}
                />
                <span className="truncate">{t(item.title)}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.06] transition-colors group">
          {userLoading ? (
            <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
          ) : (
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-[#f54e00]/20 text-[#f54e00] text-[11px] font-semibold border border-[#f54e00]/30">
                {user?.name?.substring(0, 2).toUpperCase() || "AD"}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex flex-col flex-1 min-w-0">
            {userLoading ? (
              <>
                <Skeleton className="h-2.5 w-16 mb-1.5 bg-white/10" />
                <Skeleton className="h-2 w-24 bg-white/10" />
              </>
            ) : (
              <>
                <span className="text-[12px] font-semibold truncate text-white leading-tight">
                  {user?.name || t("Yönetici")}
                </span>
                <span className="text-[10px] text-[#7a93b4] truncate leading-tight mt-0.5">
                  {user?.email || user?.username || "—"}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-[#f54e00]/80 font-mono mt-0.5">
                  {ROLE_LABEL[role]}
                </span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-[#7a93b4] hover:text-white hover:bg-white/[0.10] shrink-0 opacity-0 group-hover:opacity-100 transition-all"
            onClick={handleLogout}
            title={t("Çıkış Yap")}
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-background text-foreground overflow-hidden">

      {/* ── Desktop sidebar — always navy ── */}
      <aside className="hidden lg:flex w-60 flex-col shrink-0 bg-[#0f1b2d] border-r border-[#1a2e47]">
        <SidebarBody />
      </aside>

      {/* ── Mobile drawer ── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 flex flex-col bg-[#0f1b2d] border-r border-[#1a2e47]">
          <SheetHeader className="h-16 px-5 border-b border-white/[0.08] shrink-0 flex flex-row items-center justify-start">
            <SheetTitle className="sr-only">{t("Menü")}</SheetTitle>
            <img src={brandLogoWhite} alt="Lacivert Teknoloji" className="max-h-9 w-auto object-contain" />
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <SidebarBody inDrawer />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* ── Header ── */}
        <header className="h-14 lg:h-[60px] border-b border-border flex items-center px-4 lg:px-6 shrink-0 bg-card sticky top-0 z-20 gap-3">

          {/* Mobile: hamburger + logo */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 rounded-lg text-foreground hover:bg-secondary -ml-1 shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label={t("Menüyü aç")}
          >
            <Menu className="w-4.5 h-4.5" />
          </Button>

          {/* Search bar — grows to fill center */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-sm flex items-center gap-2.5 h-9 px-3 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-muted-foreground transition-colors text-left"
            aria-label={t("Komut paletini aç")}
          >
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
            <span className="text-[13px] flex-1 truncate">{t("Terminaller, gemiler, lokasyonlar…")}</span>
            <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded border border-border bg-card font-mono text-[10px] text-muted-foreground shrink-0">
              ⌘K
            </kbd>
          </button>

          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-1.5 lg:gap-2">
            <LanguageSwitcher compact variant="solid" />
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border ml-0.5">
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <img src={toovSrc} alt="TOOV" className="h-5 w-auto object-contain opacity-80" />
            </div>
          </div>
        </header>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onShowShortcuts={() => setShortcutsOpen(true)} />
        <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        {role !== "customer" && <SyncCompletionToast />}

        <main className="flex-1 overflow-y-auto">
          <div className="py-6 px-4 sm:py-8 sm:px-6 lg:py-10 lg:px-8 max-w-[1280px] mx-auto w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
