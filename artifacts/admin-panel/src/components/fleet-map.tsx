import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Maximize2, Minimize2 } from "lucide-react";

import {
  useGetFleetMap,
  getGetFleetMapQueryKey,
  type FleetMapPoint,
} from "@workspace/api-client-react";

type Source = FleetMapPoint["source"];

const SOURCE_COLOR: Record<Source, string> = {
  satcom: "#a4400a",
  starlink: "#2563a6",
  leobridge: "#3a3aa6",
};
const SOURCE_LABEL: Record<Source, string> = {
  satcom: "Satcom",
  starlink: "Starlink",
  leobridge: "Norway",
};
const SOURCE_DETAIL: Record<Source, (k: string) => string> = {
  satcom: (k) => `/kits/${encodeURIComponent(k)}`,
  starlink: (k) => `/starlink/${encodeURIComponent(k)}`,
  leobridge: (k) => `/norway/${encodeURIComponent(k)}`,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const SHIP_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" aria-hidden="true"><path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/></svg>`;

function makePinIcon(source: Source, online: boolean | null | undefined) {
  const color = SOURCE_COLOR[source];
  const isOffline = online === false;
  const dotColor = isOffline ? "#9a9a93" : color;
  const haloOpacity = isOffline ? 0 : 0.22;
  const html = `
    <span class="ssa-fleet-pin__halo" style="background:${color};opacity:${haloOpacity};"></span>
    <span class="ssa-fleet-pin__dot" style="background:${dotColor};">${SHIP_SVG}</span>
  `;
  return L.divIcon({
    className: `ssa-fleet-pin ssa-fleet-pin--${source}${isOffline ? " ssa-fleet-pin--offline" : ""}`,
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// ---- Hooks ----

/**
 * CSS position:fixed overlay ile görsel tam ekran.
 * Browser Fullscreen API kullanılmaz — iframe içinde tile render bozulduğu için.
 * Container div asla DOM'da taşınmaz; sadece CSS değişir.
 */
function useMapExpanded() {
  const [expanded, setExpanded] = useState(false);
  const enter = useCallback(() => setExpanded(true), []);
  const exit = useCallback(() => setExpanded(false), []);

  // ESC ile kapat
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Body scroll kilidi
  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [expanded]);

  return { expanded, enter, exit };
}

const REFETCH_MS = 60_000;

function useCountdown(dataUpdatedAt: number): number {
  const [remaining, setRemaining] = useState<number>(REFETCH_MS / 1000);
  useEffect(() => {
    const calc = () => {
      if (!dataUpdatedAt) return;
      const elapsed = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      setRemaining(Math.max(0, Math.ceil(REFETCH_MS / 1000 - elapsed)));
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);
  return remaining;
}

function useJustUpdated(isFetching: boolean): boolean {
  const [justUpdated, setJustUpdated] = useState(false);
  const prevRef = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (prevRef.current && !isFetching) {
      setJustUpdated(true);
      t = setTimeout(() => setJustUpdated(false), 2000);
      prevRef.current = false;
    } else {
      prevRef.current = isFetching;
    }
    return () => clearTimeout(t);
  }, [isFetching]);
  return justUpdated;
}

// ---- Props ----

export interface FleetMapProps {
  heightClass?: string;
  hideTiles?: boolean;
}

// ---- Component ----

export default function FleetMap({
  heightClass = "h-[360px] sm:h-[440px]",
  hideTiles = false,
}: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  const {
    data: points,
    isLoading,
    isError,
    isFetching,
    dataUpdatedAt,
  } = useGetFleetMap({
    query: {
      queryKey: getGetFleetMapQueryKey(),
      staleTime: REFETCH_MS,
      refetchInterval: REFETCH_MS,
    },
  });

  const { expanded, enter, exit } = useMapExpanded();
  const remaining = useCountdown(dataUpdatedAt);
  const justUpdated = useJustUpdated(isFetching);

  const lastUpdateStr =
    dataUpdatedAt > 0
      ? new Date(dataUpdatedAt).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  // ---- Map init — bir kez ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [25, 20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      worldCopyJump: true,
      scrollWheelZoom: true,
      attributionControl: false,
    });
    if (!hideTiles) {
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { subdomains: ["a", "b", "c", "d"] },
      ).addTo(map);
    }
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 48,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const size = n >= 100 ? 44 : n >= 10 ? 36 : 30;
        return L.divIcon({
          html: `<div class="ssa-fleet-cluster__inner">${n}</div>`,
          className: "ssa-fleet-cluster",
          iconSize: [size, size],
        });
      },
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;

    // ResizeObserver: container boyutu değişince invalidateSize
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false, pan: false });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Marker güncellemesi ----
  const visiblePoints = useMemo(
    () =>
      (points ?? []).filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          Math.abs(p.lat) <= 90 &&
          Math.abs(p.lng) <= 180,
      ),
    [points],
  );

  useEffect(() => {
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;
    cluster.clearLayers();
    if (visiblePoints.length === 0) return;
    const markers: L.Marker[] = [];
    for (const p of visiblePoints) {
      const icon = makePinIcon(p.source, p.online ?? null);
      const m = L.marker([p.lat, p.lng], { icon });
      const titleLine = p.shipName
        ? `<div class="ssa-fleet-popup__title">${escapeHtml(p.shipName)}</div>
           <div class="ssa-fleet-popup__sub">${escapeHtml(p.kitNo)}</div>`
        : `<div class="ssa-fleet-popup__title">${escapeHtml(p.kitNo)}</div>`;
      const href = SOURCE_DETAIL[p.source](p.kitNo);
      m.bindPopup(
        `<div class="ssa-fleet-popup" data-source="${p.source}">
          ${titleLine}
          <a class="ssa-fleet-popup__link" data-ssa-fleet-href="${href}" href="${href}">Detayı Aç</a>
        </div>`,
        { closeButton: false, maxWidth: 240 },
      );
      markers.push(m);
    }
    cluster.addLayers(markers);
    if (visiblePoints.length === 1) {
      map.setView([visiblePoints[0].lat, visiblePoints[0].lng], 5, {
        animate: false,
      });
    } else if (visiblePoints.length > 1) {
      try {
        const b = cluster.getBounds();
        if (b.isValid()) {
          map.fitBounds(b, { padding: [32, 32], maxZoom: 5, animate: false });
        }
      } catch {
        /* ignore */
      }
    }
  }, [visiblePoints]);

  // ---- SPA navigasyon — popup linkleri ----
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        "a[data-ssa-fleet-href]",
      );
      if (!a) return;
      const href = a.getAttribute("data-ssa-fleet-href");
      if (!href) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      if (expanded) exit();
      window.history.pushState(null, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [expanded, exit]);

  // ---- Ship list — gemi chip'e tıklanınca fly-to ----
  const handleShipClick = useCallback(
    (p: FleetMapPoint) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 5), { animate: true, duration: 0.8 });
    },
    [],
  );

  const empty = !isLoading && visiblePoints.length === 0;

  // ---- Status strip ----
  const statusContent = isFetching && !isLoading ? (
    <span className="animate-pulse">Güncelleniyor…</span>
  ) : justUpdated ? (
    <span style={{ color: "#1f8a65" }}>✓ Güncellendi</span>
  ) : lastUpdateStr ? (
    <span>Son Güncelleme: {lastUpdateStr} · {remaining} Sn Sonra Yenilenecek</span>
  ) : (
    <span>Konumlar Bekleniyor…</span>
  );

  // ---- Render ----
  // Önemli: containerRef div asla DOM'da taşınmaz.
  // Wrapper CSS'i değişerek normal ↔ fullscreen geçişi yapılır.
  // Bu sayede React reconciler ve Leaflet state çakışmaz.
  return (
    <>
      {/* ============================================================
          WRAPPER: normal modda relative, fullscreen modda fixed inset-0
          ============================================================ */}
      <div
        style={
          expanded
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                background: "var(--sd-bg, #f7f7f4)",
              }
            : { position: "relative" }
        }
      >
        {/* ---- Fullscreen üst bar ---- */}
        {expanded && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              height: 44,
              borderBottom: "1px solid var(--sd-hairline, #e6e5e0)",
              background: "var(--sd-bg, #f7f7f4)",
            }}
          >
            {/* Sol: başlık + durum */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--sd-fg, #26251e)",
                }}
              >
                Filo Haritası
              </span>
              <span style={{ color: "var(--sd-hairline-strong, #c9c8c2)", fontSize: 13 }}>·</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--sd-muted, #9a9a8a)",
                }}
              >
                {statusContent}
              </span>
            </div>
            {/* Sağ: terminal sayısı + kapat */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--sd-muted, #9a9a8a)",
                }}
              >
                {visiblePoints.length} Terminal
              </span>
              <button
                type="button"
                onClick={exit}
                title="Kapat (Esc)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  border: "1.5px solid #b8b7b0",
                  background: "#f7f7f4",
                  color: "#26251e",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(38,37,30,0.10)",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#eeeee9";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#f7f7f4";
                }}
              >
                <Minimize2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}

        {/* ---- Harita container ---- */}
        {/* position:relative sarmalayıcı: tam ekran butonu konumlandırması için */}
        <div style={expanded ? { flex: 1, position: "relative", minHeight: 0 } : { position: "relative" }}>
          <div
            ref={containerRef}
            className={[
              "ssa-leaflet ssa-fleet-map w-full",
              expanded ? "" : `rounded-lg overflow-hidden ${heightClass}`,
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              expanded
                ? { width: "100%", height: "100%", position: "absolute", inset: 0 }
                : undefined
            }
            aria-label="Filo haritası"
          />

          {/* Normal modda tam ekran butonu */}
          {!expanded && (
            <button
              type="button"
              onClick={enter}
              title="Tam Ekran (Esc ile çık)"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 7,
                border: "1.5px solid #b8b7b0",
                background: "#f7f7f4",
                color: "#26251e",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(38,37,30,0.12)",
                transition: "background 150ms, border-color 150ms",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "#eeeee9";
                el.style.borderColor = "#8a8a82";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "#f7f7f4";
                el.style.borderColor = "#b8b7b0";
              }}
            >
              <Maximize2 size={15} strokeWidth={2.2} />
            </button>
          )}

          {/* Yükleniyor / hata / boş overlay'ler */}
          {isLoading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
              Konumlar Yükleniyor…
            </div>
          )}
          {isError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
              Konum Verisi Alınamadı.
            </div>
          )}
          {empty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground px-6 text-center">
              Henüz Konum Verisi Olan Terminal Yok.
            </div>
          )}
        </div>

        {/* ---- Fullscreen alt gemi listesi ---- */}
        {expanded && visiblePoints.length > 0 && (
          <ShipRail points={visiblePoints} onSelect={handleShipClick} />
        )}
      </div>

      {/* ---- Normal mod alt bilgi şeridi ---- */}
      {!expanded && (
        <div
          className="mt-2 px-0.5 text-[11px] font-mono tabular-nums"
          style={{ color: "var(--sd-muted)" }}
        >
          {statusContent}
        </div>
      )}
    </>
  );
}

// ---- Ship Rail — tam ekran alt gemi listesi ----

function ShipRail({
  points,
  onSelect,
}: {
  points: FleetMapPoint[];
  onSelect: (p: FleetMapPoint) => void;
}) {
  // Sıralama: ship name'li önce (alfabetik), sonra kit no
  const sorted = useMemo(() => {
    return [...points].sort((a, b) => {
      const na = a.shipName ?? "";
      const nb = b.shipName ?? "";
      if (na && nb) return na.localeCompare(nb, "tr");
      if (na) return -1;
      if (nb) return 1;
      return a.kitNo.localeCompare(b.kitNo, "tr");
    });
  }, [points]);

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--sd-hairline, #e6e5e0)",
        background: "var(--sd-bg, #f7f7f4)",
        padding: "0 12px",
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 0,
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}
    >
      {sorted.map((p) => (
        <ShipChip key={`${p.source}:${p.kitNo}`} point={p} onSelect={onSelect} />
      ))}
    </div>
  );
}

const SOURCE_DOT_STYLE: Record<Source, React.CSSProperties> = {
  satcom:    { background: SOURCE_COLOR.satcom },
  starlink:  { background: SOURCE_COLOR.starlink },
  leobridge: { background: SOURCE_COLOR.leobridge },
};

function ShipChip({
  point,
  onSelect,
}: {
  point: FleetMapPoint;
  onSelect: (p: FleetMapPoint) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const label = point.shipName ?? point.kitNo;
  const sub = point.shipName ? point.kitNo : SOURCE_LABEL[point.source];
  const isOffline = point.online === false;

  return (
    <button
      type="button"
      onClick={() => onSelect(point)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${label} — haritada göster`}
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px",
        marginRight: 6,
        borderRadius: 8,
        border: `1px solid ${hovered ? "#b8b7b0" : "#e6e5e0"}`,
        background: hovered ? "#eeeee9" : "var(--sd-bg, #f7f7f4)",
        cursor: "pointer",
        transition: "background 120ms, border-color 120ms",
        whiteSpace: "nowrap",
      }}
    >
      {/* Renk nokta */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          opacity: isOffline ? 0.35 : 1,
          ...SOURCE_DOT_STYLE[point.source],
        }}
      />
      {/* Metin */}
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--sd-fg, #26251e)",
            lineHeight: 1,
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--sd-muted, #9a9a8a)",
            fontFamily: "var(--font-mono, monospace)",
            lineHeight: 1,
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}
