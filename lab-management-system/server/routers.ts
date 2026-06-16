import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { sectorRouter } from "./routers/sector";
import { dashboardRouter } from "./routers/dashboard";
import { deletionRouter } from "./routers/deletion";
import { labOrderReceptionCreateInputSchema, runLabOrderReceptionCreate } from "./routers/orders";
import { ensureConcreteGroupsFromReceptionPlan } from "./concreteCubeGroups";
import { parseConcCubePlan } from "@shared/concreteCubeReception";
import { calcActualAgeDays, resolveBs1881AgeFactor } from "@shared/concreteCubeBs1881";
import { generateSampleCode } from "./utils/codeGenerator";
import { requireRole } from "./_core/requireRole";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getAllSectorAccounts,
  addSampleHistory,
  createAttachment,
  createCertificate,
  createNotification,
  createReview,
  createSample,
  createTestResult,
  generateCertificateCode,
  generateDistributionCode,
  createDistribution,
  reassignDistribution,
  createInternalUser,
  deleteUser,
  getAllCertificates,
  getAllSamples,
  getAllUsers,
  getAttachmentsBySample,
  getCertificateBySample,
  getCertificateById,
  getDashboardStats,
  getDistributionById,
  getOrderIdForDistribution,
  getDistributionsBySample,
  getDistributionsByBatch,
  getBatchSiblingDistributions,
  getDistributionsByTechnician,
  checkTestDependencies,
  getNotificationsByUser,
  getReviewsBySample,
  getSampleById,
  getRetestsByRootId,
  getSampleDetailRow,
  getSampleHistory,
  getSamplesByBatch,
  listDeletedSamplesAudit,
  getTechnicians,
  getTestResultBySample,
  getTestResultById,
  getTestResultByDistribution,
  getUserById,
  getUserByUsername,
  markAllNotificationsRead,
  markNotificationRead,
  notifyUsersByRole,
  notifySector,
  getSectorIdByKey,
  updateCertificate,
  updateDistributionStatus,
  markDistributionTaskRead,
  updateInternalUser,
  updateSampleStatus,
  updateSampleFields,
  updateTestResult,
  updateUserRole,
  upsertUser,
  createConcreteGroup,
  getConcreteGroupsByDistribution,
  getConcreteGroupById,
  getCubesByGroup,
  upsertConcreteCube,
  deleteConcreteCube,
  updateConcreteGroupSummary,
  getConcreteGroupsBySample,
  getAllTestTypes,
  getTestTypesByCategory,
  getTestTypeById,
  createTestType,
  updateTestType,
  deleteTestType,
  getAllContractors,
  getContractorById,
  createContractor,
  updateContractor,
  deleteContractor,
  getAllContracts,
  getContractsWithContractor,
  getContractById,
  getContractByNumber,
  createContract,
  updateContract,
  deleteContract,
  getDailyWork,
  createSpecializedTestResult,
  updateSpecializedTestResult,
  getSpecializedTestResultById,
  getSpecializedTestResultByDistribution,
  getSpecializedTestResultsBySample,
  getSpecializedTestResultsBySampleAndTestType,
  getAllClearanceRequests,
  getClearanceRequestById,
  getClearanceRequestsByContract,
  createClearanceRequest,
  updateClearanceRequest,
  createAuditLog,
  getAuditLogs,
  markSampleManagerRead,
  markClearanceQcRead,
  markClearanceAccountantRead,
  getAllSectors,
  getSectorByKey,
  createSector,
  updateSector,
  deleteSector,
  generateOrderCode,
  createLabOrder,
  createLabOrderItems,
  getAllLabOrders,
  getLabOrderById,
  getLabOrderItems,
  getActiveLabOrderItemsForAnalytics,
  getSpecializedResultsByDistributionIds,
  getLabOrdersByStatus,
  getLabOrdersByTechnician,
  updateLabOrderStatus,
  updateLabOrderFields,
  updateLabOrderItemStatus,
  updateLabOrderItemDistribution,
  checkAndCompleteOrder,
  checkAndUpdateSampleStatusAfterSubmission,
} from "./db";
import { storagePut } from "./storage";
import { generateMonthlyReportPdf } from "./monthlyReportPdf";
import { generateDashboardReport } from "./dashboardReportGenerator";
import {
  getRetestSource,
  retestCreateInputSchema,
  runRetestCreate,
  listRetestEligibleSamples,
} from "./retest";
import { invokeLLM } from "./_core/llm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Number of billable units for a test. Most tests bill once (1 unit), but
 * Field Density (Compaction) is billed per test point/location, so its unit
 * count is the number of points recorded in the submitted result.
 */
function billingUnitCount(
  testType: { code?: string | null; formTemplate?: string | null } | null,
  distTestType: string | null | undefined,
  specResult: unknown,
): number {
  const isFieldDensity =
    testType?.formTemplate === "soil_field_density" ||
    testType?.code === "SOIL_FIELD_DENSITY" ||
    distTestType === "SOIL_FIELD_DENSITY";
  if (!isFieldDensity) return 1;
  const fd = (specResult as { formData?: { testPoints?: unknown[]; points?: unknown[] } } | null)?.formData;
  const points = fd?.testPoints ?? fd?.points;
  return Array.isArray(points) && points.length > 0 ? points.length : 1;
}

function calculateStats(values: number[], min?: number | null, max?: number | null) {
  const n = values.length;
  if (n === 0) return null;
  const average = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / n;
  const stdDeviation = Math.sqrt(variance);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const percentage = max ? (average / max) * 100 : null;

  let complianceStatus: "pass" | "fail" | "partial" = "pass";
  const passing = values.filter(
    (v) => (min == null || v >= min) && (max == null || v <= max)
  );
  if (passing.length === 0) complianceStatus = "fail";
  else if (passing.length < n) complianceStatus = "partial";

  return {
    average: Math.round(average * 10000) / 10000,
    stdDeviation: Math.round(stdDeviation * 10000) / 10000,
    percentage: percentage ? Math.round(percentage * 100) / 100 : null,
    minValue: Math.round(minValue * 10000) / 10000,
    maxValue: Math.round(maxValue * 10000) / 10000,
    complianceStatus,
    passingCount: passing.length,
    totalCount: n,
  };
}

// BS EN 12390-3 / 206: at 28d+ average ≥ f_ck and each cube ≥ f_ck − 4 MPa
function concreteRequiredStrengthEarlyAge(targetMpa: number, testAge: number): number {
  if (testAge <= 1) return targetMpa * 0.16;
  if (testAge <= 3) return targetMpa * 0.40;
  if (testAge <= 7) return targetMpa * 0.65;
  if (testAge <= 14) return targetMpa * 0.90;
  if (testAge <= 28) return targetMpa * 0.99;
  return targetMpa * 1.05;
}
function evaluateConcreteCubeCompliance(
  strengths: number[],
  fCk: number | null,
  testAge: number,
): "pass" | "fail" {
  if (!fCk || fCk <= 0 || strengths.length === 0) return "pass";
  const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  if (testAge >= 28) {
    const avgOk = avg >= fCk - 1e-9;
    const minCube = Math.min(...strengths);
    const cubesOk = minCube >= fCk - 4 - 1e-9;
    return avgOk && cubesOk ? "pass" : "fail";
  }
  const requiredAvg = concreteRequiredStrengthEarlyAge(fCk, testAge);
  return avg >= requiredAvg - 1e-9 ? "pass" : "fail";
}

/** Stored per-route permission: none, read-only, or full. Coerces string "true"/"false" from forms. */
const permissionValueSchema = z.unknown().transform((val): false | "view" | "edit" => {
  if (val === true || val === "true") return "edit";
  if (val === false || val === "false") return false;
  if (val === "view" || val === "edit") return val;
  return false;
});

const permissionsRecordSchema = z.record(z.string(), permissionValueSchema);

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Users / Admin ──────────────────────────────────────────────────────────
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, ["admin"]);
      const allUsers = await getAllUsers();
      // Never expose passwordHash to frontend
      return allUsers.map(u => ({ ...u, passwordHash: undefined }));
    }),

    technicians: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, ["admin", "lab_manager"]);
      return getTechnicians();
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, underscores, dots, and hyphens"),
          password: z.string().min(6),
          role: z.enum(["admin", "reception", "lab_manager", "technician", "qc_inspector", "accountant", "user"]),
          specialty: z.string().optional(),
          permissions: permissionsRecordSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        // Check username not taken
        const existing = await getUserByUsername(input.username.toLowerCase());
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = await createInternalUser({
          name: input.name,
          username: input.username.toLowerCase(),
          passwordHash,
          role: input.role,
          specialty: input.specialty,
          permissions: input.permissions,
        });
        return { success: true, userId: user?.id };
      }),

    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account" });
        await deleteUser(input.userId);
        return { success: true };
      }),

    updateRole: protectedProcedure
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["admin", "reception", "lab_manager", "technician", "qc_inspector", "accountant", "user"]),
          specialty: z.string().optional(),
        })
      )
       .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        const target = await getUserById(input.userId);
        await updateUserRole(input.userId, input.role, input.specialty);
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "update_role",
          entity: "user",
          entityId: input.userId,
          entityLabel: target?.name ?? String(input.userId),
          oldValue: { role: target?.role },
          newValue: { role: input.role },
          ipAddress: ctx.req.ip,
        });
        return { success: true };
      }),
    updatePermissions: protectedProcedure
      .input(
        z.object({
          userId: z.number(),
          permissions: permissionsRecordSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Only admin can change permissions
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can modify permissions" });
        }
        const target = await getUserById(input.userId);
        const oldPerms = (target?.permissions as Record<string, unknown>) ?? {};
        await updateInternalUser(input.userId, { permissions: input.permissions as any });
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "update_permissions",
          entity: "user",
          entityId: input.userId,
          entityLabel: target?.name ?? String(input.userId),
          oldValue: oldPerms,
          newValue: input.permissions as Record<string, unknown>,
          ipAddress: ctx.req.ip,
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(
        z.object({
          userId: z.number(),
          name: z.string().min(1).optional(),
          username: z.string().min(3).max(64).optional(),
          password: z.string().min(6).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Admin can edit anyone; non-admin can only edit themselves (name/password)
        if (ctx.user.role !== "admin" && ctx.user.id !== input.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const target = await getUserById(input.userId);
        const updateData: { name?: string; username?: string; passwordHash?: string; isActive?: boolean } = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.username !== undefined) {
          const existing = await getUserByUsername(input.username.toLowerCase());
          if (existing && existing.id !== input.userId) {
            throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
          }
          updateData.username = input.username.toLowerCase();
        }
        if (input.password) updateData.passwordHash = await bcrypt.hash(input.password, 12);
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        await updateInternalUser(input.userId, updateData);
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "update_user",
          entity: "user",
          entityId: input.userId,
          entityLabel: target?.name ?? String(input.userId),
          oldValue: { name: target?.name, username: target?.username, isActive: target?.isActive },
          newValue: { name: input.name, username: input.username, isActive: input.isActive },
          ipAddress: ctx.req.ip,
        });
        return { success: true };
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(6, "Password must be at least 6 characters"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (!user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Account does not have a password set" });
        }
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
        }
        const newHash = await bcrypt.hash(input.newPassword, 12);
        await updateInternalUser(ctx.user.id, { passwordHash: newHash });
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "change_password",
          entity: "user",
          entityId: ctx.user.id,
          entityLabel: ctx.user.name ?? String(ctx.user.id),
          oldValue: {},
          newValue: {},
          ipAddress: ctx.req.ip,
        });
        return { success: true };
      }),
  }),
  // ─── Audit Log
  audit: router({
    list: protectedProcedure
      .input(z.object({
        entity: z.string().optional(),
        entityId: z.number().optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        return getAuditLogs({ entity: input?.entity, entityId: input?.entityId, limit: input?.limit ?? 200 });
      }),
  }),
  // ─── Samples ────────────────────────────────────────────────────────────────
  samples: router({
    list: protectedProcedure
      .input(z.object({ includeDeleted: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const include = input?.includeDeleted === true;
        if (include && !["admin", "lab_manager"].includes(ctx.user.role)) {
          return getAllSamples();
        }
        return getAllSamples({ includeDeleted: include });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const sample = await getSampleById(input.id);
        if (!sample) throw new TRPCError({ code: "NOT_FOUND" });
        return sample;
      }),

    /** Sample detail including soft-deleted rows + admin deleter name (authorized roles only) */
    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const row = await getSampleDetailRow(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const deleted = Boolean((row as { deletedAt?: Date | null }).deletedAt);
        if (deleted) {
          const allowed = ["admin", "lab_manager", "reception", "qc_inspector"].includes(
            ctx.user.role
          );
          if (!allowed) throw new TRPCError({ code: "NOT_FOUND" });
        }
        return row;
      }),

    /** Admin audit trail: soft-deleted samples with reason/category */
    deletionAuditLog: protectedProcedure.query(async ({ ctx }) => {
      if (!["admin", "lab_manager"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or lab manager only" });
      }
      return listDeletedSamplesAudit();
    }),

    searchRetestEligible: protectedProcedure
      .input(
        z.object({
          query: z.string().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        return listRetestEligibleSamples({
          query: input.query,
          limit: input.limit ?? 20,
        });
      }),

    getRetestSource: protectedProcedure
      .input(z.object({ rootSampleId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        return getRetestSource(input.rootSampleId);
      }),

    retestChain: protectedProcedure
      .input(z.object({ sampleId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const sample = await getSampleById(input.sampleId);
        if (!sample) throw new TRPCError({ code: "NOT_FOUND" });
        const rootId = sample.originalSampleId ?? sample.id;
        const root = await getSampleById(rootId);
        const allRetests = await getRetestsByRootId(rootId);
        return {
          root: root ? { id: root.id, sampleCode: root.sampleCode, status: root.status } : null,
          retests: allRetests.map((r) => ({
            id: r.id,
            sampleCode: r.sampleCode,
            retestNumber: r.retestNumber,
            retestReason: r.retestReason,
            status: r.status,
            receivedAt: r.receivedAt,
          })),
          isRetest: sample.originalSampleId != null,
          originalSampleId: sample.originalSampleId,
          retestNumber: sample.retestNumber,
        };
      }),

    create: protectedProcedure
      .input(
        z.object({
          contractId: z.number().optional(),
          contractNumber: z.string().optional(),
          contractName: z.string().optional(),
          contractorName: z.string().optional(),
          sampleType: z.enum(["concrete", "soil", "metal", "asphalt", "steel", "aggregates"]),
          sector: z.string(),
          sectorNameAr: z.string().optional(),
          sectorNameEn: z.string().optional(),
          quantity: z.number().min(1).default(1),
          condition: z.enum(["good", "damaged", "partial"]).default("good"),
          notes: z.string().optional(),
          location: z.string().optional(),
          castingDate: z.date().optional(),
          requestedTestTypeId: z.number().optional(),
          testSubType: z.string().optional(),
          sampleSubType: z.string().optional(),
          testTypeName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        // Auto-fill contract info if contractId provided
        let contractNumber = input.contractNumber;
        let contractName = input.contractName;
        let contractorName = input.contractorName;
        if (input.contractId) {
          const contract = await getContractById(input.contractId);
          if (contract) {
            contractNumber = contract.contractNumber;
            contractName = contract.contractName;
            // Get contractor name from contractors table
            const contractor = await getContractorById(contract.contractorId);
            contractorName = contractor?.nameEn ?? contractorName;
          }
        }
        const sampleCode = await generateSampleCode();
        // Resolve sector names if not provided
        let sectorNameAr = input.sectorNameAr;
        let sectorNameEn = input.sectorNameEn;
        if (!sectorNameAr || !sectorNameEn) {
          const sectorData = await getSectorByKey(input.sector);
          if (sectorData) {
            sectorNameAr = sectorData.nameAr;
            sectorNameEn = sectorData.nameEn;
          }
        }
        const sample = await createSample({
          sampleCode,
          contractId: input.contractId,
          contractNumber,
          contractName,
          contractorName,
          sampleType: input.sampleType as any,
          sector: input.sector as any,
          sectorNameAr,
          sectorNameEn,
          quantity: input.quantity,
          condition: input.condition,
          notes: input.notes ?? null,
          requestedTestTypeId: input.requestedTestTypeId ?? null,
          testSubType: input.testSubType ?? null,
          sampleSubType: input.sampleSubType ?? null,
          testTypeName: input.testTypeName ?? null,
          location: input.location ?? null,
          castingDate: input.castingDate ?? null,
          status: "received",
          receivedById: ctx.user.id,
          receivedAt: new Date(),
        });
        await addSampleHistory({
          sampleId: sample!.id,
          userId: ctx.user.id,
          action: "Sample received",
          fromStatus: undefined,
          toStatus: "received",
          notes: `Sample registered by ${ctx.user.name}`,
        });
        await notifyUsersByRole(
          "lab_manager",
          "New Sample Received",
          `Sample ${sampleCode} has been registered and awaits distribution.`,
          sample!.id,
          "action_required",
          "new_sample"
        );
        // Notify sector: sample received
        try {
          const sectorId = await getSectorIdByKey(input.sector);
          if (sectorId) {
            await notifySector(
              sectorId,
              `تم استلام عينتك في المختبر`,
              `تم استلام العينة ${sampleCode} في مختبر الإنشاءات والمواد الهندسية`,
              sample!.id,
              "sample_received"
            );
          }
        } catch (_e) { /* non-critical */ }
        // Audit log for lab activity
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "sample_received",
          entity: "sample",
          entityId: sample!.id,
          entityLabel: `${sampleCode} — ${input.testTypeName ?? ""}`,
          newValue: { sampleType: input.sampleType, contractNumber, sectorNameAr },
          ipAddress: ctx.req.ip,
        });
        return sample;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        sectorKey: z.string().optional(),
        sectorNameAr: z.string().optional(),
        sectorNameEn: z.string().optional(),
        sampleType: z.enum(["concrete", "soil", "metal", "asphalt", "steel", "aggregates"]).optional(),
        sampleSubType: z.string().optional(),
        testTypeName: z.string().optional(),
        quantity: z.number().min(1).optional(),
        condition: z.enum(["good", "damaged", "partial"]).optional(),
        notes: z.string().optional(),
        location: z.string().optional(),
        castingDate: z.date().optional(),
        requestedTestTypeId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        const { id, sectorKey, sectorNameAr, sectorNameEn, ...rest } = input;
        await updateSampleFields(id, {
          ...rest,
          sector: sectorKey,
          sectorNameAr,
          sectorNameEn,
        });
        return { success: true };
      }),
    stats: protectedProcedure.query(async () => {
      return getDashboardStats();
    }),

    dailyWork: protectedProcedure
      .input(z.object({
        fromDate: z.string(),
        toDate: z.string(),
      }))
      .query(async ({ input }) => {
        const from = new Date(input.fromDate);
        const to = new Date(input.toDate);
        return getDailyWork(from, to);
      }),

    history: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getSampleHistory(input.sampleId);
      }),

    getByBatch: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        return getSamplesByBatch(input.batchId);
      }),

    // ─── Create multiple samples at once (e.g. different block types) ────────
    createMultiple: protectedProcedure
      .input(
        z.object({
          contractId: z.number().optional(),
          contractNumber: z.string().optional(),
          contractName: z.string().optional(),
          contractorName: z.string().optional(),
          sampleType: z.enum(["concrete", "soil", "metal", "asphalt", "steel", "aggregates"]),
          sector: z.string(),
          sectorNameAr: z.string().optional(),
          sectorNameEn: z.string().optional(),
          condition: z.enum(["good", "damaged", "partial"]).default("good"),
          notes: z.string().optional(),
          location: z.string().optional(),
          requestedTestTypeId: z.number().optional(),
          testTypeName: z.string().optional(),
          // Array of sub-types with individual quantities
          items: z.array(z.object({
            sampleSubType: z.string(),      // human-readable label
            testSubType: z.string().optional(), // machine-readable code
            quantity: z.number().min(1).default(10),
          })).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        // Auto-fill contract info
        let contractNumber = input.contractNumber;
        let contractName = input.contractName;
        let contractorName = input.contractorName;
        if (input.contractId) {
          const contract = await getContractById(input.contractId);
          if (contract) {
            contractNumber = contract.contractNumber;
            contractName = contract.contractName;
            const contractor = await getContractorById(contract.contractorId);
            contractorName = contractor?.nameEn ?? contractorName;
          }
        }
        // Resolve sector names
        let sectorNameAr = input.sectorNameAr;
        let sectorNameEn = input.sectorNameEn;
        if (!sectorNameAr || !sectorNameEn) {
          const sectorData = await getSectorByKey(input.sector);
          if (sectorData) {
            sectorNameAr = sectorData.nameAr;
            sectorNameEn = sectorData.nameEn;
          }
        }

        const createdSamples = [];
        // Shared batch id for all rows in this mutation (varchar(32) on samples.batchId)
        const y = new Date().getFullYear();
        const batchTime = Date.now().toString(36).toUpperCase().slice(-5);
        const batchRand = randomBytes(3).toString("hex").toUpperCase();
        let batchId = `BATCH-${y}-${batchTime}${batchRand}`;
        if (batchId.length > 32) {
          batchId = batchId.slice(0, 32);
        }
        for (const item of input.items) {
          const sampleCode = await generateSampleCode();
          const sample = await createSample({
            sampleCode,
            contractId: input.contractId ?? null,
            contractNumber: contractNumber ?? null,
            contractName: contractName ?? null,
            contractorName: contractorName ?? null,
            sampleType: input.sampleType as any,
            sector: input.sector as any,
            sectorNameAr: sectorNameAr ?? null,
            sectorNameEn: sectorNameEn ?? null,
            quantity: item.quantity,
            condition: input.condition,
            notes: input.notes ?? null,
            location: input.location ?? null,
            requestedTestTypeId: input.requestedTestTypeId ?? null,
            testSubType: item.testSubType ?? null,
            sampleSubType: item.sampleSubType ?? null,
            testTypeName: input.testTypeName ?? null,
            batchId,
            status: "received",
            receivedById: ctx.user.id,
            receivedAt: new Date(),
          });
          if (!sample?.id) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Batch create failed after ${createdSamples.length} sample(s); last code: ${sampleCode}`,
            });
          }
          await addSampleHistory({
            sampleId: sample!.id,
            userId: ctx.user.id,
            action: "Sample received",
            fromStatus: undefined,
            toStatus: "received",
            notes: `Sample registered by ${ctx.user.name} (batch)`,
          });
          // Notify lab manager
          await notifyUsersByRole(
            "lab_manager",
            "New Sample Received",
            `Sample ${sampleCode} (${item.sampleSubType}) has been registered and awaits distribution.`,
            sample!.id,
            "action_required",
            "new_sample"
          );
          // Notify sector
          try {
            const sectorId = await getSectorIdByKey(input.sector);
            if (sectorId) {
              await notifySector(
                sectorId,
                `تم استلام عينتك في المختبر`,
                `تم استلام العينة ${sampleCode} (${item.sampleSubType}) في مختبر الإنشاءات والمواد الهندسية`,
                sample!.id,
                "sample_received"
              );
            }
          } catch (_e) { /* non-critical */ }
          await createAuditLog({
            userId: ctx.user.id,
            userName: ctx.user.name ?? "Unknown",
            action: "sample_received",
            entity: "sample",
            entityId: sample!.id,
            entityLabel: `${sampleCode} — ${item.sampleSubType}`,
            newValue: { sampleType: input.sampleType, contractNumber, sectorNameAr },
            ipAddress: ctx.req.ip,
          });
          createdSamples.push(sample);
        }
        return createdSamples;
      }),

    generateSimplifiedReport: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .mutation(async ({ input }) => {
        const sample = await getSampleById(input.sampleId);
        if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "Sample not found" });

        // Gather all test results for this sample
        const testResultsList = await getTestResultBySample(input.sampleId);
        const specializedResults = await getSpecializedTestResultsBySample(input.sampleId);
        const distList = await getDistributionsBySample(input.sampleId);

        // Build a structured summary for the LLM
        const testSummaries: string[] = [];

        for (const dist of distList) {
          const tr = testResultsList.find((r) => r.distributionId === dist.id);
          const sr = specializedResults.find((r) => r.distributionId === dist.id);

          if (tr) {
            const rawValues = Array.isArray(tr.rawValues) ? (tr.rawValues as number[]) : [];
            const status = tr.complianceStatus ?? "pending";
            const avg = tr.average ? Number(tr.average).toFixed(2) : "N/A";
            const minAcc = dist.minAcceptable ? Number(dist.minAcceptable).toFixed(2) : null;
            const maxAcc = dist.maxAcceptable ? Number(dist.maxAcceptable).toFixed(2) : null;
            let acceptRange = "";
            if (minAcc && maxAcc) acceptRange = `(المقبول: ${minAcc} – ${maxAcc} ${dist.unit ?? ""})`;
            else if (minAcc) acceptRange = `(الحد الأدنى المقبول: ${minAcc} ${dist.unit ?? ""})`;
            else if (maxAcc) acceptRange = `(الحد الأقصى المقبول: ${maxAcc} ${dist.unit ?? ""})`;
            testSummaries.push(
              `- اختبار: ${dist.testName}\n  القيم المقاسة: ${rawValues.join(", ")} ${dist.unit ?? ""}\n  المتوسط: ${avg} ${dist.unit ?? ""} ${acceptRange}\n  النتيجة: ${status === "pass" ? "ناجح ✓" : status === "fail" ? "راسب ✗" : "جزئي"}`
            );
          } else if (sr) {
            const result = sr.overallResult === "pass" ? "ناجح ✓" : sr.overallResult === "fail" ? "راسب ✗" : "قيد المراجعة";
            testSummaries.push(
              `- اختبار: ${dist.testName} (${sr.testTypeCode})\n  النتيجة الإجمالية: ${result}\n  ملاحظات: ${sr.notes ?? "لا توجد"}`
            );
          } else {
            testSummaries.push(`- اختبار: ${dist.testName}\n  الحالة: لم تُدخل النتائج بعد`);
          }
        }

        const sampleTypeMap: Record<string, string> = {
          concrete: "خرسانة",
          soil: "تربة",
          metal: "حديد / فولاذ",
          asphalt: "أسفلت",
        };
        const sampleTypeAr = sampleTypeMap[sample.sampleType] ?? sample.sampleType;
        const sampleDate = new Date(sample.receivedAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

        const systemPrompt = `أنت موظف مختبر هندسي تكتب تقارير مبسّطة للمقاولين وأصحاب المشاريع.
اكتب فقرتين أو ثلاث فقرات قصيرة بلغة عربية واضحة وبسيطة:
- الفقرة الأولى: ما هي نتيجة الاختبار بكلمات بسيطة (ناجح أم راسب وبكم).
- الفقرة الثانية: ماذا تعني هذه النتيجة على أرض الواقع للمشروع.
- إذا كانت النتيجة راسبة: فقرة ثالثة بالتوصية المطلوبة.
لا تذكر خطوات العمل الداخلية للمختبر ولا حالة الملف الإدارية. لا تستخدم عناوين أو نقاط أو Markdown. فقط نص عادي بفقرات. لا تتجاوز 200 كلمة.`;

        const userMessage = `نوع المادة: ${sampleTypeAr}
المشروع: ${sample.contractName ?? "غير محدد"}
المقاول: ${sample.contractorName ?? "غير محدد"}

نتائج الاختبارات:
${testSummaries.length > 0 ? testSummaries.join("\n\n") : "لم تُجرَ اختبارات بعد"}`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });

        const rawContent = llmResponse.choices?.[0]?.message?.content;
        const reportText = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((c: any) => (c.type === "text" ? c.text : "")).join("")
            : "تعذّر توليد التقرير. يرجى المحاولة مرة أخرى.";

        return {
          sampleCode: sample.sampleCode,
          sampleType: sampleTypeAr,
          contractName: sample.contractName ?? "",
          contractorName: sample.contractorName ?? "",
          sampleDate,
          reportText,
        };
      }),
  }),

  // ─── Distributions ──────────────────────────────────────────────────────────
  distributions: router({
    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getDistributionsBySample(input.sampleId);
      }),

    myAssignments: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, ["admin", "technician"]);
      return getDistributionsByTechnician(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          assignedTechnicianId: z.number(),
          testType: z.string().min(1),
          testName: z.string().min(1),
          originalTestType: z.string().optional(), // original test from reception
          testTypeChangedNote: z.string().optional(), // mandatory note if test was changed
          minAcceptable: z.number().optional(),
          maxAcceptable: z.number().optional(),
          unit: z.string().default("MPa"),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          expectedCompletionDate: z.string().optional(),
          notes: z.string().optional(),
          quantity: z.number().int().min(1).default(1),
          unitPrice: z.number().min(0).default(0),
          testSubType: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const distributionCode = await generateDistributionCode();
        const totalCost = (input.quantity ?? 1) * (input.unitPrice ?? 0);
        const testWasChanged = input.originalTestType && input.originalTestType !== input.testType;
        const dist = await createDistribution({
          distributionCode,
          sampleId: input.sampleId,
          assignedTechnicianId: input.assignedTechnicianId,
          assignedById: ctx.user.id,
          testType: input.testType,
          testName: input.testName,
          originalTestType: testWasChanged ? input.originalTestType : undefined,
          testTypeChangedNote: testWasChanged ? input.testTypeChangedNote : undefined,
          minAcceptable: input.minAcceptable?.toString(),
          maxAcceptable: input.maxAcceptable?.toString(),
          unit: input.unit,
          priority: input.priority,
          expectedCompletionDate: input.expectedCompletionDate
            ? new Date(input.expectedCompletionDate)
            : undefined,
          notes: input.notes,
          status: "pending",
          quantity: input.quantity ?? 1,
          unitPrice: (input.unitPrice ?? 0).toString(),
          totalCost: totalCost.toString(),
          testSubType: input.testSubType,
        });
        await updateSampleStatus(input.sampleId, "distributed");
        const historyNote = testWasChanged
          ? `Distribution order ${distributionCode} created — Test type changed by distributor: ${input.originalTestType} → ${input.testType}. Reason: ${input.testTypeChangedNote ?? "No reason provided"}`
          : `Distribution order ${distributionCode} created`;
        await addSampleHistory({
          sampleId: input.sampleId,
          userId: ctx.user.id,
          action: testWasChanged ? "Sample distributed (test type changed)" : "Sample distributed",
          fromStatus: "received",
          toStatus: "distributed",
          notes: historyNote,
        });
        const technician = await getUserById(input.assignedTechnicianId);
        const assignedSample = await getSampleById(input.sampleId);
        if (technician) {
          await createNotification({
            userId: technician.id,
            sampleId: input.sampleId,
            title: `تكليف جديد — New Test Assignment`,
            message: `تم تكليفك بفحص العينة ${assignedSample?.sampleCode} (اختبار: ${input.testName}) — رقم التوزيع: ${distributionCode} | You have been assigned to test sample ${assignedSample?.sampleCode} (${input.testName}). Order: ${distributionCode}`,
            type: "action_required",
          });
        }
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "sample_distributed",
          entity: "sample",
          entityId: input.sampleId,
          entityLabel: `${assignedSample?.sampleCode ?? ""} — ${input.testName} → ${technician?.name ?? ""}`,
          newValue: { distributionCode, testType: input.testType },
          ipAddress: ctx.req.ip,
        });
        return dist;
      }),

     reassign: protectedProcedure
      .input(z.object({
        distributionId: z.number(),
        newTechnicianId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const dist = await getDistributionById(input.distributionId);
        if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distribution not found" });
        const oldTech = await getUserById(dist.assignedTechnicianId);
        const newTech = await getUserById(input.newTechnicianId);
        await reassignDistribution(input.distributionId, input.newTechnicianId, input.notes);
        await updateSampleStatus(dist.sampleId, "distributed");
        await addSampleHistory({
          sampleId: dist.sampleId,
          userId: ctx.user.id,
          action: "Distribution reassigned",
          fromStatus: "distributed",
          toStatus: "distributed",
          notes: `أعيد التوزيع من ${oldTech?.name ?? ""} إلى ${newTech?.name ?? ""}${input.notes ? " — " + input.notes : ""}`,
        });
        if (newTech) {
          await createNotification({
            userId: newTech.id,
            sampleId: dist.sampleId,
            title: `تكليف جديد — New Test Assignment`,
            message: `تم تكليفك بفحص العينة (${dist.distributionCode}) | You have been assigned to test order ${dist.distributionCode}`,
            type: "action_required",
          });
        }
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "distribution_reassigned",
          entity: "sample",
          entityId: dist.sampleId,
          entityLabel: `${dist.distributionCode} → ${newTech?.name ?? ""}`,
          newValue: { newTechnicianId: input.newTechnicianId },
          ipAddress: ctx.req.ip,
        });
        return { success: true };
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const dist = await getDistributionById(input.id);
        if (!dist) throw new TRPCError({ code: "NOT_FOUND" });
        const orderId = await getOrderIdForDistribution(input.id);
        let testSubType = dist.testSubType;
        if (!testSubType && orderId) {
          const items = await getLabOrderItems(orderId);
          const item = items.find(
            (i) => Number(i.distributionId) === input.id || i.testTypeCode === dist.testType,
          );
          if (item?.testSubType) testSubType = item.testSubType;
        }
        const sample = await getSampleById(dist.sampleId);
        let originalSampleCode: string | null = null;
        if (sample?.originalSampleId) {
          const orig = await getSampleById(sample.originalSampleId);
          originalSampleCode = orig?.sampleCode ?? null;
        }
        return {
          ...dist,
          testSubType: testSubType ?? null,
          orderId: orderId ?? undefined,
          retestNumber: sample?.retestNumber ?? null,
          originalSampleId: sample?.originalSampleId ?? null,
          originalSampleCode,
          retestReason: sample?.retestReason ?? null,
        };
      }),

    getBatchSiblings: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          orderId: z.number().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { sampleId, orderId } = input;

        if (!orderId) {
          return [];
        }

        // Same sample + lab order (distributions linked via lab_order_items.distributionId)
        return getBatchSiblingDistributions(sampleId, orderId);
      }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician"]);
        await markDistributionTaskRead(input.id);
        return { success: true };
      }),
    getByBatch: protectedProcedure
      .input(z.object({ batchDistributionId: z.string() }))
      .query(async ({ input }) => {
        return getDistributionsByBatch(input.batchDistributionId);
      }),
    createBatch: protectedProcedure
      .input(
        z.object({
          batchId: z.string(), // sample batchId
          assignedTechnicianId: z.number(),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          expectedCompletionDate: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        // Get all samples in the batch
        const batchSamples = await getSamplesByBatch(input.batchId);
        if (!batchSamples.length) throw new TRPCError({ code: "NOT_FOUND", message: "No samples found in batch" });
        // Generate a shared batchDistributionId
        const batchDistributionId = `BDIST-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const technician = await getUserById(input.assignedTechnicianId);
        // Load all test types for auto-mapping
        const allTestTypes = await getAllTestTypes();
        const createdDists = [];
        for (const sample of batchSamples) {
          // Use the test type registered at reception for each sample
          const sampleTestType = sample.requestedTestTypeId
            ? allTestTypes.find(tt => tt.id === sample.requestedTestTypeId)
            : undefined;
          const testTypeCode = sampleTestType?.code ?? sample.testSubType ?? "CONC_BLOCK";
          const testName = sampleTestType?.nameEn ?? sample.testTypeName ?? "Block Test";
          const distributionCode = await generateDistributionCode();
          const dist = await createDistribution({
            distributionCode,
            sampleId: sample.id,
            assignedTechnicianId: input.assignedTechnicianId,
            assignedById: ctx.user.id,
            testType: testTypeCode,
            testName: testName,
            priority: input.priority,
            expectedCompletionDate: input.expectedCompletionDate ? new Date(input.expectedCompletionDate) : undefined,
            notes: input.notes,
            status: "pending",
            quantity: sample.quantity ?? 1,
            unitPrice: "0",
            totalCost: "0",
            batchDistributionId,
            testSubType: sample.testSubType ?? undefined,
          });
          await updateSampleStatus(sample.id, "distributed");
          await addSampleHistory({
            sampleId: sample.id,
            userId: ctx.user.id,
            action: "Sample distributed (batch)",
            fromStatus: "received",
            toStatus: "distributed",
            notes: `Batch distribution order ${distributionCode} created (batch: ${batchDistributionId})`,
          });
          if (dist) createdDists.push(dist);
        }
        // Send one notification to technician
        if (technician && createdDists.length > 0) {
          await createNotification({
            userId: technician.id,
            sampleId: batchSamples[0].id,
            title: `تكليف دفعي جديد — New Batch Assignment`,
            message: `تم تكليفك بفحص دفعة تحتوي ${batchSamples.length} عينات — رقم الدفعة: ${batchDistributionId} | Batch of ${batchSamples.length} samples assigned to you. Batch ID: ${batchDistributionId}`,
            type: "action_required",
          });
        }
        return { batchDistributionId, count: createdDists.length, distributions: createdDists };
      }),
  }),

  // ─── Test Results ────────────────────────────────────────────────────────────
  testResults: router({
    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getTestResultBySample(input.sampleId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const result = await getTestResultById(input.id);
        if (!result) throw new TRPCError({ code: "NOT_FOUND" });
        return result;
      }),
    getByDistribution: protectedProcedure
      .input(z.object({ distributionId: z.number() }))
      .query(async ({ input }) => {
        return getTestResultByDistribution(input.distributionId);
      }),

    submit: protectedProcedure
      .input(
        z.object({
          distributionId: z.number(),
          sampleId: z.number(),
          rawValues: z.array(z.number()).min(1),
          unit: z.string().default("MPa"),
          testNotes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician"]);

        const dist = await getDistributionById(input.distributionId);
        if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distribution not found" });

        // Auto-process
        const stats = calculateStats(
          input.rawValues,
          dist.minAcceptable ? parseFloat(dist.minAcceptable) : null,
          dist.maxAcceptable ? parseFloat(dist.maxAcceptable) : null
        );

        const chartsData = {
          labels: input.rawValues.map((_, i) => `Reading ${i + 1}`),
          values: input.rawValues,
          average: stats?.average,
          min: dist.minAcceptable ? parseFloat(dist.minAcceptable) : null,
          max: dist.maxAcceptable ? parseFloat(dist.maxAcceptable) : null,
          complianceStatus: stats?.complianceStatus,
          passingCount: stats?.passingCount,
          totalCount: stats?.totalCount,
        };

        const result = await createTestResult({
          distributionId: input.distributionId,
          sampleId: input.sampleId,
          technicianId: ctx.user.id,
          rawValues: input.rawValues,
          unit: input.unit,
          testNotes: input.testNotes,
          average: stats?.average?.toString(),
          stdDeviation: stats?.stdDeviation?.toString(),
          percentage: stats?.percentage?.toString(),
          minValue: stats?.minValue?.toString(),
          maxValue: stats?.maxValue?.toString(),
          complianceStatus: stats?.complianceStatus,
          chartsData,
          status: "processed",
          processedAt: new Date(),
        });

        await updateDistributionStatus(input.distributionId, "completed");
        const nextSampleStatus = await checkAndUpdateSampleStatusAfterSubmission(input.sampleId);
        await addSampleHistory({
          sampleId: input.sampleId,
          userId: ctx.user.id,
          action: "Test results submitted and processed",
          fromStatus: "distributed",
          toStatus: nextSampleStatus ?? "processed",
          notes: `Average: ${stats?.average} ${input.unit}, Compliance: ${stats?.complianceStatus}`,
        });
        const reviewSample = await getSampleById(input.sampleId);
        await notifyUsersByRole(
          "lab_manager",
          `نتائج جاهزة للمراجعة — Results Ready for Review`,
          `تم رفع نتائج اختبار العينة ${reviewSample?.sampleCode} وتنتظر مراجعتك | Test results for sample ${reviewSample?.sampleCode} are ready for your review.`,
          input.sampleId,
          "action_required"
        );
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? "Unknown",
          action: "results_submitted",
          entity: "sample",
          entityId: input.sampleId,
          entityLabel: `${reviewSample?.sampleCode ?? ""} — ${stats?.complianceStatus === "pass" ? "✅ ناجح" : "❌ راسب"}`,
          newValue: { average: stats?.average, complianceStatus: stats?.complianceStatus },
          ipAddress: ctx.req.ip,
        });
        return result;
      }),
  }),

  // ─── Reviews ────────────────────────────────────────────────────────────────
  reviews: router({
    markManagerRead: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        await markSampleManagerRead(input.sampleId);
        return { success: true };
      }),
    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getReviewsBySample(input.sampleId);
      }),

    managerReview: protectedProcedure
      .input(
        z.object({
          testResultId: z.number().optional(), // legacy testResults
          specializedTestResultId: z.number().optional(), // new specializedTestResults
          sampleId: z.number(),
          decision: z.enum(["approved", "needs_revision", "rejected"]),
          comments: z.string().optional(),
          signature: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        // Enforce mandatory notes on reject/revision
        if ((input.decision === "rejected" || input.decision === "needs_revision") && !input.comments?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إدخال ملاحظات عند الرفض أو طلب المراجعة | Notes are required when rejecting or requesting revision" });
        }
        const review = await createReview({
          testResultId: input.testResultId ?? null,
          specializedTestResultId: input.specializedTestResultId ?? null,
          sampleId: input.sampleId,
          reviewerId: ctx.user.id,
          reviewType: "manager_review",
          decision: input.decision,
          comments: input.comments,
          signature: input.signature,
        });
        const sample = await getSampleById(input.sampleId);
        // Auto-sign: record reviewer name and timestamp
        const reviewerName = ctx.user.name || ctx.user.username || "";
        const reviewedAt = new Date();
        if (input.decision === "approved") {
          await updateSampleStatus(input.sampleId, "approved");
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              status: "approved",
              managerReviewedById: ctx.user.id,
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "approved",
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "Manager approved results",
            fromStatus: "processed",
            toStatus: "approved",
            notes: input.comments,
          });
          await notifyUsersByRole(
            "qc_inspector",
            "Sample Ready for Quality Control",
            `Sample ${sample?.sampleCode} has been approved by the manager and awaits QC review.`,
            input.sampleId,
            "action_required"
          );
        } else if (input.decision === "needs_revision") {
          await updateSampleStatus(input.sampleId, "revision_requested");
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              status: "revision_requested",
              managerReviewedById: ctx.user.id,
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "revision_requested",
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "Manager requested revision",
            fromStatus: "processed",
            toStatus: "revision_requested",
            notes: input.comments,
          });
          // Notify technician
          const dists = await getDistributionsBySample(input.sampleId);
          if (dists[0]) {
            await createNotification({
              userId: dists[0].assignedTechnicianId,
              sampleId: input.sampleId,
              title: `طلب مراجعة — Revision Requested`,
              message: `طلب المشرف مراجعة نتائج العينة ${sample?.sampleCode}. ملاحظات: ${input.comments ?? '—'} | Manager requested revision for sample ${sample?.sampleCode}. Notes: ${input.comments ?? '—'}`,
              type: "revision",
            });
          }
        } else {
          await updateSampleStatus(input.sampleId, "rejected");
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              status: "rejected",
              managerReviewedById: ctx.user.id,
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "rejected",
              managerReviewedByName: reviewerName,
              managerReviewedAt: reviewedAt,
              managerNotes: input.comments,
            });
          }
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "Manager rejected results",
            fromStatus: "processed",
            toStatus: "rejected",
            notes: input.comments,
          });
        }
        return review;
      }),
    qcReview: protectedProcedure
      .input(
        z.object({
          testResultId: z.number().optional(),
          specializedTestResultId: z.number().optional(),
          sampleId: z.number(),
          decision: z.enum(["approved", "needs_revision", "rejected"]),
          comments: z.string().optional(),
          signature: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        if (!input.testResultId && !input.specializedTestResultId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No test result found for QC review" });
        }
        // Enforce mandatory notes on reject/revision
        if ((input.decision === "rejected" || input.decision === "needs_revision") && !input.comments?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "يجب إدخال ملاحظات عند الرفض أو طلب المراجعة | Notes are required when rejecting or requesting revision" });
        }
        const review = await createReview({
          testResultId: input.testResultId ?? null,
          specializedTestResultId: input.specializedTestResultId ?? null,
          sampleId: input.sampleId,
          reviewerId: ctx.user.id,
          reviewType: "qc_review",
          decision: input.decision,
          comments: input.comments,
          signature: input.signature,
        });
        const sample = await getSampleById(input.sampleId);
        // Auto-sign: record reviewer name and timestamp
        const qcReviewerName = ctx.user.name || ctx.user.username || "";
        const qcReviewedAt = new Date();
        if (input.decision === "approved") {
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              qcReviewedById: ctx.user.id,
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "approved",
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          await updateSampleStatus(input.sampleId, "qc_passed");
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "QC approved results",
            fromStatus: "approved",
            toStatus: "qc_passed",
            notes: input.comments,
          });
          await notifyUsersByRole(
            "lab_manager",
            "Sample Passed QC - Ready for Clearance",
            `Sample ${sample?.sampleCode} has passed QC review and is ready for clearance certificate.`,
            input.sampleId,
            "action_required",
            "qc_passed"
          );
          // Notify sector: test result issued
          if (sample?.sector) {
            try {
              const sectorId = await getSectorIdByKey(sample.sector);
              if (sectorId) {
                await notifySector(
                  sectorId,
                  `صدرت نتيجة اختبار العينة ${sample.sampleCode}`,
                  `تم اعتماد نتائج اختبار العينة ${sample.sampleCode} — يمكن الاطلاع عليها`,
                  input.sampleId,
                  "result_issued"
                );
              }
            } catch (_e) { /* non-critical */ }
          }
        } else if (input.decision === "needs_revision") {
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              qcReviewedById: ctx.user.id,
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "revision_requested",
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          await updateSampleStatus(input.sampleId, "revision_requested");
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "QC requested revision",
            fromStatus: "approved",
            toStatus: "revision_requested",
            notes: input.comments,
          });
          const dists = await getDistributionsBySample(input.sampleId);
          if (dists[0]) {
            await createNotification({
              userId: dists[0].assignedTechnicianId,
              sampleId: input.sampleId,
              title: "QC Revision Requested",
              message: `QC Inspector has requested revision for sample ${sample?.sampleCode}. Notes: ${input.comments}`,
              type: "revision",
            });
          }
        } else {
          if (input.testResultId) {
            await updateTestResult(input.testResultId, {
              qcReviewedById: ctx.user.id,
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          if (input.specializedTestResultId) {
            await updateSpecializedTestResult(input.specializedTestResultId, {
              status: "rejected",
              qcReviewedByName: qcReviewerName,
              qcReviewedAt: qcReviewedAt,
              qcNotes: input.comments,
            });
          }
          await updateSampleStatus(input.sampleId, "qc_failed");
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "QC rejected results",
            fromStatus: "approved",
            toStatus: "qc_failed",
            notes: input.comments,
          });
        }
        return review;
      }),
  }),

  // ─── Attachments ────────────────────────────────────────────────────────────
  attachments: router({
    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getAttachmentsBySample(input.sampleId);
      }),

    upload: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          distributionId: z.number().optional(),
          fileName: z.string(),
          fileData: z.string(), // base64
          mimeType: z.string(),
          fileSize: z.number().optional(),
          attachmentType: z.enum([
            "photo",
            "document",
            "contractor_letter",
            "sector_letter",
            "payment_order",
            "payment_receipt",
            "test_report",
            "other",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileData, "base64");
        const fileKey = `lab-attachments/${input.sampleId}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const attachment = await createAttachment({
          sampleId: input.sampleId,
          distributionId: input.distributionId,
          uploadedById: ctx.user.id,
          fileName: input.fileName,
          fileKey,
          fileUrl: url,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          attachmentType: input.attachmentType,
        });
        return attachment;
      }),
  }),

  // ─── Certificates ────────────────────────────────────────────────────────────
  certificates: router({
    list: protectedProcedure.query(async () => {
      return getAllCertificates();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const cert = await getCertificateById(input.id);
        if (!cert) throw new TRPCError({ code: "NOT_FOUND" });
        return cert;
      }),

    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getCertificateBySample(input.sampleId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const sample = await getSampleById(input.sampleId);
        if (!sample) throw new TRPCError({ code: "NOT_FOUND" });
        if (sample.status !== "qc_passed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sample must pass QC before issuing clearance certificate",
          });
        }
        const certCode = await generateCertificateCode();
        const dists = await getDistributionsBySample(input.sampleId);
        const results = await getTestResultBySample(input.sampleId);
        const testsCompleted = dists.map((d, i) => ({
          testName: d.testName,
          distributionCode: d.distributionCode,
          result: results[i]?.average,
          unit: d.unit,
          compliance: results[i]?.complianceStatus,
        }));
        const cert = await createCertificate({
          certificateCode: certCode,
          sampleId: input.sampleId,
          issuedById: ctx.user.id,
          projectNumber: sample.contractNumber ?? "",
          projectName: sample.contractName ?? undefined,
          contractorName: sample.contractorName ?? "",
          testsCompleted,
          finalResults: { overallCompliance: "pass" },
          notes: input.notes,
        });
        await updateSampleStatus(input.sampleId, "clearance_issued");
        await addSampleHistory({
          sampleId: input.sampleId,
          userId: ctx.user.id,
          action: "Clearance certificate issued",
          fromStatus: "qc_passed",
          toStatus: "clearance_issued",
          notes: `Certificate: ${certCode}`,
        });
        return cert;
      }),

    updatePdf: protectedProcedure
      .input(z.object({ id: z.number(), pdfUrl: z.string(), pdfKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        await updateCertificate(input.id, { pdfUrl: input.pdfUrl, pdfKey: input.pdfKey });
        return { success: true };
      }),
  }),
  // ─── Concrete Cube Tests ───────────────────────────────────────────────────────────────────────
  concrete: router({
    // Get all test groups for a distribution order
    groupsByDistribution: protectedProcedure
      .input(z.object({ distributionId: z.number() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager", "qc_inspector"]);
        const groups = await getConcreteGroupsByDistribution(input.distributionId);
        const result = await Promise.all(groups.map(async (g) => ({
          ...g,
          cubes: await getCubesByGroup(g.id),
        })));
        return result;
      }),

    /** Create age groups + cube rows from reception plan (idempotent). */
    ensureReceptionGroups: protectedProcedure
      .input(z.object({ distributionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        return ensureConcreteGroupsFromReceptionPlan(
          input.distributionId,
          ctx.user.id,
          ctx.user.name ?? ctx.user.username,
        );
      }),

    // Get all test groups for a sample (for report/review)
    groupsBySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager", "qc_inspector"]);
        const groups = await getConcreteGroupsBySample(input.sampleId);
        const result = await Promise.all(groups.map(async (g) => ({
          ...g,
          cubes: await getCubesByGroup(g.id),
        })));
        return result;
      }),

    // Create a new test group (age group)
    createGroup: protectedProcedure
      .input(z.object({
        distributionId: z.number(),
        sampleId: z.number(),
        testAge: z.number(),
        // optional header overrides
        sourceSupplier: z.string().optional(),
        batchDateTime: z.string().optional(),
        slump: z.string().optional(),
        classOfConcrete: z.string().optional(),
        maxAggSize: z.string().optional(),
        region: z.string().optional(),
        consultant: z.string().optional(),
        cscRef: z.string().optional(),
        placeOfSampling: z.string().optional(),
        location: z.string().optional(),
        minAcceptable: z.string().optional(),
        maxAcceptable: z.string().optional(),
        nominalCubeSize: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        // Get sample info to auto-fill header
        const sample = await getSampleById(input.sampleId);
        if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "Sample not found" });
        const dist = await getDistributionById(input.distributionId);
        const cast = sample.castingDate ? new Date(sample.castingDate) : null;
        const castYmd = cast && !isNaN(cast.getTime()) ? cast.toISOString().split("T")[0] : undefined;
        const group = await createConcreteGroup({
          distributionId: input.distributionId,
          sampleId: input.sampleId,
          technicianId: ctx.user.id,
          testAge: input.testAge,
          contractNo: sample.contractNumber ?? undefined,
          projectName: sample.contractName ?? undefined,
          contractorName: sample.contractorName ?? undefined,
          testedBy: ctx.user.name ?? undefined,
          minAcceptable: input.minAcceptable ?? dist?.minAcceptable ?? undefined,
          maxAcceptable: input.maxAcceptable ?? dist?.maxAcceptable ?? undefined,
          sourceSupplier: input.sourceSupplier,
          batchDateTime: input.batchDateTime ?? castYmd,
          dateSampled: cast ?? undefined,
          slump: input.slump,
          classOfConcrete: input.classOfConcrete,
          maxAggSize: input.maxAggSize,
          region: input.region,
          consultant: input.consultant,
          cscRef: input.cscRef,
          placeOfSampling: input.placeOfSampling,
          location: input.location,
          nominalCubeSize: input.nominalCubeSize ?? sample.nominalCubeSize ?? "150mm",
        });
        return group;
      }),
    // Save/update a single cube roww
    saveCube: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        groupId: z.number(),
        markNo: z.number(),
        cubeId: z.string().optional(),
        dateTested: z.string().optional(),
        length: z.string().optional().default("150"),
        width: z.string().optional().default("150"),
        height: z.string().optional().default("150"),
        massKg: z.string().optional(),
        maxLoadKN: z.string(), // required — main input
        fractureType: z.string().optional(),
        withinSpec: z.boolean().nullable().optional(), // technician manual override
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        const L = parseFloat(input.length ?? "150");
        const W = parseFloat(input.width ?? "150");
        const H = parseFloat(input.height ?? "150");
        const mass = input.massKg ? parseFloat(input.massKg) : null;
        const load = parseFloat(input.maxLoadKN);

        // Auto-calculate:
        // Density (kg/m3) = mass(kg) / volume(m3) = mass / (L*W*H / 1e9)
        const volumeM3 = (L * W * H) / 1e9;
        const densityRaw = mass && volumeM3 > 0 ? mass / volumeM3 : null;
        // Round density to nearest 10 kg/m³ (BS 1881 Part 114)
        const density = densityRaw !== null ? Math.round(densityRaw / 10) * 10 : null;
        // Compressive Strength (N/mm2 = MPa) = Load(kN)*1000 / (L*W mm2)
        const area = L * W; // mm2
        const strengthRaw = area > 0 ? (load * 1000) / area : 0;
        // Round strength to nearest 0.5 N/mm² (BS 1881 Part 116)
        const strength = Math.round(strengthRaw * 2) / 2;

        const cube = await upsertConcreteCube({
          id: input.id,
          groupId: input.groupId,
          markNo: input.markNo,
          cubeId: input.cubeId,
          dateTested: input.dateTested ? new Date(input.dateTested) : new Date(),
          length: input.length ?? "150",
          width: input.width ?? "150",
          height: input.height ?? "150",
          massKg: input.massKg ?? undefined,
          maxLoadKN: input.maxLoadKN,
          fractureType: input.fractureType,
          withinSpec: input.withinSpec ?? undefined,
          densityKgM3: density !== null ? density.toString() : undefined,
          compressiveStrengthMpa: strength.toFixed(1),
        });

        // Recalculate group average after saving
        const allCubes = await getCubesByGroup(input.groupId);
        const strengths = allCubes
          .map(c => parseFloat(c.compressiveStrengthMpa ?? "0"))
          .filter(v => v > 0);
        if (strengths.length > 0) {
          const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
          const group = await getConcreteGroupById(input.groupId);
          const minAcc = group?.minAcceptable ? parseFloat(group.minAcceptable) : null;
          const maxAcc = group?.maxAcceptable ? parseFloat(group.maxAcceptable) : null;
          let compliance: "pass" | "fail" | "partial" = evaluateConcreteCubeCompliance(
            strengths,
            minAcc,
            group?.testAge ?? 28,
          );
          if (maxAcc !== null && avg > maxAcc) compliance = "fail";
          await updateConcreteGroupSummary(input.groupId, {
            // Round avg strength to nearest 0.5 N/mm² (BS 1881 Part 116)
            avgCompressiveStrength: (Math.round(avg * 2) / 2).toFixed(1),
            complianceStatus: compliance,
          });
        }

        return cube;
      }),

    // Delete a cube row
    deleteCube: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        await deleteConcreteCube(input.id);
        return { success: true };
      }),

    // Update group header/metadata
    updateGroup: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        comments: z.string().optional(),
        testedBy: z.string().optional(),
        sourceSupplier: z.string().optional(),
        batchDateTime: z.string().optional(),
        slump: z.string().optional(),
        classOfConcrete: z.string().optional(),
        maxAggSize: z.string().optional(),
        region: z.string().optional(),
        consultant: z.string().optional(),
        cscRef: z.string().optional(),
        placeOfSampling: z.string().optional(),
        location: z.string().optional(),
        minAcceptable: z.string().optional(),
        maxAcceptable: z.string().optional(),
        dateSampled: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        const { groupId, dateSampled, ...rest } = input;
        await updateConcreteGroupSummary(groupId, {
          ...rest,
          ...(dateSampled ? { dateSampled: new Date(dateSampled) } : {}),
        });
        return { success: true };
      }),

    // Submit group for manager review
    submitGroup: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        const group = await getConcreteGroupById(input.groupId);
        if (!group) throw new TRPCError({ code: "NOT_FOUND" });
        const requiredHeaderFields: Array<{ key: keyof typeof group; label: string }> = [
          { key: "sourceSupplier", label: "Concrete Source/Supplier" },
          { key: "classOfConcrete", label: "Class of Concrete" },
          { key: "maxAggSize", label: "Maximum Aggregate Size (mm)" },
          { key: "slump", label: "Slump (mm)" },
          { key: "placeOfSampling", label: "Place of Sampling" },
        ];
        const distForPlan = await getDistributionById(group.distributionId);
        const isConcCubeOrder = distForPlan?.testType === "CONC_CUBE";
        if (!isConcCubeOrder) {
          const missing = requiredHeaderFields
            .filter((f) => !String(group[f.key] ?? "").trim())
            .map((f) => f.label);
          if (missing.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Missing required fields: ${missing.join(", ")}`,
            });
          }
        }
        const cubes = await getCubesByGroup(input.groupId);
        if (isConcCubeOrder) {
          const fc = group.minAcceptable ? parseFloat(String(group.minAcceptable)) : NaN;
          if (!Number.isFinite(fc) || fc <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Design strength (f'c) is required before submit",
            });
          }
          const sampleForAge = await getSampleById(group.sampleId);
          const castingRef = sampleForAge?.castingDate ?? group.batchDateTime ?? group.dateSampled;
          const testRef = cubes.find(c => c.dateTested)?.dateTested ?? new Date();
          if (castingRef) {
            const actualAge = calcActualAgeDays(castingRef, testRef);
            if (actualAge != null) {
              const ageFactor = resolveBs1881AgeFactor(actualAge, fc);
              if (ageFactor.status === "invalid") {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: ageFactor.message ?? "Too early — result invalid",
                });
              }
            }
          }
        }
        await updateConcreteGroupSummary(input.groupId, {
          status: "submitted",
          submittedAt: new Date(),
          testedBy: ctx.user.name ?? ctx.user.username ?? group.testedBy ?? undefined,
        });

        const submittedGroup = (await getConcreteGroupById(input.groupId))!;
        const rawValues = cubes
          .map((c) => parseFloat(c.compressiveStrengthMpa ?? "0"))
          .filter((v) => v > 0);
        if (rawValues.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No cube strength readings to submit",
          });
        }

        const dist = await getDistributionById(submittedGroup.distributionId);
        const minAcc =
          dist?.minAcceptable != null && dist.minAcceptable !== ""
            ? parseFloat(String(dist.minAcceptable))
            : submittedGroup.minAcceptable != null && submittedGroup.minAcceptable !== ""
              ? parseFloat(String(submittedGroup.minAcceptable))
              : null;
        const maxAcc =
          dist?.maxAcceptable != null && dist.maxAcceptable !== ""
            ? parseFloat(String(dist.maxAcceptable))
            : submittedGroup.maxAcceptable != null && submittedGroup.maxAcceptable !== ""
              ? parseFloat(String(submittedGroup.maxAcceptable))
              : null;

        const stats = calculateStats(rawValues, minAcc, maxAcc);
        if (!stats) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not calculate test statistics" });
        }

        const chartsData = {
          labels: rawValues.map((_, i) => `Cube ${i + 1}`),
          values: rawValues,
          average: stats.average,
          min: minAcc,
          max: maxAcc,
          complianceStatus: stats.complianceStatus,
          passingCount: stats.passingCount,
          totalCount: stats.totalCount,
          testAge: submittedGroup.testAge,
          concreteGroupId: submittedGroup.id,
          source: "concrete_cubes",
        };

        await updateDistributionStatus(submittedGroup.distributionId, "completed");
        const nextSampleStatus = await checkAndUpdateSampleStatusAfterSubmission(submittedGroup.sampleId);

        await addSampleHistory({
          sampleId: submittedGroup.sampleId,
          userId: ctx.user.id,
          action: "Concrete test results submitted",
          fromStatus: "distributed",
          toStatus: nextSampleStatus ?? "processed",
          notes: `${submittedGroup.testAge}-day concrete cube test submitted for review`,
        });

        // Bridge into test_results (schema has no testType/testValue; mirror testResults.submit)
        await createTestResult({
          distributionId: submittedGroup.distributionId,
          sampleId: submittedGroup.sampleId,
          technicianId: ctx.user.id,
          rawValues,
          unit: "MPa",
          testNotes: `Concrete ${submittedGroup.testAge}-day compressive strength — ${cubes.length} cube(s). Avg ${submittedGroup.avgCompressiveStrength ?? stats.average} MPa.`,
          average: stats.average.toString(),
          stdDeviation: stats.stdDeviation.toString(),
          ...(stats.percentage != null ? { percentage: stats.percentage.toString() } : {}),
          minValue: stats.minValue.toString(),
          maxValue: stats.maxValue.toString(),
          complianceStatus: stats.complianceStatus,
          chartsData,
          status: "processed",
          processedAt: new Date(),
        });

        // Notify sample managers
        await notifyUsersByRole(
          "lab_manager",
          "New Concrete Test Results Ready",
          `Concrete cube results for ${submittedGroup.testAge}-day test are ready for review (Sample: ${submittedGroup.contractorName})`,
          submittedGroup.sampleId,
          "action_required"
        );
        return { success: true };
      }),
  }),

  // ─── Test Types Catalog ─────────────────────────────────────────────────────
  testTypes: router({
    list: protectedProcedure.query(async () => {
      return getAllTestTypes();
    }),
    listByCategory: protectedProcedure
      .input(z.object({ category: z.enum(["concrete", "soil", "steel", "asphalt", "aggregates"]) }))
      .query(async ({ input }) => {
        return getTestTypesByCategory(input.category);
      }),
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["concrete", "soil", "steel", "asphalt", "aggregates"]),
        nameEn: z.string().min(1),
        nameAr: z.string().optional(),
        code: z.string().optional(),
        unitPrice: z.number().min(0),
        unit: z.string().optional(),
        standardRef: z.string().optional(),
        formTemplate: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await createTestType({
          ...input,
          unitPrice: String(input.unitPrice),
          isActive: true,
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        unitPrice: z.number().optional(),
        unit: z.string().optional(),
        standardRef: z.string().optional(),
        formTemplate: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        const { id, unitPrice, ...rest } = input;
        await updateTestType(id, {
          ...rest,
          ...(unitPrice !== undefined ? { unitPrice: String(unitPrice) } : {}),
        });
        return { success: true };
      }),
    /** Admin-only: update unit price only (test catalog is code-managed). */
    updatePrice: protectedProcedure
      .input(z.object({ testTypeId: z.number(), newPrice: z.number().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await updateTestType(input.testTypeId, { unitPrice: String(input.newPrice) });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await deleteTestType(input.id);
        return { success: true };
      }),
  }),

  // ─── Contractors ──────────────────────────────────────────────────────────────
  contractors: router({
    list: protectedProcedure.query(async () => {
      return getAllContractors();
    }),
    create: protectedProcedure
      .input(z.object({
        nameEn: z.string().min(1),
        nameAr: z.string().optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        contractorCode: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        await createContractor({ ...input, isActive: true });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nameEn: z.string().optional(),
        nameAr: z.string().optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        contractorCode: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        const { id, ...rest } = input;
        await updateContractor(id, rest);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await deleteContractor(input.id);
        return { success: true };
      }),
  }),

  // ─── Contracts ───────────────────────────────────────────────────────────────────────────────────────
  contracts: router({
    list: protectedProcedure.query(async () => {
      return getContractsWithContractor();
    }),
    listSimple: protectedProcedure.query(async () => {
      return getAllContracts();
    }),
    getByNumber: protectedProcedure
      .input(z.object({ contractNumber: z.string() }))
      .query(async ({ input }) => {
        return getContractByNumber(input.contractNumber);
      }),
    create: protectedProcedure
      .input(z.object({
        contractNumber: z.string().min(1),
        contractName: z.string().min(1),
        contractorId: z.number(),
        sectorKey: z.string().optional(),
        sectorNameAr: z.string().optional(),
        sectorNameEn: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        // Check uniqueness
        const existing = await getContractByNumber(input.contractNumber);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Contract number already exists" });
        // Resolve sector names if only key provided
        let sectorNameAr = input.sectorNameAr;
        let sectorNameEn = input.sectorNameEn;
        if (input.sectorKey && (!sectorNameAr || !sectorNameEn)) {
          const sectorData = await getSectorByKey(input.sectorKey);
          if (sectorData) {
            sectorNameAr = sectorNameAr || sectorData.nameAr;
            sectorNameEn = sectorNameEn || sectorData.nameEn;
          }
        }
        await createContract({
          contractNumber: input.contractNumber,
          contractName: input.contractName,
          contractorId: input.contractorId,
          sectorKey: input.sectorKey,
          sectorNameAr,
          sectorNameEn,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          notes: input.notes,
          isActive: true,
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        contractNumber: z.string().optional(),
        contractName: z.string().optional(),
        contractorId: z.number().optional(),
        sectorKey: z.string().optional(),
        sectorNameAr: z.string().optional(),
        sectorNameEn: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        const { id, startDate, endDate, ...rest } = input;
        // Resolve sector names if only key provided
        let sectorNameAr = rest.sectorNameAr;
        let sectorNameEn = rest.sectorNameEn;
        if (rest.sectorKey && (!sectorNameAr || !sectorNameEn)) {
          const sectorData = await getSectorByKey(rest.sectorKey);
          if (sectorData) {
            sectorNameAr = sectorNameAr || sectorData.nameAr;
            sectorNameEn = sectorNameEn || sectorData.nameEn;
          }
        }
        await updateContract(id, {
          ...rest,
          sectorNameAr,
          sectorNameEn,
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(endDate ? { endDate: new Date(endDate) } : {}),
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await deleteContract(input.id);
        return { success: true };
      }),
  }),

  // ─── Specialized Test Results ────────────────────────────────────────────────
  specializedTests: router({
    getByDistribution: protectedProcedure
      .input(z.object({ distributionId: z.number() }))
      .query(async ({ input }) => {
        return getSpecializedTestResultByDistribution(input.distributionId);
      }),
    getBySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ input }) => {
        return getSpecializedTestResultsBySample(input.sampleId);
      }),

    getBySampleAndTestType: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          testTypeCode: z.string().min(1),
          status: z.enum(["draft", "submitted", "approved", "rejected", "revision_requested"]).optional(),
        }),
      )
      .query(async ({ input }) => {
        return getSpecializedTestResultsBySampleAndTestType(input.sampleId, input.testTypeCode, {
          status: input.status,
        });
      }),

    getByBatch: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        // Get all samples in this batch
        const batchSamples = await getSamplesByBatch(input.batchId);
        // For each sample, get its specialized test results and distribution
        const results = await Promise.all(
          batchSamples.map(async (sample) => {
            const testResults = await getSpecializedTestResultsBySample(sample.id);
            return { sample, testResults };
          })
        );
        return results;
      }),
    save: protectedProcedure
      .input(z.object({
        distributionId: z.number(),
        sampleId: z.number(),
        testTypeCode: z.string(),
        formTemplate: z.string(),
        contractNo: z.string().optional(),
        projectName: z.string().optional(),
        contractorName: z.string().optional(),
        testedBy: z.string().optional(),
        testDate: z.string().optional(),
        formData: z.any(),
        overallResult: z.enum(["pass", "fail", "pending"]).default("pending"),
        summaryValues: z.any().optional(),
        notes: z.string().optional(),
        status: z.enum(["draft", "submitted"]).default("draft"),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "technician", "lab_manager"]);
        const existing = await getSpecializedTestResultByDistribution(input.distributionId);
        const actorDisplayName = ctx.user.name ?? ctx.user.username ?? undefined;
        if (existing) {
          const resolvedTestedBy =
            (input.status === "submitted" ? actorDisplayName : undefined) ??
            input.testedBy ??
            existing.testedBy ??
            undefined;
          await updateSpecializedTestResult(existing.id, {
            formData: input.formData,
            overallResult: input.overallResult,
            summaryValues: input.summaryValues,
            notes: input.notes,
            status: input.status,
            testedBy: resolvedTestedBy,
            testDate: input.testDate ? new Date(input.testDate) : undefined,
            ...(input.status === "submitted" ? { submittedAt: new Date() } : {}),
          });
          // Also update distribution/sample status when submitting an existing result
          if (input.status === "submitted") {
            await updateDistributionStatus(input.distributionId, "completed");
            const nextSampleStatus = await checkAndUpdateSampleStatusAfterSubmission(input.sampleId);
            await addSampleHistory({
              sampleId: input.sampleId,
              userId: ctx.user.id,
              action: "Specialized test results submitted",
              fromStatus: "distributed",
              toStatus: nextSampleStatus ?? "processed",
              notes: `Test: ${input.testTypeCode}, Result: ${input.overallResult}`,
            });
            await notifyUsersByRole(
              "lab_manager",
              "Test Results Ready for Review",
              `Results for ${input.testTypeCode} test are ready for review.`,
              input.sampleId,
              "action_required"
            );
            await createAuditLog({
              userId: ctx.user.id,
              userName: ctx.user.name ?? "Unknown",
              action: "results_submitted",
              entity: "sample",
              entityId: input.sampleId,
              entityLabel: `${input.testTypeCode} — ${input.overallResult === "pass" ? "✅ ناجح" : "❌ راسب"}`,
              newValue: { testTypeCode: input.testTypeCode, overallResult: input.overallResult },
              ipAddress: ctx.req.ip,
            });
          }
          return { id: existing.id, created: false };
        }
        const dist = await getDistributionById(input.distributionId);
        if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distribution not found" });
        const sample = await getSampleById(input.sampleId);
        const result = await createSpecializedTestResult({
          distributionId: input.distributionId,
          sampleId: input.sampleId,
          technicianId: ctx.user.id,
          testTypeCode: input.testTypeCode,
          formTemplate: input.formTemplate,
          contractNo: input.contractNo ?? sample?.contractNumber ?? undefined,
          projectName: input.projectName ?? sample?.contractName ?? undefined,
          contractorName: input.contractorName ?? sample?.contractorName ?? undefined,
          testedBy: (input.status === "submitted" ? actorDisplayName : undefined) ?? input.testedBy ?? undefined,
          testDate: input.testDate ? new Date(input.testDate) : new Date(),
          formData: input.formData,
          overallResult: input.overallResult,
          summaryValues: input.summaryValues,
          notes: input.notes,
          status: input.status,
          ...(input.status === "submitted" ? { submittedAt: new Date() } : {}),
        });
        if (input.status === "submitted") {
          await updateDistributionStatus(input.distributionId, "completed");
          const nextSampleStatus = await checkAndUpdateSampleStatusAfterSubmission(input.sampleId);
          await addSampleHistory({
            sampleId: input.sampleId,
            userId: ctx.user.id,
            action: "Specialized test results submitted",
            fromStatus: "distributed",
            toStatus: nextSampleStatus ?? "processed",
            notes: `Test: ${input.testTypeCode}, Result: ${input.overallResult}`,
          });
          await notifyUsersByRole(
            "lab_manager",
            "Test Results Ready for Review",
            `Results for ${input.testTypeCode} test are ready for review.`,
            input.sampleId,
            "action_required"
          );
        }
        return { id: (result as any).insertId, created: true };
      }),
  }),

  // ─── Clearance (براءة الذمة) ────────────────────────────────────────────────────────────────────────────
  clearance: router({
    list: protectedProcedure.query(async () => {
      return getAllClearanceRequests();
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getClearanceRequestById(input.id);
      }),
    getByContract: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .query(async ({ input }) => {
        return getClearanceRequestsByContract(input.contractId);
      }),
    listSectors: protectedProcedure.query(async () => {
      return getAllSectorAccounts();
    }),
    create: protectedProcedure
      .input(z.object({
        contractId: z.number(),
        contractorId: z.number(),
        contractNumber: z.string(),
        contractName: z.string().optional(),
        contractorName: z.string(),
        sectorId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const dbConn = await import("./db").then(m => m.getDb());
        const code = await import("./db").then(m => m.generateClearanceCode(dbConn));
        // Compute inventory from samples/distributions for this contract
        const allSamples = await getAllSamples();
        const contractSamples = allSamples.filter(s => s.contractId === input.contractId);
        // Get all distributions for these samples
        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;
        let pendingTests = 0;
        let totalAmount = 0;
        const inventoryItems: any[] = [];
        for (const sample of contractSamples) {
          const dists = await getDistributionsBySample(sample.id);
          for (const dist of dists) {
            totalTests++;
            // dist.testType is the code string, find matching test type by code
            const allTT = await getAllTestTypes();
            const testType = allTT.find(tt => tt.code === dist.testType) ?? null;
            // Check result
            const specResult = await getSpecializedTestResultByDistribution(dist.id);
            // Field Density bills per recorded point; other tests bill once.
            const units = billingUnitCount(testType, dist.testType, specResult);
            const price = (testType ? Number(testType.unitPrice) : 0) * units;
            totalAmount += price;
            const legacyResults = await getTestResultBySample(sample.id);
            const legacyResult = Array.isArray(legacyResults) ? legacyResults[0] : legacyResults;
            let result = "pending";
            if ((specResult as any)?.overallResult === "pass" || (legacyResult as any)?.overallResult === "pass") result = "pass";
            else if ((specResult as any)?.overallResult === "fail" || (legacyResult as any)?.overallResult === "fail") result = "fail";
            if (result === "pass") passedTests++;
            else if (result === "fail") failedTests++;
            else pendingTests++;
            inventoryItems.push({
              sampleCode: sample.sampleCode,
              testName: testType?.nameEn ?? dist.testType,
              testNameAr: testType?.nameAr ?? "",
              testCode: testType?.code ?? dist.testType,
              category: testType?.category ?? "concrete",
              standard: testType?.standardRef ?? "",
              units,
              unitPrice: testType ? Number(testType.unitPrice) : 0,
              price,
              result,
              distributionCode: dist.distributionCode,
            });
          }
        }
        const result = await createClearanceRequest({
          requestCode: code,
          contractId: input.contractId,
          contractorId: input.contractorId,
          contractNumber: input.contractNumber,
          contractName: input.contractName,
          contractorName: input.contractorName,
          requestedById: ctx.user.id,
          totalTests,
          passedTests,
          failedTests,
          pendingTests,
          totalAmount: totalAmount.toFixed(2),
          inventoryData: inventoryItems,
          status: "pending",
          sectorId: input.sectorId ?? null,
          notes: input.notes,
        });
        const clearanceId = (result as any).insertId;
        // Notify accountant: clearance started
        await notifyUsersByRole(
          "accountant",
          `بدأت إجراءات براءة الذمة للعقد ${input.contractNumber}`,
          `تم بدء إجراءات براءة الذمة للمقاول "${input.contractorName}" - عقد: ${input.contractNumber}`,
          undefined,
          "action_required",
          "clearance_started"
        );
        // Notify sectors of this contract: clearance started
        try {
          const contractSamplesList = await getAllSamples();
          const sectorKeys = Array.from(new Set(
            contractSamplesList
              .filter(s => s.contractId === input.contractId && s.sector)
              .map(s => s.sector)
          ));
          for (const sk of sectorKeys) {
            if (!sk) continue;
            const sectorId = await getSectorIdByKey(sk);
            if (sectorId) {
              await notifySector(
                sectorId,
                `بدأت إجراءات براءة الذمة للعقد ${input.contractNumber}`,
                `تم بدء إجراءات براءة الذمة للمقاول "${input.contractorName}" - عقد: ${input.contractNumber}`,
                undefined,
                "clearance_started"
              );
            }
          }
        } catch (_e) { /* non-critical */ }
        return { id: clearanceId, code };
      }),
    markQcRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "qc_inspector"]);
        await markClearanceQcRead(input.id);
        return { success: true };
      }),
    markAccountantRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "accountant"]);
        await markClearanceAccountantRead(input.id);
        return { success: true };
      }),
    qcReview: protectedProcedure
      .input(z.object({
        id: z.number(),
        approved: z.boolean(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "qc_inspector"]);
        if (!input.approved) {
          await updateClearanceRequest(input.id, {
            status: "rejected",
            qcReviewedById: ctx.user.id,
            qcReviewedAt: new Date(),
            qcNotes: input.notes,
          });
          return { success: true, status: "rejected" };
        }
        await updateClearanceRequest(input.id, {
          status: "inventory_ready",
          qcReviewedById: ctx.user.id,
          qcReviewedAt: new Date(),
          qcNotes: input.notes,
        });
        // Notify accountant: QC confirmed, can issue payment order
        try {
          const req = await getClearanceRequestById(input.id);
          if (req) {
            await notifyUsersByRole(
              "accountant",
              `تم تأكيد اختبارات براءة الذمة ${req.requestCode}`,
              `تم تأكيد جميع اختبارات براءة الذمة للمقاول "${req.contractorName}" - عقد: ${req.contractNumber} — يمكن إصدار أمر الدفع وبدء براءة الذمة`,
              undefined,
              "action_required",
              "clearance_qc_approved"
            );
          }
        } catch (_e) { /* non-critical */ }
        return { success: true, status: "inventory_ready" };
      }),
    issuePaymentOrder: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "accountant"]);
        // Auto-generate payment order number: PO-YYYY-NNNN
        const year = new Date().getFullYear();
        // Count existing POs this year to generate sequential number
        const allReqs = await getAllClearanceRequests();
        const existingPOs = allReqs.filter(r => r.paymentOrderNumber?.startsWith(`PO-${year}-`));
        const seq = String(existingPOs.length + 1).padStart(4, "0");
        const poNumber = `PO-${year}-${seq}`;
        await updateClearanceRequest(input.id, {
          paymentOrderNumber: poNumber,
          paymentOrderDate: new Date(),
          paymentOrderIssuedById: ctx.user.id,
          status: "payment_ordered",
        });
        return { success: true, paymentOrderNumber: poNumber };
      }),
    uploadDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        docType: z.enum(["contractorLetter", "sectorLetter", "paymentReceipt", "testList"]),
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const fieldMap: Record<string, string> = {
          contractorLetter: "contractorLetterUrl",
          sectorLetter: "sectorLetterUrl",
          paymentReceipt: "paymentReceiptUrl",
          testList: "testListUrl",
        };
        await updateClearanceRequest(input.id, { [fieldMap[input.docType]]: input.fileUrl });
        // Check if all docs uploaded → update status
        const req = await getClearanceRequestById(input.id);
        if (req && req.contractorLetterUrl && req.sectorLetterUrl && req.paymentReceiptUrl) {
          await updateClearanceRequest(input.id, { status: "docs_uploaded" });
        }
        return { success: true };
      }),
    issueCertificate: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "accountant"]);
        const req = await getClearanceRequestById(input.id);
        if (!req) throw new TRPCError({ code: "NOT_FOUND" });
        const certCode = `CERT-${req.requestCode}`;
        await updateClearanceRequest(input.id, {
          certificateCode: certCode,
          certificateIssuedAt: new Date(),
          status: "issued",
          notes: input.notes ?? req.notes,
        });
        // Notify sectors: clearance certificate issued
        try {
          // First try direct sectorId if stored on the request
          if (req.sectorId) {
            await notifySector(
              req.sectorId,
              `صدرت شهادة براءة الذمة للعقد ${req.contractNumber}`,
              `صدرت شهادة براءة الذمة للمقاول "${req.contractorName}" - عقد: ${req.contractNumber} (${certCode}) — يمكن مراجعتها في بوابة القطاع`,
              undefined,
              "clearance_issued"
            );
          } else {
            // Fallback: notify all sectors linked to this contract's samples
            const allSamplesForCert = await getAllSamples();
            const sectorKeys = Array.from(new Set(
              allSamplesForCert
                .filter(s => s.contractId === req.contractId && s.sector)
                .map(s => s.sector)
            ));
            for (const sk of sectorKeys) {
              if (!sk) continue;
              const sid = await getSectorIdByKey(sk);
              if (sid) {
                await notifySector(
                  sid,
                  `صدرت شهادة براءة الذمة للعقد ${req.contractNumber}`,
                  `صدرت شهادة براءة الذمة للمقاول "${req.contractorName}" - عقد: ${req.contractNumber} (${certCode}) — يمكن مراجعتها في بوابة القطاع`,
                  undefined,
                  "clearance_issued"
                );
              }
            }
          }
        } catch (_e) { /* non-critical */ }
        return { success: true, certCode };
      }),
    saveReceiptNumber: protectedProcedure
      .input(z.object({ id: z.number(), receiptNumber: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "accountant"]);
        await updateClearanceRequest(input.id, { paymentReceiptNumber: input.receiptNumber });
        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "inventory_ready", "payment_ordered", "docs_uploaded", "issued", "rejected"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "accountant"]);
        await updateClearanceRequest(input.id, { status: input.status, notes: input.notes });
        return { success: true };
      }),

    // Check for overdue payment orders (>3 days) and notify relevant users
    getArchive: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        sectorId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const all = await getAllClearanceRequests();
        let filtered = all.filter(r => r.status === "issued" || r.status === "rejected");
        if (input.search) {
          const q = input.search.toLowerCase();
          filtered = filtered.filter(r =>
            r.contractorName?.toLowerCase().includes(q) ||
            r.contractNumber?.toLowerCase().includes(q) ||
            r.requestCode?.toLowerCase().includes(q) ||
            r.certificateCode?.toLowerCase().includes(q)
          );
        }
        if (input.dateFrom) {
          const from = new Date(input.dateFrom);
          filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) >= from);
        }
        if (input.dateTo) {
          const to = new Date(input.dateTo + "T23:59:59");
          filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) <= to);
        }
        if (input.sectorId) {
          filtered = filtered.filter(r => r.sectorId === input.sectorId);
        }
        return filtered;
      }),
    checkPaymentDelays: protectedProcedure.mutation(async () => {
      const allRequests = await getAllClearanceRequests();
      const now = Date.now();
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      const overdue = allRequests.filter(r =>
        r.status === "payment_ordered" &&
        r.paymentOrderDate &&
        (now - new Date(r.paymentOrderDate).getTime()) > THREE_DAYS_MS
      );
      let notified = 0;
      for (const req of overdue) {
        const daysLate = Math.floor((now - new Date(req.paymentOrderDate!).getTime()) / (24 * 60 * 60 * 1000));
        const title = `تأخر في سداد أمر الدفع ${req.paymentOrderNumber}`;
        const message = `طلب براءة الذمة للمقاول "${req.contractorName}" - عقد: ${req.contractNumber} - مضى على إصدار أمر الدفع ${daysLate} يوماً دون استلام السداد. المبلغ: ${req.totalAmount} درهم`;
        // Notify QC inspectors
        await notifyUsersByRole("qc_inspector", title, message, undefined, "action_required");
        // Notify accountants
        await notifyUsersByRole("accountant", title, message, undefined, "action_required");
        // Also notify owner via system notification
        try {
          const { notifyOwner } = await import("./_core/notification");
          await notifyOwner({ title, content: message });
        } catch {}
        notified++;
      }
      return { checked: allRequests.length, overdueCount: overdue.length, notified };
    }),
  }),
  // ─── Analytics ─────────────────────────────────────────────────────────────────────────────────────────
  analytics: router({
    // Returns aggregated test statistics with optional filters
    testStats: protectedProcedure
      .input(z.object({
        dateFrom: z.string().optional(),   // ISO date string
        dateTo: z.string().optional(),
        contractId: z.number().optional(),
        contractorId: z.number().optional(),
        category: z.enum(["concrete", "soil", "steel", "asphalt", "aggregates"]).optional(),
        testTypeCode: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const allTT = await getAllTestTypes();
        const ttByCode = new Map(allTT.map((t) => [t.code ?? "", t]));
        const allContracts = await getAllContracts();
        const contractById = new Map(allContracts.map((c) => [c.id, c]));
        const allContractors = await getAllContractors();

        const dateFrom = input.dateFrom ? new Date(input.dateFrom) : null;
        const dateTo = input.dateTo ? new Date(input.dateTo + "T23:59:59") : null;

        const orderItems = await getActiveLabOrderItemsForAnalytics();
        const distIds = [
          ...new Set(
            orderItems
              .map((i) => i.distributionId)
              .filter((id): id is number => id != null)
          ),
        ];
        const specResults = await getSpecializedResultsByDistributionIds(distIds);
        const specByDist = new Map(
          specResults.map((r) => [r.distributionId, r])
        );

        const rows: {
          sampleCode: string;
          contractId: number | null;
          contractNumber: string | null;
          contractName: string | null;
          testCode: string;
          testNameEn: string;
          testNameAr: string;
          category: string;
          price: number;
          units: number;
          result: "pass" | "fail" | "pending";
          createdAt: Date;
        }[] = [];

        for (const item of orderItems) {
          if (input.contractId && item.contractId !== input.contractId) continue;

          if (input.contractorId) {
            const contract = item.contractId
              ? contractById.get(item.contractId)
              : null;
            if (!contract || contract.contractorId !== input.contractorId) continue;
          }

          const sampleDate = new Date(item.receivedAt ?? item.createdAt);
          if (dateFrom && sampleDate < dateFrom) continue;
          if (dateTo && sampleDate > dateTo) continue;

          const tt = ttByCode.get(item.testTypeCode) ?? null;
          const category = tt?.category ?? "concrete";
          if (input.category && category !== input.category) continue;
          if (input.testTypeCode && item.testTypeCode !== input.testTypeCode) continue;

          const units = Math.max(1, Number(item.quantity) || 1);
          const specResult = item.distributionId
            ? specByDist.get(item.distributionId)
            : null;
          let result: "pass" | "fail" | "pending" = "pending";
          if (specResult?.overallResult === "pass") result = "pass";
          else if (specResult?.overallResult === "fail") result = "fail";

          const contract = item.contractId ? contractById.get(item.contractId) : null;
          const billUnits = billingUnitCount(tt, item.testTypeCode, specResult) * units;
          const unitPrice = tt ? Number(tt.unitPrice) : Number(item.unitPrice) || 0;
          const price = unitPrice * billUnits;

          rows.push({
            sampleCode: item.sampleCode ?? "",
            contractId: item.contractId ?? null,
            contractNumber: contract?.contractNumber ?? item.contractNumber ?? null,
            contractName:
              (contract as { contractName?: string })?.contractName ??
              item.contractName ??
              contract?.contractNumber ??
              null,
            testCode: item.testTypeCode,
            testNameEn: tt?.nameEn ?? item.testTypeName,
            testNameAr: tt?.nameAr ?? "",
            category,
            price,
            units,
            result,
            createdAt: sampleDate,
          });
        }

        const total = rows.reduce((s, r) => s + r.units, 0);
        const passed = rows.reduce((s, r) => s + (r.result === "pass" ? r.units : 0), 0);
        const failed = rows.reduce((s, r) => s + (r.result === "fail" ? r.units : 0), 0);
        const pending = rows.reduce((s, r) => s + (r.result === "pending" ? r.units : 0), 0);
        const totalAmount = rows.reduce((s, r) => s + r.price, 0);

        const byCategory: Record<string, { count: number; amount: number; passed: number; failed: number; pending: number }> = {};
        for (const r of rows) {
          if (!byCategory[r.category]) {
            byCategory[r.category] = { count: 0, amount: 0, passed: 0, failed: 0, pending: 0 };
          }
          byCategory[r.category].count += r.units;
          byCategory[r.category].amount += r.price;
          if (r.result === "pass") byCategory[r.category].passed += r.units;
          else if (r.result === "fail") byCategory[r.category].failed += r.units;
          else byCategory[r.category].pending += r.units;
        }

        const byTestType: Record<string, { code: string; nameEn: string; nameAr: string; category: string; count: number; amount: number; passed: number; failed: number; pending: number }> = {};
        for (const r of rows) {
          const key = r.testCode;
          if (!byTestType[key]) {
            byTestType[key] = {
              code: r.testCode,
              nameEn: r.testNameEn,
              nameAr: r.testNameAr,
              category: r.category,
              count: 0,
              amount: 0,
              passed: 0,
              failed: 0,
              pending: 0,
            };
          }
          byTestType[key].count += r.units;
          byTestType[key].amount += r.price;
          if (r.result === "pass") byTestType[key].passed += r.units;
          else if (r.result === "fail") byTestType[key].failed += r.units;
          else byTestType[key].pending += r.units;
        }

        const byMonth: Record<string, number> = {};
        for (const r of rows) {
          const m = r.createdAt.toISOString().slice(0, 7);
          byMonth[m] = (byMonth[m] ?? 0) + r.units;
        }

        const byContract: Record<string, { contractNumber: string; contractName: string; count: number; amount: number }> = {};
        for (const r of rows) {
          if (!r.contractId) continue;
          const key = String(r.contractId);
          if (!byContract[key]) {
            byContract[key] = {
              contractNumber: r.contractNumber ?? "",
              contractName: r.contractName ?? "",
              count: 0,
              amount: 0,
            };
          }
          byContract[key].count += r.units;
          byContract[key].amount += r.price;
        }

        return {
          summary: { total, passed, failed, pending, totalAmount },
          byCategory: Object.entries(byCategory).map(([cat, v]) => ({ category: cat, ...v })),
          byTestType: Object.values(byTestType).sort((a, b) => b.count - a.count),
          byMonth: Object.entries(byMonth)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, count]) => ({ month, count })),
          byContract: Object.values(byContract).sort((a, b) => b.count - a.count),
          contracts: allContracts.map((c) => ({
            id: c.id,
            contractNumber: c.contractNumber,
            name: (c as { contractName?: string }).contractName ?? c.contractNumber,
          })),
          contractors: allContractors.map((c) => ({
            id: c.id,
            name: c.nameEn ?? c.nameAr ?? String(c.id),
          })),
          testTypes: allTT.map((t) => ({
            code: t.code ?? "",
            nameEn: t.nameEn,
            nameAr: t.nameAr ?? "",
            category: t.category,
          })),
        };
      }),
  }),
  // ─── Sectors Management ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  sectors: router({
    list: protectedProcedure.query(async () => {
      return getAllSectors();
    }),
    create: protectedProcedure
      .input(z.object({
        sectorKey: z.string().min(2).max(64),
        nameAr: z.string().min(1),
        nameEn: z.string().min(1),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await createSector(input);
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nameAr: z.string().optional(),
        nameEn: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        const { id, ...rest } = input;
        await updateSector(id, rest);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin"]);
        await deleteSector(input.id);
        return { success: true };
      }),
  }),
  // ─── Sector Portal ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  sector: sectorRouter,

  // ─── Lab Orders (Multi-Test) ─────────────────────────────────────────────────
  orders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, ["admin", "reception", "lab_manager", "technician", "qc_inspector"]);
      const orders = await getAllLabOrders();
      // Attach items + sampleSubType + assignedTechnicianName to each order
      const allUsers = await getAllUsers();
      const result = await Promise.all(
        orders.map(async (o: any) => {
          const items = await getLabOrderItems(o.id);
          const mappedItems = items.map((item: any) => ({
            id: item.id,
            distributionId:
              item.distributionId != null ? Number(item.distributionId) : null,
            testName: item.testTypeName,
            testTypeCode: item.testTypeCode,
            status: item.status,
            quantity: item.quantity,
            testSubType: item.testSubType,
          }));
          const testCount = mappedItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);
          const testNames = mappedItems.map((item: any) => {
            const name = item.testName || item.testTypeCode || "—";
            const qty = Number(item.quantity) || 1;
            return qty > 1 ? `${name} ×${qty}` : name;
          });
          // Get sampleSubType from the linked sample
          let sampleSubType: string | null = null;
          let sampleCode: string | null = null;
          let sampleStatus: string | null = o.sampleStatus ?? null;
          let retestNumber: number | null = null;
          let originalSampleId: number | null = null;
          let originalSampleCode: string | null = null;
          let retestReason: string | null = null;
          if (o.sampleId) {
            const sample = await getSampleById(o.sampleId);
            sampleSubType = sample?.sampleSubType ?? null;
            sampleCode = sample?.sampleCode ?? null;
            sampleStatus = sample?.status ?? sampleStatus;
            retestNumber = sample?.retestNumber ?? null;
            originalSampleId = sample?.originalSampleId ?? null;
            retestReason = sample?.retestReason ?? null;
            if (originalSampleId) {
              const orig = await getSampleById(originalSampleId);
              originalSampleCode = orig?.sampleCode ?? null;
            }
          }
          const tech = allUsers.find((u: any) => u.id === o.assignedTechnicianId);
          return {
            ...o,
            castingDate: o.castingDate ? new Date(o.castingDate).toISOString() : null,
            distributedAt: o.distributedAt ? new Date(o.distributedAt).toISOString() : null,
            completedAt: o.completedAt ? new Date(o.completedAt).toISOString() : null,
            createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
            updatedAt: o.updatedAt ? new Date(o.updatedAt).toISOString() : null,
            items: mappedItems,
            testCount,
            testNames,
            sampleSubType,
            sampleCode,
            sampleStatus,
            retestNumber,
            originalSampleId,
            originalSampleCode,
            retestReason,
            assignedTechnicianName: tech?.name ?? null,
          };
        })
      );
      return result;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const order = await getLabOrderById(input.id);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        const items = await getLabOrderItems(input.id);
        return { ...order, items };
      }),

    byStatus: protectedProcedure
      .input(z.object({ status: z.enum(["pending", "distributed", "in_progress", "completed", "reviewed", "qc_passed", "rejected"]) }))
      .query(async ({ ctx, input }) => {
        return getLabOrdersByStatus(input.status);
      }),

    myOrders: protectedProcedure.query(async ({ ctx }) => {
      requireRole(ctx.user.role, ["admin", "lab_manager", "technician", "qc_inspector", "reception"]);
      const orders = await getLabOrdersByTechnician(ctx.user.id);
      // Attach items to each order
      const result = await Promise.all(
        orders.map(async (o: any) => {
          const items = await getLabOrderItems(o.id);
          return { ...o, items };
        })
      );
      return result;
    }),

    create: protectedProcedure
      .input(labOrderReceptionCreateInputSchema)
      .mutation(async ({ ctx, input }) => runLabOrderReceptionCreate(ctx, input)),

    /** Alias for clients that call `orders.createBatch` (tRPC batched HTTP). Same payload as `create`. */
    createBatch: protectedProcedure
      .input(labOrderReceptionCreateInputSchema)
      .mutation(async ({ ctx, input }) => runLabOrderReceptionCreate(ctx, input)),

    createRetest: protectedProcedure
      .input(retestCreateInputSchema)
      .mutation(async ({ ctx, input }) => runRetestCreate(ctx, input)),

    update: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        contractorName: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        castingDate: z.string().optional().nullable(), // ISO yyyy-mm-dd or null
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        // Only allow editing pending orders (not yet distributed)
        if (!(["pending", "distributed"].includes(order.status))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit order in current status" });
        }
        await updateLabOrderFields(input.orderId, {
          contractorName: input.contractorName,
          location: input.location,
          notes: input.notes,
          priority: input.priority,
          castingDate: input.castingDate === null ? null : input.castingDate ? new Date(input.castingDate) : undefined,
        });
        await addSampleHistory({
          sampleId: order.sampleId,
          userId: ctx.user.id,
          action: "updated",
          notes: `Order ${order.orderCode} fields updated by ${ctx.user.name}`,
        });
        return { success: true };
      }),

    distribute: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        technicianId: z.number(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (order.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Order already distributed" });
        const distPriority = input.priority ?? order.priority;
        if (input.priority && input.priority !== order.priority) {
          await updateLabOrderFields(input.orderId, { priority: input.priority });
        }
        const items = await getLabOrderItems(input.orderId);
        const techUser = await getUserById(input.technicianId);
        // Create a distribution for each order item
        for (const item of items) {
          const distCode = await generateDistributionCode();
          const dist = await createDistribution({
            distributionCode: distCode,
            sampleId: order.sampleId,
            assignedTechnicianId: input.technicianId,
            assignedById: ctx.user.id,
            testType: item.testTypeCode,
            testName: item.testTypeName,
            testSubType: item.testSubType ?? null,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? "0",
            totalCost: String(item.quantity * parseFloat(item.unitPrice ?? "0")),
            priority: distPriority,
            notes: input.notes ?? null,
            status: "pending",
          });
          await updateLabOrderItemDistribution(item.id, dist.id);
          if (item.testTypeCode === "CONC_CUBE" && dist?.id) {
            await ensureConcreteGroupsFromReceptionPlan(
              dist.id,
              input.technicianId,
              techUser?.name ?? techUser?.username,
            );
          }
        }
        // Update order status
        await updateLabOrderStatus(input.orderId, "distributed", {
          distributedById: ctx.user.id,
          distributedAt: new Date(),
          assignedTechnicianId: input.technicianId,
        });
        // Update sample status
        await updateSampleStatus(order.sampleId, "distributed");
        // Log
        await addSampleHistory({
          sampleId: order.sampleId,
          userId: ctx.user.id,
          action: "distributed",
          notes: `Order ${order.orderCode} distributed with ${items.length} test(s)`,
        });
        // Notify technician
        await createNotification({
          userId: input.technicianId,
          sampleId: order.sampleId,
          title: "New Assignment",
          message: `Order ${order.orderCode} assigned to you with ${items.length} test(s)`,
          type: "info",
          notificationType: "new_assignment",
        });
        return { success: true };
      }),
    reassign: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        technicianId: z.number(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        if (!["distributed", "in_progress"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only distributed/in-progress orders can be edited" });
        }

        const items = await getLabOrderItems(input.orderId);
        const hasSubmittedItems = items.some((item: any) => item.status === "completed" || item.status === "submitted");
        if (hasSubmittedItems) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot edit distribution after technician has submitted results",
          });
        }

        const oldValue = {
          technicianId: order.assignedTechnicianId ?? null,
          priority: order.priority ?? "normal",
        };
        const newPriority = input.priority ?? order.priority ?? "normal";
        const newValue = {
          technicianId: input.technicianId,
          priority: newPriority,
        };

        await updateLabOrderFields(input.orderId, {
          assignedTechnicianId: input.technicianId,
          priority: input.priority ?? undefined,
          notes: input.notes ?? "",
        });

        // Reassign only distributions that belong to this order's items.
        const allDists = order.sampleId ? await getDistributionsBySample(order.sampleId) : [];
        const orderDistIds = items
          .map((i: { distributionId: number | null }) => i.distributionId)
          .filter((v): v is number => typeof v === "number");
        for (const d of allDists.filter((dist: any) => orderDistIds.includes(dist.id))) {
          await reassignDistribution(d.id, input.technicianId, input.notes);
        }

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? ctx.user.username ?? "Unknown",
          action: "distribution_edited",
          entity: "labOrder",
          entityId: input.orderId,
          entityLabel: order.orderCode,
          oldValue,
          newValue,
          ipAddress: ctx.req.ip,
        });

        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? ctx.user.username ?? "Unknown",
          action: "distribution_reassigned",
          entity: "labOrder",
          entityId: input.orderId,
          entityLabel: order.orderCode,
          oldValue,
          newValue,
          ipAddress: ctx.req.ip,
        });

        const updatedOrder = await getLabOrderById(input.orderId);
        return updatedOrder;
      }),

    updateItemStatus: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateLabOrderItemStatus(input.itemId, input.status);
        // If item completed, check if all items done
        if (input.status === "completed") {
          // Get the item to find orderId
          const items = await getLabOrderItems(0); // need orderId
          // We need to get the item first
        }
        return { success: true };
      }),

    completeItem: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        itemId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateLabOrderItemStatus(input.itemId, "completed");
        const allDone = await checkAndCompleteOrder(input.orderId);
        if (allDone) {
          const order = await getLabOrderById(input.orderId);
          if (order) {
            await checkAndUpdateSampleStatusAfterSubmission(order.sampleId);
            await notifyUsersByRole("lab_manager", "Order Complete", `Order ${order.orderCode} — all tests completed`, order.sampleId, "info", "order_complete");
          }
        }
        return { success: true, orderCompleted: allDone };
      }),

    review: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager"]);
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        const reviewerName = ctx.user.name || ctx.user.username || "";
        const reviewedAt = new Date();
        const newStatus = input.decision === "approved" ? "reviewed" : "rejected";
        await updateLabOrderStatus(input.orderId, newStatus);
        await updateSampleStatus(order.sampleId, input.decision === "approved" ? "reviewed" : "rejected");
        await createReview({
          sampleId: order.sampleId,
          reviewerId: ctx.user.id,
          decision: input.decision === "approved" ? "approved" : "rejected",
          comments: input.notes ?? null,
          reviewType: "manager_review",
        });
        if (input.decision === "approved") {
          await notifyUsersByRole("qc_inspector", "Order Ready for QC", `Order ${order.orderCode} approved by supervisor`, order.sampleId, "info", "order_reviewed");
        }
        // Backfill legacy test_result reviewer signature fields for reporting.
        const sampleResults = await getTestResultBySample(order.sampleId);
        if (sampleResults.length > 0) {
          await updateTestResult(sampleResults[0].id, {
            managerReviewedById: ctx.user.id,
            managerReviewedByName: reviewerName,
            managerReviewedAt: reviewedAt,
            managerNotes: input.notes,
          });
        }
        return { success: true };
      }),

    qcReview: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "qc_inspector"]);
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        const qcReviewerName = ctx.user.name || ctx.user.username || "";
        const qcReviewedAt = new Date();
        const newStatus = input.decision === "approved" ? "qc_passed" : "rejected";
        await updateLabOrderStatus(input.orderId, newStatus);
        await updateSampleStatus(order.sampleId, input.decision === "approved" ? "qc_passed" : "rejected");
        await createReview({
          sampleId: order.sampleId,
          reviewerId: ctx.user.id,
          decision: input.decision === "approved" ? "approved" : "rejected",
          comments: input.notes ?? null,
          reviewType: "qc_review",
        });
        // Backfill legacy test_result QC signature fields for reporting.
        const sampleResults = await getTestResultBySample(order.sampleId);
        if (sampleResults.length > 0) {
          await updateTestResult(sampleResults[0].id, {
            qcReviewedById: ctx.user.id,
            qcReviewedByName: qcReviewerName,
            qcReviewedAt: qcReviewedAt,
            qcNotes: input.notes,
          });
        }
        return { success: true };
      }),
    updateItemQty: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        quantity: z.number().int().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { labOrderItems: tbl } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(tbl).set({ quantity: input.quantity, updatedAt: new Date() }).where(eq(tbl.id, input.itemId));
        return { success: true };
      }),

    bySample: protectedProcedure
      .input(z.object({ sampleId: z.number() }))
      .query(async ({ ctx, input }) => {
        const allOrders = await getAllLabOrders();
        const sampleOrders = allOrders.filter((o: { sampleId: number | null }) => o.sampleId === input.sampleId);
        return sampleOrders;
      }),
    getForReport: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const order = await getLabOrderById(input.orderId);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        const items = await getLabOrderItems(input.orderId);
        const sample = order.sampleId ? await getSampleById(order.sampleId) : null;
        // Get all distributions linked to this order's sample
        const allDists = order.sampleId ? await getDistributionsBySample(order.sampleId) : [];
        // Filter only distributions linked to this order's items
        const orderDistIds = items.map((i: { distributionId: number | null }) => i.distributionId).filter(Boolean);
        const dists = allDists.filter(d => orderDistIds.includes(d.id));
        // For each distribution, fetch test results
        const distsWithResults = await Promise.all(
          dists.map(async (d) => {
            const specResult = await getSpecializedTestResultByDistribution(d.id);
            const legacyResult = await getTestResultByDistribution(d.id);
            const concreteGroups = await getConcreteGroupsByDistribution(d.id);
            const cubesByGroup: Record<number, any[]> = {};
            for (const g of concreteGroups) {
              cubesByGroup[g.id] = await getCubesByGroup(g.id);
            }
            return { dist: d, specResult, legacyResult, concreteGroups, cubesByGroup };
          })
        );
        // Reviews for this sample
        const reviews = order.sampleId ? await getReviewsBySample(order.sampleId) : [];
        return {
          order,
          items,
          sample,
          distsWithResults,
          reviews,
        };
      }),
  }),
  // ─── Notifications ───────────────────────────────────────────────────────────────────────────────────────
  dashboard: dashboardRouter,
  deletion: deletionRouter,

  // ─── Monthly Performance Report ─────────────────────────────────────────────────────────────────────────
  reports: router({
    monthlyPdf: protectedProcedure
      .input(z.object({
        year:  z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
        lang:  z.enum(["ar", "en"]).default("ar"),
      }))
      .mutation(async ({ input, ctx }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "qc_inspector"]);
        const { year, month, lang } = input;
        const startDate = new Date(year, month - 1, 1);
        const endDate   = new Date(year, month, 0, 23, 59, 59);
        // Re-use the same data-fetching logic as monthly query
        const allOrders = await getAllLabOrders();
        const monthOrders = allOrders.filter((o: any) => {
          const d = new Date(o.createdAt);
          return d >= startDate && d <= endDate;
        });
        const totalOrders     = monthOrders.length;
        const completedOrders = monthOrders.filter((o: any) => ["completed","reviewed","qc_passed"].includes(o.status)).length;
        const rejectedOrders  = monthOrders.filter((o: any) => o.status === "rejected").length;
        const pendingOrders   = monthOrders.filter((o: any) => ["pending","distributed","in_progress"].includes(o.status)).length;
        const qcPassedOrders  = monthOrders.filter((o: any) => o.status === "qc_passed").length;
        const allClearances   = await getAllClearanceRequests();
        const monthClearances = allClearances.filter(c => {
          const d = new Date(c.createdAt);
          return d >= startDate && d <= endDate;
        });
        const totalClearances   = monthClearances.length;
        const issuedClearances  = monthClearances.filter(c => c.status === "issued").length;
        const pendingClearances = monthClearances.filter(c => c.status !== "issued" && c.status !== "rejected").length;
        const issuedWithDates   = monthClearances.filter(c => c.status === "issued" && c.certificateIssuedAt);
        let avgClearanceDays: number | null = null;
        if (issuedWithDates.length > 0) {
          const totalMs = issuedWithDates.reduce((sum, c) => {
            const start = new Date(c.createdAt).getTime();
            const end   = new Date((c as any).certificateIssuedAt!).getTime();
            return sum + (end - start);
          }, 0);
          avgClearanceDays = Math.round((totalMs / issuedWithDates.length) / (1000 * 60 * 60 * 24) * 10) / 10;
        }
        const allTestTypes = await getAllTestTypes();
        const testBreakdown: Record<string, { code: string; nameAr: string; nameEn: string; category: string; count: number; passed: number; failed: number }> = {};
        for (const order of monthOrders) {
          const items = await getLabOrderItems(order.id);
          for (const item of items) {
            const tt = allTestTypes.find(t => t.code === item.testTypeCode);
            const key = item.testTypeCode;
            if (!testBreakdown[key]) {
              testBreakdown[key] = { code: key, nameAr: tt?.nameAr ?? key, nameEn: tt?.nameEn ?? key, category: tt?.category ?? "concrete", count: 0, passed: 0, failed: 0 };
            }
            testBreakdown[key].count++;
            if (item.distributionId) {
              const specResult = await getSpecializedTestResultByDistribution(item.distributionId);
              if ((specResult as any)?.overallResult === "pass") testBreakdown[key].passed++;
              else if ((specResult as any)?.overallResult === "fail") testBreakdown[key].failed++;
            }
          }
        }
        const allUsers = await getAllUsers();
        const technicianMap: Record<number, { id: number; name: string; completed: number; total: number }> = {};
        for (const order of monthOrders) {
          if (!order.assignedTechnicianId) continue;
          const tid = order.assignedTechnicianId;
          if (!technicianMap[tid]) {
            const user = allUsers.find(u => u.id === tid);
            technicianMap[tid] = { id: tid, name: user?.name ?? `Tech #${tid}`, completed: 0, total: 0 };
          }
          technicianMap[tid].total++;
          if (["completed","reviewed","qc_passed"].includes(order.status)) technicianMap[tid].completed++;
        }
        const bySampleType: Record<string, number> = {};
        for (const order of monthOrders) {
          const st = (order as any).sampleType ?? "unknown";
          bySampleType[st] = (bySampleType[st] ?? 0) + 1;
        }
        const totalTests  = Object.values(testBreakdown).reduce((s, v) => s + v.count, 0);
        const passedTests = Object.values(testBreakdown).reduce((s, v) => s + v.passed, 0);
        const failedTests = Object.values(testBreakdown).reduce((s, v) => s + v.failed, 0);
        const passRate    = totalTests > 0 ? Math.round((passedTests / totalTests) * 1000) / 10 : null;
        const reportData = {
          period: { year, month },
          orders: { total: totalOrders, completed: completedOrders, rejected: rejectedOrders, pending: pendingOrders, qcPassed: qcPassedOrders },
          clearances: { total: totalClearances, issued: issuedClearances, pending: pendingClearances, avgDays: avgClearanceDays },
          tests: { total: totalTests, passed: passedTests, failed: failedTests, passRate },
          testBreakdown: Object.values(testBreakdown).sort((a, b) => b.count - a.count),
          technicianPerformance: Object.values(technicianMap).sort((a, b) => b.completed - a.completed),
          bySampleType: Object.entries(bySampleType).map(([type, count]) => ({ type, count })),
        };
        const url = await generateMonthlyReportPdf(reportData, lang);
        return { url };
      }),
    generate: protectedProcedure
      .input(z.object({
        sections: z.array(z.enum([
          "overview", "status", "type", "trend", "passfail",
          "readiness", "scorecard", "toptests", "techperf",
        ])),
        range: z.enum(["month", "quarter", "year", "custom"]),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        format: z.enum(["pdf", "excel"]),
        lang: z.enum(["ar", "en", "both"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "supervisor"]);
        if (input.range === "custom" && (!input.dateFrom || !input.dateTo)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Custom range requires dateFrom and dateTo",
          });
        }
        try {
          return await generateDashboardReport(input);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Dashboard report generation failed";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
        }
      }),
    monthly: protectedProcedure
      .input(z.object({
        year:  z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      }))
      .query(async ({ input, ctx }) => {
        requireRole(ctx.user.role, ["admin", "lab_manager", "qc_inspector"]);

        const { year, month } = input;
        const startDate = new Date(year, month - 1, 1);
        const endDate   = new Date(year, month, 0, 23, 59, 59); // last day of month

        // ── 1. Orders created this month ──────────────────────────────────────
        const allOrders = await getAllLabOrders();
        const monthOrders = allOrders.filter((o: any) => {
          const d = new Date(o.createdAt);
          return d >= startDate && d <= endDate;
        });

        const totalOrders     = monthOrders.length;
        const completedOrders = monthOrders.filter((o: any) => ["completed","reviewed","qc_passed"].includes(o.status)).length;
        const rejectedOrders  = monthOrders.filter((o: any) => o.status === "rejected").length;
        const pendingOrders   = monthOrders.filter((o: any) => ["pending","distributed","in_progress"].includes(o.status)).length;
        const qcPassedOrders  = monthOrders.filter((o: any) => o.status === "qc_passed").length;

        // ── 2. Clearance requests created this month ──────────────────────────
        const allClearances = await getAllClearanceRequests();
        const monthClearances = allClearances.filter(c => {
          const d = new Date(c.createdAt);
          return d >= startDate && d <= endDate;
        });

        const totalClearances   = monthClearances.length;
        const issuedClearances  = monthClearances.filter(c => c.status === "issued").length;
        const pendingClearances = monthClearances.filter(c => c.status !== "issued" && c.status !== "rejected").length;

        // ── 3. Average clearance turnaround (days) ────────────────────────────
        // From clearance request createdAt → certificateIssuedAt
        const issuedWithDates = monthClearances.filter(
          c => c.status === "issued" && c.certificateIssuedAt
        );
        let avgClearanceDays: number | null = null;
        if (issuedWithDates.length > 0) {
          const totalMs = issuedWithDates.reduce((sum, c) => {
            const start = new Date(c.createdAt).getTime();
            const end   = new Date(c.certificateIssuedAt!).getTime();
            return sum + (end - start);
          }, 0);
          avgClearanceDays = Math.round((totalMs / issuedWithDates.length) / (1000 * 60 * 60 * 24) * 10) / 10;
        }

        // ── 4. Tests breakdown by type ────────────────────────────────────────
        const allTestTypes = await getAllTestTypes();
        const testBreakdown: Record<string, { code: string; nameAr: string; nameEn: string; category: string; count: number; passed: number; failed: number }> = {};

        for (const order of monthOrders) {
          const items = await getLabOrderItems(order.id);
          for (const item of items) {
            const tt = allTestTypes.find(t => t.code === item.testTypeCode);
            const key = item.testTypeCode;
            if (!testBreakdown[key]) {
              testBreakdown[key] = {
                code: key,
                nameAr: tt?.nameAr ?? key,
                nameEn: tt?.nameEn ?? key,
                category: tt?.category ?? "concrete",
                count: 0, passed: 0, failed: 0,
              };
            }
            testBreakdown[key].count++;
            // Check result from specializedTestResults
            if (item.distributionId) {
              const specResult = await getSpecializedTestResultByDistribution(item.distributionId);
              if ((specResult as any)?.overallResult === "pass") testBreakdown[key].passed++;
              else if ((specResult as any)?.overallResult === "fail") testBreakdown[key].failed++;
            }
          }
        }

        // ── 5. Technician performance ─────────────────────────────────────────
        const allUsers = await getAllUsers();
        const technicianMap: Record<number, { id: number; name: string; completed: number; total: number }> = {};
        for (const order of monthOrders) {
          if (!order.assignedTechnicianId) continue;
          const tid = order.assignedTechnicianId;
          if (!technicianMap[tid]) {
            const user = allUsers.find(u => u.id === tid);
            technicianMap[tid] = { id: tid, name: user?.name ?? `Tech #${tid}`, completed: 0, total: 0 };
          }
          technicianMap[tid].total++;
          if (["completed","reviewed","qc_passed"].includes(order.status)) {
            technicianMap[tid].completed++;
          }
        }

        // ── 6. Orders by sample type ──────────────────────────────────────────
        const bySampleType: Record<string, number> = {};
        for (const order of monthOrders) {
          const st = (order as any).sampleType ?? "unknown";
          bySampleType[st] = (bySampleType[st] ?? 0) + 1;
        }

        // ── 7. Pass rate ──────────────────────────────────────────────────────
        const totalTests  = Object.values(testBreakdown).reduce((s, v) => s + v.count, 0);
        const passedTests = Object.values(testBreakdown).reduce((s, v) => s + v.passed, 0);
        const failedTests = Object.values(testBreakdown).reduce((s, v) => s + v.failed, 0);
        const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 1000) / 10 : null;

        return {
          period: { year, month, startDate, endDate },
          orders: { total: totalOrders, completed: completedOrders, rejected: rejectedOrders, pending: pendingOrders, qcPassed: qcPassedOrders },
          clearances: { total: totalClearances, issued: issuedClearances, pending: pendingClearances, avgDays: avgClearanceDays },
          tests: { total: totalTests, passed: passedTests, failed: failedTests, passRate },
          testBreakdown: Object.values(testBreakdown).sort((a, b) => b.count - a.count),
          technicianPerformance: Object.values(technicianMap).sort((a, b) => b.completed - a.completed),
          bySampleType: Object.entries(bySampleType).map(([type, count]) => ({ type, count })),
        };
      }),
  }),

  testDependencies: router({
    check: protectedProcedure
      .input(
        z.object({
          sampleId: z.number(),
          testCode: z.string().min(1),
        })
      )
      .query(async ({ input }) => {
        return checkTestDependencies(input.sampleId, input.testCode);
      }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getNotificationsByUser(ctx.user.id);
    }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await markNotificationRead(input.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
