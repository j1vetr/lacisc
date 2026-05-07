import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { db, adminUsers } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

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
    const passwordHash = await bcrypt.hash("admin123456", 12);
    await db.insert(adminUsers).values({
      name: "Admin",
      email: "admin@example.com",
      passwordHash,
      role: "owner",
    });
    logger.info("Default admin user created: admin@example.com / admin123456");
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
  void sql; // keep import in case of future use
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
