/**
 * SpecializedTestReport — Professional printable PDF report for all specialized test types
 * URL: /test-report/:distributionId
 * Supports Arabic / English toggle
 */
import { useParams } from "wouter";
import { Fragment as ReportFragment, useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Printer, X, CheckCircle, XCircle, Globe, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlexibleResultsTable, type Column, formDataToKeyValueRows, keyValueColumns } from "@/components/reports/FlexibleResultsTable";
import { ReportSignatures, pickReviewSignatures } from "@/components/reports/ReportSignatures";
import { LabReportHeader } from "@/components/reports/LabReportHeader";
import { ReportPrintNote } from "@/components/reports/ReportPrintNote";
import { formatCalendarDate, formatReportDate } from "@/lib/dateFormat";
import {
  LAB_PRINT_BODY_CLASS,
  LAB_PRINT_CANVAS_CLASS,
  LAB_PRINT_PAGE_CLASS,
  LAB_PRINT_PAGE_STYLE,
  LAB_PRINT_TAIL_CLASS,
  LAB_PRINT_LEGACY_CLASS,
  printLabReport,
} from "@/lib/labPrintLayout";
import { formatInspectionReference, inspectionRefLabel, reportDocNo } from "@/lib/inspectionReference";
import {
  formatReportSummaryLabel,
  formatReportSummaryValue,
  REPORT_META_LABEL_CLASS,
  REPORT_META_VALUE_CLASS,
  REPORT_REF_LABEL_CLASS,
  REPORT_REF_VALUE_CLASS,
  REPORT_INFO_LABEL_CLASS,
  REPORT_INFO_VALUE_CLASS,
  buildReportSummaryPairs,
  REPORT_BILINGUAL_SUB_CLASS,
  resolveReportStandardDisplay,
} from "@/lib/reportFormatting";
import { calculateFinalBlend, formatDisplaySieveMm } from "@/pages/tests/SieveAnalysis";
import { FOAM_DENSITY_TEST_CODE } from "@shared/foamConcreteTests";
import { buildConcreteSpecimenPrepPairs } from "@shared/concreteSpecimenPrepFields";
import { buildConcreteCubeTestConditionPairs } from "@/lib/concreteCubeTestConditions";
import {
  ReportDetailGrid,
  ReportInfoHeading,
  ReportInfoPairsTable,
  ReportInfoSection,
  ReportReferenceBar,
} from "@/components/reports/ReportInfoLayout";
import {
  formatBlendPct,
  formatSpecLimit,
  normalizeAggSpecType,
  resolveAggBlendLimits,
  roundBlendPct,
} from "@/lib/aggBlendSpecs";
import { EXTRACTED_SIEVE_SIZES } from "@/lib/extractedSieveLimits";
import {
  AGG_SG_SPECS,
  SG_TITLES,
  type AggSgType,
  computeCoarseSg,
  computeFineSg,
  formatAbsorptionDisplay,
  formatSgDisplay,
  roundAbsorptionPct,
  roundSgValue,
} from "@/lib/aggSpecificGravity";
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  buildCbrDensityChartData,
  computeAllAstmSpecimens,
  computeCbrAtMddPercentages,
  hydrateAstmSpecimenInput,
} from "@/lib/soilCBRAstm";
import { peakProctorMdd, peakProctorOmc } from "@/lib/soilProctor";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: any, dec = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toFixed(dec);
}
// Round half away from zero (so .5 always rounds up), then fix decimals.
function fmtHalfUp(v: any, dec = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const factor = 10 ** dec;
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(dec);
}
function fmtDate(d?: string | Date | null) {
  return formatCalendarDate(d);
}

/** Optional context for printable report (casting date, foamed-concrete received date, sieve tested-by). */
type FormReportExtras = {
  castingDateMs?: number | null;
  foamReceivedAt?: string | Date | null;
  foamDistCreatedAt?: string | Date | null;
  /** When formData lacks `testedBy`, use DB row (e.g. older sieve saves). */
  sieveReportTestedBy?: string | null;
  /** Batch embed: hide per-row PASS/FAIL — section header shows verdict */
  embedInBatch?: boolean;
};

/** Omit per-specimen Result columns when batch section already shows pass/fail. */
function omitRowResultColumns(columns: Column[]): Column[] {
  return columns.filter(
    (c) =>
      c.type !== "status" &&
      c.field !== "result" &&
      c.field !== "overallResult" &&
      c.field !== "bendResult",
  );
}

// ─── Section renderers per formTemplate ───────────────────────────────────────
function renderConcreteCore(fd: any, isAr: boolean, castingDateMs?: number | null, embedInBatch = false) {
  // Support both field name conventions: cores[] (new) or rows[] (old)
  const rows = fd.cores ?? fd.rows ?? [];
  const coreType = fd.coreType;
  const endCondition = fd.endCondition;
  const specifiedCubeStrength = fd.specifiedCubeStrength;
  const avgEqStrength = fd.avgEquivalentCubeStrength;
  const required = specifiedCubeStrength ? (specifiedCubeStrength * 1.0).toFixed(1) : null;
  const castMs = fd.castDate ? new Date(fd.castDate).getTime() : castingDateMs;
  // Age calculation helper: (testDate - castingDate) in days
  const calcAge = (testDateMs?: number | null): number | null => {
    if (fd.ageDays != null && !isNaN(Number(fd.ageDays))) return Number(fd.ageDays);
    if (!castMs || !testDateMs) return null;
    return Math.round((testDateMs - castMs) / (1000 * 60 * 60 * 24));
  };
  const hasAge = !!(castMs || fd.ageDays != null);
  const fmtStr = (v: any) => {
    const n = Number(v);
    if (isNaN(n) || v === null || v === undefined || v === "") return "—";
    return (Math.round(n * 10) / 10).toFixed(1);
  };
  // End condition label
  const endConditionLabel = endCondition === "grinded" ? (isAr ? "مطحون" : "Grinded")
    : endCondition === "capped" ? (isAr ? "مغطى" : "Capped")
    : (isAr ? "كما حفر" : "As-Drilled");
  const L = (en: string, ars: string) => (isAr ? ars : en);

  const coreColumns: Column[] = [
    { header: L("Core No.", "رقم الكور"), field: "coreNo", align: "center", render: (v, row) => String((row as any).coreNo ?? ((row as any)._idx + 1)) },
    ...(hasAge ? [{ header: L("Age (Days)", "العمر (يوم)"), field: "_ageDays", align: "center" } as Column] : []),
    { header: L("Dia. (mm)", "القطر (مم)"), field: "diameter", type: "number", decimals: 0, align: "right" },
    {
      header: L("Length (mm)", "الطول (مم)"),
      field: "_lengthMm",
      align: "right",
      render: (_, row) => {
        const displayLength = (row as any).length ?? (row as any).lengthAfterCap;
        return displayLength ? fmt(displayLength, 0) : "—";
      },
    },
    { header: L("Weight in Air (g)", "الوزن في الهواء (غ)"), field: "weightInAir", align: "right", render: (v) => (v != null && v !== "" ? fmt(String(v), 2) : "—") },
    { header: L("Weight in Air (SSD) (g)", "الوزن في الهواء SSD (غ)"), field: "weightInAirSSD", align: "right", render: (v) => (v != null && v !== "" ? fmt(String(v), 2) : "—") },
    { header: L("Weight in Water (g)", "الوزن في الماء (غ)"), field: "weightInWater", align: "right", render: (v) => (v != null && v !== "" ? fmt(String(v), 2) : "—") },
    { header: L("Density (kg/m³)", "الكثافة (كغ/م³)"), field: "density", align: "center", render: (v) => (v != null && v !== "" ? String(v) : "—") },
    { header: L("L/D", "نسبة L/D"), field: "ld", align: "center", render: (_, row) => fmt((row as any).ld ?? (row as any).ldRatio) },
    {
      header: L("C.F.", "معامل التصحيح"),
      field: "correctionFactor",
      align: "center",
      render: (_, row) => {
        const r = row as any;
        const isLDOne = r.ld !== undefined && r.ld >= 1.0 && r.ld < 2.0;
        return isLDOne || Number(r.correctionFactor) >= 0.999 ? "1.000" : fmt(r.correctionFactor);
      },
    },
    { header: L("Load (kN)", "الحمل (كن)"), field: "maxLoad", align: "right", render: (_, row) => fmt((row as any).maxLoad ?? (row as any).maxLoadKN) },
    { header: L("Core Strength (N/mm²)", "مقاومة الكور (N/mm²)"), field: "coreStrength", align: "right", render: (v) => fmtStr(v) },
    {
      header: L("Eq. Cube Strength (N/mm²)", "قوة المكعب المكافئة (N/mm²)"),
      field: "_eq",
      align: "center",
      render: (_, row) => {
        const r = row as any;
        const eqStrength = r.equivalentCubeStrength ?? r.correctedStrength;
        const isLDTwo = r.ld !== undefined && r.ld >= 2.0;
        return (
          <span className="font-bold">
            {fmtStr(eqStrength)}
            {isLDTwo && (
              <sup className="text-amber-600 text-[9px] ms-0.5" title={isAr ? "قوة أسطوانة" : "Cylinder strength"}>
                cyl
              </sup>
            )}
          </span>
        );
      },
    },
    {
      header: L("Result", "النتيجة"),
      field: "result",
      type: "status",
      align: "center",
      render: (_, row) => {
        const r = (row as any).result;
        if (r === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
        if (r === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
        return "—";
      },
    },
  ];

  const tableColumns = embedInBatch ? omitRowResultColumns(coreColumns) : coreColumns;

  return (
    <>
      {/* Summary header */}
      <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
        {specifiedCubeStrength && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "القوة المحددة" : "Specified Str."}</p>
            <p className="font-bold text-amber-800">{specifiedCubeStrength} N/mm²</p>
          </div>
        )}
        {required && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "الحد المطلوب (100%)" : "Required (100%)"}</p>
            <p className="font-bold text-amber-800">{required} N/mm²</p>
          </div>
        )}
        {avgEqStrength != null && (
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط قوة المكعب المكافئة" : "Avg. Eq. Cube Str."}</p>
            <p className="font-bold text-green-800">{fmtStr(avgEqStrength)} N/mm²</p>
          </div>
        )}
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "حالة سطح النهاية" : "End Condition"}</p>
          <p className="font-bold text-slate-800">{endConditionLabel}{coreType ? ` • ${coreType}` : ""}</p>
        </div>
        {fd.castDate && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{isAr ? "تاريخ الصب" : "Date Cast"}</p>
            <p className="font-bold text-slate-800">{fmtDate(fd.castDate)}</p>
          </div>
        )}
        {fd.ageDays != null && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "العمر (يوم)" : "Age (days)"}</p>
            <p className="font-bold text-blue-800">{fd.ageDays}</p>
          </div>
        )}
        {fd.coringDate && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{isAr ? "تاريخ الحفر" : "Date of Coring"}</p>
            <p className="font-bold text-slate-800">{fmtDate(fd.coringDate)}</p>
          </div>
        )}
        {fd.cementType && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{isAr ? "نوع الأسمنت" : "Cement Type"}</p>
            <p className="font-bold text-slate-800">{fd.cementType}</p>
          </div>
        )}
        {(fd.aggTypeMaxSize || fd.aggregateType) && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{isAr ? "نوع الركام والحجم الأقصى" : "Type of Agg. & Max size"}</p>
            <p className="font-bold text-slate-800">{fd.aggTypeMaxSize ?? fd.aggregateType}</p>
          </div>
        )}
        {fd.moistureCondition && (
          <div className="bg-sky-50 border border-sky-200 rounded p-2 text-center">
            <p className="text-sky-600 font-semibold">{L("Moisture Condition", "حالة الرطوبة")}</p>
            <p className="font-bold text-sky-800">
              {fd.moistureCondition === "air_dry" ? L("Air Dry", "جاف هوائي")
                : fd.moistureCondition === "saturated" ? L("Saturated", "مشبع")
                : fd.moistureCondition === "dry" ? L("Oven Dry", "جاف بالفرن")
                : String(fd.moistureCondition)}
            </p>
          </div>
        )}
        {fd.reinforced != null && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{L("Reinforcement", "حديد التسليح")}</p>
            <p className="font-bold text-slate-800">
              {fd.reinforced === "yes" ? L("Reinforced", "مسلح") : L("Not Reinforced", "غير مسلح")}
            </p>
          </div>
        )}
      </div>
      <FlexibleResultsTable
        columns={tableColumns}
        rows={rows.map((r: any, i: number) => ({
          ...r,
          _idx: i,
          _ageDays: hasAge ? (calcAge(r.testDateMs) ?? "—") : undefined,
        }))}
      />
    </>
  );
}

const MASONRY_BLOCKS_COMPLIANCE_NOTE =
  "Samples meet the required compressive strength per DOI Gen.spec.section 04 22 00 part 2.2.B (Load Bearing concrete masonry units.)";

const CONCRETE_BEAM_COMPLIANCE_NOTE =
  "The flexural strength meets the DOI specification requirements as per Section:32 13 11 (concrete Pavements) Section 2.10";

function renderConcreteBlocks(fd: any, isAr: boolean, embedInBatch = false) {
  if (typeof fd.blocks === "string") {
    try {
      fd.blocks = JSON.parse(fd.blocks);
    } catch {
      fd.blocks = [];
    }
  }
  const blocks = (fd.blocks ?? []).filter((b: any) =>
    typeof b === "object" &&
    b !== null &&
    b.strengthMpa != null &&
    Number(b.strengthMpa) > 0
  );
  const spec = fd.blockSpec ?? {};
  const BLOCK_CF_BY_THICKNESS: Record<number, number> = { 100: 0.80, 150: 0.86, 200: 1.00, 250: 1.05 };
  const inferThicknessMm = (b: any): number | undefined => {
    const fromWidth = Number(b.widthMm);
    if (Number.isFinite(fromWidth) && fromWidth > 0) return fromWidth;
    const sizeText = String(spec.size ?? "");
    const m = sizeText.match(/400[×x](\d+)[×x]200/i);
    if (m) return Number(m[1]);
    const blockSize = String(spec.blockSize ?? "");
    const cm = blockSize.match(/(\d+)\s*cm/i);
    if (cm) return Number(cm[1]) * 10;
    return undefined;
  };
  const getBlockCf = (b: any): number => {
    const existing = Number(b.correctionFactor);
    if (Number.isFinite(existing) && existing > 0) return existing;
    const th = inferThicknessMm(b);
    return BLOCK_CF_BY_THICKNESS[th ?? 0] ?? 1.0;
  };
  const getCorrectedStrength = (b: any): number | null => {
    const direct = Number(b.correctedStrengthMpa);
    if (Number.isFinite(direct)) return direct;
    const raw = Number(b.strengthMpa);
    if (!Number.isFinite(raw)) return null;
    return raw * getBlockCf(b);
  };
  const avgCorrectedStrength = blocks.length > 0
    ? blocks.reduce((sum: number, b: any) => sum + (getCorrectedStrength(b) ?? 0), 0) / blocks.length
    : Number(fd.avgStrength ?? 0);
  const fmtS = (v: any) => {
    const n = Number(v);
    if (isNaN(n) || v === "" || v == null) return "—";
    return (Math.round(n * 10) / 10).toFixed(1);
  };
  const headers = isAr
    ? ["المرجع", "الطول", "العرض", "الحمل (كن)", "المساحة (مم²)", "القوة (N/mm²)"]
    : ["Block Ref", "L (mm)", "W (mm)", "Load (kN)", "Gross Area (mm²)", "Strength (N/mm²)"];

  const blockColumns: Column[] = [
    { header: headers[0], field: "blockRef", align: "center", render: (_v, row) => String((row as any).blockRef ?? ((row as any)._bi + 1)) },
    { header: headers[1], field: "lengthMm", align: "center", render: (_v, row) => String((row as any).lengthMm ?? "—") },
    { header: headers[2], field: "widthMm", align: "center", render: (_v, row) => String((row as any).widthMm ?? "—") },
    { header: headers[3], field: "loadKN", align: "center", render: (_v, row) => ((row as any).loadKN != null ? fmt((row as any).loadKN, 1) : "—") },
    { header: headers[4], field: "grossAreaMm2", align: "center", render: (_v, row) => String((row as any).grossAreaMm2 ?? "—") },
    { header: headers[5], field: "strengthMpa", align: "center", render: (v) => <span className="font-semibold">{fmtS(v)}</span> },
  ];

  return (
    <div className="text-xs space-y-3">
      <div className="grid grid-cols-4 gap-2 report-info-grid">
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "نوع البلوك" : "Block Type"}</p>
          <p className={REPORT_INFO_VALUE_CLASS}>{spec.label ?? fd.blockType ?? "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2">
          <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "الحجم" : "Size"}</p>
          <p className={REPORT_INFO_VALUE_CLASS}>{spec.size ?? "—"}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2">
          <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "المقاومة المطلوبة" : "Required Strength"}</p>
          <p className={REPORT_INFO_VALUE_CLASS}>{spec.requiredStrength != null ? `${spec.requiredStrength} N/mm²` : "—"}</p>
        </div>
        {fd.manufacturer && (
          <div className="bg-gray-50 border rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "المصنع / المصدر" : "Manufacturer / Source"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.manufacturer}</p>
          </div>
        )}
        {fd.mtsReference && (
          <div className="bg-gray-50 border rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "مرجع التقديم" : "Material Submittal Ref."}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.mtsReference}</p>
          </div>
        )}
        {fd.batchNo && (
          <div className="bg-gray-50 border rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "الدفعة" : "Batch No."}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.batchNo}</p>
          </div>
        )}
        {fd.moistureCondition && (
          <div className="bg-sky-50 border border-sky-200 rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "حالة الرطوبة عند الاختبار" : "Moisture Condition at Test"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>
              {fd.moistureCondition === "saturated_surface_dry" ? "Saturated Surface Dry (SSD)"
                : fd.moistureCondition === "air_dry" ? "Air Dry"
                : fd.moistureCondition === "oven_dry" ? "Oven Dry"
                : fd.moistureCondition === "wet" ? "Wet"
                : String(fd.moistureCondition)}
            </p>
          </div>
        )}
        {fd.cappingMethod && (
          <div className="bg-gray-50 border rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "طريقة التكييف / التسوية" : "Capping / Bedding Method"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>
              {fd.cappingMethod === "flat_bedded" ? "Flat Bedded (as received)"
                : fd.cappingMethod === "capped_sulfur" ? "Capped — Sulfur Mortar"
                : fd.cappingMethod === "capped_plywood" ? "Capped — Plywood"
                : fd.cappingMethod === "capped_rubber" ? "Capped — Rubber Pad"
                : fd.cappingMethod === "ground" ? "Ground"
                : String(fd.cappingMethod)}
            </p>
          </div>
        )}
        {fd.loadingRate && (
          <div className="bg-gray-50 border rounded p-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "معدل التحميل" : "Loading Rate"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.loadingRate} N/mm²/s</p>
          </div>
        )}
      </div>
      {blocks.length > 0 && <FlexibleResultsTable columns={blockColumns} rows={blocks.map((b: any, i: number) => ({ ...b, _bi: i }))} />}
      <div className="flex flex-wrap gap-3 justify-end text-xs">
        <span className="font-semibold">
          {isAr ? "متوسط القوة المصححة (fb):" : "Avg. Normalised Strength (fb):"} {fmtS(avgCorrectedStrength)} N/mm²
          {" "}/ {isAr ? "المطلوب:" : "Required:"} {fmtS(spec.requiredStrength)} N/mm²
        </span>
        {!embedInBatch && (
        <span className={`font-bold px-2 py-1 rounded border ${fd.overallResult === "pass" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {isAr ? "النتيجة الكلية:" : "Overall:"} {fd.overallResult === "pass" ? (isAr ? "مطابق" : "PASS") : fd.overallResult === "fail" ? (isAr ? "راسب" : "FAIL") : "—"}
        </span>
        )}
      </div>
    </div>
  );
}

function renderSteelRebar(fd: any, isAr: boolean) {
  // Support both 'specimens' (new form key) and 'rows' (legacy)
  const rows = fd.specimens ?? fd.rows ?? [];
  const L = (en: string, ars: string) => isAr ? ars : en;
  const bendResultRender = (_: unknown, row: Record<string, unknown>) => {
    const r = row as any;
    if (r.bendResult === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
    if (r.bendResult === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
    return "—";
  };
  const overallResultRender = (_: unknown, row: Record<string, unknown>) => {
    const r = row as any;
    if (r.overallResult === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
    if (r.overallResult === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
    return "—";
  };
  const steelCols: Column[] = [
    { header: L("Bar No.", "رقم القضيب"), field: "_i", align: "center", render: (_v, row) => String((row as any)._i + 1) },
    { header: L("Dia (mm)", "القطر (مم)"), field: "diameter", type: "number", decimals: 0, align: "right" },
    { header: L("Wt/m (kg)", "الوزن/م (كغ)"), field: "weightPerMeter", type: "number", decimals: 2, align: "right" },
    { header: L("Area (mm²)", "المساحة (مم²)"), field: "area", align: "right", render: (_v, row) => {
      const r = row as any;
      const area = r.area ?? r.actualArea;
      return area != null ? String(Number(area).toFixed(2)) : "—";
    }},
    { header: L("GL₀ (mm)", "طول القياس (مم)"), field: "gaugeLength", align: "right", render: (_v, row) => {
      const r = row as any;
      const gl = r.gaugeLength ?? r.gaugeLength0 ?? r.gl0;
      return gl != null && gl !== "" ? String(gl) : "—";
    }},
    { header: L("Yield (kN)", "حمل الخضوع (كن)"), field: "yieldLoadKN", type: "number", decimals: 2, align: "right" },
    { header: L("Re (MPa)", "مقاومة الخضوع"), field: "yieldStrength", type: "number", decimals: 1, align: "right" },
    { header: L("UTS (kN)", "حمل UTS (كن)"), field: "utsLoadKN", type: "number", decimals: 2, align: "right" },
    { header: L("Rm (MPa)", "UTS"), field: "uts", type: "number", decimals: 1, align: "right" },
    { header: L("Rm/Re", "نسبة Rm/Re"), field: "_rmre", align: "center", render: (_v, row) => {
      const r = row as any;
      const re = Number(r.yieldStrength);
      const rm = Number(r.uts ?? r.tensileStrength);
      if (!re || !rm) return "—";
      return (rm / re).toFixed(2);
    }},
    { header: L("Agt (%)", "Agt (%)"), field: "elongation", type: "number", decimals: 2, align: "right" },
    { header: L("Bend", "الانحناء"), field: "bendResult", align: "center", render: bendResultRender },
    { header: L("Result", "النتيجة"), field: "overallResult", align: "center", render: overallResultRender },
  ];
  return (
    <div className="space-y-2">
      {(fd.standard || fd.spec?.label) && (
        <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2 flex gap-4">
          {fd.standard && <span><span className="font-semibold">{L("Standard:", "المعيار:")} </span>{fd.standard}</span>}
          {fd.heatNo && <span><span className="font-semibold">{L("Heat No.:", "رقم الصهر:")} </span>{fd.heatNo}</span>}
          {fd.supplier && <span><span className="font-semibold">{L("Supplier:", "المورد:")} </span>{fd.supplier}</span>}
        </div>
      )}
      <FlexibleResultsTable columns={steelCols} rows={rows.map((r: any, i: number) => ({ ...r, _i: i }))} />
    </div>
  );
}

// ─── Structural steel & anchor bolt (tensile) report renderers ──────────────────
const STEEL_SECTION_LABELS: Record<string, { en: string; ar: string }> = {
  flat_bar: { en: "Flat Bar", ar: "شريط مسطح" },
  angle_L50x50x5: { en: "Angle 50×50×5", ar: "زاوية 50×50×5" },
  angle_L63x63x6: { en: "Angle 63×63×6", ar: "زاوية 63×63×6" },
  angle_L75x75x8: { en: "Angle 75×75×8", ar: "زاوية 75×75×8" },
  angle_L100x100x10: { en: "Angle 100×100×10", ar: "زاوية 100×100×10" },
  angle_L120x120x12: { en: "Angle 120×120×12", ar: "زاوية 120×120×12" },
  angle_L150x150x15: { en: "Angle 150×150×15", ar: "زاوية 150×150×15" },
  rhs_40x20x2: { en: "Rect. Tube 40×20×2", ar: "أنبوب مستطيل 40×20×2" },
  rhs_50x25x2: { en: "Rect. Tube 50×25×2", ar: "أنبوب مستطيل 50×25×2" },
  rhs_60x40x3: { en: "Rect. Tube 60×40×3", ar: "أنبوب مستطيل 60×40×3" },
  rhs_80x40x3: { en: "Rect. Tube 80×40×3", ar: "أنبوب مستطيل 80×40×3" },
  rhs_100x50x3: { en: "Rect. Tube 100×50×3", ar: "أنبوب مستطيل 100×50×3" },
  rhs_120x60x4: { en: "Rect. Tube 120×60×4", ar: "أنبوب مستطيل 120×60×4" },
  hea_100: { en: "HEA 100", ar: "HEA 100" },
  hea_120: { en: "HEA 120", ar: "HEA 120" },
  hea_160: { en: "HEA 160", ar: "HEA 160" },
  heb_100: { en: "HEB 100", ar: "HEB 100" },
  ipe_100: { en: "IPE 100", ar: "IPE 100" },
  ipe_160: { en: "IPE 160", ar: "IPE 160" },
  hollow_section: { en: "Hollow Section", ar: "قطاع مجوف" },
  other: { en: "Other", ar: "أخرى" },
};

function steelSectionLabel(row: any, isAr: boolean): string {
  const key = String(row?.sectionType ?? "");
  if (key === "other") return row?.section || (isAr ? "أخرى" : "Other");
  const m = STEEL_SECTION_LABELS[key];
  if (m) return isAr ? m.ar : m.en;
  return row?.section || key.replace(/_/g, " ") || "—";
}

function steelResultBadge(value: unknown, isAr: boolean) {
  if (value === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
  if (value === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
  return "—";
}

/** Compact colored info band shown above a steel specimen table. */
function SteelSpecBand({ items }: { items: [string, string][] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs mb-1 report-info-grid">
      {items.map(([label, value], i) => (
        <div key={i} className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-center">
          <p className={REPORT_INFO_LABEL_CLASS}>{label}</p>
          <p className={REPORT_INFO_VALUE_CLASS}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function renderSteelStructural(fd: any, isAr: boolean) {
  const specimens: any[] = Array.isArray(fd?.specimens) ? fd.specimens : [];
  const spec = fd?.spec ?? {};
  const gradeLabel = spec.label ?? fd?.grade ?? "—";
  const cols: Column[] = [
    { header: isAr ? "رقم" : "No.", field: "_i", align: "center", render: (_v, r) => String((r as any)._i + 1) },
    { header: isAr ? "القطاع" : "Section", field: "sectionType", align: "center", render: (_v, r) => steelSectionLabel(r, isAr) },
    { header: isAr ? "العرض (مم)" : "Width (mm)", field: "width", type: "number", decimals: 1 },
    { header: isAr ? "السمك (مم)" : "Thick. (mm)", field: "thickness", type: "number", decimals: 1 },
    { header: isAr ? "المساحة (مم²)" : "Area (mm²)", field: "area", type: "number", decimals: 2 },
    { header: isAr ? "حمل الخضوع (كن)" : "Yield Load (kN)", field: "yieldLoad", type: "number", decimals: 2 },
    { header: isAr ? "أقصى حمل (كن)" : "Max Load (kN)", field: "maxLoad", type: "number", decimals: 2 },
    { header: isAr ? "إجهاد الخضوع (MPa)" : "Yield (MPa)", field: "yieldStrength", type: "number", decimals: 1 },
    { header: isAr ? "إجهاد الشد (MPa)" : "Tensile (MPa)", field: "tensileStrength", type: "number", decimals: 1 },
    { header: isAr ? "الاستطالة (%)" : "Elong. (%)", field: "elongation", type: "number", decimals: 1 },
    { header: isAr ? "النتيجة" : "Result", field: "overallResult", align: "center", render: (v) => steelResultBadge(v, isAr) },
  ];
  const band: ([string, string] | undefined)[] = [
    [isAr ? "الدرجة" : "Grade", String(gradeLabel)],
    fd?.heatNo ? [isAr ? "رقم الصهر" : "Heat No.", String(fd.heatNo)] : undefined,
    fd?.gaugeLength ? [isAr ? "طول القياس" : "Gauge Length", `${fd.gaugeLength} mm`] : undefined,
    spec.yieldMin != null ? [isAr ? "أدنى خضوع" : "Min Yield", `${spec.yieldMin} MPa`] : undefined,
    spec.tensileMin != null
      ? [isAr ? "نطاق الشد" : "Tensile Range", `${spec.tensileMin}–${spec.tensileMax} MPa`]
      : undefined,
    spec.elongationMin != null ? [isAr ? "أدنى استطالة" : "Min Elong.", `${spec.elongationMin}%`] : undefined,
  ];
  return (
    <div className="space-y-3">
      <SteelSpecBand items={band.filter(Boolean) as [string, string][]} />
      <FlexibleResultsTable columns={cols} rows={specimens.map((s, i) => ({ ...s, _i: i }))} />
    </div>
  );
}

function renderSteelAnchorBolt(fd: any, isAr: boolean) {
  const specimens: any[] = Array.isArray(fd?.specimens) ? fd.specimens : [];
  const cols: Column[] = [
    {
      header: isAr ? "رقم العينة" : "Sample",
      field: "specimenNumber",
      align: "center",
      render: (_v, r) => String((r as any).specimenNumber ?? (r as any)._i + 1),
    },
    { header: isAr ? "التجربة" : "Trial", field: "trials", align: "center", render: (v) => String(v || "—") },
    { header: isAr ? "الحجم الاسمي (مم)" : "Nominal (mm)", field: "nominalSize", type: "number", decimals: 0 },
    { header: isAr ? "قطر المقطع (مم)" : "Cut Dia (mm)", field: "cutSectionDiameter", type: "number", decimals: 1 },
    { header: isAr ? "المساحة (مم²)" : "Area (mm²)", field: "cutSectionArea", type: "number", decimals: 2 },
    { header: isAr ? "الحمل (كن)" : "Load (kN)", field: "loadKN", type: "number", decimals: 1 },
    { header: "Rm (MPa)", field: "tensileStrengthMPa", type: "number", decimals: 1 },
    { header: "GL (mm)", field: "glMm", type: "number", decimals: 0 },
    { header: isAr ? "الاستطالة (%)" : "Elong. (%)", field: "elongation", type: "number", decimals: 1 },
    { header: "%RA", field: "reductionOfArea", type: "number", decimals: 1 },
    { header: isAr ? "الدرجة" : "Grade", field: "grade", align: "center", render: (v) => String(v || "—") },
    { header: isAr ? "النتيجة" : "Result", field: "overallResult", align: "center", render: (v) => steelResultBadge(v, isAr) },
  ];
  const boltLabel = fd?.testInfo?.boltType ?? fd?.boltType;
  const proofLoad = fd?.proofLoad ?? fd?.testInfo?.proofLoad;
  const band: ([string, string] | undefined)[] = [
    boltLabel ? [isAr ? "نوع البرغي" : "Bolt Type", String(boltLabel)] : undefined,
    fd?.concreteGrade ? [isAr ? "درجة الخرسانة" : "Concrete Grade", String(fd.concreteGrade)] : undefined,
    fd?.embedmentDepth ? [isAr ? "عمق التثبيت (مم)" : "Embedment (mm)", String(fd.embedmentDepth)] : undefined,
    proofLoad ? [isAr ? "حمل الإثبات" : "Proof Load", `${proofLoad} kN`] : undefined,
  ];
  return (
    <div className="space-y-3">
      <SteelSpecBand items={band.filter(Boolean) as [string, string][]} />
      <FlexibleResultsTable columns={cols} rows={specimens.map((s, i) => ({ ...s, _i: i }))} />
    </div>
  );
}

function _parseReportBlendNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function _reportBlendWhiteUsedPct(fd: Record<string, unknown>, row: Record<string, unknown>): number | null {
  return (
    _parseReportBlendNum(fd.whiteUsedPct) ??
    _parseReportBlendNum(fd.masonryWhiteSandUsedPct) ??
    _parseReportBlendNum(row.whiteSandUsed) ??
    _parseReportBlendNum(row.whiteUsedPct)
  );
}

function _reportBlendBlackUsedPct(fd: Record<string, unknown>, row: Record<string, unknown>): number | null {
  return (
    _parseReportBlendNum(fd.blackUsedPct) ??
    _parseReportBlendNum(row.blackSandUsed) ??
    _parseReportBlendNum(row.blackUsedPct)
  );
}

function _reportBlendWhitePassPct(row: Record<string, unknown>): number | null {
  return (
    _parseReportBlendNum(row.whitePassPct) ??
    _parseReportBlendNum(row.whiteSandOriginalPass ?? row.whiteSandOriginal)
  );
}

function _reportBlendBlackPassPct(row: Record<string, unknown>): number | null {
  return (
    _parseReportBlendNum(row.blackPassPct) ??
    _parseReportBlendNum(row.blackSandOriginalPass ?? row.blackSandOriginal)
  );
}

function _isSandBlendSieveFormData(fd: any): boolean {
  if (!Array.isArray(fd?.sieveData) || fd.sieveData.length === 0) return false;
  if (fd.testMode === "blend" || fd.standard != null || fd.blendStandard != null || fd.blendFormula === "WEIGHTED_PASS_V1")
    return true;
  const r0 = fd.sieveData[0] as Record<string, unknown> | undefined;
  if (!r0) return false;
  return (
    "whitePassPct" in r0 ||
    "whiteSandOriginalPass" in r0 ||
    "whiteSandOriginal" in r0 ||
    "finalBlend" in r0
  );
}

/** Grading curve for sand-blend sieve PDF / print (log sieve size). */
function SieveBlendReportGradingChart({
  sieveData,
  wu,
  bu,
  isAr,
}: {
  sieveData: Array<Record<string, unknown>>;
  wu: number | null;
  bu: number | null;
  isAr: boolean;
}) {
  const chartData = sieveData.map(rec => {
    const mm = _parseReportBlendNum(rec.sieveMm) ?? 0;
    const sieveLog = Math.max(mm, 0.01);
    const blend =
      _parseReportBlendNum(rec.finalBlend) ??
      calculateFinalBlend(wu, _reportBlendWhitePassPct(rec), bu, _reportBlendBlackPassPct(rec));
    const wp = _reportBlendWhitePassPct(rec);
    const bp = _reportBlendBlackPassPct(rec);
    const lo = _parseReportBlendNum(rec.lowerLimit);
    const hi = _parseReportBlendNum(rec.upperLimit);
    return {
      sieveLog,
      upperLimit: hi,
      lowerLimit: lo,
      whitePass: wp ?? 0,
      blackPass: bp ?? 0,
      blend: blend != null ? Number(blend.toFixed(2)) : null,
    };
  });

  const kUp = isAr ? "الحد الأعلى" : "Upper Limit / الحد الأعلى";
  const kLo = isAr ? "الحد الأدنى" : "Lower Limit / الحد الأدنى";
  const kWhite = isAr ? "الرمل الأبيض" : "White Sand / الرمل الأبيض";
  const kBlack = isAr ? "الرمل الأسود" : "Black Sand / الرمل الأسود";
  const kBlend = isAr ? "الخلطة النهائية" : "Final Blend / الخلطة النهائية";

  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1 print:p-0" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="sieveLog"
            scale="log"
            domain={[0.05, 10]}
            tick={{ fontSize: 9 }}
            tickFormatter={(v: number) => formatDisplaySieveMm(Number(v))}
            label={{
              value: isAr ? "مقاس المنخل (مم)" : "Sieve Size (mm) / مقاس المنخل",
              position: "insideBottom",
              offset: -18,
              style: { fontSize: 10 },
            }}
          />
          <YAxis
            domain={[0, 100]}
            width={40}
            tick={{ fontSize: 9 }}
            label={{
              value: isAr ? "النسبة المارة %" : "% Passing / النسبة المارة",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10 },
            }}
          />
          <Tooltip
            formatter={(value: unknown) => {
              const v = Array.isArray(value) ? value[0] : value;
              const n = typeof v === "number" ? v : Number(v);
              return n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
            }}
            contentStyle={{ fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
          <Line type="monotone" dataKey="upperLimit" stroke="#888888" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={kUp} connectNulls />
          <Line type="monotone" dataKey="lowerLimit" stroke="#888888" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={kLo} connectNulls />
          <Line type="monotone" dataKey="whitePass" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} name={kWhite} />
          <Line type="monotone" dataKey="blackPass" stroke="#374151" strokeWidth={2} dot={{ r: 2 }} name={kBlack} />
          <Line type="monotone" dataKey="blend" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} name={kBlend} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grading curve for the standard (by-weight) sieve analysis PDF / print. */
function SieveWeightReportGradingChart({
  rows,
  isAr,
}: {
  rows: Array<Record<string, unknown>>;
  isAr: boolean;
}) {
  const chartData = rows
    .map(r => {
      const mm = Number(r.sieveMm ?? r.sieve ?? r.size ?? NaN);
      const passing =
        r.cumPassing != null ? Number(r.cumPassing) : r.percentPassing != null ? Number(r.percentPassing) : null;
      const lower = r.lower != null ? Number(r.lower) : r.lowerLimit != null ? Number(r.lowerLimit) : null;
      const upper = r.upper != null ? Number(r.upper) : r.upperLimit != null ? Number(r.upperLimit) : null;
      return {
        sieveLog: Number.isFinite(mm) && mm > 0 ? mm : 0.01,
        passing: passing != null && Number.isFinite(passing) ? Number(passing.toFixed(1)) : null,
        lower: lower != null && Number.isFinite(lower) ? lower : null,
        upper: upper != null && Number.isFinite(upper) ? upper : null,
      };
    })
    .filter(d => d.sieveLog > 0)
    .sort((a, b) => a.sieveLog - b.sieveLog);

  if (chartData.length < 2) return null;

  const kPass = isAr ? "النسبة المارة %" : "% Passing / النسبة المارة";
  const kUp = isAr ? "الحد الأعلى" : "Upper Limit / الحد الأعلى";
  const kLo = isAr ? "الحد الأدنى" : "Lower Limit / الحد الأدنى";

  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1 print:p-0" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 14, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="sieveLog"
            scale="log"
            domain={[0.05, 100]}
            tick={{ fontSize: 9 }}
            tickFormatter={(v: number) => formatDisplaySieveMm(Number(v))}
            label={{
              value: isAr ? "مقاس المنخل (مم)" : "Sieve Size (mm) / مقاس المنخل",
              position: "insideBottom",
              offset: -18,
              style: { fontSize: 10 },
            }}
          />
          <YAxis
            domain={[0, 100]}
            width={40}
            tick={{ fontSize: 9 }}
            label={{
              value: isAr ? "النسبة المارة %" : "% Passing / النسبة المارة",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10 },
            }}
          />
          <Tooltip
            formatter={(value: unknown) => {
              const n = typeof value === "number" ? value : Number(value);
              return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
            }}
            contentStyle={{ fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
          <Line type="monotone" dataKey="upper" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={kUp} connectNulls />
          <Line type="monotone" dataKey="lower" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={kLo} connectNulls />
          <Line type="monotone" dataKey="passing" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: "#16a34a" }} name={kPass} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderAggBlendSieve(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const sizes: any[] = Array.isArray(fd.sizes) ? fd.sizes : [];
  const rows: any[] = Array.isArray(fd.rows) ? fd.rows : [];
  const passesSpec = fd.passesSpec === true;
  const specLabel = normalizeAggSpecType(fd.specType);
  const LIMIT_EPS = 0.05;

  const chartData = rows.map((r: any) => {
    const sieveMm = Number(r.sieveMm);
    const catalog = resolveAggBlendLimits(specLabel, sieveMm);
    const lower =
      typeof r.lower === "number" && Number.isFinite(r.lower) ? r.lower : catalog.lower;
    const upper =
      typeof r.upper === "number" && Number.isFinite(r.upper) ? r.upper : catalog.upper;
    const blendRaw = r.blend != null ? Number(r.blend) : null;
    return {
      sieveMm: r.sieveMm != null ? formatDisplaySieveMm(sieveMm) : String(r.sieve ?? ""),
      sieveLog: Math.max(sieveMm || 0.01, 0.01),
      blend: blendRaw != null && Number.isFinite(blendRaw) ? roundBlendPct(blendRaw) : null,
      lower,
      upper,
    };
  });
  const hasChart = chartData.length >= 2 && chartData.some(d => d.blend != null);

  return (
    <div className="space-y-4 text-[11px]">
      <div className="text-center border-b-2 border-slate-300 pb-3">
        <h3 className="text-base font-semibold text-slate-800">
          {L("Sieve Analysis of Concrete Aggregates — Blend (Mix Design)", "تحليل المناخل لركام الخرسانة — الخلطة (تصميم الخلطة)")}
        </h3>
        <p className="text-[10px] text-slate-500 mt-1">{L("Mix Design Type", "نوع تصميم الخلطة")}: {specLabel}</p>
      </div>

      {/* Mix design composition */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <h4 className="font-semibold text-slate-900 mb-2 text-xs">{L("Mix Design Composition", "تركيب تصميم الخلطة")}</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {sizes.map((s, i) => (
            <span key={i} className="text-slate-800">
              <strong>{s.label}:</strong> {s.usedPct != null ? `${Number(s.usedPct).toFixed(2)}%` : "—"}
              {s.mixQty != null ? ` (${L("qty", "كمية")} ${Number(s.mixQty).toFixed(0)})` : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Blend worksheet */}
      <div>
        <h4 className="font-semibold mb-2 text-xs text-slate-900 border-b border-slate-200 pb-1">
          {L("Blend Worksheet", "ورقة حساب الخلطة")}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle">{L("Sieve (mm)", "المنخل (مم)")}</th>
                <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-slate-50">{L("Spec Limits", "حدود المواصفة")}</th>
                {sizes.map((s, i) => (
                  <th key={i} colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-blue-50">
                    {s.label}
                    <span className="block text-[9px] font-normal text-blue-700">{s.usedPct != null ? `${Number(s.usedPct).toFixed(1)}%` : "—"}</span>
                  </th>
                ))}
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle bg-yellow-100">{L("Blend %", "الخليط %")}</th>
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle">{L("Result", "النتيجة")}</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-1 py-1">{L("Lower", "أدنى")}</th>
                <th className="border border-slate-300 px-1 py-1">{L("Upper", "أعلى")}</th>
                {sizes.map((s, i) => (
                  <ReportFragment key={i}>
                    <th className="border border-slate-300 px-1 py-1 bg-yellow-50">{L("Orig.", "أصلي")}</th>
                    <th className="border border-slate-300 px-1 py-1 bg-emerald-50">{L("Req.", "مطلوب")}</th>
                  </ReportFragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, idx: number) => {
                const sieveMm = Number(r.sieveMm);
                const catalog = resolveAggBlendLimits(specLabel, sieveMm);
                const lower =
                  typeof r.lower === "number" && Number.isFinite(r.lower) ? r.lower : catalog.lower;
                const upper =
                  typeof r.upper === "number" && Number.isFinite(r.upper) ? r.upper : catalog.upper;
                const blendRaw = r.blend != null ? Number(r.blend) : null;
                const blend =
                  blendRaw != null && Number.isFinite(blendRaw) ? roundBlendPct(blendRaw) : null;
                const within =
                  r.withinLimits === true || r.withinLimits === false
                    ? r.withinLimits
                    : blend != null && Number.isFinite(lower) && Number.isFinite(upper)
                      ? blend >= (lower as number) - LIMIT_EPS && blend <= (upper as number) + LIMIT_EPS
                      : null;
                return (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/80"}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">
                      {r.sieveMm != null ? formatDisplaySieveMm(Number(r.sieveMm)) : String(r.sieve ?? "—")}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center bg-red-50 text-red-900">{formatSpecLimit(lower)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center bg-red-50 text-red-900">{formatSpecLimit(upper)}</td>
                    {sizes.map((s, i) => {
                      const og = r.origGrad?.[s.key];
                      const req = r.required?.[s.key];
                      return (
                        <ReportFragment key={i}>
                          <td className="border border-slate-300 px-2 py-1 text-center">{og != null ? fmt(og, 1) : "—"}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center bg-emerald-50/60">{req != null ? fmt(req, 2) : "—"}</td>
                        </ReportFragment>
                      );
                    })}
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold bg-emerald-50">{formatBlendPct(blend)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {within === true ? (
                        <span className="text-emerald-600 font-bold">{L("✓", "✓")}</span>
                      ) : within === false ? (
                        <span className="text-red-600 font-bold">{L("✗", "✗")}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-slate-500 mt-1">
          {L("Required = %ge Used × Original Grad ÷ 100.  Blend = Σ Required across sizes.", "المطلوب = النسبة المستخدمة × التدرج الأصلي ÷ 100. الخليط = مجموع المطلوب لكل المقاسات.")}
        </p>
      </div>

      {/* Accept / Reject banner */}
      <div
        className="p-3 border-2 rounded-lg"
        style={{ borderColor: passesSpec ? "#10b981" : "#ef4444", backgroundColor: passesSpec ? "#f0fdf4" : "#fef2f2" }}
      >
        <h4 className="text-sm font-bold" style={{ color: passesSpec ? "#10b981" : "#ef4444" }}>
          {passesSpec ? L("ACCEPTED / مقبول", "مقبول / ACCEPTED") : L("REJECTED / مرفوض", "مرفوض / REJECTED")}
        </h4>
        <p className="text-[10px] text-slate-700 mt-0.5">
          {passesSpec
            ? L("The aggregate blend meets all specification limits.", "الخلطة تطابق جميع حدود المواصفة.")
            : L("The aggregate blend is outside the specified limits at one or more sieves.", "الخلطة خارج الحدود المحددة في منخل واحد أو أكثر.")}
        </p>
      </div>

      {hasChart && (
        <div>
          <h4 className="font-semibold mb-2 text-xs text-slate-900">{L("Grading Curve", "منحنى التدرج")}</h4>
          <div className="border border-slate-300 rounded-md bg-white p-1" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="sieveLog"
                  scale="log"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v: number) => formatDisplaySieveMm(Number(v))}
                  label={{ value: isAr ? "مقاس المنخل (مم)" : "Sieve size (mm)", position: "insideBottom", offset: -14, style: { fontSize: 10 } }}
                />
                <YAxis width={40} domain={[0, 100]} tick={{ fontSize: 9 }} label={{ value: isAr ? "% المار" : "% Passing", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                <Tooltip formatter={(v: unknown) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—"; }} contentStyle={{ fontSize: 10 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
                <Line type="monotone" dataKey="blend" name={isAr ? "الخليط" : "Blend"} stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                <Line type="monotone" dataKey="upper" name={isAr ? "الحد الأعلى" : "Upper"} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls />
                <Line type="monotone" dataKey="lower" name={isAr ? "الحد الأدنى" : "Lower"} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function renderSieveAnalysis(fd: any, isAr: boolean, extras?: FormReportExtras) {
  if (fd?.testMode === "agg_blend") return renderAggBlendSieve(fd, isAr);
  if (_isSandBlendSieveFormData(fd)) {
    const stdKey = fd.standard === "BS_1199_A" || fd.blendStandard === "BS_1199_A" ? "BS_1199_A" : "ASTM_C144";
    const standardName =
      stdKey === "BS_1199_A"
        ? "BS 1199:76 Type A — Plaster Sand"
        : "ASTM C 144 — Masonry Sand (Type: Manufactured Sand)";
    const standardNameAr =
      stdKey === "BS_1199_A" ? "BS 1199:76 النوع أ — رمل لياسة" : "ASTM C 144 — رمل بناء (رمل مصنع)";
    const testMethod = "ASTM C136 — Sieve Analysis of Fine and Coarse Aggregates";
    const testMethodAr = "ASTM C136 — تحليل المناخل للركام الناعم والخشن";
    const sieveData = (fd.sieveData as Array<Record<string, unknown>>) ?? [];
    const passesSpec = fd.passesSpec === true;
    const source = typeof fd.source === "string" && fd.source.trim() !== "" ? fd.source.trim() : "";
    const testedByFromFd = typeof fd.testedBy === "string" && fd.testedBy.trim() !== "" ? fd.testedBy.trim() : "";
    const testedBy = testedByFromFd || (extras?.sieveReportTestedBy != null ? String(extras.sieveReportTestedBy) : "");
    const fdRec = fd as Record<string, unknown>;
    const wu = _parseReportBlendNum(fd.whiteUsedPct) ?? _reportBlendWhiteUsedPct(fdRec, sieveData[0] ?? {});
    const bu = _parseReportBlendNum(fd.blackUsedPct) ?? _reportBlendBlackUsedPct(fdRec, sieveData[0] ?? {});

    const L = (en: string, ars: string) => (isAr ? ars : en);

    return (
      <div className="space-y-6 text-[11px]">
        <div className="text-center border-b-2 border-slate-300 pb-4">
          <h2 className="text-lg font-bold text-slate-900">{L("Laboratory Test Report", "تقرير اختبار المختبر")}</h2>
          <h3 className="text-base font-semibold mt-2 text-slate-800">
            {L("Sieve Analysis - Sand Blend Design", "تحليل المنخل - تصميم خلط الرمال")}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            {L(standardName, standardNameAr)}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px]">
          <div>
            <p className="font-semibold text-slate-800 mb-1">
              {isAr ? "طريقة الاختبار / Test Method:" : "Test Method / طريقة الاختبار:"}
            </p>
            <p className="text-slate-700">{isAr ? testMethodAr : testMethod}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 mb-1">
              {isAr ? "المواصفات / Specification:" : "Specification / المواصفات:"}
            </p>
            <p className="text-slate-700">{isAr ? standardNameAr : standardName}</p>
          </div>
          {source ? (
            <div>
              <p className="font-semibold text-slate-800 mb-1">{isAr ? "المصدر / Source:" : "Source / المصدر:"}</p>
              <p className="text-slate-700">{source}</p>
            </div>
          ) : null}
          {testedBy ? (
            <div>
              <p className="font-semibold text-slate-800 mb-1">
                {isAr ? "تم الاختبار بواسطة / Tested By:" : "Tested By / تم الاختبار بواسطة:"}
              </p>
              <p className="text-slate-700">{testedBy}</p>
            </div>
          ) : null}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="font-semibold text-slate-900 mb-2 text-sm">
            {L("Material Blend Composition / تكوين خلط المواد", "تكوين خلط المواد / Material Blend Composition")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <p className="text-slate-800">
              <strong>{L("White Sand / الرمل الأبيض:", "الرمل الأبيض / White Sand:")}</strong>{" "}
              {wu != null ? `${wu.toFixed(0)}%` : "—"}
            </p>
            <p className="text-slate-800">
              <strong>{L("Black Sand / الرمل الأسود:", "الرمل الأسود / Black Sand:")}</strong>{" "}
              {bu != null ? `${bu.toFixed(0)}%` : "—"}
            </p>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
            <strong>{L("Blend Formula / صيغة الخلط:", "صيغة الخلط / Blend Formula:")}</strong>{" "}
            {L(
              "Final Blend % = (White Used% × White Pass% + Black Used% × Black Pass%) ÷ 100",
              "الخليط % = (مستخدم أبيض × مار أبيض + مستخدم أسود × مار أسود) ÷ 100",
            )}
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm text-slate-900 border-b border-slate-200 pb-1">
            {L("Sieve Analysis Results / نتائج تحليل المنخل", "نتائج تحليل المنخل / Sieve Analysis Results")}
          </h3>
          <table className="metadata-table w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-center align-middle font-semibold text-[10px]">
                  {L("Sieve Size (mm)", "مقاس المنخل (مم)")}
                  <br />
                  <span className={REPORT_BILINGUAL_SUB_CLASS}>{L("مقاس المنخل", "Sieve Size")}</span>
                </th>
                <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-slate-50 font-semibold text-[10px]">
                  {L("Specification Limits (%)", "حدود المواصفات (%)")}
                  <br />
                  <span className={REPORT_BILINGUAL_SUB_CLASS}>{L("حدود المواصفات", "Spec limits")}</span>
                </th>
                <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-blue-50 font-semibold text-[10px]">
                  {L("White Sand", "الرمل الأبيض")}
                </th>
                <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-gray-100 font-semibold text-[10px]">
                  {L("Black Sand", "الرمل الأسود")}
                </th>
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-yellow-50 align-middle font-semibold text-[10px]">
                  {L("Final Blend (%)", "الخلطة النهائية (%)")}
                </th>
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-center align-middle font-semibold text-[10px]">
                  {L("Result", "النتيجة")}
                </th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-1 py-1 text-center">{L("Lower", "الأدنى")}</th>
                <th className="border border-slate-300 px-1 py-1 text-center">{L("Upper", "الأعلى")}</th>
                <th className="border border-slate-300 px-1 py-1 text-center bg-blue-50/80">{L("Pass %", "المار %")}</th>
                <th className="border border-slate-300 px-1 py-1 text-center bg-blue-50/80">{L("Used %", "المستخدم %")}</th>
                <th className="border border-slate-300 px-1 py-1 text-center bg-gray-50">{L("Pass %", "المار %")}</th>
                <th className="border border-slate-300 px-1 py-1 text-center bg-gray-50">{L("Used %", "المستخدم %")}</th>
              </tr>
            </thead>
            <tbody>
              {sieveData.map((row, idx) => {
                const rec = row;
                const blend =
                  _parseReportBlendNum(rec.finalBlend) ??
                  calculateFinalBlend(
                    wu,
                    _reportBlendWhitePassPct(rec),
                    bu,
                    _reportBlendBlackPassPct(rec),
                  );
                const lo = _parseReportBlendNum(rec.lowerLimit);
                const hi = _parseReportBlendNum(rec.upperLimit);
                const wp = _reportBlendWhitePassPct(rec);
                const bp = _reportBlendBlackPassPct(rec);
                const savedPasses = rec.passes;
                const passes =
                  typeof savedPasses === "boolean"
                    ? savedPasses
                    : blend !== null && lo !== null && hi !== null && blend >= lo && blend <= hi;

                const mm = _parseReportBlendNum(rec.sieveMm);
                return (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/80"}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">
                      {mm != null ? formatDisplaySieveMm(mm) : String(rec.sieveMm ?? "—")}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {rec.lowerLimit != null && rec.lowerLimit !== "" ? String(rec.lowerLimit) : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {rec.upperLimit != null && rec.upperLimit !== "" ? String(rec.upperLimit) : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{wp != null ? wp.toFixed(1) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center bg-blue-50">{wu != null ? wu.toFixed(0) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{bp != null ? bp.toFixed(1) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center bg-gray-50">{bu != null ? bu.toFixed(0) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold bg-yellow-50">
                      {blend != null ? blend.toFixed(1) : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {blend != null ? (
                        passes ? (
                          <span className="text-emerald-600 font-bold">{L("✓ PASS", "✓ مطابق")}</span>
                        ) : (
                          <span className="text-red-600 font-bold">{L("✗ FAIL", "✗ غير مطابق")}</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="mt-4 p-3 border-2 rounded-lg"
          style={{
            borderColor: passesSpec ? "#10b981" : "#ef4444",
            backgroundColor: passesSpec ? "#f0fdf4" : "#fef2f2",
          }}
        >
          <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
            <div className="shrink-0">
              {passesSpec ? (
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">✓</span>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">✗</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold mb-1" style={{ color: passesSpec ? "#10b981" : "#ef4444" }}>
                {passesSpec ? L("ACCEPTED / مقبول", "مقبول / ACCEPTED") : L("REJECTED / مرفوض", "مرفوض / REJECTED")}
              </h3>
              <p className="text-xs leading-tight text-slate-800">
                {passesSpec
                  ? L(
                      "The sand blend meets all specification requirements.",
                      "خليط الرمل يلبي جميع متطلبات المواصفات.",
                    )
                  : L(
                      "The sand blend fails to meet specification requirements. One or more sieve sizes are outside the specified limits.",
                      "خليط الرمل لا يلبي متطلبات المواصفات. واحد أو أكثر من أحجام المناخل خارج الحدود المحددة.",
                    )}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold mb-2 text-base text-slate-900">
            {L("Grading Curve / منحنى التدرج", "منحنى التدرج / Grading Curve")}
          </h3>
          <SieveBlendReportGradingChart sieveData={sieveData} wu={wu} bu={bu} isAr={isAr} />
        </div>

        <div className="mt-4 text-center text-[9px] text-slate-500 border-t border-slate-200 pt-3">
          <p>
            {L(
              "This report may not be reproduced except in full, without written approval of the laboratory.",
              "لا يجوز إعادة إنتاج هذا التقرير إلا بالكامل، دون موافقة خطية من المختبر.",
            )}
          </p>
          <p className="text-[9px] text-slate-400 mt-2">
            {L(
              "Official signatures appear in the section below.",
              "التوقيعات الرسمية تظهر في القسم أدناه.",
            )}
          </p>
        </div>
      </div>
    );
  }

  // Support both legacy 'sieves' and new 'rows' field names
  const rows = fd.rows ?? fd.sieves ?? [];
  const gradingType = fd.gradingType ?? "";
  const mortarSubtypeLabel =
    fd.mortarSandSubtype === "PLASTER_SAND"
      ? (isAr ? "رمل لياسة — BS 1199" : "Plaster Sand — BS 1199")
      : fd.mortarSandSubtype === "MASONRY_SAND"
        ? (isAr ? "رمل بناء — ASTM C144" : "Masonry Sand — ASTM C144")
        : null;
  const sieveStandard = fd.sieveStandard === "ASTM" || fd.sieveStandard === "BS" ? fd.sieveStandard : null;
  const gradingLabels: Record<string, string> = {
    COARSE_40: isAr ? "ركام خشن 40مم" : "Coarse Aggregate 40mm",
    COARSE_20: isAr ? "ركام خشن 20مم" : "Coarse Aggregate 20mm",
    FINE_SAND: isAr ? "ركام ناعم (رمل)" : "Fine Aggregate (Sand)",
    MORTAR_SAND: isAr ? "رمل ملاط (ASTM C144)" : "Mortar Sand (ASTM C144)",
    PLASTER_SAND: isAr ? "رمل جص (BS 1199)" : "Plaster Sand (BS 1199)",
    MASONRY_SAND: isAr ? "رمل بناء (ASTM C144)" : "Masonry Sand (ASTM C144)",
    ASTM_COARSE_NO57: isAr ? "ركام خشن ASTM (تدرج 57)" : "ASTM Coarse (No. 57–style)",
    ASTM_FINE_CONCRETE: isAr ? "رمل ناعم خرسانة ASTM C33" : "ASTM Fine (concrete sand, C33)",
  };
  const gradingLabel = gradingLabels[gradingType] ?? gradingType;
  const headers = isAr
    ? ["فتحة المنخل (مم)", "الكتلة المحتجزة (غ)", "% محتجز", "% محتجز تراكمي", "% مار", "حد أدنى", "حد أعلى", "نتيجة"]
    : ["Sieve (mm)", "Retained (g)", "% Ret.", "Cum. % Ret.", "% Passing", "Lower", "Upper", "Result"];
  return (
    <div className="space-y-3">
      {gradingLabel && (
        <div className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 space-y-0.5">
          {sieveStandard && (
            <div className="text-[11px] font-normal text-blue-800/90">
              {isAr ? "المواصفة:" : "Standard:"}{" "}
              {sieveStandard === "ASTM" ? "ASTM C33 / C136" : "BS 882 / BS EN 12620"}
            </div>
          )}
          <div>
            {isAr ? "نوع التدرج:" : "Grading Type:"} {gradingLabel}
          </div>
          {mortarSubtypeLabel && (
            <div className="text-[11px] font-normal text-blue-800/90">
              {isAr ? "رمل الملاط:" : "Mortar sand standard:"} {mortarSubtypeLabel}
            </div>
          )}
        </div>
      )}
      <FlexibleResultsTable
        columns={[
          { header: headers[0], field: "sieve", align: "center", render: (_, row) => <span className="font-semibold">{String((row as any).sieve ?? (row as any).size ?? "")}</span> },
          { header: headers[1], field: "massRetained", align: "right", render: (_, row) => String((row as any).massRetained ?? fmt((row as any).retained)) },
          { header: headers[2], field: "pctRetained", align: "right", render: (_, row) => {
            const s = row as any;
            return s.pctRetained !== undefined ? s.pctRetained.toFixed(1) : fmt(s.percentRetained);
          }},
          { header: headers[3], field: "cumRetained", align: "right", render: (_, row) => {
            const s = row as any;
            return s.cumRetained !== undefined ? s.cumRetained.toFixed(1) : fmt(s.cumRetained);
          }},
          { header: headers[4], field: "cumPassing", align: "right", render: (_, row) => {
            const s = row as any;
            const v = s.cumPassing !== undefined ? s.cumPassing.toFixed(1) : fmt(s.percentPassing);
            return <span className="font-semibold">{v}</span>;
          }},
          { header: headers[5], field: "lower", align: "center", render: (_, row) => <span className="text-blue-800">{String((row as any).lower ?? (row as any).lowerLimit ?? "—")}</span> },
          { header: headers[6], field: "upper", align: "center", render: (_, row) => <span className="text-blue-800">{String((row as any).upper ?? (row as any).upperLimit ?? "—")}</span> },
          {
            header: headers[7],
            field: "withinLimits",
            align: "center",
            render: (_, row) => {
              const s = row as any;
              if (s.withinLimits === true) return <span className="text-emerald-800 font-bold">✓</span>;
              if (s.withinLimits === false) return <span className="text-red-800 font-bold">✗</span>;
              return <span className="text-gray-500">—</span>;
            },
          },
        ]}
        rows={rows}
      />
      <div>
        <p className="text-xs font-semibold text-slate-700 mb-1">
          {isAr ? "منحنى التدرج (النسبة المارة مقابل مقاس المنخل)" : "Grading Curve (% Passing vs. Sieve Size)"}
        </p>
        <SieveWeightReportGradingChart rows={rows} isAr={isAr} />
      </div>
      {fd.finesModulus !== undefined && (
        <div className="text-xs bg-blue-50 border border-blue-100 rounded px-3 py-1.5">
          <span className="font-semibold text-blue-700">{isAr ? "معامل النعومة (FM):" : "Fineness Modulus (FM):"}</span>
          <span className="font-mono font-bold text-blue-900 mx-2">{parseFloat(fd.finesModulus).toFixed(2)}</span>
          <span className="text-gray-500">{isAr ? "(مقبول: 2.3 – 3.1)" : "(acceptable: 2.3 – 3.1)"}</span>
        </div>
      )}
    </div>
  );
}

/** Compaction curve (dry density vs. water content) for the Proctor PDF / print. */
function ProctorReportCompactionChart({
  points,
  mdd,
  omc,
  isAr,
}: {
  points: Array<Record<string, unknown>>;
  mdd: number | null;
  omc: number | null;
  isAr: boolean;
}) {
  const chartData = points
    .map(p => ({ wc: Number(p.waterContent), dd: Number(p.dryDensity) }))
    .filter(p => Number.isFinite(p.wc) && Number.isFinite(p.dd))
    .sort((a, b) => a.wc - b.wc);

  if (chartData.length < 2) return null;

  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1 print:p-0" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 26, right: 24, left: 4, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="wc"
            domain={["auto", "auto"]}
            tick={{ fontSize: 9 }}
            label={{
              value: isAr ? "نسبة الرطوبة (%)" : "Water Content (%)",
              position: "insideBottom",
              offset: -16,
              style: { fontSize: 10 },
            }}
          />
          <YAxis
            dataKey="dd"
            type="number"
            domain={["auto", "auto"]}
            width={46}
            tick={{ fontSize: 9 }}
            tickFormatter={(v: number) => v.toFixed(2)}
            label={{
              value: isAr ? "الكثافة الجافة (Mg/m³)" : "Dry Density (Mg/m³)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10 },
            }}
          />
          <Tooltip formatter={(value: unknown) => {
            const n = typeof value === "number" ? value : Number(value);
            return Number.isFinite(n) ? n.toFixed(3) : "—";
          }} contentStyle={{ fontSize: 10 }} />
          {mdd != null && Number.isFinite(mdd) && (
            <ReferenceLine
              y={mdd}
              stroke="#059669"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: `MDD = ${mdd.toFixed(2)} Mg/m³`, position: "insideTopRight", fontSize: 10, fontWeight: 700, fill: "#047857" }}
            />
          )}
          {omc != null && Number.isFinite(omc) && (
            <ReferenceLine
              x={omc}
              stroke="#059669"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: `OMC = ${omc}%`, position: "top", fontSize: 10, fontWeight: 700, fill: "#047857" }}
            />
          )}
          <Line type="monotone" dataKey="dd" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: "#2563eb" }} name={isAr ? "الكثافة الجافة" : "Dry Density"} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderSoilProctor(fd: any, isAr: boolean) {
  const points = fd.points ?? [];
  const savedMdd = fd.mdd != null && fd.mdd !== "" ? Number(fd.mdd) : null;
  const savedOmc = fd.omc != null && fd.omc !== "" ? Number(fd.omc) : null;
  const displayMdd = peakProctorMdd(points, savedMdd) ?? savedMdd;
  const displayOmc = peakProctorOmc(points, savedOmc) ?? savedOmc;
  const headers = isAr
    ? ["النقطة", "قالب+تربة (غ)", "القالب (غ)", "التربة (غ)", "الكثافة الرطبة (Mg/m³)", "نسبة الرطوبة (%)", "الكثافة الجافة (Mg/m³)"]
    : ["Point", "Mould+Soil (g)", "Mould (g)", "Soil (g)", "Wet Density (Mg/m³)", "Water Content (%)", "Dry Density (Mg/m³)"];
  const proctorCols: Column[] = [
    { header: headers[0], field: "_pt", align: "center", render: (_v, row) => String((row as any)._pt) },
    { header: headers[1], field: "mouldSoil", type: "number", decimals: 1, align: "right" },
    { header: headers[2], field: "mouldWeight", type: "number", decimals: 1, align: "right" },
    { header: headers[3], field: "soilWeight", type: "number", decimals: 1, align: "right" },
    { header: headers[4], field: "wetDensity", type: "number", decimals: 3, align: "right" },
    { header: headers[5], field: "waterContent", type: "number", decimals: 1, align: "right" },
    { header: headers[6], field: "dryDensity", type: "number", decimals: 3, align: "right", render: (v) => <span className="font-semibold">{fmt(v, 3)}</span> },
  ];
  const prepMethodLabel = (m: string) => m === "air_dried" ? "Air Dried"
    : m === "as_received" ? "As Received (Natural Moisture)"
    : m === "oven_dried" ? "Oven Dried"
    : m;
  return (
    <>
      {/* Test Conditions — BS/ASTM required fields */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs mb-3 report-info-grid">
        {fd.moldType && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "نوع القالب" : "Mould Type"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{String(fd.moldType).replace(/_/g, " ")}</p>
          </div>
        )}
        {(fd.mouldVolume ?? fd.moldVolume) != null && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "حجم القالب" : "Mould Volume"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fmt(fd.mouldVolume ?? fd.moldVolume)} cm³</p>
          </div>
        )}
        {fd.rammerMass != null && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "كتلة المطرقة" : "Rammer Mass"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.rammerMass} kg</p>
          </div>
        )}
        {fd.dropHeight != null && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "ارتفاع السقوط" : "Drop Height"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.dropHeight} mm</p>
          </div>
        )}
        {fd.numberOfLayers != null && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "عدد الطبقات" : "No. of Layers"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.numberOfLayers}</p>
          </div>
        )}
        {fd.blowsPerLayer != null && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "ضربات / طبقة" : "Blows / Layer"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.blowsPerLayer}</p>
          </div>
        )}
        {fd.samplePreparation && (
          <div className="bg-slate-50 border rounded p-2 text-center md:col-span-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{isAr ? "تحضير العينة" : "Sample Preparation"}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{prepMethodLabel(fd.samplePreparation)}</p>
          </div>
        )}
      </div>
      <FlexibleResultsTable columns={proctorCols} rows={points.map((p: any, i: number) => ({ ...p, _pt: i + 1 }))} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "أقصى كثافة جافة (MDD)" : "Max Dry Density (MDD)"}</p>
          <p className="text-xl font-bold text-blue-800">{fmt(displayMdd, 2)} {isAr ? "Mg/m³" : "Mg/m³"}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
          <p className="text-green-600 font-semibold">{isAr ? "نسبة الرطوبة المثلى (OMC)" : "Optimum Moisture Content (OMC)"}</p>
          <p className="text-xl font-bold text-green-800">{fmt(displayOmc)} %</p>
        </div>
        {fd.correctedMDD != null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-center">
            <p className="text-emerald-600 font-semibold">{isAr ? "MDD المصححة" : "Corrected MDD"}</p>
            <p className="text-xl font-bold text-emerald-800">{fmt(fd.correctedMDD, 3)} Mg/m³</p>
          </div>
        )}
        {fd.correctedOMC != null && (
          <div className="bg-sky-50 border border-sky-200 rounded p-3 text-center">
            <p className="text-sky-600 font-semibold">{isAr ? "OMC المصححة" : "Corrected OMC"}</p>
            <p className="text-xl font-bold text-sky-800">{fmt(fd.correctedOMC, 1)} %</p>
          </div>
        )}
        {fd.cbrStandard && (
          <div className="bg-indigo-50 border border-indigo-200 rounded p-3 text-center">
            <p className="text-indigo-600 font-semibold">{isAr ? "معيار CBR المرتبط" : "Linked CBR Standard"}</p>
            <p className="text-lg font-bold text-indigo-800">{String(fd.cbrStandard)}</p>
          </div>
        )}
      </div>
      <div className="mt-1">
        <p className="text-xs font-semibold text-slate-700 mb-1">
          {isAr ? "منحنى الدمك (الكثافة الجافة مقابل نسبة الرطوبة)" : "Compaction Curve (Dry Density vs. Water Content)"}
        </p>
        <ProctorReportCompactionChart
          points={points}
          mdd={displayMdd}
          omc={displayOmc}
          isAr={isAr}
        />
      </div>
    </>
  );
}

function renderSoilFieldDensity(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const points = Array.isArray(fd.testPoints) ? fd.testPoints : [];
  const required = fd.requiredCompaction ?? 95;
  const passed = points.filter((p: any) => p.result === "pass").length;
  const failed = points.filter((p: any) => p.result === "fail").length;
  const total = points.length;

  const cols: Column[] = [
    { header: L("Point", "النقطة"), field: "pointNumber", align: "center", render: (_v, row) => <span className="font-semibold">{String((row as any).pointNumber ?? "")}</span> },
    { header: L("Location", "الموقع"), field: "location", align: "center", render: (_v, row) => String((row as any).location || "—") },
    { header: L("Depth (m)", "العمق (م)"), field: "depth", align: "center", render: v => fmt(v, 2) },
    { header: L("In-situ Wet Density of Soil (Mg/m³)", "الكثافة الرطبة الموقعية للتربة (Mg/m³)"), field: "bulkDensity", align: "right", render: v => fmtHalfUp(v, 2) },
    { header: L("Moisture %", "الرطوبة %"), field: "moistureContent", align: "right", render: v => (v != null ? `${fmtHalfUp(v, 1)}%` : "—") },
    { header: L("Dry Density (Mg/m³)", "الكثافة الجافة (Mg/m³)"), field: "dryDensity", align: "right", render: v => <span className="font-semibold">{fmtHalfUp(v, 2)}</span> },
    { header: L("Degree of Compaction", "درجة الدمك"), field: "compaction", align: "center", render: v => (v != null && v !== "" ? <span className="font-bold">{Math.round(Number(v))}%</span> : "—") },
    {
      header: L("Result", "النتيجة"),
      field: "result",
      align: "center",
      render: v =>
        v === "pass" ? (
          <span className="text-emerald-700 font-bold">{L("PASS", "ناجح")} ✓</span>
        ) : v === "fail" ? (
          <span className="text-red-700 font-bold">{L("FAIL", "راسب")} ✗</span>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
  ];

  const methodLabel = (m: string) => m === "SAND_REPLACEMENT" ? "Sand Replacement (BS 1377-9)"
    : m === "NUCLEAR" ? "Nuclear Gauge"
    : m === "CORE_CUTTER" ? "Core Cutter"
    : String(m);
  return (
    <>
      {/* Test conditions info band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 report-info-grid">
        {fd.testMethod && (
          <div className="bg-slate-50 border rounded p-2 text-center md:col-span-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{L("Test Method", "طريقة الاختبار")}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{methodLabel(fd.testMethod)}</p>
          </div>
        )}
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{L("MDD (Mg/m³)", "أقصى كثافة جافة")}</p>
          <p className="font-bold text-blue-800 text-base">{fmtHalfUp(fd.mdd, 2)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-700 font-semibold">{L("Required Compaction", "الدمك المطلوب")}</p>
          <p className="font-bold text-amber-800 text-base">≥ {required}%</p>
        </div>
        {fd.mddReference && (
          <div className="bg-slate-50 border rounded p-2 text-center md:col-span-2">
            <p className={REPORT_INFO_LABEL_CLASS}>{L("MDD Source — Lab Test Ref.", "مرجع اختبار MDD")}</p>
            <p className={REPORT_INFO_VALUE_CLASS}>{fd.mddReference}</p>
          </div>
        )}
        <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
          <p className="text-emerald-700 font-semibold">{L("Points Passed", "نقاط ناجحة")}</p>
          <p className="font-bold text-emerald-800 text-base">{passed} / {total}</p>
        </div>
        <div className={`border rounded p-2 text-center ${failed > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
          <p className={`font-semibold ${failed > 0 ? "text-red-700" : "text-gray-600"}`}>{L("Points Failed", "نقاط راسبة")}</p>
          <p className={`font-bold text-base ${failed > 0 ? "text-red-800" : "text-gray-800"}`}>{failed}</p>
        </div>
      </div>
      <FlexibleResultsTable columns={cols} rows={points} />
      <p className="text-[10px] text-slate-500 mt-1">
        {L(
          `Degree of Compaction is rounded to the nearest whole %. Pass = ≥ ${required}%.`,
          `درجة الدمك تُقرّب لأقرب رقم صحيح. النجاح = ≥ ${required}%.`,
        )}
      </p>
    </>
  );
}

function CBRReportLoadChart({
  data,
  isAr,
}: {
  data: Array<{ depth: number; top: number | null; bottom: number | null }>;
  isAr: boolean;
}) {
  if (data.length < 2) return null;
  const kTop = isAr ? "العلوي" : "Top / العلوي";
  const kBot = isAr ? "السفلي" : "Bottom / السفلي";
  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1 print:p-0" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="depth"
            domain={["auto", "auto"]}
            tick={{ fontSize: 9 }}
            label={{
              value: isAr ? "الاختراق (مم)" : "Penetration (mm) / الاختراق",
              position: "insideBottom",
              offset: -16,
              style: { fontSize: 10 },
            }}
          />
          <YAxis
            width={42}
            tick={{ fontSize: 9 }}
            label={{
              value: isAr ? "الحمل (kN)" : "Load (kN) / الحمل",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10 },
            }}
          />
          <Tooltip
            formatter={(value: unknown) => {
              const n = typeof value === "number" ? value : Number(value);
              return Number.isFinite(n) ? `${n.toFixed(2)} kN` : "—";
            }}
            contentStyle={{ fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
          <ReferenceLine x={2.5} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "2.5mm", position: "top", fontSize: 8, fill: "#3b82f6" }} />
          <ReferenceLine x={5.0} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: "5.0mm", position: "top", fontSize: 8, fill: "#8b5cf6" }} />
          <Line type="monotone" dataKey="top" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} name={kTop} connectNulls />
          <Line type="monotone" dataKey="bottom" stroke="#e11d48" strokeWidth={2} dot={{ r: 2 }} name={kBot} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CBRReportAstmStressChart({
  data,
  isAr,
}: {
  data: Array<{ depth: number; s10?: number | null; s30?: number | null; s65?: number | null }>;
  isAr: boolean;
}) {
  if (data.length < 2) return null;
  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" dataKey="depth" tick={{ fontSize: 9 }} label={{ value: isAr ? "الاختراق (in)" : "Penetration (in)", position: "insideBottom", offset: -16, style: { fontSize: 10 } }} />
          <YAxis width={42} tick={{ fontSize: 9 }} label={{ value: isAr ? "الإجهاد (psi)" : "Stress (psi)", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
          <Tooltip contentStyle={{ fontSize: 10 }} />
          <Legend wrapperStyle={{ fontSize: 9 }} iconSize={8} />
          <ReferenceLine x={0.1} stroke="#3b82f6" strokeDasharray="4 4" />
          <ReferenceLine x={0.2} stroke="#8b5cf6" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="s10" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} name="10" connectNulls />
          <Line type="monotone" dataKey="s30" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} name="30" connectNulls />
          <Line type="monotone" dataKey="s65" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} name="65" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CBRReportAstmCbrDensityChart({
  data,
  mddPcf,
  designTargets,
  isAr,
}: {
  data: Array<{ dryDensityPcf: number; cbr02: number }>;
  mddPcf?: number | null;
  designTargets?: {
    targetPcf95: number;
    targetPcf98: number;
    targetPcf100: number;
    cbr95?: number | null;
    cbr98?: number | null;
    cbr100?: number | null;
  } | null;
  isAr: boolean;
}) {
  if (data.length < 1) return null;
  const pcf95 = designTargets?.targetPcf95 ?? (mddPcf != null ? mddPcf * 0.95 : null);
  const pcf98 = designTargets?.targetPcf98 ?? (mddPcf != null ? mddPcf * 0.98 : null);
  const pcf100 = designTargets?.targetPcf100 ?? mddPcf;
  const markers = [
    { pct: "95%", dryDensityPcf: pcf95, cbr02: designTargets?.cbr95, color: "#3b82f6" },
    { pct: "98%", dryDensityPcf: pcf98, cbr02: designTargets?.cbr98, color: "#10b981" },
    { pct: "100%", dryDensityPcf: pcf100, cbr02: designTargets?.cbr100, color: "#8b5cf6" },
  ].filter(m => (m.dryDensityPcf ?? 0) > 0 && m.cbr02 != null);
  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 16, left: 0, bottom: 26 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="dryDensityPcf"
            domain={["auto", "auto"]}
            tick={{ fontSize: 9 }}
            label={{ value: isAr ? "الكثافة الجافة (lbf/ft³)" : "Dry Density (lbf/ft³)", position: "insideBottom", offset: -16, style: { fontSize: 10 } }}
          />
          <YAxis
            type="number"
            dataKey="cbr02"
            width={42}
            domain={["auto", "auto"]}
            tick={{ fontSize: 9 }}
            label={{ value: isAr ? "CBR @ 0.2\"" : "CBR @ 0.2\"", angle: -90, position: "insideLeft", style: { fontSize: 10 } }}
          />
          <Tooltip contentStyle={{ fontSize: 10 }} />
          <Scatter data={data} fill="#059669" line={{ stroke: "#059669", strokeWidth: 2 }} />
          {pcf95 != null && pcf95 > 0 && designTargets?.cbr95 != null && (
            <>
              <ReferenceLine x={pcf95} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "95%", position: "top", fontSize: 8, fill: "#3b82f6", fontWeight: 700 }} />
              <ReferenceLine y={designTargets.cbr95} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" />
            </>
          )}
          {pcf98 != null && pcf98 > 0 && designTargets?.cbr98 != null && (
            <>
              <ReferenceLine x={pcf98} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "98%", position: "top", fontSize: 8, fill: "#10b981", fontWeight: 700 }} />
              <ReferenceLine y={designTargets.cbr98} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" />
            </>
          )}
          {pcf100 != null && pcf100 > 0 && designTargets?.cbr100 != null && (
            <>
              <ReferenceLine x={pcf100} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "100%", position: "top", fontSize: 8, fill: "#8b5cf6", fontWeight: 700 }} />
              <ReferenceLine y={designTargets.cbr100} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 4" />
            </>
          )}
          {markers.map(m => (
            <Scatter
              key={m.pct}
              data={[{ dryDensityPcf: m.dryDensityPcf, cbr02: m.cbr02 }]}
              fill={m.color}
              shape={(props: { cx?: number; cy?: number }) => {
                const { cx = 0, cy = 0 } = props;
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={6} fill={m.color} stroke="#fff" strokeWidth={1.5} />
                    <circle cx={cx} cy={cy} r={2} fill="#fff" />
                  </g>
                );
              }}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderSoilCBR(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);

  if (fd.standard === "ASTM_D1883" && Array.isArray(fd.astmSpecimens)) {
    const rawSpecimens: any[] = fd.astmSpecimens;
    const specimens = computeAllAstmSpecimens(
      rawSpecimens.map((s, i) => hydrateAstmSpecimenInput(s, i)),
      Number(fd.surchargeLbf) || 10,
    );
    const stressData = specimens.length > 0
      ? (() => {
          const depths = [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35];
          return depths.map((depth, i) => {
            const row: { depth: number; s10?: number | null; s30?: number | null; s65?: number | null } = { depth };
            for (const sp of specimens) {
              const stress = sp.stresses?.[i];
              if (sp.blowsPerLayer === 10) row.s10 = stress ?? null;
              if (sp.blowsPerLayer === 30) row.s30 = stress ?? null;
              if (sp.blowsPerLayer === 65) row.s65 = stress ?? null;
            }
            return row;
          }).filter(r => (r.s10 ?? 0) > 0 || (r.s30 ?? 0) > 0 || (r.s65 ?? 0) > 0);
        })()
      : [];
    const cbrDensityData = buildCbrDensityChartData(specimens as any);
    const mddMg = fd.mdd != null ? Number(fd.mdd) : 0;
    const designCbr = mddMg > 0 ? computeCbrAtMddPercentages(specimens as any, mddMg) : null;

    const specCols: Column[] = [
      { header: L("Blows/Layer", "ضربات/طبقة"), field: "blowsPerLayer", align: "center" },
      { header: L("Dry Density (lbf/ft³)", "كثافة جافة (lbf/ft³)"), field: "dryDensityPcf", align: "center", render: v => fmt(v, 0) },
      { header: L("MC %", "رطوبة %"), field: "moistureContent", align: "center", render: v => fmt(v, 1) },
      { header: L("MC after soak %", "رطوبة بعد النقع %"), field: "moistureAfterSoak", align: "center", render: v => v != null && v !== "" ? fmt(v, 1) : "—" },
      { header: L("Raw CBR 0.1\"", "CBR خام 0.1\""), field: "cbr01", align: "center", render: v => fmt(v, 0) },
      { header: L("Raw CBR 0.2\"", "CBR خام 0.2\""), field: "cbr02", align: "center", render: v => fmt(v, 0) },
      {
        header: L("Corr. CBR 0.1\"", "CBR مصحح 0.1\""),
        field: "adoptedCbr01",
        align: "center",
        render: (v, row) => {
          const r = row as any;
          const corrected = r.needsCorrection01 || (r.cbr01 != null && v != null && Number(v) !== Number(r.cbr01));
          return <span className={corrected ? "font-bold text-purple-800" : ""}>{fmt(v, 0)}</span>;
        },
      },
      {
        header: L("Corr. CBR 0.2\"", "CBR مصحح 0.2\""),
        field: "adoptedCbr02",
        align: "center",
        render: (v, row) => {
          const r = row as any;
          const corrected = r.needsCorrection02 || (r.cbr02 != null && v != null && Number(v) !== Number(r.cbr02));
          return <span className={corrected ? "font-bold text-purple-800" : ""}>{fmt(v, 0)}</span>;
        },
      },
      { header: L("Adopted CBR", "CBR المعتمد"), field: "adoptedCbr", align: "center", render: v => fmt(v, 0) },
    ];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="border rounded p-2"><div className="text-slate-500">{L("MDD", "MDD")}</div><div className="font-bold">{fmt(fd.mdd, 3)} Mg/m³{designCbr ? ` (${fmt(designCbr.mddPcf, 0)} pcf)` : fd.mddPcf != null ? ` (${fmt(fd.mddPcf, 0)} pcf)` : ""}</div></div>
          <div className="border rounded p-2"><div className="text-slate-500">OMC</div><div className="font-bold">{fmt(fd.omc, 1)}%</div></div>
          <div className="border rounded p-2"><div className="text-slate-500">{L("Compaction", "الدمك")}</div><div className="font-bold">{fd.compactionMethod ?? "ASTM D1557"}</div></div>
          <div className="border rounded p-2"><div className="text-slate-500">{L("Condition", "الحالة")}</div><div className="font-bold">{fd.sampleCondition ?? "Soaked"}</div></div>
        </div>
        <FlexibleResultsTable columns={specCols} rows={specimens} />
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
            <p className="text-blue-600 font-semibold">{L("CBR @ 95% MDD", "CBR @ 95% MDD")}</p>
            <p className="text-xl font-bold text-blue-800">{fmt(designCbr?.cbr95 ?? fd.cbrAt95Mdd, 0)}</p>
            {designCbr && <p className="text-[9px] text-slate-500 mt-0.5">{designCbr.targetPcf95.toFixed(1)} pcf</p>}
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-center">
            <p className="text-emerald-600 font-semibold">{L("CBR @ 98% MDD", "CBR @ 98% MDD")}</p>
            <p className="text-xl font-bold text-emerald-800">{fmt(designCbr?.cbr98 ?? fd.cbrAt98Mdd, 0)}</p>
            {designCbr && <p className="text-[9px] text-slate-500 mt-0.5">{designCbr.targetPcf98.toFixed(1)} pcf</p>}
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded p-3 text-center">
            <p className="text-purple-600 font-semibold">{L("CBR @ 100% MDD", "CBR @ 100% MDD")}</p>
            <p className="text-xl font-bold text-purple-800">{fmt(designCbr?.cbr100 ?? fd.cbrAt100Mdd, 0)}</p>
            {designCbr && <p className="text-[9px] text-slate-500 mt-0.5">{designCbr.targetPcf100.toFixed(1)} pcf</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">{L("Stress vs. Penetration", "الإجهاد مقابل الاختراق")}</p>
            <CBRReportAstmStressChart data={stressData} isAr={isAr} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1">{L("Corrected CBR @ 0.2\" vs. Dry Density", "CBR @ 0.2\" مقابل الكثافة الجافة")}</p>
            <CBRReportAstmCbrDensityChart data={cbrDensityData} mddPcf={designCbr?.mddPcf ?? fd.mddPcf} designTargets={designCbr} isAr={isAr} />
          </div>
        </div>
      </div>
    );
  }

  const faces: any[] = Array.isArray(fd.faces) ? fd.faces : [];
  const topFace = faces.find(f => f.faceLabel === "Top") ?? faces[0];
  const bottomFace = faces.find(f => f.faceLabel === "Bottom") ?? faces[1];
  const finalCBR = fd.finalCBR;
  const cbrMin = fd.cbrMin;
  const overall = fd.overallResult ?? (finalCBR != null && cbrMin != null ? (Number(finalCBR) >= Number(cbrMin) ? "pass" : "fail") : "pending");
  // Average is only reported when the two faces agree within 10 (else repeat the test).
  const topCbrVal = topFace?.cbrValue;
  const botCbrVal = bottomFace?.cbrValue;
  const bothFacesR = topCbrVal != null && botCbrVal != null;
  const cbrDiffR = fd.cbrDiff != null ? Number(fd.cbrDiff) : (bothFacesR ? Math.abs(Number(topCbrVal) - Number(botCbrVal)) : null);
  const avgApplicableR = fd.avgApplicable != null
    ? !!fd.avgApplicable
    : (bothFacesR ? (cbrDiffR as number) <= 10 : finalCBR != null);
  const retained20 = fd.retained20mm;
  const passing19 = fd.passing19_5;
  const idd = fd.initialDensity ?? {};
  const layerLabel = fd.summaryValues?.layerType ?? fd.layerType;
  const dryDensityPct = fd.dryDensityPct ?? idd.dryDensityPct ?? fd.summaryValues?.dryDensityPct;
  const mddVal = fd.mdd ?? idd.mdd;
  const topPass = topCbrVal != null && cbrMin != null ? Number(topCbrVal) >= Number(cbrMin) : null;
  const botPass = botCbrVal != null && cbrMin != null ? Number(botCbrVal) >= Number(cbrMin) : null;

  // Reconstruct penetration depths (0.25 mm steps for new data, 0.5 mm for legacy 30-row data)
  const maxLen = Math.max(topFace?.readings?.length ?? 0, bottomFace?.readings?.length ?? 0);
  const step = maxLen >= 31 ? 0.25 : 0.5;
  const toNum = (v: any) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const depth = parseFloat((i * step).toFixed(2));
    return {
      depth,
      top: toNum(topFace?.readings?.[i]),
      bottom: toNum(bottomFace?.readings?.[i]),
    };
  }).filter(d => d.top != null || d.bottom != null || d.depth === 0);

  // Standard loads (kN) by standard — needed for the 2.5/5.0 mm summary table
  const STD_LOADS: Record<string, { l25: number; l50: number }> = {
    BS1377: { l25: 13.24, l50: 19.96 },
    ASTM_D1883: { l25: 13.44, l50: 20.0 },
  };
  const sl = STD_LOADS[String(fd.standard)] ?? STD_LOADS.BS1377;
  const loadAt = (face: any, depth: number) => toNum(face?.readings?.[Math.round(depth / step)]);

  // Summary penetration table — only the key 2.5 mm and 5.0 mm depths (per Excel)
  const summaryRows = [
    { pen: 2.5, std: sl.l25, topLoad: loadAt(topFace, 2.5), botLoad: loadAt(bottomFace, 2.5), topCbr: topFace?.cbr_2_5 ?? null, botCbr: bottomFace?.cbr_2_5 ?? null },
    { pen: 5.0, std: sl.l50, topLoad: loadAt(topFace, 5.0), botLoad: loadAt(bottomFace, 5.0), topCbr: topFace?.cbr_5_0 ?? null, botCbr: bottomFace?.cbr_5_0 ?? null },
  ];
  const hasSummaryReadings = summaryRows.some(r => r.topLoad != null || r.botLoad != null);

  const hasInitialDensity =
    idd.bulkDensity != null || idd.dryDensity != null || idd.moistureContent != null || dryDensityPct != null;

  return (
    <div className="space-y-4">
      {/* Main results */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {topFace?.cbrValue != null && (
          <div className={`border rounded p-3 text-center ${topPass == null ? "bg-blue-50 border-blue-200" : topPass ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`font-semibold ${topPass == null ? "text-blue-600" : topPass ? "text-emerald-700" : "text-red-700"}`}>{L("Top Face CBR", "CBR الوجه العلوي")}</p>
            <p className={`text-xl font-bold ${topPass == null ? "text-blue-800" : topPass ? "text-emerald-800" : "text-red-800"}`}>{fmt(topFace.cbrValue, 1)}%</p>
            {cbrMin != null && <p className="text-[10px] text-slate-500">≥ {cbrMin}% · {topPass ? L("Pass", "مقبول") : L("Fail", "مرفوض")}</p>}
          </div>
        )}
        {bottomFace?.cbrValue != null && (
          <div className={`border rounded p-3 text-center ${botPass == null ? "bg-rose-50 border-rose-200" : botPass ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`font-semibold ${botPass == null ? "text-rose-600" : botPass ? "text-emerald-700" : "text-red-700"}`}>{L("Bottom Face CBR", "CBR الوجه السفلي")}</p>
            <p className={`text-xl font-bold ${botPass == null ? "text-rose-800" : botPass ? "text-emerald-800" : "text-red-800"}`}>{fmt(bottomFace.cbrValue, 1)}%</p>
            {cbrMin != null && <p className="text-[10px] text-slate-500">≥ {cbrMin}% · {botPass ? L("Pass", "مقبول") : L("Fail", "مرفوض")}</p>}
          </div>
        )}
        {avgApplicableR && finalCBR != null ? (
          <div className={`border rounded p-3 text-center ${overall === "pass" ? "bg-emerald-50 border-emerald-200" : overall === "fail" ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
            <p className={`font-semibold ${overall === "pass" ? "text-emerald-700" : overall === "fail" ? "text-red-700" : "text-gray-600"}`}>{L("Final CBR (avg)", "CBR النهائي (المتوسط)")}</p>
            <p className={`text-xl font-bold ${overall === "pass" ? "text-emerald-800" : overall === "fail" ? "text-red-800" : "text-gray-800"}`}>{`${fmt(finalCBR, 1)}%`}</p>
            {cbrMin != null && <p className="text-[10px] text-slate-500">{L("Min. required", "الحد الأدنى")}: {cbrMin}%</p>}
          </div>
        ) : (
          <div className="border rounded p-3 text-center bg-amber-50 border-amber-200">
            <p className="font-semibold text-amber-700">{L("Final CBR (avg)", "CBR النهائي (المتوسط)")}</p>
            <p className="text-sm font-bold text-amber-800">{L("Average not reported", "لا يُحتسب المتوسط")}</p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              {cbrDiffR != null
                ? L(`Faces differ by ${fmt(cbrDiffR, 1)}% > 10 — repeat test`, `فرق الوجهين ${fmt(cbrDiffR, 1)}% > 10 — أعد الاختبار`)
                : L("Insufficient data", "بيانات غير كافية")}
            </p>
          </div>
        )}
      </div>

      {/* Test parameters + Retained 20% */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Layer Type", "نوع الطبقة")}</div>
          <div className="font-semibold">{layerLabel ?? "—"}{cbrMin != null ? ` (≥ ${cbrMin}%)` : ""}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Soaking Period", "فترة النقع")}</div>
          <div className="font-semibold">{fd.soakingPeriod != null ? `${fd.soakingPeriod} ${L("hrs", "ساعة")}` : "—"}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Passing 19.5 mm", "المار من 19.5 مم")}</div>
          <div className="font-semibold">{passing19 != null ? `${fmt(passing19, 1)}%` : "—"}</div>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded p-2">
          <div className="text-amber-700">{L("Retained % on 20 mm", "المحتجز على 20 مم")}</div>
          <div className="font-bold text-amber-900">{retained20 != null ? `${fmt(retained20, 1)}%` : "—"}</div>
        </div>
      </div>

      {/* Key-depth summary table (2.5 & 5.0 mm) — full width above the curve */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">{L("CBR at Key Penetrations (2.5 & 5.0 mm)", "نسبة CBR عند الاختراقات الرئيسية (2.5 و 5.0 مم)")}</p>
          {hasSummaryReadings ? (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">{L("Penetration (mm)", "الاختراق (مم)")}</th>
                  <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">{L("Load (kN)", "الحمل (kN)")}</th>
                  <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">{L("Standard Load (kN)", "الحمل المعياري (kN)")}</th>
                  <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">{L("CBR %", "نسبة CBR %")}</th>
                </tr>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 px-2 py-1 text-center font-semibold text-blue-700">{L("Top", "علوي")}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center font-semibold text-rose-700">{L("Bottom", "سفلي")}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center font-semibold text-blue-700">{L("Top", "علوي")}</th>
                  <th className="border border-slate-300 px-2 py-1 text-center font-semibold text-rose-700">{L("Bottom", "سفلي")}</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">{r.pen.toFixed(1)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono">{r.topLoad != null ? fmt(r.topLoad, 2) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono">{r.botLoad != null ? fmt(r.botLoad, 2) : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono">{fmt(r.std, 2)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold text-blue-800">{r.topCbr != null ? `${fmt(r.topCbr, 1)}` : "—"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold text-rose-800">{r.botCbr != null ? `${fmt(r.botCbr, 1)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] text-slate-400">{L("No readings recorded.", "لا توجد قراءات.")}</p>
          )}
          <p className="text-[10px] text-slate-500 mt-1">{L("CBR % = Load ÷ Standard Load × 100. Final CBR = max of the two depths, averaged across faces.", "نسبة CBR = الحمل ÷ الحمل المعياري × 100. القيمة النهائية = أكبر القيمتين، ومتوسط الوجهين.")}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">{L("Penetration vs. Load Curve", "منحنى الاختراق مقابل الحمل")}</p>
          <CBRReportLoadChart data={chartData} isAr={isAr} />
        </div>
      </div>

      {/* Initial density / moisture content small table */}
      {hasInitialDensity && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1">{L("Initial Density / Moisture Content", "الكثافة الأولية / المحتوى الرطوبي")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            <div className="border rounded p-2 text-center">
              <div className="text-slate-500">{L("Initial Density", "الكثافة الأولية")}</div>
              <div className="font-bold">{idd.bulkDensity != null ? fmt(idd.bulkDensity, 3) : "—"}<span className="text-[10px] font-normal text-slate-400"> Mg/m³</span></div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-slate-500">{L("Moisture Content", "المحتوى الرطوبي")}</div>
              <div className="font-bold">{idd.moistureContent != null ? fmt(idd.moistureContent, 1) : "—"}<span className="text-[10px] font-normal text-slate-400"> %</span></div>
            </div>
            <div className="border border-emerald-200 bg-emerald-50 rounded p-2 text-center">
              <div className="text-emerald-700">{L("Dry Density", "الكثافة الجافة")}</div>
              <div className="font-bold text-emerald-800">{idd.dryDensity != null ? fmt(idd.dryDensity, 3) : "—"}<span className="text-[10px] font-normal text-slate-400"> Mg/m³</span></div>
            </div>
            <div className="border border-emerald-200 bg-emerald-50 rounded p-2 text-center">
              <div className="text-emerald-700">{L("Degree of Compaction", "درجة الدمك")}</div>
              <div className="font-bold text-emerald-800">{dryDensityPct != null ? fmt(dryDensityPct, 1) : "—"}<span className="text-[10px] font-normal text-slate-400"> %</span></div>
              {mddVal != null && <div className="text-[9px] text-slate-400">MDD {fmt(mddVal, 3)}</div>}
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-slate-500">{L("Volume of Mould", "حجم القالب")}</div>
              <div className="font-bold">{idd.volumeMould != null ? fmt(idd.volumeMould, 0) : "—"}<span className="text-[10px] font-normal text-slate-400"> cm³</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AtterbergFlowCurveChart({
  points,
  ll,
  isAr,
}: {
  points: Array<{ blows: number; wc: number }>;
  ll: number | null;
  isAr: boolean;
}) {
  const data = [...points].filter(p => Number.isFinite(p.blows) && Number.isFinite(p.wc) && p.blows > 0).sort((a, b) => a.blows - b.blows);
  if (data.length < 2) return null;
  return (
    <div className="sieve-report-chart border border-slate-300 rounded-md bg-white p-1 print:p-0" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="blows"
            type="number"
            scale="log"
            domain={[10, 50]}
            ticks={[10, 15, 20, 25, 30, 40, 50]}
            tick={{ fontSize: 9 }}
            label={{ value: isAr ? "عدد الضربات (N)" : "Number of Blows (N)", position: "insideBottom", offset: -14, style: { fontSize: 10 } }}
          />
          <YAxis
            dataKey="wc"
            type="number"
            domain={["auto", "auto"]}
            width={42}
            tick={{ fontSize: 9 }}
            label={{ value: isAr ? "المحتوى الرطوبي (%)" : "Water Content (%)", angle: -90, position: "insideLeft", style: { fontSize: 10 } }}
          />
          <Tooltip formatter={(v: unknown) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—"; }} contentStyle={{ fontSize: 10 }} />
          <Scatter name="Test Points" data={data} dataKey="wc" fill="#2563eb" line={{ stroke: "#2563eb", strokeWidth: 2 }} />
          <ReferenceLine x={25} stroke="#10b981" strokeDasharray="4 4" label={{ value: "25 blows", position: "top", fontSize: 9, fill: "#10b981" }} />
          {ll != null && Number.isFinite(ll) && (
            <ReferenceLine y={ll} stroke="#10b981" strokeDasharray="4 4" label={{ value: `LL = ${Math.round(ll)}%`, position: "insideTopRight", fontSize: 9, fontWeight: 700, fill: "#059669" }} />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderSoilAtterberg(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const llPoints: any[] = Array.isArray(fd.llPoints) ? fd.llPoints : [];
  const plRows: any[] = Array.isArray(fd.plRows) ? fd.plRows : [];
  const ll = fd.liquidLimit ?? (fd.ll != null ? Math.round(Number(fd.ll)) : null);
  const pl = fd.plasticLimit ?? (fd.pl != null ? Math.round(Number(fd.pl)) : null);
  const pi = fd.plasticityIndex ?? (fd.pi != null ? Number(fd.pi) : null);
  const passing0425 = fd.passing0425;

  const llChartPoints = llPoints
    .map(p => ({ blows: Number(p.blows), wc: Number(p.waterContent) }))
    .filter(p => Number.isFinite(p.blows) && Number.isFinite(p.wc) && p.blows > 0);

  const llCols: Column[] = [
    { header: L("Container No.", "رقم الوعاء"), field: "containerNo", align: "center", render: (_v, r) => String((r as any).containerNo ?? "—") },
    { header: L("Range", "المدى"), field: "range", align: "center", render: (_v, r) => String((r as any).range || "—") },
    { header: L("Blows", "الضربات"), field: "blows", align: "center", render: v => fmt(v, 0) },
    { header: L("Cont.+wet (g)", "وعاء+رطبة"), field: "wetMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Cont.+dry (g)", "وعاء+جافة"), field: "dryMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Container (g)", "الوعاء"), field: "tinMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Wt. moisture (g)", "وزن الرطوبة"), field: "wtMoisture", align: "right", render: v => fmt(v, 2) },
    { header: L("Wt. dry (g)", "وزن الجاف"), field: "wtDry", align: "right", render: v => fmt(v, 2) },
    { header: L("Moisture %", "الرطوبة %"), field: "waterContent", align: "center", render: v => <span className="font-semibold">{fmt(v, 2)}</span> },
  ];
  const plCols: Column[] = [
    { header: L("Container No.", "رقم الوعاء"), field: "containerNo", align: "center", render: (_v, r) => String((r as any).containerNo ?? "—") },
    { header: L("Cont.+wet (g)", "وعاء+رطبة"), field: "wetMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Cont.+dry (g)", "وعاء+جافة"), field: "dryMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Container (g)", "الوعاء"), field: "tinMass", align: "right", render: v => fmt(v, 2) },
    { header: L("Wt. moisture (g)", "وزن الرطوبة"), field: "wtMoisture", align: "right", render: v => fmt(v, 2) },
    { header: L("Wt. dry (g)", "وزن الجاف"), field: "wtDry", align: "right", render: v => fmt(v, 2) },
    { header: L("Moisture %", "الرطوبة %"), field: "waterContent", align: "center", render: v => <span className="font-semibold">{fmt(v, 2)}</span> },
  ];

  const prepLabel = (m: string) => m === "air_dried" ? "Air Dried"
    : m === "natural_moisture" ? "Natural Moisture (Undisturbed)"
    : m === "wet_preparation" ? "Wet Preparation"
    : String(m);
  return (
    <div className="space-y-4">
      {/* Results summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-500">{L("% Passing 0.425 mm", "المار 0.425 مم")}</p>
          <p className="font-bold text-slate-800 text-base">{passing0425 != null ? `${fmt(passing0425, 0)}%` : "—"}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-700">{L("Plastic Limit (PL)", "حد اللدونة")}</p>
          <p className="font-bold text-amber-800 text-base">{pl != null ? `${pl}` : "—"}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600">{L("Liquid Limit (LL)", "حد السيولة")}</p>
          <p className="font-bold text-blue-800 text-base">{ll != null ? `${ll}` : "—"}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
          <p className="text-purple-600">{L("Plasticity Index (PI)", "مؤشر اللدونة")}</p>
          <p className="font-bold text-purple-800 text-base">{pi != null ? `${pi}` : "—"}</p>
        </div>
      </div>
      {fd.preparationMethod && (
        <div className="text-xs bg-slate-50 border rounded p-2">
          <span className="font-semibold">{L("Sample Preparation: ", "تحضير العينة: ")}</span>
          {prepLabel(fd.preparationMethod)}
        </div>
      )}
      {fd.classification && (
        <p className="text-[11px] text-slate-600">{L("Classification", "التصنيف")}: <span className="font-semibold">{fd.classification}</span></p>
      )}

      {/* Liquid Limit + flow curve */}
      {llPoints.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">{L("Liquid Limit (Casagrande)", "حد السيولة (كاساغراندي)")}</p>
          <FlexibleResultsTable columns={llCols} rows={llPoints} />
          <AtterbergFlowCurveChart points={llChartPoints} ll={fd.ll != null ? Number(fd.ll) : (ll != null ? Number(ll) : null)} isAr={isAr} />
        </div>
      )}

      {/* Plastic Limit */}
      {plRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">{L("Plastic Limit (Thread Rolling)", "حد اللدونة (فتل الخيط)")}</p>
          <FlexibleResultsTable columns={plCols} rows={plRows} />
        </div>
      )}
      <p className="text-[10px] text-slate-500">
        {L("PI = LL − PL. Limits reported to the nearest whole number (ASTM D4318).", "PI = LL − PL. تُقرّب الحدود لأقرب رقم صحيح (ASTM D4318).")}
      </p>
    </div>
  );
}

function renderAsphaltBitumenExtraction(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const sample = fd.sample ?? (Array.isArray(fd.samples) ? fd.samples[0] : null);
  if (!sample) return renderGeneric(fd, isAr);

  const cols: Column[] = [
    { header: L("Sample No.", "رقم العينة"), field: "sampleNo", align: "center" },
    { header: L("Mass Before (gm)", "قبل الاشتعال"), field: "massBeforeIgnition", align: "right", render: v => fmt(v, 1) },
    { header: L("Loss (gms)", "فقدان الاشتعال"), field: "lossOfIgnition", align: "right", render: v => fmt(v, 1) },
    { header: L("Mass After (gm)", "بعد الاشتعال"), field: "massAfterIgnition", align: "right", render: v => fmt(v, 1) },
    { header: L("% Loss", "نسبة الفقد"), field: "percentLoss", align: "center", render: v => (v != null ? `${fmt(v, 2)}%` : "—") },
    { header: L("Temp. Comp. %", "تعويض الحرارة"), field: "tempComp", align: "center", render: v => fmt(v, 2) },
    { header: L("Ignition Factor %", "عامل الاشتعال"), field: "ignitionFactor", align: "center", render: v => fmt(v, 2) },
    { header: L("%PG Binder", "محتوى الرابط PG"), field: "pgBinder", align: "center", render: v => (v != null ? `${fmt(v, 2)}%` : "—") },
  ];

  const pgBinder = sample.pgBinder ?? fd.calculations?.pgBinder ?? fd.avgBitumen;

  const extractMethodLabel = (m: string) => m === "ignition_furnace" ? "Ignition Furnace (ASTM D6307)"
    : m === "centrifuge" ? "Centrifuge (ASTM D2172)"
    : m ? String(m) : "Ignition Furnace";
  return (
    <>
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Extraction Method", "طريقة الاستخلاص")}</div>
          <div className="font-semibold">{extractMethodLabel(fd.extractionMethod ?? fd.method)}</div>
        </div>
        {fd.ignitionTemperature != null && (
          <div className="border rounded p-2">
            <div className="text-slate-500">{L("Ignition Temperature", "درجة حرارة الفرن")}</div>
            <div className="font-semibold">{fd.ignitionTemperature}°C</div>
          </div>
        )}
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Design", "التصميم")}</div>
          <div className="font-semibold">{fmt(fd.designBitumen, 2)}%</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Tolerance", "التفاوت")}</div>
          <div className="font-semibold">±{fmt(fd.tolerance, 2)}%</div>
        </div>
        <div className="border border-green-200 bg-green-50 rounded p-2">
          <div className="text-green-700">{L("PG Binder (Pb)", "محتوى الرابط PG")}</div>
          <div className="font-bold text-lg">{pgBinder != null ? `${fmt(pgBinder, 2)}%` : "—"}</div>
        </div>
      </div>
      <FlexibleResultsTable columns={cols} rows={[sample]} />
    </>
  );
}

function renderAsphaltExtractedSieve(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const sieves = (fd.sieves ?? fd.rows ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(sieves) || sieves.length === 0) return renderGeneric(fd, isAr);

  const mixType = String(fd.mixType ?? "base_course");
  const mixLabel =
    mixType === "wearing_course"
      ? L("Wearing Course", "طبقة التآكل")
      : L("Base Course", "طبقة الأساس");
  const overallPass = fd.overallPass === true || fd.summaryValues?.overallResult === "pass";
  const failedCount = Number(fd.failedCount ?? fd.summaryValues?.failedSieves ?? 0);

  const cols: Column[] = [
    {
      header: L("Sieve Size (mm)", "حجم المنخل (مم)"),
      field: "sieveLabel",
      align: "left",
    },
    {
      header: L("Mass Retained (gm)", "الكتلة المحجوزة (جم)"),
      field: "massRetained",
      align: "right",
      render: (v) => fmt(v, 1),
    },
    {
      header: L("% Retained", "نسبة المحجوز %"),
      field: "percentRetained",
      align: "center",
      render: (v) => fmt(v, 1),
    },
    {
      header: L("% Passing", "نسبة المار %"),
      field: "percentPassing",
      align: "center",
      render: (v) => fmt(v, 0),
    },
    {
      header: L("CC Lower", "CC أدنى"),
      field: "ccLower",
      align: "center",
      render: (v) => fmt(v, 0),
    },
    {
      header: L("CC Upper", "CC أعلى"),
      field: "ccUpper",
      align: "center",
      render: (v) => fmt(v, 0),
    },
    {
      header: L("Spec Lower", "مواصفات أدنى"),
      field: "specLower",
      align: "center",
      render: (v) => fmt(v, 0),
    },
    {
      header: L("Spec Upper", "مواصفات أعلى"),
      field: "specUpper",
      align: "center",
      render: (v) => fmt(v, 0),
    },
    {
      header: L("Result", "النتيجة"),
      field: "result",
      align: "center",
      render: (v) =>
        v === "pass" ? L("Pass", "مطابق") : v === "fail" ? L("Fail", "غير مطابق") : "—",
    },
  ];

  const rows = sieves.map((s) => {
    const size = String(s.sieveSize ?? s.sieve ?? "");
    const info = EXTRACTED_SIEVE_SIZES.find((x) => x.size === size);
    return {
      ...s,
      sieveLabel: isAr ? info?.labelAr ?? size : info?.label ?? size,
    };
  });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="border border-blue-200 bg-blue-50 rounded p-2">
          <div className="text-slate-500">{L("Mass Before Ignition (gm)", "الكتلة قبل الاشتعال (جم)")}</div>
          <div className="font-semibold">{fmt(fd.massBeforeIgnition, 1)}</div>
        </div>
        <div className="border border-blue-200 bg-blue-50 rounded p-2">
          <div className="text-slate-500">{L("Mass After Ignition (gm)", "الكتلة بعد الاشتعال (جم)")}</div>
          <div className="font-semibold">{fmt(fd.massAfterIgnition, 1)}</div>
        </div>
        <div className="border border-blue-200 bg-blue-50 rounded p-2">
          <div className="text-slate-500">{L("%PG Binder (Pb)", "محتوى الرابط PG (%)")}</div>
          <div className="font-semibold">{fd.pgBinder != null ? `${fmt(fd.pgBinder, 2)}%` : "—"}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-slate-500">{L("Mix Type", "نوع الخلطة")}</div>
          <div className="font-semibold">{mixLabel}</div>
        </div>
      </div>
      <FlexibleResultsTable columns={cols} rows={rows} />
      {(fd.passing75um || fd.fillerBitumenRatio != null) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {fd.passing75um && (
            <div className="border border-blue-200 bg-blue-50 rounded p-3">
              <p className="font-semibold text-slate-800 mb-1">
                {L("Passing 75 μm", "مار 75 ميكرون")}
              </p>
              <p>
                {L("Mass", "الكتلة")}: {fmt((fd.passing75um as { mass?: number }).mass, 1)} gm —{" "}
                {L("% Retained", "نسبة المحجوز")}:{" "}
                {fmt((fd.passing75um as { percent?: number }).percent, 1)}%
              </p>
            </div>
          )}
          {fd.fillerBitumenRatio != null && (
            <div className="border border-green-200 bg-green-50 rounded p-3">
              <p className="font-semibold text-slate-800 mb-1">
                {L("Filler/Bitumen Ratio", "نسبة الحشو/البيتومين")}
              </p>
              <p className="font-bold text-lg">{fmt(fd.fillerBitumenRatio, 1)}</p>
            </div>
          )}
        </div>
      )}
      <div
        className={`mt-4 p-4 rounded-lg border-2 text-center font-bold ${
          overallPass ? "bg-green-50 border-green-500 text-green-900" : "bg-red-50 border-red-500 text-red-900"
        }`}
      >
        {overallPass ? L("✓ PASS", "✓ مطابق") : L("✗ FAIL", "✗ غير مطابق")}
        {!overallPass && failedCount > 0 && (
          <div className="text-sm font-normal mt-1">
            {L(`${failedCount} sieves out of limits`, `${failedCount} منخل خارج الحدود`)}
          </div>
        )}
      </div>
    </>
  );
}

function renderAsphaltMarshallDensity(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const params = fd.parameters ?? {};
  const averages = fd.averages ?? {};
  const specimens = (fd.specimens ?? []).map((s: any, i: number) => ({
    ...s,
    _i: i + 1,
    massAir: s.massAir ?? s.weightInAir,
    massWater: s.massWater ?? s.weightInWater,
    ssdMass: s.ssdMass ?? s.weightSSD,
  }));
  const volumetric = fd.volumetricData;
  const avgGmb = averages.avgGmb ?? fd.avgGmb;
  const avgAirVoids = averages.avgAirVoids ?? fd.avgAirVoids;
  const avgVMA = averages.avgVMA ?? fd.avgVMA;
  const avgVFB = averages.avgVFB ?? fd.avgVFB;
  const gmm = params.gmm ?? fd.gmm;

  const gmbCols: Column[] = [
    { header: L("Specimen #", "رقم العينة"), field: "_i", align: "center" },
    { header: L("Mass in Air (g)", "الكتلة في الهواء"), field: "massAir", align: "right", render: v => fmt(v, 1) },
    { header: L("Mass in Water (g)", "الكتلة في الماء"), field: "massWater", align: "right", render: v => fmt(v, 1) },
    { header: L("SSD Mass (g)", "كتلة SSD"), field: "ssdMass", align: "right", render: v => fmt(v, 1) },
    { header: L("Volume (cm³)", "الحجم"), field: "volume", align: "right", render: v => fmt(v, 1) },
    { header: L("Gmb", "Gmb"), field: "gmb", align: "center", render: v => (v != null && Number(v) > 0 ? fmt(v, 3) : "—") },
  ];
  const volCols: Column[] = [
    { header: L("Specimen #", "رقم العينة"), field: "_i", align: "center" },
    { header: L("Gsb", "Gsb"), field: "gsb", align: "center", render: v => (v ? String(v) : "—") },
    { header: L("% Air Voids", "الفراغات الهوائية %"), field: "airVoids", align: "center", render: v => (v != null ? `${fmt(v, 1)}%` : "—") },
    { header: L("VMA", "VMA"), field: "vma", align: "center", render: v => (v != null ? fmt(v, 1) : "—") },
    { header: L("VFB", "VFB"), field: "vfb", align: "center", render: v => (v != null ? fmt(v, 0) : "—") },
  ];
  const volRows = Array.isArray(volumetric)
    ? volumetric.map((v: any, i: number) => ({ ...v, _i: i + 1 }))
    : specimens
        .filter((s: any) => (s.gmb ?? 0) > 0)
        .map((s: any, i: number) => ({
          _i: i + 1,
          gsb: params.gsb ?? s.gso,
          airVoids: s.airVoids,
          vma: s.vma,
          vfb: s.vfb,
        }));
  return (
    <>
      {/* Test conditions — ASTM D2726 required fields */}
      {(fd.compactionTemperature || fd.numberOfBlows) && (
        <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs report-info-grid">
          {fd.compactionTemperature && (
            <div className="border border-slate-200 rounded p-2 text-center">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Compaction Temperature", "درجة حرارة الدمك")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.compactionTemperature}°C</p>
            </div>
          )}
          {fd.numberOfBlows && (
            <div className="border border-slate-200 rounded p-2 text-center">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Blows per Face", "ضربات لكل وجه")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.numberOfBlows}</p>
            </div>
          )}
        </div>
      )}
      {(params.pb || params.gsb || params.gse || params.gb || gmm) && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          {params.pb != null && params.pb !== "" && (
            <div className="border border-slate-200 rounded p-2">
              <div className="text-slate-500">Pb %</div>
              <div className="font-semibold">{fmt(params.pb, 2)}</div>
            </div>
          )}
          {params.gsb && (
            <div className="border border-slate-200 rounded p-2">
              <div className="text-slate-500">Gsb</div>
              <div className="font-semibold">{params.gsb}</div>
            </div>
          )}
          {params.gse && (
            <div className="border border-slate-200 rounded p-2">
              <div className="text-slate-500">Gse</div>
              <div className="font-semibold">{params.gse}</div>
            </div>
          )}
          {params.gb && (
            <div className="border border-slate-200 rounded p-2">
              <div className="text-slate-500">Gb</div>
              <div className="font-semibold">{params.gb}</div>
            </div>
          )}
          {gmm != null && Number(gmm) > 0 && (
            <div className="border border-green-200 bg-green-50 rounded p-2">
              <div className="text-green-700">Gmm</div>
              <div className="font-bold text-green-900">{fmt(gmm, 3)}</div>
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2">
          {L("Bulk Specific Gravity (Gmb)", "الثقل النوعي الظاهري (Gmb)")}
        </h3>
        <FlexibleResultsTable columns={gmbCols} rows={specimens.filter((s: any) => s.massAir || s.weightInAir)} />
        {avgGmb != null && (
          <p className="text-xs mt-2 text-right font-semibold text-blue-800">
            {L("Average Gmb:", "متوسط Gmb:")} {fmt(avgGmb, 3)}
          </p>
        )}
      </div>

      {volRows.length > 0 && (
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2">
          {L("Volumetric Analysis", "التحليل الحجمي")}
        </h3>
        <FlexibleResultsTable columns={volCols} rows={volRows} />
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="border border-slate-200 p-2 rounded">
            <div className="text-slate-600">
              {L("Average % Air Voids", "متوسط الفراغات الهوائية")}
            </div>
            <div className="text-lg font-semibold">
              {avgAirVoids != null ? `${fmt(avgAirVoids, 1)}%` : "—"}
            </div>
            <div className="text-slate-500 text-xs">
              {L("Spec: 3 - 5%", "الحد: 3 - 5%")}
            </div>
          </div>
          <div className="border border-slate-200 p-2 rounded">
            <div className="text-slate-600">
              {L("Average VMA", "متوسط VMA")}
            </div>
            <div className="text-lg font-semibold">
              {avgVMA != null ? fmt(avgVMA, 1) : "—"}
            </div>
            <div className="text-slate-500 text-xs">
              {L("Min: 13", "الحد الأدنى: 13")}
            </div>
          </div>
          <div className="border border-slate-200 p-2 rounded">
            <div className="text-slate-600">
              {L("Average VFB", "متوسط VFB")}
            </div>
            <div className="text-lg font-semibold">
              {avgVFB != null ? fmt(avgVFB, 0) : "—"}
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

function renderAsphaltMarshall(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const specimens = (fd.specimens ?? []).map((s: any, i: number) => ({
    ...s,
    _i: s.specimenNumber ?? i + 1,
    readingKN: s.readingKN ?? s.stability,
    flowMm: s.flowMm ?? s.flow,
  }));
  const vol = fd.volumetricFromBulkSG ?? {};
  const averages = fd.averages ?? {};
  const checks = fd.passFailChecks ?? {};
  const isWearing = (fd.mixType ?? "") === "wearing_course";

  const marshallCols: Column[] = [
    { header: L("Specimen #", "رقم العينة"), field: "_i", align: "center" },
    { header: L("Reading (kN)", "القراءة (kN)"), field: "readingKN", align: "right", render: v => fmt(v, 2) },
    { header: L("Volume (cm³)", "الحجم"), field: "volume", align: "right", render: v => fmt(v, 1) },
    { header: L("Corr. Factor", "معامل التصحيح"), field: "corrFactor", align: "center", render: v => fmt(v, 2) },
    { header: L("Stability (N)", "الثبات (N)"), field: "stabilityN", align: "right", render: v => fmt(v, 0) },
    { header: L("Corr. Stability (N)", "الثبات المصحح (N)"), field: "corrStabilityN", align: "right", render: v => fmt(v, 0) },
    { header: L("Flow (mm)", "التدفق (mm)"), field: "flowMm", align: "right", render: v => fmt(v, 1) },
    { header: L("Flow (0.25mm)", "التدفق (0.25mm)"), field: "flowUnits", align: "center", render: v => fmt(v, 0) },
  ];

  return (
    <>
      {/* Test conditions info band — ASTM D6927 required fields */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs report-info-grid">
        <div className="border border-blue-200 bg-blue-50 rounded p-2">
          <div className="text-blue-700">{L("Mix Type", "النوع")}</div>
          <div className="font-semibold">{isWearing ? L("Wearing Course", "طبقة التآكل") : L("Base Course", "طبقة الأساس")}</div>
        </div>
        <div className="border border-slate-200 rounded p-2">
          <div className="text-slate-600">{L("Test Temperature", "درجة حرارة الاختبار")}</div>
          <div className="font-semibold">{fd.testTemperature != null ? `${fd.testTemperature}°C` : "60°C"}</div>
        </div>
        <div className="border border-slate-200 rounded p-2">
          <div className="text-slate-600">{L("Water Bath Soaking", "نقع في حمام الماء")}</div>
          <div className="font-semibold">{fd.soakingTime != null ? `${fd.soakingTime} min` : "30–40 min"}</div>
        </div>
      </div>
      {(vol.avgAirVoids != null || vol.avgVMA != null) && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="border border-slate-200 rounded p-2">
            <div className="text-slate-600">{L("Air Voids", "الفراغات الهوائية")}</div>
            <div className="font-semibold">{fmt(vol.avgAirVoids, 1)}%</div>
          </div>
          <div className="border border-slate-200 rounded p-2">
            <div className="text-slate-600">VMA</div>
            <div className="font-semibold">{fmt(vol.avgVMA, 1)}</div>
          </div>
          <div className="border border-slate-200 rounded p-2">
            <div className="text-slate-600">{L("Avg Gmb", "متوسط Gmb")}</div>
            <div className="font-semibold">{fmt(vol.avgGmb, 3)}</div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2">
          {L("Stability and Flow", "قياسات الثبات والتدفق")}
        </h3>
        <FlexibleResultsTable columns={marshallCols} rows={specimens} />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-slate-200 p-2 rounded">
            <div className="text-slate-600">{L("Avg Corr. Stability (N)", "متوسط الثبات المصحح")}</div>
            <div className="text-lg font-semibold">
              {averages.avgCorrStability ?? "—"}
              {checks.stabilityPass === false ? " ✗" : checks.stabilityPass ? " ✓" : ""}
            </div>
          </div>
          <div className="border border-slate-200 p-2 rounded">
            <div className="text-slate-600">{L("Avg Flow (0.25mm units)", "متوسط التدفق")}</div>
            <div className="text-lg font-semibold">
              {averages.avgFlow ?? "—"}
              {checks.flowPass === false ? " ✗" : checks.flowPass ? " ✓" : ""}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function renderConcreteFoam(fd: any, isAr: boolean, extras?: FormReportExtras) {
  const lang = isAr ? "ar" : "en";
  const mode =
    fd.testMode ??
    (fd.testType === FOAM_DENSITY_TEST_CODE || fd.testType === "CONC_FOAM_DENSITY" ? "density" : "strength");
  const isDensityReport = mode === "density";
  const cubes = isDensityReport ? [] : (fd.cubes ?? []);
  const densitySpecimens = isDensityReport ? (fd.densitySpecimens ?? []) : [];
  const hasCubes = cubes.length > 0;
  const hasDensity = densitySpecimens.length > 0;
  const strengthIsKgCm2 = fd.strengthUnit === "kg/cm2";
  const strengthUnitLabel = strengthIsKgCm2 ? (isAr ? "كجم/سم²" : "kg/cm²") : "N/mm²";
  const gradeShow = fd.gradeLabel ?? fd.grade ?? "—";
  const minStr = fd.minStrengthKgCm2 ?? fd.minStrength;
  const maxDen = fd.requiredMaxDryDensityKgM3 ?? fd.maxDensity;

  const sampleRecv = extras?.foamReceivedAt;
  const distCreated = extras?.foamDistCreatedAt;
  let receivedDisplay = "—";
  if (sampleRecv != null && String(sampleRecv).trim() !== "") {
    receivedDisplay = fmtDate(sampleRecv);
  } else if (distCreated != null && String(distCreated).trim() !== "") {
    receivedDisplay = fmtDate(distCreated);
  } else if (fd.receivedDate) {
    const raw = String(fd.receivedDate);
    receivedDisplay = fmtDate(raw.length >= 10 ? raw.slice(0, 10) : raw);
  }

  const ageAtTestRaw = fd.testAgeDays ?? fd.densitySpecimenAgeDays;
  const ageAtTest =
    ageAtTestRaw != null && ageAtTestRaw !== "" && Number.isFinite(Number(ageAtTestRaw)) ? Number(ageAtTestRaw) : null;

  const foamPrepPairs = buildConcreteSpecimenPrepPairs(fd, "foam", isAr);

  return (
    <div className="space-y-4">
      {foamPrepPairs.length > 0 && (
        <div className="mb-4">
          <ReportInfoHeading>{isAr ? "تفاصيل العينة والتحضير" : "Sample Preparation Details"}</ReportInfoHeading>
          <ReportInfoPairsTable pairs={foamPrepPairs} />
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-50 border rounded p-2 text-center">
          <p className="text-slate-500 font-semibold">{isAr ? "تاريخ استلام العينة" : "Sample received"}</p>
          <p className="font-bold text-slate-800">{receivedDisplay}</p>
        </div>
        <div className="bg-slate-50 border rounded p-2 text-center">
          <p className="text-slate-500 font-semibold">{isAr ? "عمر العينة عند الفحص" : "Age at test"}</p>
          <p className="font-bold text-slate-800">
            {ageAtTest != null ? `${ageAtTest} ${isAr ? "يوم" : "days"}` : "—"}
          </p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "التدرج" : "Grade"}</p>
          <p className="font-bold text-gray-800">{gradeShow}</p>
        </div>
        {fd.testMode && (
          <div className="bg-slate-50 border rounded p-2 text-center">
            <p className="text-slate-500 font-semibold">{isAr ? "وضع الفحص" : "Test mode"}</p>
            <p className="font-bold text-slate-800">
              {fd.testMode === "density" ? (isAr ? "كثافة" : "Density") : isAr ? "مقاومة" : "Strength"}
            </p>
          </div>
        )}
        {fd.avgStrength !== undefined && fd.avgStrength !== null && !isDensityReport && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "متوسط المقاومة" : "Avg. Strength"}</p>
            <p className="font-bold text-blue-800">
              {Number(fd.avgStrength).toFixed(2)} {strengthUnitLabel}
            </p>
          </div>
        )}
        {(() => {
          const avgOven = fd.avgOvenDryDensity ?? fd.avgDryDensity;
          if (!isDensityReport || avgOven == null || avgOven === "" || !Number.isFinite(Number(avgOven))) return null;
          return (
            <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
              <p className="text-purple-600 font-semibold">{isAr ? "متوسط الكثافة الجافة في الفرن" : "Avg. oven dry density"}</p>
              <p className="font-bold text-purple-800">{Number(avgOven).toFixed(0)} kg/m³</p>
            </div>
          );
        })()}
        {minStr !== undefined && minStr !== null && minStr !== "" && !isDensityReport && (
          <div className="bg-gray-50 border rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "الحد الأدنى للمقاومة" : "Min. strength"}</p>
            <p className="font-bold text-gray-800">
              {minStr} {strengthUnitLabel}
            </p>
          </div>
        )}
        {maxDen !== undefined && maxDen !== null && maxDen !== "" && isDensityReport && (
          <div className="bg-gray-50 border rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "أقصى كثافة جافة" : "Max dry density"}</p>
            <p className="font-bold text-gray-800">{maxDen} kg/m³</p>
          </div>
        )}
      </div>

      {hasCubes && (
        <>
          <p className="text-xs font-semibold text-gray-600">{isAr ? "نتائج المكعبات" : "Cube Results"}</p>
          <FlexibleResultsTable
            columns={[
              { header: isAr ? "رقم" : "No.", field: "_i", align: "center", render: (_v, row) => String((row as any)._i + 1) },
              { header: isAr ? "العمر (يوم)" : "Age (days)", field: "age", align: "center", render: (v) => String(v ?? "—") },
              { header: isAr ? "الحمل (كن)" : "Load (kN)", field: "maxLoad", align: "right", render: (v) => String(v ?? "—") },
              { header: isAr ? "المساحة (مم²)" : "Area (mm²)", field: "area", align: "right", render: (v) => (v ? Number(v).toFixed(0) : "—") },
              {
                header: isAr ? `المقاومة (${strengthUnitLabel})` : `Strength (${strengthUnitLabel})`,
                field: "strength",
                align: "right",
                render: (v) => <span className="font-bold">{v != null && v !== "" ? Number(v).toFixed(2) : "—"}</span>,
              },
              { header: isAr ? "الكثافة (kg/m³)" : "Density (kg/m³)", field: "density", align: "right", render: (v) => (v ? Number(v).toFixed(0) : "—") },
              {
                header: isAr ? "النتيجة" : "Result",
                field: "result",
                align: "center",
                render: (_, row) => {
                  const r = (row as any).result;
                  if (r === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
                  if (r === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
                  return <span className="text-gray-500">—</span>;
                },
              },
            ]}
            rows={cubes.map((c: any, i: number) => ({ ...c, _i: i }))}
          />
        </>
      )}

      {hasDensity && (
        <>
          <p className="text-xs font-semibold text-gray-600">{isAr ? "عينات الكثافة" : "Density Specimens"}</p>
          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "العينة" : "Specimen"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "العمر" : "Age (d)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "ط" : "L"} (mm)</th>
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "ع" : "W"} (mm)</th>
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "ار" : "H"} (mm)</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "حجم م³" : "Vol. (m³)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "وزن 0-1 غ" : "Init. g (0-1)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "72 س غ" : "72h g (1)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "فرق %" : "Diff %"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "96 س غ" : "96h g (2)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "فرق %" : "Diff %"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-right">{isAr ? "كثافة فرن" : "Oven dry (kg/m³)"}</th>
                  <th className="border border-slate-300 px-1 py-1 text-center">{isAr ? "نتيجة" : "Result"}</th>
                </tr>
              </thead>
              <tbody>
                {densitySpecimens.map((d: any, i: number) => {
                  const legacy = d.ovenDryDensity == null && d.dryDensity != null;
                  const L = d.length != null && d.length !== "" ? Number(d.length) : null;
                  const W = d.width != null && d.width !== "" ? Number(d.width) : null;
                  const H = d.height != null && d.height !== "" ? Number(d.height) : null;
                  const vol =
                    d.volume != null && d.volume !== ""
                      ? Number(d.volume)
                      : L != null && W != null && H != null && L > 0 && W > 0 && H > 0
                        ? (L * W * H) / 1_000_000_000
                        : null;
                  const volStr = vol != null && Number.isFinite(vol) ? vol.toFixed(6) : "—";
                  const iw = d.initialWeight != null ? Number(d.initialWeight) : null;
                  const w72 = d.weight72hrs != null ? Number(d.weight72hrs) : null;
                  const w96 = d.weight96hrs != null ? Number(d.weight96hrs) : null;
                  const d72 = d.diff72Pct != null ? Number(d.diff72Pct) : null;
                  const d96 = d.diff96Pct != null ? Number(d.diff96Pct) : null;
                  const oven = d.ovenDryDensity != null ? Number(d.ovenDryDensity) : legacy ? Number(d.dryDensity) : null;
                  const res = String(d.result ?? "").toUpperCase();
                  const pass = res === "PASS" || d.result === "pass";
                  const fail = res === "FAIL" || d.result === "fail";
                  return (
                    <tr key={String(d.id ?? `foam-den-${i}`)}>
                      <td className="border border-slate-300 px-1 py-1 text-center font-mono">{String(d.specimenNo ?? i + 1)}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center">{ageAtTest != null ? String(ageAtTest) : "—"}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center">{L != null && Number.isFinite(L) ? L : "—"}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center">{W != null && Number.isFinite(W) ? W : "—"}</td>
                      <td className="border border-slate-300 px-1 py-1 text-center">{H != null && Number.isFinite(H) ? H : "—"}</td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono">{volStr}</td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono">
                        {iw != null && Number.isFinite(iw) ? String(iw) : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono">
                        {w72 != null && Number.isFinite(w72) ? String(w72) : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono text-orange-700">
                        {d72 != null && Number.isFinite(d72) ? `${d72.toFixed(1)}%` : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono">
                        {w96 != null && Number.isFinite(w96) ? String(w96) : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono text-orange-700">
                        {d96 != null && Number.isFinite(d96) ? `${d96.toFixed(1)}%` : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-right font-mono font-semibold">
                        {oven != null && Number.isFinite(oven) ? String(Math.round(oven)) : "—"}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-center">
                        {pass ? <span className="text-emerald-800 font-bold">✓</span> : null}
                        {fail ? <span className="text-red-800 font-bold">✗</span> : null}
                        {!pass && !fail ? <span className="text-gray-400">—</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {densitySpecimens.some((d: any) => d.ovenDryDensity == null && d.dryDensity != null) && (
            <p className="text-[9px] text-muted-foreground mt-1 italic">
              {isAr ? "صفوف قديمة: كثافة جافة محسوبة سابقاً." : "Legacy rows: dry density from previous form layout."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function renderCementSettingTime(fd: any, isAr: boolean) {
  const readings = fd.readings ?? [];
  const spec = fd.spec ?? {};
  const minInit = spec.initialSetMin ?? 60;
  const maxFinal = spec.finalSetMax ?? 600;

  const clockToMinutes = (hhmm: string): number | null => {
    if (!hhmm?.includes(":")) return null;
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const rowElapsedMin = (r: any): number | null => {
    if (r == null) return null;
    const start = typeof fd.startingTime === "string" ? fd.startingTime : "";
    if (r.actualTime && start.includes(":")) {
      const sm = clockToMinutes(start);
      const am = clockToMinutes(String(r.actualTime));
      if (sm == null || am == null) return null;
      let actual = am;
      if (actual < sm) actual += 24 * 60;
      return actual - sm;
    }
    const hasElapsed =
      (r.elapsedHours != null && r.elapsedHours !== "") ||
      (r.elapsedMinutes != null && r.elapsedMinutes !== "");
    if (hasElapsed) {
      const h = parseInt(String(r.elapsedHours), 10) || 0;
      const m = parseInt(String(r.elapsedMinutes), 10) || 0;
      return h * 60 + m;
    }
    const t = parseFloat(r.time);
    return Number.isFinite(t) ? t : null;
  };

  const rowNeedle = (r: any): number | null => {
    if (r == null) return null;
    if (r.needleReading !== undefined && r.needleReading !== null && r.needleReading !== "") {
      const n = parseFloat(String(r.needleReading));
      return Number.isFinite(n) ? n : null;
    }
    const p = parseFloat(r.penetration);
    return Number.isFinite(p) ? p : null;
  };

  const validReadings = readings
    .map((r: any) => ({ time: rowElapsedMin(r), pen: rowNeedle(r) }))
    .filter((r: any) => r.time != null && r.pen != null)
    .sort((a: any, b: any) => a.time - b.time);

  const formatTime = (min: number) => {
    if (isNaN(min) || min === undefined || min === null) return "—";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  function interpolateTimeReport(targetPen: number): number | undefined {
    const sorted = [...validReadings].sort((a: any, b: any) => a.time - b.time);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if ((a.pen >= targetPen && b.pen <= targetPen) || (a.pen <= targetPen && b.pen >= targetPen)) {
        const denom = b.pen - a.pen;
        if (denom === 0) continue;
        const t = a.time + (targetPen - a.pen) / denom * (b.time - a.time);
        if (isNaN(t) || !isFinite(t)) continue;
        return parseFloat(t.toFixed(0));
      }
    }
    const fallback = sorted.find((r: any) => r.pen <= targetPen);
    return fallback ? fallback.time : undefined;
  }

  const manualInitialMin =
    fd.initialSetTotalMinutes != null && fd.initialSetTotalMinutes !== "" && !isNaN(Number(fd.initialSetTotalMinutes))
      ? Number(fd.initialSetTotalMinutes)
      : null;
  const manualFinalMin =
    fd.finalSetTotalMinutes != null && fd.finalSetTotalMinutes !== "" && !isNaN(Number(fd.finalSetTotalMinutes))
      ? Number(fd.finalSetTotalMinutes)
      : null;

  const initialClock =
    fd.initialSetHours != null &&
    fd.initialSetHours !== "" &&
    fd.initialSetMinutes != null &&
    fd.initialSetMinutes !== ""
      ? `${String(fd.initialSetHours)}:${String(fd.initialSetMinutes).padStart(2, "0")}`
      : "—";
  const finalClock =
    fd.finalSetHours != null &&
    fd.finalSetHours !== "" &&
    fd.finalSetMinutes != null &&
    fd.finalSetMinutes !== ""
      ? `${String(fd.finalSetHours)}:${String(fd.finalSetMinutes).padStart(2, "0")}`
      : "—";
  const finalIsClockDerived = fd.finalSettingCalculatedFromClock === true;

  let initialSet: number | undefined =
    manualInitialMin != null && !isNaN(manualInitialMin) ? manualInitialMin : undefined;
  let finalSet: number | undefined = manualFinalMin != null && !isNaN(manualFinalMin) ? manualFinalMin : undefined;

  const rawInitialSet = fd.initialSet ?? fd.initialSettingTime;
  const rawFinalSet = fd.finalSet ?? fd.finalSettingTime;
  if (initialSet === undefined && rawInitialSet != null && !isNaN(Number(rawInitialSet))) {
    initialSet = Number(rawInitialSet);
  }
  if (finalSet === undefined && rawFinalSet != null && !isNaN(Number(rawFinalSet))) {
    finalSet = Number(rawFinalSet);
  }

  const legacyPen = readings.some(
    (r: any) =>
      r.penetration != null &&
      r.penetration !== "" &&
      (r.needleReading === undefined || r.needleReading === null || r.needleReading === ""),
  );
  if (initialSet === undefined && legacyPen) initialSet = interpolateTimeReport(25);
  if (finalSet === undefined && legacyPen) {
    finalSet = interpolateTimeReport(1);
    if (finalSet === undefined && validReadings.length > 0) {
      const sorted = [...validReadings].sort((a: any, b: any) => a.time - b.time);
      const last = sorted[sorted.length - 1];
      if (last.pen <= 1) finalSet = last.time;
    }
  }

  const initialOk =
    fd.initialSetPass === true ||
    (initialSet != null && !isNaN(initialSet) && initialSet >= minInit);
  const initialBad =
    fd.initialSetPass === false || (initialSet != null && !isNaN(initialSet) && initialSet < minInit);
  const finalOk =
    fd.finalSetPass === true || (finalSet != null && !isNaN(finalSet) && finalSet <= maxFinal);
  const finalBad =
    fd.finalSetPass === false || (finalSet != null && !isNaN(finalSet) && finalSet > maxFinal);

  const waterPct =
    fd.standardConsistency != null && fd.standardConsistency !== ""
      ? String(fd.standardConsistency)
      : fd.waterContent ||
        (fd.computedConsistencyPct != null ? String(Number(fd.computedConsistencyPct).toFixed(1)) : null);

  return (
    <div className="space-y-4">
      {(fd.cementWeight || fd.waterVolume || fd.startingTime) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border border-blue-200 bg-blue-50 rounded p-3">
          <div>
            <p className="text-blue-800 font-semibold">Cement (g) / وزن الأسمنت</p>
            <p className="font-bold">{fd.cementWeight ?? "—"}</p>
          </div>
          <div>
            <p className="text-blue-800 font-semibold">Water (ml) / الماء (مل)</p>
            <p className="font-bold">{fd.waterVolume ?? "—"}</p>
          </div>
          <div>
            <p className="text-blue-800 font-semibold">Consistency % / التطبيع %</p>
            <p className="font-bold">{waterPct ? `${waterPct}%` : "—"}</p>
          </div>
          <div>
            <p className="text-blue-800 font-semibold">Start / End — البدء / الانتهاء</p>
            <p className="font-bold font-mono">
              {fd.startingTime ?? "—"} {fd.endingTime ? `→ ${fd.endingTime}` : ""}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "نوع الأسمنت" : "Cement Type"}</p>
          <p className="font-bold text-gray-800">{spec.label ?? fd.cementType ?? "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "الماء للتطبيع %" : "Consistency %"}</p>
          <p className="font-bold text-gray-800">{waterPct ? `${waterPct}%` : "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "درجة الحرارة" : "Temperature"}</p>
          <p className="font-bold text-gray-800">{fd.testTemp ? `${fd.testTemp}°C` : "20°C (std)"}</p>
        </div>
        {fd.testRH && (
          <div className="bg-gray-50 border rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "الرطوبة النسبية" : "Relative Humidity"}</p>
            <p className="font-bold text-gray-800">{fd.testRH}%</p>
          </div>
        )}
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "رقم الدفعة" : "Batch No."}</p>
          <p className="font-bold text-gray-800">{fd.cementBatch || "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div
          className={`rounded-xl p-4 text-center border-2 ${
            initialOk ? "bg-emerald-50 border-emerald-300" : initialBad ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
          }`}
        >
          <p className="text-xs font-semibold text-gray-600 mb-1">
            {isAr ? "زمن الشك الابتدائي" : "Initial Setting Time"}
          </p>
          <p className="text-2xl font-extrabold text-gray-800 font-mono">
            {initialSet != null && !isNaN(initialSet) ? formatTime(initialSet) : "—"}
          </p>
          {initialClock !== "—" && (
            <p className="text-sm text-gray-600 mt-1 font-mono">
              {isAr ? "مدخل:" : "Entered:"} {initialClock}
            </p>
          )}
          {initialSet != null && !isNaN(initialSet) && (
            <p className="text-xs text-gray-500 mt-1">{isAr ? "الحد الأدنى:" : "Min:"} {minInit} min</p>
          )}
          {initialOk && (
            <p className="text-xs font-bold mt-2 text-emerald-700">{isAr ? "✓ مطابق" : "✓ PASS"}</p>
          )}
          {initialBad && (
            <p className="text-xs font-bold mt-2 text-red-700">{isAr ? "✗ غير مطابق" : "✗ FAIL"}</p>
          )}
        </div>
        <div
          className={`rounded-xl p-4 text-center border-2 ${
            finalOk ? "bg-emerald-50 border-emerald-300" : finalBad ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
          }`}
        >
          <p className="text-xs font-semibold text-gray-600 mb-1">
            {isAr ? "زمن الشك النهائي" : "Final Setting Time"}
          </p>
          <p className="text-2xl font-extrabold text-gray-800 font-mono">
            {finalSet != null && !isNaN(finalSet) ? formatTime(finalSet) : "—"}
          </p>
          {finalClock !== "—" && (
            <p className="text-sm text-gray-600 mt-1 font-mono">
              {finalIsClockDerived
                ? isAr
                  ? "محسوب (انتهاء − بدء):"
                  : "Calculated (end − start):"
                : isAr
                  ? "مدخل:"
                  : "Entered:"}{" "}
              {finalClock}
            </p>
          )}
          {finalSet != null && !isNaN(finalSet) && (
            <p className="text-xs text-gray-500 mt-1">{isAr ? "الحد الأقصى:" : "Max:"} {maxFinal} min</p>
          )}
          {finalOk && <p className="text-xs font-bold mt-2 text-emerald-700">{isAr ? "✓ مطابق" : "✓ PASS"}</p>}
          {finalBad && <p className="text-xs font-bold mt-2 text-red-700">{isAr ? "✗ غير مطابق" : "✗ FAIL"}</p>}
        </div>
      </div>

      {validReadings.length > 0 && (
        <FlexibleResultsTable
          columns={[
            {
              header: isAr ? "الوقت (دقيقة)" : "Elapsed (min)",
              field: "time",
              type: "number",
              decimals: 0,
              align: "right",
            },
            {
              header: isAr ? "قراءة الإبرة" : "Needle / penetration",
              field: "pen",
              type: "number",
              decimals: 2,
              align: "right",
            },
          ]}
          rows={validReadings}
        />
      )}
    </div>
  );
}

function renderInterlock(fd: any, isAr: boolean) {
  const getCfRpt = (type: string) => {
    switch (type) {
      case "6cm":
      case "6CM":
        return 1.06;
      case "8cm":
      case "8CM":
        return 1.18;
      case "10cm":
      case "10CM":
        return 1.24;
      default:
        return 1.0;
    }
  };
  const THICKNESS_FACTOR_LEGACY: Record<number, number> = { 60: 0.8, 80: 1.0, 100: 1.2 };

  const blockTypeKey = (fd.blockType ?? fd.interlockType ?? "6cm").toString();
  const cfSaved = typeof fd.cf === "number" && Number.isFinite(fd.cf) ? fd.cf : getCfRpt(blockTypeKey);
  const spec = fd.spec ?? {};
  const commonThickness = fd.commonThickness;
  const commonArea = fd.commonAreaMm2 ?? fd.commonArea;
  const blocksRaw = fd.blocks ?? [];
  const blocks = blocksRaw.filter((b: any) => {
    const load = Number(b.maxLoadKN);
    if (!load) return false;
    const area =
      commonArea != null && commonArea !== ""
        ? Number(commonArea)
        : Number(b.area ?? b.areaMm2) > 0
          ? Number(b.area ?? b.areaMm2)
          : 0;
    return area > 0;
  });
  const avgStrength = fd.avgStrength ?? 0;
  const overallResult = fd.overallResult ?? "pending";

  const blockTypeLabel =
    spec.label ??
    (blockTypeKey === "8CM" || blockTypeKey === "8cm"
      ? "Interlock 8cm"
      : blockTypeKey === "10CM" || blockTypeKey === "10cm"
        ? "Interlock 10cm"
        : "Interlock 6cm");

  const headers = isAr
    ? ["رقم البلوكة", "الحمل (كن)", "المقاومة (N/mm²)", "المقاومة المصححة (N/mm²)", "النتيجة"]
    : ["Block Ref.", "Max Load (kN)", "Str. (N/mm²)", "Corr. (N/mm²)", "Result"];

  return (
    <div className="text-xs">
      {/* Test Info */}
      <div className="report-info-grid grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-2">
        <div className="bg-blue-50 border border-blue-200 rounded p-1.5">
          <p className="text-blue-600 font-semibold">{isAr ? "النوع" : "Block Type"}</p>
          <p className="font-bold text-blue-800">{blockTypeLabel}</p>
        </div>
        {commonThickness != null && commonThickness !== "" && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "السماكة (مم)" : "Thickness (mm)"}</p>
            <p className="font-bold text-gray-800">{String(commonThickness)}</p>
          </div>
        )}
        {commonArea != null && commonArea !== "" && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "المساحة (مم²)" : "Area (mm²)"}</p>
            <p className="font-bold text-gray-800">{String(commonArea)}</p>
          </div>
        )}
        <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
          <p className="text-slate-500 font-semibold">{isAr ? "عامل التصحيح CF" : "Correction factor CF"}</p>
          <p className="font-bold text-slate-800 font-mono">{Number(cfSaved).toFixed(2)}</p>
        </div>
        {fd.manufacturer && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "المصنّع" : "Manufacturer"}</p>
            <p className="font-bold text-gray-800">{fd.manufacturer}</p>
          </div>
        )}
        {fd.blockShape && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "الشكل" : "Shape"}</p>
            <p className="font-bold text-gray-800">{fd.blockShape}</p>
          </div>
        )}
        {fd.blockColor && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "اللون" : "Color"}</p>
            <p className="font-bold text-gray-800">{fd.blockColor}</p>
          </div>
        )}
        {fd.mtsReference && (
          <div className="bg-gray-50 border border-gray-200 rounded p-1.5">
            <p className="text-gray-500 font-semibold">{isAr ? "مرجع التقديم" : "Material Submittal Ref."}</p>
            <p className="font-bold text-gray-800">{fd.mtsReference}</p>
          </div>
        )}
        {fd.moistureCondition && (
          <div className="bg-sky-50 border border-sky-200 rounded p-1.5">
            <p className="text-sky-600 font-semibold">{isAr ? "حالة الرطوبة" : "Moisture Condition"}</p>
            <p className="font-bold text-sky-800">
              {fd.moistureCondition === "saturated_surface_dry" ? "SSD"
                : fd.moistureCondition === "air_dry" ? "Air Dry"
                : fd.moistureCondition === "wet" ? "Wet"
                : String(fd.moistureCondition)}
            </p>
          </div>
        )}
        <div className="bg-slate-50 border rounded p-1.5">
          <p className="text-slate-500 font-semibold">{isAr ? "عدد الوحدات المختبرة" : "No. of Units Tested"}</p>
          <p className="font-bold text-slate-800">{blocks.length}</p>
        </div>
      </div>
      <div className="report-results-tail">
      {/* Results Table */}
      {blocks.length > 0 && (
        <div className="mb-2">
          <FlexibleResultsTable
            columns={[
              { header: headers[0], field: "blockRef", align: "center", render: (v) => <span className="font-mono">{String(v ?? "")}</span> },
              { header: headers[1], field: "maxLoadKN", align: "right", render: (v) => (v != null ? Number(v).toFixed(1) : "—") },
              {
                header: headers[2],
                field: "strengthMpa",
                align: "right",
                render: (_, row) => {
                  const b = row as any;
                  if (b.strengthMpa != null) return Number(b.strengthMpa).toFixed(1);
                  const load = Number(b.maxLoadKN);
                  const area =
                    commonArea != null && commonArea !== ""
                      ? Number(commonArea)
                      : Number(b.area ?? b.areaMm2);
                  if (!load || !area) return "—";
                  return ((load * 1000) / area).toFixed(1);
                },
              },
              {
                header: headers[3],
                field: "correctedStrengthMpa",
                align: "right",
                render: (_, row) => {
                  const b = row as any;
                  if (b.correctedStrengthMpa != null) return Number(b.correctedStrengthMpa).toFixed(1);
                  const load = Number(b.maxLoadKN);
                  const area =
                    commonArea != null && commonArea !== ""
                      ? Number(commonArea)
                      : Number(b.area ?? b.areaMm2);
                  if (!load || !area) return "—";
                  const str = (load * 1000) / area;
                  if (b.strengthMpa != null) {
                    const isNewFormat = fd.blockType != null || fd.cf != null;
                    if (isNewFormat) return (Number(b.strengthMpa) * cfSaved).toFixed(1);
                    const th = Number(b.thickness ?? commonThickness);
                    const lf = Number.isFinite(th) ? THICKNESS_FACTOR_LEGACY[th] : 1;
                    return (Number(b.strengthMpa) * (lf ?? 1)).toFixed(1);
                  }
                  return (str * cfSaved).toFixed(1);
                },
              },
              {
                header: headers[4],
                field: "result",
                align: "center",
                render: (_, row) => {
                  const b = row as any;
                  if (b.result === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
                  if (b.result === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
                  return <span className="text-gray-500">—</span>;
                },
              },
            ]}
            rows={blocks}
          />
        </div>
      )}
      {/* Summary */}
      <div className="flex justify-end">
        <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-bold border ${
          overallResult === "pass" ? "bg-green-50 border-green-300 text-green-800" :
          overallResult === "fail" ? "bg-red-50 border-red-300 text-red-800" :
          "bg-gray-50 border-gray-300 text-gray-700"
        }`}>
          {isAr ? "متوسط المقاومة المصححة:" : "Avg. Corrected Strength:"} {Number(avgStrength).toFixed(1)} N/mm²
          &nbsp;/&nbsp;
          {isAr ? "المطلوب:" : "Required:"} {spec.requiredStrength ?? "—"} N/mm²
        </div>
      </div>
      </div>
    </div>
  );
}

function renderConcreteBeam(fd: any, isAr: boolean, castingDateMs?: number | null) {
  const rows = (fd.rows ?? []).filter((r: any) => !r.discarded && r.mor !== undefined);
  const allRows = fd.rows ?? [];
  const beamSizeRaw = fd.beamSize ?? "small";
  const beamSize =
    beamSizeRaw === "large"
      ? "150x150x750"
      : beamSizeRaw === "small"
        ? "100x100x500"
        : beamSizeRaw;
  const span =
    fd.span ??
    (beamSize === "150x150x750" || beamSizeRaw === "large" ? 450 : 300);
  const specifiedStrength = fd.specifiedStrength;
  const minMOR = fd.minMOR;
  const avgMOR = fd.avgMOR;
  const requiredAge = fd.requiredAge ?? null;

  const BEAM_SIZE_LABELS: Record<string, string> = {
    small: "100×100×500 mm (Span = 300 mm)",
    large: "150×150×750 mm (Span = 450 mm)",
    "100x100x500": "100×100×500 mm (Span = 300 mm)",
    "150x150x750": "150×150×750 mm (Span = 450 mm)",
  };

  const fdCastDate = fd.castDate ?? null;
  const fdTestDate = fd.testDate ?? null;
  const fdAgeDays = fd.ageDays ?? null;

  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const ageFromDateStrings = (start: string, end: string): number | null => {
    const t0 = new Date(start).getTime();
    const t1 = new Date(end).getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
    const d = Math.ceil((t1 - t0) / (1000 * 60 * 60 * 24));
    return d >= 0 ? d : null;
  };

  let reportAge = numOrNull(fd.age);
  if (reportAge === null) reportAge = numOrNull(fdAgeDays);
  if (reportAge === null && fdCastDate && fdTestDate) reportAge = ageFromDateStrings(String(fdCastDate), String(fdTestDate));
  if (reportAge === null && castingDateMs && fdTestDate) {
    const d = Math.ceil((new Date(fdTestDate).getTime() - castingDateMs) / (1000 * 60 * 60 * 24));
    reportAge = d >= 0 ? d : null;
  }

  const showAgeColumn = false;

  const reportFractureZone = String(fd.fractureZone ?? allRows[0]?.fractureZone ?? "middle_third");

  const fractureZoneSummaryLabel = (zone: string, ar: boolean) => {
    if (zone === "middle_third") return ar ? "الثلث الأوسط ✓" : "Middle Third ✓";
    if (zone === "outside_middle_third") return ar ? "خارج الثلث الأوسط" : "Outside Middle Third";
    if (zone === "outside_5pct") return ar ? "خارج (ضمن 5%)" : "Outside (within 5%)";
    return ar ? "مستبعد" : "Discarded";
  };

  const headers = isAr
    ? ["رقم الكمرة", "العرض (مم)", "العمق (مم)", "الحمل الأقصى (ن)", "MOR (ميجا باسكال)", ...(showAgeColumn ? ["العمر (يوم)"] : []), "النتيجة"]
    : ["Beam No.", "Width (mm)", "Depth (mm)", "Max Load (N)", "MOR (MPa)", ...(showAgeColumn ? ["Age (days)"] : []), "Result"];

  const beamRows = allRows.map((r: any, i: number) => ({ ...r, _i: i }));
  const beamPrepPairs = buildConcreteSpecimenPrepPairs(fd, "beam", isAr, {
    specifiedFlexuralStrength: specifiedStrength,
  });
  const beamCols: Column[] = [
    { header: headers[0], field: "beamNo", align: "center", render: (_, row) => String((row as any).beamNo ?? ((row as any)._i + 1)) },
    { header: headers[1], field: "width", align: "center", render: (v) => String(v ?? "—") },
    { header: headers[2], field: "depth", align: "center", render: (v) => String(v ?? "—") },
    {
      header: headers[3],
      field: "maxLoadN",
      align: "center",
      render: (_, row) => {
        const r = row as any;
        if (r.maxLoadN !== undefined && r.maxLoadN !== null && r.maxLoadN !== "") return String(r.maxLoadN);
        const leg = r.maxLoad;
        if (leg !== undefined && leg !== null && leg !== "") {
          const n = Number(leg);
          if (Number.isFinite(n)) return String(Math.round(n * 1000));
        }
        return "—";
      },
    },
    {
      header: headers[4],
      field: "mor",
      align: "center",
      render: (_, row) => {
        const r = row as any;
        if (r.discarded) return isAr ? "مستبعد" : "Discarded";
        return r.mor !== undefined ? Number(r.mor).toFixed(3) : "—";
      },
    },
    ...(showAgeColumn
      ? ([
          {
            header: headers[5],
            field: "_age",
            align: "center",
            render: () => (reportAge !== null ? String(reportAge) : "—"),
          },
        ] as Column[])
      : []),
    {
      header: headers[headers.length - 1],
      field: "result",
      align: "center",
      render: (_, row) => {
        const r = row as any;
        if (r.discarded) return <span className="text-orange-600 font-bold">{isAr ? "مستبعد" : "Discarded"}</span>;
        if (r.result === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
        if (r.result === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
        return <span className="text-gray-500">—</span>;
      },
    },
  ];

  return (
    <>
      {beamPrepPairs.length > 0 && (
        <div className="mb-4">
          <ReportInfoHeading>{isAr ? "تفاصيل العينة والتحضير" : "Sample Preparation Details"}</ReportInfoHeading>
          <ReportInfoPairsTable pairs={beamPrepPairs} />
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4 text-xs">
        {(castingDateMs || fdCastDate) && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "تاريخ الصب" : "Casting Date"}</p>
            <p className="font-bold text-blue-800">
              {fdCastDate
                ? formatCalendarDate(fdCastDate)
                : castingDateMs
                  ? formatCalendarDate(castingDateMs)
                  : "—"}
            </p>
          </div>
        )}
        {fdTestDate && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "تاريخ الفحص" : "Test Date"}</p>
            <p className="font-bold text-blue-800">{formatCalendarDate(fdTestDate)}</p>
          </div>
        )}
        {reportAge !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "عمر العينة" : "Sample Age"}</p>
            <p className="font-bold text-blue-800">
              {reportAge} {isAr ? "يوم" : "days"}
            </p>
          </div>
        )}
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "حجم الكمرة" : "Beam Size"}</p>
          <p className="font-bold text-slate-800 text-[11px]">{BEAM_SIZE_LABELS[beamSize] ?? beamSize}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "البحر (مم)" : "Span (mm)"}</p>
          <p className="font-bold text-slate-800">{span}</p>
        </div>
        {specifiedStrength !== undefined && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "مقاومة الانعطاف المحددة" : "Specified Flexural Strength"}</p>
            <p className="font-bold text-amber-800">{specifiedStrength} MPa</p>
          </div>
        )}
        {minMOR !== undefined && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "الحد الأدنى المطلوب" : "Required MOR"}</p>
            <p className="font-bold text-amber-800">{minMOR} MPa</p>
          </div>
        )}
        {requiredAge !== null && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "العمر المطلوب" : "Required Age"}</p>
            <p className="font-bold text-gray-800">
              {requiredAge} {isAr ? "يوم" : "days"}
            </p>
          </div>
        )}
        {fd.sampleLocation && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "موقع العينة" : "Sample Location"}</p>
            <p className="font-bold text-gray-800 text-[11px]">{fd.sampleLocation}</p>
          </div>
        )}
        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
          <p className="text-gray-600 font-semibold">{isAr ? "منطقة الكسر" : "Fracture Zone"}</p>
          <p className="font-bold text-gray-800 text-[11px]">{fractureZoneSummaryLabel(reportFractureZone, isAr)}</p>
        </div>
      </div>

      {allRows.length > 0 && (
        <FlexibleResultsTable
          columns={beamCols}
          rows={beamRows}
          rowClassName={(row) => ((row as any).discarded ? "opacity-40 bg-gray-50" : "")}
        />
      )}

      {avgMOR !== null && avgMOR !== undefined && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط MOR" : "Avg. MOR"}</p>
            <p className="font-bold text-green-800 text-lg">{Number(avgMOR).toFixed(3)} MPa</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "MOR المطلوب" : "Required MOR"}</p>
            <p className="font-bold text-amber-800 text-lg">{minMOR ?? "—"} MPa</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "عدد الكمرات الصالحة" : "Valid Beams"}</p>
            <p className="font-bold text-gray-800 text-lg">{rows.length}</p>
          </div>
        </div>
      )}
    </>
  );
}

function renderGeneric(fd: any, isAr: boolean) {
  const kvRows = formDataToKeyValueRows(fd as Record<string, unknown>);
  if (kvRows.length === 0) {
    return (
      <div className="text-xs border border-amber-200 bg-amber-50 rounded p-4 text-amber-900">
        <p className="font-semibold mb-1">
          {isAr ? "تنسيق التقرير غير متاح لهذا النوع بعد" : "Formatted report is not available for this test type yet"}
        </p>
        <p className="text-[11px] text-amber-800">
          {isAr
            ? "تم حفظ النتائج بنجاح، لكن عرض التقرير التفصيلي يحتاج إضافة قالب عرض مخصص."
            : "Results are saved successfully, but detailed rendering requires a dedicated report template."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-600">
        {isAr ? "ملخص البيانات المحفوظة (قيم مسطحة):" : "Saved data summary (flat values):"}
      </p>
      <FlexibleResultsTable
        columns={keyValueColumns(isAr ? "الخاصية" : "Property", isAr ? "القيمة" : "Value")}
        rows={kvRows as Record<string, unknown>[]}
      />
    </div>
  );
}

export function renderLegacyConcreteCubeGroups(
  groups: any[],
  isAr: boolean,
  castingDate?: Date | string | null,
) {
  if (!groups?.length) return null;
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const fmtStrength = (val: string | null | undefined) => {
    if (!val) return "—";
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return (Math.round(n * 2) / 2).toFixed(1);
  };
  const calcAge = (testDate?: Date | string | null) => {
    if (!castingDate || !testDate) return null;
    const c = new Date(castingDate);
    const t = new Date(testDate);
    if (isNaN(c.getTime()) || isNaN(t.getTime())) return null;
    return Math.floor((t.getTime() - c.getTime()) / 86400000);
  };

  return (
    <div className="space-y-4">
      {groups.map((group: any) => {
        const cubes: any[] = group.cubes ?? [];
        const avg = group.avgCompressiveStrength != null ? parseFloat(group.avgCompressiveStrength) : null;
        const minAcc = group.minAcceptable != null ? parseFloat(group.minAcceptable) : null;
        const testAge = group.testAge ?? 28;

        const cubeCols: Column[] = [
          { header: L("Mark", "رقم"), field: "markNo", align: "center" },
          { header: L("Cube ID", "معرف المكعب"), field: "cubeId", align: "center", render: v => (v ? String(v) : "—") },
          { header: L("Date Tested", "تاريخ الفحص"), field: "dateTested", align: "center", render: v => (v ? formatCalendarDate(v) : "—") },
          { header: L("Age (days)", "العمر (يوم)"), field: "_age", align: "center" },
          {
            header: L("L×W×H (mm)", "الأبعاد (مم)"),
            field: "_dims",
            align: "center",
            render: (_, row) => {
              const c = row as any;
              const l = c.length ?? c.lengthMm;
              const w = c.width ?? c.widthMm;
              const h = c.height ?? c.heightMm;
              if (l && w && h) return `${l}×${w}×${h}`;
              if (l && w) return `${l}×${w}×${h ?? l}`;
              return "150×150×150";
            },
          },
          { header: L("Mass (kg)", "الكتلة (كغ)"), field: "massKg", align: "right", render: v => fmt(v, 3) },
          { header: L("Load (kN)", "الحمل (كن)"), field: "maxLoadKN", align: "right", render: v => fmt(v, 1) },
          { header: L("Density (kg/m³)", "الكثافة"), field: "densityKgM3", align: "right", render: v => (v != null && v !== "" ? String(Math.round(Number(v) / 10) * 10) : "—") },
          {
            header: L("Strength (N/mm²)", "المقاومة (N/mm²)"),
            field: "compressiveStrengthMpa",
            align: "center",
            render: v => <span className="font-bold">{fmtStrength(v as string)}</span>,
          },
          { header: L("Fracture", "الكسر"), field: "fractureType", align: "center", render: v => (v ? String(v) : "—") },
          {
            header: L("Result", "النتيجة"),
            field: "_result",
            align: "center",
            render: (_, row) => {
              const c = row as any;
              const s = parseFloat(c.compressiveStrengthMpa ?? "0");
              if (c.withinSpec === true || (s > 0 && minAcc != null && s >= minAcc)) {
                return <span className="text-emerald-800 font-bold">{L("PASS", "مطابق")}</span>;
              }
              if (c.withinSpec === false || (s > 0 && minAcc != null && s < minAcc)) {
                return <span className="text-red-800 font-bold">{L("FAIL", "غير مطابق")}</span>;
              }
              return "—";
            },
          },
        ];

        return (
          <div key={group.id} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs report-info-grid">
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
                <p className={REPORT_INFO_LABEL_CLASS}>{L("Test Age", "عمر الاختبار")}</p>
                <p className={REPORT_INFO_VALUE_CLASS}>{testAge} {L("days", "يوم")}</p>
              </div>
              {group.classOfConcrete && (
                <div className="bg-gray-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Class of Concrete", "فئة الخرسانة")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.classOfConcrete}</p>
                </div>
              )}
              {group.slump && (
                <div className="bg-gray-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Slump (mm)", "الهبوط (مم)")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.slump}</p>
                </div>
              )}
              {group.maxAggSize && (
                <div className="bg-gray-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Max Agg. Size", "أقصى حجم ركام")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.maxAggSize} mm</p>
                </div>
              )}
              {group.placeOfSampling && (
                <div className="bg-gray-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Place of Sampling", "مكان أخذ العينة")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.placeOfSampling}</p>
                </div>
              )}
              {group.sourceSupplier && (
                <div className="bg-gray-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Source / Supplier", "المورد")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.sourceSupplier}</p>
                </div>
              )}
              {castingDate && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Date of Casting", "تاريخ الصب")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{formatCalendarDate(castingDate)}</p>
                </div>
              )}
              {group.nominalCubeSize && (
                <div className="bg-slate-50 border rounded p-2 text-center">
                  <p className={REPORT_INFO_LABEL_CLASS}>{L("Nominal Cube Size", "الحجم الاسمي")}</p>
                  <p className={REPORT_INFO_VALUE_CLASS}>{group.nominalCubeSize}</p>
                </div>
              )}
            </div>

            {cubes.length > 0 && (
              <FlexibleResultsTable
                columns={cubeCols}
                rows={cubes.map((c: any, i: number) => ({
                  ...c,
                  _age: calcAge(c.dateTested) ?? testAge,
                  _dims: `${c.length ?? 150}×${c.width ?? 150}×${c.height ?? c.length ?? 150}`,
                  _result: c.withinSpec,
                  markNo: c.markNo ?? i + 1,
                }))}
              />
            )}

            {(avg != null || minAcc != null) && (
              <div className="flex flex-wrap gap-4 justify-end text-xs font-semibold">
                {avg != null && (
                  <span>
                    {L("Avg. Compressive Strength:", "متوسط مقاومة الضغط:")}{" "}
                    <span className="text-blue-800">{fmtStrength(String(avg))} N/mm²</span>
                  </span>
                )}
                {minAcc != null && (
                  <span>
                    {L("Required:", "المطلوب:")}{" "}
                    <span className="text-amber-800">{minAcc.toFixed(1)} N/mm²</span>
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderConcreteCubes(fd: any, isAr: boolean) {
  const cubes = fd.cubes ?? [];
  const castingDate = fd.castingDate ? new Date(fd.castingDate) : null;
  const ageDays = fd.sampleAgeDays;
  const specifiedStrength = fd.specifiedStrength;
  const requiredAtAge = fd.requiredAtAge;
  const avgStrength = fd.avgStrength;
  const structureType = fd.structureType;
  const classOfConcrete = fd.classOfConcrete;
  const maxAggSize = fd.maxAggSize;
  const placeOfSampling = fd.placeOfSampling;
  const batchReference = fd.batchReference;
  const curingKey = fd.curingCondition as string | undefined;
  const curingLabels: Record<string, { ar: string; en: string }> = {
    water_20c: { ar: "ماء عند 20±2°م", en: "Water at 20 ±2 °C" },
    water_lab: { ar: "ماء (معيار المختبر)", en: "Water (lab standard)" },
    site_covered: { ar: "موقع (مغطى)", en: "Site (covered)" },
    other: { ar: "أخرى", en: "Other" },
  };
  const curingLabel =
    curingKey && curingLabels[curingKey]
      ? (isAr ? curingLabels[curingKey].ar : curingLabels[curingKey].en)
      : curingKey || "—";
  const testConditionPairs = buildConcreteCubeTestConditionPairs(
    {
      moistureCondition: fd.moistureCondition,
      labCuringTemperature: fd.labCuringTemperature,
      labCuringRh: fd.labCuringRh,
      loadingRate: fd.loadingRate,
      surfaceConditionAtTest: fd.surfaceConditionAtTest,
      cappingMethod: fd.cappingMethod,
      curingConditionLabel: curingLabel !== "—" ? curingLabel : null,
    },
    isAr,
  );
  const prepPairs = buildConcreteSpecimenPrepPairs(fd, "cube", isAr, {
    curingConditionLabel: curingLabel !== "—" ? curingLabel : null,
  });
  const allConditionPairs = [...prepPairs, ...testConditionPairs];
  // Nominal cube size: from saved formData or inferred from first cube row
  const nominalCubeSize = fd.nominalCubeSize ?? (cubes.length > 0 ? `${cubes[0].cubeSize ?? 150}mm` : "150mm");
  const headers = isAr
    ? ["رقم المكعب", "الموقع", "الحجم (مم)", "الحمل (كن)", "المساحة (مم²)", "القوة الخام (N/mm²)", "القوة المصححة (N/mm²)", "النتيجة"]
    : ["Cube No.", "Location", "Size (mm)", "Load (kN)", "Area (mm²)", "Raw Str. (N/mm²)", "Corrected Str. (N/mm²)", "Result"];
  return (
    <>
      <div className="mb-4">
        <ReportInfoHeading>{isAr ? "ظروف الاختبار والتحضير" : "Test Conditions & Preparation"}</ReportInfoHeading>
        <ReportInfoPairsTable pairs={allConditionPairs} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "تاريخ الصب" : "Casting Date"}</p>
          <p className="font-bold text-blue-800">{castingDate ? formatCalendarDate(castingDate) : "—"}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "عمر العينة" : "Sample Age"}</p>
          <p className="font-bold text-blue-800">{ageDays != null ? `${ageDays} ${isAr ? "يوم" : "days"}` : "—"}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "الحجم الاسمي للمكعب" : "Nominal Cube Size"}</p>
          <p className="font-bold text-slate-800">{nominalCubeSize}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-600 font-semibold">{isAr ? "القوة المحددة (28 يوم)" : "Specified Str. (28d)"}</p>
          <p className="font-bold text-amber-800">{specifiedStrength ?? "—"} N/mm²</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-600 font-semibold">{isAr ? "القوة المطلوبة عند العمر" : "Required at Age"}</p>
          <p className="font-bold text-amber-800">{requiredAtAge ?? "—"} N/mm²</p>
        </div>
        {structureType ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "نوع الهيكل" : "Structure Type"}</p>
            <p className="font-bold text-gray-800">{structureType}</p>
          </div>
        ) : null}
        {classOfConcrete ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "درجة الخرسانة" : "Class of Concrete"}</p>
            <p className="font-bold text-gray-800">{classOfConcrete}</p>
          </div>
        ) : null}
        {maxAggSize ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "أقصى حجم للركام" : "Max. Aggregate Size"}</p>
            <p className="font-bold text-gray-800">{maxAggSize} mm</p>
          </div>
        ) : null}
        {placeOfSampling ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "مكان أخذ العينة" : "Place of Sampling"}</p>
            <p className="font-bold text-gray-800">{placeOfSampling}</p>
          </div>
        ) : null}
        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
          <p className="text-gray-600 font-semibold">{isAr ? "المعالجة" : "Curing"}</p>
          <p className="font-bold text-gray-800">{curingLabel}</p>
        </div>
        {batchReference ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "مرجع الدفعة" : "Batch ref."}</p>
            <p className="font-bold text-gray-800">{batchReference}</p>
          </div>
        ) : null}
      </div>
      <FlexibleResultsTable
        columns={[
          { header: headers[0], field: "cubeNo", align: "center", render: (v, row) => String((row as any).cubeNo ?? ((row as any)._ci + 1)) },
          { header: headers[1], field: "location", align: "center", render: (v) => String(v || "—") },
          { header: headers[2], field: "cubeSize", align: "center", render: (v) => String(v ?? 150) },
          { header: headers[3], field: "maxLoad", align: "center", render: (v) => fmt(v as string) },
          { header: headers[4], field: "area", align: "center", render: (v) => fmt(v as string, 0) },
          { header: headers[5], field: "cubeStrength", align: "center", render: (v) => fmt(v as string) },
          { header: headers[6], field: "correctedStrength", align: "center", render: (v) => <span className="font-bold">{fmt(v as string)}</span> },
          {
            header: headers[7],
            field: "result",
            align: "center",
            render: (_, row) => {
              const c = row as any;
              if (c.result === "pass") return <span className="text-emerald-800 font-bold">{isAr ? "مطابق" : "PASS"}</span>;
              if (c.result === "fail") return <span className="text-red-800 font-bold">{isAr ? "غير مطابق" : "FAIL"}</span>;
              return "—";
            },
          },
        ]}
        rows={cubes.map((c: any, i: number) => ({ ...c, _ci: i }))}
      />
      {avgStrength != null && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط القوة المصححة" : "Avg. Corrected Strength"}</p>
            <p className="font-bold text-green-800 text-lg">{fmt(avgStrength)} N/mm²</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "القوة المطلوبة" : "Required Strength"}</p>
            <p className="font-bold text-amber-800 text-lg">{requiredAtAge ?? "—"} N/mm²</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "عدد المكعبات" : "No. of Cubes"}</p>
            <p className="font-bold text-gray-800 text-lg">{cubes.filter((c: any) => c.correctedStrength).length}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function formatSummaryLabel(key: string, formTemplate: string, isAr: boolean): string {
  return formatReportSummaryLabel(key, formTemplate, isAr);
}

export function formatSummaryValue(
  key: string,
  value: unknown,
  isAr: boolean,
  formTemplate = "default",
): string {
  return formatReportSummaryValue(key, value, formTemplate, isAr, {
    formatSg: formatSgDisplay,
    formatAbsorption: formatAbsorptionDisplay,
  });
}

function sgPassFailLabel(result: string | undefined, isAr: boolean): string {
  if (result === "pass") return isAr ? "مطابق" : "PASS";
  if (result === "fail") return isAr ? "غير مطابق" : "FAIL";
  return "—";
}

function renderAggSpecificGravity(fd: any, isAr: boolean) {
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const aggType: AggSgType = fd?.aggType === "FINE" ? "FINE" : "COARSE";
  const spec = fd?.spec ?? AGG_SG_SPECS[aggType];
  const title = SG_TITLES[aggType];
  const pass = fd?.overallResult === "pass";
  const avgApparent = fd?.avgApparentSg ?? fd?.avgSg;
  const avgAbsorption = fd?.avgAbsorption;

  if (aggType === "FINE") {
    const fi = fd?.fineInput ?? {};
    const computed =
      fd?.result ??
      computeFineSg(
        fi.pycnometerH2O ?? "",
        fi.massSSD ?? "",
        fi.ssdPycH2O ?? "",
        fi.massOvenDry ?? "",
        spec,
      );
    return (
      <div className="space-y-3 text-[11px]">
        <div className="text-center border-b border-slate-300 pb-2">
          <h3 className="font-semibold text-slate-800">{isAr ? title.ar : title.en}</h3>
          <p className="text-[10px] text-slate-500">{spec.standard}</p>
          {fd?.source ? (
            <p className="text-[10px] text-slate-500">
              {L("Source:", "المصدر:")} {fd.source}
            </p>
          ) : null}
        </div>
        {(fd?.soakingDuration || fd?.dryingCondition) && (
          <div className="grid grid-cols-2 gap-2 text-xs mb-2 report-info-grid">
            {fd.soakingDuration != null && (
              <div className="bg-slate-50 border rounded p-2 text-center">
                <p className={REPORT_INFO_LABEL_CLASS}>{L("Soaking Duration", "مدة النقع")}</p>
                <p className={REPORT_INFO_VALUE_CLASS}>{fd.soakingDuration} {L("hrs", "ساعة")}</p>
              </div>
            )}
            {fd.dryingCondition && (
              <div className="bg-slate-50 border rounded p-2 text-center">
                <p className={REPORT_INFO_LABEL_CLASS}>{L("Drying Condition", "ظروف التجفيف")}</p>
                <p className={REPORT_INFO_VALUE_CLASS}>
                  {fd.dryingCondition === "oven_dry" ? L("Oven Dry (105°C)", "جاف بالفرن (105°م)") : L("Air Dry", "جاف هوائي")}
                </p>
              </div>
            )}
          </div>
        )}
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 text-start" colSpan={2}>
                {L("Test Measurements", "قياسات الاختبار")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-gray-600 w-1/2">
                {L("Pycnometer + water (g)", "كثّاف + ماء (جم)")}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">
                {fi.pycnometerH2O ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-gray-600">
                {L("Saturated and Surface dried (g)", "مشبع وجاف السطح (جم)")}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">
                {fi.massSSD ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-gray-600">
                {L("SSD + pycnometer + water (g)", "مشبع + كثّاف + ماء (جم)")}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">
                {fi.ssdPycH2O ?? "—"}
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-1 text-gray-600">
                {L("Oven Dry (g)", "جاف بالفرن (جم)")}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">
                {fi.massOvenDry ?? "—"}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1" colSpan={5}>
                {L("Particle Density, Mg/m³", "الكثافة الجسيمية Mg/m³")}
              </th>
            </tr>
            <tr className="bg-slate-50">
              <th className="border border-slate-300 px-1 py-1">OD</th>
              <th className="border border-slate-300 px-1 py-1">SSD</th>
              <th className="border border-slate-300 px-1 py-1">{L("Apparent", "ظاهرية")}</th>
              <th className="border border-slate-300 px-1 py-1">{L("Absorption %", "امتصاص %")}</th>
              <th className="border border-slate-300 px-1 py-1">{L("Result", "النتيجة")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono">
                {formatSgDisplay(computed?.bulkSgOD)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono">
                {formatSgDisplay(computed?.bulkSgSSD)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold">
                {formatSgDisplay(computed?.apparentSg)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold">
                {formatAbsorptionDisplay(computed?.absorption)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center font-semibold">
                {sgPassFailLabel(computed?.overallResult ?? fd?.overallResult, isAr)}
              </td>
            </tr>
            <tr className="bg-slate-50 text-[9px]">
              <td colSpan={2} className="border border-slate-300 px-2 py-1 font-semibold">
                {L("CMW Gen. Spec. Requirement", "متطلبات المواصفة")}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center">≥ {spec.apparentSgMin}</td>
              <td className="border border-slate-300 px-1 py-1 text-center">≤ {spec.absorptionMax}%</td>
              <td className="border border-slate-300" />
            </tr>
          </tbody>
        </table>
        <div className="flex justify-center gap-6 items-center pt-1">
          <div className="text-center">
            <p className="text-[10px] text-slate-500">{L("Average Apparent SG", "متوسط الكثافة الظاهرية")}</p>
            <p className="font-bold font-mono">{formatSgDisplay(avgApparent ?? computed?.apparentSg)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500">{L("Average Absorption", "متوسط الامتصاص")}</p>
            <p className="font-bold font-mono">
              {formatAbsorptionDisplay(avgAbsorption ?? computed?.absorption)}
            </p>
          </div>
          <p className={`font-bold text-sm ${pass ? "text-emerald-600" : "text-red-600"}`}>
            {pass ? L("PASS", "مطابق") : L("FAIL", "غير مطابق")}
          </p>
        </div>
      </div>
    );
  }

  const rows: any[] = Array.isArray(fd?.rows) ? fd.rows : [];
  const resolvedRows = rows.map((r: any) => {
    const masses = {
      ovenDry: r.massOvenDry ?? r.massDryAir ?? "",
      ssd: r.massSSD ?? "",
      inWater: r.massInWater ?? "",
    };
    const computed =
      computeCoarseSg(masses.ovenDry, masses.ssd, masses.inWater, spec) ??
      (r.apparentSg != null
        ? {
            bulkSgOD: roundSgValue(Number(r.bulkSgOD)),
            bulkSgSSD: roundSgValue(Number(r.bulkSgSSD)),
            apparentSg: roundSgValue(Number(r.apparentSg)),
            absorption: roundAbsorptionPct(Number(r.absorption)),
            overallResult: r.overallResult,
          }
        : null);
    return { ...r, ...(computed ?? {}), sampleNo: r.sampleNo ?? "—" };
  });

  return (
    <div className="space-y-3 text-[11px]">
      <div className="text-center border-b border-slate-300 pb-2">
        <h3 className="font-semibold text-slate-800">{isAr ? title.ar : title.en}</h3>
        <p className="text-[10px] text-slate-500">{spec.standard}</p>
        {fd?.source ? (
          <p className="text-[10px] text-slate-500">
            {L("Source:", "المصدر:")} {fd.source}
          </p>
        ) : null}
      </div>
      {(fd?.soakingDuration || fd?.dryingCondition) && (
        <div className="grid grid-cols-2 gap-2 text-xs mb-2 report-info-grid">
          {fd.soakingDuration != null && (
            <div className="bg-slate-50 border rounded p-2 text-center">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Soaking Duration", "مدة النقع")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.soakingDuration} {L("hrs", "ساعة")}</p>
            </div>
          )}
          {fd.dryingCondition && (
            <div className="bg-slate-50 border rounded p-2 text-center">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Drying Condition", "ظروف التجفيف")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>
                {fd.dryingCondition === "oven_dry" ? L("Oven Dry (105°C)", "جاف بالفرن (105°م)") : L("Air Dry", "جاف هوائي")}
              </p>
            </div>
          )}
        </div>
      )}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-1 py-1">{L("Sample", "العينة")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Oven Dry (g)", "جاف بالفرن (جم)")}</th>
            <th className="border border-slate-300 px-1 py-1">
              {L("Saturated & Surface dried (g)", "مشبع وجاف السطح (جم)")}
            </th>
            <th className="border border-slate-300 px-1 py-1">{L("In Water (g)", "في الماء (جم)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Bulk SG (OD)", "الكثافة الظاهرية (جاف)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Bulk SG (SSD)", "الكثافة الظاهرية (مشبع)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Apparent SG", "الكثافة الظاهرية")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Absorption (%)", "الامتصاص (%)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Result", "النتيجة")}</th>
          </tr>
        </thead>
        <tbody>
          {resolvedRows.map((r: any, i: number) => (
            <tr key={i}>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono">{r.sampleNo}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.massOvenDry ?? r.massDryAir ?? "—"}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.massSSD ?? "—"}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.massInWater ?? "—"}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono">{formatSgDisplay(r.bulkSgOD)}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono">{formatSgDisplay(r.bulkSgSSD)}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono font-bold">{formatSgDisplay(r.apparentSg)}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono font-bold">
                {formatAbsorptionDisplay(r.absorption)}
              </td>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-semibold">
                {sgPassFailLabel(r.overallResult, isAr)}
              </td>
            </tr>
          ))}
          {resolvedRows.length > 0 && (
            <tr className="bg-slate-100 font-bold">
              <td colSpan={6} className="border border-slate-300 px-2 py-1 text-end">
                {L("Average", "المتوسط")}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono">{formatSgDisplay(avgApparent)}</td>
              <td className="border border-slate-300 px-1 py-1 text-center font-mono">
                {formatAbsorptionDisplay(avgAbsorption)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-center">
                {sgPassFailLabel(fd?.overallResult, isAr)}
              </td>
            </tr>
          )}
          <tr className="bg-slate-50 text-[9px]">
            <td colSpan={6} className="border border-slate-300 px-2 py-1 font-semibold">
              {L("CMW Gen. Spec. Requirement", "متطلبات المواصفة")}
            </td>
            <td className="border border-slate-300 px-1 py-1 text-center">≥ {spec.apparentSgMin}</td>
            <td className="border border-slate-300 px-1 py-1 text-center">≤ {spec.absorptionMax}%</td>
            <td className="border border-slate-300" />
          </tr>
        </tbody>
      </table>
      <div className="flex justify-center">
        <p className={`font-bold text-sm ${pass ? "text-emerald-600" : "text-red-600"}`}>
          {pass ? L("PASS — Meets specification", "مطابق — يستوفي متطلبات المواصفة") : L("FAIL — Does not meet specification", "غير مطابق — لا يستوفي متطلبات المواصفة")}
        </p>
      </div>
    </div>
  );
}

function renderAggShapeIndex(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  if (fd?.shapeType === "ELONGATION" || fd?.elongationIndex != null) {
    const aggSize = fd.aggSize === "10mm" ? "10mm" : "20mm";
    const rows: any[] = Array.isArray(fd.rows) ? fd.rows : [];
    const idx = fd.elongationIndex ?? fd.overallIndex;
    const maxLimit = fd.maxLimit ?? 30;
    const pass = fd.overallResult === "pass";
    return (
      <div className="space-y-3 text-[11px]">
        <div className="text-center border-b border-slate-300 pb-2">
          <h3 className="font-semibold text-slate-800">
            {L("Elongation Index of Coarse Aggregate", "معامل الاستطالة للركام الخشن")}
          </h3>
          <p className="text-[10px] text-slate-500">{fd.standard ?? "BS 812 Section 105.2:1990"} | {aggSize}</p>
        </div>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-1 py-1">{L("Fraction (mm)", "الكسر (مم)")}</th>
              <th className="border border-slate-300 px-1 py-1">{L("Actual (g)", "الفعلي (جم)")}</th>
              <th className="border border-slate-300 px-1 py-1">{L("Ret. %", "محتجز %")}</th>
              <th className="border border-slate-300 px-1 py-1">{L("Elong. (g)", "مستطيل (جم)")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i}>
                <td className="border border-slate-300 px-1 py-0.5 text-center font-mono">{r.labelEn ?? r.id}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-center">{r.actualSampleG ?? "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-center">{r.retainedPct != null ? fmt(r.retainedPct, 1) : "—"}</td>
                <td className="border border-slate-300 px-1 py-0.5 text-center">{r.elongatedOriginalG ?? r.elongatedReducedG ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-center gap-6 items-center">
          <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-center">
            <p className="text-[10px] text-red-700">{L("Elongation Index", "معامل الاستطالة")}</p>
            <p className="text-xl font-bold text-red-900">{idx != null ? `${idx}%` : "—"}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500">{L("Limit Max", "الحد الأقصى")}</p>
            <p className="font-bold">{maxLimit}%</p>
          </div>
          <p className={`font-bold text-sm ${pass ? "text-emerald-600" : "text-red-600"}`}>
            {pass ? L("PASS", "ناجح") : L("FAIL", "راسب")}
          </p>
        </div>
      </div>
    );
  }
  const aggSize = fd.aggSize === "10mm" ? "10mm" : "20mm";
  const rows: any[] = Array.isArray(fd.rows) ? fd.rows : [];
  const idx = fd.flakinessIndex ?? fd.overallIndex;
  const maxLimit = fd.maxLimit ?? 25;
  const pass = fd.overallResult === "pass";
  return (
    <div className="space-y-3 text-[11px]">
      <div className="text-center border-b border-slate-300 pb-2">
        <h3 className="font-semibold text-slate-800">
          {L("Flakiness Index of Coarse Aggregate", "معامل التقشر للركام الخشن")}
        </h3>
        <p className="text-[10px] text-slate-500">{fd.standard ?? "BS 812 Section 105.1:1989"} | {aggSize}</p>
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-1 py-1">{L("Fraction (mm)", "الكسر (مم)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Actual (g)", "الفعلي (جم)")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Ret. %", "محتجز %")}</th>
            <th className="border border-slate-300 px-1 py-1">{L("Flaky (g)", "متقشر (جم)")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i}>
              <td className="border border-slate-300 px-1 py-0.5 text-center font-mono">{r.labelEn ?? r.id}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.actualSampleG ?? "—"}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.retainedPct != null ? fmt(r.retainedPct, 1) : "—"}</td>
              <td className="border border-slate-300 px-1 py-0.5 text-center">{r.flakyOriginalG ?? r.flakyReducedG ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-center gap-6 items-center">
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-center">
          <p className="text-[10px] text-red-700">{L("Flakiness Index", "معامل التقشر")}</p>
          <p className="text-xl font-bold text-red-900">{idx != null ? `${idx}%` : "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">{L("Limit Max", "الحد الأقصى")}</p>
          <p className="font-bold">{maxLimit}%</p>
        </div>
        <p className={`font-bold text-sm ${pass ? "text-emerald-600" : "text-red-600"}`}>
          {pass ? L("PASS", "ناجح") : L("FAIL", "راسب")}
        </p>
      </div>
    </div>
  );
}

function renderSteelBendRebend(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const specimens: any[] = Array.isArray(fd.specimens) ? fd.specimens : (Array.isArray(fd.rows) ? fd.rows : []);
  const spec = fd.spec ?? {};
  const band: ([string, string] | undefined)[] = [
    fd.standard ? [L("Standard / Grade", "المعيار / الدرجة"), String(fd.standard)] : undefined,
    fd.formerDiameter ? [L("Former Diameter", "قطر المحور"), String(fd.formerDiameter)] : undefined,
    fd.bendAngle != null ? [L("Bend Angle", "زاوية الثني"), `${fd.bendAngle}°`] : (spec.bendAngle != null ? [L("Bend Angle", "زاوية الثني"), `${spec.bendAngle}°`] : undefined),
    fd.testTemp ? [L("Test Temperature", "درجة الحرارة"), `${fd.testTemp}°C`] : undefined,
    fd.heatNo ? [L("Heat No.", "رقم الصهر"), String(fd.heatNo)] : undefined,
  ];
  const cols: Column[] = [
    { header: L("Sp. No.", "رقم"), field: "_i", align: "center", render: (_v, r) => String((r as any)._i + 1) },
    { header: L("Bar Size", "القطر"), field: "barSize", align: "center" },
    { header: L("Heat No.", "رقم الصهر"), field: "heatNo", align: "center", render: v => v ? String(v) : "—" },
    { header: L("Bend Result", "نتيجة الثني"), field: "bendResult", align: "center", render: v => steelResultBadge(v, isAr) },
    { header: L("Observations", "الملاحظات"), field: "observations", align: "center", render: v => v ? String(v) : "—" },
    { header: L("Overall", "النتيجة"), field: "overallResult", align: "center", render: v => steelResultBadge(v, isAr) },
  ];
  return (
    <div className="space-y-3">
      <SteelSpecBand items={band.filter(Boolean) as [string, string][]} />
      <FlexibleResultsTable columns={cols} rows={specimens.map((s, i) => ({ ...s, _i: i }))} />
    </div>
  );
}

function renderAggAcvAiv(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const variant = fd.testVariant ?? (fd.samples?.[0]?.cylinderNo != null ? "ACV" : "ACV");
  const isAIV = variant === "AIV";
  const samples: any[] = Array.isArray(fd.samples) ? fd.samples : [];
  const avgValue = fd.avgValue;
  const acceptanceLimit = fd.acceptanceLimit;
  const overallResult = fd.overallResult;

  const cols: Column[] = [
    { header: L("Sample No.", "رقم العينة"), field: "sampleNumber", align: "center" },
    { header: L("Cylinder No.", "رقم الأسطوانة"), field: "cylinderNo", align: "center", render: v => v ? String(v) : "—" },
    { header: L("Condition", "الحالة"), field: "condition", align: "center" },
    { header: L("M₁ Before (g)", "M₁ قبل (جم)"), field: "m1MassBeforeTest", align: "right", render: v => fmt(v, 1) },
    { header: L("M₂ Passing (g)", "M₂ مار (جم)"), field: "m2MassPassingSieve", align: "right", render: v => fmt(v, 1) },
    { header: isAIV ? L("AIV (%)", "AIV (%)") : L("ACV (%)", "ACV (%)"), field: "testValue", align: "center", render: v => v != null ? `${fmt(v, 1)}%` : "—" },
    { header: L("Result", "النتيجة"), field: "result", align: "center", render: v => steelResultBadge(v, isAr) },
  ];

  const titleEn = isAIV ? "Aggregate Impact Value (AIV)" : "Aggregate Crushing Value (ACV)";
  const titleAr = isAIV ? "معامل الصدم للركام (AIV)" : "معامل السحق للركام (ACV)";
  const standardEn = isAIV ? "BS 812-112" : "BS 812-110";

  return (
    <div className="space-y-3 text-xs">
      <div className="text-center border-b border-slate-300 pb-2">
        <h3 className="font-semibold">{L(titleEn, titleAr)}</h3>
        <p className="text-[10px] text-slate-500">{standardEn}</p>
      </div>
      {(fd.aggregateSource || fd.description) && (
        <div className="grid grid-cols-2 gap-2 report-info-grid">
          {fd.aggregateSource && (
            <div className="bg-slate-50 border rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Aggregate Source", "مصدر الركام")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.aggregateSource}</p>
            </div>
          )}
          {fd.description && (
            <div className="bg-slate-50 border rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Description", "الوصف")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.description}</p>
            </div>
          )}
          {acceptanceLimit != null && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Acceptance Limit", "حد القبول")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>≤ {acceptanceLimit}%</p>
            </div>
          )}
          {isAIV && (
            <div className="bg-slate-50 border rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Number of Blows", "عدد الضربات")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>15 (standard)</p>
            </div>
          )}
        </div>
      )}
      {samples.length > 0 && <FlexibleResultsTable columns={cols} rows={samples.map((s, i) => ({ ...s, _i: i }))} />}
      <div className="flex justify-end gap-4 items-center">
        {avgValue != null && (
          <span className="font-semibold text-xs">
            {L("Average:", "المتوسط:")} <span className="text-blue-800">{fmt(avgValue, 1)}%</span>
          </span>
        )}
        {overallResult && (
          <span className={`font-bold px-2 py-1 rounded text-xs ${overallResult === "pass" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {overallResult === "pass" ? L("PASS", "مطابق") : L("FAIL", "غير مطابق")}
          </span>
        )}
      </div>
    </div>
  );
}

function renderAggLAAbrasion(fd: any, isAr: boolean) {
  const L = (en: string, ars: string) => (isAr ? ars : en);
  const samples: any[] = Array.isArray(fd.samples) ? fd.samples : [];
  const avgLA = fd.avgLA;
  const acceptanceLimit = fd.acceptanceLimit;
  const overallResult = fd.overallResult;

  const cols: Column[] = [
    { header: L("Sample No.", "رقم العينة"), field: "sampleNumber", align: "center" },
    { header: L("Grading Group", "مجموعة التدريج"), field: "gradingGroup", align: "center" },
    { header: L("M₁ Before (g)", "M₁ قبل (جم)"), field: "m1BeforeTest", align: "right", render: v => fmt(v, 1) },
    { header: L("M₂ After (g)", "M₂ بعد (جم)"), field: "m2RetainedOn1_7mm", align: "right", render: v => fmt(v, 1) },
    { header: L("LA Value (%)", "معامل لوس أنجلوس (%)"), field: "laValue", align: "center", render: v => v != null ? `${fmt(v, 1)}%` : "—" },
    { header: L("Result", "النتيجة"), field: "result", align: "center", render: v => steelResultBadge(v, isAr) },
  ];

  return (
    <div className="space-y-3 text-xs">
      <div className="text-center border-b border-slate-300 pb-2">
        <h3 className="font-semibold">{L("Los Angeles Abrasion Test", "اختبار تآكل لوس أنجلوس")}</h3>
        <p className="text-[10px] text-slate-500">BS EN 1097-2 | {L("500 revolutions required", "500 دورة مطلوبة")}</p>
      </div>
      {(fd.aggregateSource || fd.description) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 report-info-grid">
          {fd.aggregateSource && (
            <div className="bg-slate-50 border rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Aggregate Source", "مصدر الركام")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.aggregateSource}</p>
            </div>
          )}
          {fd.description && (
            <div className="bg-slate-50 border rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Description", "الوصف")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>{fd.description}</p>
            </div>
          )}
          {acceptanceLimit != null && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <p className={REPORT_INFO_LABEL_CLASS}>{L("Acceptance Limit", "حد القبول")}</p>
              <p className={REPORT_INFO_VALUE_CLASS}>≤ {acceptanceLimit}%</p>
            </div>
          )}
        </div>
      )}
      {samples.length > 0 && <FlexibleResultsTable columns={cols} rows={samples.map((s, i) => ({ ...s, _i: i }))} />}
      <div className="flex justify-end gap-4 items-center">
        {avgLA != null && (
          <span className="font-semibold text-xs">
            {L("Average LA:", "متوسط LA:")} <span className="text-blue-800">{fmt(avgLA, 1)}%</span>
          </span>
        )}
        {overallResult && (
          <span className={`font-bold px-2 py-1 rounded text-xs ${overallResult === "pass" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            {overallResult === "pass" ? L("PASS", "مطابق") : L("FAIL", "غير مطابق")}
          </span>
        )}
      </div>
    </div>
  );
}

export function renderFormData(formTemplate: string, formData: any, isAr: boolean, extras?: FormReportExtras) {
  const castingDateMs = extras?.castingDateMs;
  switch (formTemplate) {
    case "concrete_cubes": return renderConcreteCubes(formData, isAr);
    case "concrete_blocks":
      try {
        return renderConcreteBlocks(formData, isAr, extras?.embedInBatch);
      } catch {
        return (
          <div className="text-xs border border-red-200 bg-red-50 rounded p-3 text-red-700">
            Report data could not be rendered. Please re-submit the test results.
          </div>
        );
      }
    case "concrete_cores": return renderConcreteCore(formData, isAr, castingDateMs, extras?.embedInBatch);
    case "concrete_beam": return renderConcreteBeam(formData, isAr, castingDateMs);
    case "steel_rebar": return renderSteelRebar(formData, isAr);
    case "steel_bend_rebend": return renderSteelBendRebend(formData, isAr);
    case "steel_structural": return renderSteelStructural(formData, isAr);
    case "steel_anchor_bolt": return renderSteelAnchorBolt(formData, isAr);
    case "sieve_analysis": return renderSieveAnalysis(formData, isAr, extras);
    case "soil_proctor": return renderSoilProctor(formData, isAr);
    case "soil_cbr": return renderSoilCBR(formData, isAr);
    case "soil_atterberg": return renderSoilAtterberg(formData, isAr);
    case "soil_field_density": return renderSoilFieldDensity(formData, isAr);
    case "asphalt_bitumen_extraction":
      return renderAsphaltBitumenExtraction(formData, isAr);
    case "asphalt_extracted_sieve":
      return renderAsphaltExtractedSieve(formData, isAr);
    case "asphalt_marshall_density":
      return renderAsphaltMarshallDensity(formData, isAr);
    case "asphalt_marshall":
      return renderAsphaltMarshall(formData, isAr);
    case "cement_setting_time": return renderCementSettingTime(formData, isAr);
    case "concrete_foam": return renderConcreteFoam(formData, isAr, extras);
    case "interlock": return renderInterlock(formData, isAr);
    case "agg_shape_index": return renderAggShapeIndex(formData, isAr);
    case "agg_specific_gravity": return renderAggSpecificGravity(formData, isAr);
    case "acv":
    case "aiv":
      return renderAggAcvAiv(formData, isAr);
    case "agg_la_abrasion":
      return renderAggLAAbrasion(formData, isAr);
    default: return renderGeneric(formData, isAr);
  }
}

// ─── Embeddable report body (single + batch) ───────────────────────────────────
export type SpecializedTestReportBodyProps = {
  dist: {
    sampleCode?: string | null;
    referenceNo?: string | null;
    receivedAt?: Date | string | null;
    retestNumber?: number | null;
    originalSampleCode?: string | null;
    contractorName?: string | null;
    contractNumber?: string | null;
    contractName?: string | null;
    sector?: string | null;
    sampleLocation?: string | null;
    castingDate?: Date | string | null;
    createdAt?: Date | string | null;
    testNameEn?: string | null;
    testNameAr?: string | null;
    testName?: string | null;
    standardRef?: string | null;
    testType?: string | null;
  } | null;
  result: {
    formTemplate: string;
    formData: unknown;
    summaryValues?: Record<string, unknown> | null;
    testTypeCode: string;
    overallResult?: string | null;
    testDate?: Date | string | null;
    contractorName?: string | null;
    projectName?: string | null;
    contractNo?: string | null;
    testedBy?: string | null;
    notes?: string | null;
    qcReviewedAt?: Date | string | null;
    managerReviewedAt?: Date | string | null;
  };
  isAr: boolean;
  /** Omits duplicate PASS badge when batch section header already shows status */
  embedInBatch?: boolean;
  testNameDisplay?: string;
  standardDisplay?: string;
  reportDateStr?: string;
  /** When set, omits the detailed results block (e.g. multi-type batchDistributionId reports) */
  skipDetailedResults?: boolean;
};

export function SpecializedTestReportBody({
  dist,
  result,
  isAr,
  embedInBatch = false,
  testNameDisplay: testNameOverride,
  standardDisplay: standardOverride,
  reportDateStr: reportDateOverride,
  skipDetailedResults = false,
}: SpecializedTestReportBodyProps) {
  const formData = (result.formData as Record<string, unknown>) ?? {};
  const summaryValues = (result.summaryValues as Record<string, unknown>) ?? {};
  const isPassed = result.overallResult === "pass";
  const reportDateStr =
    reportDateOverride ?? formatReportDate(result.qcReviewedAt ?? result.managerReviewedAt ?? null);

  const isMarshallDensityReport =
    result.formTemplate === "asphalt_marshall_density" ||
    result.testTypeCode === "ASPH_MARSHALL_DENSITY" ||
    result.testTypeCode === "DIST-2026-042";
  const isMarshallStabilityReport =
    result.formTemplate === "asphalt_marshall" ||
    result.testTypeCode === "ASPH_MARSHALL" ||
    result.testTypeCode === "DIST-2026-040";
  const testNameDisplay =
    testNameOverride ??
    (isMarshallDensityReport
      ? isAr
        ? "الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)"
        : "Bulk Specific Gravity of Compacted HMA (ASTM D 2726)"
      : isMarshallStabilityReport
        ? isAr
          ? "الثبات والتدفق لخلطة HMA (ASTM D 6927)"
          : "HMA Marshall Stability and Flow (ASTM D 6927)"
        : isAr
          ? (dist?.testNameAr ?? dist?.testName ?? result.testTypeCode)
          : (dist?.testNameEn ?? dist?.testName ?? result.testTypeCode));
  const standardDisplay =
    standardOverride ??
    resolveReportStandardDisplay({
      formData,
      dist,
      testTypeCode: result.testTypeCode,
      override: isMarshallDensityReport
        ? "ASTM D 2726"
        : isMarshallStabilityReport
          ? "ASTM D 6927"
          : null,
    });

  const summaryPairs =
    summaryValues && Object.keys(summaryValues).length > 0
      ? buildReportSummaryPairs(summaryValues, result.formTemplate, isAr, {
          formatters: {
            formatSg: formatSgDisplay,
            formatAbsorption: formatAbsorptionDisplay,
          },
        })
      : [];

  /** Batch cover + section header already show sample/ref/contractor/project/test name/standard. */
  const batchSupplementLeft: [string, string][] = [
    [isAr ? "رقم العقد" : "Contract No.", String(dist?.contractNumber ?? result.contractNo ?? "—")],
    [isAr ? "المورد" : "Source / Supplier", String(formData.source ?? formData.sourceSupplier ?? "—")],
    [isAr ? "القطاع" : "Sector", dist?.sector ? String(dist.sector).replace("_", " ").toUpperCase() : "—"],
  ];
  const batchSupplementRight: [string, string][] = [
    [isAr ? "موقع العينة" : "Sample Location", String(dist?.sampleLocation ?? "—")],
    [isAr ? "تاريخ الفحص" : "Test date", fmtDate(result.testDate)],
    [isAr ? "تاريخ التقرير" : "Report Date", reportDateStr],
  ];

  return (
    <div className={embedInBatch ? "batch-test-report-body space-y-3" : undefined}>
      {!embedInBatch && (
        <div className={`flex ${isAr ? "justify-start" : "justify-end"} mb-2`}>
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
              isPassed ? "bg-green-100 text-green-800 border border-green-300" : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {isPassed ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {isPassed
              ? isAr ? "مطابق — PASS" : "PASS — مطابق"
              : isAr ? "غير مطابق — FAIL" : "FAIL — غير مطابق"}
          </div>
        </div>
      )}

      {embedInBatch ? (
        <ReportInfoSection className="mb-3">
          <ReportDetailGrid left={batchSupplementLeft} right={batchSupplementRight} />
        </ReportInfoSection>
      ) : (
      <ReportInfoSection className="mb-3">
        <ReportReferenceBar
          items={[
            {
              label: isAr ? "رقم العينة" : "Sample No.",
              value: dist?.sampleCode ?? "—",
              extra:
                dist?.retestNumber != null ? (
                  <span className="block text-[10px] text-amber-700 mt-0.5">
                    {isAr ? `إعادة ${dist.retestNumber}` : `Retest ${dist.retestNumber}`}
                    {dist?.originalSampleCode
                      ? ` · ${isAr ? "الأصل" : "Original"}: ${dist.originalSampleCode}`
                      : ""}
                  </span>
                ) : undefined,
            },
            {
              label: inspectionRefLabel(isAr ? "ar" : "en"),
              value: formatInspectionReference(dist?.referenceNo),
            },
            {
              label: isAr ? "تاريخ الاستلام" : "Received Date",
              value: fmtDate(dist?.receivedAt),
            },
          ]}
        />
        <ReportDetailGrid
          left={[
            [isAr ? "نوع الفحص" : "Test Type", String(testNameDisplay)],
            [isAr ? "المعيار" : "Standard", standardDisplay],
            [isAr ? "المقاول" : "Contractor", String(dist?.contractorName ?? result.contractorName ?? "—")],
            [isAr ? "رقم العقد" : "Contract No.", String(dist?.contractNumber ?? result.contractNo ?? "—")],
          ]}
          right={[
            [isAr ? "اسم المشروع" : "Project Name", String(dist?.contractName ?? result.projectName ?? "—")],
            [isAr ? "القطاع" : "Sector", dist?.sector ? String(dist.sector).replace("_", " ").toUpperCase() : "—"],
            [isAr ? "موقع العينة" : "Sample Location", String(dist?.sampleLocation ?? "—")],
            [isAr ? "تاريخ الفحص" : "Test date", fmtDate(result.testDate)],
            [isAr ? "تاريخ التقرير" : "Report Date", reportDateStr],
          ]}
        />
      </ReportInfoSection>
      )}

      {!embedInBatch && summaryPairs.length > 0 && result.formTemplate !== "interlock" && (
        <div className="mb-3">
          <ReportInfoHeading>{isAr ? "ملخص النتائج" : "Summary Results"}</ReportInfoHeading>
          <ReportInfoPairsTable pairs={summaryPairs} />
        </div>
      )}

      {!skipDetailedResults && (
      <div className="mb-3">
        <ReportInfoHeading>{isAr ? "النتائج التفصيلية" : "Detailed Results"}</ReportInfoHeading>
        {renderFormData(result.formTemplate, formData, isAr, {
          castingDateMs: dist?.castingDate ? new Date(dist.castingDate).getTime() : null,
          foamReceivedAt: dist?.receivedAt ?? null,
          foamDistCreatedAt: dist?.createdAt ?? null,
          sieveReportTestedBy: result.testedBy ?? null,
          embedInBatch,
        })}
      </div>
      )}

      <div className="mb-3">
        <ReportInfoHeading>{isAr ? "ملاحظات" : "Notes"}</ReportInfoHeading>
        <p className="text-xs text-gray-700 bg-gray-50 border rounded p-3">
          {(() => {
            const userNotes = result.notes?.trim();
            const complianceNote =
              result.formTemplate === "concrete_blocks" && isPassed
                ? MASONRY_BLOCKS_COMPLIANCE_NOTE
                : result.formTemplate === "concrete_beam" && isPassed
                  ? CONCRETE_BEAM_COMPLIANCE_NOTE
                  : null;
            if (userNotes && complianceNote) {
              return (
                <>
                  {userNotes}
                  <br />
                  <br />
                  {complianceNote}
                </>
              );
            }
            if (userNotes) return userNotes;
            if (complianceNote) return complianceNote;
            return isAr ? "لا توجد ملاحظات إضافية" : "No additional remarks";
          })()}
        </p>
      </div>
    </div>
  );
}

// ─── Main Report Component ────────────────────────────────────────────────────
type SpecializedTestReportProps = {
  /** When set, loads approved report data via sector portal auth (same UI as lab). */
  sectorResultId?: number;
};

export default function SpecializedTestReport({ sectorResultId }: SpecializedTestReportProps = {}) {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang, setLang } = useLanguage();
  const ar = lang === "ar";
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);
  const isSectorMode = sectorResultId != null && sectorResultId > 0;
  const distIdFromRoute = parseInt(distributionId ?? "0");

  const { data: sectorBundle, isLoading: sectorLoading, isError: sectorError } = trpc.sector.getTestReportBundle.useQuery(
    { resultId: sectorResultId! },
    { enabled: isSectorMode }
  );

  const resolvedDistId = isSectorMode ? (sectorBundle?.result?.distributionId ?? 0) : distIdFromRoute;

  const { data: specResult, isLoading: specLoading } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: resolvedDistId },
    { enabled: !!resolvedDistId && !isSectorMode }
  );

  const { data: distFromQuery } = trpc.distributions.get.useQuery(
    { id: resolvedDistId },
    { enabled: !!resolvedDistId && !isSectorMode }
  );

  const batchDistId = isSectorMode
    ? (sectorBundle?.dist as { batchDistributionId?: string } | undefined)?.batchDistributionId
    : (distFromQuery as { batchDistributionId?: string } | undefined)?.batchDistributionId;
  const { data: batchDistsFromQuery } = trpc.distributions.getByBatch.useQuery(
    { batchDistributionId: batchDistId! },
    { enabled: !!batchDistId && !isSectorMode }
  );

  const { data: legacyFromQuery, isLoading: legacyLoading } = trpc.testResults.getByDistribution.useQuery(
    { distributionId: resolvedDistId },
    { enabled: !!resolvedDistId && !isSectorMode }
  );

  const result = isSectorMode ? sectorBundle?.result : specResult;
  const dist = isSectorMode ? sectorBundle?.dist : distFromQuery;
  const legacyResult = isSectorMode ? sectorBundle?.legacyResult : legacyFromQuery;
  const batchDists = isSectorMode ? sectorBundle?.batchDists : batchDistsFromQuery;
  const sectorBatchResults = isSectorMode ? sectorBundle?.batchResults : undefined;
  const distIdForRender = resolvedDistId;

  const pageLoading = isSectorMode ? sectorLoading : (specLoading || legacyLoading);

  // Lab-order batches (orderId + 2+ sibling distributions) are viewed at
  // /batch-report/:sampleId/:orderId via BatchOverview — no redirect from this page.
  // This route always renders the individual distribution report.

  // Block batches (shared batchDistributionId) may still consolidate below via getByBatch.
  useEffect(() => {
    if (!distIdForRender || result) return;
    const src = (legacyResult?.chartsData as { source?: string } | undefined)?.source;
    if (src === "concrete_cubes") {
      window.location.replace(`/concrete-report/${distIdForRender}`);
    }
  }, [distIdForRender, result, legacyResult]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else if (isSectorMode) {
      window.location.href = "/sector/results";
    } else {
      window.history.back();
    }
  };

  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  const handlePrint = () => printLabReport();

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `specialized-report-${distIdForRender}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (isSectorMode && sectorError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <XCircle className="text-red-400" size={40} />
        <p className="text-slate-600 font-medium">
          {isAr ? "تعذّر تحميل التقرير" : "Could not load this report."}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {isAr ? "إغلاق" : "Close"}
        </Button>
      </div>
    );
  }

  if (!result && legacyResult && (legacyResult.chartsData as { source?: string } | null)?.source === "concrete_cubes") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="animate-spin text-slate-400" size={32} />
        <p className="text-sm text-slate-500">{isAr ? "جاري فتح تقرير الخرسانة…" : "Opening concrete report…"}</p>
      </div>
    );
  }

  if (!result && !legacyResult) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <XCircle className="text-red-400" size={40} />
        <p className="text-slate-600 font-medium">
          {isAr ? "لا توجد نتائج لهذا التوزيع" : "No test results found for this distribution."}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {isAr ? "إغلاق" : "Close"}
        </Button>
      </div>
    );
  }

  // Legacy numeric test_results only (no specialized_test_results row)
  if (!result && legacyResult) {
    const lr = legacyResult as {
      average?: string | null;
      unit?: string | null;
      complianceStatus?: string | null;
      chartsData?: { values?: number[]; labels?: string[] } | null;
      testNotes?: string | null;
    };
    const cd = (lr.chartsData ?? {}) as { values?: number[]; labels?: string[] };
    const vals = Array.isArray(cd.values) ? cd.values : [];
    const labels = Array.isArray(cd.labels) ? cd.labels : vals.map((_, i) => `${isAr ? "قراءة" : "R"}${i + 1}`);
    const testNameDisplay = isAr
      ? ((dist as any)?.testNameAr ?? dist?.testName ?? "—")
      : ((dist as any)?.testNameEn ?? dist?.testName ?? "—");
    const passed = lr.complianceStatus === "pass";
    return (
      <>
        <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
          <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
            <X className="w-4 h-4" /> {isAr ? "إغلاق" : "Close"}
          </Button>
          <span className="text-sm font-medium">
            {isAr ? "تقرير الاختبار (نتيجة مسجلة)" : "Test Report (legacy)"} — {testNameDisplay}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
              onClick={() => setLang(isAr ? "en" : "ar")}
            >
              <Globe className="w-3.5 h-3.5" />
              {isAr ? "English" : "العربية"}
            </Button>
            <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
              {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isAr ? "تحميل PDF" : "Download PDF"}
            </Button>
            <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Printer className="w-4 h-4" />
              {isAr ? "طباعة / حفظ PDF" : "Print / Save PDF"}
            </Button>
          </div>
        </div>
        <div className={LAB_PRINT_CANVAS_CLASS} dir={isAr ? "rtl" : "ltr"}>
          <div
            ref={printRef}
            className={LAB_PRINT_LEGACY_CLASS}
            style={LAB_PRINT_PAGE_STYLE}
          >
            <div className="border-b-2 border-gray-900 pb-2 mb-4">
              <h1 className="text-[15px] font-extrabold">{isAr ? "تقرير نتائج الاختبار" : "Test results report"}</h1>
              <p className="text-[10px] text-gray-600 mt-1">
                {(dist as any)?.sampleCode && (
                  <span className="font-mono me-3">{isAr ? "العينة:" : "Sample:"} {(dist as any).sampleCode}</span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
              <div className="border border-gray-200 rounded p-2">
                <span className="text-gray-500">{isAr ? "المتوسط" : "Average"}</span>
                <p className="font-bold text-lg">{lr.average ?? "—"} {lr.unit ?? ""}</p>
              </div>
              <div className="border border-gray-200 rounded p-2">
                <span className="text-gray-500">{isAr ? "الامتثال" : "Compliance"}</span>
                <p className={`font-bold ${passed ? "text-green-700" : "text-red-700"}`}>
                  {lr.complianceStatus ?? "—"}
                </p>
              </div>
            </div>
            {vals.length > 0 && (
              <FlexibleResultsTable
                className="text-[10px]"
                columns={[
                  { header: "#", field: "_label", align: "center" },
                  ...labels.map((lab, i) => ({
                    header: lab,
                    field: `v${i}`,
                    align: "center" as const,
                    render: (_x: unknown, row: Record<string, unknown>) => String(row[`v${i}`] ?? ""),
                  })),
                ]}
                rows={[
                  {
                    _label: isAr ? "قيمة" : "Value",
                    ...Object.fromEntries(vals.map((v, i) => [`v${i}`, v])),
                  },
                ]}
              />
            )}
            {lr.testNotes && (
              <p className="mt-4 text-[10px] text-gray-700 whitespace-pre-wrap border-t pt-2">{lr.testNotes}</p>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!result) {
    return null;
  }

  const formData = result.formData as any ?? {};
  const reportSignatures = pickReviewSignatures([result, legacyResult]);
  const reportDateStr = formatReportDate(reportSignatures.approvedAt);
  const docNo = reportDocNo({
    distributionCode: (dist as any)?.distributionCode,
    distributionId: distIdForRender,
    receivedAt: (dist as any)?.receivedAt,
  });
  const signatureLabels = {
    tested: isAr ? "الفاحص" : "Tested By",
    reviewed: isAr ? "المراجع" : "Reviewed By",
    approved: isAr ? "المعتمد" : "Approved By",
  };
  const isMarshallDensityReport =
    result.formTemplate === "asphalt_marshall_density" ||
    result.testTypeCode === "ASPH_MARSHALL_DENSITY" ||
    result.testTypeCode === "DIST-2026-042";
  const isMarshallStabilityReport =
    result.formTemplate === "asphalt_marshall" ||
    result.testTypeCode === "ASPH_MARSHALL" ||
    result.testTypeCode === "DIST-2026-040";
  const testNameDisplay = isMarshallDensityReport
    ? isAr
      ? "الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)"
      : "Bulk Specific Gravity of Compacted HMA (ASTM D 2726)"
    : isMarshallStabilityReport
      ? isAr
        ? "الثبات والتدفق لخلطة HMA (ASTM D 6927)"
        : "HMA Marshall Stability and Flow (ASTM D 6927)"
      : isAr
        ? ((dist as any)?.testNameAr ?? dist?.testName ?? result.testTypeCode)
        : ((dist as any)?.testNameEn ?? dist?.testName ?? result.testTypeCode);
  const standardDisplay = resolveReportStandardDisplay({
    formData,
    dist: dist as { standardRef?: string | null; testType?: string | null } | null,
    testTypeCode: result.testTypeCode,
    override: isMarshallDensityReport
      ? "ASTM D 2726"
      : isMarshallStabilityReport
        ? "ASTM D 6927"
        : null,
  });

  return (
    <>
      {/* Print Controls — hidden when printing */}
      <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
        <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
          <X className="w-4 h-4" /> {isAr ? "إغلاق" : "Close"}
        </Button>
        <span className="text-sm font-medium">
          {isAr ? "تقرير الاختبار" : "Test Report"} — {testNameDisplay}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}
          >
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "English" : "العربية"}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isAr ? "تحميل PDF" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Printer className="w-4 h-4" />
            {isAr ? "طباعة / حفظ PDF" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* Report Page */}
      <div className={LAB_PRINT_CANVAS_CLASS} dir={isAr ? "rtl" : "ltr"}>
        <div
          ref={printRef}
          className={LAB_PRINT_PAGE_CLASS}
          style={LAB_PRINT_PAGE_STYLE}
        >
          <div className={LAB_PRINT_BODY_CLASS}>
          {/* Header */}
          <LabReportHeader
            lang={isAr ? "ar" : "en"}
            docNo={docNo}
            reportDate={reportDateStr}
            titlePrimary={isAr ? "تقرير نتيجة الفحص" : "Laboratory Test Report"}
            titleSecondary={isAr ? "Laboratory Test Report" : "تقرير نتيجة الفحص"}
            className="mb-3"
          />

          <SpecializedTestReportBody
            dist={dist as SpecializedTestReportBodyProps["dist"]}
            result={{
              formTemplate: result.formTemplate,
              formData: result.formData,
              summaryValues: result.summaryValues as Record<string, unknown> | null,
              testTypeCode: result.testTypeCode,
              overallResult: result.overallResult,
              testDate: result.testDate,
              contractorName: result.contractorName,
              projectName: result.projectName,
              contractNo: result.contractNo,
              testedBy: result.testedBy,
              notes: result.notes,
              qcReviewedAt: result.qcReviewedAt,
              managerReviewedAt: result.managerReviewedAt,
            }}
            isAr={isAr}
            testNameDisplay={testNameDisplay}
            standardDisplay={standardDisplay}
            reportDateStr={reportDateStr}
            skipDetailedResults={!!(batchDists && batchDists.length > 1)}
          />

          {batchDists && batchDists.length > 1 ? (
            <BatchResultsSection
              batchDists={batchDists ?? []}
              distId={distIdForRender}
              isAr={isAr}
              prefetchedBatchResults={sectorBatchResults}
            />
          ) : null}

          </div>{/* report-page-body */}

          {/* Signatures + footer — kept together at page bottom */}
          <div className={LAB_PRINT_TAIL_CLASS}>
          <ReportSignatures sig={reportSignatures} labels={signatureLabels} lang={isAr ? "ar" : "en"} />

          <div className="mt-4 pt-2 border-t border-gray-200" style={{ fontSize: "8px" }}>
            <div className="flex justify-between text-gray-400">
              <span>Construction Materials &amp; Engineering Laboratory — مختبر الإنشاءات والمواد الهندسية</span>
            </div>
            <ReportPrintNote lang={isAr ? "ar" : "en"} />
          </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── BatchResultsSection ─────────────────────────────────────────────────────
// Renders a consolidated report split by test type for batch distributions
function BatchResultsSection({
  batchDists,
  distId,
  isAr,
  prefetchedBatchResults,
}: {
  batchDists: any[];
  distId: number;
  isAr: boolean;
  prefetchedBatchResults?: any[] | null;
}) {
  const batchId = batchDists[0]?.batchDistributionId as string | undefined;
  const { data: batchResultsFromQuery } = trpc.specializedTests.getByBatch.useQuery(
    { batchId: batchId ?? "" },
    { enabled: !!batchId && !prefetchedBatchResults }
  );
  const batchResults = prefetchedBatchResults ?? batchResultsFromQuery;

  const resultByDistributionId = new Map<number, any>();
  for (const row of batchResults ?? []) {
    const tests = (row as any)?.testResults ?? [];
    for (const tr of tests) {
      if (typeof tr?.distributionId === "number") {
        resultByDistributionId.set(tr.distributionId, tr);
      }
    }
  }

  return (
    <div className="mb-5 space-y-6">
      <ReportInfoHeading>
        {isAr ? "النتائج التفصيلية — دفعة متعددة الأنواع" : "Detailed Results — Multi-Type Batch"}
      </ReportInfoHeading>
      {batchDists.map((dist, idx) => {
        const result = resultByDistributionId.get(dist.id);
        const testLabel = isAr
          ? (dist.testNameAr ?? dist.testName ?? dist.testType)
          : (dist.testNameEn ?? dist.testName ?? dist.testType);
        const fd = (result?.formData as any) ?? {};
        const template = result?.formTemplate ?? dist.testType;
        return (
          <div key={dist.id} className="border border-gray-300 rounded-lg overflow-hidden">
            {/* Sub-report header */}
            <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b border-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-800 uppercase">
                  {isAr ? `النوع ${idx + 1}:` : `Type ${idx + 1}:`} {testLabel}
                </span>
              </div>
              {result && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    result.overallResult === "pass"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {result.overallResult === "pass"
                    ? (isAr ? "✅ مطابق" : "✅ Pass")
                    : (isAr ? "❌ غير مطابق" : "❌ Fail")}
                </span>
              )}
            </div>
            <div className="p-3">
              {result ? (
                renderFormData(template, fd, isAr, {
                  foamReceivedAt: dist.receivedAt ?? null,
                  foamDistCreatedAt: dist.createdAt ?? null,
                  sieveReportTestedBy: result?.testedBy ?? null,
                })
              ) : (
                <p className="text-xs text-gray-400 italic py-2">
                  {isAr ? "لا توجد نتائج بعد لهذا النوع" : "No results yet for this type"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
