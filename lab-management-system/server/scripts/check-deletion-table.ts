import "dotenv/config";
import { getDb } from "../db";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database connection failed");
    process.exit(1);
  }

  try {
    // Check if deletion_requests table exists
    const result = await db.execute(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'deletion_requests'
    `);

    const count = (result as any)[0][0].count;

    if (count === 1) {
      console.log("✅ deletion_requests table exists!");

      // Show columns
      const columns = await db.execute(`DESCRIBE deletion_requests`);
      console.log("\nColumns:", columns);
    } else {
      console.log("❌ deletion_requests table NOT found");
    }
  } catch (e) {
    console.error("Error:", e);
  }

  process.exit(0);
}

main();
