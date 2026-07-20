export type ConcreteSpecimenPrepValues = {
  nominalSizeOfCube: string;
  appearanceWhenReceived: string;
  moistureConditionAtTesting: string;
  removalOfFins: string;
  volumeDetermination: string;
  methodOfCompaction: string;
  sampledBy: string;
  curingMethod: string;
  dateTimeSampled: string;
};

export const EMPTY_CONCRETE_SPECIMEN_PREP: ConcreteSpecimenPrepValues = {
  nominalSizeOfCube: "",
  appearanceWhenReceived: "",
  moistureConditionAtTesting: "",
  removalOfFins: "",
  volumeDetermination: "",
  methodOfCompaction: "",
  sampledBy: "",
  curingMethod: "",
  dateTimeSampled: "",
};

export type ConcreteSpecimenPrepVariant = "cube" | "foam" | "beam";

export const PREP_FIELDS_BY_VARIANT: Record<
  ConcreteSpecimenPrepVariant,
  readonly (keyof ConcreteSpecimenPrepValues)[]
> = {
  cube: [
    "nominalSizeOfCube",
    "removalOfFins",
    "volumeDetermination",
    "methodOfCompaction",
    "sampledBy",
    "curingMethod",
  ],
  foam: [
    "nominalSizeOfCube",
    "appearanceWhenReceived",
    "moistureConditionAtTesting",
    "removalOfFins",
    "volumeDetermination",
    "methodOfCompaction",
    "sampledBy",
    "curingMethod",
    "dateTimeSampled",
  ],
  beam: [
    "nominalSizeOfCube",
    "appearanceWhenReceived",
    "moistureConditionAtTesting",
    "removalOfFins",
    "methodOfCompaction",
    "sampledBy",
    "curingMethod",
    "dateTimeSampled",
  ],
};

export const PREP_FIELD_LABELS: Record<
  keyof ConcreteSpecimenPrepValues,
  { en: string; ar: string }
> = {
  nominalSizeOfCube: { en: "Nominal Size of Cube", ar: "الحجم الاسمي للمكعب" },
  appearanceWhenReceived: {
    en: "Appearance of Sample when Received",
    ar: "مظهر العينة عند الاستلام",
  },
  moistureConditionAtTesting: {
    en: "Moisture Condition at Testing",
    ar: "حالة الرطوبة عند الاختبار",
  },
  removalOfFins: { en: "Removal of Fins (if present)", ar: "إزالة الزوائد (إن وُجدت)" },
  volumeDetermination: { en: "Volume Determination", ar: "تحديد الحجم" },
  methodOfCompaction: { en: "Method of Compaction", ar: "طريقة الدمك" },
  sampledBy: { en: "Sampled By", ar: "أخذت العينة بواسطة" },
  curingMethod: { en: "Curing Method", ar: "طريقة المعالجة" },
  dateTimeSampled: { en: "Date / Time Sampled", ar: "تاريخ / وقت أخذ العينة" },
};

const MOISTURE_LABELS: Record<string, { en: string; ar: string }> = {
  saturated_surface_dry: {
    en: "Saturated Surface Dry (SSD)",
    ar: "مشبع سطحياً جاف (SSD)",
  },
  air_dry: { en: "Air Dry", ar: "جاف هوائياً" },
  oven_dry: { en: "Oven Dry", ar: "جاف فرنياً" },
  wet: { en: "Wet", ar: "مبلل" },
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function prepValuesFromFormData(
  fd: Record<string, unknown> | null | undefined,
): ConcreteSpecimenPrepValues {
  if (!fd) return { ...EMPTY_CONCRETE_SPECIMEN_PREP };
  return {
    nominalSizeOfCube: str(fd.nominalSizeOfCube ?? fd.nominalCubeSize),
    appearanceWhenReceived: str(fd.appearanceWhenReceived ?? fd.appearance),
    moistureConditionAtTesting: str(fd.moistureConditionAtTesting ?? fd.moistureCondition),
    removalOfFins: str(fd.removalOfFins),
    volumeDetermination: str(fd.volumeDetermination),
    methodOfCompaction: str(fd.methodOfCompaction),
    sampledBy: str(fd.sampledBy),
    curingMethod: str(fd.curingMethod),
    dateTimeSampled: str(fd.dateTimeSampled),
  };
}

export function prepPayload(values: ConcreteSpecimenPrepValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values) as [keyof ConcreteSpecimenPrepValues, string][]) {
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function formatMoisture(value: string, isAr: boolean): string {
  if (!value) return "";
  const key = value.toLowerCase().replace(/\s+/g, "_");
  const normalized =
    key === "saturated" || key === "ssd" ? "saturated_surface_dry" : key;
  return MOISTURE_LABELS[normalized]?.[isAr ? "ar" : "en"] ?? value;
}

function formatDateTimeSampled(value: string): string {
  if (!value.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.trim();
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildConcreteSpecimenPrepPairs(
  source: ConcreteSpecimenPrepValues | Record<string, unknown>,
  variant: ConcreteSpecimenPrepVariant,
  isAr: boolean,
  extras?: {
    curingConditionLabel?: string | null;
    specifiedFlexuralStrength?: string | number | null;
  },
): [string, string][] {
  const values =
    "nominalSizeOfCube" in source && typeof source.nominalSizeOfCube === "string"
      ? (source as ConcreteSpecimenPrepValues)
      : prepValuesFromFormData(source as Record<string, unknown>);

  const pairs: [string, string][] = [];
  const label = (key: keyof ConcreteSpecimenPrepValues) =>
    isAr ? PREP_FIELD_LABELS[key].ar : PREP_FIELD_LABELS[key].en;

  for (const key of PREP_FIELDS_BY_VARIANT[variant]) {
    let display = values[key].trim();
    if (key === "moistureConditionAtTesting") {
      display = formatMoisture(display, isAr);
    } else if (key === "dateTimeSampled") {
      display = formatDateTimeSampled(display);
    } else if (key === "curingMethod" && !display && extras?.curingConditionLabel?.trim()) {
      display = extras.curingConditionLabel.trim();
    }
    if (display) pairs.push([label(key), display]);
  }

  if (variant === "beam") {
    const flex = extras?.specifiedFlexuralStrength;
    if (flex != null && String(flex).trim() !== "") {
      pairs.push([
        isAr ? "مقاومة الانعطاف المحددة للخرسانة" : "Specified Flexural Strength for Concrete",
        `${flex} MPa`,
      ]);
    }
  }

  return pairs;
}
