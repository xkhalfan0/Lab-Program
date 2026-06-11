/**
 * Retest registration — search, source loading, and create.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { labOrders, samples } from "../drizzle/schema";
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
  getDb,
  getLabOrderItems,
  getSampleById,
  getSpecializedTestResultByDistribution,
  getTestResultByDistribution,
  notifyUsersByRole,
  samplesHasRetestColumns,
} from "./db";
import { generateRetestSampleCode } from "./utils/codeGenerator";
import { requireRole } from "./_core/requireRole";
import { labOrderReceptionCreateInputSchema } from "./routers/orders";

const ELIGIBLE_SAMPLE_STATUSES = ["qc_failed", "rejected"] as const;
const ACTIVE_ORDER_STATUSES = ["pending", "distributed", "in_progress", "completed", "reviewed"] as const;

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

export function assertRetestEligible(
  root: { status: string; originalSampleId?: number | null; sampleCode: string },
  orders: { status: string }[]
) {
  if (!isRootSample(root)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only root samples can be retested" });
  }
  if (!ELIGIBLE_SAMPLE_STATUSES.includes(root.status as (typeof ELIGIBLE_SAMPLE_STATUSES)[number])) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Retest requires a finally failed sample (qc_failed or rejected)",
    });
  }
  const active = orders.some((o) =>
    ACTIVE_ORDER_STATUSES.includes(o.status as (typeof ACTIVE_ORDER_STATUSES)[number])
  );
  if (active) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot retest while an order is still active on this sample",
    });
  }
}

async function isOrderItemFailed(item: {
  testTypeCode: string;
  distributionId: number | null;
}): Promise<boolean> {
  if (!item.distributionId) return false;
  const distId = item.distributionId;

  if (item.testTypeCode === "CONC_CUBE") {
    const groups = await getConcreteGroupsByDistribution(distId);
    if (
      groups.some(
        (g) => g.complianceStatus === "fail" || g.status === "rejected"
      )
    ) {
      return true;
    }
  }

  const spec = await getSpecializedTestResultByDistribution(distId);
  if (spec) {
    if ((spec as { overallResult?: string }).overallResult === "fail") return true;
    if (spec.status === "rejected") return true;
    return false;
  }

  const legacy = await getTestResultByDistribution(distId);
  if (legacy) {
    if (legacy.complianceStatus === "fail") return true;
    if (legacy.status === "rejected") return true;
  }

  return false;
}

export async function searchRetestEligible(query: string) {
  requireRetestColumns();
  const db = await getDb();
  if (!db || !query.trim()) return [];

  const q = `%${query.trim()}%`;
  const rows = await db
    .select()
    .from(samples)
    .where(
      and(
        isNull(samples.originalSampleId),
        sql`${samples.sampleCode} NOT REGEXP '-R[0-9]+$'`,
        or(
          like(samples.sampleCode, q),
          like(samples.contractNumber, q),
          like(samples.contractorName, q)
        )
      )
    )
    .orderBy(desc(samples.receivedAt))
    .limit(50);

  const results = [];
  for (const row of rows) {
    if (!ELIGIBLE_SAMPLE_STATUSES.includes(row.status as (typeof ELIGIBLE_SAMPLE_STATUSES)[number])) {
      continue;
    }
    const orders = await getLabOrdersBySampleId(row.id);
    if (orders.some((o) => ACTIVE_ORDER_STATUSES.includes(o.status as (typeof ACTIVE_ORDER_STATUSES)[number]))) {
      continue;
    }
    if (row.deletedAt) continue;

    const retestCount = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(samples)
      .where(eq(samples.originalSampleId, row.id));

    results.push({
      id: row.id,
      sampleCode: row.sampleCode,
      contractNumber: row.contractNumber,
      contractorName: row.contractorName,
      sampleType: row.sampleType,
      sector: row.sector,
      status: row.status,
      receivedAt: row.receivedAt,
      retestCount: Number((retestCount[0] as { c: number })?.c ?? 0),
    });
  }
  return results;
}

export async function getRetestSource(rootSampleId: number) {
  requireRetestColumns();
  const root = await getSampleById(rootSampleId);
  if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "Sample not found" });

  const orders = await getLabOrdersBySampleId(rootSampleId);
  assertRetestEligible(root, orders);

  const latestOrder = orders[0];
  if (!latestOrder) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No lab order found for this sample" });
  }

  const items = await getLabOrderItems(latestOrder.id);
  const allTestTypes = await getAllTestTypes();

  const tests = await Promise.all(
    items.map(async (item) => {
      const tt = allTestTypes.find((t) => t.id === item.testTypeId);
      const isFailed = await isOrderItemFailed(item);
      return {
        testTypeId: item.testTypeId,
        testTypeCode: item.testTypeCode,
        testTypeName: item.testTypeName,
        formTemplate: item.formTemplate ?? tt?.formTemplate ?? null,
        testSubType: item.testSubType,
        quantity: item.quantity,
        unitPrice: Number(tt?.unitPrice ?? item.unitPrice ?? 0),
        isFailed,
        sourceOrderItemId: item.id,
      };
    })
  );

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
    defaultPriority: latestOrder.priority ?? "normal",
    tests,
  };
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
  assertRetestEligible(root, orders);

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
