import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", [
    "admin",
    "reception",
    "lab_manager",
    "technician",
    "sample_manager",
    "qc_inspector",
    "accountant",
    "user",
  ])
    .default("user")
    .notNull(),
  specialty: varchar("specialty", { length: 128 }), // for technicians
  username: varchar("username", { length: 64 }).unique(), // internal login
  passwordHash: varchar("passwordHash", { length: 256 }), // bcrypt hash
  permissions: json("permissions"), // detailed permission overrides
  isActive: boolean("isActive").default(true).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Samples ──────────────────────────────────────────────────────────────────
export const samples = mysqlTable("samples", {
  id: int("id").autoincrement().primaryKey(),
  sampleCode: varchar("sampleCode", { length: 32 }).notNull().unique(), // LAB-2026-0001
  contractId: int("contractId"), // FK to contracts (optional, auto-fills contractNumber/contractName/contractorName)
  contractNumber: varchar("contractNumber", { length: 128 }),
  contractName: varchar("contractName", { length: 512 }),
  contractorName: varchar("contractorName", { length: 256 }),
  sampleType: mysqlEnum("sampleType", ["concrete", "soil", "metal", "asphalt", "steel", "aggregates"]).notNull(),
  sector: varchar("sector", { length: 64 }).notNull().default("sector_1"),
  sectorNameAr: varchar("sectorNameAr", { length: 128 }),
  sectorNameEn: varchar("sectorNameEn", { length: 128 }),
  quantity: int("quantity").notNull().default(1),
  condition: mysqlEnum("condition", ["good", "damaged", "partial"]).notNull().default("good"),
  notes: text("notes"),
  status: mysqlEnum("status", [
    "received",
    "distributed",
    "testing_in_progress",
    "awaiting_review",
    "under_review",
    "tested",
    "processed",
    "reviewed",
    "approved",
    "qc_passed",
    "qc_failed",
    "clearance_requested",
    "clearance_issued",
    "rejected",
    "revision_requested",
    "deleted",
  ])
    .notNull()
    .default("received"),
  requestedTestTypeId: int("requestedTestTypeId"), // test type selected at reception
  testSubType: varchar("testSubType", { length: 512 }), // e.g. "7", "14", "28" for cubes; "coarse"/"fine" for aggregates; multi-value for sieve tests
  sampleSubType: varchar("sampleSubType", { length: 512 }), // human-readable subtype label (e.g. "7 Days", "Solid Block", "Coarse")
  testTypeName: varchar("testTypeName", { length: 256 }), // locked test name at registration time
  batchId: varchar("batchId", { length: 32 }), // groups samples created together (e.g. multi-block batch)
  location: varchar("location", { length: 256 }), // sample location/origin (e.g. "Floor 3, Column C2")
  /** Contractor / client reference written at reception (optional) */
  referenceNo: varchar("referenceNo", { length: 128 }),
  /** Nominal cube face size from reception: "150mm" or "100mm" (concrete cube samples only) */
  nominalCubeSize: varchar("nominalCubeSize", { length: 32 }),
  castingDate: timestamp("castingDate"), // date of concrete casting (used to calculate sample age automatically)
  receivedById: int("receivedById").notNull(), // reception staff
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  /** Root sample id for retests (always points to original, never R1) */
  originalSampleId: int("originalSampleId"),
  /** Retest chain depth: 1, 2, 3… NULL on root samples */
  retestNumber: int("retestNumber"),
  retestReason: mysqlEnum("retestReason", ["failed_spec", "damaged_sample", "client_request"]),
  retestReasonNotes: text("retestReasonNotes"),
  managerReadAt: timestamp("managerReadAt"),         // when manager first opened the processed sample
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  deletionReason: text("deletionReason"),
  deletionCategory: varchar("deletionCategory", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sample = typeof samples.$inferSelect;
export type InsertSample = Omit<
  typeof samples.$inferInsert,
  "deletedAt" | "deletedBy" | "deletionReason" | "deletionCategory"
>;

// ─── Distribution Orders ──────────────────────────────────────────────────────
export const distributions = mysqlTable("distributions", {
  id: int("id").autoincrement().primaryKey(),
  distributionCode: varchar("distributionCode", { length: 32 }).notNull().unique(), // DIST-2026-001
  sampleId: int("sampleId").notNull(),
  assignedTechnicianId: int("assignedTechnicianId").notNull(),
  assignedById: int("assignedById").notNull(), // lab manager
  testType: varchar("testType", { length: 128 }).notNull(), // e.g. concrete_compression
  testName: varchar("testName", { length: 256 }).notNull(),
  minAcceptable: decimal("minAcceptable", { precision: 10, scale: 3 }),
  maxAcceptable: decimal("maxAcceptable", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 32 }).default("MPa"),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  testSubType: varchar("testSubType", { length: 512 }), // sub-type: cube age (7/14/28), beam size, aggregate type (coarse/fine)
  originalTestType: varchar("originalTestType", { length: 128 }), // original test type from reception (if changed by distributor)
  testTypeChangedNote: text("testTypeChangedNote"), // mandatory note when test type is changed
  quantity: int("quantity").default(1).notNull(), // number of specimens/samples
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0"), // price per specimen from test_types
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }).default("0"), // quantity × unitPrice
  expectedCompletionDate: timestamp("expectedCompletionDate"),
  notes: text("notes"),
  taskReadAt: timestamp("taskReadAt"),                // when technician first opened the task
  batchDistributionId: varchar("batchDistributionId", { length: 32 }), // groups distributions from same batch (e.g. multi-block)
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"])
    .default("pending")
    .notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Distribution = typeof distributions.$inferSelect;
export type InsertDistribution = typeof distributions.$inferInsert;

// ─── Test Results ─────────────────────────────────────────────────────────────
export const testResults = mysqlTable("test_results", {
  id: int("id").autoincrement().primaryKey(),
  distributionId: int("distributionId").notNull(),
  sampleId: int("sampleId").notNull(),
  technicianId: int("technicianId").notNull(),
  rawValues: json("rawValues").notNull(), // array of numbers
  unit: varchar("unit", { length: 32 }).default("MPa"),
  testNotes: text("testNotes"),
  // Calculated fields (populated by automated processing)
  average: decimal("average", { precision: 10, scale: 4 }),
  stdDeviation: decimal("stdDeviation", { precision: 10, scale: 4 }),
  percentage: decimal("percentage", { precision: 10, scale: 4 }),
  minValue: decimal("minValue", { precision: 10, scale: 4 }),
  maxValue: decimal("maxValue", { precision: 10, scale: 4 }),
  complianceStatus: mysqlEnum("complianceStatus", ["pass", "fail", "partial"]),
  chartsData: json("chartsData"), // stored chart data
  status: mysqlEnum("status", ["entered", "processed", "approved", "rejected", "revision_requested"])
    .default("entered")
    .notNull(),
  processedAt: timestamp("processedAt"),
  // Manager review fields
  managerReviewedById: int("managerReviewedById"),   // FK to users
  managerReviewedByName: varchar("managerReviewedByName", { length: 256 }), // cached name
  managerReviewedAt: timestamp("managerReviewedAt"),
  managerNotes: text("managerNotes"),                // mandatory on reject/revision
  // QC review fields
  qcReviewedById: int("qcReviewedById"),             // FK to users
  qcReviewedByName: varchar("qcReviewedByName", { length: 256 }), // cached name
  qcReviewedAt: timestamp("qcReviewedAt"),
  qcNotes: text("qcNotes"),                          // mandatory on reject/revision
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TestResult = typeof testResults.$inferSelect;
export type InsertTestResult = typeof testResults.$inferInsert;

// ─── Review Records ───────────────────────────────────────────────────────────
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  testResultId: int("testResultId"),           // nullable — legacy concrete cubes
  specializedTestResultId: int("specializedTestResultId"), // nullable — new specialized tests
  sampleId: int("sampleId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  reviewType: mysqlEnum("reviewType", ["manager_review", "qc_review"]).notNull(),
  decision: mysqlEnum("decision", ["approved", "needs_revision", "rejected"]).notNull(),
  comments: text("comments"),
  signature: text("signature"), // digital signature (base64 or text)
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;

// ─── Attachments ──────────────────────────────────────────────────────────────
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: int("sampleId").notNull(),
  distributionId: int("distributionId"),
  uploadedById: int("uploadedById").notNull(),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  attachmentType: mysqlEnum("attachmentType", [
    "photo",
    "document",
    "contractor_letter",
    "sector_letter",
    "payment_order",
    "payment_receipt",
    "test_report",
    "contractor_form",
    "other",
  ]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ─── Clearance Certificates ───────────────────────────────────────────────────
export const certificates = mysqlTable("certificates", {
  id: int("id").autoincrement().primaryKey(),
  certificateCode: varchar("certificateCode", { length: 32 }).notNull().unique(), // CERT-2026-001
  sampleId: int("sampleId").notNull(),
  issuedById: int("issuedById").notNull(), // lab manager
  projectNumber: varchar("projectNumber", { length: 128 }).notNull(),
  projectName: varchar("projectName", { length: 256 }),
  contractorName: varchar("contractorName", { length: 256 }).notNull(),
  testsCompleted: json("testsCompleted"), // list of test summaries
  finalResults: json("finalResults"),
  notes: text("notes"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 512 }),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Certificate = typeof certificates.$inferSelect;
export type InsertCertificate = typeof certificates.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sampleId: int("sampleId"),
  title: varchar("title", { length: 256 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["info", "action_required", "approved", "rejected", "revision"]).default("info").notNull(),
  // Extended fields for role-based and sector notifications
  targetRole: varchar("targetRole", { length: 64 }),          // e.g. "reception", "technician", "accountant"
  sectorId: int("sectorId"),                                   // for sector-specific notifications
  notificationType: varchar("notificationType", { length: 64 }), // e.g. "sample_received", "result_issued", "clearance_started", "clearance_issued"
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Sample History / Audit Log ───────────────────────────────────────────────
export const sampleHistory = mysqlTable("sample_history", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: int("sampleId").notNull(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  fromStatus: varchar("fromStatus", { length: 64 }),
  toStatus: varchar("toStatus", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SampleHistory = typeof sampleHistory.$inferSelect;
export type InsertSampleHistory = typeof sampleHistory.$inferInsert;

// ─── Concrete Cube Test Groups ────────────────────────────────────────────────
// One group = all cubes tested at the same age (e.g. all 7-day cubes)
export const concreteTestGroups = mysqlTable("concrete_test_groups", {
  id: int("id").autoincrement().primaryKey(),
  distributionId: int("distributionId").notNull(),
  sampleId: int("sampleId").notNull(),
  technicianId: int("technicianId").notNull(),
  testAge: int("testAge").notNull(), // days: 7, 28, etc.
  // Header info (auto-filled from sample)
  contractNo: varchar("contractNo", { length: 128 }),
  projectName: varchar("projectName", { length: 256 }),
  contractorName: varchar("contractorName", { length: 256 }),
  location: varchar("location", { length: 256 }),
  region: varchar("region", { length: 128 }),
  consultant: varchar("consultant", { length: 256 }),
  cscRef: varchar("cscRef", { length: 128 }),
  placeOfSampling: varchar("placeOfSampling", { length: 256 }),
  sourceSupplier: varchar("sourceSupplier", { length: 256 }),
  batchDateTime: varchar("batchDateTime", { length: 128 }),
  slump: varchar("slump", { length: 64 }),
  classOfConcrete: varchar("classOfConcrete", { length: 128 }),
  maxAggSize: varchar("maxAggSize", { length: 64 }),
  nominalCubeSize: varchar("nominalCubeSize", { length: 64 }).default("150mm"),
  methodOfCompaction: varchar("methodOfCompaction", { length: 128 }).default("Using Compacting Bar"),
  appearance: varchar("appearance", { length: 128 }).default("Normal"),
  dateSampled: timestamp("dateSampled"),
  sampledBy: varchar("sampledBy", { length: 128 }).default("Contractor"),
  curingMethod: varchar("curingMethod", { length: 256 }).default("BS 1881 Part 111: 1983"),
  moistureCondition: varchar("moistureCondition", { length: 128 }).default("Saturated"),
  labCuringTemperature: varchar("labCuringTemperature", { length: 64 }),
  labCuringRh: varchar("labCuringRh", { length: 64 }),
  loadingRate: varchar("loadingRate", { length: 32 }),
  surfaceConditionAtTest: varchar("surfaceConditionAtTest", { length: 128 }),
  cappingMethod: varchar("cappingMethod", { length: 128 }),
  removalOfFins: varchar("removalOfFins", { length: 128 }).default("Using Steel File"),
  volumeDetermination: varchar("volumeDetermination", { length: 128 }).default("By Calculation"),
  testedBy: varchar("testedBy", { length: 128 }),
  comments: text("comments"),
  // Calculated summary
  avgCompressiveStrength: decimal("avgCompressiveStrength", { precision: 10, scale: 3 }),
  minAcceptable: decimal("minAcceptable", { precision: 10, scale: 3 }),
  maxAcceptable: decimal("maxAcceptable", { precision: 10, scale: 3 }),
  complianceStatus: mysqlEnum("complianceStatus", ["pass", "fail", "partial"]),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected", "revision_requested"])
    .default("draft")
    .notNull(),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConcreteTestGroup = typeof concreteTestGroups.$inferSelect;
export type InsertConcreteTestGroup = typeof concreteTestGroups.$inferInsert;

// ─── Individual Concrete Cubes ────────────────────────────────────────────────
export const concreteCubes = mysqlTable("concrete_cubes", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(), // FK to concreteTestGroups
  markNo: int("markNo").notNull(), // 1, 2, 3, ...
  cubeId: varchar("cubeId", { length: 64 }), // e.g. 354, 355, 356
  dateTested: timestamp("dateTested"),
  // Dimensions (mm)
  length: decimal("length", { precision: 8, scale: 2 }).default("150"),
  width: decimal("width", { precision: 8, scale: 2 }).default("150"),
  height: decimal("height", { precision: 8, scale: 2 }).default("150"),
  // Inputs
  massKg: decimal("massKg", { precision: 8, scale: 3 }), // kg
  maxLoadKN: decimal("maxLoadKN", { precision: 10, scale: 3 }), // kN — main input
  fractureType: varchar("fractureType", { length: 16 }), // SF or USF
  withinSpec: boolean("withinSpec"), // true = technician marked as within spec, null = auto (no default needed)
  // Auto-calculated
  densityKgM3: decimal("densityKgM3", { precision: 10, scale: 2 }), // kg/m3
  compressiveStrengthMpa: decimal("compressiveStrengthMpa", { precision: 10, scale: 3 }), // N/mm2
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConcreteCube = typeof concreteCubes.$inferSelect;
export type InsertConcreteCube = typeof concreteCubes.$inferInsert;

// ─── Test Types Catalog ───────────────────────────────────────────────────────
// Managed by Admin — used in dropdown when registering samples
export const testTypes = mysqlTable("test_types", {
  id: int("id").autoincrement().primaryKey(),
  category: mysqlEnum("category", ["concrete", "soil", "steel", "asphalt", "aggregates"]).notNull(),
  nameEn: varchar("nameEn", { length: 256 }).notNull(),
  nameAr: varchar("nameAr", { length: 256 }),
  code: varchar("code", { length: 64 }).unique(), // internal code e.g. CONC_CUBE
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: varchar("unit", { length: 32 }).default("N/mm²"),
  standardRef: varchar("standardRef", { length: 256 }), // e.g. BS 1881
  formTemplate: varchar("formTemplate", { length: 64 }), // which form to use: concrete_cubes, sieve_analysis, etc.
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TestType = typeof testTypes.$inferSelect;
export type InsertTestType = typeof testTypes.$inferInsert;

// ─── Contractors ──────────────────────────────────────────────────────────────
// Managed by Admin / QC — used in dropdown when registering samples
export const contractors = mysqlTable("contractors", {
  id: int("id").autoincrement().primaryKey(),
  nameEn: varchar("nameEn", { length: 256 }).notNull(),
  nameAr: varchar("nameAr", { length: 256 }),
  contactPerson: varchar("contactPerson", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  contractorCode: varchar("contractorCode", { length: 64 }).unique(),
  isActive: boolean("isActive").default(true).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contractor = typeof contractors.$inferSelect;
export type InsertContractor = typeof contractors.$inferInsert;

// ─── Contracts ────────────────────────────────────────────────────────────────
// Each contract links a contract number and name to a contractor
export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  contractNumber: varchar("contractNumber", { length: 128 }).notNull().unique(), // e.g. CON-2026-001
  contractName: varchar("contractName", { length: 512 }).notNull(),
  contractorId: int("contractorId").notNull(), // FK to contractors
  sectorKey: varchar("sectorKey", { length: 32 }), // FK to sectors.sectorKey
  sectorNameAr: varchar("sectorNameAr", { length: 128 }),
  sectorNameEn: varchar("sectorNameEn", { length: 128 }),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Sectors (dynamic sector management) ─────────────────────────────────────
export const sectors = mysqlTable("sectors", {
  id: int("id").autoincrement().primaryKey(),
  sectorKey: varchar("sectorKey", { length: 64 }).notNull().unique(),
  nameAr: varchar("nameAr", { length: 128 }).notNull(),
  nameEn: varchar("nameEn", { length: 128 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Sector = typeof sectors.$inferSelect;
export type InsertSector = typeof sectors.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

// ─── Specialized Test Results ─────────────────────────────────────────────────
// Stores detailed form data for all specialized test types (steel, soil, asphalt, etc.)
// Uses JSON formData to store flexible test-specific data
export const specializedTestResults = mysqlTable("specialized_test_results", {
  id: int("id").autoincrement().primaryKey(),
  distributionId: int("distributionId").notNull(),
  sampleId: int("sampleId").notNull(),
  technicianId: int("technicianId").notNull(),
  testTypeCode: varchar("testTypeCode", { length: 64 }).notNull(), // e.g. STEEL_REBAR_BS4449
  formTemplate: varchar("formTemplate", { length: 64 }).notNull(), // e.g. steel_rebar
  // General info
  contractNo: varchar("contractNo", { length: 128 }),
  projectName: varchar("projectName", { length: 512 }),
  contractorName: varchar("contractorName", { length: 256 }),
  testedBy: varchar("testedBy", { length: 128 }),
  testDate: timestamp("testDate"),
  // Flexible JSON storage for all test-specific data
  formData: json("formData").notNull(), // full form data as JSON
  // Summary results
  overallResult: mysqlEnum("overallResult", ["pass", "fail", "pending"]).default("pending").notNull(),
  summaryValues: json("summaryValues"), // key results for quick display
  // Workflow
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected", "revision_requested"])
    .default("draft")
    .notNull(),
   submittedAt: timestamp("submittedAt"),
  notes: text("notes"),
  // Manager review signature
  managerReviewedByName: varchar("managerReviewedByName", { length: 256 }),
  managerReviewedAt: timestamp("managerReviewedAt"),
  managerNotes: text("managerNotes"),
  // QC review signature
  qcReviewedByName: varchar("qcReviewedByName", { length: 256 }),
  qcReviewedAt: timestamp("qcReviewedAt"),
  qcNotes: text("qcNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SpecializedTestResult = typeof specializedTestResults.$inferSelect;
export type InsertSpecializedTestResult = typeof specializedTestResults.$inferInsert;

// ─── Clearance Requests (براءة الذمة) ────────────────────────────────────────
// Full lifecycle: request → test inventory → payment order → docs upload → certificate
export const clearanceRequests = mysqlTable("clearance_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestCode: varchar("requestCode", { length: 32 }).notNull().unique(), // CLR-2026-001
  contractId: int("contractId").notNull(),          // FK to contracts
  contractorId: int("contractorId").notNull(),       // FK to contractors
  contractNumber: varchar("contractNumber", { length: 128 }).notNull(),
  contractName: varchar("contractName", { length: 512 }),
  contractorName: varchar("contractorName", { length: 256 }).notNull(),
  requestedById: int("requestedById").notNull(),     // user who created the request
  // Inventory summary (auto-computed from samples/distributions)
  totalTests: int("totalTests").default(0).notNull(),
  passedTests: int("passedTests").default(0).notNull(),
  failedTests: int("failedTests").default(0).notNull(),
  pendingTests: int("pendingTests").default(0).notNull(),
  totalAmount: varchar("totalAmount", { length: 32 }).default("0.00").notNull(), // AED
  inventoryData: json("inventoryData"),              // full list of tests with prices
  // QC Review
  qcReadAt: timestamp("qcReadAt"),                    // when QC inspector first opened the request
  qcReviewedById: int("qcReviewedById"),
  qcReviewedAt: timestamp("qcReviewedAt"),
  qcNotes: text("qcNotes"),
  accountantReadAt: timestamp("accountantReadAt"),    // when accountant first opened the request
  // Payment Order
  paymentOrderNumber: varchar("paymentOrderNumber", { length: 64 }),
  paymentOrderDate: timestamp("paymentOrderDate"),
  paymentOrderIssuedById: int("paymentOrderIssuedById"),
  paymentOrderPdfUrl: text("paymentOrderPdfUrl"),
  // Document uploads (S3 URLs)
  contractorLetterUrl: text("contractorLetterUrl"),
  sectorLetterUrl: text("sectorLetterUrl"),
  paymentReceiptUrl: text("paymentReceiptUrl"),
  paymentReceiptNumber: varchar("paymentReceiptNumber", { length: 64 }), // official receipt number
  testListUrl: text("testListUrl"),
  sectorId: int("sectorId"),                          // sector that initiated the request
  // Certificate
  certificateCode: varchar("certificateCode", { length: 32 }),
  certificatePdfUrl: text("certificatePdfUrl"),
  certificateIssuedAt: timestamp("certificateIssuedAt"),
  // Workflow status
  status: mysqlEnum("status", [
    "pending",           // just created
    "inventory_ready",   // tests counted
    "payment_ordered",   // payment order issued
    "docs_uploaded",     // all docs uploaded
    "issued",            // certificate issued
    "rejected",          // rejected
  ]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClearanceRequest = typeof clearanceRequests.$inferSelect;
export type InsertClearanceRequest = typeof clearanceRequests.$inferInsert;

// ─── Audit Log (سجل التغييرات) ────────────────────────────────────────────────
// Records every change made by any user in the system
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),           // who made the change
  userName: varchar("userName", { length: 128 }).notNull(), // snapshot of name at time of change
  action: varchar("action", { length: 64 }).notNull(),  // e.g. "update_permissions", "update_user", "create_sample"
  entity: varchar("entity", { length: 64 }).notNull(),  // e.g. "user", "sample", "clearance"
  entityId: int("entityId"),                // ID of the affected record
  entityLabel: varchar("entityLabel", { length: 256 }), // human-readable label e.g. "Ahmed Ali"
  oldValue: json("oldValue"),               // previous value (JSON)
  newValue: json("newValue"),               // new value (JSON)
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

// ─── Sector Accounts (حسابات القطاعات) ────────────────────────────────────────
// Each sector has one login account for the external portal
export const sectorAccounts = mysqlTable("sector_accounts", {
  id: int("id").autoincrement().primaryKey(),
  sectorKey: mysqlEnum("sectorKey", ["sector_1", "sector_2", "sector_3", "sector_4", "sector_5"]).notNull().unique(),
  nameAr: varchar("nameAr", { length: 128 }).notNull(),   // e.g. "القطاع الأول"
  nameEn: varchar("nameEn", { length: 128 }).notNull(),   // e.g. "Sector 1"
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SectorAccount = typeof sectorAccounts.$inferSelect;
export type InsertSectorAccount = typeof sectorAccounts.$inferInsert;

// ─── Sector Report Reads (تتبع التقارير المقروءة) ─────────────────────────────
// Tracks which reports have been viewed by each sector
export const sectorReportReads = mysqlTable("sector_report_reads", {
  id: int("id").autoincrement().primaryKey(),
  sectorKey: mysqlEnum("sectorKey", ["sector_1", "sector_2", "sector_3", "sector_4", "sector_5"]).notNull(),
  reportType: mysqlEnum("reportType", ["test_result", "clearance"]).notNull(),
  reportId: int("reportId").notNull(),  // ID of specializedTestResult or clearanceRequest
  readAt: timestamp("readAt").defaultNow().notNull(),
});

export type SectorReportRead = typeof sectorReportReads.$inferSelect;

// ─── Lab Orders (Multi-Test Order System) ─────────────────────────────────────
// One order = one sample + one or more tests (distributions)
// Replaces the old one-distribution-per-sample workflow
export const labOrders = mysqlTable("lab_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderCode: varchar("orderCode", { length: 32 }).notNull().unique(), // ORD-2026-0001
  sampleId: int("sampleId").notNull(),                // FK to samples
  // Snapshot fields (copied from sample at creation for report use)
  contractNumber: varchar("contractNumber", { length: 128 }),
  contractName: varchar("contractName", { length: 512 }),
  contractorName: varchar("contractorName", { length: 256 }),
  sampleType: varchar("sampleType", { length: 64 }),
  location: varchar("location", { length: 256 }),
  castingDate: timestamp("castingDate"),
  notes: text("notes"),
  // Workflow
  createdById: int("createdById").notNull(),           // reception staff
  distributedById: int("distributedById"),             // lab manager who distributed
  distributedAt: timestamp("distributedAt"),
  assignedTechnicianId: int("assignedTechnicianId"),   // single technician for the whole order
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  status: mysqlEnum("status", [
    "pending",        // created, waiting for distribution
    "distributed",    // assigned to technician
    "in_progress",    // technician started at least one test
    "completed",      // all tests done, ready for review
    "reviewed",       // manager approved
    "qc_passed",      // QC approved
    "rejected",       // rejected at any stage
  ]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LabOrder = typeof labOrders.$inferSelect;
export type InsertLabOrder = typeof labOrders.$inferInsert;

// ─── Lab Order Items (each test within an order) ───────────────────────────────
export const labOrderItems = mysqlTable("lab_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),                   // FK to lab_orders
  distributionId: int("distributionId"),               // FK to distributions (set after distribution)
  testTypeId: int("testTypeId").notNull(),             // FK to test_types
  testTypeCode: varchar("testTypeCode", { length: 64 }).notNull(),
  testTypeName: varchar("testTypeName", { length: 256 }).notNull(),
  formTemplate: varchar("formTemplate", { length: 64 }), // e.g. concrete_cubes, steel_rebar
  testSubType: varchar("testSubType", { length: 512 }), // optional subtype
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"])
    .default("pending")
    .notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LabOrderItem = typeof labOrderItems.$inferSelect;
export type InsertLabOrderItem = typeof labOrderItems.$inferInsert;

export * from "./schema-deletion-requests";
