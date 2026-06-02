import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("No database connection (check DATABASE_URL)");
    process.exit(1);
  }

  try {
    const tables = await db.execute(
      sql.raw("SHOW TABLES LIKE 'sector_accounts'"),
    );
    console.log("sector_accounts table:", tables);
  } catch (e) {
    console.error("SHOW TABLES failed:", (e as Error).message);
  }

  try {
    const accounts = await db.execute(sql.raw("SELECT id, sectorKey, username, isActive FROM sector_accounts LIMIT 10"));
    console.log("accounts:", accounts);
  } catch (e) {
    console.error("SELECT sector_accounts failed:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
