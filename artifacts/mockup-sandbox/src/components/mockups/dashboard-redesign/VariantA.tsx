import "./_group.css";
import { useMemo, useState } from "react";
import {
  Search,
  Sun,
  Moon,
  ChevronRight,
  Menu,
  X,
  Activity,
  HardDrive,
  CalendarClock,
  Wifi,
} from "lucide-react";
import {
  ships,
  summary,
  fmtGb,
  fmtInt,
  type Ship,
} from "./_mock";
import brandLight from "../../../assets/brand-light.png";
import brandDark from "../../../assets/brand-dark.png";
import toovLight from "../../../assets/toov-light.png";
import toovDark from "../../../assets/toov-dark.png";

function relTime(min?: number): string {
  if (min == null) return "—";
  if (min < 1) return "ŞİMDİ";
  if (min < 60) return `${min} DK ÖNCE`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} SA ÖNCE`;
  const d = Math.floor(h / 24);
  return `${d} GÜN ÖNCE`;
}

function fmtPeriod(p: string): string {
  if (p && p.length === 6) return `${p.slice(0, 4)}-${p.slice(4)}`;
  return p;
}

const SIGNAL_COLOR: Record<NonNullable<Ship["signal"]>, string> = {
  online: "#3a9b6e",
  degraded: "#d4a017",
  offline: "#c0392b",
};

function ShipRow({
  ship,
  active,
  onClick,
}: {
  ship: Ship;
  active: boolean;
  onClick: () => void;
}) {
  const sig = ship.signal ?? "online";
  return (
    <button
      onClick={onClick}
      className="group relative w-full flex items-center gap-2 pl-3 pr-2 py-2 text-left hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer"
      style={{
        borderLeft: active
          ? "2px solid hsl(var(--primary))"
          : "2px solid transparent",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: SIGNAL_COLOR[sig] }}
      />
      <span className="flex-1 min-w-0 truncate text-[12.5px] text-[hsl(var(--foreground))]">
        {ship.shipName}
      </span>
      <ChevronRight className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function Sidebar({
  query,
  setQuery,
  filtered,
  activeKit,
  onSelect,
  dark,
  onToggleDark,
  onClose,
  isDrawer,
}: {
  query: string;
  setQuery: (v: string) => void;
  filtered: Ship[];
  activeKit: string | null;
  onSelect: (k: string) => void;
  dark: boolean;
  onToggleDark: () => void;
  onClose?: () => void;
  isDrawer?: boolean;
}) {
  return (
    <aside
      className="flex flex-col h-full bg-[hsl(var(--background))] border-r border-[hsl(var(--border))]"
      style={{ width: 260 }}
    >
      <div className="h-20 flex items-center justify-between px-4 border-b border-[hsl(var(--border))] shrink-0">
        <img
          src={dark ? brandDark : brandLight}
          alt="Lacivert Teknoloji"
          className="max-h-12 w-auto object-contain"
        />
        {isDrawer && onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-[hsl(var(--secondary))] flex items-center justify-center"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Gemi veya KIT ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-8 pl-7 pr-2 rounded-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[12px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
          />
        </div>
      </div>

      <div className="px-4 pt-1 pb-1.5 flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
          Gemiler
        </span>
        <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums">
          {filtered.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
            Eşleşen gemi yok
          </div>
        ) : (
          filtered.map((s) => (
            <ShipRow
              key={s.kitNo}
              ship={s}
              active={activeKit === s.kitNo}
              onClick={() => onSelect(s.kitNo)}
            />
          ))
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between shrink-0">
        <img
          src={dark ? toovDark : toovLight}
          alt="TOOV"
          className="h-5 w-auto object-contain"
        />
        <button
          onClick={onToggleDark}
          className="w-8 h-8 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] flex items-center justify-center text-[hsl(var(--foreground))]"
          aria-label="Tema değiştir"
          title={dark ? "Açık tema" : "Koyu tema"}
        >
          {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}

function KpiCell({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex-1 px-5 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))] font-semibold">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-[22px] leading-none text-[hsl(var(--foreground))] tabular-nums">
          {value}
        </span>
        {sub && (
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function ShipCard({
  ship,
  active,
  onClick,
}: {
  ship: Ship;
  active: boolean;
  onClick: () => void;
}) {
  const sig = ship.signal ?? "online";
  const pct = ship.planGb ? Math.min(100, (ship.totalGib / ship.planGb) * 100) : null;
  return (
    <button
      onClick={onClick}
      className="group text-left flex flex-col rounded-xl border bg-[hsl(var(--card))] p-4 transition-all"
      style={{
        borderColor: active
          ? "hsl(var(--primary))"
          : "hsl(var(--border))",
        boxShadow: "none",
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.4)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = "hsl(var(--border))";
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] text-[hsl(var(--muted-foreground))] truncate uppercase tracking-[0.12em]">
          {ship.kitNo}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: SIGNAL_COLOR[sig] }}
          title={sig}
        />
      </div>

      <div
        className="mt-3 text-[15px] font-medium text-[hsl(var(--foreground))] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {ship.shipName}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] leading-none text-[hsl(var(--foreground))] tabular-nums">
          {fmtGb(ship.totalGib)}
        </span>
        <span className="text-[12px] text-[hsl(var(--muted-foreground))]">GB</span>
      </div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))] font-semibold">
        BU AY
      </div>

      {pct !== null && (
        <div className="mt-3">
          <div
            className="w-full bg-[hsl(var(--secondary))] overflow-hidden rounded-full"
            style={{ height: 1.5 }}
          >
            <div
              className="h-full"
              style={{
                width: `${pct}%`,
                background: "hsl(var(--primary))",
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums">
            <span>%{fmtGb(pct, 1)}</span>
            <span>{fmtInt(ship.planGb!)} GB PLAN</span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] text-[9.5px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))] font-semibold">
        SON GÖRÜLME: {relTime(ship.lastSeenMin)}
      </div>
    </button>
  );
}

export default function VariantA() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKit, setActiveKit] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredSidebar = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ships;
    return ships.filter(
      (s) =>
        s.shipName.toLowerCase().includes(q) ||
        s.kitNo.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className={"dr-theme " + (dark ? "dark" : "")}>
      <div className="flex h-screen w-full overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar
            query={query}
            setQuery={setQuery}
            filtered={filteredSidebar}
            activeKit={activeKit}
            onSelect={setActiveKit}
            dark={dark}
            onToggleDark={() => setDark((v) => !v)}
          />
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative h-full">
              <Sidebar
                query={query}
                setQuery={setQuery}
                filtered={filteredSidebar}
                activeKit={activeKit}
                onSelect={(k) => {
                  setActiveKit(k);
                  setDrawerOpen(false);
                }}
                dark={dark}
                onToggleDark={() => setDark((v) => !v)}
                onClose={() => setDrawerOpen(false)}
                isDrawer
              />
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Mobile header */}
          <div className="md:hidden flex items-center justify-between h-14 px-3 border-b border-[hsl(var(--border))] shrink-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-8 h-8 rounded-md hover:bg-[hsl(var(--secondary))] flex items-center justify-center"
              aria-label="Menü"
            >
              <Menu className="w-4 h-4" />
            </button>
            <img
              src={dark ? brandDark : brandLight}
              alt="Lacivert Teknoloji"
              className="h-8 w-auto object-contain"
            />
            <button
              onClick={() => setDark((v) => !v)}
              className="w-8 h-8 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] flex items-center justify-center"
              aria-label="Tema"
            >
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* KPI strip */}
          <div className="sticky top-0 z-10 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] shrink-0">
            <div className="flex items-stretch divide-x divide-[hsl(var(--border))]">
              <KpiCell
                label="Toplam KIT"
                value={fmtInt(summary.totalKits)}
                icon={<HardDrive className="w-3 h-3" />}
              />
              <KpiCell
                label="Toplam GB"
                value={fmtGb(summary.totalGib, 0)}
                sub="GB"
                icon={<Activity className="w-3 h-3" />}
              />
              <KpiCell
                label="Aktif Dönem"
                value={fmtPeriod(summary.activePeriod)}
                icon={<CalendarClock className="w-3 h-3" />}
              />
              <KpiCell
                label="Çevrimiçi / Çevrimdışı"
                value={`${summary.onlineCount}/${summary.offlineCount}`}
                icon={<Wifi className="w-3 h-3" />}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 sm:px-7 py-5">
              <div className="mb-5">
                <h1 className="text-[18px] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                  Gemiler
                </h1>
                <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
                  {fmtInt(summary.totalKits)} GEMİ · AKTİF DÖNEM {fmtPeriod(summary.activePeriod)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {ships.map((s) => (
                  <ShipCard
                    key={s.kitNo}
                    ship={s}
                    active={activeKit === s.kitNo}
                    onClick={() => setActiveKit(s.kitNo)}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
