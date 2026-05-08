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
  sourceLabel,
  type Ship,
} from "./_mock";

type SourceFilter = "all" | "satcom" | "starlink" | "leobridge";

function relTime(min?: number): string {
  if (min == null) return "—";
  if (min < 1) return "şimdi";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

const SOURCE_DOT: Record<Ship["source"], string> = {
  satcom: "var(--satcom-fg)",
  starlink: "var(--tototheo-fg)",
  leobridge: "var(--norway-fg)",
};

const SIGNAL_COLOR: Record<NonNullable<Ship["signal"]>, string> = {
  online: "#3a9b6e",
  degraded: "#d4a017",
  offline: "#c0392b",
};

function SourceBadge({ source }: { source: Ship["source"] }) {
  const map: Record<Ship["source"], { bg: string; fg: string; bd: string }> = {
    satcom: {
      bg: "var(--satcom-bg)",
      fg: "var(--satcom-fg)",
      bd: "var(--satcom-bd)",
    },
    starlink: {
      bg: "var(--tototheo-bg)",
      fg: "var(--tototheo-fg)",
      bd: "var(--tototheo-bd)",
    },
    leobridge: {
      bg: "var(--norway-bg)",
      fg: "var(--norway-fg)",
      bd: "var(--norway-bd)",
    },
  };
  const c = map[source];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-widest"
      style={{ background: c.bg, color: c.fg, borderColor: c.bd }}
    >
      {sourceLabel[source]}
    </span>
  );
}

function ShipRow({
  ship,
  active,
  onClick,
}: {
  ship: Ship;
  active: boolean;
  onClick: () => void;
}) {
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
        style={{ background: SOURCE_DOT[ship.source] }}
      />
      <span className="flex-1 min-w-0 truncate text-[12.5px] text-[hsl(var(--foreground))]">
        {ship.shipName}
      </span>
      <span className="font-mono text-[10.5px] text-[hsl(var(--muted-foreground))] tabular-nums">
        {fmtGb(ship.totalGib, 0)}
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
      <div className="h-14 flex items-center justify-between px-4 border-b border-[hsl(var(--border))] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded flex items-center justify-center font-mono text-[13px] font-bold shrink-0"
            style={{
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            L
          </div>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[hsl(var(--foreground))] truncate">
              LACİVERT
            </span>
            <span className="text-[9px] tracking-[0.22em] text-[hsl(var(--muted-foreground))] uppercase truncate">
              Teknoloji
            </span>
          </div>
        </div>
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
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
            Partner
          </span>
          <span className="font-mono text-[12px] font-bold tracking-[0.18em] text-[hsl(var(--foreground))]">
            TOOV
          </span>
        </div>
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

function FilterPill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors"
      style={{
        background: active ? "hsl(var(--card))" : "transparent",
        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
        color: active
          ? "hsl(var(--foreground))"
          : "hsl(var(--muted-foreground))",
      }}
    >
      {children}
      <span className="font-mono text-[10px] tabular-nums opacity-70">
        {count}
      </span>
    </button>
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
        <div className="flex items-center gap-2 min-w-0">
          <SourceBadge source={ship.source} />
          <span className="font-mono text-[10.5px] text-[hsl(var(--muted-foreground))] truncate">
            {ship.kitNo}
          </span>
        </div>
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
        Bu Ay
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
            <span>{fmtInt(ship.planGb!)} GB plan</span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] text-[10.5px] text-[hsl(var(--muted-foreground))]">
        Son görülme: {relTime(ship.lastSeenMin)}
      </div>
    </button>
  );
}

export default function VariantA() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>("all");
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

  const filteredCards = useMemo(() => {
    if (filter === "all") return ships;
    return ships.filter((s) => s.source === filter);
  }, [filter]);

  const counts = {
    all: ships.length,
    satcom: summary.satcomKits,
    starlink: summary.starlinkKits,
    leobridge: summary.norwayKits,
  };

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
          <div className="md:hidden flex items-center justify-between h-12 px-3 border-b border-[hsl(var(--border))] shrink-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-8 h-8 rounded-md hover:bg-[hsl(var(--secondary))] flex items-center justify-center"
              aria-label="Menü"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold"
                style={{
                  background: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                }}
              >
                L
              </div>
              <span className="text-[11px] font-semibold tracking-[0.18em]">
                LACİVERT
              </span>
            </div>
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
                value={summary.activePeriod}
                icon={<CalendarClock className="w-3 h-3" />}
              />
              <KpiCell
                label="Çevrimiçi / Çevrimdışı"
                value={`${summary.onlineCount}/${summary.offlineCount}`}
                sub={`${summary.degradedCount} uyarı`}
                icon={<Wifi className="w-3 h-3" />}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 sm:px-7 py-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h1 className="text-[18px] font-semibold tracking-tight text-[hsl(var(--foreground))]">
                    Filo
                  </h1>
                  <p className="text-[11.5px] text-[hsl(var(--muted-foreground))] mt-0.5">
                    {fmtInt(filteredCards.length)} terminal · aktif dönem{" "}
                    {summary.activePeriod}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FilterPill
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                    count={counts.all}
                  >
                    Tümü
                  </FilterPill>
                  <FilterPill
                    active={filter === "satcom"}
                    onClick={() => setFilter("satcom")}
                    count={counts.satcom}
                  >
                    Satcom
                  </FilterPill>
                  <FilterPill
                    active={filter === "starlink"}
                    onClick={() => setFilter("starlink")}
                    count={counts.starlink}
                  >
                    Tototheo
                  </FilterPill>
                  <FilterPill
                    active={filter === "leobridge"}
                    onClick={() => setFilter("leobridge")}
                    count={counts.leobridge}
                  >
                    Norway
                  </FilterPill>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredCards.map((s) => (
                  <ShipCard
                    key={s.kitNo}
                    ship={s}
                    active={activeKit === s.kitNo}
                    onClick={() => setActiveKit(s.kitNo)}
                  />
                ))}
              </div>

              {filteredCards.length === 0 && (
                <div className="border border-dashed border-[hsl(var(--border))] rounded-xl py-16 text-center text-[12px] text-[hsl(var(--muted-foreground))]">
                  Bu filtreyle eşleşen gemi yok.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
