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
    httpOnly: false, // client JS must read it to echo back as header
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Double-submit CSRF: server sets a cookie at login (CSRF_COOKIE). Client
// JS reads it and echoes it back as header CSRF_HEADER on every mutation.
// Server compares the two; a cross-site attacker cannot read the cookie so
// cannot forge the header. SameSite=Lax also blocks the simplest CSRFs.
export function csrfGuard(
  req: Request & { cookies?: Record<string, string> },
  res: Response,
  next: NextFunction
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  // Skip CSRF for purely-Bearer requests (CLI/mobile, no cookie).
  const hasCookieAuth = Boolean(req.cookies?.["auth_token"]);
  if (!hasCookieAuth) {
    next();
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
    res.status(403).json({ error: "CSRF doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin." });
    return;
  }
  next();
}
