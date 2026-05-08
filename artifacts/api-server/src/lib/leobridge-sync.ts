import {
  db,
  leobridgeSettings,
  leobridgeTerminals,
  leobridgeTerminalDaily,
  leobridgeTerminalPeriodTotal,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { decrypt } from "./crypto";
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

async function loadConfig(): Promise<LeobridgeConfig | null> {
  const [row] = await db
    .select()
    .from(leobridgeSettings)
    .where(eq(leobridgeSettings.id, 1))
    .limit(1);
  if (!row || !row.enabled) return null;
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
  if (
    sl.address &&
    typeof sl.address.latitude === "number" &&
    typeof sl.address.longitude === "number"
  ) {
    return { lat: sl.address.latitude, lng: sl.address.longitude };
  }
  // Fallback to first terminal's H3 cell center.
  const t = sl.terminals?.find((t) => t.currentH3Cell);
  if (
    t?.currentH3Cell &&
    typeof t.currentH3Cell.centerLat === "number" &&
    typeof t.currentH3Cell.centerLon === "number"
  ) {
    return { lat: t.currentH3Cell.centerLat, lng: t.currentH3Cell.centerLon };
  }
  return { lat: null, lng: null };
}

async function persistTerminal(
  kitSerialNumber: string,
  sl: LeoServiceLine
): Promise<void> {
  const { lat, lng } = pickLatLng(sl);
  const isOnline = sl.terminals?.some((t) => t.active === true) ?? null;
  const now = new Date();
  await db
    .insert(leobridgeTerminals)
    .values({
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
      target: leobridgeTerminals.kitSerialNumber,
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
  kitSerialNumber: string,
  sl: LeoServiceLine
): Promise<void> {
  const periods = await client.getDataUsage(sl.serviceLineNumber);
  for (const p of periods) {
    const periodKey = periodFromStartDate(p.startDate);
    if (!periodKey) continue;
    const totalGb = (p.totalPriorityGb ?? 0) + (p.totalStandardGb ?? 0);
    await db
      .insert(leobridgeTerminalPeriodTotal)
      .values({
        kitSerialNumber,
        period: periodKey,
        priorityGb: p.totalPriorityGb,
        standardGb: p.totalStandardGb,
        totalGb,
        scrapedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
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
          kitSerialNumber,
          dayDate: d.date,
          priorityGb: d.priorityGb,
          standardGb: d.standardGb,
          totalGb: dailyTotal,
          lastReadingAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
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

async function markSettings(
  ok: boolean,
  message?: string | null
): Promise<void> {
  await db
    .update(leobridgeSettings)
    .set({
      lastSyncAt: new Date(),
      lastErrorMessage: ok ? null : (message ?? "bilinmeyen hata"),
      updatedAt: new Date(),
    })
    .where(eq(leobridgeSettings.id, 1));
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
  try {
    const cfg = await loadConfig();
    if (!cfg) {
      progress.startLeobridgePhase(0);
      progress.finishLeobridgePhase(
        "Leo Bridge devre dışı veya yapılandırılmamış.",
        true
      );
      return {
        success: true,
        message: "Leo Bridge devre dışı veya yapılandırılmamış.",
        terminalCount: 0,
        failures: 0,
      };
    }
    const client = new LeobridgeClient(cfg);
    await client.login();
    const lines = await client.listServiceLines();
    // Each service line maps to (potentially several) terminals; we treat every
    // active terminal as its own row keyed by KIT serial.
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
      progress.startLeobridgeTerminal(kit, sl.nickname ?? null, processed);
      try {
        await persistTerminal(kit, sl);
        await persistUsage(client, kit, sl);
        progress.reportLeobridgeDone();
      } catch (err) {
        failures += 1;
        progress.reportLeobridgeFailure(
          kit,
          (err as Error).message ?? "hata"
        );
        logger.error({ err, kit }, "Leo Bridge terminal sync hatası");
      }
      processed += 1;
    }

    const ok = failures === 0;
    await markSettings(ok, ok ? null : `${failures} terminal başarısız`);
    progress.finishLeobridgePhase(
      ok
        ? `Leo Bridge tamam: ${total} terminal güncellendi.`
        : `Leo Bridge ${failures}/${total} terminal başarısız.`,
      ok
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
    await markSettings(false, msg);
    progress.finishLeobridgePhase(`Leo Bridge hata: ${msg}`, false);
    return { success: false, message: msg, terminalCount: total, failures };
  } finally {
    release();
  }
}

export async function testLeobridgeConnection(
  cfg: LeobridgeConfig
): Promise<{ success: boolean; message: string; terminalCount: number }> {
  try {
    const client = new LeobridgeClient(cfg);
    await client.login();
    const lines = await client.listServiceLines();
    const terminalCount = lines.reduce(
      (n, l) => n + (l.terminals?.length ?? 0),
      0
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

// Used by /healthz dashboards to confirm the singleton row exists.
export async function ensureLeobridgeSettingsRow(): Promise<void> {
  await db
    .insert(leobridgeSettings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: leobridgeSettings.id });
  // Touch updatedAt only when first creating; conflict no-op leaves it.
  void sql;
}
