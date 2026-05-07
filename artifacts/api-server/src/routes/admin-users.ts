import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { db, adminUsers, adminSessions } from "@workspace/db";
import { and, eq, ne, count, sql } from "drizzle-orm";
import {
  requireAuth,
  requireRole,
  invalidateTokenVersionCache,
  invalidateSessionCache,
  type AuthRequest,
} from "../middlewares/auth";
import { audit } from "../lib/audit";
import { validatePassword } from "../lib/password-policy";

// Bump tokenVersion AND delete every active session for the target user, so
// privilege/credential changes take effect immediately (no stale 7-day JWTs).
async function revokeAllSessionsFor(userId: number): Promise<void> {
  const rows = await db
    .select({ jti: adminSessions.jti })
    .from(adminSessions)
    .where(eq(adminSessions.userId, userId));
  await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
  for (const r of rows) invalidateSessionCache(r.jti);
  await db
    .update(adminUsers)
    .set({
      tokenVersion: sql`${adminUsers.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, userId));
  invalidateTokenVersionCache(userId);
}

const router: IRouter = Router();

type Role = "owner" | "admin" | "viewer";
const ROLES: ReadonlySet<Role> = new Set(["owner", "admin", "viewer"]);

function publicUser(u: typeof adminUsers.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    lastLoginAt: u.lastLoginAt,
    lockedUntil: u.lockedUntil,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// All endpoints require admin+ except where noted.
router.get(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    const rows = await db
      .select()
      .from(adminUsers)
      .orderBy(adminUsers.id);
    res.json(rows.map(publicUser));
  }
);

router.post(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };
    if (!name || !email || !password) {
      res.status(400).json({ error: "Ad, e-posta ve şifre zorunludur." });
      return;
    }
    if (role && !ROLES.has(role as Role)) {
      res.status(400).json({ error: "Geçersiz rol." });
      return;
    }
    // Only owners can create owners.
    if (role === "owner" && req.userRole !== "owner") {
      res.status(403).json({ error: "Yalnızca sahip rolündeki kullanıcılar yeni sahip oluşturabilir." });
      return;
    }
    const policyError = validatePassword(password);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }
    const existing = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, email));
    if (existing.length > 0) {
      res.status(409).json({ error: "Bu e-posta ile bir kullanıcı zaten var." });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db
      .insert(adminUsers)
      .values({
        name,
        email,
        passwordHash,
        role: (role as Role) ?? "admin",
      })
      .returning();
    await audit(req, {
      action: "user.create",
      target: `user:${created.id}`,
      meta: { email: created.email, role: created.role },
    });
    res.json(publicUser(created));
  }
);

router.patch(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz kullanıcı id." });
      return;
    }
    const [target] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id));
    if (!target) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }
    const { name, role, unlock } = req.body as {
      name?: string;
      role?: string;
      unlock?: boolean;
    };

    const updates: Partial<typeof adminUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;

    if (role !== undefined) {
      if (!ROLES.has(role as Role)) {
        res.status(400).json({ error: "Geçersiz rol." });
        return;
      }
      // Only owners can change the role to or from 'owner'.
      if ((role === "owner" || target.role === "owner") && req.userRole !== "owner") {
        res.status(403).json({ error: "Sahip rolünü yalnızca sahip değiştirebilir." });
        return;
      }
      // Don't let the last owner be demoted.
      if (target.role === "owner" && role !== "owner") {
        const [{ n }] = await db
          .select({ n: count() })
          .from(adminUsers)
          .where(eq(adminUsers.role, "owner"));
        if (Number(n) <= 1) {
          res.status(400).json({ error: "Son sahip kullanıcısının rolü değiştirilemez." });
          return;
        }
      }
      updates.role = role as Role;
    }

    if (unlock) {
      updates.lockedUntil = null;
      updates.failedLoginCount = 0;
    }

    const [updated] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning();
    // Role değişti → hedef kullanıcının TÜM oturumlarını anında geçersiz kıl
    // (yetki düşürme/yükseltmenin gecikmeli uygulanmaması kritik).
    if (updates.role !== undefined && updates.role !== target.role) {
      await revokeAllSessionsFor(id);
    }
    await audit(req, {
      action: "user.update",
      target: `user:${id}`,
      meta: {
        name: updates.name,
        role: updates.role,
        unlock: !!unlock,
        sessionsRevoked: updates.role !== undefined && updates.role !== target.role,
      },
    });
    res.json(publicUser(updated));
  }
);

router.delete(
  "/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz kullanıcı id." });
      return;
    }
    if (id === req.userId) {
      res.status(400).json({ error: "Kendinizi silemezsiniz." });
      return;
    }
    const [target] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id));
    if (!target) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }
    if (target.role === "owner" && req.userRole !== "owner") {
      res.status(403).json({ error: "Sahip rolündeki kullanıcıyı yalnızca sahip silebilir." });
      return;
    }
    if (target.role === "owner") {
      const [{ n }] = await db
        .select({ n: count() })
        .from(adminUsers)
        .where(and(eq(adminUsers.role, "owner"), ne(adminUsers.id, id)));
      if (Number(n) === 0) {
        res.status(400).json({ error: "Son sahip kullanıcısı silinemez." });
        return;
      }
    }
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
    await audit(req, {
      action: "user.delete",
      target: `user:${id}`,
      meta: { email: target.email },
    });
    res.json({ message: "Kullanıcı silindi." });
  }
);

router.post(
  "/admin/users/:id/reset-password",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword) {
      res.status(400).json({ error: "Yeni şifre zorunludur." });
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }
    const [target] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id));
    if (!target) {
      res.status(404).json({ error: "Kullanıcı bulunamadı." });
      return;
    }
    if (target.role === "owner" && req.userRole !== "owner" && target.id !== req.userId) {
      res.status(403).json({ error: "Sahip rolündeki kullanıcının şifresini yalnızca sahip sıfırlayabilir." });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(adminUsers)
      .set({
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, id));
    // Kimlik bilgisi sıfırlandı → hedef kullanıcının tüm aktif oturumlarını sonlandır.
    await revokeAllSessionsFor(id);
    await audit(req, {
      action: "user.reset_password",
      target: `user:${id}`,
      meta: { sessionsRevoked: true },
    });
    res.json({ message: "Şifre sıfırlandı." });
  }
);

export default router;
