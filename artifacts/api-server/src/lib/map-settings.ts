// ---------------------------------------------------------------------------
// CARTO harita ayarları (Task #48)
// ---------------------------------------------------------------------------
// Singleton (id=1). Anahtar AES-256-GCM ile şifreli saklanır; UI ve API
// yanıtları yalnız `hasApiKey` boolean'ını döner — gerçek değer asla açılmaz.
// Tile proxy (/map/tiles/:z/:x/:y) çözülmüş anahtarı CARTO'ya iletir.

import { db, mapSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";

// ---------------------------------------------------------------------------
// Görünüm tipi — gerçek anahtar asla dışarı çıkmaz
// ---------------------------------------------------------------------------

export type MapSettingsView = {
  hasApiKey: boolean;
  updatedAt: Date;
};

function toView(
  row: typeof mapSettings.$inferSelect | undefined
): MapSettingsView {
  return {
    hasApiKey: !!row?.apiKeyEncrypted,
    updatedAt: row?.updatedAt ?? new Date(0),
  };
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

export async function getMapSettings(): Promise<MapSettingsView> {
  const [row] = await db
    .select()
    .from(mapSettings)
    .where(eq(mapSettings.id, 1));
  return toView(row);
}

// ---------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------

export type MapSettingsUpdate = {
  /** undefined → değişmez, '' | null → temizler, dolu → yeni anahtar */
  apiKey?: string | null;
};

export async function saveMapSettings(
  patch: MapSettingsUpdate
): Promise<MapSettingsView> {
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.apiKey !== undefined) {
    update.apiKeyEncrypted =
      patch.apiKey === null || patch.apiKey === ""
        ? null
        : encrypt(patch.apiKey);
  }

  await db
    .insert(mapSettings)
    .values({
      id: 1,
      apiKeyEncrypted:
        (update.apiKeyEncrypted as string | null | undefined) ?? null,
      updatedAt: update.updatedAt as Date,
    })
    .onConflictDoUpdate({ target: mapSettings.id, set: update });

  return getMapSettings();
}

// ---------------------------------------------------------------------------
// Dahili: tile proxy için çözülmüş anahtar
// ---------------------------------------------------------------------------

export async function getDecryptedMapApiKey(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(mapSettings)
    .where(eq(mapSettings.id, 1));
  if (!row?.apiKeyEncrypted) return null;
  return decrypt(row.apiKeyEncrypted);
}
