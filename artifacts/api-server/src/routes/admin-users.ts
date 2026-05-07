import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import {
  db,
  adminUsers,
  adminSessions,
  customerKitAssignments,
  stationKits,
  starlinkTerminals,
  stationKitPeriodTotal,
} from "@workspace/db";
import { and, eq, ne, count, sql, desc, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireRole,
  invalidateTokenVersionCache,
  invalidateSessionCache,
  type AuthRequest,
} from "../middlewares/auth";
import { audit } from "../lib/audit";
import { validatePassword } from "../lib/password-policy";
import { classifyKitsDb } from "../lib/customer-scope";

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

type Role = "owner" | "admin" | "viewer" | "customer";
const ROLES: ReadonlySet<Role> = new Set(["owner", "admin", "viewer", "customer"]);

// Lowercase a-z, 0-9 ve `_.-`; 3..32 karakter. Boşluk/Türkçe karakter yok.
// E-posta lokal parçasından üretilen değerler de bu regex'e uyacak şekilde
// sanitize edilir (bkz. `slugifyForUsername` aşağıda).
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u: typeof adminUsers.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
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
    // Per-user atanmış KIT sayısı (yalnız müşteri rolü için anlamlı; diğerleri
    // 0 dönecek). Tek select + groupBy ile N+1 önlenir.
    const counts = await db
      .select({
        userId: customerKitAssignments.userId,
        n: count(),
      })
      .from(customerKitAssignments)
      .groupBy(customerKitAssignments.userId);
    const byUser = new Map(counts.map((r) => [r.userId, Number(r.n)]));
    res.json(
      rows.map((u) => ({
        ...publicUser(u),
        assignedKitCount: byUser.get(u.id) ?? 0,
      })),
    );
  }
);

router.post(
  "/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const { name, email, username, password, role } = req.body as {
      name?: string;
      email?: string | null;
      username?: string | null;
      password?: string;
      role?: string;
    };
    if (!name || !password) {
      res.status(400).json({ error: "Ad ve şifre zorunludur." });
      return;
    }
    const finalRole: Role = (role as Role) ?? "admin";
    if (!ROLES.has(finalRole)) {
      res.status(400).json({ error: "Geçersiz rol." });
      return;
    }
    // Only owners can create owners.
    if (finalRole === "owner" && req.userRole !== "owner") {
      res.status(403).json({ error: "Yalnızca sahip rolündeki kullanıcılar yeni sahip oluşturabilir." });
      return;
    }
    // Customer = username zorunlu, e-posta isteğe bağlı.
    // Operatör (owner/admin/viewer) = e-posta zorunlu, username opsiyonel
    //   (verilmezse e-posta lokalinden türetilir; çakışma varsa sayı eklenir).
    let finalEmail: string | null = null;
    let finalUsername: string | null = null;
    if (finalRole === "customer") {
      if (!username) {
        res.status(400).json({ error: "Müşteri hesabı için kullanıcı adı zorunludur." });
        return;
      }
      const u = String(username).trim().toLowerCase();
      if (!USERNAME_RE.test(u)) {
        res.status(400).json({
          error: "Kullanıcı adı 3-32 karakter, küçük harf / rakam / `_.-` olmalı.",
        });
        return;
      }
      finalUsername = u;
      if (email && String(email).trim()) {
        const e = String(email).trim();
        if (!EMAIL_RE.test(e)) {
          res.status(400).json({ error: "Geçersiz e-posta." });
          return;
        }
        finalEmail = e;
      }
    } else {
      if (!email) {
        res.status(400).json({ error: "Operatör hesabı için e-posta zorunludur." });
        return;
      }
      const e = String(email).trim();
      if (!EMAIL_RE.test(e)) {
        res.status(400).json({ error: "Geçersiz e-posta." });
        return;
      }
      finalEmail = e;
      finalUsername = await deriveUsername(username, e);
    }

    const policyError = validatePassword(password);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }

    if (finalEmail) {
      const existing = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, finalEmail));
      if (existing.length > 0) {
        res.status(409).json({ error: "Bu e-posta ile bir kullanıcı zaten var." });
        return;
      }
    }
    if (finalUsername) {
      const existing = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.username, finalUsername));
      if (existing.length > 0) {
        res.status(409).json({ error: "Bu kullanıcı adı zaten kullanılıyor." });
        return;
      }
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db
      .insert(adminUsers)
      .values({
        name,
        email: finalEmail,
        username: finalUsername,
        passwordHash,
        role: finalRole,
      })
      .returning();
    await audit(req, {
      action: "user.create",
      target: `user:${created.id}`,
      meta: { email: created.email, username: created.username, role: created.role },
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
    const { name, role, username, unlock } = req.body as {
      name?: string;
      role?: string;
      username?: string | null;
      unlock?: boolean;
    };

    const updates: Partial<typeof adminUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;

    if (username !== undefined) {
      if (username === null || username === "") {
        // Customer rolünde username silinemez (login imkansız hâle gelir).
        const effectiveRole = (role as Role | undefined) ?? (target.role as Role);
        if (effectiveRole === "customer") {
          res.status(400).json({ error: "Müşteri hesabının kullanıcı adı boş bırakılamaz." });
          return;
        }
        updates.username = null;
      } else {
        const u = String(username).trim().toLowerCase();
        if (!USERNAME_RE.test(u)) {
          res.status(400).json({
            error: "Kullanıcı adı 3-32 karakter, küçük harf / rakam / `_.-` olmalı.",
          });
          return;
        }
        if (u !== target.username) {
          const dup = await db
            .select({ id: adminUsers.id })
            .from(adminUsers)
            .where(and(eq(adminUsers.username, u), ne(adminUsers.id, id)));
          if (dup.length > 0) {
            res.status(409).json({ error: "Bu kullanıcı adı zaten kullanılıyor." });
            return;
          }
        }
        updates.username = u;
      }
    }

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
      // Customer rolüne geçiş için username şart.
      if (role === "customer" && !(updates.username ?? target.username)) {
        res.status(400).json({
          error: "Müşteri rolüne geçmeden önce bir kullanıcı adı atayın.",
        });
        return;
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
        username: updates.username,
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
    // Önce hedef kullanıcının tüm session/token cache'lerini temizle ki
    // silinen hesap, cache TTL süresince (~30s) post-delete erişim sağlamasın.
    // CASCADE FK zaten admin_sessions ve customer_kit_assignments satırlarını
    // silecek; burada in-memory cache'leri proaktif olarak invalidate ediyoruz.
    const sessions = await db
      .select({ jti: adminSessions.jti })
      .from(adminSessions)
      .where(eq(adminSessions.userId, id));
    for (const s of sessions) invalidateSessionCache(s.jti);
    invalidateTokenVersionCache(id);
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
    await audit(req, {
      action: "user.delete",
      target: `user:${id}`,
      meta: {
        email: target.email,
        username: target.username,
        sessionsRevoked: sessions.length,
      },
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

// ---------------------------------------------------------------------------
// Customer KIT atamaları
// ---------------------------------------------------------------------------

// Tüm atanabilir KIT'lerin listesi (Satcom + Starlink). Müşteri "KIT'leri
// Yönet" modalı çoklu seçim için bunu çağırır. Atayan operatörün rolü en
// az admin olmak zorunda; lookup kasıtlı olarak global (her admin atanabilir
// her KIT'i görür — multi-tenant bölümleme şu an gerekli değil).
router.get(
  "/admin/users/assignable-kits",
  requireAuth,
  requireRole("admin"),
  async (_req: AuthRequest, res): Promise<void> => {
    const [satcomRows, starlinkRows, latestPeriods] = await Promise.all([
      db
        .select({
          kitNo: stationKits.kitNo,
          shipName: stationKits.shipName,
        })
        .from(stationKits)
        .orderBy(stationKits.kitNo),
      db
        .select({
          kitSerialNumber: starlinkTerminals.kitSerialNumber,
          nickname: starlinkTerminals.nickname,
          assetName: starlinkTerminals.assetName,
        })
        .from(starlinkTerminals)
        .orderBy(starlinkTerminals.kitSerialNumber),
      // Aktif dönem GiB → opsiyonel sıralama yardımcısı (UI azalan göstermek
      // isterse). Tek sorgu ile her KIT için en son dönem GiB.
      db.execute(sql`
        SELECT DISTINCT ON (kit_no) kit_no, total_gib
        FROM station_kit_period_total
        ORDER BY kit_no, period DESC
      `),
    ]);
    const gibByKit = new Map<string, number | null>();
    for (const r of (latestPeriods as unknown as {
      rows: Array<{ kit_no: string; total_gib: number | null }>;
    }).rows) {
      gibByKit.set(r.kit_no, r.total_gib);
    }
    const satcom = satcomRows.map((r) => ({
      kitNo: r.kitNo,
      label: r.shipName,
      source: "satcom" as const,
      currentPeriodGib: gibByKit.get(r.kitNo) ?? null,
    }));
    const starlink = starlinkRows.map((r) => ({
      kitNo: r.kitSerialNumber,
      label: r.nickname ?? r.assetName,
      source: "starlink" as const,
      currentPeriodGib: null,
    }));
    res.json({ kits: [...satcom, ...starlink] });
  }
);

router.get(
  "/admin/users/:id/assigned-kits",
  requireAuth,
  requireRole("admin"),
  async (req: AuthRequest, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Geçersiz kullanıcı id." });
      return;
    }
    const rows = await db
      .select()
      .from(customerKitAssignments)
      .where(eq(customerKitAssignments.userId, id))
      .orderBy(desc(customerKitAssignments.assignedAt));
    res.json({
      assignments: rows.map((r) => ({
        kitNo: r.kitNo,
        source: r.source,
        assignedAt: r.assignedAt,
        assignedByUserId: r.assignedByUserId,
      })),
    });
  }
);

router.put(
  "/admin/users/:id/assigned-kits",
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
    if (target.role !== "customer") {
      res.status(400).json({
        error: "Yalnız müşteri rolündeki kullanıcılara KIT atanabilir.",
      });
      return;
    }
    const body = (req.body ?? {}) as { kitNos?: unknown };
    if (!Array.isArray(body.kitNos)) {
      res.status(400).json({ error: "kitNos bir dizi olmalı." });
      return;
    }
    const requested = Array.from(
      new Set(
        (body.kitNos as unknown[])
          .filter((v) => typeof v === "string")
          .map((v) => String(v).trim())
          .filter((v) => v.length > 0),
      ),
    );
    // KIT no'ları gerçekten var mı doğrula (yazım hatası ile fantom KIT
    // atanmasını engelle). Satcom + Starlink havuzları tek hamlede çekilir.
    if (requested.length > 0) {
      const [satRows, starRows] = await Promise.all([
        db
          .select({ kitNo: stationKits.kitNo })
          .from(stationKits)
          .where(inArray(stationKits.kitNo, requested)),
        db
          .select({ kitNo: starlinkTerminals.kitSerialNumber })
          .from(starlinkTerminals)
          .where(inArray(starlinkTerminals.kitSerialNumber, requested)),
      ]);
      const known = new Set([
        ...satRows.map((r) => r.kitNo),
        ...starRows.map((r) => r.kitNo),
      ]);
      const unknown = requested.filter((k) => !known.has(k));
      if (unknown.length > 0) {
        res.status(400).json({
          error: `Bilinmeyen KIT(ler): ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`,
        });
        return;
      }
    }
    // Mevcut atamalar — diff için.
    const previous = await db
      .select({
        kitNo: customerKitAssignments.kitNo,
        source: customerKitAssignments.source,
      })
      .from(customerKitAssignments)
      .where(eq(customerKitAssignments.userId, id));
    const prevSet = new Set(previous.map((p) => p.kitNo));
    const nextSet = new Set(requested);
    const added = requested.filter((k) => !prevSet.has(k));
    const removed = previous.map((p) => p.kitNo).filter((k) => !nextSet.has(k));

    // Source haritasını DB'den al — KITP\d prefix tahmininden bağımsız, gerçek
    // tablo (starlink_terminals vs station_kits) hangi tarafta KIT varsa onu
    // kullanır. Yukarıdaki validation tüm requested KIT'leri doğruladığı için
    // satcom default'una düşmeyiz, ama emniyet için fallback bırakıyoruz.
    const sourceMap = await classifyKitsDb(requested);
    // Replace-all stratejisi: eski satırları silip yenilerini ekleyerek
    // toplam halini istek body'sine eşitle. Tek bir transaction'da çalışır
    // ki kısmen başarısız bir update kullanıcıyı hibrit bir state'te bırakmasın.
    await db.transaction(async (tx) => {
      await tx
        .delete(customerKitAssignments)
        .where(eq(customerKitAssignments.userId, id));
      if (requested.length > 0) {
        await tx.insert(customerKitAssignments).values(
          requested.map((kit) => ({
            userId: id,
            kitNo: kit,
            source: sourceMap.get(kit) ?? "satcom",
            assignedByUserId: req.userId ?? null,
          })),
        );
      }
    });
    if (added.length > 0) {
      await audit(req, {
        action: "user.assign_kits",
        target: `user:${id}`,
        meta: { kits: added },
      });
    }
    if (removed.length > 0) {
      await audit(req, {
        action: "user.unassign_kits",
        target: `user:${id}`,
        meta: { kits: removed },
      });
    }
    res.json({ count: requested.length, added, removed });
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyForUsername(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_.-]+/g, "")
    .slice(0, 32)
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
}

async function deriveUsername(
  explicit: string | null | undefined,
  email: string,
): Promise<string | null> {
  if (explicit && explicit.trim()) {
    const u = explicit.trim().toLowerCase();
    if (USERNAME_RE.test(u)) {
      const dup = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.username, u));
      if (dup.length === 0) return u;
    }
  }
  const local = slugifyForUsername(email.split("@")[0] ?? "");
  if (!local || local.length < 3) return null;
  // 3..32 garantisi (slugify zaten 32'ye trim eder; alt sınırı _ ile pad
  // etmek yerine null dönelim ki operatör manuel girsin).
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? local : `${local}${i}`.slice(0, 32);
    if (!USERNAME_RE.test(candidate)) continue;
    const dup = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.username, candidate));
    if (dup.length === 0) return candidate;
  }
  return null;
}

export default router;
