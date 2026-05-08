import React, { useState, useEffect } from "react";
import "./_sade.css";
import { ArrowUpRight, Search, Sun, Moon, Menu, X, Settings } from "lucide-react";

type Ship = {
  id: string;
  name: string;
  kit: string;
  source: "Starlink" | "Satcom" | "Norway";
  usageGb: number;
  capGb: number;
  status: "active" | "idle";
};

const ships: Ship[] = [
  { id: "1", name: "Aurora Borealis", kit: "KITP00482", source: "Starlink", usageGb: 412.6, capGb: 1000, status: "active" },
  { id: "2", name: "Mavi Ufuk",        kit: "KITP00611", source: "Starlink", usageGb: 88.2,  capGb: 500,  status: "active" },
  { id: "3", name: "Karadeniz",        kit: "KITP00733", source: "Satcom",   usageGb: 14.7,  capGb: 50,   status: "active" },
  { id: "4", name: "Poyraz",           kit: "KITP00822", source: "Norway",   usageGb: 627.1, capGb: 750,  status: "active" },
  { id: "5", name: "Lodos",            kit: "KITP00834", source: "Starlink", usageGb: 211.4, capGb: 500,  status: "active" },
  { id: "6", name: "Yıldız",           kit: "KITP00901", source: "Satcom",   usageGb: 3.1,   capGb: 50,   status: "idle"   },
  { id: "7", name: "Akdeniz Sefiri",   kit: "KITP01044", source: "Starlink", usageGb: 156.9, capGb: 500,  status: "active" },
  { id: "8", name: "Marmara",          kit: "KITP01180", source: "Norway",   usageGb: 482.0, capGb: 750,  status: "active" },
  { id: "9", name: "Ege Yıldızı",      kit: "KITP01233", source: "Starlink", usageGb: 39.4,  capGb: 250,  status: "active" },
];

const fmtGb = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = (used: number, cap: number) =>
  Math.min(100, Math.round((used / cap) * 100));

function LogoMark() {
  return (
    <span className="sd-logo-mark" aria-label="Station Satcom">
      SS
    </span>
  );
}

function ShipCard({ ship, onOpen }: { ship: Ship; onOpen: () => void }) {
  const usagePct = pct(ship.usageGb, ship.capGb);
  const warn = usagePct >= 80;
  return (
    <button
      onClick={onOpen}
      className="sd-card w-full text-left p-5 sm:p-6 flex flex-col gap-5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sd-orange)]"
      style={{ minHeight: 184 }}
    >
      <div className="flex items-start gap-3">
        <span
          className="sd-dot mt-[6px] shrink-0"
          style={{
            backgroundColor:
              ship.status === "active" ? "var(--sd-success)" : "var(--sd-hairline-strong)",
          }}
        />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <h3
            className="text-[16px] sm:text-[17px] font-semibold leading-tight truncate"
            style={{ letterSpacing: "-0.01em" }}
          >
            {ship.name}
          </h3>
          <span className="sd-mono text-[11px]" style={{ color: "var(--sd-muted)" }}>
            {ship.kit}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="sd-tnum text-[30px] sm:text-[34px] font-semibold leading-none"
          style={{ letterSpacing: "-0.025em" }}
        >
          {fmtGb(ship.usageGb)}
        </span>
        <span className="text-[13px]" style={{ color: "var(--sd-muted)" }}>GB</span>
        <span
          className="text-[12px] ml-auto sd-tnum"
          style={{ color: "var(--sd-muted)" }}
        >
          {usagePct}%
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="sd-bar-track">
          <div
            className={`sd-bar-fill ${warn ? "warn" : ""}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--sd-muted)" }}>
            {fmtGb(ship.capGb)} GB tanımlı
          </span>
          <span
            className="flex items-center gap-1 text-[12px] sd-detail-label"
            style={{ color: "var(--sd-muted)" }}
          >
            Detay
            <ArrowUpRight className="sd-arrow" size={14} strokeWidth={2} />
          </span>
        </div>
      </div>
    </button>
  );
}

export function Sade() {
  const [activeId, setActiveId] = useState<string>("1");
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  const total = ships.reduce((a, s) => a + s.usageGb, 0);
  const activeCount = ships.filter((s) => s.status === "active").length;

  const sidebar = (
    <aside className={`sd-sidebar w-[260px] shrink-0 flex flex-col ${mobileOpen ? "open" : ""}`}>
      <div className="px-5 py-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span
            className="text-[14px] font-semibold leading-none"
            style={{ letterSpacing: "-0.01em" }}
          >
            Station Satcom
          </span>
        </div>
        <button
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

      <nav className="flex-1 overflow-auto pb-4">
        {ships.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              className={`sd-nav-item ${active ? "active" : ""}`}
              onClick={() => {
                setActiveId(s.id);
                setMobileOpen(false);
              }}
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-[13px] truncate"
                  style={{ fontWeight: active ? 600 : 500, letterSpacing: "-0.005em" }}
                >
                  {s.name}
                </span>
                <span
                  className="sd-mono text-[10.5px]"
                  style={{ color: "var(--sd-muted)" }}
                >
                  {s.kit}
                </span>
              </div>
              <span
                className="sd-dot"
                style={{
                  backgroundColor:
                    s.status === "active"
                      ? "var(--sd-success)"
                      : "var(--sd-hairline-strong)",
                }}
              />
            </div>
          );
        })}
      </nav>

      <div className="sd-divider" />

      <div className="p-4 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
          style={{ backgroundColor: "var(--sd-ink)", color: "var(--sd-bg)" }}
        >
          MA
        </div>
        <div className="flex flex-col leading-tight min-w-0 flex-1">
          <span className="text-[12.5px] font-medium truncate">Mavi Armatörlük</span>
          <span
            className="text-[10.5px] truncate"
            style={{ color: "var(--sd-muted)" }}
          >
            ops@maviarmador.com
          </span>
        </div>
        <button className="sd-icon-btn" aria-label="Ayarlar">
          <Settings size={14} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className={`sade-theme ${dark ? "sade-dark" : ""}`}>
      <div className="flex" style={{ minHeight: "100vh" }}>
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="sd-mobile-overlay sd-mobile-only"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {sidebar}

        <main className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header
            className="sd-main-pad px-10 py-4 flex items-center gap-3 border-b"
            style={{ borderColor: "var(--sd-hairline)" }}
          >
            <button
              className="sd-icon-btn sd-mobile-only"
              aria-label="Menü"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={16} />
            </button>

            <div className="flex-1 max-w-md">
              <div className="sd-search">
                <Search size={14} style={{ color: "var(--sd-muted)" }} />
                <input placeholder="Gemi veya KIT ara" />
                <span className="sd-kbd sd-desktop-only">⌘K</span>
              </div>
            </div>

            <button
              className="sd-icon-btn"
              aria-label={dark ? "Açık tema" : "Koyu tema"}
              onClick={() => setDark((d) => !d)}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </header>

          {/* Page header */}
          <section className="sd-main-pad sd-page-head px-10 pt-10 pb-8 flex items-end justify-between gap-6">
            <div className="flex flex-col gap-2">
              <span className="sd-eyebrow">Gemiler</span>
              <h1
                className="text-[26px] sm:text-[30px] font-semibold leading-none"
                style={{ letterSpacing: "-0.025em" }}
              >
                Genel Bakış
              </h1>
            </div>
            <div className="sd-page-stats flex items-end gap-10">
              <div className="flex flex-col items-end gap-1">
                <span className="sd-eyebrow">Bu ay toplam</span>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="sd-tnum text-[24px] sm:text-[28px] font-semibold leading-none"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {fmtGb(total)}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--sd-muted)" }}>GB</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="sd-eyebrow">Aktif</span>
                <span
                  className="sd-tnum text-[24px] sm:text-[28px] font-semibold leading-none"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {activeCount}
                  <span
                    className="text-[14px]"
                    style={{ color: "var(--sd-muted)", fontWeight: 400 }}
                  >
                    {" "}
                    / {ships.length}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Cards grid */}
          <section className="sd-main-pad px-10 pb-12">
            <div
              className="grid gap-4 sm:gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
            >
              {ships.map((s) => (
                <ShipCard key={s.id} ship={s} onOpen={() => setActiveId(s.id)} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default Sade;
