import { Router, type IRouter } from "express";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middlewares/auth";
import { audit } from "../lib/audit";
import {
  getShipQuotaSettings,
  saveShipQuotaSettings,
  syncShipQuotas,
  listShipQuotaDeductions,
  updateShipQuotaDeduction,
  type ShipQuotaSettingsUpdate,
  type ShipQuotaSource,
} from "../lib/ship-quota";

const router: IRouter = Router();

router.get(
  "/ship-quotas/settings",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    res.json(await getShipQuotaSettings());
  }
);

router.patch(
  "/ship-quotas/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as ShipQuotaSettingsUpdate;
    const patch: ShipQuotaSettingsUpdate = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
    try {
      const settings = await saveShipQuotaSettings(patch);
      await audit(req, {
        action: "ship-quota.settings.update",
        target: "ship_quota_settings:1",
        meta: {
          enabled: settings.enabled,
          hasApiKey: settings.hasApiKey,
        },
      });
      res.json(settings);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Ayarlar kaydedilemedi.",
      });
    }
  }
);

router.post(
  "/ship-quotas/sync",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const result = await syncShipQuotas();
    await audit(req, {
      action: "ship-quota.sync",
      target: "ship_quota_settings:1",
      success: result.ok,
      meta: {
        period: result.period,
        matched: result.matched,
        unmatched: result.unmatched,
        error: result.error,
      },
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  }
);

router.get(
  "/ship-quotas/deductions",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const period =
      typeof req.query.period === "string" && /^\d{6}$/.test(req.query.period)
        ? req.query.period
        : undefined;
    res.json(await listShipQuotaDeductions(period));
  }
);

const VALID_SOURCES: ShipQuotaSource[] = ["satcom", "starlink", "leobridge"];

router.patch(
  "/ship-quotas/deductions/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz id." });
      return;
    }
    const body = (req.body ?? {}) as {
      isActive?: boolean;
      manualSource?: ShipQuotaSource | null;
      manualKitNo?: string | null;
      manualGb?: number | null;
    };
    if (
      body.manualSource !== undefined &&
      body.manualSource !== null &&
      !VALID_SOURCES.includes(body.manualSource)
    ) {
      res.status(400).json({ error: "Geçersiz manualSource." });
      return;
    }
    if (
      body.manualGb !== undefined &&
      body.manualGb !== null &&
      (!Number.isFinite(body.manualGb) || body.manualGb < 0)
    ) {
      res.status(400).json({ error: "manualGb >= 0 sayı olmalı veya null." });
      return;
    }
    let updated;
    try {
      updated = await updateShipQuotaDeduction(id, {
        isActive: body.isActive,
        manualSource: body.manualSource,
        manualKitNo: body.manualKitNo,
        manualGb: body.manualGb,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Güncelleme başarısız.",
      });
      return;
    }
    if (!updated) {
      res.status(404).json({ error: "Kayıt bulunamadı." });
      return;
    }
    await audit(req, {
      action: "ship-quota.deduction.update",
      target: `ship_quota_deduction:${id}`,
      meta: { isActive: updated.isActive, effectiveGb: updated.effectiveGb },
    });
    res.json(updated);
  }
);

export default router;
