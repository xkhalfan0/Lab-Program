export const HOT_BIN_SIEVE_SIZES = [
  { size: "25", label: "25" },
  { size: "19", label: "19" },
  { size: "12.5", label: "12.5" },
  { size: "9.5", label: "9.5" },
  { size: "4.75", label: "4.75" },
  { size: "2.36", label: "2.36" },
  { size: "1.18", label: "1.18" },
  { size: "0.6", label: "0.6" },
  { size: "0.3", label: "0.3" },
  { size: "0.15", label: "0.15" },
  { size: "0.075", label: "0.075" },
] as const;

export type SieveLimit = { lower: number; upper: number };

export const HOT_BIN_SPEC_LIMITS_BASE: Record<string, SieveLimit> = {
  "25": { lower: 100, upper: 100 },
  "19": { lower: 76, upper: 96 },
  "12.5": { lower: 68, upper: 88 },
  "9.5": { lower: 60, upper: 82 },
  "4.75": { lower: 45, upper: 67 },
  "2.36": { lower: 32, upper: 54 },
  "1.18": { lower: 22, upper: 44 },
  "0.6": { lower: 15, upper: 35 },
  "0.3": { lower: 9, upper: 25 },
  "0.15": { lower: 6, upper: 18 },
  "0.075": { lower: 3, upper: 6 },
};

export const HOT_BIN_SPEC_LIMITS_WEARING: Record<string, SieveLimit> = {
  "25": { lower: 100, upper: 100 },
  "19": { lower: 100, upper: 100 },
  "12.5": { lower: 80, upper: 100 },
  "9.5": { lower: 60, upper: 90 },
  "4.75": { lower: 48, upper: 65 },
  "2.36": { lower: 35, upper: 50 },
  "1.18": { lower: 19, upper: 30 },
  "0.6": { lower: 13, upper: 23 },
  "0.3": { lower: 8, upper: 17 },
  "0.15": { lower: 7, upper: 17 },
  "0.075": { lower: 3, upper: 8 },
};

export type HotBinMixCourse = "base_course" | "wearing_course";

export function getHotBinSpecLimits(mixType: HotBinMixCourse | ""): Record<string, SieveLimit> | null {
  if (mixType === "wearing_course") return HOT_BIN_SPEC_LIMITS_WEARING;
  if (mixType === "base_course") return HOT_BIN_SPEC_LIMITS_BASE;
  return null;
}

export function emptyHotBinGradations(): Record<string, string> {
  return Object.fromEntries(HOT_BIN_SIEVE_SIZES.map((s) => [s.size, ""]));
}
