import { execSync } from "child_process";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

console.log("[migration] Starting full migration...");

async function main() {
  try {
    console.log("[migration] Step 1: Clean orphans");
    execSync("tsx server/scripts/clean-orphan-data.ts", { stdio: "inherit" });

    console.log("[migration] Step 2: Check integrity");
    execSync("tsx server/scripts/check-integrity.ts", { stdio: "inherit" });

    console.log("[migration] Step 3: Add foreign keys");
    execSync("tsx server/scripts/add-foreign-keys.ts", { stdio: "inherit" });

    console.log("[migration] Step 4: Add soft delete");
    execSync("tsx server/scripts/add-soft-delete-columns.ts", { stdio: "inherit" });

    console.log("[migration] Step 5: Seed users");
    execSync("tsx server/scripts/seed-role-users.ts", { stdio: "inherit" });

    console.log("[migration] Step 6: Update sample status enum");
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    await db.execute(sql`
      ALTER TABLE samples
      MODIFY COLUMN status ENUM(
        'received',
        'distributed',
        'testing_in_progress',
        'awaiting_review',
        'under_review',
        'tested',
        'processed',
        'reviewed',
        'approved',
        'qc_passed',
        'qc_failed',
        'clearance_requested',
        'clearance_issued',
        'rejected',
        'revision_requested',
        'deleted'
      ) NOT NULL DEFAULT 'received'
    `);
    console.log("[migration] ✅ sample status enum updated");

    // Step 7: Create deletion_requests table if it doesn't exist
    console.log("[migration] Step 7: Create deletion_requests table");
    try {
      // Drop existing table to recreate with correct column names
      await db.execute(sql`DROP TABLE IF EXISTS deletion_requests`);
      console.log("[migration] Dropped existing deletion_requests table");

      await db.execute(sql`
        CREATE TABLE deletion_requests (
          id INT AUTO_INCREMENT NOT NULL,
          requestedBy INT NOT NULL,
          targetTable VARCHAR(50) NOT NULL,
          targetId INT NOT NULL,
          reason TEXT NOT NULL,
          reasonCategory ENUM('data_error','duplicate','customer_request','compliance','test_data','other') NOT NULL,
          impactAnalysis TEXT,
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          reviewedBy INT,
          reviewedAt TIMESTAMP NULL,
          reviewComment TEXT,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT deletion_requests_id PRIMARY KEY(id)
        )
      `);
      console.log("[migration] ✅ deletion_requests table created with correct column names");
    } catch (e: any) {
      console.error("[migration] Error creating deletion_requests:", e);
      throw e;
    }

    console.log("[migration] ✅ All steps complete!");
    process.exit(0);
  } catch (error) {
    console.error("[migration] ❌ Failed:", error);
    process.exit(1);
  }
}

void main();
