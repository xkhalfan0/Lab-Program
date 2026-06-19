/**
 * Adds contractor_form to attachments.attachmentType enum.
 * Run: npm run db:contractor-form-type
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("[contractor-form-type] Database connection failed.");
    process.exit(1);
  }

  await db.execute(sql`
    ALTER TABLE attachments
    MODIFY COLUMN attachmentType ENUM(
      'photo',
      'document',
      'contractor_letter',
      'sector_letter',
      'payment_order',
      'payment_receipt',
      'test_report',
      'contractor_form',
      'other'
    ) NOT NULL
  `);
  console.log("[contractor-form-type] attachmentType enum updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
