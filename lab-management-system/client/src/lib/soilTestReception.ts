/**
 * Reception rules for soil Proctor ↔ CBR pairing (3 lab scenarios).
 */

import type { ProctorMethodKey } from "./soilProctor";

export const SOIL_PROCTOR_SUBTYPES = ["BS_HEAVY", "BS_LIGHT", "MODIFIED_PROCTOR"] as const;
export type SoilProctorSubtype = (typeof SOIL_PROCTOR_SUBTYPES)[number];

export const SOIL_CBR_SUBTYPES = ["BS_1377_4", "ASTM_D1883"] as const;
export type SoilCbrSubtype = (typeof SOIL_CBR_SUBTYPES)[number];

export const SOIL_PROCTOR_UNIT_PRICE = 300;
export const SOIL_CBR_BS_UNIT_PRICE = 250;
export const SOIL_CBR_ASTM_UNIT_PRICE = 750;

export function getCbrUnitPrice(subtype: string | null | undefined): number {
  if (subtype === "ASTM_D1883") return SOIL_CBR_ASTM_UNIT_PRICE;
  if (subtype === "BS_1377_4") return SOIL_CBR_BS_UNIT_PRICE;
  return SOIL_CBR_BS_UNIT_PRICE;
}

export function isSoilProctorSubtype(v: string | null | undefined): v is SoilProctorSubtype {
  return SOIL_PROCTOR_SUBTYPES.includes(v as SoilProctorSubtype);
}

export function isSoilCbrSubtype(v: string | null | undefined): v is SoilCbrSubtype {
  return SOIL_CBR_SUBTYPES.includes(v as SoilCbrSubtype);
}

export function proctorMethodFromReceptionSubtype(
  subType: string | null | undefined,
): ProctorMethodKey | undefined {
  if (subType === "BS_HEAVY") return "BS_HEAVY";
  if (subType === "BS_LIGHT") return "BS_LIGHT";
  if (subType === "MODIFIED_PROCTOR") return "MODIFIED_PROCTOR";
  return undefined;
}

export function cbrStandardFromReceptionSubtype(
  subType: string | null | undefined,
): "BS1377" | "ASTM_D1883" | undefined {
  if (subType === "BS_1377_4") return "BS1377";
  if (subType === "ASTM_D1883") return "ASTM_D1883";
  return undefined;
}

/** Mg/m³ — reject corrupt / pcf-scale values saved as MDD. */
export function saneProctorMddMg(m: unknown): number | undefined {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return undefined;
  return n;
}

export function saneProctorOmcPct(o: unknown): number | undefined {
  const n = Number(o);
  if (!Number.isFinite(n) || n <= 0 || n > 30) return undefined;
  return n;
}

export function requiredProctorSubtypeForCbr(
  cbrSubtype: string | null | undefined,
): SoilProctorSubtype | "BS_LIGHT_OR_HEAVY" | null {
  if (cbrSubtype === "ASTM_D1883") return "MODIFIED_PROCTOR";
  if (cbrSubtype === "BS_1377_4") return "BS_LIGHT_OR_HEAVY";
  return null;
}

export function cbrRequiresProctorSubtype(
  proctorSubtype: string | null | undefined,
  cbrSubtype: string | null | undefined,
): boolean {
  const req = requiredProctorSubtypeForCbr(cbrSubtype);
  if (!req || !proctorSubtype) return false;
  if (req === "MODIFIED_PROCTOR") return proctorSubtype === "MODIFIED_PROCTOR";
  return proctorSubtype === "BS_HEAVY" || proctorSubtype === "BS_LIGHT";
}

export function getCbrDependencyHint(
  cbrSubtype: string | null | undefined,
  lang: "ar" | "en",
): string {
  if (cbrSubtype === "ASTM_D1883") {
    return lang === "ar"
      ? "يتطلب: بروكتور معدّل (ASTM D1557)"
      : "Requires: Modified Proctor (ASTM D1557)";
  }
  if (cbrSubtype === "BS_1377_4") {
    return lang === "ar"
      ? "يتطلب: بروكتور BS 1377 (خفيف أو ثقيل)"
      : "Requires: BS 1377 Proctor (Light or Heavy)";
  }
  return lang === "ar"
    ? "يتطلب: اختبار بروكتور (اختر نوع CBR أولاً)"
    : "Requires: Proctor test (select CBR type first)";
}

export function getProctorSubtypeLabel(subtype: string, lang: "ar" | "en"): string {
  const labels: Record<string, { en: string; ar: string }> = {
    BS_HEAVY: { en: "BS 1377 Heavy", ar: "BS 1377 دمك ثقيل" },
    BS_LIGHT: { en: "BS 1377 Light", ar: "BS 1377 دمك خفيف" },
    MODIFIED_PROCTOR: { en: "Modified Proctor (D1557)", ar: "بروكتور معدّل (D1557)" },
  };
  const l = labels[subtype];
  return l ? (lang === "ar" ? l.ar : l.en) : subtype;
}

export function validateSoilTestOrder(
  tests: { testTypeCode: string; testSubType?: string }[],
  lang: "ar" | "en",
): string | null {
  const proctor = tests.find(t => t.testTypeCode === "SOIL_PROCTOR");
  const cbr = tests.find(t => t.testTypeCode === "SOIL_CBR");

  if (proctor && !isSoilProctorSubtype(proctor.testSubType)) {
    return lang === "ar"
      ? "اختر طريقة بروكتور (خفيف / ثقيل / معدّل D1557)"
      : "Select a Proctor method (Light / Heavy / Modified D1557)";
  }

  if (cbr) {
    if (!isSoilCbrSubtype(cbr.testSubType)) {
      return lang === "ar"
        ? "اختر نوع CBR (BS 1377 أو ASTM D1883)"
        : "Select CBR type (BS 1377 or ASTM D1883)";
    }
    if (!proctor) {
      return lang === "ar"
        ? "اختبار CBR يتطلب اختبار بروكتور على نفس العينة"
        : "CBR requires a Proctor test on the same sample";
    }
    if (!cbrRequiresProctorSubtype(proctor.testSubType, cbr.testSubType)) {
      if (cbr.testSubType === "ASTM_D1883") {
        return lang === "ar"
          ? "CBR ASTM D1883 يتطلب بروكتور معدّل (ASTM D1557)"
          : "ASTM D1883 CBR requires Modified Proctor (ASTM D1557)";
      }
      return lang === "ar"
        ? "CBR BS 1377 يتطلب بروكتور BS خفيف أو ثقيل"
        : "BS 1377 CBR requires BS Light or Heavy Proctor";
    }
  }

  return null;
}
