import { Request, Response, NextFunction } from "express";
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
  // Prefer cookie (web). Fall back to Authorization header (CLI/mobile).
  const cookieToken = (req as Request & { cookies?: Record<string, string> })
    .cookies?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Yetkisiz erişim. Lütfen tekrar giriş yapın." });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.userRole = (payload.role as Role | undefined) ?? "admin";
    next();
  } catch {
    res.status(401).json({ error: "Oturum süresi doldu. Lütfen tekrar giriş yapın." });
  }
}

export function requireRole(min: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const role = req.userRole ?? "viewer";
    if (ROLE_RANK[role] < ROLE_RANK[min]) {
      res
        .status(403)
        .json({ error: "Bu işlem için yetkiniz yok." });
      return;
    }
    next();
  };
}
