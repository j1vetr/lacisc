import {
  db,
  customerKitAssignments,
  starlinkTerminals,
  stationKits,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { Role } from "../middlewares/auth";

export interface AssignedKits {
  satcom: string[];
  starlink: string[];
  all: string[];
}

export const EMPTY_SCOPE: AssignedKits = { satcom: [], starlink: [], all: [] };

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
  for (const r of rows) {
    if (r.source === "starlink") starlink.push(r.kitNo);
    else satcom.push(r.kitNo);
  }
  return { satcom, starlink, all: [...satcom, ...starlink] };
}

/**
 * Authoritative DB-backed classifier. Looks the KIT up in `starlink_terminals`
 * first (most reliable since Tototheo serials may also start with `KITP\d`).
 * Falls back to Satcom when only `station_kits` knows it, or `unknown` when
 * neither table has a row (caller decides what to do).
 *
 * Returns `unknown` only when neither source has the KIT registered yet — the
 * KIT-source endpoint surfaces this as a 404. The synchronous prefix-based
 * helper below remains as a last-resort fallback for code paths that cannot
 * await DB I/O.
 */
export async function classifyKitDb(
  kitNo: string,
): Promise<"satcom" | "starlink" | "unknown"> {
  const [starRow] = await db
    .select({ k: starlinkTerminals.kitSerialNumber })
    .from(starlinkTerminals)
    .where(eq(starlinkTerminals.kitSerialNumber, kitNo))
    .limit(1);
  if (starRow) return "starlink";
  const [satRow] = await db
    .select({ k: stationKits.kitNo })
    .from(stationKits)
    .where(eq(stationKits.kitNo, kitNo))
    .limit(1);
  if (satRow) return "satcom";
  return "unknown";
}

/**
 * Bulk variant — single round-trip per source. Returns a Map<kitNo, source>.
 * Unknown kits are simply absent from the map.
 */
export async function classifyKitsDb(
  kitNos: string[],
): Promise<Map<string, "satcom" | "starlink">> {
  const out = new Map<string, "satcom" | "starlink">();
  if (kitNos.length === 0) return out;
  const [satRows, starRows] = await Promise.all([
    db
      .select({ k: stationKits.kitNo })
      .from(stationKits)
      .where(inArray(stationKits.kitNo, kitNos)),
    db
      .select({ k: starlinkTerminals.kitSerialNumber })
      .from(starlinkTerminals)
      .where(inArray(starlinkTerminals.kitSerialNumber, kitNos)),
  ]);
  for (const r of satRows) out.set(r.k, "satcom");
  // Starlink wins on collision — Tototheo serials may share a `KITP\d` prefix
  // with a stale Satcom row, and the live terminal table is authoritative.
  for (const r of starRows) out.set(r.k, "starlink");
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
