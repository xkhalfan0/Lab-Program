/**
 * Elongation Index of Coarse Aggregate — BS 812 Section 105.2:1990
 * 10 mm aggregate: direct M3/M2 method (Excel "10mm Agg" sheet).
 * 20 mm aggregate: reduction-factor method (Excel "20mm Agg" sheet).
 */

export const ELONGATION_STANDARD = "BS 812 Section 105.2:1990";
export const ELONGATION_MAX_LIMIT = 30;
const DISCARD_PCT = 5;

export type ElongAggSize = "10mm" | "20mm";

export const ELONGATION_FRACTIONS = [
  { id: "50-37.5", labelEn: "50.0–37.5", labelAr: "50.0–37.5" },
  { id: "37.5-28", labelEn: "37.5–28.0", labelAr: "37.5–28.0" },
  { id: "28-20", labelEn: "28.0–20.0", labelAr: "28.0–20.0" },
  { id: "20-14", labelEn: "20.0–14.0", labelAr: "20.0–14.0" },
  { id: "14-10", labelEn: "14.0–10.0", labelAr: "14.0–10.0" },
  { id: "10-6.3", labelEn: "10.0–6.30", labelAr: "10.0–6.30" },
] as const;

export type ElongFractionId = (typeof ELONGATION_FRACTIONS)[number]["id"];

export interface ElongFractionInput {
  id: ElongFractionId;
  actualSampleG: string;
  /** 20 mm only — reduced weight of test fraction */
  reducedWtG: string;
  /** 10 mm: mass of elongated particles; 20 mm: elongated from reduced portion */
  elongatedG: string;
}

export interface ElongFractionComputed {
  id: ElongFractionId;
  labelEn: string;
  labelAr: string;
  actualSampleG: number | null;
  retainedPct: number | null;
  discarded: boolean;
  /** Retained wt used in M1 (20 mm) or M2 denominator (10 mm) */
  retainedWt: number | null;
  reducedWtG: number | null;
  reductionFactor: number | null;
  elongatedReducedG: number | null;
  elongatedOriginalG: number | null;
  notes: string;
}

function parseG(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolveElongAggSize(testSubType?: string | null): ElongAggSize {
  const s = String(testSubType ?? "").toLowerCase();
  if (s === "agg_20mm" || s.includes("20mm") || s.includes("20_mm")) return "20mm";
  if (s === "agg_10mm" || s.includes("10mm") || s.includes("10_mm")) return "10mm";
  return "20mm";
}

export function roundElongationIndex(value: number): number {
  return Math.round(value + Number.EPSILON);
}

export function initElongationInputs(): ElongFractionInput[] {
  return ELONGATION_FRACTIONS.map(f => ({
    id: f.id,
    actualSampleG: "",
    reducedWtG: "",
    elongatedG: "",
  }));
}

export function computeElongationWorksheet(
  inputs: ElongFractionInput[],
  aggSize: ElongAggSize,
): {
  rows: ElongFractionComputed[];
  totalRetainedMass: number | null;
  totalElongatedMass: number | null;
  elongationIndex: number | null;
  overallResult: "pass" | "fail" | "pending";
} {
  const meta = Object.fromEntries(ELONGATION_FRACTIONS.map(f => [f.id, f])) as Record<
    ElongFractionId,
    (typeof ELONGATION_FRACTIONS)[number]
  >;

  const actuals = inputs.map(row => parseG(row.actualSampleG));
  const totalActual = actuals.reduce((s, v) => s + (v ?? 0), 0);

  const rows: ElongFractionComputed[] = inputs.map((row, i) => {
    const f = meta[row.id];
    const actual = actuals[i];
    const retainedPct =
      actual != null && totalActual > 0 ? (actual / totalActual) * 100 : null;
    const discarded = retainedPct != null && retainedPct < DISCARD_PCT;

    const reducedIn = parseG(row.reducedWtG);
    const reducedWtG =
      aggSize === "20mm" && !discarded && actual != null
        ? reducedIn ?? actual
        : reducedIn;

    const reductionFactor =
      aggSize === "20mm" && !discarded && actual != null && actual > 0 && reducedWtG != null
        ? reducedWtG / actual
        : null;

    const elongatedReducedG = !discarded ? parseG(row.elongatedG) : null;
    const elongatedOriginalG =
      aggSize === "20mm" && !discarded && elongatedReducedG != null
        ? reductionFactor != null && reductionFactor > 0
          ? elongatedReducedG / reductionFactor
          : elongatedReducedG
        : elongatedReducedG;

    const retainedWt = !discarded && actual != null ? actual : null;

    return {
      id: row.id,
      labelEn: f.labelEn,
      labelAr: f.labelAr,
      actualSampleG: actual,
      retainedPct: retainedPct != null ? Number(retainedPct.toFixed(2)) : null,
      discarded,
      retainedWt,
      reducedWtG: aggSize === "20mm" && !discarded ? reducedWtG : null,
      reductionFactor:
        reductionFactor != null ? Number(reductionFactor.toFixed(4)) : null,
      elongatedReducedG,
      elongatedOriginalG,
      notes: discarded ? "Discard" : "",
    };
  });

  const totalRetainedMass = rows.reduce((s, r) => s + (r.retainedWt ?? 0), 0);
  const totalElongatedMass = rows.reduce((s, r) => s + (r.elongatedOriginalG ?? 0), 0);

  const hasData = rows.some(r => r.actualSampleG != null);
  const denom = totalRetainedMass > 0 ? totalRetainedMass : null;
  const hasElongatedEntry = rows.some(r => !r.discarded && r.elongatedOriginalG != null);

  let elongationIndex: number | null = null;
  if (denom != null && denom > 0 && hasElongatedEntry) {
    elongationIndex = roundElongationIndex((totalElongatedMass / denom) * 100);
  }

  const overallResult: "pass" | "fail" | "pending" = !hasData
    ? "pending"
    : elongationIndex == null
      ? "pending"
      : elongationIndex <= ELONGATION_MAX_LIMIT
        ? "pass"
        : "fail";

  return {
    rows,
    totalRetainedMass: denom,
    totalElongatedMass: hasElongatedEntry ? totalElongatedMass : null,
    elongationIndex,
    overallResult,
  };
}

/** Grading report sieve sizes linked to fraction retained % (Excel bottom table). */
export const ELONGATION_GRADING_SIEVES = [
  { mm: 50, fractionId: "50-37.5" as ElongFractionId },
  { mm: 37.5, fractionId: "37.5-28" as ElongFractionId },
  { mm: 28, fractionId: "28-20" as ElongFractionId },
  { mm: 20, fractionId: "20-14" as ElongFractionId },
  { mm: 14, fractionId: "14-10" as ElongFractionId },
  { mm: 10, fractionId: "10-6.3" as ElongFractionId },
  { mm: 6.3, fractionId: null },
];
