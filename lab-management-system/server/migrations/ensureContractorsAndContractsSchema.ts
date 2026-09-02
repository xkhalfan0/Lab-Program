import { sql } from "drizzle-orm";

type SchemaDb = { execute: (query: unknown) => Promise<unknown> };

function rowValue(row: Record<string, unknown>, key: string): unknown {
  const target = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

async function tableExists(db: SchemaDb, table: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `);
  return (result as Record<string, unknown>[]).length > 0;
}

async function columnExists(db: SchemaDb, table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
      AND COLUMN_NAME = ${column}
  `);
  return (result as Record<string, unknown>[]).some(
    (r) => String(rowValue(r, "COLUMN_NAME")) === column
  );
}

async function ensureColumn(
  db: SchemaDb,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await tableExists(db, table) && !(await columnExists(db, table, column))) {
    await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
    console.log(`[schema] Added ${table}.${column}`);
  }
}

/** Idempotent — contractors/contracts tables and columns required by Drizzle schema. */
export async function ensureContractorsAndContractsSchema(db: SchemaDb): Promise<void> {
  if (!(await tableExists(db, "contractors"))) {
    await db.execute(sql`
      CREATE TABLE \`contractors\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`nameEn\` varchar(256) NOT NULL,
        \`nameAr\` varchar(256) NULL,
        \`contactPerson\` varchar(128) NULL,
        \`phone\` varchar(32) NULL,
        \`email\` varchar(320) NULL,
        \`address\` text NULL,
        \`contractorCode\` varchar(64) NULL,
        \`trn\` varchar(15) NULL,
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`deletedAt\` timestamp NULL,
        \`deletedBy\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`contractors_contractorCode_unique\` (\`contractorCode\`)
      )
    `);
    console.log("[schema] Created contractors table");
  } else {
    await ensureColumn(db, "contractors", "trn", "varchar(15) NULL");
    await ensureColumn(db, "contractors", "deletedAt", "timestamp NULL");
    await ensureColumn(db, "contractors", "deletedBy", "int NULL");
  }

  if (!(await tableExists(db, "contracts"))) {
    await db.execute(sql`
      CREATE TABLE \`contracts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`contractNumber\` varchar(128) NOT NULL,
        \`contractName\` varchar(512) NOT NULL,
        \`contractorId\` int NOT NULL,
        \`sectorKey\` varchar(32) NULL,
        \`sectorNameAr\` varchar(128) NULL,
        \`sectorNameEn\` varchar(128) NULL,
        \`startDate\` timestamp NULL,
        \`endDate\` timestamp NULL,
        \`notes\` text NULL,
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`deletedAt\` timestamp NULL,
        \`deletedBy\` int NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`contracts_contractNumber_unique\` (\`contractNumber\`)
      )
    `);
    console.log("[schema] Created contracts table");
  } else {
    await ensureColumn(db, "contracts", "deletedAt", "timestamp NULL");
    await ensureColumn(db, "contracts", "deletedBy", "int NULL");
  }
}
