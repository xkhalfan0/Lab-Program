/**
 * Removes duplicate test type entries from database
 * Reduces from 46 entries to 33 actual test capabilities
 * 
 * Run: pnpm run db:cleanup:test-duplicates
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { testTypes } from "../../drizzle/schema";
import { getDb } from "../db";

// Test codes to DELETE (13 duplicates)
const CODES_TO_DELETE = [
  // Concrete (3 duplicates)
  "CONC_FOAM_DENSITY",    // Already in ConcreteFoam.tsx
  "CONC_BEAM_SMALL",      // Already in ConcreteBeam.tsx (size selector)
  "CONC_MORTAR_SAND",     // Use SOIL_SIEVE instead
  
  // Steel (2 duplicates - will merge)
  "STEEL_BEND",           // Merge into STEEL_BEND_REBEND
  "STEEL_REBEND",         // Merge into STEEL_BEND_REBEND
  
  // Asphalt (1 duplicate)
  "ASPH_MARSHALL_DENSITY", // Already in AsphaltMarshall.tsx
  
  // Aggregate (3 duplicates)
  "AGG_SIEVE",            // Use SOIL_SIEVE instead
  "AGG_CRUSHING",         // Merge into AGG_CRUSHING_IMPACT
  "AGG_IMPACT",           // Merge into AGG_CRUSHING_IMPACT
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available. Set DATABASE_URL in .env");
    process.exit(1);
  }

  console.log("í·‘ï¸  Cleaning duplicate test types...\n");
  
  // Show what will be deleted
  const toDelete = await db
    .select()
    .from(testTypes)
    .where(inArray(testTypes.code, CODES_TO_DELETE));
  
  console.log(`Found ${toDelete.length} entries to delete:\n`);
  toDelete.forEach(t => {
    console.log(`  âŒ ${t.code} - ${t.nameEn}`);
  });
  
  // Delete
  const result = await db
    .delete(testTypes)
    .where(inArray(testTypes.code, CODES_TO_DELETE));
  
  console.log(`\nâœ… Deleted ${toDelete.length} duplicate entries`);
  
  // Verify final count
  const remaining = await db.select().from(testTypes);
  console.log(`\ní³Š Final count: ${remaining.length} test types`);
  
  if (remaining.length === 33) {
    console.log("âœ… Perfect! Database now has exactly 33 tests (matches 27 files)");
  } else {
    console.log(`âš ï¸  Expected 33, found ${remaining.length}`);
  }
}

main().catch(console.error).then(() => process.exit(0));
