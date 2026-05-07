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
  type TototheoTerminalDetail,
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
        await persistTerminal(detail, today);
        await persistMonthlyTotals(
          item.kitSerialNumber,
          detail.poolPlanMonthlyUsage ?? []
        );
        progress.reportStarlinkDone(
          item.kitSerialNumber,
          detail.standardTrafficSpent +
            detail.priorityTrafficSpent +
            detail.overageTrafficSpent
        );
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
  d: TototheoTerminalDetail,
  today: string
): Promise<void> {
  const lat = d.h3Coordinates?.lat ?? null;
  const lng = d.h3Coordinates?.lng ?? null;
  const lastFixAt = d.h3Coordinates?.timestamp
    ? new Date(d.h3Coordinates.timestamp * 1000)
    : null;
  const lastSeenAt = d.lastUpdated
    ? new Date(d.lastUpdated * 1000)
    : new Date();

  const terminalRow = {
    nickname: d.nickname || null,
    assetName: d.assetName || null,
    isOnline: d.isOnline,
    activated: d.activated,
    blocked: d.blocked,
    signalQuality: d.signalQuality ?? null,
    latency: d.latency ?? null,
    obstruction: d.obstruction ?? null,
    downloadSpeed: d.downloadSpeed ?? null,
    uploadSpeed: d.uploadSpeed ?? null,
    lat,
    lng,
    lastFixAt,
    activeAlertsCount: d.activeAlerts?.length ?? 0,
    lastSeenAt,
    updatedAt: new Date(),
  };
  await db
    .insert(starlinkTerminals)
    .values({ kitSerialNumber: d.kitSerialNumber, ...terminalRow })
    .onConflictDoUpdate({
      target: starlinkTerminals.kitSerialNumber,
      set: terminalRow,
    });

  // Daily snapshot — UPSERT today's row with cumulative cycle totals.
  // Last write of the day naturally captures the day's end-of-day reading.
  const standard = d.standardTrafficSpent ?? 0;
  const priority = d.priorityTrafficSpent ?? 0;
  const overage = d.overageTrafficSpent ?? 0;
  const packageUsage = standard + priority + overage;

  await db
    .insert(starlinkTerminalDaily)
    .values({
      kitSerialNumber: d.kitSerialNumber,
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

async function persistMonthlyTotals(
  kitSerialNumber: string,
  months: TototheoMonthlyUsage[]
): Promise<void> {
  for (const m of months) {
    if (!m.usage) continue;
    const period = `${m.year}${String(m.month).padStart(2, "0")}`;
    const pkg = m.usage.package_usage_gb ?? 0;
    const pri = m.usage.priority_gb ?? 0;
    const ovg = m.usage.overage_gb ?? 0;
    const total = pkg + pri + ovg;
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
