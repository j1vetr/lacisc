import { db, auditLogs } from "@workspace/db";
import { logger } from "./logger";
import type { AuthRequest } from "../middlewares/auth";

export interface AuditOptions {
  action: string;
  target?: string | null;
  meta?: Record<string, unknown> | null;
  success?: boolean;
}

function clientIp(req: AuthRequest): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export async function audit(req: AuthRequest, opts: AuditOptions): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: req.userId ?? null,
      actorEmail: req.userEmail ?? null,
      action: opts.action,
      target: opts.target ?? null,
      meta: (opts.meta ?? null) as never,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
      success: opts.success ?? true,
    });
  } catch (err) {
    logger.error({ err, action: opts.action }, "Audit log insert failed");
  }
}

export async function auditAnonymous(
  req: { headers: AuthRequest["headers"]; ip?: string; socket?: AuthRequest["socket"] },
  opts: AuditOptions & { actorEmail?: string | null }
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: null,
      actorEmail: opts.actorEmail ?? null,
      action: opts.action,
      target: opts.target ?? null,
      meta: (opts.meta ?? null) as never,
      ip:
        (typeof req.headers["x-forwarded-for"] === "string"
          ? (req.headers["x-forwarded-for"] as string).split(",")[0].trim()
          : null) ??
        req.ip ??
        req.socket?.remoteAddress ??
        null,
      userAgent: req.headers["user-agent"] ?? null,
      success: opts.success ?? true,
    });
  } catch (err) {
    logger.error({ err, action: opts.action }, "Audit log insert failed");
  }
}
