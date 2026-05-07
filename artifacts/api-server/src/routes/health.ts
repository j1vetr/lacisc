import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, stationSyncLogs } from "@workspace/db";
import { desc } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isOrchestratorRunning } from "../lib/sync-orchestrator";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Deeper readiness probe — pings DB, reports last sync timestamp and whether
// the scheduler is currently mid-run.
router.get("/readyz", async (_req, res): Promise<void> => {
  const checks: Record<string, unknown> = {};
  let ok = true;

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch (err) {
    ok = false;
    checks.database = `fail: ${(err as Error).message}`;
  }

  try {
    const [lastLog] = await db
      .select({
        startedAt: stationSyncLogs.startedAt,
        finishedAt: stationSyncLogs.finishedAt,
        status: stationSyncLogs.status,
      })
      .from(stationSyncLogs)
      .orderBy(desc(stationSyncLogs.startedAt))
      .limit(1);
    checks.lastSync = lastLog
      ? {
          status: lastLog.status,
          startedAt: lastLog.startedAt,
          finishedAt: lastLog.finishedAt,
        }
      : null;
  } catch {
    checks.lastSync = null;
  }

  checks.syncRunning = isOrchestratorRunning();

  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "fail", checks });
});

export default router;
