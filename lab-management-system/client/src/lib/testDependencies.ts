import {
  getOfficialTestByCode,
  normalizeTestCode,
} from "../../../server/data/official-test-catalog";

export { normalizeTestCode };

export function getRequiredTestsForCode(code: string | null | undefined): readonly string[] {
  return getOfficialTestByCode(code)?.requiredTests ?? [];
}

export function selectedTestsIncludeCode(
  selectedTests: { testTypeCode: string }[],
  reqCode: string,
): boolean {
  const norm = normalizeTestCode(reqCode) ?? reqCode;
  return selectedTests.some((s) => {
    const c = normalizeTestCode(s.testTypeCode) ?? s.testTypeCode;
    return c === norm;
  });
}
