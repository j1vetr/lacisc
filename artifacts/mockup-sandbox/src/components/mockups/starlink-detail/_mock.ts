export const KIT = "KITP00079130";

export const detail = {
  kitSerialNumber: KIT,
  nickname: "ILHAN YILMAZ 3",
  assetName: "ILHAN YILMAZ 3 - Tekirdag",
  serviceLineNumber: "SL-22847301",
  userTerminalId: "ut01H8K9TZBN4XQ7",
  plan: "Mobile Priority 1TB",
  planAllowanceGB: 1024,
  optIn: true,
  isOnline: true,
  isBlocked: false,
  signalQuality: 1,
  latency: 50,
  downloadSpeed: 1.5,
  uploadSpeed: 1.3,
  obstruction: 0.0042,
  pingDropRate: 0.012,
  activeAlertsCount: 1,
  activeAlerts: [
    { type: "QUOTA_WARNING", severity: "warning", message: "Aylık kotanın %33'ü kullanıldı", since: "2026-05-04T11:20:00Z" },
  ],
  lat: 11.799652,
  lng: -15.605274,
  lastFix: "2026-05-07T08:14:22Z",
  ipv4: "100.64.182.41",
  activated: "2025-09-12T00:00:00Z",
  currentPeriod: "202605",
  currentPeriodTotalGb: 342.88,
  packageUsageGb: 342.88,
  priorityGb: 198.4,
  standardTrafficSpent: 144.48,
  overageGb: 0,
  updatedAt: "2026-05-07T09:42:00Z",
};

export const monthly = [
  { period: "202605", totalGb: 342.88, packageUsageGb: 342.88, priorityGb: 198.4, overageGb: 0, scrapedAt: "2026-05-07T09:42:00Z" },
  { period: "202604", totalGb: 884.21, packageUsageGb: 884.21, priorityGb: 612.0, overageGb: 0, scrapedAt: "2026-04-30T22:15:00Z" },
  { period: "202603", totalGb: 612.45, packageUsageGb: 612.45, priorityGb: 401.2, overageGb: 0, scrapedAt: "2026-03-31T22:15:00Z" },
  { period: "202602", totalGb: 511.07, packageUsageGb: 511.07, priorityGb: 322.8, overageGb: 0, scrapedAt: "2026-02-28T22:15:00Z" },
  { period: "202601", totalGb: 421.33, packageUsageGb: 421.33, priorityGb: 280.1, overageGb: 0, scrapedAt: "2026-01-31T22:15:00Z" },
];

export const daily = [
  { dayDate: "2026-05-01", deltaPackageGb: 18.2 },
  { dayDate: "2026-05-02", deltaPackageGb: 42.5 },
  { dayDate: "2026-05-03", deltaPackageGb: 51.3 },
  { dayDate: "2026-05-04", deltaPackageGb: 38.9 },
  { dayDate: "2026-05-05", deltaPackageGb: 64.1 },
  { dayDate: "2026-05-06", deltaPackageGb: 71.4 },
  { dayDate: "2026-05-07", deltaPackageGb: 56.48 },
];

export function fmtN(n: number | null | undefined, d = 2) {
  if (n == null) return "—";
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
export function fmtPeriod(p: string) {
  return /^\d{6}$/.test(p) ? `${p.slice(4, 6)}/${p.slice(0, 4)}` : p;
}
export function fmtDay(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d;
}
export function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
