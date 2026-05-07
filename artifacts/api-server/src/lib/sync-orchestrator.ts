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

export async function runAllAccounts(opts: { forceFull?: boolean } = {}): Promise<OrchestratorResult> {
  // Atomic claim before any async work. The caller (HTTP route, scheduler)
  // may have already claimed via tryClaimRun(); in that case this call is
  // a no-op. If neither path claimed it AND running===true, another run is
  // in flight and we must bail — otherwise we'd start a second concurrent
  // orchestrator (overlap = duplicate scrapes + DB writes).
  const claimedHere = tryClaimRun();
  if (!claimedHere) {
    return {
      success: false,
      message: "Senkronizasyon zaten çalışıyor.",
      recordsFound: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
    };
  }

  try {
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

    return await runAccountsInner(accounts, opts.forceFull ?? false);
  } finally {
    running = false;
  }
}

// Variant for callers that already hold the lock (claimed via tryClaimRun
// in an HTTP fire-and-forget path). Skips re-claim and trusts the caller
// to release `running` in its own finally block. Currently unused — the
// HTTP route uses runAllAccounts() directly which handles the no-op claim.
// Exported for future use if needed.

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
