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
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Email is optional now: customer (görüntüleyici) accounts may be created
  // with only a username + password. Operator accounts (owner/admin/viewer)
  // typically still have an email. Unique when present.
  email: text("email").unique(),
  // Short login handle. Required for customer accounts; backfilled from
  // email's local-part for legacy operator rows. Unique when present.
  username: text("username").unique(),
  passwordHash: text("password_hash").notNull(),
  // 'owner' | 'admin' | 'viewer' | 'customer'. Owner is bootstrap super-admin
  // (cannot be deleted/demoted while there is only one). Admin has full write
  // access. Viewer is read-only operator. Customer is a kısıtlanmış müşteri
  // hesabı that only sees Panel + Terminaller for the KIT'ler explicitly
  // atanmış via customer_kit_assignments.
  role: text("role").default("admin").notNull(),
  lastLoginAt: timestamp("last_login_at"),
  // Optional E.164-without-plus phone (e.g. "905321234567") for WhatsApp
  // threshold notifications. Customer rolündeki kullanıcılar atanmış
  // KIT'leri için bildirim alır; operatör rolleri WhatsApp ayarlarındaki
  // global ops listesi üzerinden bildirim alır.
  phone: text("phone"),
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

// Customer (görüntüleyici müşteri) → KIT atamaları. Sadece `role='customer'`
// hesapları için anlamlıdır; bu tablo doluyken kullanıcı sadece atanmış
// terminalleri görebilir. `source` KIT'in hangi veri kaynağına ait olduğunu
// belirtir (Satcom KITP* veya Starlink KIT+serial); raporlama/UI rozetleri
// için kullanılır. KIT silindiğinde atama da otomatik düşer (CASCADE).
export const customerKitAssignments = pgTable(
  "customer_kit_assignments",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    kitNo: text("kit_no").notNull(),
    source: text("source").notNull(), // 'satcom' | 'starlink'
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    assignedByUserId: integer("assigned_by_user_id").references(
      () => adminUsers.id,
      { onDelete: "set null" }
    ),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kitNo] }),
    index("customer_kit_assignments_user_idx").on(t.userId),
    index("customer_kit_assignments_kit_idx").on(t.kitNo),
  ]
);
export type CustomerKitAssignment = typeof customerKitAssignments.$inferSelect;

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

export const stationKits = pgTable(
  "station_kits",
  {
  kitNo: text("kit_no").notNull(),
  credentialId: integer("credential_id")
    .notNull()
    .references(() => stationCredentials.id, { onDelete: "cascade" }),
  shipName: text("ship_name"),
  detailUrl: text("detail_url"),
  shipNameSyncedAt: timestamp("ship_name_synced_at"),
  // CardDetails.aspx zenginleştirmesi (Task #20). Tümü opsiyonel; periyodik
  // sync'te yenilenir. cardDetailsSyncedAt = en son başarılı CardDetails
  // ziyareti (UI "Son senkron" rozetinde gösterilecek).
  imsi: text("imsi"),
  imei: text("imei"),
  mobileNumber: text("mobile_number"),
  costCenter: text("cost_center"),
  activationDate: date("activation_date"),
  activePlanName: text("active_plan_name"),
  activePlanStartedAt: date("active_plan_started_at"),
  activeSubscriptionId: text("active_subscription_id"),
  optOutGib: doublePrecision("opt_out_gib"),
  stepAlertGib: doublePrecision("step_alert_gib"),
  lastSessionStart: timestamp("last_session_start"),
  lastSessionEnd: timestamp("last_session_end"),
  lastSessionActive: boolean("last_session_active"),
  lastSessionType: text("last_session_type"),
  cardDetailsSyncedAt: timestamp("card_details_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.credentialId, t.kitNo] })]
);

// Snapshot — overwrite each Map sync. Inline JSON `MapManager.terminals`
// on /Starlink/Telemetry/Map sayfasından çekilir; (credential_id, kit_no)
// composite PK — aynı KIT birden fazla hesapta görünebilir. credential_id
// FK cascade — hesap silinince düşer.
export const stationKitLocation = pgTable(
  "station_kit_location",
  {
    kitNo: text("kit_no").notNull(),
    credentialId: integer("credential_id")
      .notNull()
      .references(() => stationCredentials.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    active: boolean("active").default(true).notNull(),
    offline: boolean("offline").default(false).notNull(),
    icon: integer("icon"),
    customerId: integer("customer_id"),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.credentialId, t.kitNo] }),
    index("station_kit_location_credential_idx").on(t.credentialId),
  ]
);
export type StationKitLocation = typeof stationKitLocation.$inferSelect;

// Saatlik telemetri (6 metrik × min/avg/max). DevExpress
// `gvStarlinkMeasurementsOneHour` grid'inden parse edilir; her satır
// bir (kit, intervalStart) noktası. Birim: Mbps (DL/UL), ms (latency),
// % (ping drop / obstruction / signal quality). PK üçlüsü idempotent
// upsert sağlar — aynı saatlik nokta tekrar gelirse overwrite olur.
export const stationKitTelemetryHourly = pgTable(
  "station_kit_telemetry_hourly",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => stationCredentials.id, { onDelete: "cascade" }),
    kitNo: text("kit_no").notNull(),
    intervalStart: timestamp("interval_start").notNull(),
    downloadMinMbps: doublePrecision("download_min_mbps"),
    downloadAvgMbps: doublePrecision("download_avg_mbps"),
    downloadMaxMbps: doublePrecision("download_max_mbps"),
    uploadMinMbps: doublePrecision("upload_min_mbps"),
    uploadAvgMbps: doublePrecision("upload_avg_mbps"),
    uploadMaxMbps: doublePrecision("upload_max_mbps"),
    latencyMinMs: doublePrecision("latency_min_ms"),
    latencyAvgMs: doublePrecision("latency_avg_ms"),
    latencyMaxMs: doublePrecision("latency_max_ms"),
    pingDropMinPct: doublePrecision("ping_drop_min_pct"),
    pingDropAvgPct: doublePrecision("ping_drop_avg_pct"),
    pingDropMaxPct: doublePrecision("ping_drop_max_pct"),
    obstructionMinPct: doublePrecision("obstruction_min_pct"),
    obstructionAvgPct: doublePrecision("obstruction_avg_pct"),
    obstructionMaxPct: doublePrecision("obstruction_max_pct"),
    signalQualityMinPct: doublePrecision("signal_quality_min_pct"),
    signalQualityAvgPct: doublePrecision("signal_quality_avg_pct"),
    signalQualityMaxPct: doublePrecision("signal_quality_max_pct"),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_station_kit_telemetry_hourly").on(
      t.credentialId,
      t.kitNo,
      t.intervalStart
    ),
    index("station_kit_telemetry_hourly_lookup_idx").on(
      t.kitNo,
      t.intervalStart
    ),
  ]
);
export type StationKitTelemetryHourly =
  typeof stationKitTelemetryHourly.$inferSelect;

// Abonelik geçmişi — CardDetails.aspx alt grid'inden (gvSubscriptionHistory)
// parse edilir. PK: (kit_no, subscription_id). Her sync'te upsert; eski
// abonelik kayıtları korunur.
export const stationKitSubscriptionHistory = pgTable(
  "station_kit_subscription_history",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => stationCredentials.id, { onDelete: "cascade" }),
    kitNo: text("kit_no").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    customerId: text("customer_id"),
    customerName: text("customer_name"),
    pricePlanName: text("price_plan_name"),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.credentialId, t.kitNo, t.subscriptionId] }),
    index("station_kit_subscription_history_kit_idx").on(t.kitNo),
  ]
);
export type StationKitSubscriptionHistory =
  typeof stationKitSubscriptionHistory.$inferSelect;

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

// ===========================================================================
// Tototheo TM Starlink — multi-account (Task #27)
// ===========================================================================

// One row per Tototheo API hesabı. Mirrors station_credentials kalıbı:
// label + secret + sync state. UI never returns the encrypted token.
export const starlinkCredentials = pgTable("starlink_credentials", {
  id: serial("id").primaryKey(),
  label: text("label"),
  apiBaseUrl: text("api_base_url")
    .default("https://starlink.tototheo.com")
    .notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  syncIntervalMinutes: integer("sync_interval_minutes").default(30).notNull(),
  lastSuccessSyncAt: timestamp("last_success_sync_at"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type StarlinkCredentials = typeof starlinkCredentials.$inferSelect;
export const insertStarlinkCredentialsSchema = createInsertSchema(
  starlinkCredentials
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStarlinkCredentials = z.infer<
  typeof insertStarlinkCredentialsSchema
>;

// One row per (credential, terminal). Aynı KIT teorik olarak iki ayrı
// Tototheo hesabında görünebilir; PK kompozit (credentialId, kitSerialNumber)
// böyle durumları izole eder. Source detection en son güncellenen kaydı
// öncelikli kabul eder (bkz. /station/kits/:kitNo/source).
export const starlinkTerminals = pgTable(
  "starlink_terminals",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => starlinkCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    nickname: text("nickname"),
    assetName: text("asset_name"),
    isOnline: boolean("is_online"),
    activated: boolean("activated"),
    blocked: boolean("blocked"),
    signalQuality: integer("signal_quality"),
    latency: integer("latency"),
    obstruction: doublePrecision("obstruction"),
    downloadSpeed: doublePrecision("download_speed"),
    uploadSpeed: doublePrecision("upload_speed"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    lastFixAt: timestamp("last_fix_at"),
    activeAlertsCount: integer("active_alerts_count").default(0).notNull(),
    // Tototheo `lastUpdated` (when the terminal last reported home).
    lastSeenAt: timestamp("last_seen_at"),
    // Plan & quota fields (May 2026 — surfaced for Plan ve Kota card).
    plan: text("plan"),
    planAllowanceGb: doublePrecision("plan_allowance_gb"),
    ipv4: text("ipv4"),
    optIn: boolean("opt_in"),
    pingDropRate: doublePrecision("ping_drop_rate"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.credentialId, t.kitSerialNumber] }),
    index("starlink_terminals_kit_idx").on(t.kitSerialNumber),
  ]
);
export type StarlinkTerminal = typeof starlinkTerminals.$inferSelect;

export const starlinkTerminalDaily = pgTable(
  "starlink_terminal_daily",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => starlinkCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    dayDate: date("day_date").notNull(), // YYYY-MM-DD UTC
    packageUsageGb: doublePrecision("package_usage_gb"),
    priorityGb: doublePrecision("priority_gb"),
    overageGb: doublePrecision("overage_gb"),
    lastReadingAt: timestamp("last_reading_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_starlink_daily").on(
      t.credentialId,
      t.kitSerialNumber,
      t.dayDate
    ),
    index("starlink_daily_lookup_idx").on(
      t.credentialId,
      t.kitSerialNumber,
      t.dayDate
    ),
  ]
);

export const starlinkTerminalPeriodTotal = pgTable(
  "starlink_terminal_period_total",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => starlinkCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    period: text("period").notNull(), // YYYYMM
    packageUsageGb: doublePrecision("package_usage_gb"),
    priorityGb: doublePrecision("priority_gb"),
    overageGb: doublePrecision("overage_gb"),
    totalGb: doublePrecision("total_gb"),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_starlink_period_total").on(
      t.credentialId,
      t.kitSerialNumber,
      t.period
    ),
    index("starlink_period_total_period_idx").on(t.period),
  ]
);

// One log row per (credential, sync run). NULL credentialId == aggregate
// "all accounts" run (mirrors station_sync_logs).
export const starlinkSyncLogs = pgTable(
  "starlink_sync_logs",
  {
    id: serial("id").primaryKey(),
    credentialId: integer("credential_id").references(
      () => starlinkCredentials.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull(),
    message: text("message"),
    recordsFound: integer("records_found"),
    recordsInserted: integer("records_inserted"),
    recordsUpdated: integer("records_updated"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("starlink_sync_logs_started_at_idx").on(t.startedAt),
    index("starlink_sync_logs_credential_idx").on(t.credentialId),
  ]
);

// ===========================================================================
// Leo Bridge (Space Norway) — multi-account (Task #27)
// ===========================================================================
// Reseller front-end is a Django site (session cookie auth) with REST endpoints
// under /api/starlink/*. Per requirement, NO plan/price columns are stored;
// only ship name + usage + location.

export const leobridgeCredentials = pgTable("leobridge_credentials", {
  id: serial("id").primaryKey(),
  label: text("label"),
  portalUrl: text("portal_url")
    .default("https://leobridge.spacenorway.com")
    .notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  syncIntervalMinutes: integer("sync_interval_minutes").default(30).notNull(),
  lastSuccessSyncAt: timestamp("last_success_sync_at"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type LeobridgeCredentials = typeof leobridgeCredentials.$inferSelect;
export const insertLeobridgeCredentialsSchema = createInsertSchema(
  leobridgeCredentials
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeobridgeCredentials = z.infer<
  typeof insertLeobridgeCredentialsSchema
>;

export const leobridgeTerminals = pgTable(
  "leobridge_terminals",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => leobridgeCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    serviceLineNumber: text("service_line_number"),
    nickname: text("nickname"),
    addressLabel: text("address_label"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isOnline: boolean("is_online"),
    lastSeenAt: timestamp("last_seen_at"),
    // Aktif fatura döngüsündeki recurring data block'ların toplamı (GB,
    // decimal). `recurringBlocksCurrentBillingCycle[]` üzerinden
    // SUM(count × dataAmount) — birim TB ise ×1000. UI'da kullanım/kota
    // ilerleme çubuğu için.
    planAllowanceGb: doublePrecision("plan_allowance_gb"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.credentialId, t.kitSerialNumber] }),
    index("leobridge_terminals_kit_idx").on(t.kitSerialNumber),
  ]
);
export type LeobridgeTerminal = typeof leobridgeTerminals.$inferSelect;

export const leobridgeTerminalDaily = pgTable(
  "leobridge_terminal_daily",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => leobridgeCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    dayDate: date("day_date").notNull(),
    priorityGb: doublePrecision("priority_gb"),
    standardGb: doublePrecision("standard_gb"),
    totalGb: doublePrecision("total_gb"),
    lastReadingAt: timestamp("last_reading_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_leobridge_daily").on(
      t.credentialId,
      t.kitSerialNumber,
      t.dayDate
    ),
    index("leobridge_daily_lookup_idx").on(
      t.credentialId,
      t.kitSerialNumber,
      t.dayDate
    ),
  ]
);

export const leobridgeTerminalPeriodTotal = pgTable(
  "leobridge_terminal_period_total",
  {
    credentialId: integer("credential_id")
      .notNull()
      .references(() => leobridgeCredentials.id, { onDelete: "cascade" }),
    kitSerialNumber: text("kit_serial_number").notNull(),
    period: text("period").notNull(), // YYYYMM
    priorityGb: doublePrecision("priority_gb"),
    standardGb: doublePrecision("standard_gb"),
    totalGb: doublePrecision("total_gb"),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_leobridge_period_total").on(
      t.credentialId,
      t.kitSerialNumber,
      t.period
    ),
    index("leobridge_period_total_period_idx").on(t.period),
  ]
);

export const leobridgeSyncLogs = pgTable(
  "leobridge_sync_logs",
  {
    id: serial("id").primaryKey(),
    credentialId: integer("credential_id").references(
      () => leobridgeCredentials.id,
      { onDelete: "set null" }
    ),
    status: text("status").notNull(),
    message: text("message"),
    recordsFound: integer("records_found"),
    recordsInserted: integer("records_inserted"),
    recordsUpdated: integer("records_updated"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("leobridge_sync_logs_started_at_idx").on(t.startedAt),
    index("leobridge_sync_logs_credential_idx").on(t.credentialId),
  ]
);

// ---------------------------------------------------------------------------
// WhatsApp eşik bildirimleri (Task #27)
// ---------------------------------------------------------------------------

// Singleton (id=1). wpileti.com hesap sırrı + global operatör bildirim
// listesi + opsiyonel test alıcısı. Plan-bazlı eşik kuralları ayrı tabloda.
export const whatsappSettings = pgTable("whatsapp_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  // wpileti.com endpoint (tek nokta — değişirse buradan ayarlanır).
  endpointUrl: text("endpoint_url")
    .default("https://app.wpileti.com/api/send-message")
    .notNull(),
  // Operatör/admin/viewer için CSV liste — E.164-without-plus
  // (örn. "905321234567,905339998877"). Customer roller bu listeyi YOK
  // sayar; onlar yalnız atanmış KIT bildirimi için adminUsers.phone üzerinden
  // alır.
  opsRecipients: text("ops_recipients"),
  // "Test mesajı gönder" butonu için varsayılan tek alıcı.
  testRecipient: text("test_recipient"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type WhatsappSettings = typeof whatsappSettings.$inferSelect;

// Plan-bazlı eşik kuralları. minPlanGb=NULL → tüm planlar için catchall
// (Satcom KIT'leri planAllowanceGb null olduğu için catchall'a düşer).
// Örn. (50 → 10), (100 → 25), (NULL → 100): 60GB plan her 10GB'da uyarı,
// 200GB plan her 25GB'da, planı bilinmeyen her 100GB'da.
export const whatsappThresholdRules = pgTable(
  "whatsapp_threshold_rules",
  {
    id: serial("id").primaryKey(),
    // Plan kotası (decimal GB). NULL = catchall.
    minPlanGb: doublePrecision("min_plan_gb"),
    // Eşik adımı (decimal GB). En az 1.
    stepGb: doublePrecision("step_gb").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("whatsapp_threshold_rules_min_plan_idx").on(t.minPlanGb)]
);
export type WhatsappThresholdRule = typeof whatsappThresholdRules.$inferSelect;

// E-posta alarmından bağımsız idempotent claim tablosu. Her (kaynak, hesap,
// KIT, dönem) için son tetiklenen GB eşiği. Atomic update sayesinde aynı
// eşik birden fazla kez WhatsApp mesajı oluşturmaz. E-posta alarm sistemi
// (last_alert_threshold_gib column) Satcom-only ve farklı eşik adımı
// kullandığı için ayrı tutuldu.
export const whatsappAlertState = pgTable(
  "whatsapp_alert_state",
  {
    source: text("source").notNull(), // 'satcom' | 'starlink' | 'leobridge'
    credentialId: integer("credential_id").notNull(),
    kitNo: text("kit_no").notNull(),
    period: text("period").notNull(), // YYYYMM
    lastAlertStepGb: doublePrecision("last_alert_step_gb")
      .default(0)
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.source, t.credentialId, t.kitNo, t.period],
    }),
  ]
);
export type WhatsappAlertState = typeof whatsappAlertState.$inferSelect;
