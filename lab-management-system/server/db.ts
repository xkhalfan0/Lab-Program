import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { alias } from "drizzle-orm/mysql-core";
import { createPool } from "mysql2";
import {
  InsertUser,
  attachments,
  certificates,
  concreteCubes,
  concreteTestGroups,
  distributions,
  notifications,
  reviews,
  sampleHistory,
  samples,
  testResults,
  users,
  testTypes,
  contractors,
  contracts,
  specializedTestResults,
  clearanceRequests,
  sectorAccounts,
  type InsertConcreteTestGroup,
  type InsertConcreteCube,
  type InsertClearanceRequest,
  type InsertSample,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/** After first DB connect: whether `samples.deletedAt` exists (Phase 1 adds it). */
let _samplesSoftDeleteColumnsExist: boolean | null = null;

function samplesHasSoftDeleteColumns(): boolean {
  return _samplesSoftDeleteColumnsExist === true;
}

async function initSamplesSoftDeleteColumnFlag(db: ReturnType<typeof drizzle>) {
  if (_samplesSoftDeleteColumnsExist !== null) return;
  try {
    // Parameterized string literals (TABLE_NAME / COLUMN_NAME are string values in information_schema).
    const raw = await db.execute(
      sql`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${"samples"} AND COLUMN_NAME = ${"deletedAt"}`
    );
    const rows = (raw as unknown as [Array<{ c?: number | bigint }>, unknown])[0];
    _samplesSoftDeleteColumnsExist = Number(rows?.[0]?.c ?? 0) > 0;
    if (!_samplesSoftDeleteColumnsExist) {
      console.warn(
        "[Database] samples.deletedAt not found — soft-delete filters are disabled until db:migration:phase1 completes."
      );
    }
  } catch (e) {
    console.warn("[Database] Could not probe samples.deletedAt; soft-delete filters disabled.", e);
    _samplesSoftDeleteColumnsExist = false;
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Parse the connection URL for mysql2
      const dbUrl = new URL(process.env.DATABASE_URL);
      const pool = createPool({
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port || "3306"),
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1), // Remove leading '/'
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
      _db = drizzle(pool);
      await initSamplesSoftDeleteColumnFlag(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserRole(
  id: number,
  role: typeof users.$inferSelect.role,
  specialty?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ role, specialty: specialty ?? null, updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function createInternalUser(data: {
  name: string;
  username: string;
  passwordHash: string;
  role: typeof users.$inferSelect.role;
  specialty?: string;
  /** Route keys → false | "view" | "edit" (JSON in DB) */
  permissions?: Record<string, false | "view" | "edit">;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // openId is required by schema - use username as unique identifier
  const openId = `local:${data.username}`;
  await db.insert(users).values({
    openId,
    name: data.name,
    username: data.username,
    passwordHash: data.passwordHash,
    role: data.role,
    specialty: data.specialty ?? null,
    permissions: data.permissions ?? null,
    loginMethod: "local",
    isActive: true,
    lastSignedIn: new Date(),
  });
  const result = await db.select().from(users).where(eq(users.username, data.username)).limit(1);
  return result[0];
}

export async function updateInternalUser(id: number, data: {
  name?: string;
  username?: string;
  passwordHash?: string;
  role?: typeof users.$inferSelect.role;
  specialty?: string | null;
  permissions?: Record<string, false | "view" | "edit"> | null;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateSet.name = data.name;
  if (data.username !== undefined) updateSet.username = data.username;
  if (data.passwordHash !== undefined) updateSet.passwordHash = data.passwordHash;
  if (data.role !== undefined) updateSet.role = data.role;
  if (data.specialty !== undefined) updateSet.specialty = data.specialty;
  if (data.permissions !== undefined) updateSet.permissions = data.permissions;
  if (data.isActive !== undefined) updateSet.isActive = data.isActive;
  await db.update(users).set(updateSet).where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, id));
}

export async function updateUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function getTechnicians() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.role, "technician"));
}

// ─── Sample ID Generation ─────────────────────────────────────────────────────
export async function generateSampleCode(): Promise<string> {
  const db = await getDb();
  if (!db) return `LAB-${new Date().getFullYear()}-0001`;
  const year = new Date().getFullYear();
  const pattern = `^LAB-${year}-[0-9]{1,8}$`;
  // Only consider well-formed LAB-YYYY-NNNN codes so a bad historical row cannot blow the MAX suffix.
  const result = await db
    .select({
      maxSuffix: sql<number>`COALESCE(MAX(CAST(SUBSTRING_INDEX(${samples.sampleCode}, '-', -1) AS UNSIGNED)), 0)`,
    })
    .from(samples)
    .where(
      and(sql`${samples.sampleCode} REGEXP ${pattern}`, sql`${samples.sampleCode} LIKE ${`LAB-${year}-%`}`)
    );
  const next = (result[0]?.maxSuffix ?? 0) + 1;
  return `LAB-${year}-${String(next).padStart(4, "0")}`;
}

export async function generateDistributionCode(): Promise<string> {
  const db = await getDb();
  if (!db) return `DIST-${new Date().getFullYear()}-001`;
  const year = new Date().getFullYear();
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(distributions)
    .where(sql`YEAR(createdAt) = ${year}`);
  const count = (result[0]?.count ?? 0) + 1;
  return `DIST-${year}-${String(count).padStart(3, "0")}`;
}

export async function generateCertificateCode(): Promise<string> {
  const db = await getDb();
  if (!db) return `CERT-${new Date().getFullYear()}-001`;
  const year = new Date().getFullYear();
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(certificates)
    .where(sql`YEAR(createdAt) = ${year}`);
  const count = (result[0]?.count ?? 0) + 1;
  return `CERT-${year}-${String(count).padStart(3, "0")}`;
}

// ─── Samples ──────────────────────────────────────────────────────────────────

/** SELECT shape without soft-delete columns (DB may not have migrated yet). */
const SAMPLE_ROW_BASE = {
  id: samples.id,
  sampleCode: samples.sampleCode,
  contractId: samples.contractId,
  contractNumber: samples.contractNumber,
  contractName: samples.contractName,
  contractorName: samples.contractorName,
  sampleType: samples.sampleType,
  sector: samples.sector,
  sectorNameAr: samples.sectorNameAr,
  sectorNameEn: samples.sectorNameEn,
  quantity: samples.quantity,
  condition: samples.condition,
  notes: samples.notes,
  status: samples.status,
  requestedTestTypeId: samples.requestedTestTypeId,
  testSubType: samples.testSubType,
  sampleSubType: samples.sampleSubType,
  testTypeName: samples.testTypeName,
  batchId: samples.batchId,
  location: samples.location,
  nominalCubeSize: samples.nominalCubeSize,
  castingDate: samples.castingDate,
  receivedById: samples.receivedById,
  receivedAt: samples.receivedAt,
  managerReadAt: samples.managerReadAt,
  createdAt: samples.createdAt,
  updatedAt: samples.updatedAt,
} as const;

function sampleRowSelect() {
  if (samplesHasSoftDeleteColumns()) {
    return {
      ...SAMPLE_ROW_BASE,
      deletedAt: samples.deletedAt,
      deletedBy: samples.deletedBy,
      deletionReason: samples.deletionReason,
      deletionCategory: samples.deletionCategory,
    };
  }
  return SAMPLE_ROW_BASE;
}

export async function createSample(data: InsertSample) {
  console.log("[createSample] Called with sampleCode:", data.sampleCode);
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Explicit column list only — never pass soft-delete / audit columns so Drizzle
  // cannot emit them in INSERT (avoids placeholder/param mismatch vs. DB).
  const insertValues = {
    sampleCode: data.sampleCode,
    contractId: data.contractId ?? null,
    contractNumber: data.contractNumber ?? null,
    contractName: data.contractName ?? null,
    contractorName: data.contractorName ?? null,
    sampleType: data.sampleType,
    sector: data.sector,
    sectorNameAr: data.sectorNameAr ?? null,
    sectorNameEn: data.sectorNameEn ?? null,
    quantity: data.quantity,
    condition: data.condition,
    notes: data.notes ?? null,
    status: data.status,
    requestedTestTypeId: data.requestedTestTypeId ?? null,
    testSubType: data.testSubType ?? null,
    sampleSubType: data.sampleSubType ?? null,
    testTypeName: data.testTypeName ?? null,
    batchId: data.batchId ?? null,
    location: data.location ?? null,
    nominalCubeSize: data.nominalCubeSize ?? null,
    castingDate: data.castingDate ?? null,
    receivedById: data.receivedById,
    receivedAt: data.receivedAt,
    managerReadAt: data.managerReadAt ?? null,
  };
  console.log("[createSample] Inserting with these fields:", Object.keys(insertValues));

  try {
    await db.insert(samples).values({
      ...insertValues,
      id: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletionReason: undefined,
      deletionCategory: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    } as any);
    console.log("[createSample] Insert completed");
  } catch (error) {
    console.error("[createSample] Insert FAILED:", error);
    throw error;
  }

  const result = await db
    .select(sampleRowSelect())
    .from(samples)
    .where(eq(samples.sampleCode, data.sampleCode))
    .limit(1);
  return result[0];
}

export async function getAllSamples(options?: { includeDeleted?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const soft = samplesHasSoftDeleteColumns();
  const rowShape = {
    id: samples.id,
    sampleCode: samples.sampleCode,
    contractId: samples.contractId,
    contractNumber: samples.contractNumber,
    contractName: samples.contractName,
    contractorName: samples.contractorName,
    sampleType: samples.sampleType,
    sector: samples.sector,
    quantity: samples.quantity,
    condition: samples.condition,
    notes: samples.notes,
    status: samples.status,
    requestedTestTypeId: samples.requestedTestTypeId,
    testSubType: samples.testSubType,
    sampleSubType: samples.sampleSubType,
    testTypeName: samples.testTypeName,
    batchId: samples.batchId,
    location: samples.location,
    nominalCubeSize: samples.nominalCubeSize,
    castingDate: samples.castingDate,
    receivedById: samples.receivedById,
    receivedByName: users.name,
    receivedAt: samples.receivedAt,
    managerReadAt: samples.managerReadAt,
    createdAt: samples.createdAt,
    updatedAt: samples.updatedAt,
    ...(soft
      ? {
          deletedAt: samples.deletedAt,
          deletedBy: samples.deletedBy,
          deletionReason: samples.deletionReason,
          deletionCategory: samples.deletionCategory,
        }
      : {}),
  };
  const baseQuery = db.select(rowShape).from(samples).leftJoin(users, eq(samples.receivedById, users.id));
  const filtered = soft && !options?.includeDeleted ? baseQuery.where(isNull(samples.deletedAt)) : baseQuery;
  return filtered.orderBy(desc(samples.createdAt));
}

/**
 * Full sample row for the sample detail API (includes soft-deleted rows).
 * Adds `receivedByName`, `deletedByName`, and `deletedByEmail` via user joins.
 */
export async function getSampleDetailRow(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const receiver = alias(users, "sample_detail_receiver");

  if (!samplesHasSoftDeleteColumns()) {
    const rows = await db
      .select({
        ...sampleRowSelect(),
        receivedByName: receiver.name,
      })
      .from(samples)
      .leftJoin(receiver, eq(samples.receivedById, receiver.id))
      .where(eq(samples.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    const { receivedByName, ...rest } = row;
    return {
      ...rest,
      receivedByName: receivedByName?.trim() ?? null,
      deletedByName: null as string | null,
      deletedByEmail: null as string | null,
    };
  }

  const deleter = alias(users, "sample_detail_deleter");
  const rows = await db
    .select({
      ...sampleRowSelect(),
      receivedByName: receiver.name,
      deleterName: deleter.name,
      deleterUsername: deleter.username,
      deleterEmail: deleter.email,
    })
    .from(samples)
    .leftJoin(receiver, eq(samples.receivedById, receiver.id))
    .leftJoin(deleter, eq(samples.deletedBy, deleter.id))
    .where(eq(samples.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;

  const { receivedByName, deleterName, deleterUsername, deleterEmail, ...rest } = row;
  const deletedByName = deleterName?.trim() || deleterUsername?.trim() || null;

  return {
    ...rest,
    receivedByName: receivedByName?.trim() ?? null,
    deletedByName,
    deletedByEmail: deleterEmail ?? null,
  };
}

/**
 * Admin deletion audit list (`DeletionLog` / `samples.deletionAuditLog`).
 * Rows have `deletedAt` set; joins `users` for who performed the soft-delete.
 * Requires soft-delete columns on `samples` (incl. `deletionReason` / `deletionCategory` after migration 0033).
 */
export async function listDeletedSamplesAudit() {
  const db = await getDb();
  if (!db) return [];
  if (!samplesHasSoftDeleteColumns()) return [];
  return db
    .select({
      id: samples.id,
      sampleCode: samples.sampleCode,
      contractNumber: samples.contractNumber,
      contractName: samples.contractName,
      contractorName: samples.contractorName,
      deletedAt: samples.deletedAt,
      deletionReason: samples.deletionReason,
      deletionCategory: samples.deletionCategory,
      deletedBy: samples.deletedBy,
      deletedByUserName: users.name,
      deletedByUserEmail: users.email,
      deletedByUsername: users.username,
    })
    .from(samples)
    .leftJoin(users, eq(samples.deletedBy, users.id))
    .where(isNotNull(samples.deletedAt))
    .orderBy(desc(samples.deletedAt));
}

export async function getSampleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select(sampleRowSelect())
    .from(samples)
    .where(
      samplesHasSoftDeleteColumns()
        ? and(eq(samples.id, id), isNull(samples.deletedAt))
        : eq(samples.id, id)
    )
    .limit(1);
  return result[0];
}

export async function getSampleByIdIncludingDeleted(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select(sampleRowSelect())
    .from(samples)
    .where(eq(samples.id, id))
    .limit(1);
  return result[0];
}

export async function getSamplesByBatch(batchId: string) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = samplesHasSoftDeleteColumns()
    ? and(eq(samples.batchId, batchId), isNull(samples.deletedAt))
    : eq(samples.batchId, batchId);
  return db.select(sampleRowSelect()).from(samples).where(whereClause).orderBy(samples.id);
}

export async function getSamplesByStatus(status: typeof samples.$inferSelect.status) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = samplesHasSoftDeleteColumns()
    ? and(eq(samples.status, status), isNull(samples.deletedAt))
    : eq(samples.status, status);
  return db.select(sampleRowSelect()).from(samples).where(whereClause).orderBy(desc(samples.createdAt));
}

export async function updateSampleStatus(
  id: number,
  status: typeof samples.$inferSelect.status
) {
  const db = await getDb();
  if (!db) return;
  await db.update(samples).set({ status, updatedAt: new Date() }).where(eq(samples.id, id));
}

export async function updateSampleFields(
  id: number,
  data: {
    sector?: string;
    sectorNameAr?: string;
    sectorNameEn?: string;
    sampleType?: string;
    sampleSubType?: string;
    testTypeName?: string;
    quantity?: number;
    condition?: string;
    notes?: string;
    requestedTestTypeId?: number;
  }
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.sector !== undefined) updateData.sector = data.sector;
  if (data.sectorNameAr !== undefined) updateData.sectorNameAr = data.sectorNameAr;
  if (data.sectorNameEn !== undefined) updateData.sectorNameEn = data.sectorNameEn;
  if (data.sampleType !== undefined) updateData.sampleType = data.sampleType;
  if (data.sampleSubType !== undefined) updateData.sampleSubType = data.sampleSubType;
  if (data.testTypeName !== undefined) updateData.testTypeName = data.testTypeName;
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.condition !== undefined) updateData.condition = data.condition;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.requestedTestTypeId !== undefined) updateData.requestedTestTypeId = data.requestedTestTypeId;
  await db.update(samples).set(updateData).where(eq(samples.id, id));
}

export async function softDeleteSample(
  id: number,
  userId: number,
  opts?: { deletionReason?: string | null; deletionCategory?: string | null }
) {
  const db = await getDb();
  if (!db) return;
  if (!samplesHasSoftDeleteColumns()) {
    console.warn("[db] softDeleteSample skipped: samples.deletedAt column missing (run db:migration:phase1).");
    return;
  }
  const now = new Date();
  const patch: Record<string, unknown> = {
    deletedAt: now,
    deletedBy: userId,
    updatedAt: now,
  };
  if (opts?.deletionReason !== undefined) patch.deletionReason = opts.deletionReason;
  if (opts?.deletionCategory !== undefined) patch.deletionCategory = opts.deletionCategory;

  await db
    .update(samples)
    .set(patch as any)
    .where(and(eq(samples.id, id), isNull(samples.deletedAt)));

  await db
    .update(distributions)
    .set({ deletedAt: now, deletedBy: userId, updatedAt: now })
    .where(and(eq(distributions.sampleId, id), isNull(distributions.deletedAt)));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  const activeFilter = samplesHasSoftDeleteColumns() ? isNull(samples.deletedAt) : sql`TRUE`;
  const total = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(samples)
    .where(activeFilter);
  const byStatus = await db
    .select({ status: samples.status, count: sql<number>`COUNT(*)` })
    .from(samples)
    .where(activeFilter)
    .groupBy(samples.status);
  const byType = await db
    .select({ sampleType: samples.sampleType, count: sql<number>`COUNT(*)` })
    .from(samples)
    .where(activeFilter)
    .groupBy(samples.sampleType);
  return {
    total: total[0]?.count ?? 0,
    byStatus,
    byType,
  };
}

// --- Daily Work ---
export async function getDailyWork(fromDate: Date, toDate: Date) {
  const db = await getDb();
  if (!db) return { samples: [], summary: { received: 0, distributed: 0, processed: 0, approved: 0, total: 0 } };

  // Set toDate to end of day
  const endOfDay = new Date(toDate);
  endOfDay.setHours(23, 59, 59, 999);

  const rangeConds = [gte(samples.receivedAt, fromDate), lte(samples.receivedAt, endOfDay)] as const;
  const dailyWhere = samplesHasSoftDeleteColumns()
    ? and(isNull(samples.deletedAt), ...rangeConds)
    : and(...rangeConds);
  const result = await db
    .select(sampleRowSelect())
    .from(samples)
    .where(dailyWhere)
    .orderBy(desc(samples.receivedAt));

  const summary = {
    received: result.length,
    distributed: result.filter(s => ["distributed", "testing", "processing", "processed", "manager_review", "qc_review", "qc_passed", "clearance_issued"].includes(s.status)).length,
    processed: result.filter(s => ["processed", "manager_review", "qc_review", "qc_passed", "clearance_issued"].includes(s.status)).length,
    approved: result.filter(s => ["qc_passed", "clearance_issued"].includes(s.status)).length,
    total: result.length,
  };

  return { samples: result, summary };
}

// ─── Distributions ───────────────────────────────────────────────────────────────────────────────────────
export async function createDistribution(data: typeof distributions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(distributions).values(data);
  const result = await db
    .select()
    .from(distributions)
    .where(eq(distributions.distributionCode, data.distributionCode))
    .limit(1);
  return result[0];
}

export async function getDistributionsBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: distributions.id,
      distributionCode: distributions.distributionCode,
      sampleId: distributions.sampleId,
      assignedTechnicianId: distributions.assignedTechnicianId,
      assignedById: distributions.assignedById,
      testType: distributions.testType,
      testName: distributions.testName,
      testNameAr: testTypes.nameAr,
      testNameEn: testTypes.nameEn,
      minAcceptable: distributions.minAcceptable,
      maxAcceptable: distributions.maxAcceptable,
      unit: distributions.unit,
      priority: distributions.priority,
      quantity: distributions.quantity,
      unitPrice: distributions.unitPrice,
      totalCost: distributions.totalCost,
      originalTestType: distributions.originalTestType,
      testTypeChangedNote: distributions.testTypeChangedNote,
      expectedCompletionDate: distributions.expectedCompletionDate,
      notes: distributions.notes,
      status: distributions.status,
      createdAt: distributions.createdAt,
      updatedAt: distributions.updatedAt,
      receivedAt: distributions.createdAt, // alias for compatibility
    })
    .from(distributions)
    .leftJoin(testTypes, eq(distributions.testType, testTypes.code))
    .where(and(eq(distributions.sampleId, sampleId), isNull(distributions.deletedAt)));
}

export async function getDistributionsByTechnician(technicianId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: distributions.id,
      distributionCode: distributions.distributionCode,
      sampleId: distributions.sampleId,
      assignedTechnicianId: distributions.assignedTechnicianId,
      testType: distributions.testType,
      testName: distributions.testName,
      testNameAr: testTypes.nameAr,
      testNameEn: testTypes.nameEn,
      minAcceptable: distributions.minAcceptable,
      maxAcceptable: distributions.maxAcceptable,
      unit: distributions.unit,
      priority: distributions.priority,
      expectedCompletionDate: distributions.expectedCompletionDate,
      notes: distributions.notes,
      taskReadAt: distributions.taskReadAt,
      status: distributions.status,
      createdAt: distributions.createdAt,
      updatedAt: distributions.updatedAt,
      batchDistributionId: distributions.batchDistributionId,
      // Sample fields for auto-populating readings count
      sampleCode: samples.sampleCode,
      sampleQuantity: samples.quantity,
      sampleSubType: samples.sampleSubType,
    })
    .from(distributions)
    .leftJoin(testTypes, eq(distributions.testType, testTypes.code))
    .leftJoin(samples, eq(distributions.sampleId, samples.id))
    .where(
      and(
        eq(distributions.assignedTechnicianId, technicianId),
        inArray(distributions.status, ["pending", "in_progress", "completed"]),
        isNull(distributions.deletedAt)
      )
    )
    .orderBy(desc(distributions.createdAt));
  return rows;
}

export async function getDistributionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      // Distribution fields
      id: distributions.id,
      distributionCode: distributions.distributionCode,
      sampleId: distributions.sampleId,
      assignedTechnicianId: distributions.assignedTechnicianId,
      assignedById: distributions.assignedById,
      testType: distributions.testType,
      testName: distributions.testName,
      minAcceptable: distributions.minAcceptable,
      maxAcceptable: distributions.maxAcceptable,
      unit: distributions.unit,
      priority: distributions.priority,
      testSubType: distributions.testSubType,
      quantity: distributions.quantity,
      unitPrice: distributions.unitPrice,
      totalCost: distributions.totalCost,
      expectedCompletionDate: distributions.expectedCompletionDate,
      notes: distributions.notes,
      taskReadAt: distributions.taskReadAt,
      status: distributions.status,
      createdAt: distributions.createdAt,
      updatedAt: distributions.updatedAt,
      batchDistributionId: distributions.batchDistributionId,
      // Sample fields
      sampleCode: samples.sampleCode,
      contractNumber: samples.contractNumber,
      contractName: samples.contractName,
      contractorName: samples.contractorName,
      sampleType: samples.sampleType,
      sector: samples.sector,
      receivedAt: samples.receivedAt,
      sampleLocation: samples.location,
      castingDate: samples.castingDate,
      nominalCubeSize: samples.nominalCubeSize,
      // Test type names
      testNameAr: testTypes.nameAr,
      testNameEn: testTypes.nameEn,
    })
    .from(distributions)
    .leftJoin(samples, eq(distributions.sampleId, samples.id))
    .leftJoin(testTypes, eq(distributions.testType, testTypes.code))
    .where(and(eq(distributions.id, id), isNull(distributions.deletedAt)))
    .limit(1);
  return result[0];
}

export async function getDistributionsByBatch(batchDistributionId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: distributions.id,
      distributionCode: distributions.distributionCode,
      sampleId: distributions.sampleId,
      testType: distributions.testType,
      testName: distributions.testName,
      testSubType: distributions.testSubType,
      quantity: distributions.quantity,
      status: distributions.status,
      batchDistributionId: distributions.batchDistributionId,
      sampleCode: samples.sampleCode,
      sampleSubType: samples.sampleSubType,
      sampleType: samples.sampleType,
      contractNumber: samples.contractNumber,
      contractName: samples.contractName,
      contractorName: samples.contractorName,
      sector: samples.sector,
    })
    .from(distributions)
    .leftJoin(samples, eq(distributions.sampleId, samples.id))
    .where(and(eq(distributions.batchDistributionId, batchDistributionId), isNull(distributions.deletedAt)))
    .orderBy(distributions.id);
}

export async function updateDistributionStatus(
  id: number,
  status: typeof distributions.$inferSelect.status
) {
  const db = await getDb();
  if (!db) return;
  await db.update(distributions).set({ status, updatedAt: new Date() }).where(eq(distributions.id, id));
}

export async function reassignDistribution(id: number, newTechnicianId: number, notes?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(distributions).set({
    assignedTechnicianId: newTechnicianId,
    status: "pending",
    notes: notes ?? undefined,
    updatedAt: new Date(),
  }).where(eq(distributions.id, id));
}

export async function markDistributionTaskRead(id: number) {
  const db = await getDb();
  if (!db) return;
  // Only set taskReadAt if not already set (first open)
  const existing = await db.select({ taskReadAt: distributions.taskReadAt }).from(distributions).where(eq(distributions.id, id)).limit(1);
  if (existing[0] && !existing[0].taskReadAt) {
    await db.update(distributions).set({ taskReadAt: new Date(), updatedAt: new Date() }).where(eq(distributions.id, id));
  }
}

// ─── Test Results ─────────────────────────────────────────────────────────────
export async function createTestResult(data: typeof testResults.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(testResults).values(data);
  const result = await db
    .select()
    .from(testResults)
    .where(eq(testResults.distributionId, data.distributionId))
    .orderBy(desc(testResults.createdAt))
    .limit(1);
  return result[0];
}

export async function getTestResultById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(testResults).where(eq(testResults.id, id)).limit(1);
  return result[0];
}

export async function getTestResultBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(testResults)
    .where(eq(testResults.sampleId, sampleId))
    .orderBy(desc(testResults.createdAt));
}
export async function getTestResultByDistribution(distributionId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(testResults)
    .where(eq(testResults.distributionId, distributionId))
    .orderBy(desc(testResults.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function updateTestResult(
  id: number,
  data: Partial<typeof testResults.$inferInsert>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(testResults).set({ ...data, updatedAt: new Date() }).where(eq(testResults.id, id));
}

// ─── Reviews ──────────────────────────────────────────────────────────────────
export async function createReview(data: typeof reviews.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(reviews).values(data);
  const result = await db
    .select()
    .from(reviews)
    .where(eq(reviews.sampleId, data.sampleId))
    .orderBy(desc(reviews.createdAt))
    .limit(1);
  return result[0];
}

export async function getReviewsBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.sampleId, sampleId))
    .orderBy(desc(reviews.createdAt));
}

// ─── Attachments ──────────────────────────────────────────────────────────────
export async function createAttachment(data: typeof attachments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(attachments).values(data);
  const result = await db
    .select()
    .from(attachments)
    .where(eq(attachments.sampleId, data.sampleId))
    .orderBy(desc(attachments.createdAt))
    .limit(1);
  return result[0];
}

export async function getAttachmentsBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.sampleId, sampleId))
    .orderBy(desc(attachments.createdAt));
}

// ─── Certificates ─────────────────────────────────────────────────────────────
export async function createCertificate(data: typeof certificates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(certificates).values(data);
  const result = await db
    .select()
    .from(certificates)
    .where(eq(certificates.sampleId, data.sampleId))
    .orderBy(desc(certificates.createdAt))
    .limit(1);
  return result[0];
}

export async function getCertificateBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(certificates)
    .where(eq(certificates.sampleId, sampleId))
    .limit(1);
  return result[0];
}

export async function getCertificateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: certificates.id,
      certificateCode: certificates.certificateCode,
      sampleId: certificates.sampleId,
      contractorName: certificates.contractorName,
      projectNumber: certificates.projectNumber,
      projectName: certificates.projectName,
      testsCompleted: certificates.testsCompleted,
      finalResults: certificates.finalResults,
      notes: certificates.notes,
      issuedAt: certificates.issuedAt,
      sampleCode: samples.sampleCode,
      contractNumber: samples.contractNumber,
      contractName: samples.contractName,
      sampleType: samples.sampleType,
      sector: samples.sector,
    })
    .from(certificates)
    .innerJoin(samples, eq(samples.id, certificates.sampleId))
    .where(eq(certificates.id, id))
    .limit(1);
  return result[0];
}

export async function getAllCertificates() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: certificates.id,
      certificateCode: certificates.certificateCode,
      sampleId: certificates.sampleId,
      contractorName: certificates.contractorName,
      projectNumber: certificates.projectNumber,
      issuedAt: certificates.issuedAt,
      sampleCode: samples.sampleCode,
    })
    .from(certificates)
    .innerJoin(samples, eq(samples.id, certificates.sampleId))
    .orderBy(certificates.issuedAt);
}

export async function updateCertificate(id: number, data: Partial<typeof certificates.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(certificates).set(data).where(eq(certificates.id, id));
}

// ─── Notifications ────────────────────────────────────────────────────────────
export async function createNotification(data: typeof notifications.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(notifications).values(data);
  // Broadcast via SSE to the relevant user/sector
  try {
    const { broadcastToUser, broadcastToSector, broadcastToRole } = await import("./sse");
    const payload = { ...data, id: (result as any).insertId, createdAt: data.createdAt ?? new Date() };
    if (data.userId && data.userId > 0) {
      broadcastToUser(data.userId, payload);
    } else if (data.sectorId) {
      broadcastToSector(data.sectorId, payload);
    } else if (data.targetRole) {
      broadcastToRole(data.targetRole, payload);
    }
  } catch (_e) { /* non-critical */ }
}

export async function getNotificationsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── Sample History ───────────────────────────────────────────────────────────
export async function addSampleHistory(data: typeof sampleHistory.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sampleHistory).values(data);
}

export async function getSampleHistory(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sampleHistory)
    .where(eq(sampleHistory.sampleId, sampleId))
    .orderBy(desc(sampleHistory.createdAt));
}

// ─── Concrete Test Groups & Cubes ────────────────────────────────────────────────
export async function getConcreteGroupsByDistribution(distributionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(concreteTestGroups)
    .where(eq(concreteTestGroups.distributionId, distributionId))
    .orderBy(concreteTestGroups.testAge);
}

export async function getConcreteGroupById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(concreteTestGroups).where(eq(concreteTestGroups.id, id)).limit(1);
  return result[0];
}

export async function getCubesByGroup(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(concreteCubes)
    .where(eq(concreteCubes.groupId, groupId))
    .orderBy(concreteCubes.markNo);
}

export async function createConcreteGroup(data: InsertConcreteTestGroup) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.insert(concreteTestGroups).values(data);
  const result = await db.select().from(concreteTestGroups)
    .where(eq(concreteTestGroups.distributionId, data.distributionId))
    .orderBy(desc(concreteTestGroups.createdAt)).limit(1);
  return result[0];
}

export async function upsertConcreteCube(data: InsertConcreteCube & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  if (data.id) {
    await db.update(concreteCubes).set(data).where(eq(concreteCubes.id, data.id));
    const r = await db.select().from(concreteCubes).where(eq(concreteCubes.id, data.id)).limit(1);
    return r[0];
  } else {
    await db.insert(concreteCubes).values(data);
    const r = await db.select().from(concreteCubes)
      .where(eq(concreteCubes.groupId, data.groupId))
      .orderBy(desc(concreteCubes.createdAt)).limit(1);
    return r[0];
  }
}

export async function deleteConcreteCube(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(concreteCubes).where(eq(concreteCubes.id, id));
}

export async function updateConcreteGroupSummary(groupId: number, data: {
  avgCompressiveStrength?: string;
  complianceStatus?: 'pass' | 'fail' | 'partial';
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  submittedAt?: Date;
  comments?: string;
  testedBy?: string;
  sourceSupplier?: string;
  batchDateTime?: string;
  slump?: string;
  classOfConcrete?: string;
  maxAggSize?: string;
  region?: string;
  consultant?: string;
  cscRef?: string;
  placeOfSampling?: string;
  location?: string;
  minAcceptable?: string;
  maxAcceptable?: string;
  dateSampled?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(concreteTestGroups).set({ ...data, updatedAt: new Date() }).where(eq(concreteTestGroups.id, groupId));
}

export async function getConcreteGroupsBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(concreteTestGroups)
    .where(eq(concreteTestGroups.sampleId, sampleId))
    .orderBy(concreteTestGroups.testAge);
}

// ─── Notify relevant users by role ────────────────────────────────────────────────
export async function notifyUsersByRole(
  role: typeof users.$inferSelect.role,
  title: string,
  message: string,
  sampleId?: number,
  type: typeof notifications.$inferSelect.type = "info",
  notificationType?: string
) {
  const db = await getDb();
  if (!db) return;
  const targetUsers = await db.select().from(users).where(eq(users.role, role));
  for (const user of targetUsers) {
    await createNotification({ userId: user.id, sampleId, title, message, type, targetRole: role, notificationType });
  }
}

// ─── Get sector account ID from sector key ─────────────────────────────────
export async function getSectorIdByKey(sectorKey: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: sectorAccounts.id })
    .from(sectorAccounts)
    .where(eq(sectorAccounts.sectorKey, sectorKey as any))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ─── Notify sector users ────────────────────────────────────────────────────────
export async function notifySector(
  sectorId: number,
  title: string,
  message: string,
  sampleId?: number,
  notificationType?: string
) {
  const db = await getDb();
  if (!db) return;
  // Insert a notification row with sectorId (userId=0 means sector notification)
  await createNotification({
    userId: 0,
    sampleId,
    title,
    message,
    type: "info",
    sectorId,
    notificationType,
  });
}

// ─── Get notifications for a sector ────────────────────────────────────────────
export async function getSectorNotifications(sectorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.sectorId, sectorId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function markSectorNotificationRead(id: number, sectorId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.sectorId, sectorId)));
}

export async function markAllSectorNotificationsRead(sectorId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.sectorId, sectorId));
}

// ─── Test Types ────────────────────────────────────────────────────────────────
/** Full catalog (including inactive). Use for admin UI, pricing lookups, and reports. Reception uses getTestTypesByCategory or filters isActive client-side. */
export async function getAllTestTypes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(testTypes).orderBy(testTypes.sortOrder);
}

export async function getTestTypesByCategory(category: typeof testTypes.$inferSelect.category) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(testTypes)
    .where(and(eq(testTypes.category, category), eq(testTypes.isActive, true)))
    .orderBy(testTypes.sortOrder);
}

export async function getTestTypeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(testTypes).where(eq(testTypes.id, id)).limit(1);
  return result[0];
}

export async function createTestType(data: typeof testTypes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(testTypes).values(data);
  return result;
}

export async function updateTestType(id: number, data: Partial<typeof testTypes.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(testTypes).set({ ...data, updatedAt: new Date() }).where(eq(testTypes.id, id));
}

export async function deleteTestType(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Soft delete
  await db.update(testTypes).set({ isActive: false, updatedAt: new Date() }).where(eq(testTypes.id, id));
}
// ─── Contracts ────────────────────────────────────────────────────────────────
export async function getAllContracts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contracts).where(eq(contracts.isActive, true)).orderBy(contracts.contractNumber);
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0];
}

export async function getContractByNumber(contractNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.contractNumber, contractNumber)).limit(1);
  return result[0];
}

export async function getContractsWithContractor() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: contracts.id,
      contractNumber: contracts.contractNumber,
      contractName: contracts.contractName,
      contractorId: contracts.contractorId,
      contractorNameEn: contractors.nameEn,
      contractorNameAr: contractors.nameAr,
      sectorKey: contracts.sectorKey,
      sectorNameAr: contracts.sectorNameAr,
      sectorNameEn: contracts.sectorNameEn,
      isActive: contracts.isActive,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      notes: contracts.notes,
      createdAt: contracts.createdAt,
    })
    .from(contracts)
    .leftJoin(contractors, eq(contracts.contractorId, contractors.id))
    .where(eq(contracts.isActive, true))
    .orderBy(contracts.contractNumber);
  return rows;
}

export async function createContract(data: typeof contracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(contracts).values(data);
  const result = await db.select().from(contracts).where(eq(contracts.contractNumber, data.contractNumber)).limit(1);
  return result[0];
}

export async function updateContract(id: number, data: Partial<typeof contracts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contracts).set({ ...data, updatedAt: new Date() }).where(eq(contracts.id, id));
}

export async function deleteContract(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contracts).set({ isActive: false, updatedAt: new Date() }).where(eq(contracts.id, id));
}

// ─── Contractors ────────────────────────────────────────────────────────────────
export async function getAllContractors() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contractors).where(eq(contractors.isActive, true)).orderBy(contractors.nameEn);
}

export async function getContractorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contractors).where(eq(contractors.id, id)).limit(1);
  return result[0];
}

export async function createContractor(data: typeof contractors.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(contractors).values(data);
  return result;
}

export async function updateContractor(id: number, data: Partial<typeof contractors.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contractors).set({ ...data, updatedAt: new Date() }).where(eq(contractors.id, id));
}

export async function deleteContractor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contractors).set({ isActive: false, updatedAt: new Date() }).where(eq(contractors.id, id));
}

// ─── Specialized Test Results ─────────────────────────────────────────────────

export async function createSpecializedTestResult(data: typeof specializedTestResults.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(specializedTestResults).values(data);
  return result;
}

export async function updateSpecializedTestResult(id: number, data: Partial<typeof specializedTestResults.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(specializedTestResults).set({ ...data, updatedAt: new Date() }).where(eq(specializedTestResults.id, id));
}

export async function getSpecializedTestResultById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(specializedTestResults).where(eq(specializedTestResults.id, id)).limit(1);
  return result[0];
}

export async function getSpecializedTestResultByDistribution(distributionId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(specializedTestResults)
    .where(eq(specializedTestResults.distributionId, distributionId))
    .limit(1);
  return result[0] ?? null;
}

export async function getSpecializedTestResultsBySample(sampleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(specializedTestResults)
    .where(eq(specializedTestResults.sampleId, sampleId))
    .orderBy(specializedTestResults.createdAt);
}

// ─── Clearance Requests (براءة الذمة) ────────────────────────────────────────
export async function getAllClearanceRequests() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clearanceRequests).orderBy(desc(clearanceRequests.createdAt));
}
export async function getClearanceRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clearanceRequests).where(eq(clearanceRequests.id, id)).limit(1);
  return result[0];
}
export async function getClearanceRequestByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clearanceRequests).where(eq(clearanceRequests.requestCode, code)).limit(1);
  return result[0];
}
export async function createClearanceRequest(data: InsertClearanceRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(clearanceRequests).values(data);
  return result[0];
}
export async function updateClearanceRequest(id: number, data: Partial<typeof clearanceRequests.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(clearanceRequests).set({ ...data, updatedAt: new Date() }).where(eq(clearanceRequests.id, id));
}
export async function generateClearanceCode(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db.select().from(clearanceRequests)
    .where(sql`YEAR(createdAt) = ${year}`)
    .orderBy(desc(clearanceRequests.id))
    .limit(1);
  const next = rows.length > 0 ? (rows[0].id + 1) : 1;
  return `CLR-${year}-${String(next).padStart(3, "0")}`;
}

export async function getClearanceRequestsByContract(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clearanceRequests)
    .where(eq(clearanceRequests.contractId, contractId))
    .orderBy(desc(clearanceRequests.createdAt));
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
export async function createAuditLog(data: {
  userId: number;
  userName: string;
  action: string;
  entity: string;
  entityId?: number;
  entityLabel?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { auditLog } = await import("../drizzle/schema");
  await db.insert(auditLog).values({
    userId: data.userId,
    userName: data.userName,
    action: data.action,
    entity: data.entity,
    entityId: data.entityId,
    entityLabel: data.entityLabel,
    oldValue: data.oldValue ?? null,
    newValue: data.newValue ?? null,
    ipAddress: data.ipAddress,
    createdAt: new Date(),
  });
}

export async function getAuditLogs(opts?: { entity?: string; entityId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const { auditLog } = await import("../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const conditions = [];
  if (opts?.entity) conditions.push(eq(auditLog.entity, opts.entity));
  if (opts?.entityId) conditions.push(eq(auditLog.entityId, opts.entityId));
  const query = db.select().from(auditLog);
  if (conditions.length > 0) query.where(and(...conditions));
  return query.orderBy(desc(auditLog.createdAt)).limit(opts?.limit ?? 200);
}

// ─── Three-state task read tracking ──────────────────────────────────────────

/** Mark a sample as read by manager (first open only) */
export async function markSampleManagerRead(sampleId: number) {
  const db = await getDb();
  if (!db) return;
  const { samples } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const existing = await db.select({ managerReadAt: samples.managerReadAt }).from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (existing[0] && !existing[0].managerReadAt) {
    await db.update(samples).set({ managerReadAt: new Date(), updatedAt: new Date() }).where(eq(samples.id, sampleId));
  }
}

/** Mark a clearance request as read by QC inspector (first open only) */
export async function markClearanceQcRead(clearanceId: number) {
  const db = await getDb();
  if (!db) return;
  const { clearanceRequests } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const existing = await db.select({ qcReadAt: clearanceRequests.qcReadAt }).from(clearanceRequests).where(eq(clearanceRequests.id, clearanceId)).limit(1);
  if (existing[0] && !existing[0].qcReadAt) {
    await db.update(clearanceRequests).set({ qcReadAt: new Date(), updatedAt: new Date() }).where(eq(clearanceRequests.id, clearanceId));
  }
}

/** Mark a clearance request as read by accountant (first open only) */
export async function markClearanceAccountantRead(clearanceId: number) {
  const db = await getDb();
  if (!db) return;
  const { clearanceRequests } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const existing = await db.select({ accountantReadAt: clearanceRequests.accountantReadAt }).from(clearanceRequests).where(eq(clearanceRequests.id, clearanceId)).limit(1);
  if (existing[0] && !existing[0].accountantReadAt) {
    await db.update(clearanceRequests).set({ accountantReadAt: new Date(), updatedAt: new Date() }).where(eq(clearanceRequests.id, clearanceId));
  }
}

/** Get all sector accounts (id, sectorKey, nameAr, nameEn) */
export async function getAllSectorAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: sectorAccounts.id, sectorKey: sectorAccounts.sectorKey, nameAr: sectorAccounts.nameAr, nameEn: sectorAccounts.nameEn })
    .from(sectorAccounts)
    .orderBy(sectorAccounts.sectorKey);
}

// ─── Sectors (dynamic) ────────────────────────────────────────────────────────
export async function getAllSectors() {
  const db = await getDb();
  if (!db) return [];
  const { sectors } = await import("../drizzle/schema");
  return db.select().from(sectors).orderBy(sectors.sectorKey);
}
export async function getSectorByKey(key: string) {
  const db = await getDb();
  if (!db) return null;
  const { sectors } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(sectors).where(eq(sectors.sectorKey, key)).limit(1);
  return rows[0] ?? null;
}
export async function createSector(data: { sectorKey: string; nameAr: string; nameEn: string; description?: string }) {
  const db = await getDb();
  if (!db) return;
  const { sectors } = await import("../drizzle/schema");
  await db.insert(sectors).values({ ...data, isActive: true });
}
export async function updateSector(id: number, data: { nameAr?: string; nameEn?: string; description?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return;
  const { sectors } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(sectors).set({ ...data, updatedAt: new Date() }).where(eq(sectors.id, id));
}
export async function deleteSector(id: number) {
  const db = await getDb();
  if (!db) return;
  const { sectors } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(sectors).where(eq(sectors.id, id));
}

// ─── Lab Orders ──────────────────────────────────────────────────────────────
import {
  labOrders,
  labOrderItems,
  type InsertLabOrder,
  type InsertLabOrderItem,
} from "../drizzle/schema";

export async function generateOrderCode(): Promise<string> {
  const db = await getDb();
  if (!db) return `ORD-${new Date().getFullYear()}-0001`;
  const year = new Date().getFullYear();
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(labOrders)
    .where(sql`YEAR(createdAt) = ${year}`);
  const count = (result[0]?.count ?? 0) + 1;
  return `ORD-${year}-${String(count).padStart(4, "0")}`;
}

export async function createLabOrder(data: InsertLabOrder) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(labOrders).values(data);
  const result = await db
    .select()
    .from(labOrders)
    .where(eq(labOrders.orderCode, data.orderCode))
    .limit(1);
  return result[0];
}

export async function createLabOrderItems(items: InsertLabOrderItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (items.length === 0) return [];
  await db.insert(labOrderItems).values(items);
  return db
    .select()
    .from(labOrderItems)
    .where(eq(labOrderItems.orderId, items[0].orderId))
    .orderBy(labOrderItems.id);
}

export async function getAllLabOrders() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: labOrders.id,
      orderCode: labOrders.orderCode,
      sampleId: labOrders.sampleId,
      sampleCode: samples.sampleCode,
      contractNumber: labOrders.contractNumber,
      contractName: labOrders.contractName,
      contractorName: labOrders.contractorName,
      sampleType: labOrders.sampleType,
      location: labOrders.location,
      castingDate: labOrders.castingDate,
      priority: labOrders.priority,
      status: labOrders.status,
      createdById: labOrders.createdById,
      distributedById: labOrders.distributedById,
      distributedAt: labOrders.distributedAt,
      assignedTechnicianId: labOrders.assignedTechnicianId,
      completedAt: labOrders.completedAt,
      createdAt: labOrders.createdAt,
      updatedAt: labOrders.updatedAt,
      notes: labOrders.notes,
    })
    .from(labOrders)
    .leftJoin(samples, eq(labOrders.sampleId, samples.id))
    .where(isNull(labOrders.deletedAt))
    .orderBy(desc(labOrders.createdAt));
}

export async function getLabOrderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: labOrders.id,
      orderCode: labOrders.orderCode,
      sampleId: labOrders.sampleId,
      sampleCode: samples.sampleCode,
      contractNumber: labOrders.contractNumber,
      contractName: labOrders.contractName,
      contractorName: labOrders.contractorName,
      sampleType: labOrders.sampleType,
      location: labOrders.location,
      castingDate: labOrders.castingDate,
      priority: labOrders.priority,
      status: labOrders.status,
      createdById: labOrders.createdById,
      distributedById: labOrders.distributedById,
      distributedAt: labOrders.distributedAt,
      assignedTechnicianId: labOrders.assignedTechnicianId,
      completedAt: labOrders.completedAt,
      createdAt: labOrders.createdAt,
      updatedAt: labOrders.updatedAt,
      notes: labOrders.notes,
    })
    .from(labOrders)
    .leftJoin(samples, eq(labOrders.sampleId, samples.id))
    .where(and(eq(labOrders.id, id), isNull(labOrders.deletedAt)))
    .limit(1);
  return result[0];
}

export async function getLabOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(labOrderItems)
    .where(eq(labOrderItems.orderId, orderId))
    .orderBy(labOrderItems.id);
}

export async function getLabOrdersByStatus(status: typeof labOrders.$inferSelect.status) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: labOrders.id,
      orderCode: labOrders.orderCode,
      sampleId: labOrders.sampleId,
      sampleCode: samples.sampleCode,
      contractNumber: labOrders.contractNumber,
      contractName: labOrders.contractName,
      contractorName: labOrders.contractorName,
      sampleType: labOrders.sampleType,
      location: labOrders.location,
      castingDate: labOrders.castingDate,
      priority: labOrders.priority,
      status: labOrders.status,
      createdById: labOrders.createdById,
      assignedTechnicianId: labOrders.assignedTechnicianId,
      createdAt: labOrders.createdAt,
      notes: labOrders.notes,
    })
    .from(labOrders)
    .leftJoin(samples, eq(labOrders.sampleId, samples.id))
    .where(and(eq(labOrders.status, status), isNull(labOrders.deletedAt)))
    .orderBy(desc(labOrders.createdAt));
}

export async function getLabOrdersByTechnician(technicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: labOrders.id,
      orderCode: labOrders.orderCode,
      sampleId: labOrders.sampleId,
      sampleCode: samples.sampleCode,
      contractNumber: labOrders.contractNumber,
      contractName: labOrders.contractName,
      contractorName: labOrders.contractorName,
      sampleType: labOrders.sampleType,
      location: labOrders.location,
      castingDate: labOrders.castingDate,
      priority: labOrders.priority,
      status: labOrders.status,
      createdAt: labOrders.createdAt,
      notes: labOrders.notes,
    })
    .from(labOrders)
    .leftJoin(samples, eq(labOrders.sampleId, samples.id))
    .where(
      and(
        eq(labOrders.assignedTechnicianId, technicianId),
        inArray(labOrders.status, ["distributed", "in_progress"]),
        isNull(labOrders.deletedAt)
      )
    )
    .orderBy(desc(labOrders.createdAt));
}

export async function updateLabOrderStatus(
  id: number,
  status: typeof labOrders.$inferSelect.status,
  extra?: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = { status, updatedAt: new Date() };
  if (extra) Object.assign(set, extra);
  await db.update(labOrders).set(set).where(eq(labOrders.id, id));
}

export async function updateLabOrderFields(
  id: number,
  data: {
    contractorName?: string;
    location?: string;
    notes?: string;
    priority?: "low" | "normal" | "high" | "urgent";
    assignedTechnicianId?: number | null;
    castingDate?: Date | null;
  }
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.contractorName !== undefined) set.contractorName = data.contractorName;
  if (data.location !== undefined) set.location = data.location;
  if (data.notes !== undefined) set.notes = data.notes;
  if (data.priority !== undefined) set.priority = data.priority;
  if (data.assignedTechnicianId !== undefined) set.assignedTechnicianId = data.assignedTechnicianId;
  if (data.castingDate !== undefined) set.castingDate = data.castingDate;
  await db.update(labOrders).set(set).where(eq(labOrders.id, id));
}

export async function updateLabOrderItemStatus(
  id: number,
  status: typeof labOrderItems.$inferSelect.status
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "completed") set.completedAt = new Date();
  await db.update(labOrderItems).set(set).where(eq(labOrderItems.id, id));
}

export async function updateLabOrderItemDistribution(
  itemId: number,
  distributionId: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(labOrderItems)
    .set({ distributionId, updatedAt: new Date() })
    .where(eq(labOrderItems.id, itemId));
}

/** Check if all items in an order are completed, and if so update order status */
export async function checkAndCompleteOrder(orderId: number) {
  const db = await getDb();
  if (!db) return false;
  const items = await db
    .select()
    .from(labOrderItems)
    .where(eq(labOrderItems.orderId, orderId));
  const allDone = items.every(
    (i) => i.status === "completed" || i.status === "cancelled"
  );
  if (allDone && items.some((i) => i.status === "completed")) {
    await db
      .update(labOrders)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(labOrders.id, orderId));
    return true;
  }
  return false;
}

// Force rebuild timestamp: $(date +%s)
