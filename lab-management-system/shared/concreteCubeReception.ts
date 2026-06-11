/**
 * Reception metadata for CONC_CUBE — cube size + count (stored in lab_order_items.testSubType).
 * Design strength and test age are determined on the technician form.
 */

export const CONC_CUBE_PLAN_VERSION = 2;
export const CONC_CUBE_PLAN_PREFIX = "CONC_CUBE_PLAN:";
export const MIN_CONC_CUBE_COUNT = 3;
export const MAX_CONC_CUBE_COUNT = 16;

/** @deprecated v1 only */
export interface ConcCubeAgeGroupPlan {
  nominalAge: number;
  cubeCount: number;
}

export interface ConcCubeReceptionPlan {
  v: number;
  cubeSizeMm: 100 | 150;
  cubeCount: number;
  /** @deprecated v1 */
  designStrength?: number;
  /** @deprecated v1 */
  ageGroups?: ConcCubeAgeGroupPlan[];
}

export function serializeConcCubePlan(plan: ConcCubeReceptionPlan): string {
  return CONC_CUBE_PLAN_PREFIX + JSON.stringify(plan);
}

function normalizeCubeCount(n: unknown): number {
  const c = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(c)) return MIN_CONC_CUBE_COUNT;
  return Math.min(MAX_CONC_CUBE_COUNT, Math.max(MIN_CONC_CUBE_COUNT, c));
}

export function parseConcCubePlan(raw: string | null | undefined): ConcCubeReceptionPlan | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const json = raw.startsWith(CONC_CUBE_PLAN_PREFIX)
      ? raw.slice(CONC_CUBE_PLAN_PREFIX.length)
      : raw;
    const data = JSON.parse(json) as ConcCubeReceptionPlan;
    if (!data) return null;
    if (data.cubeSizeMm !== 100 && data.cubeSizeMm !== 150) return null;

    if (data.v === CONC_CUBE_PLAN_VERSION) {
      return {
        v: CONC_CUBE_PLAN_VERSION,
        cubeSizeMm: data.cubeSizeMm,
        cubeCount: normalizeCubeCount(data.cubeCount),
      };
    }

    // v1 legacy: cube size + total cubes from age groups (or minimum 3)
    if (data.v === 1) {
      const fromGroups = Array.isArray(data.ageGroups)
        ? data.ageGroups.reduce((s, g) => s + (g.cubeCount ?? 0), 0)
        : 0;
      return {
        v: CONC_CUBE_PLAN_VERSION,
        cubeSizeMm: data.cubeSizeMm,
        cubeCount: normalizeCubeCount(fromGroups || MIN_CONC_CUBE_COUNT),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildConcCubePlanFromNominalSize(
  nom: string | null | undefined,
  cubeCount: number,
): ConcCubeReceptionPlan {
  return {
    v: CONC_CUBE_PLAN_VERSION,
    cubeSizeMm: nominalCubeSizeToMm(nom),
    cubeCount: normalizeCubeCount(cubeCount),
  };
}

export function nominalCubeSizeToMm(nom: string | null | undefined): 100 | 150 {
  if (!nom) return 150;
  return String(nom).toLowerCase().startsWith("100") ? 100 : 150;
}

export function mmToNominalCubeSize(mm: 100 | 150): string {
  return mm === 100 ? "100mm" : "150mm";
}

/** @deprecated use plan.cubeCount */
export const DEFAULT_CONC_CUBE_COUNT = MIN_CONC_CUBE_COUNT;

export function validateConcCubeReceptionPlan(
  plan: ConcCubeReceptionPlan | null,
  lang: "ar" | "en",
): string | null {
  if (!plan) {
    return lang === "ar"
      ? "أدخل حجم المكعب وعدد المكعبات"
      : "Enter cube size and number of cubes";
  }
  if (plan.cubeCount < MIN_CONC_CUBE_COUNT) {
    return lang === "ar"
      ? `الحد الأدنى ${MIN_CONC_CUBE_COUNT} مكعبات لكل عينة`
      : `Minimum ${MIN_CONC_CUBE_COUNT} cubes per sample`;
  }
  return null;
}
