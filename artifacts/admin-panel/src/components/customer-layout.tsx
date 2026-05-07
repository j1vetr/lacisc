import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetKits,
  getGetKitsQueryKey,
  useGetStarlinkTerminals,
  getGetStarlinkTerminalsQueryKey,
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useLogout,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import brandLogo from "@assets/1_1778023047729.png";
import brandLogoWhite from "@assets/2_1778184166378.png";
import { useThemedAsset } from "@/hooks/use-themed-asset";
import "@/styles/editorial.css";

type SidebarRow = {
  source: "satcom" | "starlink";
  kitNo: string;
  shipName: string;
  currentPeriodGib: number;
  online: boolean;
};

const TR = (s: string) => s.toLocaleUpperCase("tr-TR");

function fmtGib(n: number | null | undefined): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function isOnlineSatcom(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}

function periodLabelTR(period: string | undefined | null): string {
  if (!period || period.length !== 6) return "";
  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  const y = period.slice(0, 4);
  const m = parseInt(period.slice(4, 6), 10);
  if (m < 1 || m > 12) return period;
  return `${months[m - 1]} ${y}`;
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const logout = useLogout();
  const brandSrc = useThemedAsset(brandLogo, brandLogoWhite);

  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), staleTime: 60_000 },
  });

  const refetchMs = 30_000;

  const { data: summary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: refetchMs,
    },
  });

  const { data: satcomKits } = useGetKits(
    { sortBy: "totalGib" },
    {
      query: {
        queryKey: getGetKitsQueryKey({ sortBy: "totalGib" }),
        refetchInterval: refetchMs,
      },
    }
  );

  const { data: starlinkTerminals } = useGetStarlinkTerminals({
    query: {
      queryKey: getGetStarlinkTerminalsQueryKey(),
      refetchInterval: refetchMs,
    },
  });

  const rows: SidebarRow[] = useMemo(() => {
    const out: SidebarRow[] = [];
    for (const k of satcomKits ?? []) {
      out.push({
        source: "satcom",
        kitNo: k.kitNo,
        shipName: (k.shipName?.trim() || "Adsız Gemi"),
        currentPeriodGib: k.totalGib ?? 0,
        online: isOnlineSatcom(k.lastSyncedAt ?? null),
      });
    }
    for (const t of starlinkTerminals ?? []) {
      out.push({
        source: "starlink",
        kitNo: t.kitSerialNumber,
        shipName: (t.nickname?.trim() || t.assetName?.trim() || "Adsız Gemi"),
        currentPeriodGib: t.currentPeriodTotalGb ?? 0,
        online: t.isOnline ?? false,
      });
    }
    out.sort((a, b) => b.currentPeriodGib - a.currentPeriodGib);
    return out;
  }, [satcomKits, starlinkTerminals]);

  const totalKits = rows.length;
  const totalGib = rows.reduce((s, r) => s + r.currentPeriodGib, 0);
  const onlineCount = rows.filter((r) => r.online).length;
  const activePeriodLabel = periodLabelTR(summary?.activePeriod) || "Aktif Dönem";

  const today = TR(
    new Date().toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

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

  const userName = (me as { name?: string; username?: string } | undefined)?.name
    || (me as { username?: string } | undefined)?.username
    || "Müşteri";
  const userHandle = (me as { username?: string } | undefined)?.username
    || (me as { email?: string } | undefined)?.email
    || "";

  // Aktif olan kit (kit-detail rotasında URL'den çıkar) → sidebar'da vurgula.
  const activeKitNo = (() => {
    const m = location.match(/^\/kits\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  })();

  return (
    <div className="editorial-theme flex w-full min-h-screen">
      {/* Sidebar */}
      <aside className="w-[320px] shrink-0 hl-r min-h-screen sticky top-0 h-screen flex flex-col">
        <div className="px-8 pt-9 pb-9">
          <Link href="/">
            <a className="brand-mark block cursor-pointer">
              <img src={brandSrc} alt="Lacivert Teknoloji" />
            </a>
          </Link>
        </div>

        <div className="px-8 pb-7 hl-b">
          <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] mb-2">
            Hesap
          </div>
          <div className="ed-serif text-[22px] leading-tight text-[var(--ink)]">
            {userName}
          </div>
          {userHandle && (
            <div className="ed-mono text-[11px] text-[var(--ink-mute)] mt-1">
              @{userHandle}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-7 pb-6">
          <div className="px-8 mb-4 flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] font-medium">
              Filo · İçindekiler
            </div>
            <Link href="/">
              <a className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)] hover:text-[var(--orange)] cursor-pointer">
                Tümü
              </a>
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="px-8 ed-serif italic text-[14px] text-[var(--ink-mute)]">
              Henüz size atanmış bir gemi bulunmuyor.
            </div>
          ) : (
            <ul>
              {rows.map((kit, i) => {
                const isActive = activeKitNo === kit.kitNo;
                return (
                  <li key={`${kit.source}:${kit.kitNo}`}>
                    <button
                      onClick={() =>
                        setLocation(`/kits/${encodeURIComponent(kit.kitNo)}`)
                      }
                      className={`row-link w-full text-left px-8 py-3.5 flex items-center justify-between gap-3 ${
                        isActive ? "bg-[var(--bg-paper)]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="ed-mono text-[11px] w-5 num-tabular font-medium tracking-tight"
                          style={{ color: kit.online ? "#2f8a4f" : "#d44a2c" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <div
                            className={`ship-name ed-serif text-[18px] leading-tight truncate ${
                              isActive ? "text-[var(--orange)]" : "text-[var(--ink)]"
                            }`}
                          >
                            {kit.shipName}
                          </div>
                          <div className="ed-mono text-[10px] text-[var(--ink-faint)] mt-0.5">
                            {kit.kitNo}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="ed-mono text-[12px] text-[var(--ink-soft)] num-tabular">
                          {fmtGib(kit.currentPeriodGib)}
                        </div>
                        <div className="text-[9px] tracking-widest uppercase text-[var(--ink-faint)] mt-0.5">
                          GB
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-8 py-6 hl-t">
          <div className="text-[10px] tracking-widest uppercase text-[var(--ink-mute)]">
            {activePeriodLabel} · Toplam
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="stat-num text-[26px] text-[var(--ink)]">
              {fmtGib(totalGib)}
            </span>
            <span className="ed-mono text-[11px] text-[var(--ink-mute)]">
              GB
            </span>
          </div>
          <div className="text-[11px] text-[var(--ink-mute)] mt-1">
            {onlineCount} / {totalKits} gemi çevrimiçi
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        {/* Top bar — page-agnostic chrome */}
        <div className="hl-b px-14 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] tracking-[0.18em] uppercase text-[var(--ink-mute)]">
            <span className="rule-orange" />
            <span>AYLIK FİLO BÜLTENİ</span>
            <span className="text-[var(--ink-faint)]">·</span>
            <span className="ed-mono text-[11px] tracking-[0.12em]">
              {today}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/profile">
              <button className="ghost-cta">PROFİLİM</button>
            </Link>
            <button
              onClick={handleLogout}
              className="ghost-cta"
              title="Çıkış Yap"
            >
              ÇIKIŞ
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
