import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X, Download, Loader2, CheckCircle, XCircle } from "lucide-react";
import { generatePdfFromElement } from "@/lib/pdf";
import { formatCalendarDate, formatReportDate } from "@/lib/dateFormat";
import { ReportPrintNote } from "@/components/reports/ReportPrintNote";
import { formatInspectionReference, inspectionRefLabel } from "@/lib/inspectionReference";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  calcActualAgeDays,
  resolveBs1881AgeFactor,
  evaluateCubePass,
  evaluateGroupPass,
} from "@shared/concreteCubeBs1881";
import { ReportSignatures } from "@/components/reports/ReportSignatures";
import { LabReportHeader } from "@/components/reports/LabReportHeader";
import {
  LAB_PRINT_BODY_CLASS,
  LAB_PRINT_CANVAS_CLASS,
  LAB_PRINT_PAGE_STYLE,
  LAB_PRINT_TAIL_CLASS,
  printLabReport,
} from "@/lib/labPrintLayout";
import { buildConcreteCubeTestConditionPairs } from "@/lib/concreteCubeTestConditions";
import {
  ReportDetailGrid,
  ReportInfoHeading,
  ReportInfoPairsTable,
  ReportInfoSection,
  ReportReferenceBar,
} from "@/components/reports/ReportInfoLayout";

/** Same marker as ConcreteTest — hidden JSON suffix must never appear on printed reports. */
const AGE_META_MARKER = "\n__AGE_META__:";
function stripAgeMetaFromComments(comments: string): string {
  const i = comments.indexOf(AGE_META_MARKER);
  if (i === -1) return comments;
  return comments.slice(0, i).trimEnd();
}

/**
 * User-entered remarks from the concrete test form only (group.comments).
 * Strips persisted age metadata; hides accidental raw JSON blobs.
 */
function getUserRemarksForReport(raw: string | null | undefined): string {
  let s = stripAgeMetaFromComments(String(raw ?? "")).trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const parts: string[] = [];
        for (const k of ["remarks", "notes", "comments", "text"]) {
          const v = o[k];
          if (typeof v === "string" && v.trim()) parts.push(v.trim());
        }
        s = parts.join("\n").trim();
      }
    } catch {
      return "";
    }
  }
  return s.trim();
}

// --- Helpers ---
function fmt(val: string | null | undefined, decimals = 2): string {
  if (!val) return "";
  const n = parseFloat(val);
  return isNaN(n) ? "" : n.toFixed(decimals);
}
// Round to nearest 0.5 N/mm² (BS 1881 Part 116)
function fmtStrength(val: string | null | undefined): string {
  if (!val) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return (Math.round(n * 2) / 2).toFixed(1);
}
// Round to nearest 10 kg/m³ (BS 1881 Part 114)
function fmtDensity(val: string | null | undefined): string {
  if (!val) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return (Math.round(n / 10) * 10).toString();
}

function fmtDate(d: Date | string | null | undefined): string {
  return formatCalendarDate(d) === "—" ? "" : formatCalendarDate(d);
}

// --- Concrete compliance helpers (age-based) ---
// Concrete strength percentage guidelines (approximate):
// 1d=16%, 3d=40%, 7d=65%, 14d=90%, 28d=99%, 56d+=105%
function getRequiredStrengthReport(targetMpa: number, actualAge: number): number {
  if (actualAge <= 1)  return targetMpa * 0.16;
  if (actualAge <= 3)  return targetMpa * 0.40;
  if (actualAge <= 7)  return targetMpa * 0.65;
  if (actualAge <= 14) return targetMpa * 0.90;
  if (actualAge <= 28) return targetMpa * 0.99;
  return targetMpa * 1.05; // 56+ days
}

function getEffectiveAgeReport(actualAge: number, groupAge: number): number {
  if (actualAge <= groupAge) return groupAge;
  const milestones = [1, 3, 7, 14, 28, 56];
  for (const m of milestones) { if (actualAge <= m) return m; }
  return actualAge;
}

function getAgePctReport(age: number): number {
  if (age <= 1)  return 16;
  if (age <= 3)  return 40;
  if (age <= 7)  return 65;
  if (age <= 14) return 90;
  if (age <= 28) return 99;
  return 105;
}
// Extract target strength from classOfConcrete string e.g. "C40/20 35%OPC" → 40
function extractTargetFromClass(classStr: string | null | undefined): number | null {
  if (!classStr) return null;
  const m = classStr.match(/C(\d+)/i);
  return m ? parseFloat(m[1]) : null;
}

// ─── Single Report Page (one age group = one page) ────────────────────────────
export function ConcreteCubeReportPage({
  group,
  refNo,
  distribution,
  castingDate: distCastingDate,
  testedByName,
  managerReviewedByName,
  qcReviewedByName,
  managerNotes,
  qcNotes,
  lang,
  pageIndex,
  totalPages,
  testedSignedAt,
  managerSignedAt,
  qcSignedAt,
  embedInBatch = false,
  showSignatures,
}: {
  group: any;
  refNo: string;
  distribution?: any;
  castingDate?: Date | string | null;
  testedByName?: string | null;
  managerReviewedByName?: string | null;
  qcReviewedByName?: string | null;
  managerNotes?: string | null;
  qcNotes?: string | null;
  lang: "en" | "ar";
  pageIndex: number;
  totalPages: number;
  testedSignedAt?: Date | string | null;
  managerSignedAt?: Date | string | null;
  qcSignedAt?: Date | string | null;
  /** When true, omits lab header/footer — used inside combined batch reports */
  embedInBatch?: boolean;
  showSignatures?: boolean;
}) {
  const signaturesVisible = showSignatures ?? !embedInBatch;
  const ar = lang === "ar";
  const userRemarks = getUserRemarksForReport(group.comments);
  const remarksDisplay = userRemarks || (ar ? "لا توجد ملاحظات إضافية" : "No additional remarks");
  const cubes: any[] = group.cubes ?? [];
  const avg = group.avgCompressiveStrength ? parseFloat(group.avgCompressiveStrength) : null;
  // Use minAcceptable from DB; fallback to extracting from classOfConcrete
  const targetMpa = group.minAcceptable
    ? parseFloat(group.minAcceptable)
    : extractTargetFromClass(group.classOfConcrete);
  const testAge = group.testAge ?? 28;
  const isAutoAgeFlow = testAge === 0;
  // Casting date: prefer distribution-level castingDate (from sample), fallback to group batchDateTime
  const castingDate = distCastingDate
    ? (distCastingDate instanceof Date ? distCastingDate : String(distCastingDate))
    : (group.batchDateTime ? group.batchDateTime.split(" ")[0] : null);
  // Per-cube compliance
  const cubesWithAge = cubes.map(c => {
    const actualAge =
      castingDate && c.dateTested ? calcActualAgeDays(castingDate, c.dateTested) : null;
    const s = parseFloat(c.compressiveStrengthMpa ?? "0");

    if (isAutoAgeFlow && targetMpa != null && actualAge != null) {
      const ageFactor = resolveBs1881AgeFactor(actualAge, targetMpa);
      const cubeRequired = ageFactor.minStrengthMpa;
      const isPass =
        c.withinSpec === true
          ? true
          : c.withinSpec === false
            ? false
            : s > 0 && evaluateCubePass(s, cubeRequired);
      const isFail = c.withinSpec === true ? false : s > 0 && !isPass;
      return { ...c, actualAge, ageFactor, cubeRequired, isFail, isPass };
    }

    const effectiveAge = actualAge !== null ? getEffectiveAgeReport(actualAge, testAge) : testAge;
    const cubeRequiredEarly =
      targetMpa && testAge < 28 ? getRequiredStrengthReport(targetMpa, effectiveAge) : null;
    let autoFail = false;
    if (s > 0 && c.withinSpec !== true) {
      if (testAge >= 28 && targetMpa != null) autoFail = s < targetMpa - 4;
      else if (cubeRequiredEarly != null) autoFail = s < cubeRequiredEarly;
    }
    const isFail = c.withinSpec === true ? false : autoFail;
    const isPass =
      c.withinSpec === true
        ? true
        : s > 0
          && ((testAge >= 28 && targetMpa != null && s >= targetMpa - 4)
            || (testAge < 28 && cubeRequiredEarly != null && s >= cubeRequiredEarly));
    return { ...c, actualAge, effectiveAge, cubeRequired: cubeRequiredEarly, isFail, isPass };
  });

  const reportActualAge =
    cubesWithAge.map(c => c.actualAge).find((a): a is number => a != null) ?? null;
  const bs1881Summary =
    isAutoAgeFlow && targetMpa != null && reportActualAge != null
      ? resolveBs1881AgeFactor(reportActualAge, targetMpa)
      : null;
  const requiredMpa = isAutoAgeFlow && bs1881Summary
    ? bs1881Summary.minStrengthMpa
    : targetMpa != null && testAge >= 28
      ? targetMpa
      : targetMpa != null
        ? getRequiredStrengthReport(targetMpa, testAge)
        : null;
  const agePct = isAutoAgeFlow && bs1881Summary
    ? bs1881Summary.factorPct
    : getAgePctReport(testAge);

  const strengthsForAvg = cubes.map(c => parseFloat(c.compressiveStrengthMpa ?? "0")).filter(v => v > 0);
  const minCubeStr = strengthsForAvg.length ? Math.min(...strengthsForAvg) : null;
  const avgPass = isAutoAgeFlow && avg !== null && requiredMpa != null
    ? evaluateGroupPass(strengthsForAvg, requiredMpa)
    : avg !== null && targetMpa != null && testAge >= 28
      ? avg >= targetMpa && (minCubeStr == null || minCubeStr >= targetMpa - 4)
      : avg !== null && requiredMpa !== null
        ? avg >= requiredMpa
        : null;

  const isPassed = avgPass ?? group.complianceStatus === "pass";
  const testDate = cubes.find(c => c.dateTested)?.dateTested ?? null;
  const reportDateStr = formatReportDate(qcSignedAt);
  const testedDisplay = (testedByName ?? group.testedBy ?? "").trim() || undefined;
  const avgDisplay = avg !== null ? (Math.round(avg * 2) / 2).toFixed(1) : "—";
  const requiredDisplay = requiredMpa != null ? requiredMpa.toFixed(1) : "—";
  const ageDisplay =
    reportActualAge != null
      ? String(reportActualAge)
      : testAge > 0
        ? String(testAge)
        : "—";

  const summaryPairs: [string, string][] = [
    [ar ? "متوسط المقاومة" : "Avg. Compressive Strength", avgDisplay !== "—" ? `${avgDisplay} N/mm²` : "—"],
    [ar ? "المقاومة المطلوبة" : "Required Strength", requiredDisplay !== "—" ? `${requiredDisplay} N/mm²` : "—"],
    [ar ? "عمر الاختبار" : "Test Age", ageDisplay !== "—" ? `${ageDisplay} ${ar ? "يوم" : "days"}` : "—"],
    [ar ? "قوة التصميم (f'c)" : "Design Strength (f'c)", targetMpa != null ? `${targetMpa} N/mm²` : "—"],
    [ar ? "فئة الخرسانة" : "Class of Concrete", group.classOfConcrete ?? "—"],
    [ar ? "أقصى حجم للركام" : "Max. Aggregate Size", group.maxAggSize ? `${group.maxAggSize} mm` : "—"],
    [ar ? "مكان أخذ العينة" : "Place of Sampling", group.placeOfSampling ?? "—"],
    [ar ? "الهبوط" : "Slump", group.slump ? `${group.slump} mm` : "—"],
    [ar ? "حجم المكعب الاسمي" : "Nominal Cube Size", group.nominalCubeSize ?? "150mm"],
    [ar ? "تاريخ الصب" : "Date of Casting", fmtDate(distCastingDate ?? group.batchDateTime) || "—"],
    [ar ? "عدد العينات" : "Sample count", String(cubes.length || "—")],
  ];
  /** In batch embed, stat cards already show avg / required / test age. */
  const displaySummaryPairs = embedInBatch ? summaryPairs.slice(3) : summaryPairs;

  const detailLeft: [string, string][] = [
    [ar ? "نوع الفحص" : "Test Type", ar ? "مقاومة ضغط المكعبات الخرسانية" : "Compressive Strength of Concrete Cubes"],
    [ar ? "المعيار" : "Standard", "BS 1881 Part 114 & 116: 1983"],
    [ar ? "المقاول" : "Contractor", String(distribution?.contractorName ?? group.contractorName ?? "—")],
    [ar ? "رقم العقد" : "Contract No.", String(distribution?.contractNumber ?? group.contractNo ?? "—")],
    [ar ? "المورد" : "Source / Supplier", group.sourceSupplier ?? "—"],
  ];
  const detailRight: [string, string][] = [
    [ar ? "اسم المشروع" : "Project Name", String(distribution?.contractName ?? group.projectName ?? "—")],
    [ar ? "القطاع" : "Sector", distribution?.sector ? String(distribution.sector).replace("_", " ").toUpperCase() : "—"],
    [ar ? "موقع العينة" : "Sample Location", String(distribution?.sampleLocation ?? group.location ?? "—")],
    [ar ? "تاريخ الفحص" : "Test date", fmtDate(testDate) || "—"],
    [ar ? "تاريخ التقرير" : "Report Date", reportDateStr],
  ];
  const batchDetailLeft: [string, string][] = [
    [ar ? "رقم العقد" : "Contract No.", String(distribution?.contractNumber ?? group.contractNo ?? "—")],
    [ar ? "المورد" : "Source / Supplier", group.sourceSupplier ?? "—"],
    [ar ? "القطاع" : "Sector", distribution?.sector ? String(distribution.sector).replace("_", " ").toUpperCase() : "—"],
  ];
  const batchDetailRight: [string, string][] = [
    [ar ? "موقع العينة" : "Sample Location", String(distribution?.sampleLocation ?? group.location ?? "—")],
    [ar ? "تاريخ الفحص" : "Test date", fmtDate(testDate) || "—"],
    [ar ? "تاريخ التقرير" : "Report Date", reportDateStr],
  ];
  const testConditionPairs = buildConcreteCubeTestConditionPairs(group, ar);

  return (
    <div
      className={
        embedInBatch
          ? "batch-test-report-body space-y-5"
          : "report-page bg-white flex flex-col mx-auto shadow-lg print:shadow-none print:mx-0 print:w-full print:max-w-none print:p-0"
      }
      dir={ar ? "rtl" : "ltr"}
      style={embedInBatch ? undefined : LAB_PRINT_PAGE_STYLE}
    >
      <div className={embedInBatch ? undefined : LAB_PRINT_BODY_CLASS}>
      {!embedInBatch && (
      <div className="mb-5">
        <LabReportHeader
          lang={lang}
          docNo={refNo}
          reportDate={reportDateStr}
          titlePrimary={ar ? "تقرير نتيجة الفحص" : "Laboratory Test Report"}
          titleSecondary={ar ? "Laboratory Test Report" : "تقرير نتيجة الفحص"}
        />
        <div className={`flex ${ar ? "justify-start" : "justify-end"}`}>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${
              isPassed
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {isPassed ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {isPassed
              ? ar ? "مطابق — PASS" : "PASS — مطابق"
              : ar ? "غير مطابق — FAIL" : "FAIL — غير مطابق"}
          </div>
        </div>
      </div>
      )}
      {/* PASS badge only on standalone reports — batch section header shows status */}

      {/* Sample identification — borderless; results tables below keep borders */}
      <ReportInfoSection>
        {!embedInBatch && (
        <ReportReferenceBar
          items={[
            {
              label: ar ? "رقم العينة" : "Sample No.",
              value: distribution?.sampleCode ?? "—",
              extra:
                (distribution as { retestNumber?: number })?.retestNumber != null ? (
                  <span className="block text-[10px] text-amber-700 mt-0.5">
                    {ar
                      ? `إعادة ${(distribution as { retestNumber?: number }).retestNumber}`
                      : `Retest ${(distribution as { retestNumber?: number }).retestNumber}`}
                    {(distribution as { originalSampleCode?: string })?.originalSampleCode
                      ? ` · ${ar ? "الأصل" : "Original"}: ${(distribution as { originalSampleCode?: string }).originalSampleCode}`
                      : ""}
                  </span>
                ) : undefined,
            },
            {
              label: inspectionRefLabel(lang),
              value: formatInspectionReference((distribution as { referenceNo?: string | null })?.referenceNo),
            },
            {
              label: ar ? "تاريخ الاستلام" : "Received Date",
              value: formatCalendarDate(distribution?.receivedAt),
            },
          ]}
        />
        )}
        <ReportDetailGrid
          left={embedInBatch ? batchDetailLeft : detailLeft}
          right={embedInBatch ? batchDetailRight : detailRight}
        />
      </ReportInfoSection>

      {/* Summary Results — in batch embed, omit rows duplicated by stat cards above */}
      {displaySummaryPairs.length > 0 && (
      <div className="mb-5">
        <ReportInfoHeading>{ar ? "ملخص النتائج" : "Summary Results"}</ReportInfoHeading>
        <ReportInfoPairsTable pairs={displaySummaryPairs} />
      </div>
      )}

      {/* Test preparation & loading (BS 1881) */}
      <div className="mb-5">
        <ReportInfoHeading>{ar ? "ظروف الاختبار والتحضير" : "Test Conditions & Preparation"}</ReportInfoHeading>
        <ReportInfoPairsTable pairs={testConditionPairs} />
      </div>

      {/* Detailed Results */}
      <div className="mb-5">
        <ReportInfoHeading>{ar ? "النتائج التفصيلية" : "Detailed Results"}</ReportInfoHeading>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div
            className={`border rounded p-3 text-center ${
              isPassed ? "bg-emerald-50 border-emerald-200" : avg !== null ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
            }`}
          >
            <p className={`font-semibold ${isPassed ? "text-emerald-700" : avg !== null ? "text-red-700" : "text-gray-600"}`}>
              {ar ? "متوسط المقاومة" : "Avg. Strength"}
            </p>
            <p className={`text-xl font-bold ${isPassed ? "text-emerald-800" : avg !== null ? "text-red-800" : "text-gray-800"}`}>
              {avgDisplay !== "—" ? `${avgDisplay} N/mm²` : "—"}
            </p>
            {requiredMpa != null && (
              <p className="text-[10px] text-slate-500">
                {ar ? "المطلوب" : "Min. required"}: {requiredDisplay} N/mm²
              </p>
            )}
          </div>
          <div className="border rounded p-3 text-center bg-blue-50 border-blue-200">
            <p className="font-semibold text-blue-700">{ar ? "المقاومة المطلوبة" : "Required Strength"}</p>
            <p className="text-xl font-bold text-blue-800">{requiredDisplay !== "—" ? `${requiredDisplay} N/mm²` : "—"}</p>
            {targetMpa != null && (
              <p className="text-[10px] text-slate-500">
                {agePct}% {ar ? "من" : "of"} {targetMpa} N/mm²
              </p>
            )}
          </div>
          <div className="border rounded p-3 text-center bg-gray-50 border-gray-200">
            <p className="font-semibold text-gray-600">{ar ? "عمر الاختبار" : "Test Age"}</p>
            <p className="text-xl font-bold text-gray-800">
              {ageDisplay !== "—" ? `${ageDisplay} ${ar ? "يوم" : "days"}` : "—"}
            </p>
            <p className="text-[10px] text-slate-500">
              {ar ? "الفرق بين الصب والفحص" : "Cast date → test date"}
            </p>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-slate-700 mb-1">
          {ar ? "نتائج المكعبات" : "Cube Test Results"}
        </p>
        <table className="w-full text-[11px] border-collapse mb-2">
          <thead>
            <tr className="bg-slate-50">
              {(
                embedInBatch
                  ? [
                      ar ? "رقم" : "Mark",
                      ar ? "معرف المكعب" : "Cube ID",
                      ar ? "تاريخ الفحص" : "Date Tested",
                      ar ? "العمر (يوم)" : "Age (days)",
                      ar ? "الحمل (kN)" : "Load (kN)",
                      ar ? "المقاومة (N/mm²)" : "Strength (N/mm²)",
                      ar ? "الكسر" : "Fracture",
                    ]
                  : [
                      ar ? "رقم" : "Mark",
                      ar ? "معرف المكعب" : "Cube ID",
                      ar ? "تاريخ الفحص" : "Date Tested",
                      ar ? "العمر (يوم)" : "Age (days)",
                      ar ? "الحمل (kN)" : "Load (kN)",
                      ar ? "المقاومة (N/mm²)" : "Strength (N/mm²)",
                      ar ? "النتيجة" : "Result",
                      ar ? "الكسر" : "Fracture",
                    ]
              ).map(h => (
                <th key={h} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cubesWithAge.map((cube, i) => {
              const strength = fmtStrength(cube.compressiveStrengthMpa);
              const s = parseFloat(String(cube.compressiveStrengthMpa ?? "0"));
              const pass = cube.isPass && s > 0;
              const fail = cube.isFail && s > 0;
              return (
                <tr key={cube.id ?? i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="border border-slate-300 px-2 py-1 text-center font-mono">{cube.markNo}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center">{cube.cubeId ?? "—"}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center">{fmtDate(cube.dateTested) || "—"}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center font-semibold">
                    {cube.actualAge != null ? cube.actualAge : "—"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono">{fmt(cube.maxLoadKN, 1) || "—"}</td>
                  <td
                    className={`border border-slate-300 px-2 py-1 text-center font-bold ${
                      fail ? "text-red-800" : pass ? "text-emerald-800" : ""
                    }`}
                  >
                    {strength || "—"}
                  </td>
                  {!embedInBatch && (
                  <td className="border border-slate-300 px-2 py-1 text-center font-semibold">
                    {pass ? (
                      <span className="text-emerald-800">{ar ? "مطابق" : "PASS"}</span>
                    ) : fail ? (
                      <span className="text-red-800">{ar ? "غير مطابق" : "FAIL"}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  )}
                  <td className="border border-slate-300 px-2 py-1 text-center">{cube.fractureType ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-50">
              {[
                ar ? "الطول (مم)" : "Length (mm)",
                ar ? "العرض (مم)" : "Width (mm)",
                ar ? "الارتفاع (مم)" : "Height (mm)",
                ar ? "الكتلة (كغ)" : "Mass (kg)",
                ar ? "الكثافة (kg/m³)" : "Density (kg/m³)",
              ].map(h => (
                <th key={h} className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cubesWithAge.map((cube, i) => (
              <tr key={`dim-${cube.id ?? i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                <td className="border border-slate-300 px-2 py-1 text-center font-mono">{fmt(cube.length, 0) || "—"}</td>
                <td className="border border-slate-300 px-2 py-1 text-center font-mono">{fmt(cube.width, 0) || "—"}</td>
                <td className="border border-slate-300 px-2 py-1 text-center font-mono">{fmt(cube.height, 0) || "—"}</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-mono">{fmt(cube.massKg, 3) || "—"}</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-mono">{fmtDensity(cube.densityKgM3) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 mt-1">
          {ar
            ? "نوع الكسر: SF — مقبول، USF — غير مقبول. المقاومة محسوبة وفق BS 1881 الجزء 116."
            : "Fracture: SF — Satisfactory, USF — Unsatisfactory. Strength per BS 1881 Part 116."}
        </p>
      </div>
      </div>

      <div className={embedInBatch ? undefined : LAB_PRINT_TAIL_CLASS}>
      {/* Notes */}
      <div className="mb-5 print:mb-2">
        <ReportInfoHeading>{ar ? "ملاحظات" : "Notes"}</ReportInfoHeading>
        <p
          className={`text-xs border rounded p-3 ${
            userRemarks ? "text-gray-900 bg-gray-50" : "text-gray-900 bg-gray-50"
          }`}
        >
          {remarksDisplay}
        </p>
      </div>

      {/* Signatures */}
      {signaturesVisible && (
      <ReportSignatures
        sig={{
          testedBy: testedDisplay || null,
          testedAt: testedSignedAt ?? null,
          reviewedBy: managerReviewedByName ?? null,
          reviewedAt: managerSignedAt ?? null,
          reviewedNotes: managerNotes ?? null,
          approvedBy: qcReviewedByName ?? null,
          approvedAt: qcSignedAt ?? null,
          approvedNotes: qcNotes ?? null,
        }}
        labels={{
          tested: ar ? "الفاحص" : "Tested By",
          reviewed: ar ? "المراجع" : "Reviewed By",
          approved: ar ? "المعتمد" : "Approved By",
        }}
        lang={lang}
      />
      )}

      {!embedInBatch && (
      <div className="mt-4 pt-2 border-t border-gray-200" style={{ fontSize: "8px" }}>
        <div className="flex justify-between text-gray-900">
          <span>
            Construction Materials &amp; Engineering Laboratory — مختبر الإنشاءات والمواد الهندسية
          </span>
          {totalPages > 1 ? (
            <span>{ar ? "صفحة" : "Page"} {pageIndex + 1}/{totalPages}</span>
          ) : null}
        </div>
        <ReportPrintNote lang={lang} />
      </div>
      )}
      </div>
    </div>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────
export default function ConcreteReport() {
  const { lang } = useLanguage();
  const { distributionId } = useParams<{ distributionId: string }>();
  const distId = parseInt(distributionId ?? "0");
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  // Close this tab (opened via window.open) instead of navigating away
  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      window.history.back();
    }
  };

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: distId > 0 }
  );

  const { data: groups = [], isLoading } = trpc.concrete.groupsByDistribution.useQuery(
    { distributionId: distId },
    { enabled: distId > 0 }
  );
  const { data: testResult } = trpc.testResults.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: distId > 0 }
  );

  const handlePrint = () => printLabReport();

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `concrete-report-${refNo}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading report...</p>
      </div>
    );
  }

  const refNo = distribution?.distributionCode ?? `DIST-${distId}`;
  const distributionAny = distribution as any;
  const testResultAny = testResult as any;

  return (
    <>
      {/* Print Controls — hidden when printing */}
      <div className="print:hidden bg-gray-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-gray-700"
            onClick={handleClose}>
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <span className="text-sm text-gray-300">
            Concrete Compression Test Report — {refNo}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="outline" className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 gap-2">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className={LAB_PRINT_CANVAS_CLASS} dir={lang === "ar" ? "rtl" : "ltr"}>
        <div ref={printRef}>
        {(groups as any[]).length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No test results found. Please enter results first.
          </div>
        ) : (
          (groups as any[]).map((group: any, idx: number, arr: any[]) => (
            <div key={group.id} className={`mb-6 print:mb-0 ${idx > 0 ? "print-break-before" : ""}`}>
              <ConcreteCubeReportPage
                group={group}
                refNo={refNo}
                distribution={distributionAny}
                castingDate={distribution?.castingDate}
                testedByName={distributionAny?.technicianName ?? testResultAny?.testedBy ?? group?.testedBy}
                managerReviewedByName={testResultAny?.managerReviewedByName ?? null}
                qcReviewedByName={testResultAny?.qcReviewedByName ?? null}
                managerNotes={testResultAny?.managerNotes ?? null}
                qcNotes={testResultAny?.qcNotes ?? null}
                lang={lang}
                pageIndex={idx}
                totalPages={arr.length}
                testedSignedAt={testResultAny?.processedAt ?? null}
                managerSignedAt={testResultAny?.managerReviewedAt ?? null}
                qcSignedAt={testResultAny?.qcReviewedAt ?? null}
              />
            </div>
          ))
        )}
        </div>
      </div>
    </>
  );
}
