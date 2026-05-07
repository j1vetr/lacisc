import { logger } from "./logger";

export interface TototheoTerminalListItem {
  assetName: string | null;
  nickname: string;
  imo: string | null;
  mmsi: string | null;
  kitSerialNumber: string;
  serviceLineNumber: string;
}

export interface TototheoMonthlyUsage {
  serviceLineNumber: string;
  month: number;
  year: number;
  periodStart: string;
  periodEnd: string;
  usage: {
    service_line_number: string;
    priority_gb: number;
    overage_gb: number;
    package_usage_gb: number;
  } | null;
}

export interface TototheoTerminalDetail {
  assetName: string | null;
  nickname: string;
  userTerminalId: string;
  serviceLineNumber: string;
  activated: boolean;
  kitSerialNumber: string;
  lastUpdated: number;
  isOnline: boolean;
  blocked: boolean;
  plan: string;
  planAllowanceGB: number;
  standardTrafficSpent: number;
  priorityTrafficSpent: number;
  overageTrafficSpent: number;
  downloadSpeed: number | null;
  uploadSpeed: number | null;
  signalQuality: number;
  latency: number;
  obstruction: number;
  pingDropRate: number;
  h3Coordinates: { lat: number; lng: number; timestamp: number; h3?: number } | null;
  activeAlerts: Array<{
    name: string;
    definition: string;
    suggestion: string;
    triggeredAt: string;
  }>;
  ipv4: string[];
  poolPlanMonthlyUsage?: TototheoMonthlyUsage[];
}

interface TototheoEnvelope<T> {
  success?: boolean;
  status_code?: number;
  error?: string | null;
  data?: T;
}

// Tototheo TM Starlink REST client.
// - Bearer JWT auth in Authorization header.
// - Rate limits per docs: 60 req/min per token, 120 req/min company.
// - On HTTP 429: exponential backoff (1s, 2s, 4s) — 3 attempts max.
// - Network errors: linear backoff (500ms × attempt).
// - Data refreshes upstream every ~20 minutes; we sync every 30 min.
export class TototheoClient {
  constructor(private baseUrl: string, private token: string) {}

  private async request<T>(
    path: string,
    query?: Record<string, string>
  ): Promise<T> {
    const base = this.baseUrl.replace(/\/+$/, "");
    const url = new URL(base + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    const maxAttempts = 3;
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        });
        if (res.status === 429) {
          const wait = Math.min(1000 * 2 ** (attempt - 1), 8000);
          logger.warn(
            { url: url.pathname, attempt, wait },
            "Tototheo 429 — backing off"
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as TototheoEnvelope<T>;
        if (!res.ok || body.success === false) {
          throw new Error(
            body.error ||
              `Tototheo HTTP ${res.status} ${res.statusText || ""}`.trim()
          );
        }
        if (body.data === undefined) {
          throw new Error("Tototheo yanıtı boş (data alanı yok).");
        }
        return body.data;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    throw lastErr ?? new Error("Tototheo request failed");
  }

  async getTerminalList(): Promise<TototheoTerminalListItem[]> {
    return await this.request<TototheoTerminalListItem[]>(
      "/api/v1/getTerminalList"
    );
  }

  // Detail response is documented as: data.imo[<imo|0>][<userTerminalId>] = {...}.
  // In practice Tototheo nests inconsistently and may use snake_case keys at
  // the top level, so we walk recursively and return the first object that
  // looks like an actual terminal detail (has at least one of the known
  // identifier or telemetry fields). The naive depth-2 walker was matching
  // empty intermediate wrappers and returning all nulls.
  async getTerminalDetails(opts: {
    kitSerialNumber?: string;
    imo?: string;
    mmsi?: string;
    consumptionYear?: number;
  }): Promise<RawTototheoDetail | null> {
    const q: Record<string, string> = {};
    if (opts.kitSerialNumber) q.kitSerialNumber = opts.kitSerialNumber;
    if (opts.imo) q.imo = opts.imo;
    if (opts.mmsi) q.mmsi = opts.mmsi;
    if (opts.consumptionYear !== undefined)
      q.consumptionYear = String(opts.consumptionYear);
    const data = await this.request<unknown>("/api/v1/getTerminalDetails", q);
    return findTerminalDetailLeaf(data);
  }
}

// Loose object shape returned from Tototheo before normalization.
export type RawTototheoDetail = Record<string, unknown>;

// Marker keys that uniquely identify a terminal *leaf* object (not the
// outer wrapper). The wrapper also echoes `kitSerialNumber` from the query,
// so we deliberately exclude identifier-only keys and require at least one
// telemetry/billing field that only exists on the actual detail.
const DETAIL_LEAF_MARKERS = new Set([
  "signalQuality",
  "signal_quality",
  "standardTrafficSpent",
  "standard_traffic_spent",
  "poolPlanMonthlyUsage",
  "pool_plan_monthly_usage",
  "isOnline",
  "is_online",
  "h3Coordinates",
  "h3_coordinates",
  "userTerminalId",
  "user_terminal_id",
]);

// DFS through the response until we hit a true detail leaf (an object that
// carries telemetry, not just identifier echoes). Tototheo wraps the payload
// as `{ imo: { "<imo>": { "<userTerminalId>": {...leaf...} } }, mmsi: {...},
// kitSerialNumber: "..." }` — naively matching `kitSerialNumber` at the top
// level returned the wrapper and produced all-null persists.
function findTerminalDetailLeaf(node: unknown): RawTototheoDetail | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const obj = node as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (DETAIL_LEAF_MARKERS.has(k)) return obj;
  }
  for (const v of Object.values(obj)) {
    const found = findTerminalDetailLeaf(v);
    if (found) return found;
  }
  return null;
}

// Pick the first defined value out of a list of candidate keys. Tototheo
// mixes camelCase and snake_case across endpoints (and even within a single
// payload), so every field read goes through this helper.
export function pickField<T = unknown>(
  obj: RawTototheoDetail | null | undefined,
  ...keys: string[]
): T | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

export async function testTototheoCredentials(
  baseUrl: string,
  token: string
): Promise<{ success: boolean; message: string; terminalCount?: number }> {
  try {
    const client = new TototheoClient(baseUrl, token);
    const list = await client.getTerminalList();
    return {
      success: true,
      message: `Bağlantı OK — ${list.length} terminal bulundu.`,
      terminalCount: list.length,
    };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}
