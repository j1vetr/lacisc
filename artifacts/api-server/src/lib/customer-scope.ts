import {
  db,
  customerKitAssignments,
  starlinkTerminals,
  stationKits,
  stationKitPeriodTotal,
  leobridgeTerminals,
} from "@workspace/db";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Role } from "../middlewares/auth";

export type KitSource = "satcom" | "starlink" | "leobridge";

export interface AssignedKits {
  satcom: string[];
  starlink: string[];
  leobridge: string[];
  all: string[];
}

export const EMPTY_SCOPE: AssignedKits = {
  satcom: [],
  starlink: [],
  leobridge: [],
  all: [],
};

export function isCustomer(role?: Role | string | null): boolean {
  return role === "customer";
}

export async function getAssignedKits(userId: number): Promise<AssignedKits> {
  const rows = await db
    .select({
      kitNo: customerKitAssignments.kitNo,
      source: customerKitAssignments.source,
    })
    .from(customerKitAssignments)
    .where(eq(customerKitAssignments.userId, userId));
  let satcom: string[] = [];
  let starlink: string[] = [];
  let leobridge: string[] = [];
  for (const r of rows) {
    if (r.source === "starlink") starlink.push(r.kitNo);
    else if (r.source === "leobridge") leobridge.push(r.kitNo);
    else satcom.push(r.kitNo);
  }
  // Görünmez (hidden) terminaller müşteri kapsamından tamamen çıkarılır —
  // atama kaydı dursa bile hiçbir müşteri endpoint'inde görünmez.
  const [hidSat, hidStar, hidLeo] = await Promise.all([
    satcom.length > 0
      ? db
          .select({ k: stationKits.kitNo })
          .from(stationKits)
          .where(and(inArray(stationKits.kitNo, satcom), eq(stationKits.hidden, true)))
      : Promise.resolve([]),
    starlink.length > 0
      ? db
          .select({ k: starlinkTerminals.kitSerialNumber })
          .from(starlinkTerminals)
          .where(
            and(
              inArray(starlinkTerminals.kitSerialNumber, starlink),
              eq(starlinkTerminals.hidden, true),
            ),
          )
      : Promise.resolve([]),
    leobridge.length > 0
      ? db
          .select({ k: leobridgeTerminals.kitSerialNumber })
          .from(leobridgeTerminals)
          .where(
            and(
              inArray(leobridgeTerminals.kitSerialNumber, leobridge),
              eq(leobridgeTerminals.hidden, true),
            ),
          )
      : Promise.resolve([]),
  ]);
  const hiddenSet = new Set([
    ...hidSat.map((r) => r.k),
    ...hidStar.map((r) => r.k),
    ...hidLeo.map((r) => r.k),
  ]);
  if (hiddenSet.size > 0) {
    satcom = satcom.filter((k) => !hiddenSet.has(k));
    starlink = starlink.filter((k) => !hiddenSet.has(k));
    leobridge = leobridge.filter((k) => !hiddenSet.has(k));
  }
  return {
    satcom,
    starlink,
    leobridge,
    all: [...satcom, ...starlink, ...leobridge],
  };
}

// multi-account: bir KIT birden fazla hesapta (ve kaynakta) bulunabilir.
// "EN TAZE KAZANIR": cross-source çakışmada en son güncellenen kaynak seçilir
// (MAX(updated_at)/scrapedAt). Bir KIT Tototheo'dan Norway'e taşındığında eski
// Starlink satırı silinmediği için her iki kaynakta da görünür; taze veriyi
// üreten kaynağın kazanması gerekir. SOURCE_PRIO yalnız zaman damgaları EŞİT
// olduğunda tie-break (starlink > leobridge > satcom).
const SOURCE_PRIO: Record<KitSource, number> = {
  starlink: 3,
  leobridge: 2,
  satcom: 1,
};

interface Candidate {
  src: KitSource;
  ts: number;
}

function pickWinner(cands: Candidate[]): KitSource | null {
  if (cands.length === 0) return null;
  cands.sort(
    (a, b) => b.ts - a.ts || SOURCE_PRIO[b.src] - SOURCE_PRIO[a.src],
  );
  return cands[0].src;
}

/**
 * Authoritative DB-backed classifier with MAX(updated_at) priority.
 * Returns `unknown` only when neither source has the KIT registered yet.
 */
export async function classifyKitDb(
  kitNo: string,
): Promise<KitSource | "unknown"> {
  // Görünmez (hidden) terminaller kaynak sınıflandırmasında dikkate alınmaz.
  // Aksi halde hidden Satcom kaydı, aynı seri numaralı görünür Norway kaydına
  // "satcom" kaynağı atayarak müşteri atamasını bozar.
  const notHidden = sql`COALESCE(hidden, false) = false`;
  const [starRow, leoRow, satRow, satMeta] = await Promise.all([
    db
      .select({ ts: max(starlinkTerminals.updatedAt) })
      .from(starlinkTerminals)
      .where(and(eq(starlinkTerminals.kitSerialNumber, kitNo), notHidden)),
    db
      .select({ ts: max(leobridgeTerminals.updatedAt) })
      .from(leobridgeTerminals)
      .where(and(eq(leobridgeTerminals.kitSerialNumber, kitNo), notHidden)),
    db
      .select({ ts: max(stationKitPeriodTotal.scrapedAt) })
      .from(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.kitNo, kitNo)),
    db
      .select({ k: stationKits.kitNo })
      .from(stationKits)
      .where(and(eq(stationKits.kitNo, kitNo), notHidden))
      .limit(1),
  ]);

  const cands: Candidate[] = [];
  if (starRow[0]?.ts)
    cands.push({ src: "starlink", ts: starRow[0].ts.getTime() });
  if (leoRow[0]?.ts)
    cands.push({ src: "leobridge", ts: leoRow[0].ts.getTime() });
  if (satRow[0]?.ts)
    cands.push({ src: "satcom", ts: satRow[0].ts.getTime() });
  else if (satMeta.length > 0)
    // station_kits satırı var ama henüz period_total yok — yine de Satcom say.
    cands.push({ src: "satcom", ts: 0 });

  return pickWinner(cands) ?? "unknown";
}

/**
 * Bulk variant — single round-trip per source. Returns a Map<kitNo, source>.
 * Aynı KIT için MAX(updated_at) öncelikli kaynak seçilir.
 */
export async function classifyKitsDb(
  kitNos: string[],
): Promise<Map<string, KitSource>> {
  const out = new Map<string, KitSource>();
  if (kitNos.length === 0) return out;

  // Görünmez (hidden) terminaller kaynak sınıflandırmasında dikkate alınmaz —
  // aynı gerekçe classifyKitDb'deki yorum satırında açıklanmış.
  const notHidden = sql`COALESCE(hidden, false) = false`;
  const [starRows, leoRows, satRows, satMetaRows] = await Promise.all([
    db
      .select({
        k: starlinkTerminals.kitSerialNumber,
        ts: max(starlinkTerminals.updatedAt),
      })
      .from(starlinkTerminals)
      .where(and(inArray(starlinkTerminals.kitSerialNumber, kitNos), notHidden))
      .groupBy(starlinkTerminals.kitSerialNumber),
    db
      .select({
        k: leobridgeTerminals.kitSerialNumber,
        ts: max(leobridgeTerminals.updatedAt),
      })
      .from(leobridgeTerminals)
      .where(and(inArray(leobridgeTerminals.kitSerialNumber, kitNos), notHidden))
      .groupBy(leobridgeTerminals.kitSerialNumber),
    db
      .select({
        k: stationKitPeriodTotal.kitNo,
        ts: max(stationKitPeriodTotal.scrapedAt),
      })
      .from(stationKitPeriodTotal)
      .where(inArray(stationKitPeriodTotal.kitNo, kitNos))
      .groupBy(stationKitPeriodTotal.kitNo),
    db
      .select({ k: stationKits.kitNo })
      .from(stationKits)
      .where(and(inArray(stationKits.kitNo, kitNos), notHidden)),
  ]);

  const buckets = new Map<string, Candidate[]>();
  const push = (k: string, c: Candidate) => {
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(c);
  };
  for (const r of starRows) if (r.ts) push(r.k, { src: "starlink", ts: r.ts.getTime() });
  for (const r of leoRows) if (r.ts) push(r.k, { src: "leobridge", ts: r.ts.getTime() });
  for (const r of satRows) if (r.ts) push(r.k, { src: "satcom", ts: r.ts.getTime() });
  // station_kits satırı var ama period_total yok → fallback satcom kandidatı
  const satWithTotals = new Set(satRows.filter((r) => r.ts).map((r) => r.k));
  for (const r of satMetaRows) {
    if (!satWithTotals.has(r.k)) push(r.k, { src: "satcom", ts: 0 });
  }

  for (const [k, cands] of buckets) {
    const w = pickWinner(cands);
    if (w) out.set(k, w);
  }
  return out;
}

/**
 * Synchronous prefix-based classifier — DEPRECATED. Kept only as a last-resort
 * fallback when DB I/O is unavailable. Tototheo serials may start with `KITP\d`
 * too, so this can misroute. Prefer `classifyKitDb` / `classifyKitsDb`.
 */
export function classifyKit(kitNo: string): "satcom" | "starlink" {
  return /^KITP\d/i.test(kitNo) ? "satcom" : "starlink";
}
