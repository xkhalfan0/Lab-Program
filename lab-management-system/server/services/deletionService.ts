import { and, eq, isNull, sql } from "drizzle-orm";
import {
  contractors,
  contracts,
  deletionRequests,
  distributions,
  labOrders,
  samples,
  users,
} from "../../drizzle/schema";
import { addSampleHistory, getDb, mysqlRawInsertRow } from "../db";

export async function analyzeDeletionImpact(
  targetTable: string,
  targetId: number
): Promise<{
  affectedTables: Record<string, number>;
  totalRecords: number;
  canDelete: boolean;
  warnings: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const affectedTables: Record<string, number> = {};
  const warnings: string[] = [];
  let totalRecords = 0;

  // Define FK relationships to check based on target table
  const relationships: Record<string, Array<{ table: string; column: string; cascades: boolean }>> = {
    contracts: [
      { table: "samples", column: "contractId", cascades: false }, // SET NULL
      { table: "clearance_requests", column: "contractId", cascades: false },
    ],
    contractors: [
      { table: "contracts", column: "contractorId", cascades: false },
      { table: "clearance_requests", column: "contractorId", cascades: false },
    ],
    samples: [
      { table: "lab_orders", column: "sampleId", cascades: true }, // CASCADE
      { table: "distributions", column: "sampleId", cascades: true },
      { table: "test_results", column: "sampleId", cascades: true },
      { table: "specialized_test_results", column: "sampleId", cascades: true },
      { table: "concrete_test_groups", column: "sampleId", cascades: true },
      { table: "reviews", column: "sampleId", cascades: true },
      { table: "attachments", column: "sampleId", cascades: true },
      { table: "sample_history", column: "sampleId", cascades: true },
      { table: "notifications", column: "sampleId", cascades: false }, // SET NULL
    ],
    lab_orders: [{ table: "lab_order_items", column: "orderId", cascades: true }],
    distributions: [
      { table: "lab_order_items", column: "distributionId", cascades: false }, // SET NULL
      { table: "test_results", column: "distributionId", cascades: true },
      { table: "specialized_test_results", column: "distributionId", cascades: true },
      { table: "concrete_test_groups", column: "distributionId", cascades: true },
      { table: "attachments", column: "distributionId", cascades: false }, // SET NULL
    ],
    users: [
      { table: "samples", column: "receivedById", cascades: false },
      { table: "lab_orders", column: "createdById", cascades: false },
      { table: "distributions", column: "assignedTechnicianId", cascades: false },
      { table: "test_results", column: "technicianId", cascades: false },
      { table: "reviews", column: "reviewerId", cascades: false },
      { table: "notifications", column: "userId", cascades: true },
    ],
  };

  const relationsToCheck = relationships[targetTable] || [];

  // Query each related table
  for (const rel of relationsToCheck) {
    try {
      const tid = Number(targetId);
      const result = await db.execute(
        sql.raw(
          `SELECT COUNT(*) AS count FROM \`${rel.table}\` WHERE \`${rel.column}\` = ${Number.isFinite(tid) ? tid : 0}`
        )
      );

      const count = (result as any)[0][0].count;

      if (count > 0) {
        affectedTables[rel.table] = count;
        totalRecords += count;

        if (rel.cascades) {
          warnings.push(`⚠️ Will CASCADE delete ${count} record(s) from ${rel.table}`);
        } else {
          warnings.push(`ℹ️ Will SET NULL for ${count} record(s) in ${rel.table}`);
        }
      }
    } catch (e) {
      console.error(`Error checking ${rel.table}:`, e);
    }
  }

  const canDelete = true; // Always allow with admin approval

  return {
    affectedTables,
    totalRecords,
    canDelete,
    warnings,
  };
}

export async function createDeletionRequest(
  requestedBy: number,
  targetTable: string,
  targetId: number,
  reason: string,
  reasonCategory: string
): Promise<{ success: boolean; requestId?: number; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Run impact analysis
    const impact = await analyzeDeletionImpact(targetTable, targetId);

    const header = await mysqlRawInsertRow(db, "deletion_requests", {
      requestedBy,
      targetTable,
      targetId,
      reason,
      reasonCategory: reasonCategory as string,
      impactAnalysis: JSON.stringify(impact),
      status: "pending",
    });

    const requestId = header.insertId;
    if (!requestId) {
      console.error("[deletionService] Failed to get insertId from header:", header);
      return { success: false, error: "Failed to create deletion request" };
    }

    console.log(
      `[deletionService] Created deletion request #${requestId} for ${targetTable}:${targetId}`
    );

    return { success: true, requestId };
  } catch (e) {
    console.error("[deletionService] createDeletionRequest error:", e);
    return { success: false, error: String(e) };
  }
}

async function softDeleteTargetRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  targetTable: string,
  targetId: number,
  reviewedBy: number,
  now: Date,
  audit?: { reason: string; category: string }
) {
  switch (targetTable) {
    case "samples": {
      await db
        .update(samples)
        .set({
          deletedAt: now,
          deletedBy: reviewedBy,
          deletionReason: audit?.reason ?? null,
          deletionCategory: audit?.category ?? null,
          updatedAt: now,
        })
        .where(and(eq(samples.id, targetId), isNull(samples.deletedAt)));

      await db
        .update(distributions)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(distributions.sampleId, targetId), isNull(distributions.deletedAt)));

      const histNotes = `Category: ${audit?.category ?? "—"}. ${audit?.reason ?? ""}`.slice(0, 65000);
      await addSampleHistory({
        sampleId: targetId,
        userId: reviewedBy,
        action: "Deleted by Admin",
        fromStatus: undefined,
        toStatus: undefined,
        notes: histNotes,
      });
      break;
    }
    case "distributions":
      await db
        .update(distributions)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(distributions.id, targetId), isNull(distributions.deletedAt)));
      break;
    case "lab_orders":
      await db
        .update(labOrders)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(labOrders.id, targetId), isNull(labOrders.deletedAt)));
      break;
    case "contractors":
      await db
        .update(contractors)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(contractors.id, targetId), isNull(contractors.deletedAt)));
      break;
    case "contracts":
      await db
        .update(contracts)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(contracts.id, targetId), isNull(contracts.deletedAt)));
      break;
    case "users":
      await db
        .update(users)
        .set({ deletedAt: now, deletedBy: reviewedBy, updatedAt: now })
        .where(and(eq(users.id, targetId), isNull(users.deletedAt)));
      break;
    default:
      await db.execute(
        sql.raw(`
      UPDATE \`${targetTable}\`
      SET deletedAt = NOW(), deletedBy = ${reviewedBy}
      WHERE id = ${targetId} AND deletedAt IS NULL
    `)
      );
  }
}

export async function approveDeletionRequest(
  requestId: number,
  reviewedBy: number,
  comment?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const request = await db
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, requestId))
      .limit(1);

    if (request.length === 0) {
      return { success: false, error: "Request not found" };
    }

    const req = request[0];
    if (req.status !== "pending") {
      return { success: false, error: "Request already processed" };
    }

    const now = new Date();

    await db
      .update(deletionRequests)
      .set({
        status: "approved",
        reviewedBy,
        reviewedAt: now,
        reviewComment: comment,
      })
      .where(eq(deletionRequests.id, requestId));

    await softDeleteTargetRow(db, req.targetTable, req.targetId, reviewedBy, now, {
      reason: req.reason,
      category: req.reasonCategory,
    });

    console.log(`[deletionService] Approved and soft-deleted ${req.targetTable}:${req.targetId}`);

    return { success: true };
  } catch (e) {
    console.error("[deletionService] approveDeletionRequest error:", e);
    return { success: false, error: String(e) };
  }
}

export async function rejectDeletionRequest(
  requestId: number,
  reviewedBy: number,
  comment: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    await db
      .update(deletionRequests)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        reviewComment: comment,
      })
      .where(eq(deletionRequests.id, requestId));

    console.log(`[deletionService] Rejected deletion request #${requestId}`);

    return { success: true };
  } catch (e) {
    console.error("[deletionService] rejectDeletionRequest error:", e);
    return { success: false, error: String(e) };
  }
}
