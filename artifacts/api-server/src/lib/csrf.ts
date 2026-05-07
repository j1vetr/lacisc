import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function newCsrfToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function buildAllowedOrigins(): string[] {
  const list: string[] = [];
  const isProd = process.env.NODE_ENV === "production";
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const t = d.trim();
      if (t) list.push(`https://${t}`);
    }
  }
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) list.push(`https://${dev}`);
  // Localhost only in development (preview pane proxy). Excluded in prod so a
  // host-header trick can't pass origin validation.
  if (!isProd) list.push("http://localhost", "http://localhost:80");
  const extra = process.env.CORS_ALLOWLIST;
  if (extra) {
    for (const d of extra.split(",")) {
      const t = d.trim();
      if (t) list.push(t);
    }
  }
  return list;
}
const ALLOWED_ORIGINS = buildAllowedOrigins();

function originAllowed(originHeader: string | undefined): boolean {
  if (!originHeader) return false;
  return ALLOWED_ORIGINS.includes(originHeader);
}

function refererAllowed(refererHeader: string | undefined): boolean {
  if (!refererHeader) return false;
  try {
    const u = new URL(refererHeader);
    return ALLOWED_ORIGINS.includes(`${u.protocol}//${u.host}`);
  } catch {
    return false;
  }
}

// Layered CSRF for cookie-authenticated mutations:
//   1. Origin (or Referer) header must match an allowed app origin.
//   2. Double-submit token: csrf_token cookie value must equal x-csrf-token header.
// Pure-Bearer requests (no auth cookie) skip CSRF entirely — they cannot be
// triggered by a cross-site form/script the way ambient cookies can.
export function csrfGuard(
  req: Request & { cookies?: Record<string, string> },
  res: Response,
  next: NextFunction
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const hasCookieAuth = Boolean(req.cookies?.["auth_token"]);
  if (!hasCookieAuth) {
    next();
    return;
  }

  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (!(originAllowed(origin) || refererAllowed(referer))) {
    res.status(403).json({
      error: "İstek kaynağı doğrulanamadı (CSRF / origin).",
    });
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (
    !cookieToken ||
    !headerToken ||
    typeof headerToken !== "string" ||
    cookieToken !== headerToken
  ) {
    res.status(403).json({
      error: "CSRF doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.",
    });
    return;
  }
  next();
}
