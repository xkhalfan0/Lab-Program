/**
 * Adds retest linkage columns to samples.
 * Run: tsx server/scripts/add-retest-columns.ts
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cols = await db.execute(sql`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'samples'
      AND COLUMN_NAME IN ('originalSampleId', 'retestNumber', 'retestReason', 'retestReasonNotes')
  `);
  const existing = new Set(
    (cols as unknown as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME)
  );

  if (!existing.has("originalSampleId")) {
    await db.execute(sql`ALTER TABLE samples ADD COLUMN originalSampleId INT NULL`);
    console.log("[retest-migration] Added originalSampleId");
  }
  if (!existing.has("retestNumber")) {
    await db.execute(sql`ALTER TABLE samples ADD COLUMN retestNumber INT NULL`);
    console.log("[retest-migration] Added retestNumber");
  }
  if (!existing.has("retestReason")) {
    await db.execute(sql`
      ALTER TABLE samples ADD COLUMN retestReason
        ENUM('failed_spec', 'damaged_sample', 'client_request') NULL
    `);
    console.log("[retest-migration] Added retestReason");
  }
  if (!existing.has("retestReasonNotes")) {
    await db.execute(sql`ALTER TABLE samples ADD COLUMN retestReasonNotes TEXT NULL`);
    console.log("[retest-migration] Added retestReasonNotes");
  }

  try {
    await db.execute(sql`CREATE INDEX idx_samples_original ON samples (originalSampleId)`);
    console.log("[retest-migration] Added index idx_samples_original");
  } catch {
    console.log("[retest-migration] Index idx_samples_original already exists or skipped");
  }

  console.log("[retest-migration] Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
