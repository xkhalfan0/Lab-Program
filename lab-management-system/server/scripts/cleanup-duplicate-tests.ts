/**
 * Removes duplicate test type entries from database
 * Reduces from 46 entries to 33 actual test capabilities
 *
 * Run: pnpm run db:cleanup:test-duplicates
 */
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { testTypes } from "../../drizzle/schema";
import { getDb } from "../db";

// Test codes to DELETE (10 duplicates)
const CODES_TO_DELETE = [
  // Concrete (4 duplicates)
  "CONC_FOAM_DENSITY", // Already in ConcreteFoam.tsx
  "CONC_BEAM_SMALL", // Merged into CONC_BEAM (beam size on technical form)
  "CONC_BEAM_LARGE", // Merged into CONC_BEAM (beam size on technical form)
  "CONC_MORTAR_SAND", // Use SOIL_SIEVE instead

  // Steel (2 duplicates - will merge)
  "STEEL_BEND", // Merge into STEEL_BEND_REBEND
  "STEEL_REBEND", // Merge into STEEL_BEND_REBEND

  // Asphalt (1 duplicate)
  "ASPH_MARSHALL_DENSITY", // Already in AsphaltMarshall.tsx

  // Aggregate (3 duplicates)
  "AGG_SIEVE", // Use SOIL_SIEVE instead
  "AGG_CRUSHING", // Merge into AGG_CRUSHING_IMPACT
  "AGG_IMPACT", // Merge into AGG_CRUSHING_IMPACT
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available. Set DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("Cleaning duplicate test types...\n");

  const toDelete = await db.select().from(testTypes).where(inArray(testTypes.code, CODES_TO_DELETE));

  console.log(`Found ${toDelete.length} entries to delete:\n`);
  toDelete.forEach(t => {
    console.log(`  - ${t.code} - ${t.nameEn}`);
  });

  await db.delete(testTypes).where(inArray(testTypes.code, CODES_TO_DELETE));

  console.log(`\nDeleted ${toDelete.length} duplicate entries`);

  const remaining = await db.select().from(testTypes);
  console.log(`\nFinal count: ${remaining.length} test types`);

  if (remaining.length === 33) {
    console.log("OK: Database now has exactly 33 tests (matches 27 files)");
  } else {
    console.log(`Note: Expected 33, found ${remaining.length}`);
  }
}

main().catch(console.error).then(() => process.exit(0));
