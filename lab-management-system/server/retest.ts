/**
 * Retest registration — search, source loading, and create.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, like, notInArray, or, sql } from "drizzle-orm";
import {
  concreteTestGroups,
  labOrders,
  samples,
  specializedTestResults,
  testResults,
} from "../drizzle/schema";
import type { RetestReason } from "@shared/retestReasons";
import {
  addSampleHistory,
  createLabOrder,
  createLabOrderItems,
  createSample,
  generateOrderCode,
  getNextRetestNumber,
  getAllTestTypes,
  getConcreteGroupsByDistribution,
  getConcreteGroupsBySample,
  getDb,
  getDistributionsBySample,
  getLabOrderItems,
  getSampleById,
  getSpecializedTestResultByDistribution,
  getSpecializedTestResultsBySample,
  getTestResultByDistribution,
  getTestResultBySample,
  notifyUsersByRole,
  samplesHasRetestColumns,
} from "./db";
import { normalizeTestCode } from "./data/official-test-catalog";
import { generateRetestSampleCode } from "./utils/codeGenerator";
import { requireRole } from "./_core/requireRole";
import { labOrderReceptionCreateInputSchema } from "./routers/orders";

function resolveCatalogTestType(
  code: string,
  allTestTypes: Awaited<ReturnType<typeof getAllTestTypes>>
) {
  const normalized = normalizeTestCode(code) ?? code;
  return (
    allTestTypes.find((t) => t.code === code) ??
    allTestTypes.find((t) => t.code === normalized)
  );
}

/** Sample statuses that block retest registration. */
const EXCLUDED_SAMPLE_STATUSES = ["revision_requested"] as const;
/** Still in the lab — not ready for retest yet. */
const ACTIVE_TESTING_SAMPLE_STATUSES = [
  "received",
  "distributed",
  "testing_in_progress",
] as const;
/** Lab-order statuses that block only while QC has not signed off yet. */
const BLOCKING_ORDER_STATUSES = ["pending", "distributed", "in_progress"] as const;
/** QC has certified the report (pass or fail spec — compliance is on the result). */
const QC_COMPLETE_SAMPLE_STATUSES = ["qc_passed", "clearance_issued"] as const;

function isSpecFailure(status: string | null | undefined): boolean {
  return status === "fail" || status === "partial";
}

export const retestReasonSchema = z.enum(["failed_spec", "damaged_sample", "client_request"]);

export const retestCreateInputSchema = labOrderReceptionCreateInputSchema.extend({
  rootSampleId: z.number().int().positive(),
  retestReason: retestReasonSchema,
  retestReasonNotes: z.string().optional(),
});

type ReceptionCtx = {
  user: { id: number; role: string; name: string | null };
  req: { ip?: string };
};

function requireRetestColumns() {
  if (!samplesHasRetestColumns()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Retest is not available yet. Run on the server: npm run db:retest-columns",
    });
  }
}

export async function getLabOrdersBySampleId(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(labOrders)
    .where(and(eq(labOrders.sampleId, sampleId), isNull(labOrders.deletedAt)))
    .orderBy(desc(labOrders.createdAt));
}

function isRootSample(sample: { originalSampleId?: number | null; sampleCode: string }) {
  return sample.originalSampleId == null && !/-R\d+$/i.test(sample.sampleCode);
}

async function sampleHasQcSignOff(sampleId: number): Promise<boolean> {
  const legacy = await getTestResultBySample(sampleId);
  if (legacy.some((r) => r.qcReviewedAt != null)) return true;
  const specialized = await getSpecializedTestResultsBySample(sampleId);
  if (specialized.some((r) => (r as { qcReviewedAt?: Date | null }).qcReviewedAt != null)) {
    return true;
  }
  return false;
}

async function sampleHasFailedOutcome(sampleId: number): Promise<boolean> {
  const legacy = await getTestResultBySample(sampleId);
  for (const r of legacy) {
    if (isSpecFailure(r.complianceStatus)) return true;
    const charts = r.chartsData as { complianceStatus?: string } | null;
    if (isSpecFailure(charts?.complianceStatus)) return true;
  }

  const concreteGroups = await getConcreteGroupsBySample(sampleId);
  if (concreteGroups.some((g) => isSpecFailure(g.complianceStatus))) return true;

  const specialized = await getSpecializedTestResultsBySample(sampleId);
  if (specialized.some((r) => (r as { overallResult?: string }).overallResult === "fail")) {
    return true;
  }

  const dists = await getDistributionsBySample(sampleId);
  for (const dist of dists) {
    if (await isOrderItemSpecFailed(sampleId, { testTypeCode: dist.testType, distributionId: dist.id })) {
      return true;
    }
  }

  return false;
}

async function sampleHasOpenRetest(sampleId: number): Promise<boolean> {
  if (!samplesHasRetestColumns()) return false;
  const db = await getDb();
  if (!db) return false;
  const children = await db
    .select({ status: samples.status })
    .from(samples)
    .where(eq(samples.originalSampleId, sampleId));
  return children.some((c) =>
    ACTIVE_TESTING_SAMPLE_STATUSES.includes(
      c.status as (typeof ACTIVE_TESTING_SAMPLE_STATUSES)[number]
    )
  );
}

function rootSampleBaseFilters() {
  return [
    isNull(samples.originalSampleId),
    sql`${samples.sampleCode} NOT REGEXP '-R[0-9]+$'`,
    notInArray(samples.status, [
      ...EXCLUDED_SAMPLE_STATUSES,
      ...ACTIVE_TESTING_SAMPLE_STATUSES,
    ]),
  ];
}

function searchSampleFilter(query: string) {
  const pattern = `%${query}%`;
  return or(
    like(samples.sampleCode, pattern),
    like(samples.contractNumber, pattern),
    like(samples.contractorName, pattern)
  );
}

/** SQL pre-filter: samples with QC-signed spec failures (fast path for list). */
async function fetchRetestCandidateIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  query?: string,
  scanLimit = 40
): Promise<number[]> {
  const base = and(
    ...rootSampleBaseFilters(),
    query ? searchSampleFilter(query) : undefined
  );

  const [legacyRows, concreteRows, specRows] = await Promise.all([
    db
      .selectDistinct({ id: samples.id })
      .from(samples)
      .innerJoin(testResults, eq(testResults.sampleId, samples.id))
      .where(
        and(
          base,
          inArray(testResults.complianceStatus, ["fail", "partial"]),
          isNotNull(testResults.qcReviewedAt)
        )
      )
      .orderBy(desc(samples.updatedAt))
      .limit(scanLimit),
    db
      .selectDistinct({ id: samples.id })
      .from(samples)
      .innerJoin(concreteTestGroups, eq(concreteTestGroups.sampleId, samples.id))
      .where(
        and(
          base,
          inArray(concreteTestGroups.complianceStatus, ["fail", "partial"]),
          inArray(samples.status, [...QC_COMPLETE_SAMPLE_STATUSES])
        )
      )
      .orderBy(desc(samples.updatedAt))
      .limit(scanLimit),
    db
      .selectDistinct({ id: samples.id })
      .from(samples)
      .innerJoin(specializedTestResults, eq(specializedTestResults.sampleId, samples.id))
      .where(
        and(
          base,
          eq(specializedTestResults.overallResult, "fail"),
          isNotNull(specializedTestResults.qcReviewedAt)
        )
      )
      .orderBy(desc(samples.updatedAt))
      .limit(scanLimit),
  ]);

  const ids = new Set<number>();
  for (const row of [...legacyRows, ...concreteRows, ...specRows]) {
    ids.add(row.id);
  }
  return [...ids];
}

export async function isRetestEligibleSample(
  root: {
    id: number;
    status: string;
    originalSampleId?: number | null;
    sampleCode: string;
    deletedAt?: Date | null;
  },
  orders: { status: string }[],
  opts?: { assumeSpecFailed?: boolean }
): Promise<boolean> {
  if (!isRootSample(root)) return false;
  if (EXCLUDED_SAMPLE_STATUSES.includes(root.status as (typeof EXCLUDED_SAMPLE_STATUSES)[number])) {
    return false;
  }
  if (root.deletedAt) return false;
  if (
    ACTIVE_TESTING_SAMPLE_STATUSES.includes(
      root.status as (typeof ACTIVE_TESTING_SAMPLE_STATUSES)[number]
    )
  ) {
    return false;
  }
  if (await sampleHasOpenRetest(root.id)) return false;

  const qcComplete =
    QC_COMPLETE_SAMPLE_STATUSES.includes(
      root.status as (typeof QC_COMPLETE_SAMPLE_STATUSES)[number]
    ) || (await sampleHasQcSignOff(root.id));

  if (!qcComplete) return false;

  const orderStillOpen = orders.some((o) =>
    BLOCKING_ORDER_STATUSES.includes(o.status as (typeof BLOCKING_ORDER_STATUSES)[number])
  );
  if (orderStillOpen && !qcComplete) {
    return false;
  }

  if (opts?.assumeSpecFailed) return true;
  return sampleHasFailedOutcome(root.id);
}

export async function assertRetestEligible(
  root: {
    id: number;
    status: string;
    originalSampleId?: number | null;
    sampleCode: string;
    deletedAt?: Date | null;
  },
  orders: { status: string }[]
) {
  if (!isRootSample(root)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only root samples can be retested" });
  }
  if (EXCLUDED_SAMPLE_STATUSES.includes(root.status as (typeof EXCLUDED_SAMPLE_STATUSES)[number])) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot retest while a revision is in progress",
    });
  }
  if (
    orders.some((o) =>
      BLOCKING_ORDER_STATUSES.includes(o.status as (typeof BLOCKING_ORDER_STATUSES)[number])
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot retest while an order is still in progress on this sample",
    });
  }
  const eligible = await isRetestEligibleSample(root, orders);
  if (!eligible) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Retest requires a QC-signed sample whose test result failed specification (not supervisor/QC workflow rejection)",
    });
  }
}

async function resolveDistributionId(
  sampleId: number,
  testTypeCode: string,
  distributionId: number | null
): Promise<number | null> {
  if (distributionId) return distributionId;
  const dists = await getDistributionsBySample(sampleId);
  const match = dists.find((d) => d.testType === testTypeCode);
  return match?.id ?? dists[0]?.id ?? null;
}

async function isOrderItemSpecFailed(
  sampleId: number,
  item: { testTypeCode: string; distributionId: number | null }
): Promise<boolean> {
  const distId = await resolveDistributionId(sampleId, item.testTypeCode, item.distributionId);
  if (!distId) return false;

  const groups = await getConcreteGroupsByDistribution(distId);
  if (groups.some((g) => isSpecFailure(g.complianceStatus))) return true;

  const spec = await getSpecializedTestResultByDistribution(distId);
  if (spec && (spec as { overallResult?: string }).overallResult === "fail") return true;

  const legacy = await getTestResultByDistribution(distId);
  if (legacy) {
    if (isSpecFailure(legacy.complianceStatus)) return true;
    const charts = legacy.chartsData as { complianceStatus?: string } | null;
    if (isSpecFailure(charts?.complianceStatus)) return true;
  }

  return false;
}

export type RetestEligibleRow = {
  id: number;
  sampleCode: string;
  contractNumber: string | null;
  contractorName: string | null;
  sampleType: string;
  sector: string;
  status: string;
  receivedAt: Date | null;
  updatedAt: Date;
  retestCount: number;
};

async function enrichRetestRow(
  row: typeof samples.$inferSelect,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  assumeSpecFailed = true
): Promise<RetestEligibleRow | null> {
  const orders = await getLabOrdersBySampleId(row.id);
  if (!(await isRetestEligibleSample(row, orders, { assumeSpecFailed }))) return null;

  const retestCount = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(samples)
    .where(eq(samples.originalSampleId, row.id));

  return {
    id: row.id,
    sampleCode: row.sampleCode,
    contractNumber: row.contractNumber,
    contractorName: row.contractorName,
    sampleType: row.sampleType,
    sector: row.sector,
    status: row.status,
    receivedAt: row.receivedAt,
    updatedAt: row.updatedAt,
    retestCount: Number((retestCount[0] as { c: number })?.c ?? 0),
  };
}

/** Recent failed samples for retest, optionally filtered by search text. */
export async function listRetestEligibleSamples(opts?: {
  query?: string;
  limit?: number;
}): Promise<RetestEligibleRow[]> {
  requireRetestColumns();
  const db = await getDb();
  if (!db) return [];

  const limit = opts?.limit ?? 20;
  const q = opts?.query?.trim();

  const candidateIds = await fetchRetestCandidateIds(db, q, Math.max(limit * 3, 30));
  if (candidateIds.length === 0) return [];

  const rows = await db
    .select()
    .from(samples)
    .where(inArray(samples.id, candidateIds))
    .orderBy(desc(samples.updatedAt));

  const results: RetestEligibleRow[] = [];
  for (const row of rows) {
    if (results.length >= limit) break;
    const enriched = await enrichRetestRow(row, db, true);
    if (enriched) results.push(enriched);
  }
  return results;
}

/** @deprecated Use listRetestEligibleSamples */
export async function searchRetestEligible(query: string) {
  return listRetestEligibleSamples({ query, limit: 50 });
}

export async function getRetestSource(rootSampleId: number) {
  requireRetestColumns();
  const root = await getSampleById(rootSampleId);
  if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "Sample not found" });

  const orders = await getLabOrdersBySampleId(rootSampleId);
  await assertRetestEligible(root, orders);

  const allTestTypes = await getAllTestTypes();
  let tests: Awaited<ReturnType<typeof buildRetestTestsFromOrder>>["tests"] = [];
  let defaultPriority: "low" | "normal" | "high" | "urgent" = "normal";

  for (const order of orders) {
    const items = await getLabOrderItems(order.id);
    if (items.length === 0) continue;
    const built = await buildRetestTestsFromOrder(rootSampleId, order.id, allTestTypes);
    if (built.tests.length > 0) {
      tests = built.tests;
      defaultPriority = (order.priority as typeof defaultPriority) ?? "normal";
      break;
    }
  }

  if (tests.length === 0) {
    const built = await buildRetestTestsFromDistributions(rootSampleId, allTestTypes);
    tests = built.tests;
  }

  if (tests.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No tests found on the original sample — check lab order items or distributions",
    });
  }

  return {
    rootSampleId: root.id,
    rootSampleCode: root.sampleCode,
    header: {
      contractId: root.contractId,
      contractNumber: root.contractNumber,
      contractName: root.contractName,
      contractorName: root.contractorName,
      sampleType: root.sampleType,
      sector: root.sector,
      sectorNameAr: root.sectorNameAr,
      sectorNameEn: root.sectorNameEn,
      location: root.location,
      castingDate: root.castingDate,
      nominalCubeSize: root.nominalCubeSize,
    },
    defaultPriority,
    tests,
  };
}

async function buildRetestTestsFromOrder(
  sampleId: number,
  orderId: number,
  allTestTypes: Awaited<ReturnType<typeof getAllTestTypes>>
) {
  const items = await getLabOrderItems(orderId);
  const legacyResults = await getTestResultBySample(sampleId);
  const tests = items
    .map((item) => {
      const tt =
        allTestTypes.find((t) => t.id === item.testTypeId) ??
        resolveCatalogTestType(item.testTypeCode, allTestTypes);
      const linkedResult = item.distributionId
        ? legacyResults.find((r) => r.distributionId === item.distributionId)
        : legacyResults[0];
      const charts = linkedResult?.chartsData as { complianceStatus?: string } | null;
      const isFailed =
        isSpecFailure(linkedResult?.complianceStatus) ||
        isSpecFailure(charts?.complianceStatus);
      return {
        testTypeId: tt?.id ?? item.testTypeId,
        testTypeCode: item.testTypeCode,
        testTypeName: item.testTypeName || tt?.nameEn || item.testTypeCode,
        formTemplate: item.formTemplate ?? tt?.formTemplate ?? null,
        testSubType: item.testSubType,
        quantity: item.quantity,
        unitPrice: Number(tt?.unitPrice ?? item.unitPrice ?? 0),
        isFailed,
        sourceOrderItemId: item.id,
      };
    })
    .filter((t) => t.testTypeId > 0);
  return { tests };
}

async function buildRetestTestsFromDistributions(
  sampleId: number,
  allTestTypes: Awaited<ReturnType<typeof getAllTestTypes>>
) {
  const dists = await getDistributionsBySample(sampleId);
  const legacyResults = await getTestResultBySample(sampleId);
  const concreteGroups = await getConcreteGroupsBySample(sampleId);
  const tests = dists
    .map((dist) => {
      const tt = resolveCatalogTestType(dist.testType, allTestTypes);
      const linkedResult = legacyResults.find((r) => r.distributionId === dist.id);
      const charts = linkedResult?.chartsData as { complianceStatus?: string } | null;
      const group = concreteGroups.find((g) => g.distributionId === dist.id);
      const isFailed =
        isSpecFailure(linkedResult?.complianceStatus) ||
        isSpecFailure(charts?.complianceStatus) ||
        isSpecFailure(group?.complianceStatus);
      return {
        testTypeId: tt?.id ?? 0,
        testTypeCode: dist.testType,
        testTypeName: dist.testName ?? tt?.nameEn ?? dist.testType,
        formTemplate: tt?.formTemplate ?? null,
        testSubType: null as string | null,
        quantity: dist.quantity ?? 1,
        unitPrice: Number(tt?.unitPrice ?? dist.unitPrice ?? 0),
        isFailed,
        sourceOrderItemId: null as number | null,
      };
    })
    .filter((t) => t.testTypeId > 0);
  return { tests };
}

export async function runRetestCreate(
  ctx: ReceptionCtx,
  input: z.infer<typeof retestCreateInputSchema>
) {
  requireRetestColumns();
  requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);

  const root = await getSampleById(input.rootSampleId);
  if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "Root sample not found" });

  const orders = await getLabOrdersBySampleId(input.rootSampleId);
  await assertRetestEligible(root, orders);

  if (!input.retestReason) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Retest reason is required" });
  }
  if (!input.tests.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Select at least one test" });
  }

  const source = await getRetestSource(input.rootSampleId);
  const allowedCodes = new Set(source.tests.map((t) => t.testTypeCode));
  for (const t of input.tests) {
    if (!allowedCodes.has(t.testTypeCode)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Test ${t.testTypeCode} was not on the original order`,
      });
    }
  }

  const allTestTypes = await getAllTestTypes();
  const sampleCode = await generateRetestSampleCode(root.id, root.sampleCode);
  const retestNumber = await getNextRetestNumber(root.id);

  const sample = await createSample({
    sampleCode,
    contractId: root.contractId,
    contractNumber: root.contractNumber,
    contractName: root.contractName,
    contractorName: root.contractorName,
    sampleType: root.sampleType,
    sector: root.sector,
    sectorNameAr: root.sectorNameAr,
    sectorNameEn: root.sectorNameEn,
    quantity: input.tests.reduce((sum, t) => sum + t.quantity, 0),
    condition: input.condition,
    notes: input.notes ?? null,
    location: input.location ?? root.location,
    nominalCubeSize:
      input.tests.some((t) => t.testTypeCode === "CONC_CUBE")
        ? (input.nominalCubeSize ?? root.nominalCubeSize ?? "150mm")
        : null,
    castingDate: input.castingDate ? new Date(input.castingDate) : root.castingDate,
    receivedById: ctx.user.id,
    receivedAt: new Date(),
    status: "received",
    originalSampleId: root.id,
    retestNumber,
    retestReason: input.retestReason as RetestReason,
    retestReasonNotes: input.retestReasonNotes ?? null,
    testTypeName: (() => {
      const seen = new Set<string>();
      const names: string[] = [];
      for (const t of input.tests) {
        if (!seen.has(t.testTypeCode)) {
          seen.add(t.testTypeCode);
          names.push(t.testTypeCode);
        }
      }
      const summary = names.join(", ");
      return summary.length <= 250 ? summary : summary.slice(0, 247) + "...";
    })(),
  });

  if (!sample?.id) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Retest sample creation failed" });
  }

  const orderCode = await generateOrderCode();
  const order = await createLabOrder({
    orderCode,
    sampleId: sample.id,
    contractNumber: root.contractNumber,
    contractName: root.contractName,
    contractorName: root.contractorName,
    sampleType: root.sampleType,
    location: input.location ?? root.location,
    castingDate: input.castingDate ? new Date(input.castingDate) : root.castingDate,
    notes: input.notes ?? null,
    createdById: ctx.user.id,
    priority: input.priority,
    status: "pending",
  });

  const items = await createLabOrderItems(
    input.tests.map((t) => {
      const tt = allTestTypes.find((x) => x.id === t.testTypeId);
      const foamAge =
        t.testTypeCode === "CONC_FOAM" && t.metadata?.concreteAge != null
          ? JSON.stringify({ concreteAge: String(t.metadata.concreteAge).trim() })
          : null;
      const testSubType =
        foamAge != null
          ? foamAge
          : t.testSubType != null && t.testSubType !== "" && t.testSubType !== "__multi__"
            ? t.testSubType
            : null;
      return {
        orderId: order.id,
        testTypeId: t.testTypeId,
        testTypeCode: t.testTypeCode,
        testTypeName: t.testTypeName.length <= 250 ? t.testTypeName : t.testTypeName.slice(0, 247) + "...",
        formTemplate: t.formTemplate ?? tt?.formTemplate ?? null,
        testSubType,
        quantity: t.quantity,
        unitPrice: String(tt?.unitPrice ?? t.unitPrice ?? 0),
        status: "pending" as const,
      };
    })
  );

  await addSampleHistory({
    sampleId: sample.id,
    userId: ctx.user.id,
    action: "retest_registered",
    fromStatus: undefined,
    toStatus: "received",
    notes: `Retest R${retestNumber} from ${root.sampleCode} (${input.retestReason})`,
  });

  await notifyUsersByRole(
    "lab_manager",
    "Retest Sample Received",
    `Retest ${sampleCode} (R${retestNumber}) from ${root.sampleCode} — ${input.tests.length} test(s)`,
    sample.id,
    "action_required",
    "new_sample"
  );

  return { order, items, sample, rootSampleCode: root.sampleCode, retestNumber };
}
