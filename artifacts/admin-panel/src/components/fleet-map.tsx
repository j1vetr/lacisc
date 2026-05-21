import { useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
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
const SOURCE_LABEL: Record<Source, string> = {
  satcom: "SATCOM",
  starlink: "TOTOTHEO",
  leobridge: "NORWAY",
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

function makePinIcon(source: Source, online: boolean | null | undefined) {
  const color = SOURCE_COLOR[source];
  const ring = online === false ? "#9a9a93" : color;
  const haloOpacity = online === false ? 0 : 0.22;
  const html = `
    <span class="ssa-fleet-pin__halo" style="background:${color};opacity:${haloOpacity};"></span>
    <span class="ssa-fleet-pin__dot" style="background:${color};border-color:#fff;outline:1px solid ${ring};"></span>
  `;
  return L.divIcon({
    className: `ssa-fleet-pin ssa-fleet-pin--${source}${online === false ? " ssa-fleet-pin--offline" : ""}`,
    html,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
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
  heightClass = "h-[360px] sm:h-[440px]",
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
      scrollWheelZoom: false,
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
      const m = L.marker([p.lat, p.lng], { icon });
      const titleLine = p.shipName
        ? `<div class="ssa-fleet-popup__title">${escapeHtml(p.shipName)}</div>
           <div class="ssa-fleet-popup__sub">${escapeHtml(p.kitNo)}</div>`
        : `<div class="ssa-fleet-popup__title">${escapeHtml(p.kitNo)}</div>`;
      const accountLine = p.accountLabel
        ? `<div class="ssa-fleet-popup__row">Hesap · ${escapeHtml(p.accountLabel)}</div>`
        : "";
      const statusLine =
        p.online == null
          ? ""
          : `<div class="ssa-fleet-popup__row">${p.online ? "Çevrimiçi" : "Çevrimdışı"}${
              p.lastSeenAt ? ` · ${escapeHtml(relTime(p.lastSeenAt))}` : ""
            }</div>`;
      const href = SOURCE_DETAIL[p.source](p.kitNo);
      m.bindPopup(
        `
        <div class="ssa-fleet-popup" data-source="${p.source}">
          <div class="ssa-fleet-popup__badge" style="background:${SOURCE_COLOR[p.source]};">${SOURCE_LABEL[p.source]}</div>
          ${titleLine}
          ${accountLine}
          ${statusLine}
          <a class="ssa-fleet-popup__link" data-ssa-fleet-href="${href}" href="${href}">Detayı aç →</a>
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
          Henüz konum verisi olan terminal yok.
        </div>
      )}
      {/* Pin renk açıklaması — küçük editöryel legend */}
      <div className="absolute left-3 bottom-3 z-[400] flex items-center gap-3 rounded-md bg-card/90 backdrop-blur px-2.5 py-1.5 border border-border text-[10px] font-mono uppercase tracking-[0.10em] text-muted-foreground pointer-events-none">
        {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: SOURCE_COLOR[s] }}
            />
            {SOURCE_LABEL[s]}
          </span>
        ))}
      </div>
      {/* Link referansını TS unused-import uyarısı için tutuyoruz (gelecek geliştirme için hazır). */}
      <span className="hidden">{Link ? null : null}</span>
    </div>
  );
}
