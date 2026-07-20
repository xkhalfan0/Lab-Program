/** Minimum interlock tile pieces registered at reception (BS EN 1338 practice). */
export const MIN_CONC_INTERLOCK_COUNT = 10;

export function validateConcInterlockReceptionQuantity(
  quantity: number,
  lang: "en" | "ar" = "en",
): string | null {
  if (!Number.isFinite(quantity) || quantity < MIN_CONC_INTERLOCK_COUNT) {
    return lang === "ar"
      ? `الحد الأدنى ${MIN_CONC_INTERLOCK_COUNT} قطع إنترلوك`
      : `Minimum ${MIN_CONC_INTERLOCK_COUNT} interlock pieces required`;
  }
  return null;
}
