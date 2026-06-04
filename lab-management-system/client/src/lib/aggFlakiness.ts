/**
 * Flakiness Index of Coarse Aggregate — BS 812 Section 105.1:1989
 * 10 mm and 20 mm lab Excel worksheets (same subdivision logic as elongation).
 */

import { resolveElongAggSize, type ElongAggSize } from "@/lib/aggElongation";

export type FlakAggSize = ElongAggSize;

export const FLAKINESS_STANDARD = "BS 812 Section 105.1:1989";
export const FLAKINESS_MAX_LIMIT = 25;
const DISCARD_PCT = 5;

export const FLAKINESS_FRACTIONS = [
  { id: "63-50", labelEn: "63.0–50.0", labelAr: "63.0–50.0" },
  { id: "50-37.5", labelEn: "50.0–37.5", labelAr: "50.0–37.5" },
  { id: "37.5-28", labelEn: "37.5–28.0", labelAr: "37.5–28.0" },
  { id: "28-20", labelEn: "28.0–20.0", labelAr: "28.0–20.0" },
  { id: "20-14", labelEn: "20.0–14.0", labelAr: "20.0–14.0" },
  { id: "14-10", labelEn: "14.0–10.0", labelAr: "14.0–10.0" },
  { id: "10-6.3", labelEn: "10.0–6.30", labelAr: "10.0–6.30" },
] as const;

export type FlakFractionId = (typeof FLAKINESS_FRACTIONS)[number]["id"];

export interface FlakFractionInput {
  id: FlakFractionId;
  actualSampleG: string;
  reducedWtG: string;
  flakyG: string;
}

export interface FlakFractionComputed {
  id: FlakFractionId;
  labelEn: string;
  labelAr: string;
  actualSampleG: number | null;
  retainedPct: number | null;
  discarded: boolean;
  retainedWt: number | null;
  reducedWtG: number | null;
  reductionFactor: number | null;
  flakyReducedG: number | null;
  flakyOriginalG: number | null;
  notes: string;
}

function parseG(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export { resolveElongAggSize as resolveFlakAggSize };

export function roundFlakinessIndex(value: number): number {
  return Math.round(value + Number.EPSILON);
}

export function initFlakinessInputs(): FlakFractionInput[] {
  return FLAKINESS_FRACTIONS.map(f => ({
    id: f.id,
    actualSampleG: "",
    reducedWtG: "",
    flakyG: "",
  }));
}

export function computeFlakinessWorksheet(
  inputs: FlakFractionInput[],
  aggSize: FlakAggSize,
): {
  rows: FlakFractionComputed[];
  totalRetainedMass: number | null;
  totalFlakyMass: number | null;
  flakinessIndex: number | null;
  overallResult: "pass" | "fail" | "pending";
} {
  const meta = Object.fromEntries(FLAKINESS_FRACTIONS.map(f => [f.id, f])) as Record<
    FlakFractionId,
    (typeof FLAKINESS_FRACTIONS)[number]
  >;

  const actuals = inputs.map(row => parseG(row.actualSampleG));
  const totalActual = actuals.reduce((s, v) => s + (v ?? 0), 0);

  const rows: FlakFractionComputed[] = inputs.map((row, i) => {
    const f = meta[row.id];
    const actual = actuals[i];
    const retainedPct =
      actual != null && totalActual > 0 ? (actual / totalActual) * 100 : null;
    const discarded = retainedPct != null && retainedPct < DISCARD_PCT;

    const retainedWt = !discarded && actual != null ? actual : null;
    const reducedIn = parseG(row.reducedWtG);
    const reducedWtG =
      !discarded && retainedWt != null ? reducedIn ?? retainedWt : null;

    const factorRetainedOverReduced =
      retainedWt != null && reducedWtG != null && reducedWtG > 0
        ? retainedWt / reducedWtG
        : null;

    const reductionFactor =
      factorRetainedOverReduced != null
        ? aggSize === "20mm"
          ? Number(factorRetainedOverReduced.toFixed(2))
          : Number((actual! / reducedWtG!).toFixed(2))
        : null;

    const flakyReducedG = !discarded ? parseG(row.flakyG) : null;
    const flakyOriginalG =
      !discarded && flakyReducedG != null && factorRetainedOverReduced != null
        ? Number((flakyReducedG * factorRetainedOverReduced).toFixed(1))
        : flakyReducedG;

    return {
      id: row.id,
      labelEn: f.labelEn,
      labelAr: f.labelAr,
      actualSampleG: actual,
      retainedPct: retainedPct != null ? Number(retainedPct.toFixed(1)) : null,
      discarded,
      retainedWt,
      reducedWtG: !discarded ? reducedWtG : null,
      reductionFactor,
      flakyReducedG,
      flakyOriginalG,
      notes: discarded ? "Discard" : "",
    };
  });

  const totalRetainedMass = rows.reduce((s, r) => s + (r.retainedWt ?? 0), 0);
  const totalFlakyMass = rows.reduce((s, r) => s + (r.flakyOriginalG ?? 0), 0);

  const hasData = rows.some(r => r.actualSampleG != null);
  const denom = totalRetainedMass > 0 ? totalRetainedMass : null;
  const hasFlakyEntry = rows.some(r => !r.discarded && r.flakyOriginalG != null);

  let flakinessIndex: number | null = null;
  if (denom != null && denom > 0 && hasFlakyEntry) {
    flakinessIndex = roundFlakinessIndex((totalFlakyMass / denom) * 100);
  }

  const overallResult: "pass" | "fail" | "pending" = !hasData
    ? "pending"
    : flakinessIndex == null
      ? "pending"
      : flakinessIndex <= FLAKINESS_MAX_LIMIT
        ? "pass"
        : "fail";

  return {
    rows,
    totalRetainedMass: denom,
    totalFlakyMass: hasFlakyEntry ? totalFlakyMass : null,
    flakinessIndex,
    overallResult,
  };
}

export const FLAKINESS_GRADING_SIEVES = [
  { mm: 63, fractionId: "63-50" as FlakFractionId },
  { mm: 50, fractionId: "50-37.5" as FlakFractionId },
  { mm: 37.5, fractionId: "37.5-28" as FlakFractionId },
  { mm: 28, fractionId: "28-20" as FlakFractionId },
  { mm: 20, fractionId: "20-14" as FlakFractionId },
  { mm: 14, fractionId: "14-10" as FlakFractionId },
  { mm: 10, fractionId: "10-6.3" as FlakFractionId },
  { mm: 6.3, fractionId: null },
];
