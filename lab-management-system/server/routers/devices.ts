import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  deviceCalibrations,
  deviceDailyChecks,
  deviceFollowUps,
  labDevices,
} from "../../drizzle/schema-lab-devices";
import { getDb, notifyUsersByRole } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireRole } from "../_core/requireRole";

const DEVICE_CATEGORIES = ["concrete", "soil", "steel", "asphalt", "aggregates", "general"] as const;
const DEVICE_STATUSES = [
  "in_service",
  "due_calibration",
  "expired",
  "under_maintenance",
  "retired",
] as const;

const DUE_SOON_DAYS = 30;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function diffDays(from: Date, to: Date): number {
  return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

export function computeEffectiveDeviceStatus(device: {
  status: string;
  nextCalibrationDueAt?: Date | null;
}): (typeof DEVICE_STATUSES)[number] {
  if (device.status === "retired") return "retired";
  if (device.status === "under_maintenance") return "under_maintenance";

  if (!device.nextCalibrationDueAt) return "in_service";

  const days = diffDays(new Date(), new Date(device.nextCalibrationDueAt));
  if (days < 0) return "expired";
  if (days <= DUE_SOON_DAYS) return "due_calibration";
  return "in_service";
}

function mapDeviceRow(row: typeof labDevices.$inferSelect) {
  const effectiveStatus = computeEffectiveDeviceStatus(row);
  const daysUntilDue = row.nextCalibrationDueAt
    ? diffDays(new Date(), new Date(row.nextCalibrationDueAt))
    : null;
  return {
    ...row,
    effectiveStatus,
    daysUntilDue,
    needsAction: effectiveStatus === "expired" || effectiveStatus === "due_calibration",
  };
}

async function syncDeviceComputedStatus(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  deviceId: number,
) {
  const rows = await db.select().from(labDevices).where(eq(labDevices.id, deviceId)).limit(1);
  const row = rows[0];
  if (!row || row.status === "retired" || row.status === "under_maintenance") return;
  const effective = computeEffectiveDeviceStatus(row);
  if (effective !== row.status) {
    await db.update(labDevices).set({ status: effective }).where(eq(labDevices.id, deviceId));
  }
}

async function notifyCalibrationAlerts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const rows = await db
    .select()
    .from(labDevices)
    .where(isNull(labDevices.deletedAt));

  const expired = rows.filter((r) => computeEffectiveDeviceStatus(r) === "expired");
  const dueSoon = rows.filter((r) => computeEffectiveDeviceStatus(r) === "due_calibration");

  if (expired.length === 0 && dueSoon.length === 0) return;

  const since = addDays(new Date(), -1);
  const recent = await db.execute(sql`
    SELECT id FROM notifications
    WHERE notificationType = 'calibration_alert'
      AND createdAt >= ${since}
    LIMIT 1
  `);
  if ((recent as unknown[]).length > 0) return;

  if (expired.length > 0) {
    const codes = expired.slice(0, 5).map((d) => d.deviceCode).join(", ");
    await notifyUsersByRole(
      "qc_inspector",
      "Device calibration expired",
      `${expired.length} device(s) have expired calibration (${codes}${expired.length > 5 ? "…" : ""}).`,
      undefined,
      "action_required",
      "calibration_alert",
    );
    await notifyUsersByRole(
      "lab_manager",
      "Device calibration expired",
      `${expired.length} device(s) require calibration before use.`,
      undefined,
      "action_required",
      "calibration_alert",
    );
  } else if (dueSoon.length > 0) {
    await notifyUsersByRole(
      "qc_inspector",
      "Device calibration due soon",
      `${dueSoon.length} device(s) are due for calibration within ${DUE_SOON_DAYS} days.`,
      undefined,
      "action_required",
      "calibration_alert",
    );
  }
}

function assertDevicesAccess(role: string) {
  requireRole(role, ["admin", "qc_inspector", "lab_manager"]);
}

function assertDevicesWrite(role: string) {
  requireRole(role, ["admin", "qc_inspector"]);
}

export const devicesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          category: z.enum(DEVICE_CATEGORIES).optional(),
          status: z.enum(DEVICE_STATUSES).optional(),
          needsAction: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertDevicesAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(labDevices)
        .where(isNull(labDevices.deletedAt))
        .orderBy(desc(labDevices.updatedAt));

      let mapped = rows.map(mapDeviceRow);
      if (input?.category) mapped = mapped.filter((r) => r.category === input.category);
      if (input?.status) mapped = mapped.filter((r) => r.effectiveStatus === input.status);
      if (input?.needsAction) mapped = mapped.filter((r) => r.needsAction);

      void notifyCalibrationAlerts(db).catch((err) => {
        console.error("[devices] calibration notification failed:", err);
      });

      return mapped;
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    assertDevicesAccess(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const rows = await db
      .select()
      .from(labDevices)
      .where(isNull(labDevices.deletedAt));

    const mapped = rows.map(mapDeviceRow);
    return {
      total: mapped.length,
      inService: mapped.filter((r) => r.effectiveStatus === "in_service").length,
      dueSoon: mapped.filter((r) => r.effectiveStatus === "due_calibration").length,
      expired: mapped.filter((r) => r.effectiveStatus === "expired").length,
      underMaintenance: mapped.filter((r) => r.effectiveStatus === "under_maintenance").length,
      retired: mapped.filter((r) => r.effectiveStatus === "retired").length,
    };
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      assertDevicesAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(labDevices)
        .where(and(eq(labDevices.id, input.id), isNull(labDevices.deletedAt)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const calibrations = await db
        .select()
        .from(deviceCalibrations)
        .where(eq(deviceCalibrations.deviceId, input.id))
        .orderBy(desc(deviceCalibrations.calibratedAt));

      return { device: mapDeviceRow(rows[0]), calibrations };
    }),

  create: protectedProcedure
    .input(
      z.object({
        deviceCode: z.string().min(1).max(64),
        nameEn: z.string().min(1).max(256),
        nameAr: z.string().max(256).optional(),
        category: z.enum(DEVICE_CATEGORIES).default("general"),
        department: z.string().max(128).optional(),
        manufacturer: z.string().max(128).optional(),
        model: z.string().max(128).optional(),
        serialNumber: z.string().max(128).optional(),
        location: z.string().max(256).optional(),
        status: z.enum(DEVICE_STATUSES).default("in_service"),
        calibrationIntervalDays: z.number().int().min(30).max(3650).default(365),
        lastCalibratedAt: z.string().optional(),
        maintenanceNotes: z.string().optional(),
        requiresDailyCheck: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const lastCalibratedAt = input.lastCalibratedAt ? new Date(input.lastCalibratedAt) : null;
      const nextCalibrationDueAt = lastCalibratedAt
        ? addDays(lastCalibratedAt, input.calibrationIntervalDays)
        : null;
      const status =
        input.status === "under_maintenance" || input.status === "retired"
          ? input.status
          : nextCalibrationDueAt
            ? computeEffectiveDeviceStatus({
                status: "in_service",
                nextCalibrationDueAt,
              })
            : input.status;

      const result = await db.insert(labDevices).values({
        deviceCode: input.deviceCode.trim(),
        nameEn: input.nameEn.trim(),
        nameAr: input.nameAr?.trim() || null,
        category: input.category,
        department: input.department?.trim() || null,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        serialNumber: input.serialNumber?.trim() || null,
        location: input.location?.trim() || null,
        status,
        calibrationIntervalDays: input.calibrationIntervalDays,
        lastCalibratedAt,
        nextCalibrationDueAt,
        maintenanceNotes: input.maintenanceNotes?.trim() || null,
        requiresDailyCheck: input.requiresDailyCheck,
      });

      return { id: Number((result as { insertId: number }).insertId) };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        deviceCode: z.string().min(1).max(64).optional(),
        nameEn: z.string().min(1).max(256).optional(),
        nameAr: z.string().max(256).optional(),
        category: z.enum(DEVICE_CATEGORIES).optional(),
        department: z.string().max(128).optional(),
        manufacturer: z.string().max(128).optional(),
        model: z.string().max(128).optional(),
        serialNumber: z.string().max(128).optional(),
        location: z.string().max(256).optional(),
        status: z.enum(DEVICE_STATUSES).optional(),
        calibrationIntervalDays: z.number().int().min(30).max(3650).optional(),
        maintenanceNotes: z.string().optional(),
        requiresDailyCheck: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...fields } = input;
      const patch: Partial<typeof labDevices.$inferInsert> = {};
      if (fields.deviceCode != null) patch.deviceCode = fields.deviceCode.trim();
      if (fields.nameEn != null) patch.nameEn = fields.nameEn.trim();
      if (fields.nameAr != null) patch.nameAr = fields.nameAr.trim() || null;
      if (fields.category != null) patch.category = fields.category;
      if (fields.department != null) patch.department = fields.department.trim() || null;
      if (fields.manufacturer != null) patch.manufacturer = fields.manufacturer.trim() || null;
      if (fields.model != null) patch.model = fields.model.trim() || null;
      if (fields.serialNumber != null) patch.serialNumber = fields.serialNumber.trim() || null;
      if (fields.location != null) patch.location = fields.location.trim() || null;
      if (fields.status != null) patch.status = fields.status;
      if (fields.calibrationIntervalDays != null) patch.calibrationIntervalDays = fields.calibrationIntervalDays;
      if (fields.maintenanceNotes != null) patch.maintenanceNotes = fields.maintenanceNotes.trim() || null;
      if (fields.requiresDailyCheck != null) patch.requiresDailyCheck = fields.requiresDailyCheck;

      await db
        .update(labDevices)
        .set(patch)
        .where(and(eq(labDevices.id, id), isNull(labDevices.deletedAt)));

      await syncDeviceComputedStatus(db, id);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(labDevices)
        .set({ deletedAt: new Date(), deletedBy: ctx.user.id })
        .where(eq(labDevices.id, input.id));
      return { success: true };
    }),

  recordCalibration: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        calibratedAt: z.string(),
        certificateRef: z.string().optional(),
        performedBy: z.string().optional(),
        result: z.enum(["pass", "fail", "adjusted"]).default("pass"),
        notes: z.string().optional(),
        calibrationIntervalDays: z.number().int().min(30).max(3650).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const deviceRows = await db
        .select()
        .from(labDevices)
        .where(and(eq(labDevices.id, input.deviceId), isNull(labDevices.deletedAt)))
        .limit(1);
      const device = deviceRows[0];
      if (!device) throw new TRPCError({ code: "NOT_FOUND" });

      const calibratedAt = new Date(input.calibratedAt);
      const intervalDays = input.calibrationIntervalDays ?? device.calibrationIntervalDays;
      const dueAt = addDays(calibratedAt, intervalDays);

      await db.insert(deviceCalibrations).values({
        deviceId: input.deviceId,
        calibratedAt,
        dueAt,
        certificateRef: input.certificateRef?.trim() || null,
        performedBy: input.performedBy?.trim() || null,
        result: input.result,
        notes: input.notes?.trim() || null,
        recordedById: ctx.user.id,
        recordedByName: ctx.user.name ?? ctx.user.username ?? null,
      });

      const newStatus = computeEffectiveDeviceStatus({
        status: "in_service",
        nextCalibrationDueAt: dueAt,
      });

      await db
        .update(labDevices)
        .set({
          lastCalibratedAt: calibratedAt,
          nextCalibrationDueAt: dueAt,
          calibrationIntervalDays: intervalDays,
          status: newStatus,
        })
        .where(eq(labDevices.id, input.deviceId));

      return { success: true, nextCalibrationDueAt: dueAt, status: newStatus };
    }),

  listFollowUps: protectedProcedure.query(async ({ ctx }) => {
    assertDevicesAccess(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return db
      .select()
      .from(deviceFollowUps)
      .orderBy(desc(deviceFollowUps.createdAt))
      .limit(50);
  }),

  createFollowUp: protectedProcedure
    .input(
      z.object({
        deviceId: z.number().optional(),
        title: z.string().min(1).max(512),
        assigneeName: z.string().max(256).optional(),
        dueDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(deviceFollowUps).values({
        deviceId: input.deviceId ?? null,
        title: input.title.trim(),
        assigneeName: input.assigneeName?.trim() || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdById: ctx.user.id,
        createdByName: ctx.user.name ?? ctx.user.username ?? null,
      });
      return { id: Number((result as { insertId: number }).insertId) };
    }),

  updateFollowUpStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "done"]) }))
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(deviceFollowUps)
        .set({ status: input.status })
        .where(eq(deviceFollowUps.id, input.id));
      return { success: true };
    }),

  dailyCheckSummary: protectedProcedure.query(async ({ ctx }) => {
    assertDevicesAccess(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const today = startOfDay(new Date());
    const todayStr = today.toISOString().slice(0, 10);

    const requiredDevices = await db
      .select({ id: labDevices.id })
      .from(labDevices)
      .where(and(isNull(labDevices.deletedAt), eq(labDevices.requiresDailyCheck, true)));

    const checksToday = await db
      .select()
      .from(deviceDailyChecks)
      .where(eq(deviceDailyChecks.checkDate, todayStr));

    return {
      requiredCount: requiredDevices.length,
      checkedCount: checksToday.length,
      checksToday,
    };
  }),

  recordDailyCheck: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertDevicesWrite(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const todayStr = startOfDay(new Date()).toISOString().slice(0, 10);
      const existing = await db
        .select({ id: deviceDailyChecks.id })
        .from(deviceDailyChecks)
        .where(
          and(
            eq(deviceDailyChecks.deviceId, input.deviceId),
            eq(deviceDailyChecks.checkDate, todayStr),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(deviceDailyChecks)
          .set({
            checkedById: ctx.user.id,
            checkedByName: ctx.user.name ?? ctx.user.username ?? null,
            notes: input.notes?.trim() || null,
          })
          .where(eq(deviceDailyChecks.id, existing[0].id));
      } else {
        await db.insert(deviceDailyChecks).values({
          deviceId: input.deviceId,
          checkDate: todayStr,
          checkedById: ctx.user.id,
          checkedByName: ctx.user.name ?? ctx.user.username ?? null,
          notes: input.notes?.trim() || null,
        });
      }
      return { success: true };
    }),
});
