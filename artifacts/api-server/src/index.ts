import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { db, adminUsers } from "@workspace/db";
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
    });
    logger.info("Default admin user created: admin@example.com / admin123456");
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
