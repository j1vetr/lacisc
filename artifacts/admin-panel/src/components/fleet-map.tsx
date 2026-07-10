import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Maximize2, Minimize2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

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

function useMapExpanded() {
  const [expanded, setExpanded] = useState(false);
  const enter = useCallback(() => setExpanded(true), []);
  const exit = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [expanded]);

  return { expanded, enter, exit };
}

// Verinin konumsal kaynaktan saatte bir geldiğini varsayarak,
// bir sonraki tam saate (xx:00) kalan süreyi göster.
// refetchInterval: 5 dk → saat başında yeni veri ~5 dk içinde yakalanır.
const REFETCH_MS = 5 * 60 * 1000;

function useNextHourCountdown(): string {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 0, 0);
      const ms = Math.max(0, next.getTime() - now.getTime());
      const totalSecs = Math.floor(ms / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setDisplay(
        `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
      );
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, []);
  return display;
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
  const { t, i18n } = useTranslation();
  /**
   * KURAL: containerRef ve sizerRef div'leri React ağacında ASLA yer değiştirmez.
   * Tek return yapısı kullanılır; hem normal hem fullscreen moda CSS değişimiyle geçilir.
   * Aksi hâlde React reconcile sırasında unmount + remount yapar → Leaflet yeniden
   * başlar, container boyutu 0 olur, tile isteği gitmez.
   *
   * sizerRef: boyut yönetimi (normal = heightClass Tailwind, fullscreen = flex:1)
   * containerRef: Leaflet map container — CSS'i asla değiştirilmez (sadece borderRadius)
   */
  const sizerRef = useRef<HTMLDivElement | null>(null);
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
  const nextHour = useNextHourCountdown();
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
      center: [42, 22],   // Türkiye / Doğu Akdeniz — filo yoğunluğu burada
      zoom: 3,
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
      // Sadece gerçekten üst üste binen marker'lar kümelenir.
      // Zoom ≥ 5'te kümeleme tamamen kapanır → her gemi ayrı pin.
      maxClusterRadius: (zoom: number) => {
        if (zoom >= 5) return 0;   // kümeleme yok
        if (zoom >= 4) return 20;  // çok yakınsa
        if (zoom >= 3) return 30;
        return 45;                 // dünya görünümünde
      },
      disableClusteringAtZoom: 5,
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

    // sizerRef boyutunu izle → invalidateSize
    const target = sizerRef.current;
    if (target) {
      const ro = new ResizeObserver(() => {
        map.invalidateSize({ animate: false, pan: false });
      });
      ro.observe(target);
      (map as unknown as Record<string, unknown>).__ro = ro;
    }

    return () => {
      const ro = (map as unknown as Record<string, unknown>).__ro as ResizeObserver | undefined;
      ro?.disconnect();
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
      const openDetailLabel = escapeHtml(t("Detayı Aç"));
      m.bindPopup(
        `<div class="ssa-fleet-popup" data-source="${p.source}">
          ${titleLine}
          <a class="ssa-fleet-popup__link" data-ssa-fleet-href="${href}" href="${href}">${openDetailLabel}</a>
        </div>`,
        { closeButton: false, maxWidth: 240 },
      );
      markers.push(m);
    }
    cluster.addLayers(markers);
    if (visiblePoints.length === 1) {
      map.setView([visiblePoints[0].lat, visiblePoints[0].lng], 5, { animate: false });
    } else if (visiblePoints.length > 1) {
      try {
        const b = cluster.getBounds();
        if (b.isValid()) {
          const lngSpan = b.getEast() - b.getWest();
          if (lngSpan <= 140) {
            // Gemiler makul bir bölgede → bounds'a sığdır
            map.fitBounds(b, { padding: [40, 40], maxZoom: 5, animate: false });
          } else {
            // Gemiler küresel yayılmış → Avrupa / Doğu Akdeniz merkez göster
            map.setView([42, 22], 3, { animate: false });
          }
        }
      } catch { /* ignore */ }
    }
  }, [visiblePoints, i18n.language]);

  // ---- SPA navigasyon ----
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

  // ---- Ship chip → fly-to ----
  const handleShipClick = useCallback((p: FleetMapPoint) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 5), { animate: true, duration: 0.8 });
  }, []);

  const empty = !isLoading && visiblePoints.length === 0;

  const statusContent = isFetching && !isLoading ? (
    <span className="animate-pulse">{t("Güncelleniyor…")}</span>
  ) : justUpdated ? (
    <span style={{ color: "#1f8a65" }}>{t("✓ Güncellendi")}</span>
  ) : lastUpdateStr ? (
    <span>{t("Son Güncelleme:")} {lastUpdateStr} · {nextHour} {t("Sonra Yenilenecek")}</span>
  ) : (
    <span>{t("Konumlar Bekleniyor…")}</span>
  );

  // ---- Render ----
  //
  // TEK RETURN: containerRef + sizerRef her iki modda aynı ağaç pozisyonunda.
  //
  // Yapı (her zaman):
  //   outerWrapper
  //     [fullscreen: topBar]
  //     sizerRef            ← boyut CSS değişir, konum DEĞİŞMEZ
  //       containerRef      ← Leaflet buna bağlı, CSS'i asla değişmez
  //       [normal: fsBtn]
  //       overlays
  //     [fullscreen: ShipRail]
  //   [normal: statusStrip]
  return (
    <>
      {/* outerWrapper: normal modda etkisiz div, fullscreen modda fixed overlay */}
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
            : undefined
        }
      >
        {/* Fullscreen üst bar */}
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
                {t("Filo Haritası")}
              </span>
              <span style={{ color: "#c9c8c2", fontSize: 13 }}>·</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--sd-muted, #9a9a8a)" }}>
                {statusContent}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--sd-muted, #9a9a8a)" }}>
                {visiblePoints.length} {t("Terminal")}
              </span>
              <button
                type="button"
                onClick={exit}
                title={t("Kapat (Esc)")}
                style={fsBtn}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#eeeee9"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#f7f7f4"; }}
              >
                <Minimize2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}

        {/*
          sizerRef — boyut yönetimi katmanı.
          Normal mod: Tailwind heightClass (h-[360px] vb.)
          Fullscreen mod: flex:1 ile kalan alanı doldurur.
          containerRef'i asla taşımak veya boyutlandırmak gerekmez.
        */}
        <div
          ref={sizerRef}
          className={expanded ? undefined : heightClass}
          style={
            expanded
              ? { flex: 1, minHeight: 0, position: "relative" }
              : { position: "relative" }
          }
        >
          {/*
            containerRef — Leaflet'in dokunduğu tek DOM node.
            position, width, height stili React tarafından değiştirilmez.
            Leaflet init sırasında position:relative atar; bunu ezmek tile kaybına yol açar.
          */}
          <div
            ref={containerRef}
            className="ssa-leaflet ssa-fleet-map w-full h-full"
            style={
              expanded
                ? { borderRadius: 0 }
                : { borderRadius: 8, overflow: "hidden" }
            }
            aria-label={t("Filo haritası")}
          />

          {/* Normal mod tam ekran butonu */}
          {!expanded && (
            <button
              type="button"
              onClick={enter}
              title={t("Tam Ekran (Esc ile çık)")}
              style={{
                ...fsBtn,
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 1000,
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

          {/* Overlay'ler */}
          {isLoading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
              {t("Konumlar Yükleniyor…")}
            </div>
          )}
          {isError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
              {t("Konum Verisi Alınamadı.")}
            </div>
          )}
          {empty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground px-6 text-center">
              {t("Henüz Konum Verisi Olan Terminal Yok.")}
            </div>
          )}
        </div>

        {/* Fullscreen alt gemi listesi */}
        {expanded && visiblePoints.length > 0 && (
          <ShipRail points={visiblePoints} onSelect={handleShipClick} />
        )}
      </div>

      {/* Normal mod durum şeridi */}
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

// ---- Paylaşılan buton stili ----
const fsBtn: React.CSSProperties = {
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
  transition: "background 150ms, border-color 150ms",
};

// ---- Ship Rail ----

const SCROLL_STEP = 280;

function ShipRail({
  points,
  onSelect,
}: {
  points: FleetMapPoint[];
  onSelect: (p: FleetMapPoint) => void;
}) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sorted = useMemo(
    () =>
      [...points].sort((a, b) => {
        const na = a.shipName ?? "";
        const nb = b.shipName ?? "";
        if (na && nb) return na.localeCompare(nb, "tr");
        if (na) return -1;
        if (nb) return 1;
        return a.kitNo.localeCompare(b.kitNo, "tr");
      }),
    [points],
  );

  const updateArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [updateArrows]);

  return (
    <div
      style={{
        flexShrink: 0,
        position: "relative",
        borderTop: "1px solid var(--sd-hairline, #e6e5e0)",
        background: "var(--sd-bg, #f7f7f4)",
        height: 52,
      }}
    >
      {/* Sol ok */}
      {canLeft && (
        <button
          type="button"
          onClick={() => railRef.current?.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" })}
          aria-label={t("Sola kaydır")}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 10,
            width: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(to right, var(--sd-bg, #f7f7f4) 55%, transparent)",
            border: "none",
            cursor: "pointer",
            color: "#26251e",
            padding: 0,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      )}

      {/* Kaydırılabilir rail */}
      <div
        ref={railRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          padding: `0 ${canRight ? 36 : 12}px 0 ${canLeft ? 36 : 12}px`,
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        {sorted.map((p) => (
          <ShipChip key={`${p.source}:${p.kitNo}`} point={p} onSelect={onSelect} />
        ))}
      </div>

      {/* Sağ ok */}
      {canRight && (
        <button
          type="button"
          onClick={() => railRef.current?.scrollBy({ left: SCROLL_STEP, behavior: "smooth" })}
          aria-label={t("Sağa kaydır")}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 10,
            width: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(to left, var(--sd-bg, #f7f7f4) 55%, transparent)",
            border: "none",
            cursor: "pointer",
            color: "#26251e",
            padding: 0,
          }}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ---- Ship Chip ----

const SOURCE_DOT: Record<Source, React.CSSProperties> = {
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
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const label = point.shipName ?? point.kitNo;
  const sub = point.shipName ? point.kitNo : SOURCE_LABEL[point.source];

  return (
    <button
      type="button"
      onClick={() => onSelect(point)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t("{{label}} — haritada göster", { label })}
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
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          opacity: point.online === false ? 0.35 : 1,
          ...SOURCE_DOT[point.source],
        }}
      />
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
            fontFamily: "monospace",
            lineHeight: 1,
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}
