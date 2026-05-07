import "dotenv/config";
import { writeFileSync } from "fs";
import { createConnection } from "mysql2/promise";

const CODES = [
  "ASPH_SPRAY",
  "ASPH_SPRAY_SS1",
  "ASPH_SPRAY_SS1H",
  "ASPH_SPRAY_CRS1",
  "ASPH_SPRAY_MC30",
  "ASPH_SPRAY_MC70",
  "ASPH_SPRAY_MC250",
  "ASPH_SPRAY_CUSTOM",
  "AGG_LA_ABRASION",
  "CONC_FOAM_CUBE",
  "CONC_MIX_GRAD",
];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const dbUrl = new URL(process.env.DATABASE_URL);
const conn = await createConnection({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "3306", 10),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  multipleStatements: true,
});

const placeholders = CODES.map(() => "?").join(", ");

const [distributionCounts] = await conn.query(
  `
  SELECT testType, COUNT(*) as distribution_count
  FROM distributions
  WHERE testType IN (${placeholders})
  GROUP BY testType
  `,
  CODES
);

const [specializedCounts] = await conn.query(
  `
  SELECT testTypeCode, COUNT(*) as result_count
  FROM specialized_test_results
  WHERE testTypeCode IN (${placeholders})
  GROUP BY testTypeCode
  `,
  CODES
);

const [testTypeRows] = await conn.query(
  `
  SELECT *
  FROM test_types
  WHERE code IN (${placeholders})
  ORDER BY code
  `,
  CODES
);

const [distributionRows] = await conn.query(
  `
  SELECT *
  FROM distributions
  WHERE testType IN (${placeholders})
  ORDER BY id
  `,
  CODES
);

const [specializedRows] = await conn.query(
  `
  SELECT *
  FROM specialized_test_results
  WHERE testTypeCode IN (${placeholders})
  ORDER BY id
  `,
  CODES
);

function toSqlValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function buildInsert(table, rows) {
  if (!rows || rows.length === 0) return `-- No rows for ${table}\n`;
  const cols = Object.keys(rows[0]);
  const valuesSql = rows
    .map((row) => `(${cols.map((c) => toSqlValue(row[c])).join(", ")})`)
    .join(",\n");
  return `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES\n${valuesSql};\n`;
}

const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const backupPath = `./backup-remove-test-types-${ts}.sql`;

const backupSql = [
  "-- Backup for potentially removed test type codes",
  `-- Generated at ${new Date().toISOString()}`,
  `-- Codes: ${CODES.join(", ")}`,
  "",
  "START TRANSACTION;",
  "",
  buildInsert("test_types", testTypeRows),
  "",
  buildInsert("distributions", distributionRows),
  "",
  buildInsert("specialized_test_results", specializedRows),
  "",
  "COMMIT;",
  "",
].join("\n");

writeFileSync(backupPath, backupSql, "utf-8");

console.log(JSON.stringify({
  distributionCounts,
  specializedCounts,
  testTypeRows,
  backupPath,
  backupCounts: {
    test_types: testTypeRows.length,
    distributions: distributionRows.length,
    specialized_test_results: specializedRows.length,
  },
}, null, 2));

await conn.end();
