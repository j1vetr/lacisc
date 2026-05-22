import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Gemi silüeti (Material "directions_boat"). Fleet map ile aynı ikon.
const SHIP_SVG = `<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/></svg>`;

function makePinIcon(variant: "default" | "online" | "offline") {
  const cls =
    variant === "online"
      ? "ssa-terminal-pin ssa-terminal-pin--online"
      : variant === "offline"
        ? "ssa-terminal-pin ssa-terminal-pin--offline"
        : "ssa-terminal-pin";
  return L.divIcon({
    className: cls,
    html: `
      <span class="ssa-terminal-pin__halo"></span>
      <span class="ssa-terminal-pin__dot">${SHIP_SVG}</span>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const pinIconDefault = makePinIcon("default");
const pinIconOnline = makePinIcon("online");
const pinIconOffline = makePinIcon("offline");

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const last = useRef<[number, number] | null>(null);
  useEffect(() => {
    const prev = last.current;
    if (!prev || prev[0] !== lat || prev[1] !== lng) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
      last.current = [lat, lng];
    }
  }, [lat, lng, map]);
  return null;
}

export interface TerminalMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  /** When provided, pin renders green (online) or gray (offline). */
  online?: boolean;
}

export default function TerminalMap({
  lat,
  lng,
  zoom = 5,
  online,
}: TerminalMapProps) {
  const icon =
    online === true
      ? pinIconOnline
      : online === false
        ? pinIconOffline
        : pinIconDefault;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      minZoom={2}
      maxZoom={12}
      scrollWheelZoom={true}
      zoomControl={true}
      attributionControl={false}
      className="ssa-leaflet absolute inset-0 h-full w-full"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
      />
      <Marker position={[lat, lng]} icon={icon} />
      <Recenter lat={lat} lng={lng} />
    </MapContainer>
  );
}
