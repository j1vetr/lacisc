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

    const subdomain = CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length];
    const apiKey = await getDecryptedMapApiKey();

    const tileUrl =
      `https://${subdomain}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png` +
      (apiKey ? `?key=${encodeURIComponent(apiKey)}` : "");

    let upstream: Response;
    try {
      upstream = await fetch(tileUrl, {
        headers: { "User-Agent": "StationSatcomAdmin/1.0" },
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
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res
      .set("Content-Type", contentType)
      .set("Cache-Control", "public, max-age=86400")
      .send(buffer);
  }
);

export default router;
