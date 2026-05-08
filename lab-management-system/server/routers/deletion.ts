import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { deletionRequests, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  analyzeDeletionImpact,
  approveDeletionRequest,
  createDeletionRequest,
  rejectDeletionRequest,
} from "../services/deletionService";

export const deletionRouter = router({
  // Get impact analysis before requesting
  getDeletionImpact: protectedProcedure
    .input(
      z.object({
        targetTable: z.string(),
        targetId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return await analyzeDeletionImpact(input.targetTable, input.targetId);
    }),

  // Create a deletion request
  requestDeletion: protectedProcedure
    .input(
      z
        .object({
          targetTable: z.string(),
          targetId: z.number(),
          reason: z.string().optional(),
          reasonCategory: z.enum([
            "data_error",
            "duplicate",
            "customer_request",
            "compliance",
            "test_data",
            "other",
          ]),
        })
        .refine(
          (data) => data.reasonCategory !== "other" || (data.reason?.trim().length ?? 0) >= 10,
          {
            message: "Reason must be at least 10 characters when category is 'other'",
            path: ["reason"],
          }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const reasonToSave =
        input.reason?.trim().length
          ? input.reason.trim()
          : `Category: ${input.reasonCategory}`;
      return await createDeletionRequest(
        ctx.user.id,
        input.targetTable,
        input.targetId,
        reasonToSave,
        input.reasonCategory
      );
    }),

  // Admin direct delete
  directDelete: protectedProcedure
    .input(
      z.object({
        targetTable: z.string(),
        targetId: z.number(),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Only admins can perform direct delete");
      }

      // Whitelist of allowed tables (prevents SQL injection)
      const allowedTables = ["lab_orders", "distributions", "test_results", "reviews", "samples"];
      if (!allowedTables.includes(input.targetTable)) {
        throw new Error(`Invalid table: ${input.targetTable}`);
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        // Build the SQL query manually with proper escaping
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');
        
        await db.execute(
          sql.raw(`
            UPDATE \`${input.targetTable}\`
            SET deletedAt = '${timestamp}',
                deletedBy = ${ctx.user.id}
            WHERE id = ${input.targetId}
          `)
        );

        console.log(`[directDelete] Deleted ${input.targetTable}:${input.targetId} by user ${ctx.user.id}`);

        return {
          success: true,
          message: `Record deleted successfully`,
        };
      } catch (e: any) {
        console.error("[directDelete] Error:", e);
        throw new Error(`Delete failed: ${e.message || "Unknown error"}`);
      }
    }),

  /** Any authenticated user: whether a pending deletion request exists for this entity */
  getPendingForTarget: protectedProcedure
    .input(
      z.object({
        targetTable: z.string(),
        targetId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const rows = await db
        .select({ id: deletionRequests.id })
        .from(deletionRequests)
        .where(
          and(
            eq(deletionRequests.targetTable, input.targetTable),
            eq(deletionRequests.targetId, input.targetId),
            eq(deletionRequests.status, "pending")
          )
        )
        .limit(1);

      return { pending: rows.length > 0, requestId: rows[0]?.id ?? null };
    }),

  // Get pending deletion requests (admin only)
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    // Check if user is admin
    if (ctx.user.role !== "admin") {
      throw new Error("Only admins can view pending deletion requests");
    }

    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    try {
      const requests = await db
        .select({
          id: deletionRequests.id,
          requestedBy: deletionRequests.requestedBy,
          targetTable: deletionRequests.targetTable,
          targetId: deletionRequests.targetId,
          reason: deletionRequests.reason,
          reasonCategory: deletionRequests.reasonCategory,
          impactAnalysis: deletionRequests.impactAnalysis,
          status: deletionRequests.status,
          reviewedBy: deletionRequests.reviewedBy,
          reviewedAt: deletionRequests.reviewedAt,
          reviewComment: deletionRequests.reviewComment,
          createdAt: deletionRequests.createdAt,
          updatedAt: deletionRequests.updatedAt,
          requester: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(deletionRequests)
        .leftJoin(users, eq(deletionRequests.requestedBy, users.id))
        .orderBy(desc(deletionRequests.createdAt));

      return requests.map((req) => ({
        ...req,
        impactAnalysis: req.impactAnalysis ?? "{}",
      }));
    } catch (e) {
      console.error("[deletionRouter] getPendingRequests error:", e);
      return [];
    }
  }),

  // Get my deletion requests
  getMyRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const requests = await db
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.requestedBy, ctx.user.id))
      .orderBy(desc(deletionRequests.createdAt));

    return requests.map((req) => ({
      ...req,
      impactAnalysis: req.impactAnalysis ? JSON.parse(req.impactAnalysis) : null,
    }));
  }),

  // Approve deletion (admin only)
  approveDeletion: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Only admins can approve deletion requests");
      }

      return await approveDeletionRequest(input.requestId, ctx.user.id, input.comment);
    }),

  // Reject deletion (admin only)
  rejectDeletion: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        comment: z.string().min(10, "Comment is required when rejecting"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Only admins can reject deletion requests");
      }

      return await rejectDeletionRequest(input.requestId, ctx.user.id, input.comment);
    }),
});