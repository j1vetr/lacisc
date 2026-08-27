// ---------------------------------------------------------------------------
// Harita ayarları ve CARTO tile proxy (Task #48)
// ---------------------------------------------------------------------------
// GET  /map/settings  → MapSettingsView (admin)
// PATCH /map/settings → MapSettingsView (admin)
// GET  /map/tiles/:z/:x/:y → PNG proxy (requireAuth)
//
// Tile proxy:
//   - Sabit hedef: *.basemaps.cartocdn.com/light_all — SSRF riski yok.
//   - Anahtar tarayıcıya asla açılmaz; yalnız backend→CARTO isteğine eklenir.
//   - Koordinat doğrulaması: z ∈ [0,22], x/y ∈ [0, 2^z).

import { Router, type IRouter } from "express";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middlewares/auth";
import { audit } from "../lib/audit";
import {
  getMapSettings,
  saveMapSettings,
  getDecryptedMapApiKey,
  type MapSettingsUpdate,
} from "../lib/map-settings";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /map/settings
// ---------------------------------------------------------------------------

router.get(
  "/map/settings",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    res.json(await getMapSettings());
  }
);

// ---------------------------------------------------------------------------
// PATCH /map/settings
// ---------------------------------------------------------------------------

router.patch(
  "/map/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as MapSettingsUpdate;
    const patch: MapSettingsUpdate = {};
    if (body.apiKey !== undefined) patch.apiKey = body.apiKey;

    try {
      const settings = await saveMapSettings(patch);
      await audit(req, {
        action: "map.settings.update",
        target: "map_settings:1",
        meta: { hasApiKey: settings.hasApiKey },
      });
      res.json(settings);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Ayarlar kaydedilemedi.",
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /map/tiles/:z/:x/:y  — CARTO tile proxy
// ---------------------------------------------------------------------------

const CARTO_SUBDOMAINS = ["a", "b", "c", "d"] as const;

const DEFAULT_TILE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_TILE_CACHE_MAX_ENTRIES = 1_000;
const DEFAULT_TILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;

function readNonNegativeIntegerEnv(
  name: string,
  fallback: number,
): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const TILE_CACHE_TTL_SECONDS = readNonNegativeIntegerEnv(
  "MAP_TILE_CACHE_TTL_SECONDS",
  DEFAULT_TILE_CACHE_TTL_SECONDS,
);
const TILE_CACHE_MAX_ENTRIES = readPositiveIntegerEnv(
  "MAP_TILE_CACHE_MAX_ENTRIES",
  DEFAULT_TILE_CACHE_MAX_ENTRIES,
);
const TILE_CACHE_MAX_BYTES = readPositiveIntegerEnv(
  "MAP_TILE_CACHE_MAX_BYTES",
  DEFAULT_TILE_CACHE_MAX_BYTES,
);
const TILE_CACHE_CONTROL = `public, max-age=${TILE_CACHE_TTL_SECONDS}`;

type TileCacheEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

/**
 * Small bounded LRU cache. Map iteration order is used to keep the least
 * recently used item at the beginning, while the byte limit prevents a few
 * unusually large tiles from consuming unbounded heap memory.
 */
class TileCache {
  private readonly entries = new Map<string, TileCacheEntry>();
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;

  get(key: string, now = Date.now()): TileCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (entry.expiresAt <= now) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Re-inserting moves the entry to the MRU end of the Map.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits++;
    return entry;
  }

  set(
    key: string,
    buffer: Buffer,
    contentType: string,
    now = Date.now(),
  ): void {
    if (TILE_CACHE_TTL_SECONDS === 0 || buffer.byteLength > TILE_CACHE_MAX_BYTES) {
      return;
    }

    this.delete(key);
    while (
      this.entries.size >= TILE_CACHE_MAX_ENTRIES ||
      this.totalBytes + buffer.byteLength > TILE_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    this.entries.set(key, {
      buffer,
      contentType,
      expiresAt: now + TILE_CACHE_TTL_SECONDS * 1_000,
    });
    this.totalBytes += buffer.byteLength;
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.buffer.byteLength;
  }

  stats(): {
    hits: number;
    misses: number;
    entries: number;
    bytes: number;
  } {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.entries.size,
      bytes: this.totalBytes,
    };
  }
}

const tileCache = new TileCache();

router.get(
  "/map/tiles/:z/:x/:y",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const z = parseInt(String(req.params.z), 10);
    const x = parseInt(String(req.params.x), 10);
    // Bazı istemciler .png uzantısı ekleyebilir — strip.
    const y = parseInt(String(req.params.y).replace(/\.png$/, ""), 10);

    const maxTile = 2 ** z;
    if (
      !Number.isFinite(z) || z < 0 || z > 22 ||
      !Number.isFinite(x) || x < 0 || x >= maxTile ||
      !Number.isFinite(y) || y < 0 || y >= maxTile
    ) {
      res.status(400).json({ error: "Geçersiz tile koordinatı." });
      return;
    }

    const cacheKey = `${z}/${x}/${y}`;
    const cached = tileCache.get(cacheKey);
    if (cached) {
      logger.info(
        { cache: "map-tiles", event: "hit", key: cacheKey, ...tileCache.stats() },
        "Map tile cache hit",
      );
      res
        .set("Content-Type", cached.contentType)
        .set("Cache-Control", TILE_CACHE_CONTROL)
        .send(cached.buffer);
      return;
    }

    logger.info(
      { cache: "map-tiles", event: "miss", key: cacheKey, ...tileCache.stats() },
      "Map tile cache miss",
    );

    const subdomain = CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length];
    const apiKey = await getDecryptedMapApiKey();

    const tileUrl =
      `https://${subdomain}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png` +
      (apiKey ? `?key=${encodeURIComponent(apiKey)}` : "");

    let upstream: Response;
    try {
      upstream = await fetch(tileUrl, {
        headers: {
          "User-Agent": "StationSatcomAdmin/1.0",
          Accept: "image/png",
          "Cache-Control": `public, max-age=${TILE_CACHE_TTL_SECONDS}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      res.status(502).end();
      return;
    }

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const contentType =
      upstream.headers.get("content-type") ?? "image/png";
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await upstream.arrayBuffer());
    } catch {
      res.status(502).end();
      return;
    }

    tileCache.set(cacheKey, buffer, contentType);
    res
      .set("Content-Type", contentType)
      .set("Cache-Control", TILE_CACHE_CONTROL)
      .send(buffer);
  }
);

export default router;
