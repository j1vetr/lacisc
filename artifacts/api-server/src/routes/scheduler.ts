import { Router, type IRouter } from "express";
import { db, schedulerSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/auth";
import { audit } from "../lib/audit";
import {
  getSchedulerStatus,
  restartScheduler,
  cancelRunningSync,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
} from "../lib/scheduler";

const router: IRouter = Router();

router.get(
  "/scheduler/settings",
  requireAuth,
  requireRole("viewer"),
  async (_req: AuthRequest, res): Promise<void> => {
    const [row] = await db
      .select()
      .from(schedulerSettings)
      .where(eq(schedulerSettings.id, 1));
    const status = getSchedulerStatus();
    res.json({
      intervalMinutes: row?.intervalMinutes ?? 30,
      enabled: row?.enabled ?? true,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      nextRunAt: status.nextRunAt,
      isRunning: status.isRunning,
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxIntervalMinutes: MAX_INTERVAL_MINUTES,
    });
  }
);

router.patch(
  "/scheduler/settings",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as {
      intervalMinutes?: number;
      enabled?: boolean;
    };
    const patch: { intervalMinutes?: number; enabled?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.intervalMinutes !== undefined) {
      const v = Number(body.intervalMinutes);
      if (
        !Number.isFinite(v) ||
        !Number.isInteger(v) ||
        v < MIN_INTERVAL_MINUTES ||
        v > MAX_INTERVAL_MINUTES
      ) {
        res.status(400).json({
          error: `intervalMinutes ${MIN_INTERVAL_MINUTES} ile ${MAX_INTERVAL_MINUTES} arası tam sayı olmalı.`,
        });
        return;
      }
      patch.intervalMinutes = v;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        res.status(400).json({ error: "enabled boolean olmalı." });
        return;
      }
      patch.enabled = body.enabled;
    }
    await db
      .insert(schedulerSettings)
      .values({
        id: 1,
        intervalMinutes: patch.intervalMinutes ?? 30,
        enabled: patch.enabled ?? true,
        updatedAt: patch.updatedAt,
      })
      .onConflictDoUpdate({
        target: schedulerSettings.id,
        set: patch,
      });

    await restartScheduler();

    await audit(req, {
      action: "scheduler.settings.update",
      target: "scheduler_settings:1",
      meta: { ...patch, updatedAt: undefined },
    });

    const [row] = await db
      .select()
      .from(schedulerSettings)
      .where(eq(schedulerSettings.id, 1));
    const status = getSchedulerStatus();
    res.json({
      intervalMinutes: row?.intervalMinutes ?? 30,
      enabled: row?.enabled ?? true,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      nextRunAt: status.nextRunAt,
      isRunning: status.isRunning,
      minIntervalMinutes: MIN_INTERVAL_MINUTES,
      maxIntervalMinutes: MAX_INTERVAL_MINUTES,
    });
  }
);

router.post(
  "/scheduler/cancel",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const result = await cancelRunningSync();
    await audit(req, {
      action: "scheduler.cancel",
      target: "scheduler",
      meta: result,
    });
    res.json({
      cancelledRows: result.cancelledRows,
      releasedFlags: result.releasedFlags,
      message:
        result.cancelledRows > 0
          ? `${result.cancelledRows} sync kaydı iptal edildi.`
          : "İptal edilecek aktif sync yoktu.",
    });
  }
);

export default router;
