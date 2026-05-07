import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { db, adminUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { validatePassword } from "./lib/password-policy";

const isProd = process.env.NODE_ENV === "production";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seed(): Promise<void> {
  const existing = await db.select().from(adminUsers).limit(1);
  if (existing.length === 0) {
    // Bootstrap akışı:
    //   - Üretimde: INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD ZORUNLU.
    //     Şifre policy'si (12+ kar., U/l/d/symbol) sağlanmıyorsa server boot
    //     etmez. Predictable default kimlik bilgileriyle canlıya çıkmak yasak.
    //   - Geliştirmede: env yoksa zayıf 'admin123456' default'una düşer ki
    //     yeni klonlar için hızlı onboarding bozulmasın (loglarda uyarı + REPL.md
    //     varsayılan kimlik bilgilerini açıkça not eder).
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    const name = process.env.INITIAL_ADMIN_NAME ?? "Admin";

    if (isProd) {
      if (!email || !password) {
        throw new Error(
          "Production bootstrap requires INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD env vars.",
        );
      }
      const policyError = validatePassword(password);
      if (policyError) {
        throw new Error(`INITIAL_ADMIN_PASSWORD policy violation: ${policyError}`);
      }
    }

    const finalEmail = email ?? "admin@example.com";
    const finalPassword = password ?? "admin123456";
    const passwordHash = await bcrypt.hash(finalPassword, 12);
    await db.insert(adminUsers).values({
      name,
      email: finalEmail,
      passwordHash,
      role: "owner",
    });

    if (email && password) {
      logger.info({ email: finalEmail }, "Bootstrap admin created from INITIAL_ADMIN_* env");
    } else {
      logger.warn(
        { email: finalEmail },
        "DEV bootstrap admin created with default password — set INITIAL_ADMIN_EMAIL/PASSWORD for production deploys.",
      );
    }
    return;
  }
  // Existing deployments: promote oldest user to owner if no owner exists
  // (e.g. fresh role column with default 'admin' applied to legacy rows).
  const owners = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.role, "owner"))
    .limit(1);
  if (owners.length === 0) {
    const [oldest] = await db
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .orderBy(adminUsers.id)
      .limit(1);
    if (oldest) {
      await db
        .update(adminUsers)
        .set({ role: "owner", updatedAt: new Date() })
        .where(eq(adminUsers.id, oldest.id));
      logger.info({ userId: oldest.id, email: oldest.email }, "Promoted existing user to owner");
    }
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seed();
    startScheduler();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Seed error");
  }
});
