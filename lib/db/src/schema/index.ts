import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  date,
  uniqueIndex,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // 'owner' | 'admin' | 'viewer'. Owner is bootstrap super-admin (cannot be
  // deleted/demoted while there is only one). Admin has full write access.
  // Viewer is read-only — UI hides write actions and API blocks them.
  role: text("role").default("admin").notNull(),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginCount: integer("failed_login_count").default(0).notNull(),
  // While set, login is rejected even with correct credentials. Cleared on
  // first successful login after the timestamp passes.
  lockedUntil: timestamp("locked_until"),
  // Bumped to invalidate all outstanding JWTs for this user (logout-everywhere).
  // Embedded in the token at sign time and verified on every authed request.
  tokenVersion: integer("token_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Active JWT sessions. One row per issued token (jti). requireAuth verifies
// the row still exists; deleting it revokes the session immediately. Used to
// expose an "active sessions" list and per-session revoke in the UI.
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => adminUsers.id, { onDelete: "cascade" })
      .notNull(),
    jti: text("jti").notNull().unique(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId)]
);
export type AdminSession = typeof adminSessions.$inferSelect;

// Append-only audit trail of administrative actions. `actorUserId` is null
// for unauthenticated events (failed logins, system actions). `meta` holds
// arbitrary structured detail (account ids, target user ids, etc.).
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    success: boolean("success").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_actor_idx").on(t.actorUserId),
  ]
);
export type AuditLog = typeof auditLogs.$inferSelect;

export const stationCredentials = pgTable("station_credentials", {
  id: serial("id").primaryKey(),
  label: text("label"),
  portalUrl: text("portal_url").notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  defaultBillingPeriod: text("default_billing_period"),
  syncIntervalMinutes: integer("sync_interval_minutes").default(30).notNull(),
  lastSuccessSyncAt: timestamp("last_success_sync_at"),
  lastErrorMessage: text("last_error_message"),
  firstFullSyncAt: timestamp("first_full_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stationKits = pgTable("station_kits", {
  kitNo: text("kit_no").primaryKey(),
  credentialId: integer("credential_id")
    .notNull()
    .references(() => stationCredentials.id, { onDelete: "cascade" }),
  shipName: text("ship_name"),
  detailUrl: text("detail_url"),
  shipNameSyncedAt: timestamp("ship_name_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per individual CDR (charge line) inside a (kit, period). The portal
// renders these as gün-gün satırlar in the rated CDR grid. We keep cdr_id in
// the PK so multiple charges on the same day for the same KIT+period (rare
// but possible) don't overwrite each other.
export const stationKitDaily = pgTable(
  "station_kit_daily",
  {
    id: serial("id").primaryKey(),
    credentialId: integer("credential_id")
      .notNull()
      .references(() => stationCredentials.id, { onDelete: "cascade" }),
    kitNo: text("kit_no").notNull(),
    period: text("period").notNull(), // YYYYMM
    dayDate: date("day_date").notNull(), // YYYY-MM-DD parsed from grid col9
    volumeGib: doublePrecision("volume_gib"),
    chargeUsd: doublePrecision("charge_usd"),
    service: text("service"),
    cdrId: text("cdr_id").notNull(),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_kit_daily_cdr").on(
      table.credentialId,
      table.kitNo,
      table.period,
      table.cdrId
    ),
    // KIT detail page lookup: WHERE credential_id=? AND kit_no=? AND period=?
    // ORDER BY day_date. Composite index covers the access path.
    index("kit_daily_lookup_idx").on(
      table.credentialId,
      table.kitNo,
      table.period,
      table.dayDate
    ),
  ]
);

// One row per (kit, period) — the period footer totals from the DevExpress
// grid (col12 / col22), plus the row count we observed. Updated on every
// sync that visits this period.
export const stationKitPeriodTotal = pgTable(
  "station_kit_period_total",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => stationCredentials.id, { onDelete: "cascade" }),
    kitNo: text("kit_no").notNull(),
    period: text("period").notNull(), // YYYYMM
    totalGib: doublePrecision("total_gib"),
    totalUsd: doublePrecision("total_usd"),
    rowCount: integer("row_count").default(0).notNull(),
    // Highest 100-GiB step for which an alert email has already been dispatched
    // for this (credential, kit, period). Prevents re-spamming the same
    // threshold across daily syncs. Resets implicitly when the period changes.
    lastAlertThresholdGib: integer("last_alert_threshold_gib")
      .default(0)
      .notNull(),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_kit_period_total").on(
      table.credentialId,
      table.kitNo,
      table.period
    ),
    // Active-period sweep: dashboard + kits list filter on `period = activePeriod()`
    // and aggregate per credential. Without this index every dashboard render
    // does a sequential scan once the table has 10k+ rows.
    index("kit_period_total_period_idx").on(table.period),
  ]
);

// Single-row table (id=1) holding SMTP transport config + alert recipients
// for usage-threshold notifications. Editable from the admin Settings page.
export const emailSettings = pgTable("email_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587).notNull(),
  smtpSecure: boolean("smtp_secure").default(false).notNull(),
  smtpUser: text("smtp_user"),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),
  fromEmail: text("from_email"),
  fromName: text("from_name").default("Station Satcom Admin").notNull(),
  // Comma-separated list of recipient addresses.
  alertRecipients: text("alert_recipients"),
  thresholdStepGib: integer("threshold_step_gib").default(100).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type EmailSettings = typeof emailSettings.$inferSelect;

export const stationSyncLogs = pgTable(
  "station_sync_logs",
  {
    id: serial("id").primaryKey(),
    // NULL == aggregate "all accounts" run; non-null == single account run.
    credentialId: integer("credential_id").references(
      () => stationCredentials.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull(),
    message: text("message"),
    recordsFound: integer("records_found"),
    recordsInserted: integer("records_inserted"),
    recordsUpdated: integer("records_updated"),
    screenshotPath: text("screenshot_path"),
    htmlSnapshotPath: text("html_snapshot_path"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // sync-logs page + readyz lookup both ORDER BY started_at DESC.
    index("station_sync_logs_started_at_idx").on(t.startedAt),
    index("station_sync_logs_credential_idx").on(t.credentialId),
  ]
);

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

export const insertStationCredentialsSchema = createInsertSchema(
  stationCredentials
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStationCredentials = z.infer<
  typeof insertStationCredentialsSchema
>;
export type StationCredentials = typeof stationCredentials.$inferSelect;

export const insertKitDailySchema = createInsertSchema(stationKitDaily).omit({
  id: true,
  scrapedAt: true,
});
export type InsertKitDaily = z.infer<typeof insertKitDailySchema>;
export type KitDaily = typeof stationKitDaily.$inferSelect;

export const insertKitPeriodTotalSchema = createInsertSchema(
  stationKitPeriodTotal
).omit({ scrapedAt: true });
export type InsertKitPeriodTotal = z.infer<typeof insertKitPeriodTotalSchema>;
export type KitPeriodTotal = typeof stationKitPeriodTotal.$inferSelect;

export const insertSyncLogSchema = createInsertSchema(stationSyncLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof stationSyncLogs.$inferSelect;
