/**
 * Concrete aggregate blend — MSRC / OPC mix design specifications.
 * Limits are fixed (red cells); always resolve from this catalog for display and pass/fail.
 */

export type AggSpecKey = "MSRC" | "OPC";

export type AggSpecRow = { mm: number; lower: number; upper: number };

export const AGG_BLEND_SPECS: Record<AggSpecKey, { label: string; rows: AggSpecRow[] }> = {
  MSRC: {
    label: "MSRC",
    rows: [
      { mm: 37.5, lower: 100, upper: 100 },
      { mm: 20, lower: 95, upper: 100 },
      { mm: 5, lower: 35, upper: 55 },
      { mm: 0.6, lower: 10, upper: 35 },
      { mm: 0.15, lower: 0, upper: 10 },
      { mm: 0.075, lower: 0, upper: 3 },
    ],
  },
  OPC: {
    label: "OPC",
    rows: [
      { mm: 10, lower: 95, upper: 100 },
      { mm: 5, lower: 30, upper: 65 },
      { mm: 2.36, lower: 20, upper: 50 },
      { mm: 1.18, lower: 15, upper: 40 },
      { mm: 0.6, lower: 10, upper: 30 },
      { mm: 0.3, lower: 5, upper: 15 },
      { mm: 0.15, lower: 0, upper: 10 },
      { mm: 0.075, lower: 0, upper: 3 },
    ],
  },
};

export function sieveKey(mm: number): string {
  return String(Math.round(mm * 1000) / 1000);
}

export function normalizeAggSpecType(raw: unknown): AggSpecKey {
  const s = String(raw ?? "").trim().toUpperCase();
  return s === "OPC" ? "OPC" : "MSRC";
}

export function resolveAggBlendLimits(
  specType: unknown,
  sieveMm: number,
): { lower: number | null; upper: number | null } {
  const key = normalizeAggSpecType(specType);
  const sk = sieveKey(sieveMm);
  const row = AGG_BLEND_SPECS[key].rows.find(
    r => sieveKey(r.mm) === sk || Math.abs(r.mm - sieveMm) < 1e-6,
  );
  if (!row) return { lower: null, upper: null };
  return { lower: row.lower, upper: row.upper };
}

/** Renders 0 as "0" (not a dash) — React skips rendering bare `{0}`. */
export function formatSpecLimit(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "—";
}
