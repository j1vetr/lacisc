import { Router, type IRouter } from "express";
import { sql, desc, eq } from "drizzle-orm";
import {
  db,
  stationCredentials,
  stationSyncLogs,
  stationKits,
  stationKitPeriodTotal,
} from "@workspace/db";
import { isOrchestratorRunning } from "../lib/sync-orchestrator";

const router: IRouter = Router();

// Lightweight Prometheus text exposition. Kept dependency-free on purpose —
// scraping volume is once-a-minute and the metric set is small. If we ever
// need histograms / labels at scale we can swap in `prom-client`.
//
// Auth: open by default (standard for /metrics in private VPCs). If
// `METRICS_TOKEN` is set we require `Authorization: Bearer <token>`.
router.get("/metrics", async (req, res): Promise<void> => {
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const got = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (got !== expected) {
      res.status(401).type("text/plain").send("unauthorized\n");
      return;
    }
  }

  const lines: string[] = [];
  const push = (
    metric: string,
    help: string,
    type: "gauge" | "counter",
    samples: Array<{ labels?: Record<string, string>; value: number }>
  ) => {
    lines.push(`# HELP ${metric} ${help}`);
    lines.push(`# TYPE ${metric} ${type}`);
    for (const s of samples) {
      const lbl = s.labels
        ? "{" +
          Object.entries(s.labels)
            .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
            .join(",") +
          "}"
        : "";
      lines.push(`${metric}${lbl} ${Number.isFinite(s.value) ? s.value : 0}`);
    }
  };

  try {
    const accounts = await db
      .select({
        id: stationCredentials.id,
        isActive: stationCredentials.isActive,
      })
      .from(stationCredentials);
    push(
      "ssa_station_accounts_total",
      "Configured station portal accounts.",
      "gauge",
      [
        { labels: { state: "active" }, value: accounts.filter((a) => a.isActive).length },
        { labels: { state: "inactive" }, value: accounts.filter((a) => !a.isActive).length },
      ]
    );
  } catch {
    push("ssa_station_accounts_total", "Configured station portal accounts.", "gauge", [
      { value: 0 },
    ]);
  }

  try {
    const [{ count: kitCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stationKits);
    push("ssa_station_kits_total", "Total tracked KIT terminals.", "gauge", [
      { value: kitCount ?? 0 },
    ]);
  } catch {
    push("ssa_station_kits_total", "Total tracked KIT terminals.", "gauge", [{ value: 0 }]);
  }

  try {
    const period = currentPeriod();
    const [agg] = await db
      .select({
        gib: sql<number>`coalesce(sum(${stationKitPeriodTotal.totalGib}),0)::float`,
        usd: sql<number>`coalesce(sum(${stationKitPeriodTotal.totalUsd}),0)::float`,
      })
      .from(stationKitPeriodTotal)
      .where(eq(stationKitPeriodTotal.period, period));
    push(
      "ssa_active_period_total_gib",
      "Active period (current month) total volume in GiB.",
      "gauge",
      [{ value: agg?.gib ?? 0 }]
    );
    push(
      "ssa_active_period_total_usd",
      "Active period (current month) total charges in USD.",
      "gauge",
      [{ value: agg?.usd ?? 0 }]
    );
  } catch {
    push("ssa_active_period_total_gib", "Active period total volume in GiB.", "gauge", [
      { value: 0 },
    ]);
    push("ssa_active_period_total_usd", "Active period total charges in USD.", "gauge", [
      { value: 0 },
    ]);
  }

  try {
    const [last] = await db
      .select({
        startedAt: stationSyncLogs.startedAt,
        finishedAt: stationSyncLogs.finishedAt,
        status: stationSyncLogs.status,
      })
      .from(stationSyncLogs)
      .orderBy(desc(stationSyncLogs.startedAt))
      .limit(1);

    push(
      "ssa_last_sync_started_seconds",
      "Unix epoch seconds of the most recent sync run start.",
      "gauge",
      [{ value: last?.startedAt ? Math.floor(last.startedAt.getTime() / 1000) : 0 }]
    );
    push(
      "ssa_last_sync_finished_seconds",
      "Unix epoch seconds of the most recent sync run finish (0 if running).",
      "gauge",
      [{ value: last?.finishedAt ? Math.floor(last.finishedAt.getTime() / 1000) : 0 }]
    );
    push(
      "ssa_last_sync_success",
      "Whether the most recent sync run succeeded (1) or failed (0).",
      "gauge",
      [{ value: last?.status === "success" ? 1 : 0 }]
    );
  } catch {
    push("ssa_last_sync_started_seconds", "Unix seconds of last sync start.", "gauge", [
      { value: 0 },
    ]);
  }

  try {
    const rows = await db
      .select({ status: stationSyncLogs.status, count: sql<number>`count(*)::int` })
      .from(stationSyncLogs)
      .groupBy(stationSyncLogs.status);
    // gauge (not counter) — derived from `SELECT COUNT(*) GROUP BY status` on
    // station_sync_logs, so it can decrease if old logs are pruned. A true
    // monotonic counter would need a persistent sequence outside the table.
    push(
      "ssa_sync_runs",
      "Number of sync runs currently retained in station_sync_logs, grouped by terminal status.",
      "gauge",
      rows.map((r) => ({ labels: { status: r.status }, value: r.count ?? 0 }))
    );
  } catch {
    push("ssa_sync_runs", "Number of retained sync runs.", "gauge", [{ value: 0 }]);
  }

  push(
    "ssa_sync_running",
    "Whether the orchestrator is currently mid-run (1) or idle (0).",
    "gauge",
    [{ value: isOrchestratorRunning() ? 1 : 0 }]
  );

  push("ssa_process_uptime_seconds", "Node process uptime in seconds.", "gauge", [
    { value: Math.floor(process.uptime()) },
  ]);

  res.type("text/plain; version=0.0.4").send(lines.join("\n") + "\n");
});

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default router;
