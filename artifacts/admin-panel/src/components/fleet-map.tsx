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
 * Browser Fullscreen API KULLANILMAZ — iframe içinde tile render bozulduğu için.
 * ResizeObserver zaten containerRef'i dinliyor; boyut değişince invalidateSize
 * otomatik tetiklenir, tile'lar sorunsuz yenilenir.
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

  // Body scroll kilit — expanded'da arka plan scroll'u engelle
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

export interface FleetMapProps {
  heightClass?: string;
  hideTiles?: boolean;
}

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

  // Map init — bir kez.
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

    // ResizeObserver: container boyutu değişince (expanded/collapsed dahil)
    // Leaflet'i bildir — tile'lar yeniden hesaplanır.
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
        /* markercluster bounds nadiren atar */
      }
    }
  }, [visiblePoints]);

  // SPA navigasyon — popup linkine tıkla
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
      // Expanded moddan çık, sonra navigate et
      if (expanded) exit();
      window.history.pushState(null, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [expanded, exit]);

  const empty = !isLoading && visiblePoints.length === 0;

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
  return (
    <>
      {/* Normal mod: kart içinde standart harita */}
      <div className="relative">
        <div
          ref={containerRef}
          className={[
            "ssa-leaflet ssa-fleet-map w-full rounded-lg overflow-hidden",
            heightClass,
            !isLoading && isFetching
              ? "transition-opacity duration-700 opacity-[0.88]"
              : "transition-opacity duration-700 opacity-100",
          ].join(" ")}
          aria-label="Filo haritası"
        />

        {/* Tam ekran butonu */}
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

      {/* Alt bilgi şeridi — normal mod */}
      <div
        className="mt-2 px-0.5 text-[11px] font-mono tabular-nums"
        style={{ color: "var(--sd-muted)" }}
      >
        {statusContent}
      </div>

      {/* ============================================================
          CSS Tam Ekran Overlay — position:fixed; inset:0
          Browser Fullscreen API kullanılmaz: iframe içinde tile
          layer bozulduğu için. ResizeObserver containerRef'i
          dinliyor; boyut değişince invalidateSize otomatik çalışır.
          ============================================================ */}
      {expanded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            background: "var(--sd-bg, #f7f7f4)",
          }}
        >
          {/* Üst bilgi şeridi */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 20px",
              borderBottom: "1px solid var(--sd-hairline, #e6e5e0)",
              background: "var(--sd-bg, #f7f7f4)",
            }}
          >
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
              <span style={{ color: "var(--sd-hairline-strong, #c9c8c2)" }}>·</span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "var(--sd-muted)",
                }}
              >
                {statusContent}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "var(--sd-muted)",
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
                  boxShadow: "0 1px 3px rgba(38,37,30,0.12)",
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

          {/* Harita alanı — containerRef'i buraya portal et */}
          <ExpandedMapPortal
            containerRef={containerRef}
            mapRef={mapRef}
            isLoading={isLoading}
            isError={isError}
            empty={empty}
            isFetching={isFetching}
            isLoading_={isLoading}
          />
        </div>
      )}
    </>
  );
}

/**
 * Tam ekran modda containerRef'i (mevcut Leaflet instance) wrapper div içine
 * taşıyıp, kapandığında geri iade eder. DOM move ile map instance korunur;
 * yeni init gerekmez. ResizeObserver boyut değişimini yakalar → tile'lar güncellenir.
 */
function ExpandedMapPortal({
  containerRef,
  mapRef,
  isLoading,
  isError,
  empty,
  isFetching,
  isLoading_,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<L.Map | null>;
  isLoading: boolean;
  isError: boolean;
  empty: boolean;
  isFetching: boolean;
  isLoading_: boolean;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    const container = containerRef.current;
    const map = mapRef.current;
    if (!holder || !container || !map) return;

    // DOM'da mevcut pozisyonu kaydet (geri iade için)
    const parent = container.parentElement;
    const nextSibling = container.nextSibling;

    // Expanded wrapper'a taşı, boyutu tam doldur
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.borderRadius = "0";
    container.style.overflow = "hidden";
    // heightClass class'ını geçici olarak devre dışı bırak
    container.classList.remove("rounded-lg");
    holder.appendChild(container);

    // Leaflet yeni boyutu öğren
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false, pan: false });
    });

    return () => {
      // Kapat: container'ı eski yerine iade et
      container.style.width = "";
      container.style.height = "";
      container.style.borderRadius = "";
      container.style.overflow = "";
      container.classList.add("rounded-lg");
      if (parent) {
        if (nextSibling) {
          parent.insertBefore(container, nextSibling);
        } else {
          parent.appendChild(container);
        }
      }
      requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false });
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={holderRef}
      style={{ flex: 1, position: "relative", minHeight: 0 }}
    >
      {isLoading_ && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "var(--sd-muted)",
            pointerEvents: "none",
          }}
        >
          Konumlar Yükleniyor…
        </div>
      )}
      {isError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "var(--sd-muted)",
            pointerEvents: "none",
          }}
        >
          Konum Verisi Alınamadı.
        </div>
      )}
      {empty && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "var(--sd-muted)",
            textAlign: "center",
            padding: "0 24px",
            pointerEvents: "none",
          }}
        >
          Henüz Konum Verisi Olan Terminal Yok.
        </div>
      )}
      {!isLoading && isFetching && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            zIndex: 1000,
            fontSize: 11,
            fontFamily: "monospace",
            color: "var(--sd-muted)",
            background: "rgba(247,247,244,0.9)",
            border: "1px solid #e6e5e0",
            borderRadius: 5,
            padding: "3px 8px",
          }}
        >
          Güncelleniyor…
        </div>
      )}
    </div>
  );
}
