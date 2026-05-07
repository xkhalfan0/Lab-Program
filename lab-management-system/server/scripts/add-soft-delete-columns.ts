/**
 * Adds soft-delete columns where missing. Idempotent (per-column ADD with duplicate skip).
 *
 * Run: pnpm run db:add-soft-delete
 * Requires DATABASE_URL.
 *
 * Note: MySQL DDL auto-commits; not wrapped in a transaction.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[add-soft-delete] DATABASE_URL is not set.");
    process.exit(1);
  }
}

function isDuplicateColumnError(e: unknown): boolean {
  const err = e as { errno?: number; code?: string; message?: string };
  if (err?.errno === 1060) return true; // ER_DUP_FIELDNAME
  const m = err?.message ?? "";
  return typeof m === "string" && m.includes("Duplicate column name");
}

async function addColumn(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: string,
  columnSql: string,
  label: string
) {
  const stmt = `ALTER TABLE \`${table}\` ADD COLUMN ${columnSql}`;
  try {
    console.log(`[add-soft-delete] ${label}`);
    await db.execute(sql.raw(stmt));
    console.log(`[add-soft-delete] OK ${label}`);
  } catch (e) {
    if (isDuplicateColumnError(e)) {
      console.log(`[add-soft-delete] Skip ${label}: column already exists`);
    } else {
      console.error(`[add-soft-delete] FAILED ${label}:`, e);
      throw e;
    }
  }
}

async function main() {
  requireDatabaseUrl();
  const db = await getDb();
  if (!db) {
    console.error("[add-soft-delete] Database connection failed.");
    process.exit(1);
  }

  const tables = ["lab_orders", "distributions", "users", "contracts", "contractors"] as const;

  for (const t of tables) {
    await addColumn(db, t, "`deletedAt` TIMESTAMP NULL", `${t}.deletedAt`);
    await addColumn(db, t, "`deletedBy` INT NULL", `${t}.deletedBy`);
  }

  console.log("[add-soft-delete] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[add-soft-delete] Fatal:", e);
  process.exit(1);
});
