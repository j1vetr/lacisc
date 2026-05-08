export type Source = "satcom" | "starlink" | "leobridge";

export type Row = {
  source: Source;
  kitNo: string;
  shipName: string;
  totalGb: number;
  planGb?: number;
  signal: "online" | "degraded" | "offline";
  lastSeenMin: number;
  period: string;
};

export const rows: Row[] = [
  { source: "starlink",  kitNo: "KITP00079130", shipName: "ILHAN YILMAZ 3",     totalGb: 884.21, planGb: 1024, signal: "online",   lastSeenMin: 2,   period: "202605" },
  { source: "leobridge", kitNo: "NRW-44820011", shipName: "POLAR ARCTIC",       totalGb: 627.12, planGb: 750,  signal: "online",   lastSeenMin: 1,   period: "202605" },
  { source: "satcom",    kitNo: "KITP00041122", shipName: "DENIZ KARTAL",       totalGb: 612.04,                signal: "online",   lastSeenMin: 7,   period: "202605" },
  { source: "starlink",  kitNo: "KITP00079241", shipName: "MEHMET KAPTAN",      totalGb: 421.56, planGb: 500,  signal: "degraded", lastSeenMin: 14,  period: "202605" },
  { source: "satcom",    kitNo: "KITP00038201", shipName: "BARBAROS",           totalGb: 308.92,                signal: "online",   lastSeenMin: 4,   period: "202605" },
  { source: "satcom",    kitNo: "KITP00040118", shipName: "AKDENİZ YILDIZI",    totalGb: 254.10,                signal: "online",   lastSeenMin: 9,   period: "202605" },
  { source: "leobridge", kitNo: "NRW-44820079", shipName: "NORD STAR",          totalGb: 198.45, planGb: 500,  signal: "online",   lastSeenMin: 3,   period: "202605" },
  { source: "starlink",  kitNo: "KITP00079002", shipName: "EGE INCISI",         totalGb: 142.31, planGb: 250,  signal: "offline",  lastSeenMin: 320, period: "202605" },
  { source: "satcom",    kitNo: "KITP00041007", shipName: "KARADENIZ KAPTANI",  totalGb: 121.88,                signal: "online",   lastSeenMin: 11,  period: "202605" },
  { source: "satcom",    kitNo: "KITP00037441", shipName: "MAVI MARMARA",       totalGb:  98.42,                signal: "degraded", lastSeenMin: 22,  period: "202605" },
  { source: "leobridge", kitNo: "NRW-44820144", shipName: "ARCTIC EXPLORER",    totalGb:  76.18, planGb: 250,  signal: "online",   lastSeenMin: 6,   period: "202605" },
  { source: "satcom",    kitNo: "KITP00041888", shipName: "BOSPHORUS",          totalGb:  64.07,                signal: "online",   lastSeenMin: 18,  period: "202605" },
  { source: "starlink",  kitNo: "KITP00079559", shipName: "LEVANT",             totalGb:  42.93, planGb: 100,  signal: "online",   lastSeenMin: 5,   period: "202605" },
  { source: "satcom",    kitNo: "KITP00040227", shipName: "TÜRK BAYRAĞI",       totalGb:  18.50,                signal: "online",   lastSeenMin: 31,  period: "202605" },
];

export const fmtGb = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const relTime = (min: number): string => {
  if (min < 1) return "şimdi";
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} g önce`;
};

export const sourceLabel = (s: Source) =>
  s === "starlink" ? "Tototheo" : s === "leobridge" ? "Norway" : "Satcom";

export const sourceClass = (s: Source) =>
  s === "starlink" ? "tototheo" : s === "leobridge" ? "norway" : "satcom";
