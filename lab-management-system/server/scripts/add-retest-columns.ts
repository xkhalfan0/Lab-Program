/**
 * Adds retest linkage columns to samples.
 * Run: npm run db:retest-columns
 * Requires DATABASE_URL in .env (same as the app).
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[retest-migration] DATABASE_URL is not set. Add it to lab-management-system/.env");
    process.exit(1);
  }
  const db = await getDb();
  if (!db) {
    console.error("[retest-migration] Database connection failed. Check DATABASE_URL in .env");
    process.exit(1);
  }

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
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  if (cause?.code === "ENOTFOUND" || cause?.code === "ECONNREFUSED") {
    console.error(
      "[retest-migration] Cannot reach the database host from this machine.",
      "\n  - If DATABASE_URL points to Railway/cloud, run this on the deployed server",
      "    (Railway shell / deploy) or paste the SQL below into the Railway MySQL console.",
      "\n  - For local Docker MySQL, use DATABASE_URL=mysql://root:labroot123@localhost:3306/lab_management",
    );
  } else {
    console.error(e);
  }
  process.exit(1);
});
