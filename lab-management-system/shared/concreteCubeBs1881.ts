/**
 * BS 1881 Part 114–116 — concrete cube age factors, strength, pass/fail.
 */

export const BS1881_NOMINAL_AGES = [3, 7, 14, 28, 56, 90] as const;

export const BS1881_AGE_WINDOWS: ReadonlyArray<{
  nominal: number;
  min: number;
  max: number;
  factorPct: number;
}> = [
  { nominal: 3, min: 2, max: 4, factorPct: 40 },
  { nominal: 7, min: 6, max: 10, factorPct: 65 },
  { nominal: 14, min: 13, max: 17, factorPct: 85 },
  { nominal: 28, min: 26, max: 32, factorPct: 100 },
  { nominal: 56, min: 52, max: 63, factorPct: 112 },
  { nominal: 90, min: 84, max: 98, factorPct: 120 },
];

export const BS1881_FACTORS: Record<number, number> = {
  3: 40,
  7: 65,
  14: 85,
  28: 100,
  56: 112,
  90: 120,
};

export type AgeFactorStatus = "valid" | "invalid" | "beyond90";

export interface AgeFactorResult {
  status: AgeFactorStatus;
  factorPct: number;
  minStrengthMpa: number;
  message?: string;
  interpolated?: boolean;
  rangeLabel?: string;
}

export const FRACTURE_TYPE_OPTIONS = [
  "SF",
  "USF",
  "Type 1",
  "Type 2",
  "Type 3",
  "Type 4",
  "Type 5",
  "Type 6",
] as const;

export type FractureType = (typeof FRACTURE_TYPE_OPTIONS)[number];

export function cubeEdgeMmFromNominal(nom: string | null | undefined): 100 | 150 {
  if (!nom) return 150;
  const s = String(nom).toLowerCase();
  return s.startsWith("100") ? 100 : 150;
}

export function cubeAreaMm2(edgeMm: number): number {
  return edgeMm * edgeMm;
}

/** Actual age in whole days (test date − casting date). */
export function calcActualAgeDays(castingDate: Date | string, testDate: Date | string): number | null {
  const cast = castingDate instanceof Date ? castingDate : new Date(castingDate);
  const test = testDate instanceof Date ? testDate : new Date(testDate);
  if (isNaN(cast.getTime()) || isNaN(test.getTime())) return null;
  const diffMs = test.getTime() - cast.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function dueDateFromCasting(castingDate: Date | string, nominalAgeDays: number): Date {
  const cast = castingDate instanceof Date ? new Date(castingDate) : new Date(castingDate);
  const due = new Date(cast);
  due.setDate(due.getDate() + nominalAgeDays);
  return due;
}

export function daysUntilDue(castingDate: Date | string, nominalAgeDays: number, fromDate = new Date()): number {
  const due = dueDateFromCasting(castingDate, nominalAgeDays);
  return Math.ceil((due.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

function interpolateFactor(actualAge: number, lowNom: number, highNom: number): number {
  const fLow = BS1881_FACTORS[lowNom] ?? 100;
  const fHigh = BS1881_FACTORS[highNom] ?? fLow;
  if (lowNom === highNom) return fLow;
  return fLow + ((actualAge - lowNom) / (highNom - lowNom)) * (fHigh - fLow);
}

function findInterpolationBracket(actualAge: number): [number, number] {
  const nominals = BS1881_NOMINAL_AGES as unknown as number[];
  for (let i = 0; i < nominals.length - 1; i++) {
    if (actualAge > nominals[i] && actualAge < nominals[i + 1]) {
      return [nominals[i], nominals[i + 1]];
    }
  }
  return [28, 28];
}

/** BS 1881 age factor from actual test age (not nominal order age). */
export function resolveBs1881AgeFactor(actualAgeDays: number, fcMpa: number): AgeFactorResult {
  if (actualAgeDays < 2) {
    return {
      status: "invalid",
      factorPct: 0,
      minStrengthMpa: 0,
      message: "Too early — result invalid",
    };
  }

  if (actualAgeDays > 98) {
    const factorPct = 120;
    return {
      status: "beyond90",
      factorPct,
      minStrengthMpa: fcMpa * (factorPct / 100),
      message: "Beyond 90-day range — using 120% factor, verify with engineer",
    };
  }

  for (const w of BS1881_AGE_WINDOWS) {
    if (actualAgeDays >= w.min && actualAgeDays <= w.max) {
      return {
        status: "valid",
        factorPct: w.factorPct,
        minStrengthMpa: fcMpa * (w.factorPct / 100),
        rangeLabel: `${w.nominal}-day (${w.min}–${w.max} days)`,
      };
    }
  }

  const [lowNom, highNom] = findInterpolationBracket(actualAgeDays);
  const factorPct = interpolateFactor(actualAgeDays, lowNom, highNom);
  return {
    status: "valid",
    factorPct: Math.round(factorPct * 10) / 10,
    minStrengthMpa: fcMpa * (factorPct / 100),
    interpolated: true,
    rangeLabel: `Interpolated between ${lowNom}-day and ${highNom}-day`,
    message: "Interpolated factor used",
  };
}

/** Strength N/mm² = Load(kN) × 1000 / area(mm²), rounded to 0.5 per BS 1881 Part 116. */
export function calcCompressiveStrengthMpa(loadKN: number, edgeMm: number): number | null {
  if (!Number.isFinite(loadKN) || loadKN <= 0) return null;
  const area = cubeAreaMm2(edgeMm);
  const raw = (loadKN * 1000) / area;
  return Math.round(raw * 2) / 2;
}

export function evaluateCubePass(strengthMpa: number, minRequiredMpa: number): boolean {
  return strengthMpa >= minRequiredMpa - 1e-9;
}

export function evaluateGroupPass(strengths: number[], minRequiredMpa: number): boolean {
  const valid = strengths.filter(s => s > 0);
  if (valid.length === 0) return false;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return avg >= minRequiredMpa - 1e-9;
}
