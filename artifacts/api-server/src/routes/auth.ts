import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { db, adminUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import {
  requireAuth,
  optionalAuth,
  invalidateTokenVersionCache,
  AUTH_COOKIE,
  type AuthRequest,
  type Role,
} from "../middlewares/auth";
import { sql } from "drizzle-orm";
import {
  CSRF_COOKIE,
  newCsrfToken,
  setCsrfCookie,
} from "../lib/csrf";
import { logger } from "../lib/logger";
import { audit, auditAnonymous } from "../lib/audit";
import { validatePassword } from "../lib/password-policy";

const router: IRouter = Router();

const isProd = process.env.NODE_ENV === "production";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Per-IP rate limit for login (defense in depth on top of per-account lockout).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 login attempts per 15 min per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla giriş denemesi. Lütfen biraz sonra tekrar deneyin." },
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin." },
});

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

router.post("/auth/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "E-posta ve şifre zorunludur." });
    return;
  }

  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email));

  if (!user) {
    await auditAnonymous(req, {
      action: "auth.login",
      success: false,
      actorEmail: email,
      meta: { reason: "user_not_found" },
    });
    res.status(401).json({ error: "E-posta veya şifre hatalı." });
    return;
  }

  // Account lockout check.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60_000
    );
    await auditAnonymous(req, {
      action: "auth.login",
      success: false,
      actorEmail: email,
      meta: { reason: "locked", remainingMinutes: minutes },
    });
    res.status(423).json({
      error: `Hesap geçici olarak kilitli. ${minutes} dakika sonra tekrar deneyin.`,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const nextCount = (user.failedLoginCount ?? 0) + 1;
    const updates: Partial<typeof adminUsers.$inferInsert> = {
      failedLoginCount: nextCount,
      updatedAt: new Date(),
    };
    if (nextCount >= MAX_FAILED) {
      updates.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      updates.failedLoginCount = 0;
    }
    await db.update(adminUsers).set(updates).where(eq(adminUsers.id, user.id));
    await auditAnonymous(req, {
      action: "auth.login",
      success: false,
      actorEmail: email,
      meta: { reason: "bad_password", failedCount: nextCount, locked: nextCount >= MAX_FAILED },
    });
    res.status(401).json({ error: "E-posta veya şifre hatalı." });
    return;
  }

  // Success — clear failure counters & lock, stamp last login.
  await db
    .update(adminUsers)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id));

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    tv: user.tokenVersion ?? 0,
  });
  setAuthCookie(res, token);
  setCsrfCookie(res, newCsrfToken());

  await auditAnonymous(req, {
    action: "auth.login",
    success: true,
    actorEmail: user.email,
    meta: { userId: user.id, role: user.role },
  });

  res.json({
    token, // returned for backwards compat (CLI/mobile); web ignores it
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
  });
});

router.post("/auth/logout", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  if (req.userId) {
    await audit(req, { action: "auth.logout" });
  }
  clearAuthCookie(res);
  res.json({ message: "Oturum kapatıldı." });
});

// "Tüm cihazlarda oturumu sonlandır": JWT'leri toptan iptal etmek için
// admin_users.token_version'ı bir artırır. Sonraki tüm requireAuth çağrıları
// eski tokenları reddeder. Mevcut cookie de temizlenir.
router.post("/auth/sessions/terminate-all", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await db
    .update(adminUsers)
    .set({
      tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, req.userId!));
  invalidateTokenVersionCache(req.userId!);
  await audit(req, { action: "auth.sessions.terminate_all" });
  clearAuthCookie(res);
  res.json({ message: "Tüm oturumlar sonlandırıldı." });
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "Kullanıcı bulunamadı." });
    return;
  }

  // Refresh CSRF cookie if missing (e.g. cleared but auth cookie survived).
  if (!req.cookies?.[CSRF_COOKIE]) {
    setCsrfCookie(res, newCsrfToken());
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  });
});

router.post(
  "/auth/change-password",
  changePasswordLimiter,
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Mevcut ve yeni şifre zorunludur." });
      return;
    }

    const policyError = validatePassword(newPassword);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }

    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, req.userId!));

    if (!user) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      await audit(req, {
        action: "auth.change_password",
        success: false,
        meta: { reason: "bad_current" },
      });
      res.status(400).json({ error: "Mevcut şifre hatalı." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, req.userId!));

    await audit(req, { action: "auth.change_password", success: true });
    logger.info({ userId: req.userId }, "Password changed");
    res.json({ message: "Şifre başarıyla değiştirildi." });
  }
);

export default router;
