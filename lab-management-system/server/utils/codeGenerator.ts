import { sql } from "drizzle-orm";
import { samples } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Generate a unique sample code.
 * Format: LAB-YYYY-MM-NNNN   (e.g. LAB-2026-05-0001)
 * NNNN is a 4-digit sequence that resets each calendar month.
 *
 * Old timestamp codes (LAB-YYYY-MMDD-HHMMSS-NNN) are left untouched in the
 * database. When computing the next sequence we match ONLY the new monthly
 * format (exactly 4 trailing digits), so old codes and future retest suffixes
 * (e.g. LAB-2026-05-0001-R1) are ignored.
 */
export async function generateSampleCode(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `LAB-${year}-${month}`;

  // Matches ONLY the new monthly format: LAB-YYYY-MM-NNNN (4 digits, nothing after)
  const newFormatRegexp = `^LAB-${year}-${month}-[0-9]{4}$`;

  try {
    const db = await getDb();
    if (!db) return `${prefix}-0001`;

    const result = await db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING_INDEX(${samples.sampleCode}, '-', -1) AS UNSIGNED)), 0)`,
      })
      .from(samples)
      .where(sql`${samples.sampleCode} REGEXP ${newFormatRegexp}`);

    let nextSequence = (result[0]?.maxSeq ?? 0) + 1;
    // Safety: cap at 9999 per month (extremely unlikely to be reached)
    if (nextSequence > 9999) nextSequence = 9999;

    return `${prefix}-${String(nextSequence).padStart(4, "0")}`;
  } catch (error) {
    console.error("Error generating sample code:", error);
    // Fallback with timestamp tail to keep it unique if the DB is unavailable
    const fallback = Date.now().toString().slice(-4);
    return `${prefix}-${fallback}`;
  }
}
