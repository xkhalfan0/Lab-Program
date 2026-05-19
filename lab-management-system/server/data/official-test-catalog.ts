export type TestCategory = "concrete" | "soil" | "steel" | "asphalt" | "aggregates";

/** Asphalt mix design layer options (binder course removed). */
export const ASPHALT_MIX_COURSE_OPTIONS = ["wearing_course", "base_course"] as const;
export type AsphaltMixCourse = (typeof ASPHALT_MIX_COURSE_OPTIONS)[number];

/** Legacy / alias codes mapped to canonical catalog codes. */
export const TEST_CODE_ALIASES: Record<string, string> = {
  "DIST-2026-038": "ASPH_BITUMEN_EXTRACT",
  "DIST-2026-039": "ASPH_EXTRACTED_SIEVE",
  "DIST-2026-040": "ASPH_MARSHALL",
  "DIST-2026-042": "ASPH_MARSHALL_DENSITY",
};

export interface OfficialTest {
  category: TestCategory;
  nameEn: string;
  nameAr: string;
  code: string;
  unitPrice: string;
  unit: string;
  standardRef: string | null;
  formTemplate: string;
  sortOrder: number;
  isActive?: boolean;
  /** Asphalt mix layer sub-types selectable at reception. */
  testSubType?: readonly string[];
  /** Canonical test codes that must be completed on the same sample first. */
  requiredTests?: readonly string[];
}

export const OFFICIAL_TEST_CATALOG: OfficialTest[] = [
  { category: "concrete", nameEn: "Compressive Strength of Concrete Cubes", nameAr: "قوة ضغط مكعبات الخرسانة", code: "CONC_CUBE", unitPrice: "15", unit: "N/mm²", standardRef: "BS EN 12390-3", formTemplate: "concrete_cubes", sortOrder: 10 },
  { category: "concrete", nameEn: "Compressive Strength of Concrete Cores", nameAr: "قوة ضغط نواة خرسانية", code: "CONC_CORE", unitPrice: "20", unit: "N/mm²", standardRef: "BS EN 12504-1", formTemplate: "concrete_cores", sortOrder: 20 },
  { category: "concrete", nameEn: "Compressive Strength of Masonry Blocks", nameAr: "قوة ضغط بلوك خرساني", code: "CONC_BLOCK", unitPrice: "30", unit: "N/mm²", standardRef: "BS EN 771-3", formTemplate: "concrete_blocks", sortOrder: 30 },
  { category: "concrete", nameEn: "Compressive Strength of Interlocking Tiles", nameAr: "قوة ضغط بلاط انترلوك", code: "CONC_INTERLOCK", unitPrice: "20", unit: "N/mm²", standardRef: "BS EN 1338", formTemplate: "interlock", sortOrder: 40 },
  { category: "concrete", nameEn: "Compressive Strength / Density of Lightweight Foam Concrete Cubes", nameAr: "مقاومة الضغط / كثافة مكعبات الخرسانة الرغوية خفيفة الوزن", code: "CONC_FOAM", unitPrice: "15", unit: "kg/cm²", standardRef: "BS 1881-116 / BS 1881-114", formTemplate: "concrete_foam", sortOrder: 50 },
  { category: "concrete", nameEn: "Initial Setting Time of Cement", nameAr: "زمن التصلب الابتدائي للأسمنت", code: "CEM_SETTING_TIME", unitPrice: "100", unit: "min", standardRef: "ASTM C191 / BS EN 196-3", formTemplate: "cement_setting_time", sortOrder: 60 },
  { category: "concrete", nameEn: "Flexural Strength of Concrete Beams", nameAr: "مقاومة الانحناء لعوارض الخرسانة", code: "CONC_BEAM", unitPrice: "80", unit: "MPa", standardRef: "ASTM C78", formTemplate: "concrete_beam", sortOrder: 80 },
  { category: "concrete", nameEn: "Mix Aggregate Gradation", nameAr: "تدرج ركام الخلطة", code: "CONC_MIX_GRAD", unitPrice: "65", unit: "%", standardRef: "ASTM C33 / BS EN 12620", formTemplate: "concrete_mix_grad", sortOrder: 90 },
  { category: "steel", nameEn: "Tensile Strength of Reinforcement Steel", nameAr: "قوة شد حديد التسليح", code: "STEEL_REBAR", unitPrice: "300", unit: "N/mm²", standardRef: "BS 4449", formTemplate: "steel_rebar", sortOrder: 200 },
  { category: "steel", nameEn: "Bend & Rebend Test", nameAr: "اختبار الانحناء وإعادة الانحناء", code: "STEEL_BEND_REBEND", unitPrice: "100", unit: "—", standardRef: "BS 4449", formTemplate: "steel_bend_rebend", sortOrder: 210 },
  { category: "steel", nameEn: "Tensile Strength of Anchor Bolts", nameAr: "قوة شد برغي تثبيت", code: "STEEL_ANCHOR", unitPrice: "300", unit: "kN", standardRef: "—", formTemplate: "steel_anchor_bolt", sortOrder: 220 },
  { category: "steel", nameEn: "Tensile Strength of Structural Steel", nameAr: "قوة شد حديد إنشائي", code: "STEEL_STRUCTURAL", unitPrice: "300", unit: "N/mm²", standardRef: "BS EN 10025", formTemplate: "steel_structural", sortOrder: 230 },
  { category: "soil", nameEn: "Sieve Analysis", nameAr: "تحليل المناخل", code: "SOIL_SIEVE", unitPrice: "100", unit: "%", standardRef: "BS 1377 / BS EN 933-1", formTemplate: "sieve_analysis", sortOrder: 100 },
  { category: "soil", nameEn: "Atterberg Limits (Plasticity Index)", nameAr: "حدود أتربرج", code: "SOIL_ATTERBERG", unitPrice: "150", unit: "%", standardRef: "BS 1377-2", formTemplate: "soil_atterberg", sortOrder: 110 },
  { category: "soil", nameEn: "MDD/OMC (Proctor) Test", nameAr: "اختبار بروكتور", code: "SOIL_PROCTOR", unitPrice: "300", unit: "kN/m³", standardRef: "BS 1377-4", formTemplate: "soil_proctor", sortOrder: 120 },
  { category: "soil", nameEn: "California Bearing Ratio (CBR)", nameAr: "نسبة تحمل كاليفورنيا", code: "SOIL_CBR", unitPrice: "250", unit: "%", standardRef: "BS 1377-9", formTemplate: "soil_cbr", sortOrder: 130 },
  { category: "soil", nameEn: "Field Density (Compaction Test)", nameAr: "كثافة حقلية", code: "SOIL_FIELD_DENSITY", unitPrice: "100", unit: "Mg/m³", standardRef: "BS 1377-9", formTemplate: "soil_field_density", sortOrder: 140 },
  {
    category: "asphalt",
    nameEn: "Asphalt Trial Mix & Hotbin Aggregates",
    nameAr: "تدرج الخلاط الساخن",
    code: "ASPH_HOTBIN",
    unitPrice: "50",
    unit: "%",
    standardRef: "—",
    formTemplate: "asphalt_hotbin",
    sortOrder: 300,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
  },
  {
    category: "asphalt",
    nameEn: "Bitumen Extraction",
    nameAr: "استخلاص البيتومين",
    code: "ASPH_BITUMEN_EXTRACT",
    unitPrice: "200",
    unit: "%",
    standardRef: "ASTM D2172",
    formTemplate: "asphalt_bitumen_extraction",
    sortOrder: 310,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
  },
  {
    category: "asphalt",
    nameEn: "Sieve Analysis of Extracted Aggregates",
    nameAr: "مناخل الركام المستخلص",
    code: "ASPH_EXTRACTED_SIEVE",
    unitPrice: "100",
    unit: "%",
    standardRef: "—",
    formTemplate: "asphalt_extracted_sieve",
    sortOrder: 320,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
  },
  {
    category: "asphalt",
    nameEn: "Bulk Specific Gravity of Compacted HMA (ASTM D 2726)",
    nameAr: "الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)",
    code: "ASPH_MARSHALL_DENSITY",
    unitPrice: "75",
    unit: "g/cm³",
    standardRef: "ASTM D 2726",
    formTemplate: "asphalt_marshall_density",
    sortOrder: 335,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
    requiredTests: ["ASPH_BITUMEN_EXTRACT"],
  },
  {
    category: "asphalt",
    nameEn: "HMA Marshall Stability and Flow (ASTM D 6927)",
    nameAr: "الثبات والتدفق لخلطة HMA (ASTM D 6927)",
    code: "ASPH_MARSHALL",
    unitPrice: "100",
    unit: "kN",
    standardRef: "ASTM D 6927",
    formTemplate: "asphalt_marshall",
    sortOrder: 340,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
    requiredTests: ["ASPH_MARSHALL_DENSITY"],
  },
  {
    category: "asphalt",
    nameEn: "Density and Compaction of Asphalt Core",
    nameAr: "كثافة نواة أسفلت",
    code: "ASPH_CORE",
    unitPrice: "75",
    unit: "Mg/m³",
    standardRef: "—",
    formTemplate: "asphalt_core",
    sortOrder: 345,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
  },
  {
    category: "asphalt",
    nameEn: "Spray Rate",
    nameAr: "معدل الرش",
    code: "ASPH_SPRAY_RATE",
    unitPrice: "50",
    unit: "L/m²",
    standardRef: "—",
    formTemplate: "asphalt_spray_rate",
    sortOrder: 350,
    testSubType: ASPHALT_MIX_COURSE_OPTIONS,
  },
  { category: "aggregates", nameEn: "Specific Gravity & Water Absorption", nameAr: "الوزن النوعي والامتصاص", code: "AGG_SG", unitPrice: "75", unit: "—", standardRef: "BS EN 1097-6", formTemplate: "agg_specific_gravity", sortOrder: 410 },
  { category: "aggregates", nameEn: "Flakiness & Elongation Index", nameAr: "معامل التقشر والاستطالة", code: "AGG_FLAKINESS_ELONGATION", unitPrice: "100", unit: "%", standardRef: "BS EN 933-3 / BS EN 933-4", formTemplate: "agg_shape_index", sortOrder: 420 },
  { category: "aggregates", nameEn: "Aggregate Crushing & Impact Value", nameAr: "قيمة التكسير والصدم", code: "AGG_CRUSHING_IMPACT", unitPrice: "100", unit: "%", standardRef: "BS 812-110 / BS 812-112", formTemplate: "agg_crushing_impact", sortOrder: 430 },
  { category: "aggregates", nameEn: "Los Angeles Abrasion Test", nameAr: "تآكل لوس أنجلوس", code: "AGG_LA", unitPrice: "150", unit: "%", standardRef: "BS EN 1097-2", formTemplate: "agg_la_abrasion", sortOrder: 450 },
];

if (OFFICIAL_TEST_CATALOG.length !== 28) {
  throw new Error(`Official test catalog must contain exactly 28 tests, found ${OFFICIAL_TEST_CATALOG.length}`);
}

const catalogByCode = new Map(OFFICIAL_TEST_CATALOG.map((t) => [t.code, t]));

/** Resolve legacy alias codes (e.g. DIST-2026-042) to canonical catalog codes. */
export function normalizeTestCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return TEST_CODE_ALIASES[code] ?? code;
}

export function getOfficialTestByCode(code: string | null | undefined): OfficialTest | undefined {
  const normalized = normalizeTestCode(code);
  if (!normalized) return undefined;
  return catalogByCode.get(normalized) ?? catalogByCode.get(code ?? "");
}

/** @deprecated Use getOfficialTestByCode */
export const getTestByCode = getOfficialTestByCode;

export type TestDependencySummary = {
  code: string;
  nameEn: string;
  nameAr: string;
};
