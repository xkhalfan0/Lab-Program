import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const deletionRequests = mysqlTable("deletion_requests", {
  id: int("id").primaryKey().autoincrement(),

  // Who requested deletion
  requestedBy: int("requestedBy").notNull(),

  // What to delete
  targetTable: varchar("targetTable", { length: 50 }).notNull(),
  targetId: int("targetId").notNull(),

  // Why delete
  reason: text("reason").notNull(),
  reasonCategory: mysqlEnum("reasonCategory", [
    "data_error",
    "duplicate",
    "customer_request",
    "compliance",
    "test_data",
    "other",
  ]).notNull(),

  // Impact analysis (JSON string)
  impactAnalysis: text("impactAnalysis"), // JSON: {affectedTables: {...}, recordCount: N}

  // Approval workflow
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reviewComment: text("reviewComment"),

  // Audit
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
});
