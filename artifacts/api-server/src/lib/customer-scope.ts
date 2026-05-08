import {
  db,
  customerKitAssignments,
  starlinkTerminals,
  stationKits,
  stationKitPeriodTotal,
  leobridgeTerminals,
} from "@workspace/db";
import { eq, inArray, max } from "drizzle-orm";
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
  const satcom: string[] = [];
  const starlink: string[] = [];
  const leobridge: string[] = [];
  for (const r of rows) {
    if (r.source === "starlink") starlink.push(r.kitNo);
    else if (r.source === "leobridge") leobridge.push(r.kitNo);
    else satcom.push(r.kitNo);
  }
  return {
    satcom,
    starlink,
    leobridge,
    all: [...satcom, ...starlink, ...leobridge],
  };
}

// T002 — multi-account: bir KIT birden fazla hesapta (ve kaynakta) bulunabilir.
// Cross-source çakışmada SABİT öncelik: starlink > leobridge > satcom (canlı API'ler önce).
// MAX(updated_at) yalnızca AYNI kaynak içinde aynı KIT için birden fazla credential
// çakıştığında devreye girer (en son güncellenen credential kazanır).
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
    (a, b) => SOURCE_PRIO[b.src] - SOURCE_PRIO[a.src] || b.ts - a.ts,
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
  const [starRow, leoRow, satRow, satMeta] = await Promise.all([
    db
      .select({ ts: max(starlinkTerminals.updatedAt) })
      .from(starlinkTerminals)
      .where(eq(starlinkTerminals.kitSerialNumber, kitNo)),
    db
      .select({ ts: max(leobridgeTerminals.updatedAt) })
      .from(leobridgeTerminals)
      .where(eq(leobridgeTerminals.kitSerialNumber, kitNo)),
    db
      .select({ ts: max(stationKitPeriodTotal.scrapedAt) })
      .from(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.kitNo, kitNo)),
    db
      .select({ k: stationKits.kitNo })
      .from(stationKits)
      .where(eq(stationKits.kitNo, kitNo))
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

  const [starRows, leoRows, satRows, satMetaRows] = await Promise.all([
    db
      .select({
        k: starlinkTerminals.kitSerialNumber,
        ts: max(starlinkTerminals.updatedAt),
      })
      .from(starlinkTerminals)
      .where(inArray(starlinkTerminals.kitSerialNumber, kitNos))
      .groupBy(starlinkTerminals.kitSerialNumber),
    db
      .select({
        k: leobridgeTerminals.kitSerialNumber,
        ts: max(leobridgeTerminals.updatedAt),
      })
      .from(leobridgeTerminals)
      .where(inArray(leobridgeTerminals.kitSerialNumber, kitNos))
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
      .where(inArray(stationKits.kitNo, kitNos)),
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
