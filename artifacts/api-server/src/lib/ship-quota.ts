// ---------------------------------------------------------------------------
// Gemi internet satışı kota düşümü (Task #37).
//
// Bazı gemiler bant genişliğini üçüncü taraflara yeniden satıyor. Harici
// adegloba API'si her gemi için o ayki yeniden-satış hacmini (totalGb) sağlar;
// bu değer KIT'in ham kullanımından düşülüp "efektif" değer sistemin her
// yerinde (dashboard, liste, detay, e-posta/WhatsApp alarm karşılaştırması)
// gösterilir. Ana zamanlayıcıdan (scheduler.ts) tamamen bağımsız, saatlik
// çalışan ayrı bir görevdir.
// ---------------------------------------------------------------------------

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  shipQuotaSettings,
  shipQuotaDeductions,
  stationKits,
  starlinkTerminals,
  leobridgeTerminals,
} from "@workspace/db";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";

// Güvenlik: SSRF önlemi için endpoint sabittir — kullanıcı tarafından
// değiştirilemez (whatsapp.ts'teki host-pinleme yaklaşımıyla tutarlı).
const SHIP_QUOTA_ENDPOINT = "https://ads.adegloba.space/api/external/ship-quotas";

export type ShipQuotaSource = "satcom" | "starlink" | "leobridge";

// ---------------------------------------------------------------------------
// Settings (singleton id=1)
// ---------------------------------------------------------------------------

export type ShipQuotaSettingsView = {
  enabled: boolean;
  hasApiKey: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastErrorMessage: string | null;
  lastPeriod: string | null;
  updatedAt: Date;
};

function toSettingsView(
  row: typeof shipQuotaSettings.$inferSelect | undefined
): ShipQuotaSettingsView {
  if (!row) {
    return {
      enabled: false,
      hasApiKey: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastErrorMessage: null,
      lastPeriod: null,
      updatedAt: new Date(),
    };
  }
  return {
    enabled: row.enabled,
    hasApiKey: !!row.apiKeyEncrypted,
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
    lastErrorMessage: row.lastErrorMessage,
    lastPeriod: row.lastPeriod,
    updatedAt: row.updatedAt,
  };
}

export async function getShipQuotaSettings(): Promise<ShipQuotaSettingsView> {
  const [row] = await db
    .select()
    .from(shipQuotaSettings)
    .where(eq(shipQuotaSettings.id, 1));
  return toSettingsView(row);
}

export type ShipQuotaSettingsUpdate = {
  enabled?: boolean;
  // null/"" → temizle, undefined → değişmez, dolu → re-encrypt
  apiKey?: string | null;
};

export async function saveShipQuotaSettings(
  patch: ShipQuotaSettingsUpdate
): Promise<ShipQuotaSettingsView> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.apiKey !== undefined) {
    update.apiKeyEncrypted =
      patch.apiKey === null || patch.apiKey === "" ? null : encrypt(patch.apiKey);
  }

  await db
    .insert(shipQuotaSettings)
    .values({
      id: 1,
      enabled: (update.enabled as boolean | undefined) ?? false,
      apiKeyEncrypted:
        (update.apiKeyEncrypted as string | null | undefined) ?? null,
      updatedAt: update.updatedAt as Date,
    })
    .onConflictDoUpdate({ target: shipQuotaSettings.id, set: update });

  return getShipQuotaSettings();
}

// ---------------------------------------------------------------------------
// Matching helpers — KIT numarası önce, gemi adı (case-insensitive) sonra.
// Kaynaklar arasında öncelik yok; ilk bulunan kaynak kazanır (deduction
// credentialId'den bağımsız — o KIT'in "hangi kaynakta" olduğu yeterli).
// ---------------------------------------------------------------------------

type KitMatch = { source: ShipQuotaSource; kitNo: string };

async function findKitBySerial(kitNumber: string): Promise<KitMatch | null> {
  const trimmed = kitNumber.trim();
  if (!trimmed) return null;

  const [satcom] = await db
    .select({ kitNo: stationKits.kitNo })
    .from(stationKits)
    .where(sql`lower(${stationKits.kitNo}) = lower(${trimmed})`)
    .limit(1);
  if (satcom) return { source: "satcom", kitNo: satcom.kitNo };

  const [starlink] = await db
    .select({ kitNo: starlinkTerminals.kitSerialNumber })
    .from(starlinkTerminals)
    .where(sql`lower(${starlinkTerminals.kitSerialNumber}) = lower(${trimmed})`)
    .limit(1);
  if (starlink) return { source: "starlink", kitNo: starlink.kitNo };

  const [leobridge] = await db
    .select({ kitNo: leobridgeTerminals.kitSerialNumber })
    .from(leobridgeTerminals)
    .where(sql`lower(${leobridgeTerminals.kitSerialNumber}) = lower(${trimmed})`)
    .limit(1);
  if (leobridge) return { source: "leobridge", kitNo: leobridge.kitNo };

  return null;
}

async function findKitByShipName(shipName: string): Promise<KitMatch | null> {
  const trimmed = shipName.trim();
  if (!trimmed) return null;

  const [satcom] = await db
    .select({ kitNo: stationKits.kitNo })
    .from(stationKits)
    .where(sql`lower(${stationKits.shipName}) = lower(${trimmed})`)
    .limit(1);
  if (satcom) return { source: "satcom", kitNo: satcom.kitNo };

  const [starlink] = await db
    .select({ kitNo: starlinkTerminals.kitSerialNumber })
    .from(starlinkTerminals)
    .where(
      sql`lower(${starlinkTerminals.nickname}) = lower(${trimmed}) OR lower(${starlinkTerminals.assetName}) = lower(${trimmed})`
    )
    .limit(1);
  if (starlink) return { source: "starlink", kitNo: starlink.kitNo };

  const [leobridge] = await db
    .select({ kitNo: leobridgeTerminals.kitSerialNumber })
    .from(leobridgeTerminals)
    .where(sql`lower(${leobridgeTerminals.nickname}) = lower(${trimmed})`)
    .limit(1);
  if (leobridge) return { source: "leobridge", kitNo: leobridge.kitNo };

  return null;
}

// ---------------------------------------------------------------------------
// External sync
// ---------------------------------------------------------------------------

type ExternalShipQuotaResponse = {
  generatedAt?: string;
  period?: string; // "YYYY-MM"
  ships?: Array<{
    shipName?: string;
    kitNumber?: string | null;
    totalGb?: number;
  }>;
};

export type ShipQuotaSyncResult = {
  ok: boolean;
  period?: string;
  matched?: number;
  unmatched?: number;
  error?: string;
};

async function markSyncFailure(message: string): Promise<void> {
  await db
    .update(shipQuotaSettings)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: "failed",
      lastErrorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(shipQuotaSettings.id, 1));
}

let syncInProgress = false;

// Manuel "şimdi senkronize et" ve arka plan job'unun paylaştığı tek giriş
// noktası. In-memory bayrak eşzamanlı çift-çalışmayı engeller (whatsapp
// digest deseniyle tutarlı — process tekil olduğu için yeterli).
export async function syncShipQuotas(): Promise<ShipQuotaSyncResult> {
  if (syncInProgress) {
    return { ok: false, error: "Senkronizasyon zaten çalışıyor." };
  }
  syncInProgress = true;
  try {
    const [row] = await db
      .select()
      .from(shipQuotaSettings)
      .where(eq(shipQuotaSettings.id, 1));
    if (!row?.enabled) {
      return { ok: false, error: "Gemi kota düşümü devre dışı." };
    }
    if (!row.apiKeyEncrypted) {
      return { ok: false, error: "API anahtarı tanımlı değil." };
    }
    const apiKey = decrypt(row.apiKeyEncrypted);

    let payload: ExternalShipQuotaResponse;
    try {
      const res = await fetch(SHIP_QUOTA_ENDPOINT, {
        method: "GET",
        headers: { "x-api-key": apiKey, Accept: "application/json" },
      });
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
      }
      payload = JSON.parse(bodyText) as ExternalShipQuotaResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      await markSyncFailure(message);
      logger.error({ err }, "Gemi kota API çağrısı başarısız");
      return { ok: false, error: message };
    }

    if (!payload.period || !Array.isArray(payload.ships)) {
      const message = "Harici API yanıtı beklenmeyen formatta.";
      await markSyncFailure(message);
      return { ok: false, error: message };
    }

    // "YYYY-MM" → "YYYYMM"
    const period = payload.period.replace(/-/g, "");
    let matched = 0;
    let unmatched = 0;

    for (const ship of payload.ships) {
      const shipName = (ship.shipName ?? "").trim();
      const kitNumber = (ship.kitNumber ?? "").trim();
      const totalGb = Number(ship.totalGb);
      if (!shipName || !Number.isFinite(totalGb)) continue;

      let match = kitNumber ? await findKitBySerial(kitNumber) : null;
      let matchMethod: "kit" | "ship_name" | "none" = match ? "kit" : "none";
      if (!match) {
        match = await findKitByShipName(shipName);
        if (match) matchMethod = "ship_name";
      }
      if (match) matched++;
      else unmatched++;

      // Upsert — apiTotalGb/matched* alanları güncellenir, isActive ve
      // manual* alanlarına ASLA dokunulmaz (admin düzeltmesi korunur).
      await db
        .insert(shipQuotaDeductions)
        .values({
          period,
          externalShipName: shipName,
          externalKitNumber: kitNumber,
          apiTotalGb: totalGb,
          matchedSource: match?.source ?? null,
          matchedKitNo: match?.kitNo ?? null,
          matchMethod,
        })
        .onConflictDoUpdate({
          target: [
            shipQuotaDeductions.period,
            shipQuotaDeductions.externalKitNumber,
            shipQuotaDeductions.externalShipName,
          ],
          set: {
            apiTotalGb: totalGb,
            matchedSource: match?.source ?? null,
            matchedKitNo: match?.kitNo ?? null,
            matchMethod,
            updatedAt: new Date(),
          },
        });
    }

    await db
      .update(shipQuotaSettings)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastErrorMessage: null,
        lastPeriod: period,
        updatedAt: new Date(),
      })
      .where(eq(shipQuotaSettings.id, 1));

    logger.info(
      { period, matched, unmatched, total: payload.ships.length },
      "Gemi kota senkronizasyonu tamamlandı"
    );
    return { ok: true, period, matched, unmatched };
  } finally {
    syncInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Deduction lookup — her okuma/alarm noktasının kullandığı tek paylaşılan
// fonksiyon. Etkin (isActive) ve eşleşmiş/manuel-atanmış satırlar toplanır;
// aynı efektif KIT'e birden fazla dış gemi eşleşirse GB toplanır.
// ---------------------------------------------------------------------------

export async function getDeductionMapForPeriod(
  period: string,
  source: ShipQuotaSource
): Promise<Map<string, number>> {
  const [settingsRow] = await db
    .select({ enabled: shipQuotaSettings.enabled })
    .from(shipQuotaSettings)
    .where(eq(shipQuotaSettings.id, 1))
    .limit(1);
  if (!settingsRow?.enabled) return new Map();

  const rows = await db
    .select()
    .from(shipQuotaDeductions)
    .where(
      and(
        eq(shipQuotaDeductions.period, period),
        eq(shipQuotaDeductions.isActive, true)
      )
    );

  const map = new Map<string, number>();
  for (const row of rows) {
    const effectiveSource = (row.manualSource ??
      row.matchedSource) as ShipQuotaSource | null;
    const effectiveKitNo = row.manualKitNo ?? row.matchedKitNo;
    const effectiveGb = row.manualGb ?? row.apiTotalGb;
    if (!effectiveSource || !effectiveKitNo) continue;
    if (effectiveSource !== source) continue;
    if (!Number.isFinite(effectiveGb) || effectiveGb <= 0) continue;
    map.set(effectiveKitNo, (map.get(effectiveKitNo) ?? 0) + effectiveGb);
  }
  return map;
}

// Tek-KIT kısayolu (alarm call site'ları için) — aynı paylaşılan haritayı
// kullanır, ayrı bir sorgu yolu icat etmez.
export async function getDeductionForKit(
  period: string,
  source: ShipQuotaSource,
  kitNo: string
): Promise<number> {
  const map = await getDeductionMapForPeriod(period, source);
  return map.get(kitNo) ?? 0;
}

// Aylık geçmiş tabloları (/monthly uç noktaları) tek bir KIT için birden çok
// dönemi aynı anda listeler — N ayrı getDeductionMapForPeriod çağrısı yerine
// (her biri kendi enabled-kontrol sorgusuyla) tek `enabled` kontrolü + tek
// deductions sorgusuyla dönem→GB haritası döner.
export async function getDeductionsByPeriodForKit(
  periods: string[],
  source: ShipQuotaSource,
  kitNo: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (periods.length === 0) return result;

  const [settingsRow] = await db
    .select({ enabled: shipQuotaSettings.enabled })
    .from(shipQuotaSettings)
    .where(eq(shipQuotaSettings.id, 1))
    .limit(1);
  if (!settingsRow?.enabled) return result;

  const rows = await db
    .select()
    .from(shipQuotaDeductions)
    .where(
      and(
        inArray(shipQuotaDeductions.period, periods),
        eq(shipQuotaDeductions.isActive, true)
      )
    );

  for (const row of rows) {
    const effectiveSource = (row.manualSource ??
      row.matchedSource) as ShipQuotaSource | null;
    const effectiveKitNo = row.manualKitNo ?? row.matchedKitNo;
    const effectiveGb = row.manualGb ?? row.apiTotalGb;
    if (!effectiveSource || !effectiveKitNo) continue;
    if (effectiveSource !== source || effectiveKitNo !== kitNo) continue;
    if (!Number.isFinite(effectiveGb) || effectiveGb <= 0) continue;
    result.set(row.period, (result.get(row.period) ?? 0) + effectiveGb);
  }
  return result;
}

// rawGb'den deductionGb çıkarılır, 0'da taban (negatif olamaz).
export function applyDeduction(
  rawGb: number,
  deductionGb: number | null | undefined
): number {
  if (deductionGb == null || !Number.isFinite(deductionGb) || deductionGb <= 0) {
    return rawGb;
  }
  return Math.max(0, rawGb - deductionGb);
}

// ---------------------------------------------------------------------------
// Admin CRUD — eşleştirme tablosu (view + PATCH)
// ---------------------------------------------------------------------------

export type ShipQuotaDeductionView = {
  id: number;
  period: string;
  externalShipName: string;
  externalKitNumber: string;
  apiTotalGb: number;
  matchedSource: ShipQuotaSource | null;
  matchedKitNo: string | null;
  matchMethod: "kit" | "ship_name" | "none";
  manualSource: ShipQuotaSource | null;
  manualKitNo: string | null;
  manualGb: number | null;
  effectiveSource: ShipQuotaSource | null;
  effectiveKitNo: string | null;
  effectiveGb: number;
  isActive: boolean;
  updatedAt: Date;
};

function toDeductionView(
  row: typeof shipQuotaDeductions.$inferSelect
): ShipQuotaDeductionView {
  const effectiveSource = (row.manualSource ??
    row.matchedSource) as ShipQuotaSource | null;
  const effectiveKitNo = row.manualKitNo ?? row.matchedKitNo;
  const effectiveGb = row.manualGb ?? row.apiTotalGb;
  return {
    id: row.id,
    period: row.period,
    externalShipName: row.externalShipName,
    externalKitNumber: row.externalKitNumber,
    apiTotalGb: row.apiTotalGb,
    matchedSource: row.matchedSource as ShipQuotaSource | null,
    matchedKitNo: row.matchedKitNo,
    matchMethod: row.matchMethod as "kit" | "ship_name" | "none",
    manualSource: row.manualSource as ShipQuotaSource | null,
    manualKitNo: row.manualKitNo,
    manualGb: row.manualGb,
    effectiveSource,
    effectiveKitNo,
    effectiveGb,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  };
}

export async function listShipQuotaDeductions(
  period?: string
): Promise<ShipQuotaDeductionView[]> {
  const rows = period
    ? await db
        .select()
        .from(shipQuotaDeductions)
        .where(eq(shipQuotaDeductions.period, period))
        .orderBy(desc(shipQuotaDeductions.updatedAt))
    : await db
        .select()
        .from(shipQuotaDeductions)
        .orderBy(
          desc(shipQuotaDeductions.period),
          desc(shipQuotaDeductions.updatedAt)
        );
  return rows.map(toDeductionView);
}

export type ShipQuotaDeductionUpdate = {
  isActive?: boolean;
  // null → temizle (otomatik eşleşmeye dön), undefined → değişmez
  manualSource?: ShipQuotaSource | null;
  manualKitNo?: string | null;
  manualGb?: number | null;
};

export async function updateShipQuotaDeduction(
  id: number,
  patch: ShipQuotaDeductionUpdate
): Promise<ShipQuotaDeductionView | null> {
  // manualSource ve manualKitNo her zaman birlikte set/clear edilmeli — biri
  // set edilip diğeri boş kalırsa effectiveKitNo yanlış kaynağın (matchedSource)
  // KIT numarasına düşer ve sessizce yanlış terminali/kaynağı düşer.
  if (patch.manualSource !== undefined || patch.manualKitNo !== undefined) {
    const [existing] = await db
      .select({
        manualSource: shipQuotaDeductions.manualSource,
        manualKitNo: shipQuotaDeductions.manualKitNo,
      })
      .from(shipQuotaDeductions)
      .where(eq(shipQuotaDeductions.id, id));
    const resultingSource =
      patch.manualSource !== undefined ? patch.manualSource : existing?.manualSource ?? null;
    const resultingKitNo =
      patch.manualKitNo !== undefined ? patch.manualKitNo : existing?.manualKitNo ?? null;
    if ((resultingSource == null) !== (resultingKitNo == null)) {
      throw new Error(
        "manualSource ve manualKitNo birlikte ayarlanmalı veya birlikte temizlenmeli."
      );
    }
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.isActive !== undefined) update.isActive = patch.isActive;
  if (patch.manualSource !== undefined) update.manualSource = patch.manualSource;
  if (patch.manualKitNo !== undefined) update.manualKitNo = patch.manualKitNo;
  if (patch.manualGb !== undefined) update.manualGb = patch.manualGb;

  const [row] = await db
    .update(shipQuotaDeductions)
    .set(update)
    .where(eq(shipQuotaDeductions.id, id))
    .returning();
  return row ? toDeductionView(row) : null;
}

// ---------------------------------------------------------------------------
// Boot / interval wiring — ana zamanlayıcıdan bağımsız, saatlik.
// whatsapp.ts'teki günlük digest deseniyle tutarlı: dakikada bir kontrol,
// son senkrondan 1 saatten fazla geçmişse (veya hiç yapılmamışsa) çalıştır.
// Bu sayede boot sonrası downtime catch-up otomatik olur.
// ---------------------------------------------------------------------------

const SHIP_QUOTA_SYNC_STALE_MS = 60 * 60 * 1000;

async function runShipQuotaSyncIfDue(): Promise<void> {
  try {
    const settings = await getShipQuotaSettings();
    if (!settings.enabled || !settings.hasApiKey) return;
    if (
      settings.lastSyncAt &&
      Date.now() - settings.lastSyncAt.getTime() < SHIP_QUOTA_SYNC_STALE_MS
    ) {
      return;
    }
    await syncShipQuotas();
  } catch (err) {
    logger.error({ err }, "runShipQuotaSyncIfDue hatası");
  }
}

let shipQuotaSyncTimer: ReturnType<typeof setInterval> | null = null;
export function startShipQuotaSync(): void {
  if (shipQuotaSyncTimer) clearInterval(shipQuotaSyncTimer);
  shipQuotaSyncTimer = setInterval(() => {
    void runShipQuotaSyncIfDue();
  }, 60_000);
  void runShipQuotaSyncIfDue();
}
