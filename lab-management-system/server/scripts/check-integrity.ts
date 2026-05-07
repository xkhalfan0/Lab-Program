/**
 * Pre-migration integrity: counts orphan rows that would block ADD FOREIGN KEY
 * (same relationships as server/scripts/add-foreign-keys.ts).
 *
 * Run: npm run db:check-integrity
 * Requires DATABASE_URL. Exits 1 if any check finds orphans.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[check-integrity] DATABASE_URL is not set.");
    process.exit(1);
  }
}

/** Drizzle mysql2 `execute` returns mysql2 `[rows, fields]` for raw SQL. */
function extractCount(result: unknown): number {
  if (!Array.isArray(result) || result.length < 1) return 0;
  const rows = result[0];
  if (!Array.isArray(rows) || rows.length < 1) return 0;
  const row = rows[0] as Record<string, unknown>;
  const v = row.c ?? row.C ?? Object.values(row)[0];
  return Number(v ?? 0);
}

const CHECKS: { label: string; query: string }[] = [
  {
    label: "samples.contractId → contracts",
    query: `SELECT COUNT(*) AS c FROM samples s
      LEFT JOIN contracts t ON s.contractId = t.id
      WHERE s.contractId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "samples.receivedById → users",
    query: `SELECT COUNT(*) AS c FROM samples s
      LEFT JOIN users t ON s.receivedById = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "samples.requestedTestTypeId → test_types",
    query: `SELECT COUNT(*) AS c FROM samples s
      LEFT JOIN test_types t ON s.requestedTestTypeId = t.id
      WHERE s.requestedTestTypeId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "samples.deletedBy → users",
    query: `SELECT COUNT(*) AS c FROM samples s
      LEFT JOIN users t ON s.deletedBy = t.id
      WHERE s.deletedBy IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "lab_orders.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM lab_orders o
      LEFT JOIN samples t ON o.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "lab_orders.createdById → users",
    query: `SELECT COUNT(*) AS c FROM lab_orders o
      LEFT JOIN users t ON o.createdById = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "lab_orders.distributedById → users",
    query: `SELECT COUNT(*) AS c FROM lab_orders o
      LEFT JOIN users t ON o.distributedById = t.id
      WHERE o.distributedById IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "lab_orders.assignedTechnicianId → users",
    query: `SELECT COUNT(*) AS c FROM lab_orders o
      LEFT JOIN users t ON o.assignedTechnicianId = t.id
      WHERE o.assignedTechnicianId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "lab_order_items.orderId → lab_orders",
    query: `SELECT COUNT(*) AS c FROM lab_order_items i
      LEFT JOIN lab_orders t ON i.orderId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "lab_order_items.distributionId → distributions",
    query: `SELECT COUNT(*) AS c FROM lab_order_items i
      LEFT JOIN distributions t ON i.distributionId = t.id
      WHERE i.distributionId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "lab_order_items.testTypeId → test_types",
    query: `SELECT COUNT(*) AS c FROM lab_order_items i
      LEFT JOIN test_types t ON i.testTypeId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "distributions.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM distributions d
      LEFT JOIN samples t ON d.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "distributions.assignedTechnicianId → users",
    query: `SELECT COUNT(*) AS c FROM distributions d
      LEFT JOIN users t ON d.assignedTechnicianId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "distributions.assignedById → users",
    query: `SELECT COUNT(*) AS c FROM distributions d
      LEFT JOIN users t ON d.assignedById = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "test_results.distributionId → distributions",
    query: `SELECT COUNT(*) AS c FROM test_results r
      LEFT JOIN distributions t ON r.distributionId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "test_results.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM test_results r
      LEFT JOIN samples t ON r.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "test_results.technicianId → users",
    query: `SELECT COUNT(*) AS c FROM test_results r
      LEFT JOIN users t ON r.technicianId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "specialized_test_results.distributionId → distributions",
    query: `SELECT COUNT(*) AS c FROM specialized_test_results r
      LEFT JOIN distributions t ON r.distributionId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "specialized_test_results.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM specialized_test_results r
      LEFT JOIN samples t ON r.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "specialized_test_results.technicianId → users",
    query: `SELECT COUNT(*) AS c FROM specialized_test_results r
      LEFT JOIN users t ON r.technicianId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "concrete_test_groups.distributionId → distributions",
    query: `SELECT COUNT(*) AS c FROM concrete_test_groups g
      LEFT JOIN distributions t ON g.distributionId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "concrete_test_groups.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM concrete_test_groups g
      LEFT JOIN samples t ON g.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "concrete_test_groups.technicianId → users",
    query: `SELECT COUNT(*) AS c FROM concrete_test_groups g
      LEFT JOIN users t ON g.technicianId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "concrete_cubes.groupId → concrete_test_groups",
    query: `SELECT COUNT(*) AS c FROM concrete_cubes c
      LEFT JOIN concrete_test_groups t ON c.groupId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "reviews.testResultId → test_results",
    query: `SELECT COUNT(*) AS c FROM reviews r
      LEFT JOIN test_results t ON r.testResultId = t.id
      WHERE r.testResultId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "reviews.specializedTestResultId → specialized_test_results",
    query: `SELECT COUNT(*) AS c FROM reviews r
      LEFT JOIN specialized_test_results t ON r.specializedTestResultId = t.id
      WHERE r.specializedTestResultId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "reviews.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM reviews r
      LEFT JOIN samples t ON r.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "reviews.reviewerId → users",
    query: `SELECT COUNT(*) AS c FROM reviews r
      LEFT JOIN users t ON r.reviewerId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "attachments.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM attachments a
      LEFT JOIN samples t ON a.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "attachments.distributionId → distributions",
    query: `SELECT COUNT(*) AS c FROM attachments a
      LEFT JOIN distributions t ON a.distributionId = t.id
      WHERE a.distributionId IS NOT NULL AND t.id IS NULL`,
  },
  {
    label: "attachments.uploadedById → users",
    query: `SELECT COUNT(*) AS c FROM attachments a
      LEFT JOIN users t ON a.uploadedById = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "clearance_requests.contractId → contracts",
    query: `SELECT COUNT(*) AS c FROM clearance_requests r
      LEFT JOIN contracts t ON r.contractId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "clearance_requests.contractorId → contractors",
    query: `SELECT COUNT(*) AS c FROM clearance_requests r
      LEFT JOIN contractors t ON r.contractorId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "clearance_requests.requestedById → users",
    query: `SELECT COUNT(*) AS c FROM clearance_requests r
      LEFT JOIN users t ON r.requestedById = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "contracts.contractorId → contractors",
    query: `SELECT COUNT(*) AS c FROM contracts c
      LEFT JOIN contractors t ON c.contractorId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "sample_history.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM sample_history h
      LEFT JOIN samples t ON h.sampleId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "sample_history.userId → users",
    query: `SELECT COUNT(*) AS c FROM sample_history h
      LEFT JOIN users t ON h.userId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "notifications.userId → users (fix legacy 0 / missing users before fk_notification_user)",
    query: `SELECT COUNT(*) AS c FROM notifications n
      LEFT JOIN users t ON n.userId = t.id
      WHERE t.id IS NULL`,
  },
  {
    label: "notifications.sampleId → samples",
    query: `SELECT COUNT(*) AS c FROM notifications n
      LEFT JOIN samples t ON n.sampleId = t.id
      WHERE n.sampleId IS NOT NULL AND t.id IS NULL`,
  },
];

async function main() {
  requireDatabaseUrl();
  const db = await getDb();
  if (!db) {
    console.error("[check-integrity] Database connection failed.");
    process.exit(1);
  }

  console.log("[check-integrity] Running orphan checks (pre FK migration)…");
  let failed = false;
  for (const { label, query } of CHECKS) {
    const raw = await db.execute(sql.raw(query.replace(/\s+/g, " ").trim()));
    const c = extractCount(raw);
    if (c > 0) {
      failed = true;
      console.error(`[check-integrity] FAIL  ${label}: ${c} orphan row(s)`);
    } else {
      console.log(`[check-integrity] OK    ${label}`);
    }
  }

  if (failed) {
    console.error(
      "[check-integrity] Fix orphan rows above, then re-run db:migration:phase1."
    );
    process.exit(1);
  }
  console.log("[check-integrity] All checks passed.");
}

main().catch((e) => {
  console.error("[check-integrity] Fatal:", e);
  process.exit(1);
});
