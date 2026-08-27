const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY?.trim();

const cartoKeySuffix = cartoApiKey
  ? `?key=${encodeURIComponent(cartoApiKey)}`
  : "";

export const CARTO_LIGHT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" +
  cartoKeySuffix;