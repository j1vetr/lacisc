import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { db, adminUsers, adminSessions } from "@workspace/db";
import { and, eq, ne, sql, desc } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import {
  requireAuth,
  optionalAuth,
  invalidateTokenVersionCache,
  invalidateSessionCache,
  AUTH_COOKIE,
  type AuthRequest,
  type Role,
} from "../middlewares/auth";
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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
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

  await db
    .update(adminUsers)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id));

  // Create a session row so this token can be listed and revoked individually.
  const jti = crypto.randomBytes(16).toString("hex");
  await db.insert(adminSessions).values({
    userId: user.id,
    jti,
    ip: req.ip ?? null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  });

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    tv: user.tokenVersion ?? 0,
    jti,
  });
  setAuthCookie(res, token);
  setCsrfCookie(res, newCsrfToken());

  await auditAnonymous(req, {
    action: "auth.login",
    success: true,
    actorEmail: user.email,
    meta: { userId: user.id, role: user.role },
  });

  // NOTE: token is intentionally NOT returned in the body. The httpOnly cookie
  // carries it for browsers; CLI/mobile clients can read it from the
  // Set-Cookie response header. This preserves the XSS-resistance goal.
  res.json({
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
    if (req.sessionJti) {
      await db.delete(adminSessions).where(eq(adminSessions.jti, req.sessionJti));
      invalidateSessionCache(req.sessionJti);
    }
    await audit(req, { action: "auth.logout" });
  }
  clearAuthCookie(res);
  res.json({ message: "Oturum kapatıldı." });
});

// Toptan iptal: kullanıcının TÜM oturumları silinir + token_version artar
// (savunma katmanı — eski token'ları cache TTL beklemeden geçersiz kılar).
router.post("/auth/sessions/terminate-all", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const sessions = await db
    .select({ jti: adminSessions.jti })
    .from(adminSessions)
    .where(eq(adminSessions.userId, req.userId!));
  await db.delete(adminSessions).where(eq(adminSessions.userId, req.userId!));
  for (const s of sessions) invalidateSessionCache(s.jti);
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

// Aktif oturum listesi (yalnızca kendi oturumları).
router.get("/auth/sessions", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const rows = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.userId, req.userId!))
    .orderBy(desc(adminSessions.lastSeenAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      current: r.jti === req.sessionJti,
    }))
  );
});

// Tek oturum iptali (kullanıcı kendi oturumlarını yönetir).
router.delete("/auth/sessions/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Geçersiz oturum id." });
    return;
  }
  const [row] = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.id, id), eq(adminSessions.userId, req.userId!)));
  if (!row) {
    res.status(404).json({ error: "Oturum bulunamadı." });
    return;
  }
  await db.delete(adminSessions).where(eq(adminSessions.id, id));
  invalidateSessionCache(row.jti);
  await audit(req, {
    action: "auth.sessions.revoke",
    target: `session:${id}`,
    meta: { ip: row.ip, userAgent: row.userAgent },
  });
  if (row.jti === req.sessionJti) {
    clearAuthCookie(res);
  }
  res.json({ message: "Oturum sonlandırıldı." });
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

    // Self-password-change → kendi mevcut oturumu hariç DİĞER tüm oturumları
    // sonlandır + tokenVersion bump (post-compromise persistence riski azalır;
    // bir saldırgan eski şifreyle başka cihazda oturum açmışsa anında düşer).
    const others = await db
      .select({ id: adminSessions.id, jti: adminSessions.jti })
      .from(adminSessions)
      .where(eq(adminSessions.userId, req.userId!));
    const toRevoke = others.filter((s) => s.jti !== req.sessionJti);
    if (toRevoke.length > 0) {
      await db
        .delete(adminSessions)
        .where(
          and(
            eq(adminSessions.userId, req.userId!),
            ne(adminSessions.jti, req.sessionJti ?? ""),
          ),
        );
      for (const s of toRevoke) invalidateSessionCache(s.jti);
      await db
        .update(adminUsers)
        .set({
          tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(adminUsers.id, req.userId!));
      invalidateTokenVersionCache(req.userId!);
    }

    await audit(req, {
      action: "auth.change_password",
      success: true,
      meta: { otherSessionsRevoked: toRevoke.length },
    });
    logger.info({ userId: req.userId }, "Password changed");
    res.json({ message: "Şifre başarıyla değiştirildi." });
  }
);

export default router;
