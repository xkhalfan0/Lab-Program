/** Compressive strength — 15 AED/cube at reception, min 3 cubes. */
export const FOAM_STRENGTH_TEST_CODE = "CONC_FOAM";
/** Oven-dry density — 40 AED/cube at reception, min 3 cubes. */
export const FOAM_DENSITY_TEST_CODE = "CONC_FOAM_DENSITY";

export const FOAM_CONCRETE_TEST_CODES = [FOAM_STRENGTH_TEST_CODE, FOAM_DENSITY_TEST_CODE] as const;

/** Minimum cube specimens for foamed concrete reception (strength and density). */
export const MIN_CONC_FOAM_CUBE_COUNT = 3;

/** @deprecated Use MIN_CONC_FOAM_CUBE_COUNT */
export const MIN_CONC_FOAM_DENSITY_COUNT = MIN_CONC_FOAM_CUBE_COUNT;

export function isFoamConcreteTestCode(code: string): boolean {
  return (FOAM_CONCRETE_TEST_CODES as readonly string[]).includes(code);
}

export function isFoamDensityTestCode(code: string): boolean {
  return code === FOAM_DENSITY_TEST_CODE;
}

export function resolveFoamTestMode(testTypeCode?: string | null): "strength" | "density" {
  return testTypeCode === FOAM_DENSITY_TEST_CODE ? "density" : "strength";
}

export function validateFoamReceptionQuantity(
  testTypeCode: string,
  quantity: number,
  lang: "en" | "ar" = "en",
): string | null {
  if (!isFoamConcreteTestCode(testTypeCode)) return null;
  if (!Number.isFinite(quantity) || quantity < MIN_CONC_FOAM_CUBE_COUNT) {
    if (testTypeCode === FOAM_DENSITY_TEST_CODE) {
      return lang === "ar"
        ? `الحد الأدنى ${MIN_CONC_FOAM_CUBE_COUNT} مكعبات لاختبار كثافة الخرسانة الرغوية`
        : `Minimum ${MIN_CONC_FOAM_CUBE_COUNT} cubes required for foamed concrete density test`;
    }
    return lang === "ar"
      ? `الحد الأدنى ${MIN_CONC_FOAM_CUBE_COUNT} مكعبات لاختبار مقاومة الضغط للخرسانة الرغوية`
      : `Minimum ${MIN_CONC_FOAM_CUBE_COUNT} cubes required for foamed concrete compressive strength test`;
  }
  return null;
}

export function validateFoamDensityReceptionQuantity(
  quantity: number,
  lang: "en" | "ar" = "en",
): string | null {
  return validateFoamReceptionQuantity(FOAM_DENSITY_TEST_CODE, quantity, lang);
}

export function validateFoamStrengthReceptionQuantity(
  quantity: number,
  lang: "en" | "ar" = "en",
): string | null {
  return validateFoamReceptionQuantity(FOAM_STRENGTH_TEST_CODE, quantity, lang);
}
