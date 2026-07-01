/**
 * Shared labels, units, and CSS classes for printable lab reports.
 * Units in report values are always shown in English (N/mm², mm, kN, %, …).
 */

import { getOfficialTestByCode } from "@/lib/officialTestCatalog";

export const REPORT_INFO_SECTION_CLASS = "report-info-section mb-5 pb-4 border-b border-gray-200";
export const REPORT_INFO_TABLE_CLASS = "report-info-table w-full border-collapse text-xs";
/** Section titles: Summary Results, Detailed Results, Notes */
export const REPORT_SECTION_HEADING_CLASS =
  "report-section-heading text-sm font-extrabold text-slate-900 uppercase tracking-[0.08em] border-b-2 border-slate-500 pb-2 mb-3 print:text-black";
/** Metadata table labels — Test Type, Standard, Contractor, … (larger than values) */
export const REPORT_META_LABEL_CLASS =
  "report-field-label px-0 py-2 text-slate-900 w-[24%] text-xs font-extrabold uppercase tracking-wide align-top leading-tight print:text-black";
export const REPORT_META_VALUE_CLASS =
  "report-field-value px-2 py-2 font-normal text-slate-700 w-[26%] text-[11px] align-top leading-snug print:text-black";
export const REPORT_META_EMPTY_CLASS = "px-2 py-2 align-top";
/** @deprecated Use REPORT_INFO_TABLE_CLASS for borderless info; metadata-table kept for legacy results metadata only */
export const REPORT_META_TABLE_CLASS = REPORT_INFO_TABLE_CLASS;
export const REPORT_REF_LABEL_CLASS =
  "report-field-label text-slate-900 text-xs font-extrabold uppercase tracking-wide block mb-1.5 print:text-black";
export const REPORT_REF_VALUE_CLASS =
  "report-field-value font-mono font-normal text-slate-700 text-[11px] print:text-black";
/** Label above a value in detailed-result info cards (Block Type, Size, etc.). */
export const REPORT_INFO_LABEL_CLASS =
  "report-field-label text-slate-900 text-xs font-extrabold uppercase tracking-wide leading-tight mb-1.5 print:text-black";
export const REPORT_INFO_VALUE_CLASS =
  "report-field-value text-slate-700 text-[11px] font-normal leading-snug print:text-black";

/** Already shown in the report metadata table — hide from summary / detailed info cards. */
export const REPORT_DUPLICATE_METADATA_KEYS = new Set(["standard"]);

type RequiredSpec = { labelEn: string; labelAr: string; unit: string };

const REQUIRED_BY_TEMPLATE: Record<string, RequiredSpec> = {
  default: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  concrete_core: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  concrete_blocks: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  concrete_cubes: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  interlock: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  conc_foam: { labelEn: "Required strength", labelAr: "المقاومة المطلوبة", unit: "N/mm²" },
  agg_la_abrasion: { labelEn: "Required max. loss", labelAr: "الحد الأقصى للفقد", unit: "%" },
  soil_cbr: { labelEn: "Required CBR", labelAr: "CBR المطلوب", unit: "%" },
  soil_field_density: { labelEn: "Required compaction", labelAr: "الدمك المطلوب", unit: "%" },
  asphalt_core: { labelEn: "Required thickness", labelAr: "السماكة المطلوبة", unit: "mm" },
  asphalt_spray_rate: { labelEn: "Required spray rate", labelAr: "معدل الرش المطلوب", unit: "L/m²" },
};

/** English unit suffix for summary keys (always English on reports). */
const SUMMARY_UNITS: Record<string, string> = {
  avgStrength: "N/mm²",
  avgEqStrength: "N/mm²",
  requiredStrength: "N/mm²",
  requiredAtAge: "N/mm²",
  required: "N/mm²",
  mdd: "Mg/m³",
  omc: "%",
  avgAbsorption: "%",
  avgApparentSg: "",
  avgSg: "",
  cbrAt95Mdd: "%",
  cbrAt98Mdd: "%",
  cbrAt100Mdd: "%",
  finalCBR: "%",
  cbrMin: "%",
  retained20mm: "%",
  dryDensityPct: "%",
  coreCount: "",
  registeredQuantity: "",
};

const SUMMARY_LABELS: Record<string, { en: string; ar: string }> = {
  count: { en: "Sample count", ar: "عدد العينات" },
  coreCount: { en: "Sample count", ar: "عدد العينات" },
  registeredQuantity: { en: "Sample count", ar: "عدد العينات" },
  testDate: { en: "Test date", ar: "تاريخ الفحص" },
  avgStrength: { en: "Avg. strength", ar: "متوسط المقاومة" },
  avgEqStrength: { en: "Avg. equivalent strength", ar: "متوسط المقاومة المكافئة" },
  blockType: { en: "Block type", ar: "نوع البلوك" },
  standard: { en: "Standard", ar: "المعيار" },
  overallResult: { en: "Overall result", ar: "النتيجة الإجمالية" },
  aggType: { en: "Aggregate type", ar: "نوع الركام" },
  avgApparentSg: { en: "Average apparent SG", ar: "متوسط الكثافة الظاهرية" },
  avgSg: { en: "Average apparent SG", ar: "متوسط الكثافة الظاهرية" },
  avgAbsorption: { en: "Average water absorption", ar: "متوسط امتصاص الماء" },
  mdd: { en: "MDD", ar: "MDD" },
  omc: { en: "OMC", ar: "OMC" },
  cbrAt95Mdd: { en: "CBR @ 95% MDD", ar: "CBR @ 95% MDD" },
  cbrAt98Mdd: { en: "CBR @ 98% MDD", ar: "CBR @ 98% MDD" },
  cbrAt100Mdd: { en: "CBR @ 100% MDD", ar: "CBR @ 100% MDD" },
  retained20mm: { en: "% retained on 20 mm", ar: "% محتجز على 20 mm" },
  finalCBR: { en: "Final CBR", ar: "CBR النهائي" },
  cbrMin: { en: "Required CBR", ar: "CBR المطلوب" },
  testMethod: { en: "Test method", ar: "طريقة الاختبار" },
  cbrStandard: { en: "Linked CBR standard", ar: "معيار CBR المرتبط" },
  failedSieves: { en: "Failed sieves", ar: "المناخل الراسبة" },
};

const TEMPLATE_SUMMARY_LABELS: Record<string, Record<string, { en: string; ar: string }>> = {
  soil_proctor: {
    mdd: { en: "MDD", ar: "MDD" },
    omc: { en: "OMC", ar: "OMC" },
    testMethod: { en: "Test method", ar: "طريقة الاختبار" },
    cbrStandard: { en: "Linked CBR standard", ar: "معيار CBR المرتبط" },
  },
  agg_specific_gravity: {
    aggType: { en: "Aggregate type", ar: "نوع الركام" },
    avgApparentSg: { en: "Average apparent SG", ar: "متوسط الكثافة الظاهرية" },
    avgSg: { en: "Average apparent SG", ar: "متوسط الكثافة الظاهرية" },
    avgAbsorption: { en: "Average water absorption", ar: "متوسط امتصاص الماء" },
  },
  soil_cbr: {
    mdd: { en: "MDD", ar: "MDD" },
    omc: { en: "OMC", ar: "OMC" },
    standard: { en: "Standard", ar: "المعيار" },
    cbrAt95Mdd: { en: "CBR @ 95% MDD", ar: "CBR @ 95% MDD" },
    cbrAt98Mdd: { en: "CBR @ 98% MDD", ar: "CBR @ 98% MDD" },
    cbrAt100Mdd: { en: "CBR @ 100% MDD", ar: "CBR @ 100% MDD" },
    retained20mm: { en: "% retained on 20 mm", ar: "% محتجز على 20 mm" },
    finalCBR: { en: "Final CBR", ar: "CBR النهائي" },
    cbrMin: { en: "Required CBR", ar: "CBR المطلوب" },
  },
};

function requiredSpec(formTemplate: string): RequiredSpec {
  return REQUIRED_BY_TEMPLATE[formTemplate] ?? REQUIRED_BY_TEMPLATE.default;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export function formatReportSummaryLabel(key: string, formTemplate: string, isAr: boolean): string {
  if (key === "required" || key === "requiredStrength" || key === "requiredAtAge") {
    const spec = requiredSpec(formTemplate);
    const unit = spec.unit ? ` (${spec.unit})` : "";
    return isAr ? `${spec.labelAr}${unit}` : `${spec.labelEn}${unit}`;
  }
  const fromTemplate = TEMPLATE_SUMMARY_LABELS[formTemplate]?.[key];
  if (fromTemplate) return isAr ? fromTemplate.ar : fromTemplate.en;
  const common = SUMMARY_LABELS[key];
  if (common) return isAr ? common.ar : common.en;
  return humanizeKey(key);
}

export function unitForSummaryKey(key: string, formTemplate: string): string {
  if (key === "required" || key === "requiredStrength" || key === "requiredAtAge") {
    return requiredSpec(formTemplate).unit;
  }
  return SUMMARY_UNITS[key] ?? "";
}

export function appendEnglishUnit(display: string, unit: string): string {
  if (!unit || !display || display === "—") return display;
  if (display.includes(unit)) return display;
  return `${display} ${unit}`;
}

export function formatReportSummaryValue(
  key: string,
  value: unknown,
  formTemplate: string,
  isAr: boolean,
  formatters?: {
    formatSg?: (v: unknown) => string;
    formatAbsorption?: (v: unknown) => string;
  },
): string {
  if (value == null || value === "") return "—";

  if (key === "testDate" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString(isAr ? "ar-AE" : "en-GB");
    } catch {
      return String(value);
    }
  }

  if (key === "blockType" && typeof value === "object" && value !== null) {
    const o = value as { label?: string; name?: string; code?: string };
    return o.label ?? o.name ?? o.code ?? "—";
  }

  if (key === "overallResult") {
    const v = String(value).toLowerCase();
    if (v === "pass") return isAr ? "مطابق" : "PASS";
    if (v === "fail") return isAr ? "غير مطابق" : "FAIL";
    if (v === "pending") return isAr ? "قيد الانتظار" : "Pending";
  }

  if (/^cbrAt\d+Mdd$/i.test(key) || key === "finalCBR") {
    const n = Number(value);
    const base = Number.isFinite(n) ? String(Math.round(n)) : "—";
    return appendEnglishUnit(base, "%");
  }

  if (key === "avgApparentSg" || key === "avgSg") {
    return formatters?.formatSg ? formatters.formatSg(value) : String(value);
  }
  if (key === "avgAbsorption") {
    const base = formatters?.formatAbsorption ? formatters.formatAbsorption(value) : String(value);
    return appendEnglishUnit(base.replace(/\s*%?\s*$/, ""), "%");
  }

  const unit = unitForSummaryKey(key, formTemplate);
  const str = typeof value === "number"
    ? (Number.isInteger(value) ? String(value) : value.toFixed(2))
    : String(value);

  return appendEnglishUnit(str, unit);
}

/** Format flat form-data keys for generic report tables. */
export function formatReportPropertyLabel(key: string, isAr: boolean): string {
  return formatReportSummaryLabel(key, "default", isAr);
}

/** Resolve standard text for the metadata table (not duplicated in summary / detail cards). */
export function resolveReportStandardDisplay(opts: {
  formData?: Record<string, unknown> | null;
  dist?: { standardRef?: string | null; testType?: string | null } | null;
  testTypeCode?: string | null;
  override?: string | null;
}): string {
  if (opts.override?.trim()) return opts.override.trim();

  const fd = (opts.formData ?? {}) as Record<string, unknown>;
  const blockSpec = fd.blockSpec as { standard?: string } | undefined;
  const spec = fd.spec as { standard?: string } | undefined;

  const candidates: unknown[] = [
    blockSpec?.standard,
    spec?.standard,
    fd.standard,
    fd.blendStandard,
    fd.sieveStandard === "ASTM"
      ? "ASTM C33 / C136"
      : fd.sieveStandard === "BS"
        ? "BS 882 / BS EN 12620"
        : null,
    fd.cbrStandard,
    opts.dist?.standardRef,
  ];

  for (const c of candidates) {
    const s = c != null ? String(c).trim() : "";
    if (s && s !== "—") return s;
  }

  const code = opts.testTypeCode ?? opts.dist?.testType;
  if (code) {
    const official = getOfficialTestByCode(code);
    if (official?.standardRef?.trim()) return official.standardRef.trim();
  }

  return "—";
}
