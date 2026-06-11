import { eq, sql } from "drizzle-orm";
import { samples } from "../../drizzle/schema";
import { getDb, getNextRetestNumber } from "../db";

/**
 * Generate a unique sample code.
 * Format: LAB-YYYY-MM-NNNN   (e.g. LAB-2026-05-0001)
 * NNNN is a sequence that resets each calendar month. It is normally 4 digits
 * but is allowed to grow (10000+) so the month is never "stuck" at a cap.
 *
 * Old timestamp codes (LAB-YYYY-MMDD-HHMMSS-NNN) are left untouched in the
 * database. When computing the next sequence we match ONLY the new monthly
 * format (trailing run of digits with nothing after), so old codes and future
 * retest suffixes (e.g. LAB-2026-05-0001-R1) are ignored.
 *
 * After computing the next sequence we probe for the first code that is not
 * already taken. This makes generation resilient to gaps, concurrent inserts
 * and any previously corrupted/high sequence values.
 */
export async function generateSampleCode(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `LAB-${year}-${month}`;

  // Matches the new monthly format LAB-YYYY-MM-<digits> (4 or more digits, nothing after).
  const newFormatRegexp = `^LAB-${year}-${month}-[0-9]+$`;

  const db = await getDb();
  if (!db) {
    // DB unavailable: fall back to a wide timestamp tail (different magnitude than
    // the sequential counter) so it is very unlikely to clash with real sequences.
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  try {
    const result = await db
      .select({
        maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING_INDEX(${samples.sampleCode}, '-', -1) AS UNSIGNED)), 0)`,
      })
      .from(samples)
      .where(sql`${samples.sampleCode} REGEXP ${newFormatRegexp}`);

    let next = Number(result[0]?.maxSeq ?? 0) + 1;

    // Probe forward for the first free code (handles gaps, concurrency and any
    // stale high values that previously collided).
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = `${prefix}-${String(next).padStart(4, "0")}`;
      const existing = await db
        .select({ id: samples.id })
        .from(samples)
        .where(eq(samples.sampleCode, candidate))
        .limit(1);
      if (existing.length === 0) return candidate;
      next++;
    }

    // Extremely unlikely: could not find a free sequential code; use a timestamp tail.
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  } catch (error) {
    console.error("Error generating sample code:", error);
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }
}

/** Retest code: {rootCode}-R{n} where n = max existing + 1 (includes soft-deleted). */
export async function generateRetestSampleCode(
  rootSampleId: number,
  rootSampleCode: string
): Promise<string> {
  const n = await getNextRetestNumber(rootSampleId);
  const candidate = `${rootSampleCode}-R${n}`;
  const db = await getDb();
  if (!db) return candidate;

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = attempt === 0 ? candidate : `${rootSampleCode}-R${n + attempt}`;
    const existing = await db
      .select({ id: samples.id })
      .from(samples)
      .where(eq(samples.sampleCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  return `${rootSampleCode}-R${n}-${Date.now().toString().slice(-4)}`;
}
