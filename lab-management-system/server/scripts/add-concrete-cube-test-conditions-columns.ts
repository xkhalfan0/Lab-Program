/**
 * Adds BS cube test condition columns on concrete_test_groups.
 * Run: pnpm run db:concrete-cube-test-conditions
 */
import "dotenv/config";
import { getDb } from "../db";
import { ensureConcreteCubeTestConditionColumns } from "../migrations/ensureConcreteCubeTestConditionColumns";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[concrete-cube-test-conditions] DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = await getDb();
  if (!db) {
    console.error("[concrete-cube-test-conditions] Database connection failed.");
    process.exit(1);
  }
  await ensureConcreteCubeTestConditionColumns(db);
  console.log("[concrete-cube-test-conditions] Done.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
