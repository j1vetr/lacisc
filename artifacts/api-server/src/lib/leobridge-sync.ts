import {
  db,
  leobridgeCredentials,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
  type LeobridgeCredentials,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";
import {
  LeobridgeClient,
  type LeobridgeConfig,
  type LeoServiceLine,
  periodFromStartDate,
} from "./leobridge";
import * as progress from "./sync-progress";

let leobridgeRunning = false;

export function isLeobridgeSyncRunning(): boolean {
  return leobridgeRunning;
}

function tryClaim(): boolean {
  if (leobridgeRunning) return false;
  leobridgeRunning = true;
  return true;
}

function release(): void {
  leobridgeRunning = false;
}

export interface LeobridgeSyncResult {
  success: boolean;
  message: string;
  terminalCount: number;
  failures: number;
}

export interface LeobridgeSettingsView {
  enabled: boolean;
  portalUrl: string;
  username: string | null;
  hasPassword: boolean;
  lastSyncAt: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

export interface LeobridgeSettingsPatch {
  enabled?: boolean;
  portalUrl?: string;
  username?: string | null;
  // undefined = keep, null/'' = clear (pasifleştir, sil değil),
  // string = set new
  password?: string | null;
}

const DEFAULT_PORTAL_URL = "https://leobridge.spacenorway.com";

// T001 shim — frontend `useGetLeobridgeSettings` halen tek-hesap formatı
// bekliyor; T004'te yeni "Hesaplar" sayfası gelene kadar ilk active
// credential'ı singleton gibi sunuyoruz.
async function firstActiveCredential(): Promise<LeobridgeCredentials | null> {
  const [row] = await db
    .select()
    .from(leobridgeCredentials)
    .orderBy(asc(leobridgeCredentials.id))
    .limit(1);
  return row ?? null;
}

export async function getLeobridgeSettingsView(): Promise<LeobridgeSettingsView> {
  const row = await firstActiveCredential();
  if (!row) {
    return {
      enabled: false,
      portalUrl: DEFAULT_PORTAL_URL,
      username: null,
      hasPassword: false,
      lastSyncAt: null,
      lastErrorMessage: null,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    enabled: row.isActive,
    portalUrl: row.portalUrl,
    username: row.username ?? null,
    hasPassword: !!row.encryptedPassword,
    lastSyncAt: row.lastSuccessSyncAt
      ? row.lastSuccessSyncAt.toISOString()
      : null,
    lastErrorMessage: row.lastErrorMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveLeobridgeSettings(
  patch: LeobridgeSettingsPatch,
): Promise<LeobridgeSettingsView> {
  const row = await firstActiveCredential();
  if (row) {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.enabled !== undefined) update.isActive = patch.enabled;
    if (patch.portalUrl !== undefined) {
      update.portalUrl =
        patch.portalUrl.trim().replace(/\/+$/, "") || DEFAULT_PORTAL_URL;
    }
    if (patch.username !== undefined && patch.username !== null) {
      const u = patch.username.trim();
      if (u) update.username = u;
    }
    if (typeof patch.password === "string" && patch.password.length > 0) {
      update.encryptedPassword = encrypt(patch.password);
    }
    await db
      .update(leobridgeCredentials)
      .set(update)
      .where(eq(leobridgeCredentials.id, row.id));
  } else if (
    typeof patch.username === "string" &&
    patch.username.trim() &&
    typeof patch.password === "string" &&
    patch.password.length > 0
  ) {
    // İlk kez kuruluyor.
    await db.insert(leobridgeCredentials).values({
      label: "Varsayılan",
      portalUrl:
        patch.portalUrl?.trim().replace(/\/+$/, "") || DEFAULT_PORTAL_URL,
      username: patch.username.trim(),
      encryptedPassword: encrypt(patch.password),
      isActive: patch.enabled ?? true,
    });
  }
  return getLeobridgeSettingsView();
}

async function loadConfig(): Promise<LeobridgeConfig | null> {
  const row = await firstActiveCredential();
  if (!row || !row.isActive) return null;
  if (!row.username || !row.encryptedPassword) return null;
  let password = "";
  try {
    password = decrypt(row.encryptedPassword);
  } catch (err) {
    logger.error({ err }, "Leo Bridge şifre çözülemedi");
    return null;
  }
  return {
    portalUrl: row.portalUrl,
    username: row.username,
    password,
  };
}

function pickLatLng(sl: LeoServiceLine): {
  lat: number | null;
  lng: number | null;
} {
  const t = sl.terminals?.find((t) => t.currentH3Cell);
  if (
    t?.currentH3Cell &&
    typeof t.currentH3Cell.centerLat === "number" &&
    typeof t.currentH3Cell.centerLon === "number"
  ) {
    return { lat: t.currentH3Cell.centerLat, lng: t.currentH3Cell.centerLon };
  }
  if (
    sl.address &&
    typeof sl.address.latitude === "number" &&
    typeof sl.address.longitude === "number"
  ) {
    return { lat: sl.address.latitude, lng: sl.address.longitude };
  }
  return { lat: null, lng: null };
}

async function persistTerminal(
  credentialId: number,
  kitSerialNumber: string,
  sl: LeoServiceLine,
): Promise<void> {
  const { lat, lng } = pickLatLng(sl);
  const isOnline = sl.terminals?.some((t) => t.active === true) ?? null;
  const now = new Date();
  await db
    .insert(leobridgeTerminals)
    .values({
      credentialId,
      kitSerialNumber,
      serviceLineNumber: sl.serviceLineNumber,
      nickname: sl.nickname,
      addressLabel: sl.address?.formattedAddress ?? null,
      lat,
      lng,
      isOnline,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        leobridgeTerminals.credentialId,
        leobridgeTerminals.kitSerialNumber,
      ],
      set: {
        serviceLineNumber: sl.serviceLineNumber,
        nickname: sl.nickname,
        addressLabel: sl.address?.formattedAddress ?? null,
        lat,
        lng,
        isOnline,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
}

async function persistUsage(
  client: LeobridgeClient,
  credentialId: number,
  kitSerialNumber: string,
  sl: LeoServiceLine,
): Promise<void> {
  const periods = await client.getDataUsage(sl.serviceLineNumber);
  for (const p of periods) {
    const periodKey = periodFromStartDate(p.startDate);
    if (!periodKey) continue;
    const totalGb = (p.totalPriorityGb ?? 0) + (p.totalStandardGb ?? 0);
    await db
      .insert(leobridgeTerminalPeriodTotal)
      .values({
        credentialId,
        kitSerialNumber,
        period: periodKey,
        priorityGb: p.totalPriorityGb,
        standardGb: p.totalStandardGb,
        totalGb,
        scrapedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          leobridgeTerminalPeriodTotal.credentialId,
          leobridgeTerminalPeriodTotal.kitSerialNumber,
          leobridgeTerminalPeriodTotal.period,
        ],
        set: {
          priorityGb: p.totalPriorityGb,
          standardGb: p.totalStandardGb,
          totalGb,
          scrapedAt: new Date(),
        },
      });

    for (const d of p.dailyUsages ?? []) {
      const dailyTotal = (d.priorityGb ?? 0) + (d.standardGb ?? 0);
      await db
        .insert(leobridgeTerminalDaily)
        .values({
          credentialId,
          kitSerialNumber,
          dayDate: d.date,
          priorityGb: d.priorityGb,
          standardGb: d.standardGb,
          totalGb: dailyTotal,
          lastReadingAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            leobridgeTerminalDaily.credentialId,
            leobridgeTerminalDaily.kitSerialNumber,
            leobridgeTerminalDaily.dayDate,
          ],
          set: {
            priorityGb: d.priorityGb,
            standardGb: d.standardGb,
            totalGb: dailyTotal,
            lastReadingAt: new Date(),
          },
        });
    }
  }
}

async function markCredential(
  credentialId: number,
  ok: boolean,
  message?: string | null,
): Promise<void> {
  await db
    .update(leobridgeCredentials)
    .set({
      lastSuccessSyncAt: new Date(),
      lastErrorMessage: ok ? null : (message ?? "bilinmeyen hata"),
      updatedAt: new Date(),
    })
    .where(eq(leobridgeCredentials.id, credentialId));
}

export async function runLeobridgeSync(): Promise<LeobridgeSyncResult> {
  if (!tryClaim()) {
    return {
      success: false,
      message: "Leo Bridge senkronizasyonu zaten çalışıyor.",
      terminalCount: 0,
      failures: 0,
    };
  }
  let failures = 0;
  let processed = 0;
  let total = 0;
  let credentialId = 0;
  try {
    const row = await firstActiveCredential();
    const cfg = await loadConfig();
    if (!cfg || !row) {
      progress.startLeobridgePhase(0);
      progress.finishLeobridgePhase(
        "Leo Bridge devre dışı veya yapılandırılmamış.",
        true,
      );
      return {
        success: true,
        message: "Leo Bridge devre dışı veya yapılandırılmamış.",
        terminalCount: 0,
        failures: 0,
      };
    }
    credentialId = row.id;
    const client = new LeobridgeClient(cfg);
    await client.login();
    const lines = await client.listServiceLines();
    const tasks: { kit: string; sl: LeoServiceLine }[] = [];
    for (const sl of lines) {
      for (const t of sl.terminals ?? []) {
        if (!t.kitSerialNumber) continue;
        tasks.push({ kit: t.kitSerialNumber, sl });
      }
    }
    total = tasks.length;
    progress.startLeobridgePhase(total);

    for (const { kit, sl } of tasks) {
      processed += 1;
      progress.startLeobridgeTerminal(kit, sl.nickname ?? null, processed);
      try {
        await persistTerminal(credentialId, kit, sl);
        await persistUsage(client, credentialId, kit, sl);
        progress.reportLeobridgeDone();
      } catch (err) {
        failures += 1;
        progress.reportLeobridgeFailure(
          kit,
          (err as Error).message ?? "hata",
        );
        logger.error({ err, kit }, "Leo Bridge terminal sync hatası");
      }
    }

    const ok = failures === 0;
    await markCredential(credentialId, ok, ok ? null : `${failures} terminal başarısız`);
    progress.finishLeobridgePhase(
      ok
        ? `Leo Bridge tamam: ${total} terminal güncellendi.`
        : `Leo Bridge ${failures}/${total} terminal başarısız.`,
      ok,
    );
    return {
      success: ok,
      message: ok
        ? `${total} terminal güncellendi`
        : `${failures} terminal başarısız`,
      terminalCount: total,
      failures,
    };
  } catch (err) {
    const msg = (err as Error).message ?? "bilinmeyen hata";
    logger.error({ err }, "Leo Bridge senkronizasyonu çöktü");
    if (credentialId) await markCredential(credentialId, false, msg);
    progress.finishLeobridgePhase(`Leo Bridge hata: ${msg}`, false);
    return { success: false, message: msg, terminalCount: total, failures };
  } finally {
    release();
  }
}

export async function testLeobridgeConnection(
  cfg: LeobridgeConfig,
): Promise<{ success: boolean; message: string; terminalCount: number }> {
  try {
    const client = new LeobridgeClient(cfg);
    await client.login();
    const lines = await client.listServiceLines();
    const terminalCount = lines.reduce(
      (n, l) => n + (l.terminals?.length ?? 0),
      0,
    );
    return {
      success: true,
      message: `Bağlantı başarılı. ${lines.length} servis hattı, ${terminalCount} terminal bulundu.`,
      terminalCount,
    };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message ?? "bilinmeyen hata",
      terminalCount: 0,
    };
  }
}

// Kept for backwards compatibility: dashboard healthz checks still call this
// to ensure the singleton row exists. With multi-account it's a no-op (we
// never auto-create an empty credential row — the operator must add one
// via the Hesaplar page).
export async function ensureLeobridgeSettingsRow(): Promise<void> {
  // intentionally no-op (T001 shim)
}

// Decrypt the stored password for the active credential — used by the
// "Test Bağlantı" flow when the operator hits Test without re-entering it.
export async function getActiveLeobridgeDecryptedPassword(): Promise<string | null> {
  const row = await firstActiveCredential();
  if (!row?.encryptedPassword) return null;
  try {
    return decrypt(row.encryptedPassword);
  } catch {
    return null;
  }
}
