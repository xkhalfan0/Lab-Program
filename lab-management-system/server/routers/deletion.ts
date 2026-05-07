import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { deletionRequests } from "../../drizzle/schema";
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
      z.object({
        targetTable: z.string(),
        targetId: z.number(),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
        reasonCategory: z.enum([
          "data_error",
          "duplicate",
          "customer_request",
          "compliance",
          "test_data",
          "other",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await createDeletionRequest(
        ctx.user.id,
        input.targetTable,
        input.targetId,
        input.reason,
        input.reasonCategory
      );
    }),

  // Get pending deletion requests (admin only)
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    // Check if user is admin
    if (ctx.user.role !== "admin") {
      throw new Error("Only admins can view pending deletion requests");
    }

    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const requests = await db
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.status, "pending"))
      .orderBy(desc(deletionRequests.createdAt));

    return requests.map((req) => ({
      ...req,
      impactAnalysis: req.impactAnalysis ? JSON.parse(req.impactAnalysis) : null,
    }));
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
