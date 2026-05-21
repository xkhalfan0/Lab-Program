/**
 * Deactivates legacy rebend-only test types (no new orders).
 * Does not delete distributions or specialized_test_results.
 *
 * Run: pnpm exec tsx server/scripts/deactivate-steel-rebend.ts
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { testTypes } from "../../drizzle/schema";
import { getDb } from "../db";

const LEGACY_REBEND_CODES = ["STEEL_REBEND", "STEEL_BEND_REBEND"];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available. Set DATABASE_URL in .env");
    process.exit(1);
  }

  const result = await db
    .update(testTypes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(testTypes.code, LEGACY_REBEND_CODES));

  console.log(
    "Deactivated",
    LEGACY_REBEND_CODES.join(", "),
    "in test_types (rows affected:",
    result[0]?.affectedRows ?? result,
    "). Use STEEL_BEND for new orders. Historical samples unchanged.",
  );
}

main().catch(console.error).then(() => process.exit(0));
