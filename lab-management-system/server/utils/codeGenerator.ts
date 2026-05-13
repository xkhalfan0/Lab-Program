import { sql, and, like } from "drizzle-orm";
import { samples } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Timestamp-based sample code: LAB-YYYY-MMDD-HHMMSS-NNN
 * Example: LAB-2026-0513-143052-001
 * NNN increments for multiple samples in the same clock second.
 */
function formatTimestampPrefix(d: Date): string {
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `LAB-${y}-${mm}${dd}-${hh}${mi}${ss}`;
}

/** MySQL REGEXP: exact LAB-YYYY-MMDD-HHMMSS-NNN (NNN = 3 digits). */
function regexpNewSampleCode(): string {
  return "^LAB-[0-9]{4}-[0-9]{4}-[0-9]{6}-[0-9]{3}$";
}

export async function generateSampleCode(): Promise<string> {
  const now = new Date();
  const prefix = formatTimestampPrefix(now);
  const likePattern = `${prefix}-%`;

  const db = await getDb();
  if (!db) {
    return `${prefix}-001`;
  }

  const result = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING_INDEX(${samples.sampleCode}, '-', -1) AS UNSIGNED)), 0)`,
    })
    .from(samples)
    .where(
      and(
        like(samples.sampleCode, likePattern),
        sql`${samples.sampleCode} REGEXP ${regexpNewSampleCode()}`
      )
    );

  const next = (result[0]?.maxSeq ?? 0) + 1;
  if (next > 999) {
    // Same-second overflow: bump by 1s in code (extremely rare)
    const bumped = new Date(now.getTime() + 1000);
    const p2 = formatTimestampPrefix(bumped);
    return `${p2}-001`;
  }
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
