/**
 * Reception metadata for CONC_CUBE — cube size only (stored in lab_order_items.testSubType).
 * Design strength and test age are determined on the technician form from test date vs casting date.
 */

export const CONC_CUBE_PLAN_VERSION = 2;
export const CONC_CUBE_PLAN_PREFIX = "CONC_CUBE_PLAN:";

/** @deprecated v1 only — age groups no longer set at reception */
export interface ConcCubeAgeGroupPlan {
  nominalAge: number;
  cubeCount: number;
}

export interface ConcCubeReceptionPlan {
  v: number;
  cubeSizeMm: 100 | 150;
  /** @deprecated v1 — ignored for new orders */
  designStrength?: number;
  /** @deprecated v1 — ignored for new orders */
  ageGroups?: ConcCubeAgeGroupPlan[];
}

export function serializeConcCubePlan(plan: ConcCubeReceptionPlan): string {
  return CONC_CUBE_PLAN_PREFIX + JSON.stringify(plan);
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
      return { v: CONC_CUBE_PLAN_VERSION, cubeSizeMm: data.cubeSizeMm };
    }
    // v1 legacy: keep cube size only
    if (data.v === 1) {
      return { v: CONC_CUBE_PLAN_VERSION, cubeSizeMm: data.cubeSizeMm };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildConcCubePlanFromNominalSize(nom: string | null | undefined): ConcCubeReceptionPlan {
  return {
    v: CONC_CUBE_PLAN_VERSION,
    cubeSizeMm: nominalCubeSizeToMm(nom),
  };
}

export function nominalCubeSizeToMm(nom: string | null | undefined): 100 | 150 {
  if (!nom) return 150;
  return String(nom).toLowerCase().startsWith("100") ? 100 : 150;
}

export function mmToNominalCubeSize(mm: 100 | 150): string {
  return mm === 100 ? "100mm" : "150mm";
}

/** Standard cube count when reception does not specify per-age quantities. */
export const DEFAULT_CONC_CUBE_COUNT = 3;
