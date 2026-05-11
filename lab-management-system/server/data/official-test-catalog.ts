export type TestCategory = "concrete" | "soil" | "steel" | "asphalt" | "aggregates";

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
}

// Official printed tariff catalog (33 tests total)
export const OFFICIAL_TEST_CATALOG: OfficialTest[] = [
  // Concrete (11)
  { category: "concrete", nameEn: "Compressive Strength of Concrete Cubes", nameAr: "ضغط مكعبات الخرسانة", code: "CONC_CUBE", unitPrice: "15", unit: "N/mm²", standardRef: "BS EN 12390-3", formTemplate: "concrete_cubes", sortOrder: 10 }, // ✅ WORKING
  { category: "concrete", nameEn: "Compressive Strength of Concrete Cores", nameAr: "ضغط نواة خرسانية", code: "CONC_CORE", unitPrice: "20", unit: "N/mm²", standardRef: "BS EN 12504-1", formTemplate: "concrete_cores", sortOrder: 20 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Compressive Strength of Masonry Blocks", nameAr: "بلوك خرساني", code: "CONC_BLOCK", unitPrice: "30", unit: "N/mm²", standardRef: "BS EN 771-3", formTemplate: "concrete_blocks", sortOrder: 30 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Compressive Strength of Interlocking Tiles", nameAr: "بلاط انترلوك", code: "CONC_INTERLOCK", unitPrice: "20", unit: "N/mm²", standardRef: "BS EN 1338", formTemplate: "interlock", sortOrder: 40 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Compressive Strength of Lightweight Foam Concrete Cubes", nameAr: "خرسانة رغوية", code: "CONC_FOAM", unitPrice: "15", unit: "N/mm²", standardRef: "—", formTemplate: "concrete_foam", sortOrder: 50 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Oven Dry Density (Foam Concrete)", nameAr: "كثافة خرسانة رغوية", code: "CONC_FOAM_DENSITY", unitPrice: "40", unit: "kg/m³", standardRef: "—", formTemplate: "concrete_foam", sortOrder: 51 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Initial Setting Time of Cement", nameAr: "زمن تصلب الأسمنت", code: "CEM_SETTING_TIME", unitPrice: "100", unit: "min", standardRef: "ASTM C191 / BS EN 196-3", formTemplate: "cement_setting_time", sortOrder: 60 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Sieve Analysis of Sand for Plaster / Masonry Mortar", nameAr: "رمل ملاط (مناخل)", code: "CONC_MORTAR_SAND", unitPrice: "200", unit: "%", standardRef: "BS EN 13139", formTemplate: "sieve_analysis", sortOrder: 70 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Flexural Strength of Concrete Beams 10×10×50 cm", nameAr: "عتة خرسانية صغيرة", code: "CONC_BEAM_SMALL", unitPrice: "80", unit: "kN", standardRef: "BS EN 12390-5", formTemplate: "concrete_beam", sortOrder: 80 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Flexural Strength of Concrete Beams 15×15×75 cm", nameAr: "عتة خرسانية كبيرة", code: "CONC_BEAM_LARGE", unitPrice: "100", unit: "kN", standardRef: "BS EN 12390-5", formTemplate: "concrete_beam", sortOrder: 81 }, // ⚠️ NEEDS FORM
  { category: "concrete", nameEn: "Mix Aggregate Gradation", nameAr: "تدرج ركام الخلطة", code: "CONC_MIX_GRAD", unitPrice: "65", unit: "%", standardRef: "ASTM C33 / BS EN 12620", formTemplate: "concrete_mix_grad", sortOrder: 90, isActive: true }, // ⚠️ NEEDS FORM

  // Soil (5)
  { category: "soil", nameEn: "Sieve Analysis of Soil", nameAr: "تحليل المناخل للتربة", code: "SOIL_SIEVE", unitPrice: "100", unit: "%", standardRef: "BS 1377", formTemplate: "sieve_analysis", sortOrder: 100 }, // ⚠️ NEEDS FORM
  { category: "soil", nameEn: "Atterberg Limits of Soil (Plasticity Index)", nameAr: "حدود أتربرج للتربة (مؤشر اللدونة)", code: "SOIL_ATTERBERG", unitPrice: "150", unit: "%", standardRef: "BS 1377-2", formTemplate: "soil_atterberg", sortOrder: 110 }, // ⚠️ NEEDS FORM
  { category: "soil", nameEn: "MDD/OMC (Proctor) test", nameAr: "اختبار بروكتور / MDD و OMC", code: "SOIL_PROCTOR", unitPrice: "300", unit: "kN/m³", standardRef: "BS 1377-4", formTemplate: "soil_proctor", sortOrder: 120 }, // ⚠️ NEEDS FORM
  { category: "soil", nameEn: "California Bearing Ratio (CBR) Test", nameAr: "نسبة تحمل كاليفورنيا", code: "SOIL_CBR", unitPrice: "250", unit: "%", standardRef: "BS 1377-9", formTemplate: "soil_cbr", sortOrder: 130 }, // ⚠️ NEEDS FORM
  { category: "soil", nameEn: "Field Density (Compaction Test) at Site", nameAr: "كثافة حقلية", code: "SOIL_FIELD_DENSITY", unitPrice: "100", unit: "Mg/m³", standardRef: "BS 1377-9", formTemplate: "soil_field_density", sortOrder: 140 }, // ⚠️ NEEDS FORM

  // Steel (5)
  { category: "steel", nameEn: "Tensile Strength of Reinforcement Steel", nameAr: "شد حديد التسليح", code: "STEEL_REBAR", unitPrice: "300", unit: "N/mm²", standardRef: "BS 4449", formTemplate: "steel_rebar", sortOrder: 200 }, // ⚠️ NEEDS FORM
  { category: "steel", nameEn: "Bend Test", nameAr: "اختبار الانحناء", code: "STEEL_BEND", unitPrice: "100", unit: "—", standardRef: "BS 4449", formTemplate: "steel_bend_rebend", sortOrder: 210 }, // ⚠️ NEEDS FORM
  { category: "steel", nameEn: "Rebend Test", nameAr: "إعادة الانحناء", code: "STEEL_REBEND", unitPrice: "100", unit: "—", standardRef: "BS 4449", formTemplate: "steel_bend_rebend", sortOrder: 211 }, // ⚠️ NEEDS FORM
  { category: "steel", nameEn: "Tensile Strength of Anchor Bolts", nameAr: "برغي تثبيت", code: "STEEL_ANCHOR", unitPrice: "300", unit: "kN", standardRef: "—", formTemplate: "steel_anchor_bolt", sortOrder: 220 }, // ⚠️ NEEDS FORM
  { category: "steel", nameEn: "Tensile Strength of Structural Steel", nameAr: "حديد إنشائي", code: "STEEL_STRUCTURAL", unitPrice: "300", unit: "N/mm²", standardRef: "BS EN 10025", formTemplate: "steel_structural", sortOrder: 230 }, // ⚠️ NEEDS FORM

  // Asphalt (6)
  { category: "asphalt", nameEn: "Asphalt Trial Mix & Hotbin Aggregates — Grading", nameAr: "تدرج الخلاط الساخن", code: "ASPH_HOTBIN", unitPrice: "50", unit: "%", standardRef: "—", formTemplate: "asphalt_hotbin", sortOrder: 300 }, // ⚠️ NEEDS FORM
  { category: "asphalt", nameEn: "Bitumen Extraction", nameAr: "استخلاص البيتومين", code: "ASPH_BITUMEN_EXTRACT", unitPrice: "200", unit: "%", standardRef: "ASTM D2172", formTemplate: "asphalt_bitumen_extraction", sortOrder: 310 }, // ⚠️ NEEDS FORM
  { category: "asphalt", nameEn: "Sieve Analysis of Extracted Aggregates", nameAr: "مناخل الركام المستخلص", code: "ASPH_EXTRACTED_SIEVE", unitPrice: "100", unit: "%", standardRef: "—", formTemplate: "asphalt_extracted_sieve", sortOrder: 320 }, // ⚠️ NEEDS FORM
  { category: "asphalt", nameEn: "Stability, Flow & Voids Percentage of Marshall Specimens", nameAr: "مارشال", code: "ASPH_MARSHALL", unitPrice: "150", unit: "kN", standardRef: "ASTM D6927", formTemplate: "asphalt_marshall", sortOrder: 330 }, // ⚠️ NEEDS FORM
  { category: "asphalt", nameEn: "Marshall Density of Asphalt Samples", nameAr: "كثافة مارشال", code: "ASPH_MARSHALL_DENSITY", unitPrice: "150", unit: "Mg/m³", standardRef: "ASTM D6927", formTemplate: "asphalt_marshall", sortOrder: 331 }, // ⚠️ NEEDS FORM
  { category: "asphalt", nameEn: "Density and Percentage of Compaction of Asphalt Core Specimens", nameAr: "نواة أسفلت", code: "ASPH_CORE", unitPrice: "75", unit: "Mg/m³", standardRef: "—", formTemplate: "asphalt_core", sortOrder: 340 }, // ⚠️ NEEDS FORM

  // Aggregates (6)
  { category: "aggregates", nameEn: "Sieve Analysis of Concrete Aggregates", nameAr: "مناخل الركام", code: "AGG_SIEVE", unitPrice: "100", unit: "%", standardRef: "BS EN 933-1", formTemplate: "sieve_analysis", sortOrder: 400 }, // ⚠️ NEEDS FORM
  { category: "aggregates", nameEn: "Specific Gravity & Absorption of Coarse & Fine Aggregates", nameAr: "الوزن النوعي والامتصاص", code: "AGG_SG", unitPrice: "75", unit: "—", standardRef: "BS EN 1097-6", formTemplate: "agg_specific_gravity", sortOrder: 410 }, // ⚠️ NEEDS FORM
  { category: "aggregates", nameEn: "Flakiness & Elongation Index", nameAr: "معامل التقشر والاستطالة", code: "AGG_FLAKINESS_ELONGATION", unitPrice: "100", unit: "%", standardRef: "BS EN 933-3 / -4", formTemplate: "agg_shape_index", sortOrder: 420 }, // ⚠️ NEEDS FORM
  { category: "aggregates", nameEn: "Aggregate Crushing Value", nameAr: "قيمة التكسير ACV", code: "AGG_CRUSHING", unitPrice: "100", unit: "%", standardRef: "BS 812-110", formTemplate: "agg_crushing", sortOrder: 430 }, // ⚠️ NEEDS FORM
  { category: "aggregates", nameEn: "Aggregate Impact Value", nameAr: "قيمة الصدم AIV", code: "AGG_IMPACT", unitPrice: "100", unit: "%", standardRef: "BS 812-112", formTemplate: "agg_impact", sortOrder: 440 }, // ⚠️ NEEDS FORM
  { category: "aggregates", nameEn: "Los Angeles Abrasion Test", nameAr: "تآكل لوس أنجلوس", code: "AGG_LA", unitPrice: "150", unit: "%", standardRef: "BS EN 1097-2", formTemplate: "agg_la_abrasion", sortOrder: 450 }, // ⚠️ NEEDS FORM
];

if (OFFICIAL_TEST_CATALOG.length !== 33) {
  throw new Error(`Official test catalog must contain exactly 33 tests, found ${OFFICIAL_TEST_CATALOG.length}`);
}
