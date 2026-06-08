/**
 * Relative density (specific gravity) & water absorption — BS 812-2 / ASTM C127/C128
 */

export const SG_STANDARD_COARSE = "BS 812-2 / ASTM C127";
export const SG_STANDARD_FINE = "BS 812-2 / ASTM C128";

export const SG_TITLES = {
  COARSE: {
    en: "Relative density and water absorption of coarse aggregate",
    ar: "الكثافة النسبية وامتصاص الماء للركام الخشن",
  },
  FINE: {
    en: "Relative density and water absorption of fine aggregate",
    ar: "الكثافة النسبية وامتصاص الماء للركام الناعم",
  },
} as const;

export type AggSgType = keyof typeof SG_TITLES;

export const AGG_SG_SPECS: Record<
  AggSgType,
  { label: string; apparentSgMin: number; absorptionMax: number; standard: string; code: string }
> = {
  COARSE: {
    label: "Coarse Aggregate",
    apparentSgMin: 2.6,
    absorptionMax: 2.0,
    standard: SG_STANDARD_COARSE,
    code: "AGG_SG_COARSE",
  },
  FINE: {
    label: "Fine Aggregate (Sand)",
    apparentSgMin: 2.6,
    absorptionMax: 2.3,
    standard: SG_STANDARD_FINE,
    code: "AGG_SG_FINE",
  },
};

export interface SgComputedValues {
  bulkSgOD: number;
  bulkSgSSD: number;
  apparentSg: number;
  absorption: number;
  apparentResult: "pass" | "fail";
  absorptionResult: "pass" | "fail";
  overallResult: "pass" | "fail";
}

function parseG(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Relative density values — 2 decimal places (e.g. 2.758 → 2.76, 2.754 → 2.75). */
export function roundSgValue(value: number): number {
  return parseFloat(value.toFixed(2));
}

/** Water absorption % — 1 decimal place (e.g. 0.58 → 0.6, 0.52 → 0.5). */
export function roundAbsorptionPct(value: number): number {
  return parseFloat(value.toFixed(1));
}

export function formatSgDisplay(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? roundSgValue(n).toFixed(2) : String(value);
}

export function formatAbsorptionDisplay(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `${roundAbsorptionPct(n).toFixed(1)}%` : String(value);
}

export function evaluateSgResults(
  values: { bulkSgOD: number; bulkSgSSD: number; apparentSg: number; absorption: number },
  spec: (typeof AGG_SG_SPECS)[AggSgType],
): SgComputedValues {
  const apparentResult: "pass" | "fail" =
    values.apparentSg >= spec.apparentSgMin ? "pass" : "fail";
  const absorptionResult: "pass" | "fail" =
    values.absorption <= spec.absorptionMax ? "pass" : "fail";
  return {
    ...values,
    apparentResult,
    absorptionResult,
    overallResult:
      apparentResult === "pass" && absorptionResult === "pass" ? "pass" : "fail",
  };
}

/** Coarse aggregate — A oven dry, B SSD, C in water */
export function computeCoarseSg(
  massOvenDry: string,
  massSSD: string,
  massInWater: string,
  spec: (typeof AGG_SG_SPECS)[AggSgType],
): SgComputedValues | null {
  const a = parseG(massOvenDry);
  const b = parseG(massSSD);
  const c = parseG(massInWater);
  if (a == null || b == null || c == null || b - c === 0 || a - c === 0) return null;

  return evaluateSgResults(
    {
      bulkSgOD: roundSgValue(a / (b - c)),
      bulkSgSSD: roundSgValue(b / (b - c)),
      apparentSg: roundSgValue(a / (a - c)),
      absorption: roundAbsorptionPct(((b - a) / a) * 100),
    },
    spec,
  );
}

/** Fine aggregate — pycnometer method (lab Excel) */
export function computeFineSg(
  pycnometerH2O: string,
  massSSD: string,
  ssdPycH2O: string,
  massOvenDry: string,
  spec: (typeof AGG_SG_SPECS)[AggSgType],
): SgComputedValues | null {
  const pyc = parseG(pycnometerH2O);
  const ssd = parseG(massSSD);
  const ssdPyc = parseG(ssdPycH2O);
  const od = parseG(massOvenDry);
  if (pyc == null || ssd == null || ssdPyc == null || od == null || od === 0) return null;

  const denomBulk = ssd + pyc - ssdPyc;
  const denomApparent = od + pyc - ssdPyc;
  if (denomBulk === 0 || denomApparent === 0) return null;

  return evaluateSgResults(
    {
      bulkSgOD: roundSgValue(od / denomBulk),
      bulkSgSSD: roundSgValue(ssd / denomBulk),
      apparentSg: roundSgValue(od / denomApparent),
      absorption: roundAbsorptionPct(((ssd - od) / od) * 100),
    },
    spec,
  );
}
