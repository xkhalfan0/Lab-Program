export const EXTRACTED_SIEVE_SIZES = [
  { size: "25.0", label: '1" - 25', labelAr: '1" - 25' },
  { size: "19.0", label: '3/4" - 19', labelAr: '3/4" - 19' },
  { size: "12.5", label: '1/2" - 12.5', labelAr: '1/2" - 12.5' },
  { size: "9.5", label: '3/8" - 9.5', labelAr: '3/8" - 9.5' },
  { size: "4.75", label: "#4 - 4.75", labelAr: "#4 - 4.75" },
  { size: "2.36", label: "#8 - 2.36", labelAr: "#8 - 2.36" },
  { size: "1.18", label: "#16 - 1.18", labelAr: "#16 - 1.18" },
  { size: "0.600", label: "#30 - 0.600", labelAr: "#30 - 0.600" },
  { size: "0.300", label: "#50 - 0.300", labelAr: "#50 - 0.300" },
  { size: "0.150", label: "#100 - 0.150", labelAr: "#100 - 0.150" },
  { size: "0.075", label: "#200 - 0.075", labelAr: "#200 - 0.075" },
  { size: "passing", label: "Passing 75 μm", labelAr: "مار 75 ميكرون" },
] as const;

/** Sieves with user-entered mass retained (excludes auto-calculated Passing 75 μm). */
export const EXTRACTED_SIEVE_INPUT_SIZES = EXTRACTED_SIEVE_SIZES.filter((s) => s.size !== "passing");

export type SieveLimit = { lower: number; upper: number };

export const JMF_LIMITS: Record<string, SieveLimit> = {
  "25.0": { lower: 100, upper: 100 },
  "19.0": { lower: 81, upper: 97 },
  "12.5": { lower: 69, upper: 85 },
  "9.5": { lower: 65, upper: 81 },
  "4.75": { lower: 48, upper: 64 },
  "2.36": { lower: 31, upper: 43 },
  "1.18": { lower: 19, upper: 31 },
  "0.600": { lower: 12, upper: 24 },
  "0.300": { lower: 6, upper: 18 },
  "0.150": { lower: 6, upper: 10 },
  "0.075": { lower: 3, upper: 7 },
  passing: { lower: 0, upper: 0 },
};

export const SPEC_LIMITS_BASE: Record<string, SieveLimit> = {
  "25.0": { lower: 100, upper: 100 },
  "19.0": { lower: 76, upper: 96 },
  "12.5": { lower: 62, upper: 80 },
  "9.5": { lower: 47, upper: 65 },
  "4.75": { lower: 35, upper: 52 },
  "2.36": { lower: 28, upper: 44 },
  "1.18": { lower: 20, upper: 34 },
  "0.600": { lower: 13, upper: 24 },
  "0.300": { lower: 6, upper: 18 },
  "0.150": { lower: 4, upper: 9 },
  "0.075": { lower: 3, upper: 7 },
  passing: { lower: 0, upper: 0 },
};

/** Wearing course specification limits (% passing). */
export const SPEC_LIMITS_WEARING: Record<string, SieveLimit> = {
  "25.0": { lower: 100, upper: 100 },
  "19.0": { lower: 90, upper: 100 },
  "12.5": { lower: 62, upper: 80 },
  "9.5": { lower: 55, upper: 75 },
  "4.75": { lower: 42, upper: 58 },
  "2.36": { lower: 34, upper: 48 },
  "1.18": { lower: 24, upper: 36 },
  "0.600": { lower: 15, upper: 26 },
  "0.300": { lower: 8, upper: 18 },
  "0.150": { lower: 5, upper: 10 },
  "0.075": { lower: 3, upper: 7 },
  passing: { lower: 0, upper: 0 },
};

export function getExtractedSieveSpecLimits(mixType: string | null | undefined): Record<string, SieveLimit> {
  return mixType === "wearing_course" ? SPEC_LIMITS_WEARING : SPEC_LIMITS_BASE;
}
