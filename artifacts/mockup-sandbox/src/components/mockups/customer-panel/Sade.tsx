import React, { useState } from "react";
import "./_sade.css";
import {
  Anchor,
  ArrowUpRight,
  ChevronDown,
  Search,
  LayoutGrid,
  Bell,
  LifeBuoy,
  Settings,
} from "lucide-react";

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

function fmtGb(n: number) {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function pct(used: number, cap: number) {
  return Math.min(100, Math.round((used / cap) * 100));
}

function ShipCard({ ship, onOpen }: { ship: Ship; onOpen: () => void }) {
  const usagePct = pct(ship.usageGb, ship.capGb);
  const warn = usagePct >= 80;
  return (
    <button
      onClick={onOpen}
      className="sd-card w-full text-left p-6 flex flex-col gap-5 cursor-pointer focus:outline-none"
      style={{ minHeight: 200 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="sd-dot"
              style={{ backgroundColor: ship.status === "active" ? "var(--sd-success)" : "var(--sd-hairline-strong)" }}
            />
            <h3 className="text-[17px] font-semibold leading-none truncate" style={{ letterSpacing: "-0.01em" }}>
              {ship.name}
            </h3>
          </div>
          <span className="sd-mono text-[11px]" style={{ color: "var(--sd-muted)" }}>
            {ship.kit}
          </span>
        </div>
        <span className="sd-eyebrow" style={{ marginTop: 2 }}>{ship.source}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="sd-tnum text-[34px] font-semibold leading-none" style={{ letterSpacing: "-0.025em" }}>
          {fmtGb(ship.usageGb)}
        </span>
        <span className="text-[13px]" style={{ color: "var(--sd-muted)" }}>GB</span>
        <span className="text-[12px] ml-auto sd-tnum" style={{ color: "var(--sd-muted)" }}>
          {usagePct}%
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="sd-bar-track">
          <div className={`sd-bar-fill ${warn ? "warn" : ""}`} style={{ width: `${usagePct}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--sd-muted)" }}>
            {fmtGb(ship.capGb)} GB tanımlı
          </span>
          <span className="flex items-center gap-1 text-[12px] sd-detail-label" style={{ color: "var(--sd-muted)" }}>
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
  const [filter, setFilter] = useState<"hepsi" | "active" | "idle">("hepsi");

  const visible = ships.filter((s) =>
    filter === "hepsi" ? true : filter === "active" ? s.status === "active" : s.status === "idle"
  );

  const total = ships.reduce((a, s) => a + s.usageGb, 0);

  return (
    <div className="sade-theme">
      <div className="flex" style={{ minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside className="sd-sidebar w-[260px] shrink-0 flex flex-col">
          <div className="px-5 py-5 flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "var(--sd-ink)", color: "#fff" }}
            >
              <Anchor size={14} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
                Station Satcom
              </span>
              <span className="text-[10px]" style={{ color: "var(--sd-muted)" }}>Müşteri Paneli</span>
            </div>
          </div>

          <div className="sd-divider" />

          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <span className="sd-eyebrow">Filo</span>
            <span className="sd-mono text-[10px]" style={{ color: "var(--sd-muted)" }}>{ships.length}</span>
          </div>

          <nav className="flex-1 overflow-auto pb-4">
            {ships.map((s) => {
              const active = s.id === activeId;
              return (
                <div
                  key={s.id}
                  className={`sd-nav-item ${active ? "active" : ""}`}
                  onClick={() => setActiveId(s.id)}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-[13px] truncate"
                      style={{ fontWeight: active ? 600 : 500, letterSpacing: "-0.005em" }}
                    >
                      {s.name}
                    </span>
                    <span className="sd-mono text-[10.5px]" style={{ color: "var(--sd-muted)" }}>
                      {s.kit}
                    </span>
                  </div>
                  <span
                    className="sd-dot"
                    style={{
                      backgroundColor:
                        s.status === "active" ? "var(--sd-success)" : "var(--sd-hairline-strong)",
                    }}
                  />
                </div>
              );
            })}
          </nav>

          <div className="sd-divider" />

          <div className="p-4 flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold"
              style={{ backgroundColor: "var(--sd-ink)", color: "#fff" }}
            >
              MA
            </div>
            <div className="flex flex-col leading-tight min-w-0 flex-1">
              <span className="text-[12.5px] font-medium truncate">Mavi Armatörlük</span>
              <span className="text-[10.5px] truncate" style={{ color: "var(--sd-muted)" }}>
                ops@maviarmador.com
              </span>
            </div>
            <button className="sd-icon-btn" aria-label="Ayarlar">
              <Settings size={14} />
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="px-10 py-5 flex items-center gap-4 border-b" style={{ borderColor: "var(--sd-hairline)" }}>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div
                className="flex items-center gap-2 w-full px-3 h-9 rounded-lg border"
                style={{ borderColor: "var(--sd-hairline)", backgroundColor: "var(--sd-surface)" }}
              >
                <Search size={14} style={{ color: "var(--sd-muted)" }} />
                <input
                  className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-[var(--sd-muted)]"
                  placeholder="Gemi veya KIT ara"
                />
                <span
                  className="sd-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{ color: "var(--sd-muted)", border: "1px solid var(--sd-hairline)" }}
                >
                  ⌘K
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="sd-pill">
                Mayıs 2026
                <ChevronDown size={12} />
              </button>
              <button className="sd-icon-btn" aria-label="Bildirimler">
                <Bell size={14} />
              </button>
              <button className="sd-icon-btn" aria-label="Destek">
                <LifeBuoy size={14} />
              </button>
            </div>
          </header>

          {/* Page header */}
          <section className="px-10 pt-10 pb-6 flex items-end justify-between gap-6">
            <div className="flex flex-col gap-2">
              <span className="sd-eyebrow">Filo</span>
              <h1 className="text-[28px] font-semibold leading-none" style={{ letterSpacing: "-0.025em" }}>
                Genel Bakış
              </h1>
            </div>
            <div className="flex items-end gap-10">
              <div className="flex flex-col items-end gap-1">
                <span className="sd-eyebrow">Bu ay toplam</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="sd-tnum text-[28px] font-semibold leading-none" style={{ letterSpacing: "-0.02em" }}>
                    {fmtGb(total)}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--sd-muted)" }}>GB</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="sd-eyebrow">Aktif gemi</span>
                <span className="sd-tnum text-[28px] font-semibold leading-none" style={{ letterSpacing: "-0.02em" }}>
                  {ships.filter((s) => s.status === "active").length}
                  <span className="text-[14px]" style={{ color: "var(--sd-muted)", fontWeight: 400 }}>
                    {" "}/ {ships.length}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Filter bar */}
          <div className="px-10 pb-6 flex items-center gap-3">
            <div className="sd-segment">
              <button className={filter === "hepsi" ? "active" : ""} onClick={() => setFilter("hepsi")}>
                Hepsi
              </button>
              <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>
                Aktif
              </button>
              <button className={filter === "idle" ? "active" : ""} onClick={() => setFilter("idle")}>
                Sessiz
              </button>
            </div>
            <span className="sd-mono text-[11px]" style={{ color: "var(--sd-muted)" }}>
              {visible.length} gemi
            </span>
            <div className="flex-1" />
            <button className="sd-icon-btn" aria-label="Görünüm">
              <LayoutGrid size={14} />
            </button>
          </div>

          {/* Cards grid */}
          <section className="px-10 pb-12">
            <div
              className="grid gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
            >
              {visible.map((s) => (
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
