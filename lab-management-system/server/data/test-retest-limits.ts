import { normalizeTestCode } from "./official-test-catalog";

/**
 * Maximum number of retests allowed per test type (official price list).
 * 0 = no retest; 1 = one retest after the original failure, etc.
 */
export const TEST_RETEST_LIMITS: Record<string, number> = {
  // Concrete — no retests
  CONC_CUBE: 0,
  CONC_CORE: 0,
  CONC_BLOCK: 0,
  CONC_INTERLOCK: 0,
  CONC_FOAM: 0,
  CONC_FOAM_CUBE: 0,
  CONC_FOAM_DENSITY: 0,
  CEM_SETTING_TIME: 0,
  CONC_MORTAR_SAND: 0,
  CONC_BEAM: 0,
  CONC_BEAM_SMALL: 0,
  CONC_BEAM_LARGE: 0,
  CONC_MIX_GRAD: 0,

  // Soil
  SOIL_SIEVE: 1,
  SOIL_ATTERBERG: 1,
  SOIL_PROCTOR: 1,
  SOIL_CBR: 1,
  SOIL_FIELD_DENSITY: 0,

  // Steel — no retests
  STEEL_REBAR: 0,
  STEEL_BEND: 0,
  STEEL_REBEND: 0,
  STEEL_ANCHOR: 0,
  STEEL_STRUCTURAL: 0,

  // Asphalt — one retest each
  ASPH_HOTBIN: 1,
  ASPH_BITUMEN_EXTRACT: 1,
  ASPH_EXTRACTED_SIEVE: 1,
  ASPH_MARSHALL: 1,
  ASPH_MARSHALL_DENSITY: 1,
  ASPH_CORE: 1,
  ASPH_SPRAY_RATE: 0,

  // Aggregates — one retest each
  AGG_SIEVE: 1,
  AGG_SG: 1,
  AGG_FLAKINESS_ELONGATION: 1,
  AGG_CRUSHING: 1,
  AGG_IMPACT: 1,
  AGG_LA: 1,
};

export function getMaxRetestsForTestCode(code: string | null | undefined): number {
  const normalized = normalizeTestCode(code);
  if (!normalized) return 0;
  return TEST_RETEST_LIMITS[normalized] ?? 0;
}

export function isTestRetestAllowed(
  code: string,
  retestCountsByCode: Map<string, number>
): boolean {
  const normalized = normalizeTestCode(code) ?? code;
  const max = getMaxRetestsForTestCode(normalized);
  if (max <= 0) return false;
  const used = retestCountsByCode.get(normalized) ?? 0;
  return used < max;
}
