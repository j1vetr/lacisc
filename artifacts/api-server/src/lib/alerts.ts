import nodemailer, { type Transporter } from "nodemailer";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  emailSettings,
  stationKits,
  stationKitPeriodTotal,
} from "@workspace/db";
import { decrypt } from "./crypto";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Settings helpers (single-row id=1)
// ---------------------------------------------------------------------------

export type EmailSettingsView = {
  enabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasPassword: boolean;
  fromEmail: string | null;
  fromName: string;
  alertRecipients: string | null;
  thresholdStepGib: number;
  updatedAt: Date;
};

export async function getEmailSettings(): Promise<EmailSettingsView> {
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, 1));
  if (!row) {
    // Defensive: row is created by migration, but if missing we surface defaults.
    return {
      enabled: false,
      smtpHost: null,
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: null,
      hasPassword: false,
      fromEmail: null,
      fromName: "Station Satcom Admin",
      alertRecipients: null,
      thresholdStepGib: 100,
      updatedAt: new Date(),
    };
  }
  return {
    enabled: row.enabled,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUser: row.smtpUser,
    hasPassword: !!row.smtpPasswordEncrypted,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    alertRecipients: row.alertRecipients,
    thresholdStepGib: row.thresholdStepGib,
    updatedAt: row.updatedAt,
  };
}

export type EmailSettingsUpdate = {
  enabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  // null → clear; undefined → keep; string → re-encrypt
  smtpPassword?: string | null;
  fromEmail?: string | null;
  fromName?: string;
  alertRecipients?: string | null;
  thresholdStepGib?: number;
};

export async function saveEmailSettings(patch: EmailSettingsUpdate): Promise<EmailSettingsView> {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.smtpHost !== undefined) update.smtpHost = patch.smtpHost;
  if (patch.smtpPort !== undefined) update.smtpPort = patch.smtpPort;
  if (patch.smtpSecure !== undefined) update.smtpSecure = patch.smtpSecure;
  if (patch.smtpUser !== undefined) update.smtpUser = patch.smtpUser;
  if (patch.smtpPassword !== undefined) {
    update.smtpPasswordEncrypted =
      patch.smtpPassword === null || patch.smtpPassword === ""
        ? null
        : encryptPassword(patch.smtpPassword);
  }
  if (patch.fromEmail !== undefined) update.fromEmail = patch.fromEmail;
  if (patch.fromName !== undefined) update.fromName = patch.fromName;
  if (patch.alertRecipients !== undefined)
    update.alertRecipients = patch.alertRecipients;
  if (patch.thresholdStepGib !== undefined)
    update.thresholdStepGib = patch.thresholdStepGib;

  // Upsert the singleton row. drizzle-kit `db push` only creates the table —
  // it does NOT seed defaults, so the id=1 row may not exist yet on a fresh
  // production DB. Using ON CONFLICT lets save() create-or-update in one shot.
  await db
    .insert(emailSettings)
    .values({
      id: 1,
      enabled: (update.enabled as boolean | undefined) ?? false,
      smtpHost: (update.smtpHost as string | null | undefined) ?? null,
      smtpPort: (update.smtpPort as number | undefined) ?? 587,
      smtpSecure: (update.smtpSecure as boolean | undefined) ?? false,
      smtpUser: (update.smtpUser as string | null | undefined) ?? null,
      smtpPasswordEncrypted:
        (update.smtpPasswordEncrypted as string | null | undefined) ?? null,
      fromEmail: (update.fromEmail as string | null | undefined) ?? null,
      fromName: (update.fromName as string | undefined) ?? "Station Satcom Admin",
      alertRecipients:
        (update.alertRecipients as string | null | undefined) ?? null,
      thresholdStepGib: (update.thresholdStepGib as number | undefined) ?? 100,
      updatedAt: update.updatedAt as Date,
    })
    .onConflictDoUpdate({
      target: emailSettings.id,
      set: update,
    });
  return getEmailSettings();
}

function encryptPassword(plain: string): string {
  // Reuse the same AES-256-GCM helper used for portal credentials.
  // Imported lazily to keep crypto out of the hot path when no password set.
  const { encrypt } = require("./crypto") as typeof import("./crypto");
  return encrypt(plain);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function buildTransporter(): Promise<
  | { transporter: Transporter; from: string }
  | { error: string }
> {
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, 1));
  if (!row) return { error: "E-posta ayarları henüz kaydedilmemiş." };
  const missing: string[] = [];
  if (!row.smtpHost) missing.push("SMTP Host");
  if (!row.smtpPort) missing.push("SMTP Port");
  // Fall back to SMTP user (almost always an email) when the explicit
  // "from" address is blank — saves operators from re-typing the same
  // address. Only flag as missing when both are empty.
  const fromAddress = row.fromEmail?.trim() || row.smtpUser?.trim() || "";
  if (!fromAddress) missing.push("Gönderen E-posta");
  if (missing.length > 0) {
    return { error: `Eksik alan: ${missing.join(", ")}.` };
  }
  const password = row.smtpPasswordEncrypted
    ? decrypt(row.smtpPasswordEncrypted)
    : undefined;
  const transporter = nodemailer.createTransport({
    host: row.smtpHost!,
    port: row.smtpPort,
    secure: row.smtpSecure,
    auth:
      row.smtpUser && password
        ? { user: row.smtpUser, pass: password }
        : undefined,
  });
  const from = row.fromName
    ? `"${row.fromName}" <${fromAddress}>`
    : fromAddress;
  return { transporter, from };
}

// RFC-lite email regex: enough to reject obvious garbage (no spaces, single
// '@', non-empty local + domain with a dot). Not full RFC 5322 — but tighter
// than `includes("@")` and prevents nodemailer-side surprises.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipients(csv: string | null | undefined): string[] {
  if (!csv) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of csv.split(/[,;\n]/)) {
    const s = raw.trim().toLowerCase();
    if (!s || !EMAIL_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// Send a one-off test email to the configured recipients (or to a single
// override address if provided). Returns the resolved recipient list and
// whatever info nodemailer reports.
export async function sendTestEmail(
  overrideTo?: string
): Promise<{ ok: boolean; message: string; recipients: string[] }> {
  try {
    const built = await buildTransporter();
    if ("error" in built) {
      return { ok: false, message: built.error, recipients: [] };
    }
    const settings = await getEmailSettings();
    const recipients = overrideTo
      ? parseRecipients(overrideTo)
      : parseRecipients(settings.alertRecipients);
    if (recipients.length === 0) {
      return {
        ok: false,
        message: "Alıcı listesi boş.",
        recipients: [],
      };
    }
    await built.transporter.sendMail({
      from: built.from,
      to: recipients.join(", "),
      subject: "[Station] Test E-Postası",
      text:
        "Bu bir test e-postasıdır. SMTP yapılandırmanız doğru çalışıyor.\n\n" +
        `Gönderim zamanı: ${new Date().toISOString()}`,
    });
    return {
      ok: true,
      message: `Test e-postası ${recipients.length} alıcıya gönderildi.`,
      recipients,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Test email failed");
    return { ok: false, message, recipients: [] };
  }
}

// ---------------------------------------------------------------------------
// Threshold check — called by the scraper after upserting a period total.
// We compute the highest 100-GiB step the current totalGib has crossed; if it
// is greater than `last_alert_threshold_gib`, we send a single email naming
// that step and persist the new value so the same threshold is never
// re-emailed (across days, or even within the same day if sync is repeated).
// ---------------------------------------------------------------------------
export async function checkAndSendUsageAlert(opts: {
  credentialId: number;
  credentialLabel: string;
  kitNo: string;
  period: string;
  totalGib: number | null | undefined;
  totalUsd: number | null | undefined;
}): Promise<void> {
  if (opts.totalGib == null || !Number.isFinite(opts.totalGib)) return;
  try {
    const settings = await getEmailSettings();
    if (!settings.enabled) return;
    const recipients = parseRecipients(settings.alertRecipients);
    if (recipients.length === 0) return;
    const step = Math.max(1, settings.thresholdStepGib);

    const crossedStep = Math.floor(opts.totalGib / step) * step;
    if (crossedStep <= 0) return;

    // Atomic claim: only one worker wins this threshold. Concurrent fire-and-
    // forget calls for the same (credential, kit, period) cannot both send.
    // A returned row means *we* moved last_alert_threshold_gib forward; an
    // empty result means another worker (or a previous run) already crossed
    // this step, so we skip both the email and any re-update.
    const claimed = await db
      .update(stationKitPeriodTotal)
      .set({ lastAlertThresholdGib: crossedStep })
      .where(
        and(
          eq(stationKitPeriodTotal.credentialId, opts.credentialId),
          eq(stationKitPeriodTotal.kitNo, opts.kitNo),
          eq(stationKitPeriodTotal.period, opts.period),
          sql`${stationKitPeriodTotal.lastAlertThresholdGib} < ${crossedStep}`
        )
      )
      .returning({ id: stationKitPeriodTotal.kitNo });
    if (claimed.length === 0) return;

    // Resolve a friendly ship name for the subject.
    const [kit] = await db
      .select({ shipName: stationKits.shipName })
      .from(stationKits)
      .where(eq(stationKits.kitNo, opts.kitNo));
    const shipLabel = kit?.shipName?.trim() || opts.kitNo;

    const built = await buildTransporter();
    if ("error" in built) {
      logger.warn(
        { kitNo: opts.kitNo, period: opts.period, crossedStep, reason: built.error },
        "Threshold crossed but SMTP not configured — skipping email (claim already persisted)"
      );
      return;
    }

    const periodLabel = `${opts.period.slice(0, 4)}-${opts.period.slice(4)}`;
    const usdLine =
      opts.totalUsd != null
        ? `\nDönem maliyeti: $${opts.totalUsd.toFixed(2)}`
        : "";

    const subject = `[Station] ${shipLabel} (${opts.kitNo}) ${crossedStep} GiB'e ulaştı`;
    const text =
      `${shipLabel} terminali aktif dönemde ${crossedStep} GiB kullanım eşiğini geçti.\n\n` +
      `Hesap: ${opts.credentialLabel}\n` +
      `Terminal: ${opts.kitNo}` +
      (kit?.shipName ? ` (${kit.shipName})` : "") +
      `\n` +
      `Dönem: ${periodLabel}\n` +
      `Anlık tüketim: ${opts.totalGib.toFixed(2)} GiB${usdLine}\n\n` +
      `Bilginize.`;

    await built.transporter.sendMail({
      from: built.from,
      to: recipients.join(", "),
      subject,
      text,
    });

    logger.info(
      {
        kitNo: opts.kitNo,
        period: opts.period,
        crossedStep,
        recipients: recipients.length,
      },
      "Usage threshold alert email sent"
    );
  } catch (err) {
    logger.error(
      { err, kitNo: opts.kitNo, period: opts.period },
      "checkAndSendUsageAlert failed"
    );
  }
}
