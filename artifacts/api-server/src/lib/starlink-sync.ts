import {
  db,
  starlinkCredentials,
  starlinkSyncLogs,
  starlinkTerminals,
  starlinkTerminalDaily,
  starlinkTerminalPeriodTotal,
  type StarlinkCredentials,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";
import {
  TototheoClient,
  pickField,
  type RawTototheoDetail,
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

// T001 shim — singleton API'sini koruyarak çoklu hesap (credentials)
// tablosuna yönlendiriyor. Frontend `useGetStarlinkSettings` halen tek
// hesap formatı bekliyor; T004'te yeni "Hesaplar" sayfası gelene kadar bu
// helper "ilk active credential"ı singleton gibi sunuyor.
async function firstActiveCredential(): Promise<StarlinkCredentials | null> {
  const [row] = await db
    .select()
    .from(starlinkCredentials)
    .orderBy(asc(starlinkCredentials.id))
    .limit(1);
  return row ?? null;
}

export async function getStarlinkSettingsView(): Promise<StarlinkSettingsView> {
  const row = await firstActiveCredential();
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
    enabled: row.isActive,
    apiBaseUrl: row.apiBaseUrl,
    hasToken: !!row.encryptedToken,
    lastSyncAt: row.lastSuccessSyncAt
      ? row.lastSuccessSyncAt.toISOString()
      : null,
    lastErrorMessage: row.lastErrorMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface StarlinkSettingsPatch {
  enabled?: boolean;
  apiBaseUrl?: string;
  // undefined = keep, null/'' = clear (no-op since encrypted_token NOT NULL),
  // string = set new
  token?: string | null;
}

export async function saveStarlinkSettings(
  patch: StarlinkSettingsPatch,
): Promise<StarlinkSettingsView> {
  const row = await firstActiveCredential();
  if (row) {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.enabled !== undefined) update.isActive = patch.enabled;
    if (patch.apiBaseUrl !== undefined) {
      update.apiBaseUrl = patch.apiBaseUrl.trim() || DEFAULT_BASE_URL;
    }
    // encrypted_token NOT NULL — clear istenirse satırı pasifleştir, sil değil.
    if (typeof patch.token === "string" && patch.token.length > 0) {
      update.encryptedToken = encrypt(patch.token);
    }
    await db
      .update(starlinkCredentials)
      .set(update)
      .where(eq(starlinkCredentials.id, row.id));
  } else if (typeof patch.token === "string" && patch.token.length > 0) {
    // İlk kez kuruluyor.
    await db.insert(starlinkCredentials).values({
      label: "Varsayılan",
      apiBaseUrl: patch.apiBaseUrl?.trim() || DEFAULT_BASE_URL,
      encryptedToken: encrypt(patch.token),
      isActive: patch.enabled ?? true,
    });
  }
  return getStarlinkSettingsView();
}

export async function testStarlinkConnection(
  apiBaseUrl: string,
  token: string | null,
): Promise<{ success: boolean; message: string; terminalCount?: number }> {
  let effectiveToken = token;
  if (!effectiveToken) {
    const row = await firstActiveCredential();
    if (!row?.encryptedToken) {
      return { success: false, message: "Token kaydedilmemiş." };
    }
    try {
      effectiveToken = decrypt(row.encryptedToken);
    } catch {
      return { success: false, message: "Kayıtlı token çözülemedi." };
    }
  }
  try {
    const client = new TototheoClient(
      apiBaseUrl || DEFAULT_BASE_URL,
      effectiveToken,
    );
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

// T002 — tüm aktif credential'ları sırayla gezer; bir hesap düşerse
// diğerleri devam eder. Her hesap için ayrı `starlink_sync_logs` satırı.
async function runInner(): Promise<StarlinkSyncResult> {
  const creds = await db
    .select()
    .from(starlinkCredentials)
    .where(eq(starlinkCredentials.isActive, true))
    .orderBy(asc(starlinkCredentials.id));

  if (creds.length === 0) {
    return {
      success: false,
      message: "Aktif Starlink hesabı yok.",
      terminalCount: 0,
      errors: [],
    };
  }

  progress.startStarlinkPhase();

  let totalTerminals = 0;
  let totalProcessed = 0;
  const allErrors: string[] = [];
  let allSuccess = true;

  for (const cred of creds) {
    const credLabel = cred.label?.trim() || `#${cred.id}`;
    const logId = await openSyncLog(cred.id);
    progress.pushEvent("info", `Starlink hesap "${credLabel}" başlatıldı.`);
    try {
      const r = await syncOneCredential(cred, totalProcessed);
      totalTerminals += r.terminalCount;
      totalProcessed += r.terminalCount;
      allErrors.push(...r.errors);
      if (!r.success) allSuccess = false;
      await closeSyncLog(logId, r);
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(
        { err, credentialId: cred.id, label: credLabel },
        "Starlink credential sync crashed",
      );
      allErrors.push(`${credLabel}: ${msg}`);
      allSuccess = false;
      await markCredentialFailure(cred.id, msg);
      await closeSyncLog(logId, {
        success: false,
        message: msg,
        terminalCount: 0,
        errors: [msg],
      });
      progress.pushEvent("error", `Starlink hesap "${credLabel}": ${msg}`);
      // Diğer credential'lara devam — error isolation.
    }
  }

  const summary =
    allErrors.length === 0
      ? `Starlink OK — ${creds.length} hesap, ${totalTerminals} terminal güncellendi.`
      : allSuccess
        ? `Starlink kısmen — ${totalTerminals} terminal, ${allErrors.length} hata.`
        : `Starlink başarısız — ${allErrors.length} hata.`;

  progress.finishStarlinkPhase(summary, allSuccess);
  return {
    success: allSuccess,
    message: summary,
    terminalCount: totalTerminals,
    errors: allErrors,
  };
}

async function syncOneCredential(
  cred: StarlinkCredentials,
  indexOffset: number,
): Promise<StarlinkSyncResult> {
  const credLabel = cred.label?.trim() || `#${cred.id}`;
  let token: string;
  try {
    token = decrypt(cred.encryptedToken);
  } catch (err) {
    logger.error(
      { err, credentialId: cred.id },
      "Starlink token decrypt failed",
    );
    await markCredentialFailure(cred.id, "Token çözülemedi.");
    return {
      success: false,
      message: "Token çözülemedi.",
      terminalCount: 0,
      errors: ["decrypt"],
    };
  }

  const client = new TototheoClient(cred.apiBaseUrl, token);
  const errors: string[] = [];
  const list = await client.getTerminalList();
  progress.bumpStarlinkPlan(list.length, credLabel);

  const year = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);

  let processed = 0;
  let loggedShape = false;
  for (const item of list) {
    processed += 1;
    const label = item.nickname || item.assetName || item.kitSerialNumber;
    progress.startStarlinkTerminal(
      item.kitSerialNumber,
      `${label} (${credLabel})`,
      indexOffset + processed,
    );
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
      if (!loggedShape) {
        loggedShape = true;
        logger.info(
          {
            credentialId: cred.id,
            kitSerialNumber: item.kitSerialNumber,
            detailKeys: Object.keys(detail),
          },
          "Tototheo detail shape (first terminal of credential)",
        );
      }
      await persistTerminal(cred.id, detail, item.kitSerialNumber, today);
      const monthsRaw = pickField<unknown>(
        detail,
        "poolPlanMonthlyUsage",
        "pool_plan_monthly_usage",
      );
      await persistMonthlyTotals(
        cred.id,
        item.kitSerialNumber,
        flattenMonths(monthsRaw),
      );
      const standard =
        pickField<number>(
          detail,
          "standardTrafficSpent",
          "standard_traffic_spent",
        ) ?? 0;
      const priority =
        pickField<number>(
          detail,
          "priorityTrafficSpent",
          "priority_traffic_spent",
        ) ?? 0;
      const overage =
        pickField<number>(
          detail,
          "overageTrafficSpent",
          "overage_traffic_spent",
        ) ?? 0;
      progress.reportStarlinkDone(
        item.kitSerialNumber,
        standard + priority + overage,
      );
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${item.kitSerialNumber}: ${msg}`);
      logger.error(
        { err, credentialId: cred.id, kitSerialNumber: item.kitSerialNumber },
        "Starlink terminal sync failed",
      );
      progress.reportStarlinkFailure(item.kitSerialNumber, msg);
    }
  }

  const success = list.length === 0 || errors.length < list.length;
  const message =
    errors.length === 0
      ? `${credLabel}: ${list.length} terminal güncellendi.`
      : success
        ? `${credLabel}: ${list.length - errors.length}/${list.length} başarılı.`
        : `${credLabel}: tüm terminal hataları.`;

  await db
    .update(starlinkCredentials)
    .set({
      lastSuccessSyncAt: success ? new Date() : cred.lastSuccessSyncAt,
      lastErrorMessage: errors.length > 0 ? errors[0] : null,
      updatedAt: new Date(),
    })
    .where(eq(starlinkCredentials.id, cred.id));

  return {
    success,
    message,
    terminalCount: list.length,
    errors,
  };
}

async function markCredentialFailure(
  credentialId: number,
  msg: string,
): Promise<void> {
  await db
    .update(starlinkCredentials)
    .set({
      lastErrorMessage: msg,
      updatedAt: new Date(),
    })
    .where(eq(starlinkCredentials.id, credentialId));
}

async function openSyncLog(credentialId: number): Promise<number> {
  const [row] = await db
    .insert(starlinkSyncLogs)
    .values({
      credentialId,
      status: "running",
    })
    .returning({ id: starlinkSyncLogs.id });
  return row.id;
}

async function closeSyncLog(
  logId: number,
  result: StarlinkSyncResult,
): Promise<void> {
  await db
    .update(starlinkSyncLogs)
    .set({
      status: result.success ? "ok" : "error",
      message: result.message,
      recordsFound: result.terminalCount,
      finishedAt: new Date(),
    })
    .where(eq(starlinkSyncLogs.id, logId));
}

// `and` helper kept for future per-credential filters in routes/starlink.ts.
void and;

async function persistTerminal(
  credentialId: number,
  d: RawTototheoDetail,
  kitSerialNumber: string,
  today: string,
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
    signalQuality:
      pickField<number>(d, "signalQuality", "signal_quality") ?? null,
    latency: pickField<number>(d, "latency") ?? null,
    obstruction: pickField<number>(d, "obstruction") ?? null,
    downloadSpeed:
      pickField<number>(d, "downloadSpeed", "download_speed") ?? null,
    uploadSpeed: pickField<number>(d, "uploadSpeed", "upload_speed") ?? null,
    lat,
    lng,
    lastFixAt,
    activeAlertsCount: Array.isArray(activeAlerts) ? activeAlerts.length : 0,
    lastSeenAt,
    plan: pickField<string>(d, "plan") ?? null,
    planAllowanceGb:
      pickField<number>(
        d,
        "planAllowanceGB",
        "plan_allowance_gb",
        "planAllowanceGb",
      ) ?? null,
    ipv4: (() => {
      const raw = pickField<unknown>(d, "ipv4");
      if (Array.isArray(raw)) {
        return (
          raw.filter((v) => typeof v === "string" && v.trim()).join(", ") ||
          null
        );
      }
      if (typeof raw === "string") return raw.trim() || null;
      return null;
    })(),
    optIn: pickField<boolean>(d, "optIn", "opt_in") ?? null,
    pingDropRate: pickField<number>(d, "pingDropRate", "ping_drop_rate") ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(starlinkTerminals)
    .values({ credentialId, kitSerialNumber, ...terminalRow })
    .onConflictDoUpdate({
      target: [
        starlinkTerminals.credentialId,
        starlinkTerminals.kitSerialNumber,
      ],
      set: terminalRow,
    });

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
      credentialId,
      kitSerialNumber,
      dayDate: today,
      packageUsageGb: packageUsage,
      priorityGb: priority,
      overageGb: overage,
      lastReadingAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        starlinkTerminalDaily.credentialId,
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
  credentialId: number,
  kitSerialNumber: string,
  months: RawTototheoDetail[],
): Promise<void> {
  for (const m of months) {
    const usage = pickField<RawTototheoDetail>(m, "usage");
    if (!usage) continue;
    const year = pickField<number>(m, "year");
    const month = pickField<number>(m, "month");
    if (year === undefined || month === undefined) continue;
    const period = `${year}${String(month).padStart(2, "0")}`;
    const pkg =
      pickField<number>(usage, "package_usage_gb", "packageUsageGb") ?? 0;
    const pri = pickField<number>(usage, "priority_gb", "priorityGb") ?? 0;
    const ovg = pickField<number>(usage, "overage_gb", "overageGb") ?? 0;
    const total = pkg;
    await db
      .insert(starlinkTerminalPeriodTotal)
      .values({
        credentialId,
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
          starlinkTerminalPeriodTotal.credentialId,
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
