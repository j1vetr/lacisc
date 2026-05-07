import { Request, Response, NextFunction } from "express";
import { db, adminUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";

export type Role = "owner" | "admin" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
  userRole?: Role;
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

// Lightweight cache so we don't hit the DB on every authed request just to
// validate the token version. TTL keeps revocations propagating quickly.
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

async function decodeAndValidate(req: AuthRequest): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;
  try {
    const payload = verifyToken(token);
    const tv = await currentTokenVersion(payload.userId);
    if (tv === null) return false;
    if ((payload.tv ?? 0) !== tv) return false;
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

// Decode token if present but never reject. Used for endpoints like /auth/logout
// that must succeed (and capture actor identity for audit) regardless of token state.
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
