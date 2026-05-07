/**
 * Seeds lab test catalog rows into `test_types` (codes + form templates for Reception & TestRouter).
 * Idempotent: ON DUPLICATE KEY UPDATE refreshes labels/templates by `code`.
 *
 * Run: pnpm run db:seed:test-types   (loads `test_types` so Reception can filter by category = sampleType)
 * Requires DATABASE_URL in .env
 */
import "dotenv/config";
import { testTypes } from "../../drizzle/schema";
import { getDb } from "../db";
import { OFFICIAL_TEST_CATALOG } from "../data/official-test-catalog";

const ROWS = OFFICIAL_TEST_CATALOG;

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available. Set DATABASE_URL in .env");
    process.exit(1);
  }

  let n = 0;
  for (const row of ROWS) {
    await db
      .insert(testTypes)
      .values({
        category: row.category,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        code: row.code,
        unitPrice: row.unitPrice,
        unit: row.unit,
        standardRef: row.standardRef,
        formTemplate: row.formTemplate,
        isActive: row.isActive ?? true,
        sortOrder: row.sortOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          category: row.category,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          unitPrice: row.unitPrice,
          unit: row.unit,
          standardRef: row.standardRef,
          formTemplate: row.formTemplate,
          isActive: row.isActive ?? true,
          sortOrder: row.sortOrder,
          updatedAt: new Date(),
        },
      });
    n++;
  }

  console.log(`Seed test types: upserted ${n} rows (by code).`);
}

function isConnRefused(e: unknown): boolean {
  const err = e as { cause?: { code?: string }; code?: string; message?: string };
  return (
    err?.cause?.code === "ECONNREFUSED" ||
    err?.code === "ECONNREFUSED" ||
    (typeof err?.message === "string" && err.message.includes("ECONNREFUSED"))
  );
}

main().catch((e) => {
  if (isConnRefused(e)) {
    console.error(`
[seed-test-types] Cannot connect to MySQL (ECONNREFUSED).

Fix:
  1. Start MySQL — from the lab-management-system folder run:
       docker compose up -d
     (or start your local MySQL service.)
  2. Ensure .env in lab-management-system has DATABASE_URL, e.g.:
       DATABASE_URL=mysql://root:labroot123@localhost:3306/lab_management
  3. Run this command from lab-management-system (not the parent folder):
       pnpm run db:seed:test-types
`);
  } else {
    console.error(e);
  }
  process.exit(1);
});