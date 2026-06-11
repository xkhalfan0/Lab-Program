/**
 * Reception plan for CONC_CUBE — stored as JSON in lab_order_items.testSubType.
 */

import { BS1881_NOMINAL_AGES } from "./concreteCubeBs1881";

export const CONC_CUBE_PLAN_VERSION = 1;
export const CONC_CUBE_PLAN_PREFIX = "CONC_CUBE_PLAN:";

export interface ConcCubeAgeGroupPlan {
  nominalAge: number;
  cubeCount: number;
}

export interface ConcCubeReceptionPlan {
  v: number;
  designStrength: number;
  cubeSizeMm: 100 | 150;
  ageGroups: ConcCubeAgeGroupPlan[];
}

export function isValidNominalAge(age: number): boolean {
  return (BS1881_NOMINAL_AGES as readonly number[]).includes(age);
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
    if (!data || data.v !== CONC_CUBE_PLAN_VERSION) return null;
    if (!Number.isFinite(data.designStrength) || data.designStrength <= 0) return null;
    if (data.cubeSizeMm !== 100 && data.cubeSizeMm !== 150) return null;
    if (!Array.isArray(data.ageGroups) || data.ageGroups.length === 0) return null;
    const groups = data.ageGroups.filter(
      g => isValidNominalAge(g.nominalAge) && g.cubeCount >= 1 && g.cubeCount <= 16,
    );
    if (groups.length === 0) return null;
    return { ...data, ageGroups: groups };
  } catch {
    return null;
  }
}

export function nominalCubeSizeToMm(nom: string | null | undefined): 100 | 150 {
  if (!nom) return 150;
  return String(nom).toLowerCase().startsWith("100") ? 100 : 150;
}

export function mmToNominalCubeSize(mm: 100 | 150): string {
  return mm === 100 ? "100mm" : "150mm";
}

export function totalCubesInPlan(plan: ConcCubeReceptionPlan): number {
  return plan.ageGroups.reduce((s, g) => s + g.cubeCount, 0);
}

export function validateConcCubeReceptionPlan(
  plan: ConcCubeReceptionPlan | null,
  lang: "ar" | "en",
): string | null {
  if (!plan) {
    return lang === "ar"
      ? "أدخل مقاومة التصميم ومجموعات العمر لاختبار المكعبات"
      : "Enter design strength and age groups for cube test";
  }
  if (plan.ageGroups.length === 0) {
    return lang === "ar" ? "اختر عمر اختبار واحد على الأقل" : "Select at least one test age";
  }
  return null;
}
