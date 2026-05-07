import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  List,
  Activity,
  Settings,
  Mail,
  AlertTriangle,
  Users,
  ShieldCheck,
  UserCircle2,
  Terminal,
  Server,
  HelpCircle,
} from "lucide-react";
import {
  useGetKits,
  getGetKitsQueryKey,
  useListStationAccounts,
  getListStationAccountsQueryKey,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type Role = "owner" | "admin" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole: Role;
  shortcut?: string;
  group: "Sayfalar" | "Ayarlar";
};

const NAV: NavItem[] = [
  { label: "Panel", href: "/", icon: LayoutDashboard, minRole: "viewer", shortcut: "G P", group: "Sayfalar" },
  { label: "Terminaller", href: "/kits", icon: List, minRole: "viewer", shortcut: "G T", group: "Sayfalar" },
  { label: "Senkronizasyon Kayıtları", href: "/sync-logs", icon: Activity, minRole: "viewer", shortcut: "G S", group: "Sayfalar" },
  { label: "Profilim", href: "/profile", icon: UserCircle2, minRole: "viewer", group: "Sayfalar" },
  { label: "Kullanıcılar", href: "/admin/users", icon: Users, minRole: "admin", group: "Sayfalar" },
  { label: "Denetim Kayıtları", href: "/audit-logs", icon: ShieldCheck, minRole: "admin", group: "Sayfalar" },
  { label: "Ayarlar — Hesaplar", href: "/settings", icon: Settings, minRole: "admin", group: "Ayarlar" },
  { label: "Ayarlar — E-posta & Alarmlar", href: "/settings/email", icon: Mail, minRole: "admin", group: "Ayarlar" },
  { label: "Ayarlar — Tehlike Bölgesi", href: "/settings/danger", icon: AlertTriangle, minRole: "admin", group: "Ayarlar" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
}

export function CommandPalette({ open, onOpenChange, onShowShortcuts }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 } });
  const role = ((me as { role?: Role } | undefined)?.role ?? "viewer") as Role;

  // Only fetch lists when the palette is open to avoid background traffic.
  const { data: kits } = useGetKits(
    { sortBy: "totalGib" },
    { query: { queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }), enabled: open, staleTime: 30_000 } }
  );
  const { data: accounts } = useListStationAccounts({
    query: {
      queryKey: getListStationAccountsQueryKey(),
      enabled: open && ROLE_RANK[role] >= ROLE_RANK.admin,
      staleTime: 30_000,
    },
  });

  // Reset query when closing.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const navItems = useMemo(
    () => NAV.filter((n) => ROLE_RANK[role] >= ROLE_RANK[n.minRole]),
    [role]
  );

  const go = (href: string) => {
    onOpenChange(false);
    setLocation(href);
  };

  const pageGroup = navItems.filter((n) => n.group === "Sayfalar");
  const settingsGroup = navItems.filter((n) => n.group === "Ayarlar");

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Sayfa, KIT veya hesap ara…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        <CommandGroup heading="Sayfalar">
          {pageGroup.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.href}`}
                onSelect={() => go(item.href)}
              >
                <Icon className="text-muted-foreground" />
                <span>{item.label}</span>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            );
          })}
        </CommandGroup>

        {settingsGroup.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ayarlar">
              {settingsGroup.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.href}`}
                    onSelect={() => go(item.href)}
                  >
                    <Icon className="text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {kits && kits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Terminaller (${kits.length})`}>
              {kits.slice(0, 50).map((k) => (
                <CommandItem
                  key={k.kitNo}
                  value={`${k.kitNo} ${k.shipName ?? ""}`}
                  onSelect={() => go(`/kits/${encodeURIComponent(k.kitNo)}`)}
                >
                  <Terminal className="text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono text-[13px] truncate">{k.kitNo}</span>
                    {k.shipName && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {k.shipName}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {accounts && accounts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Portal Hesapları">
              {accounts.map((a: any) => {
                const display = a.label?.trim() || a.username;
                return (
                  <CommandItem
                    key={a.id}
                    value={`${display} ${a.username}`}
                    onSelect={() => go("/settings")}
                  >
                    <Server className="text-muted-foreground" />
                    <span>{display}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground font-mono truncate">
                      {a.username}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Yardım">
          <CommandItem
            value="klavye kısayolları yardım"
            onSelect={() => {
              onOpenChange(false);
              onShowShortcuts();
            }}
          >
            <HelpCircle className="text-muted-foreground" />
            <span>Klavye Kısayolları</span>
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
