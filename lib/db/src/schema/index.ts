import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stationCredentials = pgTable("station_credentials", {
  id: serial("id").primaryKey(),
  portalUrl: text("portal_url").notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  defaultBillingPeriod: text("default_billing_period"),
  syncIntervalMinutes: integer("sync_interval_minutes").default(30).notNull(),
  lastSuccessSyncAt: timestamp("last_success_sync_at"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stationCdrRecords = pgTable(
  "station_cdr_records",
  {
    id: serial("id").primaryKey(),
    kitNo: text("kit_no").notNull(),
    product: text("product"),
    service: text("service"),
    originNumber: text("origin_number"),
    destinationNumber: text("destination_number"),
    customerCode: text("customer_code"),
    totalVolumeData: text("total_volume_data"),
    totalVolumeGbNumeric: doublePrecision("total_volume_gb_numeric"),
    totalVolumeMin: text("total_volume_min"),
    totalVolumeMsg: text("total_volume_msg"),
    currency: text("currency"),
    totalPrice: text("total_price"),
    inBundle: text("in_bundle"),
    invoicedAmount: text("invoiced_amount"),
    period: text("period"),
    cdrId: text("cdr_id"),
    startCdr: text("start_cdr"),
    endCdr: text("end_cdr"),
    rawRowData: jsonb("raw_row_data"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_cdr_period_kit_cdrid").on(
      table.period,
      table.kitNo,
      table.cdrId
    ),
  ]
);

export const stationSyncLogs = pgTable("station_sync_logs", {
  id: serial("id").primaryKey(),
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
});

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

export const insertCdrRecordSchema = createInsertSchema(stationCdrRecords).omit(
  { id: true, createdAt: true, updatedAt: true }
);
export type InsertCdrRecord = z.infer<typeof insertCdrRecordSchema>;
export type CdrRecord = typeof stationCdrRecords.$inferSelect;

export const insertSyncLogSchema = createInsertSchema(stationSyncLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof stationSyncLogs.$inferSelect;
