import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { db, adminUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
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
    res.status(401).json({ error: "E-posta veya şifre hatalı." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "E-posta veya şifre hatalı." });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Oturum kapatıldı." });
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

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  });
});

router.post("/auth/change-password", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Mevcut ve yeni şifre zorunludur." });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "Yeni şifre en az 8 karakter olmalıdır." });
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
    res.status(400).json({ error: "Mevcut şifre hatalı." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(adminUsers)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminUsers.id, req.userId!));

  logger.info({ userId: req.userId }, "Password changed");
  res.json({ message: "Şifre başarıyla değiştirildi." });
});

export default router;
