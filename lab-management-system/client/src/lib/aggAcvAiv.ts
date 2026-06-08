/**
 * Aggregate Crushing Value (BS 812-110) & Aggregate Impact Value (BS 812-112)
 * Value = (M₂ / M₁) × 100
 */

export type MechanicalTestVariant = "ACV" | "AIV";

export interface MechanicalSampleInput {
  id: string;
  sampleNumber: string;
  cylinderNo: string;
  condition: "Dry" | "Soaked";
  m1MassBeforeTest: string;
  m2MassPassingSieve: string;
}

export interface MechanicalSampleComputed extends MechanicalSampleInput {
  testValue: number;
  result: "pass" | "fail" | null;
}

export interface MechanicalTestConfig {
  variant: MechanicalTestVariant;
  testTypeCode: string;
  formTemplate: string;
  standard: string;
  referenceEn: string;
  referenceAr: string;
  defaultLimit: string;
  limitHintEn: string;
  limitHintAr: string;
  formulaExtraEn: string;
  formulaExtraAr: string;
  m2LabelEn: string;
  m2LabelAr: string;
  specRows: Array<{ labelEn: string; labelAr: string; value: string }>;
  repeatabilityThreshold?: number;
}

export const ACV_CONFIG: MechanicalTestConfig = {
  variant: "ACV",
  testTypeCode: "AGG_CRUSHING",
  formTemplate: "acv",
  standard: "BS 812: Part 110: 1990",
  referenceEn: "BS 812: Part 110: 1990 — Aggregate Crushing Value",
  referenceAr: "BS 812: Part 110: 1990 — قيمة سحق الركام",
  defaultLimit: "30",
  limitHintEn: "Wearing ≤30% | Base ≤45% | Verify with project spec",
  limitHintAr: "طبقة تآكل ≤30% | طبقة أساس ≤45%",
  formulaExtraEn: "Load: 40 kN over 10 minutes",
  formulaExtraAr: "الحمل: 40 kN خلال 10 دقائق",
  m2LabelEn: "Mass passing 2.36mm sieve after test (g)",
  m2LabelAr: "الكتلة المارة من منخل 2.36mm بعد الاختبار (g)",
  specRows: [
    { labelEn: "Standard sample mass:", labelAr: "الكتلة القياسية للعينة:", value: "≈ 3 kg" },
    { labelEn: "Sieve after test:", labelAr: "حجم المنخل بعد:", value: "2.36 mm" },
    { labelEn: "Applied load:", labelAr: "الحمل المطبق:", value: "40 kN / 10 min" },
    { labelEn: "Sample sieve size:", labelAr: "حجم المنخل للعينة:", value: "14.0 mm / 10.0 mm" },
  ],
};

export const AIV_CONFIG: MechanicalTestConfig = {
  variant: "AIV",
  testTypeCode: "AGG_IMPACT",
  formTemplate: "aiv",
  standard: "BS 812: Part 112: 1990",
  referenceEn: "BS 812: Part 112: 1990 — Aggregate Impact Value",
  referenceAr: "BS 812: Part 112: 1990 — قيمة تأثير الركام",
  defaultLimit: "25",
  limitHintEn: "Wearing ≤25% | Base ≤30% | Verify with project spec",
  limitHintAr: "طبقة تآكل ≤25% | طبقة أساس ≤30%",
  formulaExtraEn: "15 blows of 13.5–14.0 kg hammer from 380 mm height",
  formulaExtraAr: "15 ضربة بمطرقة 13.5–14.0 كجم من ارتفاع 380 مم",
  m2LabelEn: "Mass passing 2.36mm after 15 blows (g)",
  m2LabelAr: "الكتلة المارة من 2.36mm بعد 15 ضربة (g)",
  specRows: [
    { labelEn: "Number of blows:", labelAr: "عدد الضربات:", value: "15" },
    { labelEn: "Hammer mass:", labelAr: "وزن المطرقة:", value: "13.5–14.0 kg" },
    { labelEn: "Drop height:", labelAr: "ارتفاع السقوط:", value: "380 mm" },
    { labelEn: "Sieve after test:", labelAr: "حجم المنخل بعد:", value: "2.36 mm" },
  ],
  repeatabilityThreshold: 3,
};

export function parseMechanicalLimit(raw: string, fallback: string): number {
  const n = parseFloat(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const fb = parseFloat(fallback);
  return Number.isFinite(fb) && fb > 0 ? fb : 30;
}

export function computeMechanicalSample(
  sample: MechanicalSampleInput,
  limit: number,
): MechanicalSampleComputed {
  const m1 = parseFloat(sample.m1MassBeforeTest);
  const m2 = parseFloat(sample.m2MassPassingSieve);
  if (!Number.isFinite(m1) || !Number.isFinite(m2) || m1 <= 0 || m2 <= 0) {
    return { ...sample, testValue: 0, result: null };
  }
  const testValue = parseFloat(((m2 / m1) * 100).toFixed(1));
  return {
    ...sample,
    testValue,
    result: testValue <= limit ? "pass" : "fail",
  };
}

export function computeMechanicalResults(
  samples: MechanicalSampleInput[],
  acceptanceLimitRaw: string,
  defaultLimit: string,
  repeatabilityThreshold?: number,
): {
  computedSamples: MechanicalSampleComputed[];
  validSamples: MechanicalSampleComputed[];
  avgValue: number;
  overallResult: "pass" | "fail" | null;
  overallStatus: "pass" | "fail" | "pending";
  twoResultsDiffer: boolean;
} {
  const limit = parseMechanicalLimit(acceptanceLimitRaw, defaultLimit);
  const computedSamples = samples.map(s => computeMechanicalSample(s, limit));
  const validSamples = computedSamples.filter(s => s.testValue > 0 && s.result != null);
  const avgValue =
    validSamples.length > 0
      ? parseFloat(
          (validSamples.reduce((sum, s) => sum + s.testValue, 0) / validSamples.length).toFixed(1),
        )
      : 0;
  const overallResult: "pass" | "fail" | null =
    avgValue > 0 ? (avgValue <= limit ? "pass" : "fail") : null;
  const overallStatus: "pass" | "fail" | "pending" =
    overallResult === "pass" ? "pass" : overallResult === "fail" ? "fail" : "pending";

  const twoResultsDiffer =
    repeatabilityThreshold != null &&
    validSamples.length >= 2 &&
    Math.abs(validSamples[0].testValue - validSamples[1].testValue) > repeatabilityThreshold;

  return { computedSamples, validSamples, avgValue, overallResult, overallStatus, twoResultsDiffer };
}

export function newMechanicalSample(index: number): MechanicalSampleInput {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNumber: `S${index + 1}`,
    cylinderNo: "",
    condition: "Dry",
    m1MassBeforeTest: "",
    m2MassPassingSieve: "",
  };
}
