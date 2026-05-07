/**
 * Adds foreign key constraints (MySQL / InnoDB). Idempotent: drops named FK if present, then re-adds.
 *
 * Run: pnpm run db:add-fks
 * Requires DATABASE_URL.
 *
 * Note: MySQL commits DDL implicitly; operations are not wrapped in a single transaction.
 *
 * Before `fk_notification_user`: fix rows where `notifications.userId` is not a real `users.id`
 * (e.g. legacy `userId = 0` for sector broadcasts will violate this FK).
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[add-foreign-keys] DATABASE_URL is not set.");
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

function isAddDuplicateOrExistsError(e: unknown): boolean {
  const err = e as { errno?: number; code?: string; message?: string };
  if (err?.errno === 1826 || err?.errno === 1061 || err?.errno === 121) return true;
  const m = err?.message ?? "";
  return typeof m === "string" && (m.includes("Duplicate foreign key") || m.includes("already exists"));
}

async function dropFkIfExists(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: string,
  constraint: string
) {
  const stmt = `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraint}\``;
  try {
    console.log(`[add-foreign-keys] DROP ${constraint} on ${table}`);
    await db.execute(sql.raw(stmt));
    console.log(`[add-foreign-keys] Dropped ${constraint}`);
  } catch (e) {
    if (isDropMissingFkError(e)) {
      console.log(`[add-foreign-keys] Skip DROP ${constraint}: not present`);
    } else {
      throw e;
    }
  }
}

async function addFk(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: string,
  constraint: string,
  definition: string
) {
  await dropFkIfExists(db, table, constraint);
  const stmt = `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ${definition}`;
  try {
    console.log(`[add-foreign-keys] ADD ${constraint} on ${table}`);
    await db.execute(sql.raw(stmt));
    console.log(`[add-foreign-keys] OK ${constraint}`);
  } catch (e) {
    if (isAddDuplicateOrExistsError(e)) {
      console.log(`[add-foreign-keys] Skip ADD ${constraint}: already exists`);
    } else {
      console.error(`[add-foreign-keys] FAILED ${constraint}:`, e);
      throw e;
    }
  }
}

async function main() {
  requireDatabaseUrl();
  const db = await getDb();
  if (!db) {
    console.error("[add-foreign-keys] Database connection failed.");
    process.exit(1);
  }

  console.log("[add-foreign-keys] Starting FK migration (DDL commits per statement on MySQL).");

  const fks: Array<{ table: string; name: string; def: string }> = [
    {
      table: "samples",
      name: "fk_samples_contract",
      def: "FOREIGN KEY (`contractId`) REFERENCES `contracts`(`id`) ON DELETE SET NULL",
    },
    {
      table: "samples",
      name: "fk_samples_received_by",
      def: "FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`)",
    },
    {
      table: "samples",
      name: "fk_samples_test_type",
      def: "FOREIGN KEY (`requestedTestTypeId`) REFERENCES `test_types`(`id`) ON DELETE SET NULL",
    },
    {
      table: "samples",
      name: "fk_samples_deleted_by",
      def: "FOREIGN KEY (`deletedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL",
    },
    {
      table: "lab_orders",
      name: "fk_orders_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "lab_orders",
      name: "fk_orders_created_by",
      def: "FOREIGN KEY (`createdById`) REFERENCES `users`(`id`)",
    },
    {
      table: "lab_orders",
      name: "fk_orders_distributed_by",
      def: "FOREIGN KEY (`distributedById`) REFERENCES `users`(`id`) ON DELETE SET NULL",
    },
    {
      table: "lab_orders",
      name: "fk_orders_technician",
      def: "FOREIGN KEY (`assignedTechnicianId`) REFERENCES `users`(`id`) ON DELETE SET NULL",
    },
    {
      table: "lab_order_items",
      name: "fk_order_items_order",
      def: "FOREIGN KEY (`orderId`) REFERENCES `lab_orders`(`id`) ON DELETE CASCADE",
    },
    {
      table: "lab_order_items",
      name: "fk_order_items_distribution",
      def: "FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`) ON DELETE SET NULL",
    },
    {
      table: "lab_order_items",
      name: "fk_order_items_test_type",
      def: "FOREIGN KEY (`testTypeId`) REFERENCES `test_types`(`id`)",
    },
    {
      table: "distributions",
      name: "fk_dist_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "distributions",
      name: "fk_dist_technician",
      def: "FOREIGN KEY (`assignedTechnicianId`) REFERENCES `users`(`id`)",
    },
    {
      table: "distributions",
      name: "fk_dist_assigned_by",
      def: "FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`)",
    },
    {
      table: "test_results",
      name: "fk_test_result_dist",
      def: "FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`) ON DELETE CASCADE",
    },
    {
      table: "test_results",
      name: "fk_test_result_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "test_results",
      name: "fk_test_result_tech",
      def: "FOREIGN KEY (`technicianId`) REFERENCES `users`(`id`)",
    },
    {
      table: "specialized_test_results",
      name: "fk_spec_result_dist",
      def: "FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`) ON DELETE CASCADE",
    },
    {
      table: "specialized_test_results",
      name: "fk_spec_result_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "specialized_test_results",
      name: "fk_spec_result_tech",
      def: "FOREIGN KEY (`technicianId`) REFERENCES `users`(`id`)",
    },
    {
      table: "concrete_test_groups",
      name: "fk_concrete_group_dist",
      def: "FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`) ON DELETE CASCADE",
    },
    {
      table: "concrete_test_groups",
      name: "fk_concrete_group_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "concrete_test_groups",
      name: "fk_concrete_group_tech",
      def: "FOREIGN KEY (`technicianId`) REFERENCES `users`(`id`)",
    },
    {
      table: "concrete_cubes",
      name: "fk_cube_group",
      def: "FOREIGN KEY (`groupId`) REFERENCES `concrete_test_groups`(`id`) ON DELETE CASCADE",
    },
    {
      table: "reviews",
      name: "fk_review_test_result",
      def: "FOREIGN KEY (`testResultId`) REFERENCES `test_results`(`id`) ON DELETE CASCADE",
    },
    {
      table: "reviews",
      name: "fk_review_spec_result",
      def: "FOREIGN KEY (`specializedTestResultId`) REFERENCES `specialized_test_results`(`id`) ON DELETE CASCADE",
    },
    {
      table: "reviews",
      name: "fk_review_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "reviews",
      name: "fk_review_reviewer",
      def: "FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`)",
    },
    {
      table: "attachments",
      name: "fk_attachment_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "attachments",
      name: "fk_attachment_dist",
      def: "FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`) ON DELETE SET NULL",
    },
    {
      table: "attachments",
      name: "fk_attachment_uploader",
      def: "FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`)",
    },
    {
      table: "clearance_requests",
      name: "fk_clearance_contract",
      def: "FOREIGN KEY (`contractId`) REFERENCES `contracts`(`id`)",
    },
    {
      table: "clearance_requests",
      name: "fk_clearance_contractor",
      def: "FOREIGN KEY (`contractorId`) REFERENCES `contractors`(`id`)",
    },
    {
      table: "clearance_requests",
      name: "fk_clearance_requester",
      def: "FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`)",
    },
    {
      table: "contracts",
      name: "fk_contract_contractor",
      def: "FOREIGN KEY (`contractorId`) REFERENCES `contractors`(`id`)",
    },
    {
      table: "sample_history",
      name: "fk_history_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE CASCADE",
    },
    {
      table: "sample_history",
      name: "fk_history_user",
      def: "FOREIGN KEY (`userId`) REFERENCES `users`(`id`)",
    },
    {
      table: "notifications",
      name: "fk_notification_user",
      def: "FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE",
    },
    {
      table: "notifications",
      name: "fk_notification_sample",
      def: "FOREIGN KEY (`sampleId`) REFERENCES `samples`(`id`) ON DELETE SET NULL",
    },
  ];

  for (const fk of fks) {
    await addFk(db, fk.table, fk.name, fk.def);
  }

  console.log("[add-foreign-keys] Done.");
}

main().catch((e) => {
  console.error("[add-foreign-keys] Fatal:", e);
  process.exit(1);
});
