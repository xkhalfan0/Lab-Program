/**
 * Drops foreign keys added by add-foreign-keys.ts (same constraint names). Idempotent.
 *
 * Run: pnpm run db:rollback-fks
 * Requires DATABASE_URL.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[rollback-fks] DATABASE_URL is not set.");
    process.exit(1);
  }
}

function isDropMissingFkError(e: unknown): boolean {
  const err = e as { errno?: number; code?: string; message?: string };
  return (
    err?.errno === 1091 ||
    err?.code === "ER_CANT_DROP_FIELD_OR_KEY" ||
    (typeof err?.message === "string" && err.message.includes("check that column/key exists"))
  );
}

async function dropFk(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: string,
  constraint: string
) {
  const stmt = `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraint}\``;
  try {
    console.log(`[rollback-fks] DROP ${constraint} on ${table}`);
    await db.execute(sql.raw(stmt));
    console.log(`[rollback-fks] OK dropped ${constraint}`);
  } catch (e) {
    if (isDropMissingFkError(e)) {
      console.log(`[rollback-fks] Skip ${constraint}: not present`);
    } else {
      console.error(`[rollback-fks] FAILED ${constraint}:`, e);
      throw e;
    }
  }
}

async function main() {
  requireDatabaseUrl();
  const db = await getDb();
  if (!db) {
    console.error("[rollback-fks] Database connection failed.");
    process.exit(1);
  }

  const fks: Array<{ table: string; name: string }> = [
    { table: "notifications", name: "fk_notification_sample" },
    { table: "notifications", name: "fk_notification_user" },
    { table: "sample_history", name: "fk_history_user" },
    { table: "sample_history", name: "fk_history_sample" },
    { table: "contracts", name: "fk_contract_contractor" },
    { table: "clearance_requests", name: "fk_clearance_requester" },
    { table: "clearance_requests", name: "fk_clearance_contractor" },
    { table: "clearance_requests", name: "fk_clearance_contract" },
    { table: "attachments", name: "fk_attachment_uploader" },
    { table: "attachments", name: "fk_attachment_dist" },
    { table: "attachments", name: "fk_attachment_sample" },
    { table: "reviews", name: "fk_review_reviewer" },
    { table: "reviews", name: "fk_review_sample" },
    { table: "reviews", name: "fk_review_spec_result" },
    { table: "reviews", name: "fk_review_test_result" },
    { table: "concrete_cubes", name: "fk_cube_group" },
    { table: "concrete_test_groups", name: "fk_concrete_group_tech" },
    { table: "concrete_test_groups", name: "fk_concrete_group_sample" },
    { table: "concrete_test_groups", name: "fk_concrete_group_dist" },
    { table: "specialized_test_results", name: "fk_spec_result_tech" },
    { table: "specialized_test_results", name: "fk_spec_result_sample" },
    { table: "specialized_test_results", name: "fk_spec_result_dist" },
    { table: "test_results", name: "fk_test_result_tech" },
    { table: "test_results", name: "fk_test_result_sample" },
    { table: "test_results", name: "fk_test_result_dist" },
    { table: "lab_order_items", name: "fk_order_items_test_type" },
    { table: "lab_order_items", name: "fk_order_items_distribution" },
    { table: "lab_order_items", name: "fk_order_items_order" },
    { table: "distributions", name: "fk_dist_assigned_by" },
    { table: "distributions", name: "fk_dist_technician" },
    { table: "distributions", name: "fk_dist_sample" },
    { table: "lab_orders", name: "fk_orders_technician" },
    { table: "lab_orders", name: "fk_orders_distributed_by" },
    { table: "lab_orders", name: "fk_orders_created_by" },
    { table: "lab_orders", name: "fk_orders_sample" },
    { table: "samples", name: "fk_samples_deleted_by" },
    { table: "samples", name: "fk_samples_test_type" },
    { table: "samples", name: "fk_samples_received_by" },
    { table: "samples", name: "fk_samples_contract" },
  ];

  for (const fk of fks) {
    await dropFk(db, fk.table, fk.name);
  }

  console.log("[rollback-fks] Done.");
}

main().catch((e) => {
  console.error("[rollback-fks] Fatal:", e);
  process.exit(1);
});
