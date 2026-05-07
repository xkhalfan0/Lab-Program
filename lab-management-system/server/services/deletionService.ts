import { eq, sql } from "drizzle-orm";
import { deletionRequests } from "../../drizzle/schema";
import { getDb } from "../db";

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
      const result = await db.execute(
        sql.raw(`
        SELECT COUNT(*) as count 
        FROM ${rel.table} 
        WHERE ${rel.column} = ${targetId}
      `)
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

    // Insert deletion request
    const result = await db.insert(deletionRequests).values({
      requestedBy,
      targetTable,
      targetId,
      reason,
      reasonCategory: reasonCategory as any,
      impactAnalysis: JSON.stringify(impact),
      status: "pending",
    });

    const requestId = (result as any).insertId;

    // TODO: Send notification to admin
    console.log(
      `[deletionService] Created deletion request #${requestId} for ${targetTable}:${targetId}`
    );

    return { success: true, requestId };
  } catch (e) {
    console.error("[deletionService] createDeletionRequest error:", e);
    return { success: false, error: String(e) };
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

    // Get the request
    const request = await db
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, requestId))
      .limit(1);

    if (request.length === 0) {
      return { success: false, error: "Request not found" };
    }

    const req = request[0];

    // Update request to approved
    await db
      .update(deletionRequests)
      .set({
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        reviewComment: comment,
      })
      .where(eq(deletionRequests.id, requestId));

    // Execute soft delete
    await db.execute(sql.raw(`
      UPDATE ${req.targetTable} 
      SET deletedAt = NOW(), deletedBy = ${reviewedBy} 
      WHERE id = ${req.targetId}
    `));

    console.log(`[deletionService] Approved and soft-deleted ${req.targetTable}:${req.targetId}`);

    // TODO: Send notification to requester

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

    // Update request to rejected
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

    // TODO: Send notification to requester

    return { success: true };
  } catch (e) {
    console.error("[deletionService] rejectDeletionRequest error:", e);
    return { success: false, error: String(e) };
  }
}
