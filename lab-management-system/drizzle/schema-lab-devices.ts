import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  date,
} from "drizzle-orm/mysql-core";

export const labDevices = mysqlTable("lab_devices", {
  id: int("id").autoincrement().primaryKey(),
  deviceCode: varchar("deviceCode", { length: 64 }).notNull().unique(),
  nameEn: varchar("nameEn", { length: 256 }).notNull(),
  nameAr: varchar("nameAr", { length: 256 }),
  category: mysqlEnum("category", [
    "concrete",
    "soil",
    "steel",
    "asphalt",
    "aggregates",
    "general",
  ])
    .default("general")
    .notNull(),
  department: varchar("department", { length: 128 }),
  manufacturer: varchar("manufacturer", { length: 128 }),
  model: varchar("model", { length: 128 }),
  serialNumber: varchar("serialNumber", { length: 128 }),
  location: varchar("location", { length: 256 }),
  status: mysqlEnum("status", [
    "in_service",
    "due_calibration",
    "expired",
    "under_maintenance",
    "retired",
  ])
    .default("in_service")
    .notNull(),
  calibrationIntervalDays: int("calibrationIntervalDays").default(365).notNull(),
  lastCalibratedAt: timestamp("lastCalibratedAt"),
  nextCalibrationDueAt: timestamp("nextCalibrationDueAt"),
  maintenanceNotes: text("maintenanceNotes"),
  requiresDailyCheck: boolean("requiresDailyCheck").default(false).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LabDevice = typeof labDevices.$inferSelect;
export type InsertLabDevice = typeof labDevices.$inferInsert;

export const deviceCalibrations = mysqlTable("device_calibrations", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull(),
  calibratedAt: timestamp("calibratedAt").notNull(),
  dueAt: timestamp("dueAt").notNull(),
  certificateRef: varchar("certificateRef", { length: 128 }),
  performedBy: varchar("performedBy", { length: 256 }),
  result: mysqlEnum("result", ["pass", "fail", "adjusted"]).default("pass").notNull(),
  notes: text("notes"),
  recordedById: int("recordedById"),
  recordedByName: varchar("recordedByName", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeviceCalibration = typeof deviceCalibrations.$inferSelect;
export type InsertDeviceCalibration = typeof deviceCalibrations.$inferInsert;

export const deviceFollowUps = mysqlTable("device_follow_ups", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId"),
  title: varchar("title", { length: 512 }).notNull(),
  assigneeName: varchar("assigneeName", { length: 256 }),
  dueDate: timestamp("dueDate"),
  status: mysqlEnum("status", ["open", "done"]).default("open").notNull(),
  createdById: int("createdById"),
  createdByName: varchar("createdByName", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeviceFollowUp = typeof deviceFollowUps.$inferSelect;
export type InsertDeviceFollowUp = typeof deviceFollowUps.$inferInsert;

export const deviceDailyChecks = mysqlTable("device_daily_checks", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull(),
  checkDate: date("checkDate").notNull(),
  checkedById: int("checkedById"),
  checkedByName: varchar("checkedByName", { length: 256 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeviceDailyCheck = typeof deviceDailyChecks.$inferSelect;
export type InsertDeviceDailyCheck = typeof deviceDailyChecks.$inferInsert;
