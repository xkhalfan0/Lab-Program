/** Compressive strength — 15 AED/cube at reception. */
export const FOAM_STRENGTH_TEST_CODE = "CONC_FOAM";
/** Oven-dry density — 40 AED/cube at reception, min 3 cubes. */
export const FOAM_DENSITY_TEST_CODE = "CONC_FOAM_DENSITY";

export const FOAM_CONCRETE_TEST_CODES = [FOAM_STRENGTH_TEST_CODE, FOAM_DENSITY_TEST_CODE] as const;

export const MIN_CONC_FOAM_DENSITY_COUNT = 3;

export function isFoamConcreteTestCode(code: string): boolean {
  return (FOAM_CONCRETE_TEST_CODES as readonly string[]).includes(code);
}

export function isFoamDensityTestCode(code: string): boolean {
  return code === FOAM_DENSITY_TEST_CODE;
}

export function resolveFoamTestMode(testTypeCode?: string | null): "strength" | "density" {
  return testTypeCode === FOAM_DENSITY_TEST_CODE ? "density" : "strength";
}

export function validateFoamDensityReceptionQuantity(
  quantity: number,
  lang: "en" | "ar" = "en",
): string | null {
  if (!Number.isFinite(quantity) || quantity < MIN_CONC_FOAM_DENSITY_COUNT) {
    return lang === "ar"
      ? `الحد الأدنى ${MIN_CONC_FOAM_DENSITY_COUNT} مكعبات لاختبار كثافة الخرسانة الرغوية`
      : `Minimum ${MIN_CONC_FOAM_DENSITY_COUNT} cubes required for foamed concrete density test`;
  }
  return null;
}
