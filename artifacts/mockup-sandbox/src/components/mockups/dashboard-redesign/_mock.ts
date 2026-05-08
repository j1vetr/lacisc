export type Source = "satcom" | "starlink" | "leobridge";

export type Ship = {
  source: Source;
  kitNo: string;
  shipName: string;
  totalGib: number;
  planGb?: number;
  signal?: "online" | "degraded" | "offline";
  lastSeenMin?: number;
};

export const ships: Ship[] = [
  { source: "starlink", kitNo: "KITP00079130", shipName: "ILHAN YILMAZ 3",   totalGib: 884.21, planGb: 1024, signal: "online",   lastSeenMin: 2 },
  { source: "satcom",   kitNo: "KITP00041122", shipName: "DENIZ KARTAL",      totalGib: 612.04, signal: "online",   lastSeenMin: 7 },
  { source: "leobridge",kitNo: "NRW-44820011",  shipName: "POLAR ARCTIC",     totalGib: 498.77, planGb: 750,  signal: "online",   lastSeenMin: 1 },
  { source: "starlink", kitNo: "KITP00079241", shipName: "MEHMET KAPTAN",    totalGib: 421.56, planGb: 500,  signal: "degraded", lastSeenMin: 14 },
  { source: "satcom",   kitNo: "KITP00038201", shipName: "BARBAROS",          totalGib: 308.92, signal: "online",   lastSeenMin: 4 },
  { source: "satcom",   kitNo: "KITP00040118", shipName: "AKDENİZ YILDIZI",   totalGib: 254.10, signal: "online",   lastSeenMin: 9 },
  { source: "leobridge",kitNo: "NRW-44820079", shipName: "NORD STAR",         totalGib: 198.45, planGb: 500,  signal: "online",   lastSeenMin: 3 },
  { source: "starlink", kitNo: "KITP00079002", shipName: "EGE INCISI",        totalGib: 142.31, planGb: 250,  signal: "offline",  lastSeenMin: 320 },
  { source: "satcom",   kitNo: "KITP00041007", shipName: "KARADENIZ KAPTANI", totalGib: 121.88, signal: "online",   lastSeenMin: 11 },
  { source: "satcom",   kitNo: "KITP00037441", shipName: "MAVI MARMARA",      totalGib: 98.42,  signal: "degraded", lastSeenMin: 22 },
  { source: "leobridge",kitNo: "NRW-44820144", shipName: "ARCTIC EXPLORER",   totalGib: 76.18,  planGb: 250,  signal: "online",   lastSeenMin: 6 },
  { source: "satcom",   kitNo: "KITP00041888", shipName: "BOSPHORUS",         totalGib: 64.07,  signal: "online",   lastSeenMin: 18 },
  { source: "starlink", kitNo: "KITP00079559", shipName: "LEVANT",            totalGib: 42.93,  planGb: 100,  signal: "online",   lastSeenMin: 5 },
  { source: "satcom",   kitNo: "KITP00040227", shipName: "TÜRK BAYRAĞI",      totalGib: 18.50,  signal: "online",   lastSeenMin: 31 },
];

export const summary = {
  totalKits: ships.length,
  totalGib: ships.reduce((s, x) => s + x.totalGib, 0),
  satcomKits: ships.filter((s) => s.source === "satcom").length,
  starlinkKits: ships.filter((s) => s.source === "starlink").length,
  norwayKits: ships.filter((s) => s.source === "leobridge").length,
  satcomGib: ships.filter((s) => s.source === "satcom").reduce((s, x) => s + x.totalGib, 0),
  starlinkGib: ships.filter((s) => s.source === "starlink").reduce((s, x) => s + x.totalGib, 0),
  norwayGib: ships.filter((s) => s.source === "leobridge").reduce((s, x) => s + x.totalGib, 0),
  activePeriod: "202605",
  lastSyncAt: "2026-05-08T07:42:00Z",
  lastSyncStatus: "success" as const,
  onlineCount: ships.filter((s) => s.signal === "online").length,
  offlineCount: ships.filter((s) => s.signal === "offline").length,
  degradedCount: ships.filter((s) => s.signal === "degraded").length,
};

export function fmtGb(n: number, d = 2): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

export const sourceLabel: Record<Source, string> = {
  satcom: "Satcom",
  starlink: "Tototheo",
  leobridge: "Norway",
};
