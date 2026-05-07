/**
 * Removes rows that block FK migration (run before db:migration:phase1 if check-integrity fails).
 * WARNING: Deleting invalid contracts may fail if child rows reference them; resolve dependents or disable FKs as needed.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function affectedRows(result: unknown): number {
  const tuple = result as [{ affectedRows?: number } | unknown, unknown];
  const header = tuple[0];
  if (header && typeof header === "object" && "affectedRows" in header) {
    return Number((header as { affectedRows: number }).affectedRows ?? 0);
  }
  return 0;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[clean-orphans] DATABASE_URL is not set.");
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error("[clean-orphans] DB not available");
    process.exit(1);
  }

  console.log("[clean-orphans] Cleaning orphan data...");

  // Fix 1: Delete contracts with invalid contractorId
  const contract = await db.execute(
    sql.raw(`
      DELETE FROM contracts
      WHERE contractorId NOT IN (SELECT id FROM contractors)
    `)
  );
  console.log(`[clean-orphans] Deleted ${affectedRows(contract)} invalid contracts`);

  // Fix 2: Delete notifications with invalid userId (keep userId = 0 for legacy broadcasts)
  const notifs = await db.execute(
    sql.raw(`
      DELETE FROM notifications
      WHERE userId NOT IN (SELECT id FROM users) AND userId != 0
    `)
  );
  console.log(`[clean-orphans] Deleted ${affectedRows(notifs)} invalid notifications`);

  console.log("[clean-orphans] Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error("[clean-orphans] Error:", e);
  process.exit(1);
});
