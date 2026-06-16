/**
 * Sector Portal Router
 * Provides tRPC endpoints for the external sector portal (read-only access).
 * Authentication: username + password → returns a signed session token.
 * The sector portal sends this token as Authorization: Bearer <token> header.
 */
import { router, publicProcedure } from "../_core/trpc";
import { getDb, mysqlRawInsertRow, getContractById, getContractorById, createClearanceRequest, generateClearanceCode, buildClearanceInventoryForContract, getClearanceRequesterUserId } from "../db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { sdk } from "../_core/sdk";
import {
  sectorAccounts,
  sectorReportReads,
  samples,
  specializedTestResults,
  clearanceRequests,
  notifications,
  contracts,
  labOrders,
} from "../../drizzle/schema";
import { eq, and, desc, inArray, sql, or, like, gte, lte, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { buildSampleVisibilityCondition } from "../db";
import { getOfficialTestByCode } from "../data/official-test-catalog";
import { computeSampleKpisFromStatusCounts } from "../../shared/dashboardInsights";

const SECTOR_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function resolveTestTypeMeta(testTypeCode: string | null | undefined) {
  const meta = getOfficialTestByCode(testTypeCode);
  return {
    testTypeCode: testTypeCode ?? "",
    testTypeNameAr: meta?.nameAr ?? testTypeCode ?? "",
    testTypeNameEn: meta?.nameEn ?? testTypeCode ?? "",
  };
}

function sectorSamplesWhere(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sectorKey: string,
  filters?: { search?: string; status?: string; dateFrom?: string; dateTo?: string }
) {
  const conditions = [
    eq(samples.sector, sectorKey as any),
    buildSampleVisibilityCondition(),
    ne(samples.status, "deleted"),
    inArray(
      samples.id,
      db
        .select({ sampleId: labOrders.sampleId })
        .from(labOrders)
        .where(isNull(labOrders.deletedAt))
    ),
  ];
  if (filters?.status) {
    conditions.push(eq(samples.status, filters.status as any));
  }
  if (filters?.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(samples.sampleCode, q),
        like(samples.contractNumber, q),
        like(samples.contractName, q),
        like(samples.contractorName, q)
      )!
    );
  }
  if (filters?.dateFrom) {
    conditions.push(gte(samples.receivedAt, new Date(filters.dateFrom)));
  }
  if (filters?.dateTo) {
    const end = new Date(filters.dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(samples.receivedAt, end));
  }
  return and(...conditions);
}

// ── Helper: extract sector from request ──────────────────────────────────────
async function getSectorFromCtx(ctx: any): Promise<{ sectorKey: string; sectorId: number }> {
  const authHeader = ctx.req?.headers?.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing sector token" });
  }
  const token = authHeader.slice(7);
  try {
    const session = await sdk.verifySession(token);
    if (!session || !session.openId?.startsWith("sector:")) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid sector token" });
    }
    const sectorKey = session.openId.replace("sector:", "");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const accounts = await db
      .select({ id: sectorAccounts.id, sectorKey: sectorAccounts.sectorKey, isActive: sectorAccounts.isActive })
      .from(sectorAccounts)
      .where(eq(sectorAccounts.sectorKey, sectorKey as any))
      .limit(1);
    const account = accounts[0];
    if (!account || !account.isActive) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sector account not found or inactive" });
    }
    return { sectorKey, sectorId: account.id };
  } catch (e: any) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired sector token" });
  }
}

// ── Protected sector procedure ────────────────────────────────────────────────
const sectorProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const { sectorKey, sectorId } = await getSectorFromCtx(ctx);
  return next({ ctx: { ...ctx, sectorKey, sectorId } });
});

// ── Sector router ─────────────────────────────────────────────────────────────
export const sectorRouter = router({

  // ── Login ──────────────────────────────────────────────────────────────────
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      if (!process.env.JWT_SECRET?.trim()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "JWT_SECRET is not configured on the server",
        });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const accounts = await db
        .select()
        .from(sectorAccounts)
        .where(eq(sectorAccounts.username, input.username.trim().toLowerCase()))
        .limit(1);
      const account = accounts[0];

      if (!account || !account.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(input.password, account.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      await db
        .update(sectorAccounts)
        .set({ lastLoginAt: new Date() })
        .where(eq(sectorAccounts.id, account.id));

      // Create session token using the same SDK mechanism
      const token = await sdk.createSessionToken(`sector:${account.sectorKey}`, {
        expiresInMs: SECTOR_TOKEN_EXPIRY_MS,
        name: account.nameEn,
      });

      return {
        token,
        sector: {
          id: account.id,
          sectorKey: account.sectorKey,
          nameAr: account.nameAr,
          nameEn: account.nameEn,
        },
      };
    }),

  // ── Get sector info ────────────────────────────────────────────────────────
  me: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db
      .select({ sectorKey: sectorAccounts.sectorKey, nameAr: sectorAccounts.nameAr, nameEn: sectorAccounts.nameEn })
      .from(sectorAccounts)
      .where(eq(sectorAccounts.sectorKey, ctx.sectorKey as any))
      .limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),

  // ── Dashboard stats ────────────────────────────────────────────────────────
  getDashboardStats: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const baseWhere = sectorSamplesWhere(db, ctx.sectorKey);

    const statusRows = await db
      .select({ status: samples.status, count: sql<number>`COUNT(*)` })
      .from(samples)
      .where(baseWhere)
      .groupBy(samples.status);

    const sampleKpis = computeSampleKpisFromStatusCounts(statusRows);
    const totalSamples = sampleKpis.total;
    const pendingSamples = sampleKpis.active;
    const completedSamples = sampleKpis.completed;

    const approvedCountRow = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(specializedTestResults)
      .innerJoin(samples, eq(specializedTestResults.sampleId, samples.id))
      .where(and(baseWhere, eq(specializedTestResults.status, "approved")));
    const approvedResults = Number(approvedCountRow[0]?.count ?? 0);

    const [passCountRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(specializedTestResults)
      .innerJoin(samples, eq(specializedTestResults.sampleId, samples.id))
      .where(and(baseWhere, eq(specializedTestResults.status, "approved"), eq(specializedTestResults.overallResult, "pass")));
    const readyResults = Number(passCountRow?.count ?? 0);

    const [failCountRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(specializedTestResults)
      .innerJoin(samples, eq(specializedTestResults.sampleId, samples.id))
      .where(and(baseWhere, eq(specializedTestResults.status, "approved"), eq(specializedTestResults.overallResult, "fail")));
    const failedResults = Number(failCountRow?.count ?? 0);

    const recentFailedRows = await db
      .select({
        id: specializedTestResults.id,
        sampleCode: samples.sampleCode,
        contractNumber: samples.contractNumber,
        testTypeCode: specializedTestResults.testTypeCode,
        testDate: specializedTestResults.testDate,
        updatedAt: specializedTestResults.updatedAt,
        summaryValues: specializedTestResults.summaryValues,
      })
      .from(specializedTestResults)
      .innerJoin(samples, eq(specializedTestResults.sampleId, samples.id))
      .where(and(baseWhere, eq(specializedTestResults.status, "approved"), eq(specializedTestResults.overallResult, "fail")))
      .orderBy(desc(specializedTestResults.updatedAt))
      .limit(5);

    const recentFailedResults = recentFailedRows.map((r) => {
      const meta = resolveTestTypeMeta(r.testTypeCode);
      const summary = r.summaryValues as Record<string, unknown> | null;
      const hint =
        (summary?.overallIndex != null ? String(summary.overallIndex) : null) ??
        (summary?.result != null ? String(summary.result) : null) ??
        meta.testTypeNameAr;
      return {
        id: r.id,
        sampleCode: r.sampleCode,
        contractNumber: r.contractNumber,
        testTypeCode: meta.testTypeCode,
        testTypeNameAr: meta.testTypeNameAr,
        testTypeNameEn: meta.testTypeNameEn,
        hint,
        createdAt: r.updatedAt ?? r.testDate,
      };
    });

    const readResults = await db
      .select({ reportId: sectorReportReads.reportId })
      .from(sectorReportReads)
      .where(and(
        eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
        eq(sectorReportReads.reportType, "test_result")
      ));
    const readResultIds = new Set(readResults.map((r: { reportId: number }) => r.reportId));

    const approvedIds = await db
      .select({ id: specializedTestResults.id })
      .from(specializedTestResults)
      .innerJoin(samples, eq(specializedTestResults.sampleId, samples.id))
      .where(and(baseWhere, eq(specializedTestResults.status, "approved")));
    const unreadResults = approvedIds.filter((r: { id: number }) => !readResultIds.has(r.id)).length;

    const contractIdRows = await db
      .selectDistinct({ contractId: samples.contractId })
      .from(samples)
      .where(and(baseWhere, isNotNull(samples.contractId)));
    const contractIds = contractIdRows
      .map((r: { contractId: number | null }) => r.contractId)
      .filter((id: number | null): id is number => id !== null);

    let unreadClearances = 0;
    if (contractIds.length > 0) {
      const allClearances = await db
        .select({ id: clearanceRequests.id })
        .from(clearanceRequests)
        .where(inArray(clearanceRequests.contractId, contractIds));

      const readClearances = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "clearance")
        ));
      const readClearanceIds = new Set(readClearances.map((r: { reportId: number }) => r.reportId));
      unreadClearances = allClearances.filter((c: { id: number }) => !readClearanceIds.has(c.id)).length;
    }

    return {
      totalSamples,
      pendingSamples,
      completedSamples,
      approvedResults,
      readyResults,
      failedResults,
      recentFailedResults,
      unreadResults,
      unreadClearances,
    };
  }),

  // ── Samples received for this sector ──────────────────────────────────────
  getSamples: sectorProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      search: z.string().optional(),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const filters = {
        search: input.search,
        status: input.status,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      };
      const whereClause = sectorSamplesWhere(db, ctx.sectorKey, filters);
      const summaryWhere = sectorSamplesWhere(db, ctx.sectorKey);

      const [rows, countRow, statusSummaryRows] = await Promise.all([
        db
          .select()
          .from(samples)
          .where(whereClause)
          .orderBy(desc(samples.receivedAt))
          .limit(input.limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(samples)
          .where(whereClause),
        db
          .select({ status: samples.status, count: sql<number>`COUNT(*)` })
          .from(samples)
          .where(summaryWhere)
          .groupBy(samples.status),
      ]);

      const statusSummary: Record<string, number> = {};
      for (const row of statusSummaryRows) {
        const st = row.status ?? "received";
        statusSummary[st] = Number(row.count ?? 0);
      }

      return {
        samples: rows.map((s: any) => ({
          id: s.id,
          sampleCode: s.sampleCode,
          contractNumber: s.contractNumber,
          contractName: s.contractName,
          contractorName: s.contractorName,
          sampleType: s.sampleType,
          quantity: s.quantity,
          condition: s.condition,
          status: s.status,
          receivedAt: s.receivedAt,
        })),
        total: Number(countRow[0]?.count ?? 0),
        statusSummary,
      };
    }),

  // ── Test results (approved only) ───────────────────────────────────────────
  getTestResults: sectorProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;

      const sectorSamples = await db
        .select({ id: samples.id, sampleCode: samples.sampleCode, contractNumber: samples.contractNumber, contractName: samples.contractName, contractorName: samples.contractorName })
        .from(samples)
        .where(sectorSamplesWhere(db, ctx.sectorKey));

      if (sectorSamples.length === 0) return { results: [], total: 0, unreadCount: 0 };

      const sampleIds = sectorSamples.map((s: { id: number }) => s.id);
      const sampleMap: Record<number, typeof sectorSamples[0]> = Object.fromEntries(
        sectorSamples.map((s: typeof sectorSamples[0]) => [s.id, s])
      );

      const results = await db
        .select()
        .from(specializedTestResults)
        .where(and(
          inArray(specializedTestResults.sampleId, sampleIds),
          eq(specializedTestResults.status, "approved")
        ))
        .orderBy(desc(specializedTestResults.updatedAt))
        .limit(input.limit)
        .offset(offset);

      const allApproved = await db
        .select({ id: specializedTestResults.id })
        .from(specializedTestResults)
        .where(and(
          inArray(specializedTestResults.sampleId, sampleIds),
          eq(specializedTestResults.status, "approved")
        ));

      const readRecords = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "test_result")
        ));
      const readIds = new Set(readRecords.map((r: { reportId: number }) => r.reportId));
      const unreadCount = allApproved.filter((r: { id: number }) => !readIds.has(r.id)).length;

      return {
        results: results.map((r: any) => {
          const typeMeta = resolveTestTypeMeta(r.testTypeCode);
          return {
            id: r.id,
            sampleId: r.sampleId,
            sampleCode: sampleMap[r.sampleId]?.sampleCode ?? "",
            contractNumber: sampleMap[r.sampleId]?.contractNumber ?? "",
            contractName: sampleMap[r.sampleId]?.contractName ?? "",
            contractorName: sampleMap[r.sampleId]?.contractorName ?? "",
            ...typeMeta,
            testType: typeMeta.testTypeNameEn,
            overallResult: r.overallResult,
            summaryValues: r.summaryValues,
            testedBy: r.testedBy,
            testDate: r.testDate,
            updatedAt: r.updatedAt,
            isRead: readIds.has(r.id),
          };
        }),
        total: allApproved.length,
        unreadCount,
      };
    }),

  // ── Mark test result as read ───────────────────────────────────────────────
  markResultRead: sectorProcedure
    .input(z.object({ resultId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db
        .select({ id: sectorReportReads.id })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "test_result"),
          eq(sectorReportReads.reportId, input.resultId)
        ))
        .limit(1);

      if (existing.length === 0) {
        await mysqlRawInsertRow(db, "sector_report_reads", {
          sectorKey: ctx.sectorKey as string,
          reportType: "test_result",
          reportId: input.resultId,
        });
      }
      return { success: true };
    }),

  // ── Clearance requests ─────────────────────────────────────────────────────
  getClearances: sectorProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;

      const sectorSampleContracts = await db
        .select({ contractId: samples.contractId })
        .from(samples)
        .where(sectorSamplesWhere(db, ctx.sectorKey));

      const contractIds = Array.from(new Set(
        sectorSampleContracts
          .map((s: { contractId: number | null }) => s.contractId)
          .filter((id: number | null): id is number => id !== null)
      ));

      if (contractIds.length === 0) return { clearances: [], total: 0, unreadCount: 0 };

      const clearances = await db
        .select()
        .from(clearanceRequests)
        .where(inArray(clearanceRequests.contractId, contractIds))
        .orderBy(desc(clearanceRequests.updatedAt))
        .limit(input.limit)
        .offset(offset);

      const allClearances = await db
        .select({ id: clearanceRequests.id })
        .from(clearanceRequests)
        .where(inArray(clearanceRequests.contractId, contractIds));

      const readRecords = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "clearance")
        ));
      const readIds = new Set(readRecords.map((r: { reportId: number }) => r.reportId));
      const unreadCount = allClearances.filter((c: { id: number }) => !readIds.has(c.id)).length;

      return {
        clearances: clearances.map((c: any) => ({
          id: c.id,
          requestCode: c.requestCode,
          contractNumber: c.contractNumber,
          contractName: c.contractName,
          contractorName: c.contractorName,
          totalTests: c.totalTests,
          passedTests: c.passedTests,
          failedTests: c.failedTests,
          totalAmount: c.totalAmount,
          status: c.status,
          paymentOrderNumber: c.paymentOrderNumber,
          paymentOrderDate: c.paymentOrderDate,
          certificateCode: c.certificateCode,
          certificatePdfUrl: c.certificatePdfUrl,
          certificateIssuedAt: c.certificateIssuedAt,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          isRead: readIds.has(c.id),
        })),
        total: allClearances.length,
        unreadCount,
      };
    }),

  // ── Get unread counts (for notification badges) ─────────────────────────────
  getUnreadCount: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const sectorSamples = await db
      .select({ id: samples.id, contractId: samples.contractId })
      .from(samples)
      .where(sectorSamplesWhere(db, ctx.sectorKey));

    const sampleIds = sectorSamples.map((s: { id: number }) => s.id);
    let unreadResults = 0;
    let unreadClearances = 0;
    let failedResults = 0;

    if (sampleIds.length > 0) {
      const approvedRows = await db
        .select({ id: specializedTestResults.id, overallResult: specializedTestResults.overallResult })
        .from(specializedTestResults)
        .where(and(
          inArray(specializedTestResults.sampleId, sampleIds),
          eq(specializedTestResults.status, "approved")
        ));

      const readResults = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "test_result")
        ));
      const readResultIds = new Set(readResults.map((r: { reportId: number }) => r.reportId));
      unreadResults = approvedRows.filter((r: { id: number }) => !readResultIds.has(r.id)).length;
      failedResults = approvedRows.filter((r: { overallResult: string | null }) => r.overallResult === "fail").length;

      const contractIds = Array.from(new Set(
        sectorSamples
          .map((s: { contractId: number | null }) => s.contractId)
          .filter((id: number | null): id is number => id !== null)
      ));
      if (contractIds.length > 0) {
        const allClearances = await db
          .select({ id: clearanceRequests.id })
          .from(clearanceRequests)
          .where(inArray(clearanceRequests.contractId, contractIds));

        const readClearances = await db
          .select({ reportId: sectorReportReads.reportId })
          .from(sectorReportReads)
          .where(and(
            eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
            eq(sectorReportReads.reportType, "clearance")
          ));
        const readClearanceIds = new Set(readClearances.map((r: { reportId: number }) => r.reportId));
        unreadClearances = allClearances.filter((c: { id: number }) => !readClearanceIds.has(c.id)).length;
      }
    }

    return { results: unreadResults, clearances: unreadClearances, failedResults, total: unreadResults + unreadClearances };
  }),

  // ── Mark clearance as read ────────────────────────────────────────────────────────
  markClearanceRead: sectorProcedure
    .input(z.object({ clearanceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db
        .select({ id: sectorReportReads.id })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "clearance"),
          eq(sectorReportReads.reportId, input.clearanceId)
        ))
        .limit(1);

      if (existing.length === 0) {
        await mysqlRawInsertRow(db, "sector_report_reads", {
          sectorKey: ctx.sectorKey as string,
          reportType: "clearance",
          reportId: input.clearanceId,
        });
      }
      return { success: true };
    }),

  // ── Get sector notifications list ────────────────────────────────────────────
  getNotifications: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.sectorId, ctx.sectorId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    return rows;
  }),

  // ── Get unread notification count for sector ────────────────────────────
  getNotificationCount: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [totalRow, unreadRow] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notifications)
        .where(eq(notifications.sectorId, ctx.sectorId)),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notifications)
        .where(and(eq(notifications.sectorId, ctx.sectorId), eq(notifications.isRead, false))),
    ]);
    return {
      total: Number(totalRow[0]?.count ?? 0),
      unread: Number(unreadRow[0]?.count ?? 0),
    };
  }),

  // ── Mark notification as read ───────────────────────────────────────────────
  markNotificationRead: sectorProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(
          eq(notifications.id, input.notificationId),
          eq(notifications.sectorId, ctx.sectorId)
        ));
      return { success: true };
    }),

  // ── Mark all notifications as read ─────────────────────────────────────────
  markAllNotificationsRead: sectorProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.sectorId, ctx.sectorId));
      return { success: true };
    }),

  // ── Get contracts for this sector (for clearance request dropdown) ─────────
  getSectorContracts: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Get all samples for this sector and extract unique contractIds
    const sectorSamples = await db
      .select({ contractId: samples.contractId, contractNumber: samples.contractNumber, contractName: samples.contractName, contractorName: samples.contractorName })
      .from(samples)
      .where(sectorSamplesWhere(db, ctx.sectorKey));
    // Deduplicate by contractId
    const seen = new Set<number>();
    const result: { contractId: number; contractNumber: string; contractName: string | null; contractorName: string | null }[] = [];
    for (const s of sectorSamples) {
      if (s.contractId && !seen.has(s.contractId)) {
        seen.add(s.contractId);
        result.push({ contractId: s.contractId, contractNumber: s.contractNumber ?? "", contractName: s.contractName, contractorName: s.contractorName });
      }
    }
    return result;
  }),

  // ── Create clearance request from sector portal ────────────────────────────
  createClearanceRequest: sectorProcedure
    .input(z.object({
      contractId: z.number(),
      contractorLetterBase64: z.string().optional(), // base64 encoded PDF
      contractorLetterFileName: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const contract = await getContractById(input.contractId);
      if (!contract) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
      }

      // Contract must belong to this sector (via samples or contract.sectorKey)
      const sectorSample = await db
        .select({ id: samples.id, contractNumber: samples.contractNumber, contractName: samples.contractName, contractorName: samples.contractorName })
        .from(samples)
        .where(and(sectorSamplesWhere(db, ctx.sectorKey), eq(samples.contractId, input.contractId)))
        .limit(1);
      if (!sectorSample[0] && contract.sectorKey !== ctx.sectorKey) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Contract not linked to this sector" });
      }

      const contractor = await getContractorById(contract.contractorId);
      const contractorName =
        contractor?.nameEn ??
        contractor?.nameAr ??
        sectorSample[0]?.contractorName ??
        "Unknown";

      // Block only open clearance requests (allow new after issued/rejected)
      const openExisting = await db
        .select({ id: clearanceRequests.id })
        .from(clearanceRequests)
        .where(
          and(
            eq(clearanceRequests.contractId, input.contractId),
            notInArray(clearanceRequests.status, ["rejected", "issued"])
          )
        )
        .limit(1);
      if (openExisting[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "Clearance request already exists for this contract" });
      }

      // Upload contractor letter if provided (non-fatal if storage unavailable)
      let contractorLetterUrl: string | undefined;
      if (input.contractorLetterBase64 && input.contractorLetterFileName) {
        try {
          const buffer = Buffer.from(input.contractorLetterBase64, "base64");
          const ext = input.contractorLetterFileName.split(".").pop()?.toLowerCase() ?? "pdf";
          const key = `clearance/contractor-letters/sector-${ctx.sectorId}-${Date.now()}.${ext}`;
          const mime =
            ext === "pdf"
              ? "application/pdf"
              : ext === "png"
                ? "image/png"
                : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : "application/octet-stream";
          const uploaded = await storagePut(key, buffer, mime);
          contractorLetterUrl = uploaded.url;
        } catch (uploadErr) {
          console.warn("[SectorClearance] Contractor letter upload failed:", uploadErr);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not upload contractor letter. Check storage configuration or try again without a file.",
          });
        }
      }

      const code = await generateClearanceCode(db);
      const inventory = await buildClearanceInventoryForContract(input.contractId);
      const requestedById = await getClearanceRequesterUserId();

      await createClearanceRequest({
        requestCode: code,
        contractId: input.contractId,
        contractorId: contract.contractorId,
        contractNumber: contract.contractNumber ?? sectorSample[0]?.contractNumber ?? "",
        contractName: contract.contractName ?? sectorSample[0]?.contractName ?? null,
        contractorName,
        requestedById,
        totalTests: inventory.totalTests,
        passedTests: inventory.passedTests,
        failedTests: inventory.failedTests,
        pendingTests: inventory.pendingTests,
        totalAmount: inventory.totalAmount.toFixed(2),
        inventoryData: inventory.inventoryItems,
        contractorLetterUrl: contractorLetterUrl ?? null,
        sectorId: ctx.sectorId,
        status: "pending",
        notes: input.notes ?? null,
      });

      const { notifyUsersByRole } = await import("../db");
      await notifyUsersByRole(
        "accountant",
        `طلب براءة ذمة جديد من القطاع - عقد ${contract.contractNumber}`,
        `قدّم القطاع طلب براءة ذمة للمقاول "${contractorName}" - عقد: ${contract.contractNumber}`,
        undefined,
        "action_required",
        "clearance_started"
      );
      await notifyUsersByRole(
        "qc_inspector",
        `جرد اختبارات جاهز للاعتماد - عقد ${contract.contractNumber}`,
        `يحتاج جرد الاختبارات للعقد "${contract.contractName ?? contract.contractNumber}" اعتمادك قبل إصدار أمر الدفع`,
        undefined,
        "action_required",
        "clearance_started"
      );

      return { success: true, code };
    }),

  // ── Inbox: unified feed of all sector messages ────────────────────────────
  getInbox: sectorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // 1. System notifications for this sector
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.sectorId, ctx.sectorId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    // 2. Approved test results
    const sectorSamples = await db
      .select({ id: samples.id, sampleCode: samples.sampleCode, contractNumber: samples.contractNumber })
      .from(samples)
      .where(sectorSamplesWhere(db, ctx.sectorKey));
    const sampleIds = sectorSamples.map((s: { id: number }) => s.id);
    const sampleMap: Record<number, { sampleCode: string; contractNumber: string | null }> = Object.fromEntries(
      sectorSamples.map((s: { id: number; sampleCode: string; contractNumber: string | null }) => [s.id, s])
    );

    let resultItems: any[] = [];
    if (sampleIds.length > 0) {
      const results = await db
        .select()
        .from(specializedTestResults)
        .where(and(
          inArray(specializedTestResults.sampleId, sampleIds),
          eq(specializedTestResults.status, "approved")
        ))
        .orderBy(desc(specializedTestResults.updatedAt))
        .limit(100);

      const readRows = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "test_result")
        ));
      const readResultIds = new Set(readRows.map((r: { reportId: number }) => r.reportId));

      resultItems = results.map((r: any) => {
        const typeMeta = resolveTestTypeMeta(r.testTypeCode);
        const contractNumber = sampleMap[r.sampleId]?.contractNumber ?? "";
        const testLabel = typeMeta.testTypeNameAr || typeMeta.testTypeCode;
        return {
          id: `result-${r.id}`,
          type: "result" as const,
          title: `نتيجة فحص: ${sampleMap[r.sampleId]?.sampleCode ?? r.sampleId}`,
          titleEn: `Test Result: ${sampleMap[r.sampleId]?.sampleCode ?? r.sampleId}`,
          subtitle: contractNumber ? `${contractNumber} — ${testLabel}` : testLabel,
          status: r.overallResult,
          isRead: readResultIds.has(r.id),
          createdAt: r.updatedAt ?? r.testDate,
          refId: r.id,
          sampleCode: sampleMap[r.sampleId]?.sampleCode,
          contractNumber,
          testTypeCode: typeMeta.testTypeCode,
          testTypeNameAr: typeMeta.testTypeNameAr,
          testTypeNameEn: typeMeta.testTypeNameEn,
        };
      });
    }

    // 3. Clearance requests for this sector
    const contractRows = await db
      .select({ contractId: samples.contractId })
      .from(samples)
      .where(sectorSamplesWhere(db, ctx.sectorKey));
    const contractIds = Array.from(new Set(
      contractRows.map((c: { contractId: number | null }) => c.contractId).filter((id): id is number => id !== null)
    ));

    let clearanceItems: any[] = [];
    if (contractIds.length > 0) {
      const clearances = await db
        .select()
        .from(clearanceRequests)
        .where(inArray(clearanceRequests.contractId, contractIds))
        .orderBy(desc(clearanceRequests.createdAt))
        .limit(50);

      const readClearRows = await db
        .select({ reportId: sectorReportReads.reportId })
        .from(sectorReportReads)
        .where(and(
          eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
          eq(sectorReportReads.reportType, "clearance")
        ));
      const readClearIds = new Set(readClearRows.map((r: { reportId: number }) => r.reportId));

      clearanceItems = clearances.map((c: any) => ({
        id: `clearance-${c.id}`,
        type: "clearance" as const,
        title: `براءة ذمة: ${c.contractNumber}`,
        titleEn: `Clearance: ${c.contractNumber}`,
        subtitle: c.contractorName ?? "",
        status: c.status,
        isRead: readClearIds.has(c.id),
        createdAt: c.createdAt,
        refId: c.id,
        contractNumber: c.contractNumber,
      }));
    }

    // 4. Merge all and sort by date (newest first)
    const notifItems = notifs.map((n: any) => ({
      id: `notif-${n.id}`,
      type: "notification" as const,
      title: n.title,
      titleEn: n.title,
      subtitle: n.message,
      status: n.isRead ? "read" : "unread",
      isRead: !!n.isRead,
      createdAt: n.createdAt,
      refId: n.id,
    }));

    const allItems = [...notifItems, ...resultItems, ...clearanceItems].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );

    const unreadCount = allItems.filter(i => !i.isRead).length;
    const resultUnread = resultItems.filter(i => !i.isRead).length;
    const clearanceUnread = clearanceItems.filter(i => !i.isRead).length;
    const notifUnread = notifItems.filter(i => !i.isRead).length;

    return { items: allItems, unreadCount, resultUnread, clearanceUnread, notifUnread };
  }),

  // ─── Get full details for a single inbox item ────────────────────────────
  getInboxItemDetail: sectorProcedure
    .input(z.object({
      type: z.enum(["result", "clearance", "notification"]),
      refId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.type === "result") {
        // Fetch specialized test result with sample info
        const [result] = await db
          .select()
          .from(specializedTestResults)
          .where(eq(specializedTestResults.id, input.refId))
          .limit(1);
        if (!result) throw new TRPCError({ code: "NOT_FOUND" });

        // Verify this result belongs to the sector
        const [sample] = await db
          .select()
          .from(samples)
          .where(eq(samples.id, result.sampleId))
          .limit(1);
        if (!sample || sample.sector !== ctx.sectorKey)
          throw new TRPCError({ code: "FORBIDDEN" });

        // Mark as read
        const existing = await db
          .select()
          .from(sectorReportReads)
          .where(and(
            eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
            eq(sectorReportReads.reportType, "test_result"),
            eq(sectorReportReads.reportId, input.refId)
          ))
          .limit(1);
        if (existing.length === 0) {
          await mysqlRawInsertRow(db, "sector_report_reads", {
            sectorKey: ctx.sectorKey as string,
            reportType: "test_result",
            reportId: input.refId,
          });
        }

        const typeMeta = resolveTestTypeMeta(result.testTypeCode);

        return {
          type: "result" as const,
          result: {
            ...result,
            ...typeMeta,
            testTypeName: typeMeta.testTypeNameAr,
          },
          sample,
        };
      }

      if (input.type === "clearance") {
        const [clearance] = await db
          .select()
          .from(clearanceRequests)
          .where(eq(clearanceRequests.id, input.refId))
          .limit(1);
        if (!clearance) throw new TRPCError({ code: "NOT_FOUND" });

        // Mark as read
        const existing = await db
          .select()
          .from(sectorReportReads)
          .where(and(
            eq(sectorReportReads.sectorKey, ctx.sectorKey as any),
            eq(sectorReportReads.reportType, "clearance"),
            eq(sectorReportReads.reportId, input.refId)
          ))
          .limit(1);
        if (existing.length === 0) {
          await mysqlRawInsertRow(db, "sector_report_reads", {
            sectorKey: ctx.sectorKey as string,
            reportType: "clearance",
            reportId: input.refId,
          });
        }

        return { type: "clearance" as const, clearance };
      }

      // notification
      const [notif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.refId))
        .limit(1);
      if (!notif) throw new TRPCError({ code: "NOT_FOUND" });

      // Mark as read
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, input.refId));

      return { type: "notification" as const, notification: notif };
    }),
});