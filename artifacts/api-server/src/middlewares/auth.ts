import { Request, Response, NextFunction } from "express";
import { db, adminUsers, adminSessions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";

export type Role = "owner" | "admin" | "viewer" | "customer";
// Customer is the lowest tier — only sees Panel + Terminaller for atanmış
// KIT'ler. Viewer is the lowest *operator* tier. requireRole("viewer") still
// blocks customers (its rank is below viewer).
const ROLE_RANK: Record<Role, number> = {
  customer: -1,
  viewer: 0,
  admin: 1,
  owner: 2,
};

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
  userRole?: Role;
  sessionJti?: string;
}

export const AUTH_COOKIE = "auth_token";

function extractToken(req: AuthRequest): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> })
    .cookies?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

const tvCache = new Map<number, { tv: number; expires: number }>();
const TV_TTL_MS = 30_000;

async function currentTokenVersion(userId: number): Promise<number | null> {
  const now = Date.now();
  const hit = tvCache.get(userId);
  if (hit && hit.expires > now) return hit.tv;
  const [row] = await db
    .select({ tv: adminUsers.tokenVersion })
    .from(adminUsers)
    .where(eq(adminUsers.id, userId));
  if (!row) return null;
  tvCache.set(userId, { tv: row.tv ?? 0, expires: now + TV_TTL_MS });
  return row.tv ?? 0;
}

export function invalidateTokenVersionCache(userId: number): void {
  tvCache.delete(userId);
}

const sessionCache = new Map<string, { ok: boolean; expires: number }>();
const SESSION_TTL_MS = 30_000;

async function sessionExists(jti: string): Promise<boolean> {
  const now = Date.now();
  const hit = sessionCache.get(jti);
  if (hit && hit.expires > now) return hit.ok;
  const [row] = await db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(eq(adminSessions.jti, jti));
  const ok = Boolean(row);
  sessionCache.set(jti, { ok, expires: now + SESSION_TTL_MS });
  // Touch lastSeenAt occasionally — don't await on hot path.
  if (ok) {
    void db
      .update(adminSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(adminSessions.jti, jti))
      .catch(() => undefined);
  }
  return ok;
}

export function invalidateSessionCache(jti: string): void {
  sessionCache.delete(jti);
}

async function decodeAndValidate(req: AuthRequest): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;
  try {
    const payload = verifyToken(token);
    const tv = await currentTokenVersion(payload.userId);
    if (tv === null) return false;
    if ((payload.tv ?? 0) !== tv) return false;
    // Tüm token'lar artık `jti` taşımak zorunda; yeni session-tracking
    // sisteminden önce verilmiş eski JWT'ler (jti yok) reddedilir → kullanıcı
    // yeniden giriş yapar ve session satırı oluşur (revoke edilebilir hale gelir).
    if (!payload.jti) return false;
    const ok = await sessionExists(payload.jti);
    if (!ok) return false;
    req.sessionJti = payload.jti;
    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.userRole = (payload.role as Role | undefined) ?? "admin";
    return true;
  } catch {
    return false;
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ok = await decodeAndValidate(req);
  if (!ok) {
    res.status(401).json({ error: "Yetkisiz erişim. Lütfen tekrar giriş yapın." });
    return;
  }
  next();
}

export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  await decodeAndValidate(req).catch(() => false);
  next();
}

export function requireRole(min: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const role = req.userRole ?? "viewer";
    if (ROLE_RANK[role] < ROLE_RANK[min]) {
      res.status(403).json({ error: "Bu işlem için yetkiniz yok." });
      return;
    }
    next();
  };
}
