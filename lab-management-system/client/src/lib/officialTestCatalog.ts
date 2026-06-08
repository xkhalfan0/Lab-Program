import {
  OFFICIAL_TEST_CATALOG,
  getOfficialTestByCode,
  normalizeTestCode,
  type OfficialTest,
} from "../../../server/data/official-test-catalog";

export { getOfficialTestByCode, normalizeTestCode };

/** Active tests from the official catalog (source of truth for codes, names, categories). */
export function getOfficialTestCatalog(): OfficialTest[] {
  return OFFICIAL_TEST_CATALOG.filter((t) => t.isActive !== false);
}

/** Display name from official catalog (resolves legacy codes e.g. DIST-2026-042). */
export function getOfficialTestDisplayName(
  code: string | null | undefined,
  lang: "ar" | "en",
): string | null {
  const test = getOfficialTestByCode(code);
  if (!test) return null;
  return lang === "ar" ? test.nameAr : test.nameEn;
}

/** Prefer official catalog label; fall back to DB/API names when code is unknown. */
export function resolveOfficialTestLabel(
  code: string | null | undefined,
  lang: "ar" | "en",
  fallback?: { nameEn?: string | null; nameAr?: string | null },
): string {
  const fromCatalog = getOfficialTestDisplayName(code, lang);
  if (fromCatalog) return fromCatalog;
  if (lang === "ar" && fallback?.nameAr) return fallback.nameAr;
  if (fallback?.nameEn) return fallback.nameEn;
  return code ?? "—";
}
