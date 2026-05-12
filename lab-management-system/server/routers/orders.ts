/**
 * Lab order reception: one sample + lab_orders + lab_order_items.
 * Used by tRPC `orders.create` and `orders.createBatch` (see server/routers.ts).
 * Sample rows are inserted only via Drizzle `createSample` in server/db.ts (no raw INSERT SQL).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireRole } from "../_core/requireRole";
import {
  addSampleHistory,
  createLabOrder,
  createLabOrderItems,
  createSample,
  generateOrderCode,
  generateSampleCode,
  notifyUsersByRole,
} from "../db";

export const labOrderReceptionCreateInputSchema = z.object({
  contractId: z.number().optional(),
  contractNumber: z.string().optional(),
  contractName: z.string().optional(),
  contractorName: z.string().optional(),
  sampleType: z.string(),
  location: z.string().optional(),
  castingDate: z.string().optional(),
  notes: z.string().optional(),
  sector: z.string(),
  sectorNameAr: z.string().optional(),
  sectorNameEn: z.string().optional(),
  condition: z.enum(["good", "damaged", "partial"]).default("good"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  nominalCubeSize: z.string().optional(),
  tests: z
    .array(
      z.object({
        testTypeId: z.number(),
        testTypeCode: z.string(),
        testTypeName: z.string(),
        formTemplate: z.string().optional(),
        testSubType: z.string().optional(),
        quantity: z.number().default(1),
        unitPrice: z.number().default(0),
      })
    )
    .min(1),
});

export type LabOrderReceptionCreateInput = z.infer<typeof labOrderReceptionCreateInputSchema>;

type ReceptionCtx = {
  user: { id: number; role: string; name: string | null };
  req: { ip?: string };
};

export async function runLabOrderReceptionCreate(ctx: ReceptionCtx, input: LabOrderReceptionCreateInput) {
  requireRole(ctx.user.role, ["admin", "reception", "lab_manager"]);
  const sampleCode = await generateSampleCode();
  const sample = await createSample({
    sampleCode,
    contractId: input.contractId ?? null,
    contractNumber: input.contractNumber ?? null,
    contractName: input.contractName ?? null,
    contractorName: input.contractorName ?? null,
    sampleType: input.sampleType as any,
    sector: input.sector as any,
    sectorNameAr: input.sectorNameAr ?? null,
    sectorNameEn: input.sectorNameEn ?? null,
    quantity: input.tests.reduce((sum, t) => sum + t.quantity, 0),
    condition: input.condition,
    notes: input.notes ?? null,
    location: input.location ?? null,
    nominalCubeSize:
      input.tests.some((t) => t.testTypeCode === "CONC_CUBE") ? (input.nominalCubeSize ?? "150mm") : null,
    castingDate: input.castingDate ? new Date(input.castingDate) : null,
    receivedById: ctx.user.id,
    receivedAt: new Date(),
    status: "received",
    requestedTestTypeId: null,
    testSubType: null,
    sampleSubType: null,
    testTypeName: (() => {
      const seen = new Set<string>();
      const uniqueNames: string[] = [];
      for (const t of input.tests) {
        if (!seen.has(t.testTypeCode)) {
          seen.add(t.testTypeCode);
          uniqueNames.push(t.testTypeCode);
        }
      }
      const summary = uniqueNames.join(", ");
      return summary.length <= 250 ? summary : summary.slice(0, 247) + "...";
    })(),
  });

  if (!sample?.id) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sample creation failed: no row returned after insert",
    });
  }

  const orderCode = await generateOrderCode();
  const order = await createLabOrder({
    orderCode,
    sampleId: sample.id,
    contractNumber: input.contractNumber ?? null,
    contractName: input.contractName ?? null,
    contractorName: input.contractorName ?? null,
    sampleType: input.sampleType,
    location: input.location ?? null,
    castingDate: input.castingDate ? new Date(input.castingDate) : null,
    notes: input.notes ?? null,
    createdById: ctx.user.id,
    priority: input.priority,
    status: "pending",
  });
  const items = await createLabOrderItems(
    input.tests.map((t) => ({
      orderId: order.id,
      testTypeId: t.testTypeId,
      testTypeCode: t.testTypeCode,
      testTypeName: t.testTypeName.length <= 250 ? t.testTypeName : t.testTypeName.slice(0, 247) + "...",
      formTemplate: t.formTemplate ?? null,
      testSubType: t.testSubType ?? null,
      quantity: t.quantity,
      unitPrice: String(t.unitPrice),
      status: "pending" as const,
    }))
  );
  await addSampleHistory({
    sampleId: sample.id,
    userId: ctx.user.id,
    action: "created",
    notes: `Order ${orderCode} created with ${input.tests.length} test(s)`,
  });
  await notifyUsersByRole(
    "lab_manager",
    "New Order",
    `Order ${orderCode} (${input.sampleType}) received with ${input.tests.length} test(s)`,
    sample.id,
    "info",
    "new_order"
  );
  return { order, items, sample };
}
