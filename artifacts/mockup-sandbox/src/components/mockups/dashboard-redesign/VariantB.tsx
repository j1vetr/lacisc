import "./_group.css";
import { useMemo, useState } from "react";
import {
  Search,
  Sun,
  Moon,
  RefreshCw,
  ArrowRight,
  Menu,
  X,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import {
  ships,
  summary,
  fmtGb,
  fmtInt,
  sourceLabel,
  type Ship,
} from "./_mock";

type Source = Ship["source"];

const SOURCE_ORDER: Source[] = ["starlink", "satcom", "leobridge"];

function sourceVar(src: Source) {
  if (src === "starlink") return { bg: "var(--tototheo-bg)", fg: "var(--tototheo-fg)", bd: "var(--tototheo-bd)" };
  if (src === "satcom") return { bg: "var(--satcom-bg)", fg: "var(--satcom-fg)", bd: "var(--satcom-bd)" };
  return { bg: "var(--norway-bg)", fg: "var(--norway-fg)", bd: "var(--norway-bd)" };
}

function SourceBadge({ src }: { src: Source }) {
  const c = sourceVar(src);
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-widest border"
      style={{ background: c.bg, color: c.fg, borderColor: c.bd }}
    >
      {sourceLabel[src]}
    </span>
  );
}

function SourceDot({ src }: { src: Source }) {
  const c = sourceVar(src);
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: c.fg }}
    />
  );
}

function SignalPill({ signal }: { signal?: Ship["signal"] }) {
  const map = {
    online: { label: "Çevrimiçi", bg: "rgb(34 197 94 / 0.12)", fg: "rgb(21 128 61)", bd: "rgb(34 197 94 / 0.35)", icon: <Wifi className="w-3 h-3" /> },
    degraded: { label: "Düşük sinyal", bg: "rgb(234 179 8 / 0.14)", fg: "rgb(161 98 7)", bd: "rgb(234 179 8 / 0.4)", icon: <AlertTriangle className="w-3 h-3" /> },
    offline: { label: "Çevrimdışı", bg: "rgb(239 68 68 / 0.12)", fg: "rgb(185 28 28)", bd: "rgb(239 68 68 / 0.35)", icon: <WifiOff className="w-3 h-3" /> },
  } as const;
  const k = (signal ?? "online") as keyof typeof map;
  const t = map[k];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ background: t.bg, color: t.fg, borderColor: t.bd }}
    >
      {t.icon}
      {t.label}
    </span>
  );
}

function fmtLastSeen(min?: number) {
  if (min == null) return "—";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center font-mono text-[15px] font-semibold"
        style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
      >
        L
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[12px] font-semibold tracking-[0.14em] text-[hsl(var(--foreground))]">
          LACİVERT
        </span>
        <span className="text-[10px] tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          TEKNOLOJİ
        </span>
      </div>
    </div>
  );
}

function ToovWordmark() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">
      <span>Partner</span>
      <span className="font-semibold text-[hsl(var(--foreground))] tracking-[0.3em]">TOOV</span>
    </div>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
      aria-label="Tema değiştir"
      title={dark ? "Aydınlık tema" : "Karanlık tema"}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function ShipCard({ ship }: { ship: Ship }) {
  const pct = ship.planGb ? Math.min((ship.totalGib / ship.planGb) * 100, 100) : 0;
  const overWarn = pct > 80 && pct <= 95;
  const overCrit = pct > 95;
  const barColor = overCrit
    ? "hsl(var(--destructive))"
    : overWarn
    ? "hsl(var(--primary))"
    : "hsl(var(--primary))";
  const barOpacity = overCrit || overWarn ? 1 : 0.85;

  return (
    <div
      className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 transition-all hover:ring-1 hover:ring-[hsl(var(--primary))]/30 hover:border-[hsl(var(--primary))]/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-medium tracking-tight text-[hsl(var(--foreground))] truncate">
            {ship.shipName}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 min-w-0">
            <SourceBadge src={ship.source} />
            <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))] truncate">
              {ship.kitNo}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-3xl tracking-tight text-[hsl(var(--foreground))] tabular-nums">
            {fmtGb(ship.totalGib)}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] mt-1">
            GB · Bu Ay
          </div>
        </div>
      </div>

      <div className="mt-5 min-h-[34px]">
        {ship.planGb ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
              <span>
                <span className="text-[hsl(var(--foreground))]">{fmtGb(ship.totalGib, 0)}</span>
                {" / "}
                {fmtInt(ship.planGb)} GB
              </span>
              <span
                style={{
                  color: overCrit
                    ? "hsl(var(--destructive))"
                    : overWarn
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                %{fmtGb(pct, 0)}
              </span>
            </div>
            <div className="relative h-1.5 bg-[hsl(var(--secondary))] rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{ width: `${pct}%`, background: barColor, opacity: barOpacity }}
              />
            </div>
          </div>
        ) : (
          <div className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))] pt-2">
            Sınırsız Plan
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[hsl(var(--border))] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <SignalPill signal={ship.signal} />
          <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))] truncate">
            Son görülme: {fmtLastSeen(ship.lastSeenMin)}
          </span>
        </div>
        <button className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors shrink-0">
          Detay
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Sidebar({
  query,
  setQuery,
  activeKit,
  setActiveKit,
  dark,
  setDark,
  inDrawer = false,
  onClose,
}: {
  query: string;
  setQuery: (s: string) => void;
  activeKit: string | null;
  setActiveKit: (k: string | null) => void;
  dark: boolean;
  setDark: (d: boolean) => void;
  inDrawer?: boolean;
  onClose?: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ships;
    return ships.filter(
      (s) =>
        s.shipName.toLowerCase().includes(q) ||
        s.kitNo.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map: Record<Source, Ship[]> = { starlink: [], satcom: [], leobridge: [] };
    for (const s of filtered) map[s.source].push(s);
    return map;
  }, [filtered]);

  return (
    <aside
      className="flex flex-col h-full w-[280px] shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--background))]"
    >
      <div className="px-5 h-16 flex items-center justify-between border-b border-[hsl(var(--border))] shrink-0">
        <Logo />
        {inDrawer && (
          <button
            onClick={onClose}
            className="md:hidden h-8 w-8 inline-flex items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-4 py-4 border-b border-[hsl(var(--border))] shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gemi veya KIT ara…"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 focus:border-[hsl(var(--primary))]/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {SOURCE_ORDER.map((src) => {
          const list = grouped[src];
          if (list.length === 0) return null;
          return (
            <div key={src} className="mb-5">
              <div className="px-3 pb-2 flex items-center gap-2">
                <SourceDot src={src} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                  {src === "starlink" ? "Tototheo Starlink" : src === "satcom" ? "Satcom" : "Norway"}
                </span>
                <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                  ({list.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {list.map((s) => {
                  const active = activeKit === s.kitNo;
                  return (
                    <button
                      key={s.kitNo}
                      onClick={() => setActiveKit(s.kitNo)}
                      className={
                        "w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition-colors " +
                        (active
                          ? "bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30"
                          : "hover:bg-[hsl(var(--secondary))] border border-transparent")
                      }
                    >
                      <SourceDot src={s.source} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[hsl(var(--foreground))] truncate leading-tight">
                          {s.shipName}
                        </div>
                        <div className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] truncate mt-0.5">
                          {s.kitNo}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
            Sonuç bulunamadı.
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-[hsl(var(--border))] flex items-center justify-between shrink-0">
        <ToovWordmark />
        <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
      </div>
    </aside>
  );
}

export default function VariantB() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKit, setActiveKit] = useState<string | null>(ships[0]?.kitNo ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const periodLabel = "Mayıs 2026";

  return (
    <div className={"dr-theme " + (dark ? "dark" : "")}>
      <div className="min-h-screen flex">
        {/* Desktop sidebar */}
        <div className="hidden md:flex h-screen sticky top-0">
          <Sidebar
            query={query}
            setQuery={setQuery}
            activeKit={activeKit}
            setActiveKit={setActiveKit}
            dark={dark}
            setDark={setDark}
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
                activeKit={activeKit}
                setActiveKit={(k) => {
                  setActiveKit(k);
                  setDrawerOpen(false);
                }}
                dark={dark}
                setDark={setDark}
                inDrawer
                onClose={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Mobile top bar */}
          <div className="md:hidden h-14 px-4 border-b border-[hsl(var(--border))] flex items-center justify-between bg-[hsl(var(--background))] sticky top-0 z-20">
            <button
              onClick={() => setDrawerOpen(true)}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
              aria-label="Menü"
            >
              <Menu className="w-4 h-4" />
            </button>
            <Logo />
            <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </div>

          <div className="px-6 lg:px-10 py-8 lg:py-10 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-3xl lg:text-4xl font-medium tracking-tight text-[hsl(var(--foreground))]">
                  Panel
                </h1>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  {periodLabel} · {fmtInt(summary.totalKits)} gemi · son senkron 12 dk önce
                </p>
              </div>
              <div className="hidden md:flex items-center gap-5">
                <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.18em]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[hsl(var(--muted-foreground))]">Çevrimiçi</span>
                    <span className="font-mono text-[hsl(var(--foreground))]">{summary.onlineCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span className="text-[hsl(var(--muted-foreground))]">Düşük sinyal</span>
                    <span className="font-mono text-[hsl(var(--foreground))]">{summary.degradedCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-[hsl(var(--muted-foreground))]">Çevrimdışı</span>
                    <span className="font-mono text-[hsl(var(--foreground))]">{summary.offlineCount}</span>
                  </div>
                </div>
                <button
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                  aria-label="Yenile"
                  title="Yenile"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <ThemeToggle dark={dark} onToggle={() => setDark(!dark)} />
              </div>
            </div>

            {/* Mobile metric strip */}
            <div className="md:hidden mt-4 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.16em]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="font-mono text-[hsl(var(--foreground))]">{summary.onlineCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="font-mono text-[hsl(var(--foreground))]">{summary.degradedCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="font-mono text-[hsl(var(--foreground))]">{summary.offlineCount}</span>
              </div>
            </div>

            {/* Cards grid */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
              {ships.map((s) => (
                <ShipCard key={s.kitNo} ship={s} />
              ))}
            </div>

            <div className="mt-10 pt-6 border-t border-[hsl(var(--border))] flex items-center justify-between text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
              <span>Toplam {fmtGb(summary.totalGib, 1)} GB · {fmtInt(summary.totalKits)} terminal</span>
              <span>Veriler her 5 dakikada bir güncellenir</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
