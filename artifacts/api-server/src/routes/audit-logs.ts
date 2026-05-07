import { Router, type IRouter } from "express";
import { db, auditLogs, adminUsers } from "@workspace/db";
import { and, eq, gte, lte, desc, count, sql } from "drizzle-orm";
import {
  requireAuth,
  requireRole,
  type AuthRequest,
} from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/audit-logs",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const filters = [] as ReturnType<typeof eq>[];
    if (req.query.actorUserId) {
      const id = Number(req.query.actorUserId);
      if (Number.isFinite(id)) filters.push(eq(auditLogs.actorUserId, id));
    }
    if (req.query.action && typeof req.query.action === "string") {
      filters.push(eq(auditLogs.action, req.query.action));
    }
    if (req.query.from && typeof req.query.from === "string") {
      const d = new Date(req.query.from);
      if (!Number.isNaN(d.getTime())) filters.push(gte(auditLogs.createdAt, d));
    }
    if (req.query.to && typeof req.query.to === "string") {
      const d = new Date(req.query.to);
      if (!Number.isNaN(d.getTime())) filters.push(lte(auditLogs.createdAt, d));
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [{ n }] = await db
      .select({ n: count() })
      .from(auditLogs)
      .where(where as never);

    const rows = await db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorEmail: auditLogs.actorEmail,
        actorName: adminUsers.name,
        action: auditLogs.action,
        target: auditLogs.target,
        meta: auditLogs.meta,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        success: auditLogs.success,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(adminUsers.id, auditLogs.actorUserId))
      .where(where as never)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Distinct actions for filter dropdown.
    const actions = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .groupBy(auditLogs.action)
      .orderBy(sql`${auditLogs.action} asc`);

    res.json({
      logs: rows,
      total: Number(n),
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(Number(n) / limit)),
      actions: actions.map((a) => a.action),
    });
  }
);

export default router;
