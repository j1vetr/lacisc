import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

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
const SOURCE_LABEL: Record<Source, string> = {
  satcom: "SATCOM",
  starlink: "STARLINK",
  leobridge: "NORWAY",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return "az önce";
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

// Gemi silüeti (Material "directions_boat" — 24×24). Inline SVG: external
// network/CSP'ye bağımlı değil, retina'da keskin kalır, beyaz dolgu ile
// renkli daire üstünde maksimum kontrast.
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

export interface FleetMapProps {
  /** Tailwind height class — örn. "h-[320px] sm:h-[420px]". */
  heightClass?: string;
  /** Test/CSP için harita arka planını gizleyip yalnız pinleri test etmek. */
  hideTiles?: boolean;
}

/**
 * Üç kaynaktan birleşik dünya filo haritası. Cluster pin'li; popup → KIT
 * detay sayfasına link. Müşteri yalnız atanmış KIT'lerini görür (backend
 * filtresi). Konum verisi olmayan KIT sessizce gizlenir.
 */
export default function FleetMap({
  heightClass = "h-[300px] sm:h-[420px]",
  hideTiles = false,
}: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  const { data: points, isLoading, isError } = useGetFleetMap({
    query: {
      queryKey: getGetFleetMapQueryKey(),
      // 60 sn: tipik konum güncelleme aralığından kısa, dashboard ile aynı tonda.
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });

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

    // Resize observer — sd-card içinde lazy mount edildiğinde leaflet'in
    // boyut hesabı yarım kalabiliyor; container yeniden ölçülürse invalidate.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
    // Mount-once on purpose; hideTiles değişimi yeniden mount gerektirmez (testlerde sabit).
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

  // Marker'ları her veri değişiminde yeniden kur.
  useEffect(() => {
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;
    cluster.clearLayers();
    if (visiblePoints.length === 0) return;
    const markers: L.Marker[] = [];
    for (const p of visiblePoints) {
      const icon = makePinIcon(p.source, p.online ?? null);
      const title = p.shipName ? p.shipName : p.kitNo;
      // keyboard:true → leaflet pin'e tabindex=0 ekler, Enter popup'ı açar (a11y).
      const m = L.marker([p.lat, p.lng], { icon, keyboard: true, alt: title });
      const sourceLabel = SOURCE_LABEL[p.source];
      const acct = p.accountLabel
        ? ` · Hesap: ${escapeHtml(p.accountLabel)}`
        : "";
      const href = SOURCE_DETAIL[p.source](p.kitNo);
      m.bindPopup(
        `
        <div class="ssa-fleet-popup" data-source="${p.source}">
          <div class="ssa-fleet-popup__title">${escapeHtml(title)}</div>
          <div class="ssa-fleet-popup__sub">KIT: ${escapeHtml(p.kitNo)} · ${sourceLabel}${acct}</div>
          <div class="ssa-fleet-popup__sub">Son konum: ${escapeHtml(relTime(p.lastSeenAt))}</div>
          <a class="ssa-fleet-popup__link" data-ssa-fleet-href="${href}" href="${href}">Detaya git →</a>
        </div>
        `,
        { closeButton: false, maxWidth: 240 },
      );
      markers.push(m);
    }
    cluster.addLayers(markers);
    // İlk yüklemede içeriği toparla (bounds): tek nokta varsa center'a, çoklu
    // ise tüm noktaları içerecek şekilde fit et.
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
        // markercluster bounds nadiren atar — yoksay.
      }
    }
  }, [visiblePoints]);

  // Popup linkine tıklandığında wouter ile SPA navigasyonu yap (window reload yok).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest<HTMLAnchorElement>("a[data-ssa-fleet-href]");
      if (!a) return;
      const href = a.getAttribute("data-ssa-fleet-href");
      if (!href) return;
      // Modifier'lar (cmd/ctrl/middle click) varsayılan davranışa bırak.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      // wouter setLocation pushState — react-query state korunur.
      window.history.pushState(null, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  const empty = !isLoading && visiblePoints.length === 0;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`ssa-leaflet ssa-fleet-map w-full ${heightClass} rounded-lg overflow-hidden`}
        aria-label="Filo haritası"
      />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
          Konumlar yükleniyor…
        </div>
      )}
      {isError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
          Konum verisi alınamadı.
        </div>
      )}
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground px-6 text-center">
          Henüz konum verisi alınan KIT yok — bir sonraki sync sonrasında burada
          gözükecekler.
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {visiblePoints.length} gemi haritada
      </p>
    </div>
  );
}
