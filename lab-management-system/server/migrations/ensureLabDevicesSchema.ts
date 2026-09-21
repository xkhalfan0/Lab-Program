import { sql } from "drizzle-orm";

type SchemaDb = { execute: (query: unknown) => Promise<unknown> };

async function tableExists(db: SchemaDb, table: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `);
  return (result as Record<string, unknown>[]).length > 0;
}

/** Idempotent — lab device / calibration tables for QC equipment tracking. */
export async function ensureLabDevicesSchema(db: SchemaDb): Promise<void> {
  if (!(await tableExists(db, "lab_devices"))) {
    await db.execute(sql`
      CREATE TABLE \`lab_devices\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`deviceCode\` varchar(64) NOT NULL,
        \`nameEn\` varchar(256) NOT NULL,
        \`nameAr\` varchar(256) NULL,
        \`category\` enum('concrete','soil','steel','asphalt','aggregates','general') NOT NULL DEFAULT 'general',
        \`department\` varchar(128) NULL,
        \`manufacturer\` varchar(128) NULL,
        \`model\` varchar(128) NULL,
        \`serialNumber\` varchar(128) NULL,
        \`location\` varchar(256) NULL,
        \`status\` enum('in_service','due_calibration','expired','under_maintenance','retired') NOT NULL DEFAULT 'in_service',
        \`calibrationIntervalDays\` int NOT NULL DEFAULT 365,
        \`lastCalibratedAt\` timestamp NULL,
        \`nextCalibrationDueAt\` timestamp NULL,
        \`maintenanceNotes\` text NULL,
        \`requiresDailyCheck\` boolean NOT NULL DEFAULT false,
        \`deletedAt\` timestamp NULL,
        \`deletedBy\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`lab_devices_deviceCode_unique\` (\`deviceCode\`)
      )
    `);
    console.log("[schema] Created lab_devices table");
  }

  if (!(await tableExists(db, "device_calibrations"))) {
    await db.execute(sql`
      CREATE TABLE \`device_calibrations\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`deviceId\` int NOT NULL,
        \`calibratedAt\` timestamp NOT NULL,
        \`dueAt\` timestamp NOT NULL,
        \`certificateRef\` varchar(128) NULL,
        \`performedBy\` varchar(256) NULL,
        \`result\` enum('pass','fail','adjusted') NOT NULL DEFAULT 'pass',
        \`notes\` text NULL,
        \`recordedById\` int NULL,
        \`recordedByName\` varchar(256) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`device_calibrations_deviceId_idx\` (\`deviceId\`)
      )
    `);
    console.log("[schema] Created device_calibrations table");
  }

  if (!(await tableExists(db, "device_follow_ups"))) {
    await db.execute(sql`
      CREATE TABLE \`device_follow_ups\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`deviceId\` int NULL,
        \`title\` varchar(512) NOT NULL,
        \`assigneeName\` varchar(256) NULL,
        \`dueDate\` timestamp NULL,
        \`status\` enum('open','done') NOT NULL DEFAULT 'open',
        \`createdById\` int NULL,
        \`createdByName\` varchar(256) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      )
    `);
    console.log("[schema] Created device_follow_ups table");
  }

  if (!(await tableExists(db, "device_daily_checks"))) {
    await db.execute(sql`
      CREATE TABLE \`device_daily_checks\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`deviceId\` int NOT NULL,
        \`checkDate\` date NOT NULL,
        \`checkedById\` int NULL,
        \`checkedByName\` varchar(256) NULL,
        \`notes\` text NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`device_daily_checks_device_date_unique\` (\`deviceId\`, \`checkDate\`)
      )
    `);
    console.log("[schema] Created device_daily_checks table");
  }
}
