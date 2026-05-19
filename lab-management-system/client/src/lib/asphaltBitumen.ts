/** Canonical and legacy codes for Bitumen Extraction. */
export const BITUMEN_EXTRACTION_TEST_CODES = ["ASPH_BITUMEN_EXTRACT", "DIST-2026-038"] as const;

export function extractBitumenContentFromExtractionResult(
  result: { summaryValues?: unknown; formData?: unknown } | null | undefined,
): number | undefined {
  if (!result) return undefined;
  const summary = result.summaryValues as Record<string, unknown> | null | undefined;
  const formData = result.formData as Record<string, unknown> | null | undefined;

  if (summary?.avgBitumen != null && summary.avgBitumen !== "") {
    const n = Number(summary.avgBitumen);
    if (!Number.isNaN(n)) return parseFloat(n.toFixed(2));
  }
  if (formData?.avgBitumen != null && formData.avgBitumen !== "") {
    const n = Number(formData.avgBitumen);
    if (!Number.isNaN(n)) return parseFloat(n.toFixed(2));
  }
  if (formData?.bitumenContent != null && formData.bitumenContent !== "") {
    const n = Number(formData.bitumenContent);
    if (!Number.isNaN(n)) return parseFloat(n.toFixed(2));
  }
  const calculations = formData?.calculations as { pgBinder?: unknown } | undefined;
  if (calculations?.pgBinder != null && calculations.pgBinder !== "") {
    const n = Number(calculations.pgBinder);
    if (!Number.isNaN(n)) return parseFloat(n.toFixed(2));
  }
  const sample = formData?.sample as { pgBinder?: unknown } | undefined;
  if (sample?.pgBinder != null && sample.pgBinder !== "") {
    const n = Number(sample.pgBinder);
    if (!Number.isNaN(n)) return parseFloat(n.toFixed(2));
  }
  return undefined;
}

export function formatBitumenPercent(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}
