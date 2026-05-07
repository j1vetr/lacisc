import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ORANGE = "#f54e00";

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
      <span class="ssa-terminal-pin__dot"></span>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
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
      scrollWheelZoom={false}
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
