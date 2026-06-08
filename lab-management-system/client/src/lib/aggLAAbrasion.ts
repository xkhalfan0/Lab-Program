/**
 * Los Angeles Abrasion — ASTM C131-89 / ASTM C535-89 / BS 812-102:1989
 * LA Value = [(M₁ - M₂) / M₁] × 100
 */

export type LAGradingGroup = "A" | "B" | "C" | "D";

export interface LAGradingFraction {
  size: string;
  mass: number;
  qty?: number;
}

export interface LAGradingGroupSpec {
  label: string;
  sizeRange: string;
  balls: number;
  revolutions: number;
  requiredMass: number;
  fractions: LAGradingFraction[];
  descriptionEn: string;
  descriptionAr: string;
}

export const LA_GRADING_GROUPS: Record<LAGradingGroup, LAGradingGroupSpec> = {
  A: {
    label: "Group A",
    sizeRange: "37.5 – 25.0 mm",
    balls: 12,
    revolutions: 500,
    requiredMass: 5000,
    fractions: [{ size: "37.5 – 25.0 mm", mass: 1250, qty: 4 }],
    descriptionEn: "Coarse large aggregate",
    descriptionAr: "ركام خشن كبير",
  },
  B: {
    label: "Group B",
    sizeRange: "25.0 – 19.0 mm",
    balls: 11,
    revolutions: 500,
    requiredMass: 5000,
    fractions: [
      { size: "25.0 – 19.0 mm", mass: 2500 },
      { size: "19.0 – 12.5 mm", mass: 2500 },
    ],
    descriptionEn: "Medium coarse aggregate",
    descriptionAr: "ركام خشن متوسط",
  },
  C: {
    label: "Group C",
    sizeRange: "19.0 – 12.5 mm",
    balls: 8,
    revolutions: 500,
    requiredMass: 5000,
    fractions: [
      { size: "19.0 – 12.5 mm", mass: 2500 },
      { size: "12.5 – 9.5 mm", mass: 2500 },
    ],
    descriptionEn: "Medium aggregate",
    descriptionAr: "ركام متوسط",
  },
  D: {
    label: "Group D",
    sizeRange: "12.5 – 9.5 mm",
    balls: 6,
    revolutions: 500,
    requiredMass: 5000,
    fractions: [{ size: "12.5 – 9.5 mm", mass: 5000 }],
    descriptionEn: "Fine aggregate",
    descriptionAr: "ركام ناعم",
  },
};

export const LA_STANDARD = "ASTM C131-89 / BS 812-102:1989";
export const LA_REQUIRED_MASS_G = 5000;
export const LA_MASS_TOLERANCE_G = 10;

export interface LAASampleInput {
  id: string;
  sampleNumber: string;
  gradingGroup: LAGradingGroup;
  m1BeforeTest: string;
  m2RetainedOn1_7mm: string;
}

export interface LAASampleComputed extends LAASampleInput {
  laValue: number;
  result: "pass" | "fail" | null;
  m1Warning: boolean;
}

export function parseAcceptanceLimit(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export function computeLASample(
  sample: LAASampleInput,
  acceptanceLimit: number,
): LAASampleComputed | null {
  const m1 = parseFloat(sample.m1BeforeTest);
  const m2 = parseFloat(sample.m2RetainedOn1_7mm);
  if (!Number.isFinite(m1) || !Number.isFinite(m2) || m1 <= 0 || m2 <= 0) {
    return {
      ...sample,
      laValue: 0,
      result: null,
      m1Warning: Number.isFinite(m1) && m1 > 0 && Math.abs(m1 - LA_REQUIRED_MASS_G) > LA_MASS_TOLERANCE_G,
    };
  }

  const laValue = parseFloat((((m1 - m2) / m1) * 100).toFixed(1));
  return {
    ...sample,
    laValue,
    result: laValue <= acceptanceLimit ? "pass" : "fail",
    m1Warning: Math.abs(m1 - LA_REQUIRED_MASS_G) > LA_MASS_TOLERANCE_G,
  };
}

export function computeLAResults(
  samples: LAASampleInput[],
  acceptanceLimitRaw: string,
): {
  computedSamples: LAASampleComputed[];
  validSamples: LAASampleComputed[];
  avgLA: number;
  avgResult: "pass" | "fail" | null;
  overallResult: "pass" | "fail" | "pending";
} {
  const limit = parseAcceptanceLimit(acceptanceLimitRaw);
  const computedSamples = samples.map(s => computeLASample(s, limit)!);
  const validSamples = computedSamples.filter(s => s.laValue > 0 && s.result != null);
  const avgLA =
    validSamples.length > 0
      ? parseFloat(
          (validSamples.reduce((sum, s) => sum + s.laValue, 0) / validSamples.length).toFixed(1),
        )
      : 0;
  const avgResult: "pass" | "fail" | null =
    avgLA > 0 ? (avgLA <= limit ? "pass" : "fail") : null;
  const overallResult: "pass" | "fail" | "pending" =
    avgResult === "pass" ? "pass" : avgResult === "fail" ? "fail" : "pending";

  return { computedSamples, validSamples, avgLA, avgResult, overallResult };
}
