import { sql } from "drizzle-orm";

type SchemaDb = { execute: (query: unknown) => Promise<unknown> };

async function tableExists(db: SchemaDb, table: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `);
  return (result as { TABLE_NAME: string }[]).length > 0;
}

async function columnExists(db: SchemaDb, table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
      AND COLUMN_NAME = ${column}
  `);
  return (result as Record<string, unknown>[]).some(
    (r) => String((r.COLUMN_NAME ?? (r as { column_name?: string }).column_name) ?? "") === column
  );
}

/** Idempotent — lab VAT/TRN settings + contractor TRN column. */
export async function ensureLabTaxSettings(db: SchemaDb): Promise<void> {
  if (!(await tableExists(db, "lab_settings"))) {
    await db.execute(sql`
      CREATE TABLE \`lab_settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`vatRate\` decimal(6,4) NOT NULL DEFAULT 0.0500,
        \`labTrn\` varchar(15) NULL,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      )
    `);
    await db.execute(sql`
      INSERT INTO \`lab_settings\` (\`vatRate\`, \`labTrn\`) VALUES (0.0500, NULL)
    `);
    console.log("[schema] Created lab_settings with default VAT 5%");
  }

  if (await tableExists(db, "contractors") && !(await columnExists(db, "contractors", "trn"))) {
    await db.execute(sql`
      ALTER TABLE \`contractors\` ADD COLUMN \`trn\` varchar(15) NULL AFTER \`contractorCode\`
    `);
    console.log("[schema] Added contractors.trn");
  }
}
