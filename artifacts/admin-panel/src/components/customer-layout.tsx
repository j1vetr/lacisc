import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Sun, Moon, Menu, X, LogOut, User } from "lucide-react";
import {
  useGetMe,
  getGetMeQueryKey,
  useLogout,
} from "@workspace/api-client-react";

import brandLogo from "@assets/1_1778023047729.png";
import brandLogoWhite from "@assets/2_1778184166378.png";
import { useThemedAsset } from "@/hooks/use-themed-asset";
import {
  useCustomerFleet,
  CustomerFleetProvider,
  detailHref,
} from "@/hooks/use-customer-fleet";
import "@/styles/customer-sade.css";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const logout = useLogout();
  const { resolvedTheme, setTheme } = useTheme();
  const brandSrc = useThemedAsset(brandLogo, brandLogoWhite);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  // Lock scroll when mobile drawer open.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Close mobile drawer + account menu on route change.
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [location]);

  // Escape closes whichever overlay is open; restore focus to its trigger.
  useEffect(() => {
    if (!mobileOpen && !accountOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mobileOpen) {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      } else if (accountOpen) {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, accountOpen]);

  // Outside click closes account menu.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (accountMenuRef.current?.contains(target)) return;
      if (accountTriggerRef.current?.contains(target)) return;
      setAccountOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [accountOpen]);

  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });

  const fleetState = useCustomerFleet();
  const { fleet, isLoading } = fleetState;

  const filteredFleet = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return fleet;
    return fleet.filter(
      (r) =>
        r.shipName.toLocaleLowerCase("tr-TR").includes(q) ||
        r.kitNo.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [fleet, query]);

  const ctxValue = useMemo(
    () => ({ ...fleetState, filteredFleet, query }),
    [fleetState, filteredFleet, query],
  );

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        qc.clear();
        window.location.href = "/login";
      },
    });
  };

  const userName =
    (me as { name?: string; username?: string } | undefined)?.name ||
    (me as { username?: string } | undefined)?.username ||
    "Müşteri";
  const userHandle =
    (me as { username?: string } | undefined)?.username ||
    (me as { email?: string } | undefined)?.email ||
    "";
  const initials = userName
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");

  // Aktif KIT (kit-detail/starlink/norway rotalarından) → sidebar vurgusu.
  const activeKitNo = (() => {
    const m = location.match(/^\/(?:kits|starlink|norway)\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  })();

  const sidebar = (
    <aside
      className={`sd-sidebar w-[260px] shrink-0 flex flex-col ${mobileOpen ? "open" : ""}`}
    >
      <div className="px-4 py-5 flex items-center justify-between gap-2">
        <Link href="/">
          <a
            className="flex items-center justify-center cursor-pointer flex-1 min-w-0"
            aria-label="Ana sayfa"
          >
            <img
              src={brandSrc}
              alt="Lacivert Teknoloji"
              className="max-h-14 w-auto object-contain"
            />
          </a>
        </Link>
        <button
          type="button"
          className="sd-icon-btn sd-mobile-only"
          aria-label="Kapat"
          onClick={() => setMobileOpen(false)}
          style={{ width: 30, height: 30 }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="sd-divider" />

      <div className="px-5 pt-5 pb-2">
        <span className="sd-eyebrow">Gemiler</span>
      </div>

      <nav className="flex-1 overflow-auto pb-4" aria-label="Filo">
        {isLoading ? (
          <ul aria-hidden className="px-5 py-2 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                className="h-9 rounded animate-pulse"
                style={{ background: "var(--sd-hover-bg)" }}
              />
            ))}
          </ul>
        ) : fleet.length === 0 ? (
          <div
            className="px-5 py-6 text-[12.5px]"
            style={{ color: "var(--sd-muted)" }}
          >
            Henüz size atanmış bir gemi bulunmuyor.
          </div>
        ) : (
          fleet.map((s) => {
            const active = activeKitNo === s.kitNo;
            return (
              <button
                key={`${s.source}:${s.kitNo}`}
                type="button"
                className={`sd-nav-item ${active ? "active" : ""}`}
                onClick={() => setLocation(detailHref(s))}
                aria-current={active ? "page" : undefined}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="text-[13px] truncate"
                    style={{
                      fontWeight: active ? 600 : 500,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {s.shipName}
                  </span>
                  <span
                    className="sd-mono text-[10.5px]"
                    style={{ color: "var(--sd-muted)" }}
                  >
                    {s.kitNo}
                  </span>
                </div>
                <span
                  className="sd-dot"
                  style={{
                    backgroundColor: s.online
                      ? "var(--sd-success)"
                      : "var(--sd-hairline-strong)",
                  }}
                />
              </button>
            );
          })
        )}
      </nav>

      <div className="sd-divider" />

      <div className="p-4 relative">
        <button
          ref={accountTriggerRef}
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          className="w-full flex items-center gap-3 text-left"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
            style={{ backgroundColor: "var(--sd-ink)", color: "var(--sd-bg)" }}
          >
            {initials || "MA"}
          </div>
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-[12.5px] font-medium truncate">
              {userName}
            </span>
            {userHandle && (
              <span
                className="text-[10.5px] truncate"
                style={{ color: "var(--sd-muted)" }}
              >
                {userHandle}
              </span>
            )}
          </div>
        </button>

        {accountOpen && (
          <div
            ref={accountMenuRef}
            role="menu"
            aria-label="Hesap menüsü"
            className="absolute left-4 right-4 bottom-[calc(100%-8px)] rounded-lg overflow-hidden z-10"
            style={{
              background: "var(--sd-surface)",
              border: "1px solid var(--sd-hairline)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            <Link href="/profile">
              <a
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2.5 text-[13px]"
                style={{ color: "var(--sd-ink)" }}
                onClick={() => setAccountOpen(false)}
              >
                <User size={14} />
                Profilim
              </a>
            </Link>
            <div className="sd-divider" />
            <button
              role="menuitem"
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-left"
              style={{ color: "var(--sd-ink)" }}
            >
              <LogOut size={14} />
              Çıkış
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="sade-theme">
      <div className="flex" style={{ minHeight: "100vh" }}>
        {mobileOpen && (
          <div
            className="sd-mobile-overlay sd-mobile-only"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        {sidebar}

        <main className="flex-1 min-w-0 flex flex-col">
          <header
            className="sd-main-pad px-10 py-4 flex items-center gap-3 border-b"
            style={{ borderColor: "var(--sd-hairline)" }}
          >
            <button
              ref={menuButtonRef}
              type="button"
              className="sd-icon-btn sd-mobile-only"
              aria-label="Menü"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={16} />
            </button>

            <div className="flex-1 max-w-md">
              <div className="sd-search">
                <Search size={14} style={{ color: "var(--sd-muted)" }} />
                <input
                  placeholder="Gemi veya KIT ara"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Gemi ara"
                />
              </div>
            </div>

            <button
              type="button"
              className="sd-icon-btn"
              aria-label={isDark ? "Açık tema" : "Koyu tema"}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              suppressHydrationWarning
            >
              {mounted && isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </header>

          <CustomerFleetProvider value={ctxValue}>
            {children}
          </CustomerFleetProvider>
        </main>
      </div>
    </div>
  );
}
