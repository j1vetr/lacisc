// Top-level sync orchestrator. Loops through every active portal account
// sequentially, runs the scraper for each, updates per-account credentials
// state and sync-log entries, and reports live progress.

import { db, stationCredentials, stationSyncLogs } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { decrypt } from "./crypto";
import { runSync } from "./scraper";
import { logger } from "./logger";
import * as progress from "./sync-progress";

let running = false;

export function isOrchestratorRunning(): boolean {
  return running;
}

// Atomic claim — set running=true synchronously (before any async work) so
// concurrent /sync-now calls cannot both pass the gate. Returns true on
// success, false if another run already holds the lock.
export function tryClaimRun(): boolean {
  if (running) return false;
  running = true;
  return true;
}

// Release a lock previously acquired with tryClaimRun(). Use ONLY when the
// caller manages the lock manually (e.g. holding the lock across multiple
// phases in /station/sync-now). The runAllAccounts*() helpers release on
// their own — never call this on a lock they own.
export function releaseRun(): void {
  running = false;
}

export interface OrchestratorResult {
  success: boolean;
  message: string;
  recordsFound: number;
  recordsInserted: number;
  recordsUpdated: number;
}

function accountLabel(c: { id: number; label: string | null; username: string }): string {
  return c.label?.trim() || c.username || `#${c.id}`;
}

// Public entry point #1 — claim the lock atomically and run.
// Use this when the caller has NOT already called tryClaimRun() (e.g. the
// scheduler tick). If another run is in flight, returns success:false
// without ever flipping `running`, so the in-flight run keeps its lock.
export async function runAllAccounts(opts: { forceFull?: boolean } = {}): Promise<OrchestratorResult> {
  if (!tryClaimRun()) {
    return {
      success: false,
      message: "Senkronizasyon zaten çalışıyor.",
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
    };
  }
  try {
    return await runWithActiveAccounts(opts.forceFull ?? false);
  } finally {
    running = false;
  }
}

// Public entry point #2 — caller already holds the lock (called tryClaimRun()
// itself, e.g. the HTTP /station/sync-now route which claims synchronously
// in the request handler before going fire-and-forget). This variant does
// NOT re-claim, but DOES release the lock in its own finally — so callers
// must NOT release it themselves.
export async function runAllAccountsClaimed(opts: { forceFull?: boolean } = {}): Promise<OrchestratorResult> {
  try {
    return await runWithActiveAccounts(opts.forceFull ?? false);
  } finally {
    running = false;
  }
}

async function runWithActiveAccounts(forceFull: boolean): Promise<OrchestratorResult> {
  const accounts = await db
    .select()
    .from(stationCredentials)
    .where(eq(stationCredentials.isActive, true))
    .orderBy(asc(stationCredentials.id));

  if (accounts.length === 0) {
    return {
      success: false,
      message: "Aktif portal hesabı bulunamadı.",
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
    };
  }

  return await runAccountsInner(accounts, forceFull);
}

async function runAccountsInner(
  accounts: Array<typeof stationCredentials.$inferSelect>,
  forceFull: boolean
): Promise<OrchestratorResult> {
  progress.startRun(accounts.length);

  let totalFound = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let anyFailure = false;

  // Aggregate run header log entry (credential_id NULL = "all accounts" wrap).
  const [aggLog] = await db
    .insert(stationSyncLogs)
    .values({ status: "running", startedAt: new Date(), credentialId: null })
    .returning();

  {
    for (let i = 0; i < accounts.length; i++) {
      const c = accounts[i];
      const label = accountLabel(c);
      progress.startAccount(c.id, label, i + 1);

      const [perLog] = await db
        .insert(stationSyncLogs)
        .values({
          status: "running",
          startedAt: new Date(),
          credentialId: c.id,
          message: `Hesap: ${label}`,
        })
        .returning();

      try {
        const password = decrypt(c.encryptedPassword);
        const result = await runSync({
          credentialId: c.id,
          credentialLabel: label,
          portalUrl: c.portalUrl,
          username: c.username,
          password,
          testOnly: false,
          reportProgress: true,
          forceFull,
        });

        await db
          .update(stationSyncLogs)
          .set({
            status: result.success ? "success" : "failed",
            message: `[${label}] ${result.message}`,
            recordsFound: result.recordsFound,
            recordsInserted: result.recordsInserted,
            recordsUpdated: result.recordsUpdated,
            screenshotPath: result.screenshotPath ?? null,
            htmlSnapshotPath: result.htmlSnapshotPath ?? null,
            finishedAt: new Date(),
          })
          .where(eq(stationSyncLogs.id, perLog.id));

        if (result.success) {
          await db
            .update(stationCredentials)
            .set({
              lastSuccessSyncAt: new Date(),
              lastErrorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(stationCredentials.id, c.id));
        } else {
          await db
            .update(stationCredentials)
            .set({ lastErrorMessage: result.message, updatedAt: new Date() })
            .where(eq(stationCredentials.id, c.id));
          anyFailure = true;
        }

        totalFound += result.recordsFound;
        totalInserted += result.recordsInserted;
        totalUpdated += result.recordsUpdated;

        progress.finishAccount({
          credentialId: c.id,
          label,
          success: result.success,
          message: result.message,
          recordsFound: result.recordsFound,
          recordsInserted: result.recordsInserted,
          recordsUpdated: result.recordsUpdated,
        });
      } catch (err) {
        anyFailure = true;
        const msg = (err as Error).message;
        logger.error({ err, credentialId: c.id }, "Account sync error");
        await db
          .update(stationSyncLogs)
          .set({
            status: "failed",
            message: `[${label}] ${msg}`,
            finishedAt: new Date(),
          })
          .where(eq(stationSyncLogs.id, perLog.id));
        await db
          .update(stationCredentials)
          .set({ lastErrorMessage: msg, updatedAt: new Date() })
          .where(eq(stationCredentials.id, c.id));
        progress.finishAccount({
          credentialId: c.id,
          label,
          success: false,
          message: msg,
          recordsFound: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
        });
      }
    }

    const summary = anyFailure
      ? `Tamamlandı (kısmen) — ${accounts.length} hesap, ${totalFound} satır.`
      : `Tüm hesaplar OK — ${accounts.length} hesap, ${totalFound} satır.`;

    await db
      .update(stationSyncLogs)
      .set({
        status: anyFailure ? "failed" : "success",
        message: summary,
        recordsFound: totalFound,
        recordsInserted: totalInserted,
        recordsUpdated: totalUpdated,
        finishedAt: new Date(),
      })
      .where(eq(stationSyncLogs.id, aggLog.id));

    progress.finishRun(summary, !anyFailure);

    return {
      success: !anyFailure,
      message: summary,
      recordsFound: totalFound,
      recordsInserted: totalInserted,
      recordsUpdated: totalUpdated,
    };
  }
}
