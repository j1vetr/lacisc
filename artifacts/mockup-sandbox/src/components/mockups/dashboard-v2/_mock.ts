export type Source = "satcom" | "tototheo" | "norway";

export const fmtGb = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtInt = (n: number) => n.toLocaleString("tr-TR");
export const fmtCompactGb = (n: number) =>
  n >= 1000
    ? (n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " TB"
    : n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " GB";

export const sourceLabel = (s: Source) =>
  s === "tototheo" ? "Tototheo" : s === "norway" ? "Norway" : "Satcom";

// 14 günlük günlük kullanım — kaynaklar ayrı ayrı.
export const daily: Array<{
  d: string;
  satcom: number;
  tototheo: number;
  norway: number;
}> = (() => {
  const out: Array<{ d: string; satcom: number; tototheo: number; norway: number }> = [];
  const base = [
    [40, 110, 60], [38, 130, 55], [42, 145, 72], [50, 160, 80],
    [45, 175, 70], [55, 190, 88], [60, 210, 95], [52, 230, 100],
    [48, 240, 90], [58, 220, 105], [64, 260, 115], [70, 280, 122],
    [62, 295, 110], [75, 310, 130],
  ];
  for (let i = 0; i < 14; i++) {
    const day = i + 1;
    out.push({
      d: `${day.toString().padStart(2, "0")}.05`,
      satcom: base[i][0],
      tototheo: base[i][1],
      norway: base[i][2],
    });
  }
  return out;
})();

export const totals = {
  satcomGb:    daily.reduce((s, x) => s + x.satcom, 0),
  tototheoGb:  daily.reduce((s, x) => s + x.tototheo, 0),
  norwayGb:    daily.reduce((s, x) => s + x.norway, 0),
};
export const totalGb = totals.satcomGb + totals.tototheoGb + totals.norwayGb;

export const kpi = {
  totalKits: 142,
  satcomKits: 67,
  tototheoKits: 52,
  norwayKits: 23,
  activePeriod: "MAY · 2026",
  syncStatus: "success" as "success" | "failed" | "running" | "pending",
  lastSyncAt: "2026-05-08 09:42",
  satcomAccounts: 3,
  tototheoAccounts: 2,
  norwayAccounts: 2,
  // dönem kotası (varsayım, sadece görsel)
  periodQuotaGb: 6500,
};

export const movers: Array<{
  source: Source;
  kitNo: string;
  shipName: string;
  totalGb: number;
  planGb?: number;
  sparkline: number[];
  delta: number; // % son 24h değişim
}> = [
  { source: "tototheo", kitNo: "KITP00079130", shipName: "ILHAN YILMAZ 3",     totalGb: 884.21, planGb: 1024, sparkline: [22,28,30,33,40,38,45,52,58,62,70,68,76,82], delta: +12.4 },
  { source: "norway",   kitNo: "NRW-44820011", shipName: "POLAR ARCTIC",       totalGb: 627.12, planGb: 750,  sparkline: [18,22,25,30,32,38,42,46,50,55,58,60,62,65], delta: +8.1 },
  { source: "satcom",   kitNo: "KITP00041122", shipName: "DENIZ KARTAL",       totalGb: 612.04,                sparkline: [10,14,20,22,28,30,35,40,44,48,52,56,58,60], delta: +5.7 },
  { source: "tototheo", kitNo: "KITP00079241", shipName: "MEHMET KAPTAN",      totalGb: 421.56, planGb: 500,  sparkline: [42,40,38,36,34,32,30,28,26,24,22,20,18,16], delta: -3.2 },
  { source: "satcom",   kitNo: "KITP00038201", shipName: "BARBAROS",           totalGb: 308.92,                sparkline: [12,15,18,20,22,24,26,28,30,32,34,36,38,40], delta: +4.5 },
  { source: "norway",   kitNo: "NRW-44820079", shipName: "NORD STAR",          totalGb: 198.45, planGb: 500,  sparkline: [8,10,12,14,16,18,20,22,24,25,26,27,28,30], delta: +6.0 },
];
