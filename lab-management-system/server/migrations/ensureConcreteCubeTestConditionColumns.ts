import { sql } from "drizzle-orm";

const TABLE = "concrete_test_groups";

const COLUMNS: Array<{ name: string; definition: string; after: string }> = [
  { name: "labCuringTemperature", definition: "varchar(64) NULL", after: "moistureCondition" },
  { name: "labCuringRh", definition: "varchar(64) NULL", after: "labCuringTemperature" },
  { name: "loadingRate", definition: "varchar(32) NULL", after: "labCuringRh" },
  { name: "surfaceConditionAtTest", definition: "varchar(128) NULL", after: "loadingRate" },
  { name: "cappingMethod", definition: "varchar(128) NULL", after: "surfaceConditionAtTest" },
];

type ColumnRow = { COLUMN_NAME: string };

type SchemaDb = { execute: (query: unknown) => Promise<unknown> };

async function tableExists(db: SchemaDb): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${TABLE}
  `);
  const rows = result as unknown as { TABLE_NAME: string }[];
  return rows.length > 0;
}

async function columnExists(db: SchemaDb, columnName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${TABLE}
      AND COLUMN_NAME = ${columnName}
  `);
  const rows = result as unknown as ColumnRow[];
  return rows.some(r => r.COLUMN_NAME === columnName);
}

/** Idempotent — safe to run on every server start. */
export async function ensureConcreteCubeTestConditionColumns(db: SchemaDb): Promise<void> {
  if (!(await tableExists(db))) return;

  for (const col of COLUMNS) {
    if (await columnExists(db, col.name)) continue;
    await db.execute(
      sql.raw(
        `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${col.name}\` ${col.definition} AFTER \`${col.after}\``,
      ),
    );
    console.log(`[schema] Added ${TABLE}.${col.name}`);
  }
}
