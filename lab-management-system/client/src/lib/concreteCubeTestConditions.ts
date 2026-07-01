/** Shared labels/defaults for concrete cube compressive strength tests (BS 1881 / EN 12390). */

export const DEFAULT_CUBE_LOADING_RATE = "0.6";
export const DEFAULT_LAB_CURING_TEMP = "20 ± 2 °C";
export const DEFAULT_LAB_CURING_RH = "≥ 95%";

export function normalizeMoistureKey(value?: string | null): string {
  if (!value?.trim()) return "";
  const v = value.toLowerCase().replace(/\s+/g, "_");
  if (v === "saturated" || v === "ssd" || v === "saturated_surface_dry") return "saturated_surface_dry";
  if (v === "air_dry") return "air_dry";
  if (v === "oven_dry" || v === "dry") return "oven_dry";
  if (v === "wet") return "wet";
  return value;
}

export function formatMoistureCondition(value: string | null | undefined, isAr: boolean): string {
  if (!value?.trim()) return "—";
  const key = normalizeMoistureKey(value);
  const map: Record<string, { en: string; ar: string }> = {
    saturated_surface_dry: {
      en: "Saturated Surface Dry (SSD)",
      ar: "مشبع سطحياً جاف (SSD)",
    },
    air_dry: { en: "Air Dry", ar: "جاف هوائياً" },
    oven_dry: { en: "Oven Dry", ar: "جاف فرنياً" },
    wet: { en: "Wet", ar: "مبلل" },
  };
  return map[key]?.[isAr ? "ar" : "en"] ?? String(value ?? "—");
}

export function formatCappingMethod(value: string | null | undefined, isAr: boolean): string {
  if (!value?.trim()) return "—";
  const map: Record<string, { en: string; ar: string }> = {
    flat_bedded: { en: "Flat Bedded (as received)", ar: "سطح مسطح (كما استلم)" },
    capped_sulfur: { en: "Capped — Sulfur Mortar", ar: "تسوية — ملاط كبريتي" },
    capped_plywood: { en: "Capped — Plywood", ar: "تسوية — خشب رقائقي" },
    capped_rubber: { en: "Capped — Rubber Pad", ar: "تسوية — وسادة مطاطية" },
    ground: { en: "Ground", ar: "مطحون" },
  };
  return map[value]?.[isAr ? "ar" : "en"] ?? String(value);
}

export function formatSurfaceCondition(value: string | null | undefined, isAr: boolean): string {
  if (!value?.trim()) return "—";
  const map: Record<string, { en: string; ar: string }> = {
    as_cast: { en: "As cast (natural surface)", ar: "كما صُبّ (سطح طبيعي)" },
    smooth: { en: "Smooth", ar: "ناعم" },
    rough: { en: "Rough", ar: "خشن" },
    ground: { en: "Ground / prepared", ar: "مطحون / مُجهّز" },
    normal: { en: "Normal", ar: "طبيعي" },
  };
  const key = value.toLowerCase().replace(/\s+/g, "_");
  return map[key]?.[isAr ? "ar" : "en"] ?? String(value);
}

export function formatLabCuringConditions(
  temp: string | null | undefined,
  rh: string | null | undefined,
  curingMethod: string | null | undefined,
  isAr: boolean,
): string {
  const hasTemp = !!temp?.trim();
  const hasRh = !!rh?.trim();
  if (!hasTemp && !hasRh && !curingMethod?.trim()) return "—";
  if (hasTemp || hasRh) {
    const t = temp?.trim() ?? "—";
    const r = rh?.trim() ?? "—";
    return isAr ? `${t} °C، RH ${r}%` : `${t} °C, RH ${r}%`;
  }
  return curingMethod!.trim();
}

export function formatLoadingRate(value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return "—";
  return v.includes("N/mm") ? v : `${v} N/mm²/s`;
}

export type ConcreteCubeConditionSource = {
  moistureCondition?: string | null;
  labCuringTemperature?: string | null;
  labCuringRh?: string | null;
  curingMethod?: string | null;
  loadingRate?: string | null;
  surfaceConditionAtTest?: string | null;
  appearance?: string | null;
  cappingMethod?: string | null;
  curingConditionLabel?: string | null;
};

export function buildConcreteCubeTestConditionPairs(
  src: ConcreteCubeConditionSource,
  isAr: boolean,
): [string, string][] {
  return [
    [
      isAr ? "حالة الرطوبة عند الاختبار" : "Moisture Condition at Test",
      formatMoistureCondition(src.moistureCondition, isAr),
    ],
    [
      isAr ? "ظروف المعالجة بالمختبر" : "Curing Conditions at Laboratory",
      formatLabCuringConditions(
        src.labCuringTemperature,
        src.labCuringRh,
        src.curingMethod ?? src.curingConditionLabel,
        isAr,
      ),
    ],
    [
      isAr ? "معدل التحميل" : "Loading Rate Applied",
      formatLoadingRate(src.loadingRate),
    ],
    [
      isAr ? "حالة سطح العينة عند الاختبار" : "Surface Condition at Test",
      formatSurfaceCondition(src.surfaceConditionAtTest ?? src.appearance, isAr),
    ],
    [
      isAr ? "التكييف / الطحن" : "Capping / Grinding Details",
      formatCappingMethod(src.cappingMethod, isAr),
    ],
  ];
}
