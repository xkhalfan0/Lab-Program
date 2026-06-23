export const ENTRY_DATA_PREFIX = "__ENTRY_DATA__:";

export type ReceptionFieldType = "text" | "date";

export interface ReceptionFieldDef {
  key: string;
  labelEn: string;
  labelAr: string;
  type?: ReceptionFieldType;
}

/** Optional reception entry fields keyed by field id (Excel mapping). */
export const RECEPTION_FIELD_DEFS: Record<string, ReceptionFieldDef> = {
  sampleFor: { key: "sampleFor", labelEn: "Sample for", labelAr: "العينة لـ" },
  mixRatio: { key: "mixRatio", labelEn: "Mix ratio", labelAr: "نسبة الخلطة" },
  cementType: { key: "cementType", labelEn: "Cement type", labelAr: "نوع الأسمنت" },
  maxAggregateSize: { key: "maxAggregateSize", labelEn: "Max aggregate size", labelAr: "أقصى حجم للركام" },
  time: { key: "time", labelEn: "Time", labelAr: "الوقت" },
  slumpInches: { key: "slumpInches", labelEn: "Slump (inches)", labelAr: "الهبوط (بوصة)" },
  cubesReference: { key: "cubesReference", labelEn: "Cubes/cylinders reference", labelAr: "مرجع المكعبات/الأسطوانات" },
  campName: { key: "campName", labelEn: "Camp name", labelAr: "اسم المعسكر" },
  fLevel: { key: "fLevel", labelEn: "F. level", labelAr: "مستوى F." },
  facility: { key: "facility", labelEn: "Facility", labelAr: "المنشأة" },
  sampleDescription: { key: "sampleDescription", labelEn: "Sample description", labelAr: "وصف العينة" },
  descriptionOfWork: { key: "descriptionOfWork", labelEn: "Description of work", labelAr: "وصف العمل" },
  fullDescription: { key: "fullDescription", labelEn: "Full description", labelAr: "الوصف الكامل" },
  description: { key: "description", labelEn: "Description", labelAr: "الوصف" },
  materialFor: { key: "materialFor", labelEn: "Material for", labelAr: "المادة لـ" },
  source: { key: "source", labelEn: "Source", labelAr: "المصدر" },
  aggSize: { key: "aggSize", labelEn: "Aggregate size", labelAr: "حجم الركام" },
  site: { key: "site", labelEn: "Site", labelAr: "الموقع" },
  sourceOfAgg: { key: "sourceOfAgg", labelEn: "Source of aggregate", labelAr: "مصدر الركام" },
  sizeOfAgg: { key: "sizeOfAgg", labelEn: "Size of aggregate", labelAr: "حجم الركام" },
  sampleLocation: { key: "sampleLocation", labelEn: "Sample location", labelAr: "موقع أخذ العينة" },
  material: { key: "material", labelEn: "Material", labelAr: "المادة" },
  plantName: { key: "plantName", labelEn: "Plant name", labelAr: "اسم المصنع" },
  station: { key: "station", labelEn: "Station", labelAr: "المحطة" },
  sampleNo: { key: "sampleNo", labelEn: "Sample no.", labelAr: "رقم العينة" },
  aggSource: { key: "aggSource", labelEn: "Agg. source", labelAr: "مصدر الركام" },
  dateSampled: { key: "dateSampled", labelEn: "Date sampled", labelAr: "تاريخ أخذ العينة", type: "date" },
  layer: { key: "layer", labelEn: "Layer", labelAr: "الطبقة" },
  dateLaid: { key: "dateLaid", labelEn: "Date laid", labelAr: "تاريخ الرصف", type: "date" },
  materialDescription: { key: "materialDescription", labelEn: "Material description", labelAr: "وصف المادة" },
  sourceOfMaterial: { key: "sourceOfMaterial", labelEn: "Source of material", labelAr: "مصدر المادة" },
};

const CONC_COMPRESSIVE_FIELDS = [
  "sampleFor",
  "mixRatio",
  "cementType",
  "maxAggregateSize",
  "time",
  "slumpInches",
  "cubesReference",
  "campName",
] as const;

const AGG_MATERIAL_FIELDS = ["description", "materialFor", "source", "aggSize", "site"] as const;

/** Per official test code — optional entry fields from reception Excel mapping. */
export const RECEPTION_FIELDS_BY_TEST: Record<string, readonly string[]> = {
  CONC_CUBE: CONC_COMPRESSIVE_FIELDS,
  CONC_CORE: CONC_COMPRESSIVE_FIELDS,
  CONC_BEAM: CONC_COMPRESSIVE_FIELDS,
  CONC_FOAM: CONC_COMPRESSIVE_FIELDS,
  CONC_INTERLOCK: ["fLevel", "facility", "sampleDescription"],
  CONC_BLOCK: ["facility", "fLevel", "descriptionOfWork"],
  SOIL_SIEVE: ["facility", "fLevel", "fullDescription", "materialFor"],
  SOIL_ATTERBERG: ["materialDescription", "sourceOfMaterial", "materialFor"],
  SOIL_PROCTOR: ["materialDescription", "sourceOfMaterial", "materialFor"],
  SOIL_CBR: ["materialDescription", "sourceOfMaterial", "materialFor"],
  SOIL_FIELD_DENSITY: ["sampleDescription", "source", "layer"],
  STEEL_REBAR: ["sampleDescription", "site", "source"],
  STEEL_STRUCTURAL: ["sampleDescription", "site", "source"],
  STEEL_ANCHOR: ["sampleDescription", "site", "source"],
  STEEL_BEND: ["sampleDescription", "site", "source"],
  ASPH_HOTBIN: ["sourceOfAgg", "site", "sizeOfAgg"],
  ASPH_BITUMEN_EXTRACT: ["sourceOfAgg", "site", "sizeOfAgg"],
  ASPH_EXTRACTED_SIEVE: ["sourceOfAgg", "site", "sizeOfAgg"],
  ASPH_MARSHALL: ["sampleLocation", "material", "source", "plantName", "station", "sampleNo", "aggSource"],
  ASPH_MARSHALL_DENSITY: ["sampleLocation", "material", "source", "plantName", "station", "sampleNo", "aggSource"],
  ASPH_CORE: ["dateSampled", "sampleLocation", "material", "layer", "dateLaid", "sampleNo"],
  AGG_SG: AGG_MATERIAL_FIELDS,
  AGG_FLAKINESS_ELONGATION: AGG_MATERIAL_FIELDS,
  AGG_CRUSHING: AGG_MATERIAL_FIELDS,
  AGG_IMPACT: AGG_MATERIAL_FIELDS,
  AGG_LA: AGG_MATERIAL_FIELDS,
};

export type ReceptionFieldGroup = {
  testCode: string;
  testName: string;
  fields: ReceptionFieldDef[];
};

export function getReceptionFieldGroupsForTests(
  tests: Array<{ testTypeCode: string; testTypeName: string }>,
): ReceptionFieldGroup[] {
  const seen = new Set<string>();
  const groups: ReceptionFieldGroup[] = [];

  for (const test of tests) {
    const keys = RECEPTION_FIELDS_BY_TEST[test.testTypeCode] ?? [];
    const fields: ReceptionFieldDef[] = [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      const def = RECEPTION_FIELD_DEFS[key];
      if (!def) continue;
      seen.add(key);
      fields.push(def);
    }
    if (fields.length > 0) {
      groups.push({
        testCode: test.testTypeCode,
        testName: test.testTypeName,
        fields,
      });
    }
  }

  return groups;
}

export function serializeEntryData(data: Record<string, string>): string | undefined {
  const trimmed = Object.fromEntries(
    Object.entries(data).filter(([, value]) => String(value ?? "").trim()),
  );
  if (Object.keys(trimmed).length === 0) return undefined;
  return `${ENTRY_DATA_PREFIX}${JSON.stringify(trimmed)}`;
}

export function parseEntryDataFromNotes(notes: string | null | undefined): Record<string, string> {
  if (!notes) return {};
  const match = notes.match(/^__ENTRY_DATA__:(.+)$/m);
  if (!match?.[1]) return {};
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
    );
  } catch {
    return {};
  }
}

export function stripStructuredNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(/^__SUPPLIER__:[^\n]*\n?/gm, "")
    .replace(/^__CURING_DATE__:[^\n]*\n?/gm, "")
    .replace(/^__AGGREGATE_TYPE__:[^\n]*\n?/gm, "")
    .replace(/^__ENTRY_DATA__:[^\n]*\n?/gm, "")
    .trim();
}

export function parseSupplierFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/^__SUPPLIER__:(.+?)(?:\n|$)/m);
  return match?.[1]?.trim() || null;
}

export function getReceptionEntryDisplayPairs(options: {
  notes?: string | null;
  castingDate?: Date | string | null;
  nominalCubeSize?: string | null;
  lang: "ar" | "en";
}): Array<{ label: string; value: string }> {
  const isAr = options.lang === "ar";
  const pairs: Array<{ label: string; value: string }> = [];
  const notes = options.notes ?? "";

  const curingMatch = notes.match(/^__CURING_DATE__:(.+?)(?:\n|$)/m);
  if (curingMatch?.[1]?.trim()) {
    pairs.push({
      label: isAr ? "تاريخ المعالجة" : "Date of Curing",
      value: curingMatch[1].trim(),
    });
  }

  const aggMatch = notes.match(/^__AGGREGATE_TYPE__:(.+?)(?:\n|$)/m);
  if (aggMatch?.[1]?.trim()) {
    pairs.push({
      label: isAr ? "نوع الركام" : "Type of Aggregate",
      value: aggMatch[1].trim(),
    });
  }

  const entryData = parseEntryDataFromNotes(notes);
  for (const [key, value] of Object.entries(entryData)) {
    const def = RECEPTION_FIELD_DEFS[key];
    if (def && value.trim()) {
      pairs.push({
        label: isAr ? def.labelAr : def.labelEn,
        value: value.trim(),
      });
    }
  }

  if (options.castingDate) {
    const d = new Date(options.castingDate);
    if (!Number.isNaN(d.getTime())) {
      pairs.push({
        label: isAr ? "تاريخ الصب" : "Casting Date",
        value: d.toLocaleDateString(isAr ? "ar-AE" : "en-GB"),
      });
    }
  }

  if (options.nominalCubeSize?.trim()) {
    pairs.push({
      label: isAr ? "الحجم الاسمي للمكعب" : "Nominal Cube Size",
      value: options.nominalCubeSize.trim(),
    });
  }

  return pairs;
}
