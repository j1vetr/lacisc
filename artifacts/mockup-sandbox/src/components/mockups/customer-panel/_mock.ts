export type CustomerKit = {
  kitNo: string;
  shipName: string;
  source: "satcom" | "starlink";
  currentPeriodGib: number;
  lastUpdate: string;
  online?: boolean;
  signal?: number;
  alerts?: number;
};

export const customer = {
  name: "Kaptan Demir",
  username: "demir_filo",
  greeting: "Hoş geldiniz",
};

export const activePeriod = "202605";
export const activePeriodLabel = "Mayıs 2026";

export const kits: CustomerKit[] = [
  { kitNo: "KITP00401809", shipName: "MIREM",            source: "satcom",   currentPeriodGib: 117.89, lastUpdate: "2026-05-07T16:30:00Z", online: true,  alerts: 0 },
  { kitNo: "KITP00079130", shipName: "ILHAN YILMAZ 3",   source: "starlink", currentPeriodGib: 346.79, lastUpdate: "2026-05-07T16:20:12Z", online: true,  signal: 0.94, alerts: 0 },
  { kitNo: "KITP00112572", shipName: "DENIZ YILDIZI",    source: "satcom",   currentPeriodGib:  64.12, lastUpdate: "2026-05-07T15:48:00Z", online: true,  alerts: 0 },
  { kitNo: "KITP00097437", shipName: "MAVI MARMARA II",  source: "satcom",   currentPeriodGib:  22.40, lastUpdate: "2026-05-07T14:10:00Z", online: false, alerts: 1 },
  { kitNo: "KITP00079048", shipName: "EGE PRENSESI",     source: "starlink", currentPeriodGib: 198.02, lastUpdate: "2026-05-07T16:28:00Z", online: true,  signal: 0.88, alerts: 0 },
  { kitNo: "KITP00409812", shipName: "POSEIDON IV",      source: "satcom",   currentPeriodGib: 891.30, lastUpdate: "2026-05-07T13:22:00Z", online: true,  alerts: 2 },
];

// Active period totals
export const totals = {
  totalKits: kits.length,
  totalGib: kits.reduce((s, k) => s + k.currentPeriodGib, 0),
  satcomKits: kits.filter(k => k.source === "satcom").length,
  starlinkKits: kits.filter(k => k.source === "starlink").length,
  online: kits.filter(k => k.online).length,
};

// Mini sparkline data (last 14 days, GiB) — used for hero/cards
export function sparkFor(kit: CustomerKit): number[] {
  const seed = kit.kitNo.charCodeAt(7) + kit.kitNo.charCodeAt(11);
  return Array.from({ length: 14 }, (_, i) => {
    const v = Math.sin(i * 0.7 + seed) * 0.4 + 0.6;
    return Math.max(0.05, v) * (kit.currentPeriodGib / 14);
  });
}

export const fmtGib = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtRel = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
};
