import { Router, type IRouter } from "express";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middlewares/auth";
import { audit } from "../lib/audit";
import {
  getWhatsappSettings,
  saveWhatsappSettings,
  sendTestWhatsapp,
  listThresholdRules,
  createThresholdRule,
  deleteThresholdRule,
  type WhatsappSettingsUpdate,
} from "../lib/whatsapp";

const router: IRouter = Router();

router.get(
  "/whatsapp/settings",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    res.json(await getWhatsappSettings());
  }
);

router.patch(
  "/whatsapp/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as WhatsappSettingsUpdate;
    const patch: WhatsappSettingsUpdate = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.endpointUrl !== undefined) patch.endpointUrl = body.endpointUrl;
    if (body.testRecipient !== undefined)
      patch.testRecipient = body.testRecipient;
    if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
    try {
      const settings = await saveWhatsappSettings(patch);
      await audit(req, {
        action: "whatsapp.settings.update",
        target: "whatsapp_settings:1",
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
  "/whatsapp/test",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as { to?: string | null };
    const result = await sendTestWhatsapp(body.to ?? undefined);
    await audit(req, {
      action: "whatsapp.test",
      target: "whatsapp_settings:1",
      success: result.ok,
      meta: {
        message: result.message,
        recipients: result.recipients,
        providerStatus: result.providerStatus,
      },
    });
    res.json({
      success: result.ok,
      message: result.message,
      recipients: result.recipients,
      providerStatus: result.providerStatus,
      providerBody: result.providerBody,
    });
  }
);

router.get(
  "/whatsapp/threshold-rules",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    res.json(await listThresholdRules());
  }
);

router.post(
  "/whatsapp/threshold-rules",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { minPlanGb, stepGb } = (req.body ?? {}) as {
      minPlanGb?: number | null;
      stepGb?: number;
    };
    if (typeof stepGb !== "number" || !Number.isFinite(stepGb) || stepGb < 1) {
      res.status(400).json({ error: "stepGb >= 1 olmalı." });
      return;
    }
    const finalMin =
      minPlanGb === null || minPlanGb === undefined
        ? null
        : Number.isFinite(minPlanGb) && minPlanGb >= 0
          ? minPlanGb
          : null;
    const rule = await createThresholdRule({ minPlanGb: finalMin, stepGb });
    await audit(req, {
      action: "whatsapp.rule.create",
      target: `whatsapp_rule:${rule.id}`,
      meta: { minPlanGb: rule.minPlanGb, stepGb: rule.stepGb },
    });
    res.json(rule);
  }
);

router.delete(
  "/whatsapp/threshold-rules/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz id." });
      return;
    }
    await deleteThresholdRule(id);
    await audit(req, {
      action: "whatsapp.rule.delete",
      target: `whatsapp_rule:${id}`,
      meta: {},
    });
    res.json({ message: "Kural silindi." });
  }
);

export default router;
