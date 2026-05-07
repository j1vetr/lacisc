import { db, customerKitAssignments } from "@workspace/db";
import { eq } from "drizzle-orm";
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
 * KITP\d* prefix → Satcom; everything else → Starlink. Mirrors the frontend
 * `isStarlinkKit` heuristic so backend and UI never disagree on routing.
 */
export function classifyKit(kitNo: string): "satcom" | "starlink" {
  return /^KITP\d/i.test(kitNo) ? "satcom" : "starlink";
}
