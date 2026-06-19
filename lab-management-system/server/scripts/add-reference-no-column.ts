/**
 * Adds contractor reference number column on samples (reception form).
 * Run: tsx server/scripts/add-reference-no-column.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[reference-no] DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = await getDb();
  if (!db) {
    console.error("[reference-no] Database connection failed.");
    process.exit(1);
  }

  const cols = await db.execute(sql`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'samples'
      AND COLUMN_NAME = 'referenceNo'
  `);
  const rows = cols as unknown as { COLUMN_NAME: string }[];
  if (rows.some((r) => r.COLUMN_NAME === "referenceNo")) {
    console.log("[reference-no] Column referenceNo already exists.");
    return;
  }

  await db.execute(sql`ALTER TABLE samples ADD COLUMN referenceNo VARCHAR(128) NULL`);
  console.log("[reference-no] Added referenceNo column.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
