import {
  db,
  starlinkSettings,
  starlinkTerminals,
  starlinkTerminalDaily,
  starlinkTerminalPeriodTotal,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";
import {
  TototheoClient,
  pickField,
  type RawTototheoDetail,
  type TototheoMonthlyUsage,
} from "./tototheo";
import * as progress from "./sync-progress";

let running = false;

export function isStarlinkSyncRunning(): boolean {
  return running;
}

function tryClaim(): boolean {
  if (running) return false;
  running = true;
  return true;
}

export interface StarlinkSyncResult {
  success: boolean;
  message: string;
  terminalCount: number;
  errors: string[];
}

export interface StarlinkSettingsView {
  enabled: boolean;
  apiBaseUrl: string;
  hasToken: boolean;
  lastSyncAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

const DEFAULT_BASE_URL = "https://starlink.tototheo.com";

export async function getStarlinkSettingsView(): Promise<StarlinkSettingsView> {
  const [row] = await db
    .select()
    .from(starlinkSettings)
    .where(eq(starlinkSettings.id, 1));
  if (!row) {
    return {
      enabled: false,
      apiBaseUrl: DEFAULT_BASE_URL,
      hasToken: false,
      lastSyncAt: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    enabled: row.enabled,
    apiBaseUrl: row.apiBaseUrl,
    hasToken: !!row.tokenEncrypted,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastErrorMessage: row.lastErrorMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface StarlinkSettingsPatch {
  enabled?: boolean;
  apiBaseUrl?: string;
  // undefined = keep, null/'' = clear, string = set new
  token?: string | null;
}

export async function saveStarlinkSettings(
  patch: StarlinkSettingsPatch
): Promise<StarlinkSettingsView> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.apiBaseUrl !== undefined)
    update.apiBaseUrl = patch.apiBaseUrl.trim() || DEFAULT_BASE_URL;
  if (patch.token !== undefined) {
    update.tokenEncrypted =
      patch.token === null || patch.token === "" ? null : encrypt(patch.token);
  }
  await db
    .insert(starlinkSettings)
    .values({
      id: 1,
      enabled: (update.enabled as boolean | undefined) ?? false,
      apiBaseUrl: (update.apiBaseUrl as string | undefined) ?? DEFAULT_BASE_URL,
      tokenEncrypted:
        (update.tokenEncrypted as string | null | undefined) ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({ target: starlinkSettings.id, set: update });
  return getStarlinkSettingsView();
}

// Resolve the active token. Returns null if Starlink is disabled or unconfigured.
async function resolveToken(): Promise<{
  token: string;
  baseUrl: string;
} | null> {
  const [row] = await db
    .select()
    .from(starlinkSettings)
    .where(eq(starlinkSettings.id, 1));
  if (!row || !row.enabled || !row.tokenEncrypted) return null;
  try {
    return { token: decrypt(row.tokenEncrypted), baseUrl: row.apiBaseUrl };
  } catch (err) {
    logger.error({ err }, "Starlink token decrypt failed");
    return null;
  }
}

export async function testStarlinkConnection(
  apiBaseUrl: string,
  token: string | null
): Promise<{ success: boolean; message: string; terminalCount?: number }> {
  // If token is undefined/blank, fall back to the saved token so the operator
  // can hit "Test" without re-entering it.
  let effectiveToken = token;
  if (!effectiveToken) {
    const [row] = await db
      .select()
      .from(starlinkSettings)
      .where(eq(starlinkSettings.id, 1));
    if (!row?.tokenEncrypted) {
      return { success: false, message: "Token kaydedilmemiş." };
    }
    try {
      effectiveToken = decrypt(row.tokenEncrypted);
    } catch {
      return { success: false, message: "Kayıtlı token çözülemedi." };
    }
  }
  try {
    const client = new TototheoClient(apiBaseUrl || DEFAULT_BASE_URL, effectiveToken);
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

export async function runStarlinkSync(): Promise<StarlinkSyncResult> {
  if (!tryClaim()) {
    return {
      success: false,
      message: "Starlink sync zaten çalışıyor.",
      terminalCount: 0,
      errors: [],
    };
  }
  try {
    return await runInner();
  } finally {
    running = false;
  }
}

async function runInner(): Promise<StarlinkSyncResult> {
  const resolved = await resolveToken();
  if (!resolved) {
    return {
      success: false,
      message: "Starlink API yapılandırılmamış veya pasif.",
      terminalCount: 0,
      errors: [],
    };
  }
  const client = new TototheoClient(resolved.baseUrl, resolved.token);
  const errors: string[] = [];

  progress.startStarlinkPhase();
  try {
    const list = await client.getTerminalList();
    progress.setStarlinkPlan(list.length);

    const year = new Date().getUTCFullYear();
    const today = new Date().toISOString().slice(0, 10);

    let processed = 0;
    let loggedShape = false;
    for (const item of list) {
      processed += 1;
      const label = item.nickname || item.assetName || item.kitSerialNumber;
      progress.startStarlinkTerminal(item.kitSerialNumber, label, processed);
      try {
        const detail = await client.getTerminalDetails({
          kitSerialNumber: item.kitSerialNumber,
          consumptionYear: year,
        });
        if (!detail) {
          const msg = "detay bulunamadı";
          errors.push(`${item.kitSerialNumber}: ${msg}`);
          progress.reportStarlinkFailure(item.kitSerialNumber, msg);
          continue;
        }
        // One-shot per sync run: dump the keys (not values) of the first
        // terminal detail we receive so operators can spot field-name shifts
        // in Tototheo's response without leaking telemetry into the logs.
        if (!loggedShape) {
          loggedShape = true;
          logger.info(
            {
              kitSerialNumber: item.kitSerialNumber,
              detailKeys: Object.keys(detail),
            },
            "Tototheo detail shape (first terminal of run)"
          );
        }
        await persistTerminal(detail, item.kitSerialNumber, today);
        const monthsRaw = pickField<unknown>(
          detail,
          "poolPlanMonthlyUsage",
          "pool_plan_monthly_usage"
        );
        await persistMonthlyTotals(item.kitSerialNumber, flattenMonths(monthsRaw));
        const standard =
          pickField<number>(detail, "standardTrafficSpent", "standard_traffic_spent") ?? 0;
        const priority =
          pickField<number>(detail, "priorityTrafficSpent", "priority_traffic_spent") ?? 0;
        const overage =
          pickField<number>(detail, "overageTrafficSpent", "overage_traffic_spent") ?? 0;
        progress.reportStarlinkDone(item.kitSerialNumber, standard + priority + overage);
      } catch (err) {
        const msg = (err as Error).message;
        errors.push(`${item.kitSerialNumber}: ${msg}`);
        logger.error(
          { err, kitSerialNumber: item.kitSerialNumber },
          "Starlink terminal sync failed"
        );
        progress.reportStarlinkFailure(item.kitSerialNumber, msg);
      }
    }

    const success = list.length > 0 && errors.length < list.length;
    const summary =
      errors.length === 0
        ? `Starlink OK — ${list.length} terminal güncellendi.`
        : success
          ? `Starlink kısmen — ${list.length - errors.length}/${list.length} terminal başarılı.`
          : `Starlink başarısız — ${errors.length} hata.`;

    await db
      .update(starlinkSettings)
      .set({
        lastSyncAt: new Date(),
        lastErrorMessage: errors.length > 0 ? errors[0] : null,
        updatedAt: new Date(),
      })
      .where(eq(starlinkSettings.id, 1));

    progress.finishStarlinkPhase(summary, success);
    return { success, message: summary, terminalCount: list.length, errors };
  } catch (err) {
    const msg = (err as Error).message;
    await db
      .update(starlinkSettings)
      .set({
        lastSyncAt: new Date(),
        lastErrorMessage: msg,
        updatedAt: new Date(),
      })
      .where(eq(starlinkSettings.id, 1));
    progress.finishStarlinkPhase(`Starlink sync hata: ${msg}`, false);
    return {
      success: false,
      message: msg,
      terminalCount: 0,
      errors: [msg],
    };
  }
}

async function persistTerminal(
  d: RawTototheoDetail,
  // Always trust the outer kitSerialNumber from the list endpoint — the
  // detail payload may not echo it back, and we need a non-null PK either way.
  kitSerialNumber: string,
  today: string
): Promise<void> {
  const coords = pickField<{
    lat?: number;
    lng?: number;
    timestamp?: number;
  }>(d, "h3Coordinates", "h3_coordinates");
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;
  const lastFixAt = coords?.timestamp ? new Date(coords.timestamp * 1000) : null;
  const lastUpdatedTs = pickField<number>(d, "lastUpdated", "last_updated");
  const lastSeenAt = lastUpdatedTs ? new Date(lastUpdatedTs * 1000) : new Date();

  const activeAlerts = pickField<unknown[]>(d, "activeAlerts", "active_alerts");

  const terminalRow = {
    nickname: pickField<string>(d, "nickname") ?? null,
    assetName: pickField<string>(d, "assetName", "asset_name") ?? null,
    isOnline: pickField<boolean>(d, "isOnline", "is_online") ?? false,
    activated: pickField<boolean>(d, "activated") ?? false,
    blocked: pickField<boolean>(d, "blocked") ?? false,
    signalQuality: pickField<number>(d, "signalQuality", "signal_quality") ?? null,
    latency: pickField<number>(d, "latency") ?? null,
    obstruction: pickField<number>(d, "obstruction") ?? null,
    downloadSpeed: pickField<number>(d, "downloadSpeed", "download_speed") ?? null,
    uploadSpeed: pickField<number>(d, "uploadSpeed", "upload_speed") ?? null,
    lat,
    lng,
    lastFixAt,
    activeAlertsCount: Array.isArray(activeAlerts) ? activeAlerts.length : 0,
    lastSeenAt,
    updatedAt: new Date(),
  };
  await db
    .insert(starlinkTerminals)
    .values({ kitSerialNumber, ...terminalRow })
    .onConflictDoUpdate({
      target: starlinkTerminals.kitSerialNumber,
      set: terminalRow,
    });

  // Daily snapshot — UPSERT today's row with cumulative cycle totals.
  // Last write of the day naturally captures the day's end-of-day reading.
  const standard =
    pickField<number>(d, "standardTrafficSpent", "standard_traffic_spent") ?? 0;
  const priority =
    pickField<number>(d, "priorityTrafficSpent", "priority_traffic_spent") ?? 0;
  const overage =
    pickField<number>(d, "overageTrafficSpent", "overage_traffic_spent") ?? 0;
  const packageUsage = standard + priority + overage;

  await db
    .insert(starlinkTerminalDaily)
    .values({
      kitSerialNumber,
      dayDate: today,
      packageUsageGb: packageUsage,
      priorityGb: priority,
      overageGb: overage,
      lastReadingAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        starlinkTerminalDaily.kitSerialNumber,
        starlinkTerminalDaily.dayDate,
      ],
      set: {
        packageUsageGb: packageUsage,
        priorityGb: priority,
        overageGb: overage,
        lastReadingAt: new Date(),
      },
    });
}

// Tototheo returns `poolPlanMonthlyUsage` as a year-keyed object:
//   { "2026": [{ month, year, usage: {...} }, ...] }
// (Earlier draft assumed a flat array.) Accept both shapes — flatten any
// object-of-arrays into one array, preserve direct arrays as-is.
function flattenMonths(node: unknown): RawTototheoDetail[] {
  if (!node) return [];
  if (Array.isArray(node)) return node as RawTototheoDetail[];
  if (typeof node === "object") {
    const out: RawTototheoDetail[] = [];
    for (const v of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(v)) out.push(...(v as RawTototheoDetail[]));
    }
    return out;
  }
  return [];
}

async function persistMonthlyTotals(
  kitSerialNumber: string,
  months: RawTototheoDetail[]
): Promise<void> {
  for (const m of months) {
    const usage = pickField<RawTototheoDetail>(m, "usage");
    if (!usage) continue;
    const year = pickField<number>(m, "year");
    const month = pickField<number>(m, "month");
    if (year === undefined || month === undefined) continue;
    const period = `${year}${String(month).padStart(2, "0")}`;
    // `package_usage_gb` is the authoritative monthly total per Tototheo's
    // schema — priority/overage are sub-buckets that are already included in
    // the package total. Summing them here would ~2× the dashboard figures.
    const pkg =
      pickField<number>(usage, "package_usage_gb", "packageUsageGb") ?? 0;
    const pri = pickField<number>(usage, "priority_gb", "priorityGb") ?? 0;
    const ovg = pickField<number>(usage, "overage_gb", "overageGb") ?? 0;
    const total = pkg;
    await db
      .insert(starlinkTerminalPeriodTotal)
      .values({
        kitSerialNumber,
        period,
        packageUsageGb: pkg,
        priorityGb: pri,
        overageGb: ovg,
        totalGb: total,
        scrapedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          starlinkTerminalPeriodTotal.kitSerialNumber,
          starlinkTerminalPeriodTotal.period,
        ],
        set: {
          packageUsageGb: pkg,
          priorityGb: pri,
          overageGb: ovg,
          totalGb: total,
          scrapedAt: new Date(),
        },
      });
  }
}
