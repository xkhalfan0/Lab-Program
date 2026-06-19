/**
 * OrderReport.tsx — Unified bilingual printable report for a single lab order.
 * Route: /order-report/:orderId
 * Opens in a new tab; contains all tests linked to the order.
 */
import { useParams } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download, Globe, X, CheckCircle, XCircle } from "lucide-react";
import { generatePdfFromElement } from "@/lib/pdf";
import { ReportSignatures, pickReviewSignatures } from "@/components/reports/ReportSignatures";
import { formatInspectionReference } from "@/lib/inspectionReference";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(val: Date | string | null | undefined, lang: string): string {
  if (!val) return "—";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
}
function fmt(val: string | number | null | undefined, decimals = 2): string {
  if (val == null || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return String(val);
  return n.toFixed(decimals);
}
function safeText(val: unknown): string {
  if (val == null) return "—";
  if (val instanceof Date) return val.toLocaleDateString("en-GB");
  if (Array.isArray(val)) return val.map((x) => (x == null ? "—" : String(x))).join(", ");
  if (typeof val === "object") {
    const anyVal = val as any;
    if (anyVal?.name != null) return String(anyVal.name);
    if (anyVal?.label != null) return String(anyVal.label);
    try {
      return JSON.stringify(anyVal);
    } catch {
      return "—";
    }
  }
  return String(val);
}

// ─── Bilingual labels ─────────────────────────────────────────────────────────
const L = {
  title:        { ar: "تقرير الاختبارات الموحد", en: "Unified Laboratory Test Report" },
  subtitle:     { ar: "مختبر الإنشاءات والمواد الهندسية", en: "Construction Materials & Engineering Laboratory" },
  orderNo:      { ar: "رقم الطلب", en: "Order No." },
  sampleCode:   { ar: "رمز العينة", en: "Sample Code" },
  contractNo:   { ar: "رقم العقد", en: "Contract No." },
  inspectionRef: { ar: "رقم مرجع التفتيش", en: "Inspection Reference No." },
  project:      { ar: "اسم المشروع", en: "Project Name" },
  contractor:   { ar: "المقاول", en: "Contractor" },
  sampleType:   { ar: "نوع العينة", en: "Sample Type" },
  location:     { ar: "الموقع", en: "Location" },
  castingDate:  { ar: "تاريخ الصب", en: "Casting Date" },
  receivedAt:   { ar: "تاريخ الاستلام", en: "Received Date" },
  reportDate:   { ar: "تاريخ التقرير", en: "Report Date" },
  testNo:       { ar: "الاختبار", en: "Test" },
  testName:     { ar: "نوع الاختبار", en: "Test Type" },
  result:       { ar: "النتيجة", en: "Result" },
  pass:         { ar: "مطابق", en: "PASS" },
  fail:         { ar: "غير مطابق", en: "FAIL" },
  pending:      { ar: "قيد الانتظار", en: "Pending" },
  details:      { ar: "التفاصيل", en: "Details" },
  signatures:   { ar: "التوقيعات", en: "Signatures" },
  testedBy:     { ar: "الفاحص", en: "Tested By" },
  reviewedBy:   { ar: "المراجع", en: "Reviewed By" },
  approvedBy:   { ar: "المعتمد", en: "Approved By" },
  notes:        { ar: "ملاحظات", en: "Notes" },
  noResults:    { ar: "لم تُدخل نتائج بعد", en: "No results entered yet" },
  loading:      { ar: "جاري تحميل التقرير...", en: "Loading report..." },
  close:        { ar: "إغلاق", en: "Close" },
  print:        { ar: "طباعة / حفظ PDF", en: "Print / Save PDF" },
  download:     { ar: "تحميل PDF", en: "Download PDF" },
  summary:      { ar: "ملخص الاختبارات", en: "Tests Summary" },
  cubeNo:       { ar: "رقم المكعب", en: "Cube No." },
  age:          { ar: "العمر (يوم)", en: "Age (days)" },
  load:         { ar: "الحمل (كن)", en: "Load (kN)" },
  strength:     { ar: "القوة (N/mm²)", en: "Strength (N/mm²)" },
  corrected:    { ar: "المصحح (N/mm²)", en: "Corrected (N/mm²)" },
  avg:          { ar: "المتوسط", en: "Average" },
  min:          { ar: "الحد الأدنى", en: "Min. Acceptable" },
  status:       { ar: "الحالة", en: "Status" },
  sector:       { ar: "القطاع", en: "Sector" },
  docNo:        { ar: "رقم الوثيقة", en: "Document No." },
  page:         { ar: "صفحة", en: "Page" },
  of:           { ar: "من", en: "of" },
  footer:       { ar: "مختبر الإنشاءات والمواد الهندسية — جميع الحقوق محفوظة", en: "Construction Materials & Engineering Laboratory — All Rights Reserved" },
};
function t(key: keyof typeof L, lang: string): string {
  return L[key]?.[lang as "ar" | "en"] ?? key;
}

// ─── Sample type labels ───────────────────────────────────────────────────────
const SAMPLE_TYPE: Record<string, { ar: string; en: string }> = {
  concrete:   { ar: "خرسانة", en: "Concrete" },
  soil:       { ar: "تربة", en: "Soil" },
  metal:      { ar: "معدن", en: "Metal" },
  asphalt:    { ar: "أسفلت", en: "Asphalt" },
  steel:      { ar: "حديد", en: "Steel" },
  aggregates: { ar: "ركام", en: "Aggregates" },
};
function sampleTypeLabel(val: string | null | undefined, lang: string) {
  if (!val) return "—";
  return SAMPLE_TYPE[val]?.[lang as "ar" | "en"] ?? val;
}

// ─── Sector labels ────────────────────────────────────────────────────────────
const SECTOR_LABELS: Record<string, { ar: string; en: string }> = {
  sector_1: { ar: "قطاع/1", en: "Sector 1" },
  sector_2: { ar: "قطاع/2", en: "Sector 2" },
  sector_3: { ar: "قطاع/3", en: "Sector 3" },
  sector_4: { ar: "قطاع/4", en: "Sector 4" },
  sector_5: { ar: "قطاع/5", en: "Sector 5" },
};
function sectorLabel(val: string | null | undefined, lang: string) {
  if (!val) return "—";
  return SECTOR_LABELS[val]?.[lang as "ar" | "en"] ?? val;
}

// ─── Concrete Cubes Section ───────────────────────────────────────────────────
function ConcreteCubesSection({ groups, cubesByGroup, lang }: {
  groups: any[];
  cubesByGroup: Record<number, any[]>;
  lang: string;
}) {
  const isAr = lang === "ar";
  if (!groups.length) return null;
  return (
    <div className="space-y-4">
      {groups.map((group: any) => {
        const cubes: any[] = cubesByGroup[group.id] ?? [];
        const validCubes = cubes.filter((c: any) => c.compressiveStrengthMpa != null);
        const avg = group.avgCompressiveStrength ? parseFloat(group.avgCompressiveStrength) : null;
        const minAcc = group.minAcceptable ? parseFloat(group.minAcceptable) : null;
        const isPass = group.complianceStatus === "pass";
        const isFail = group.complianceStatus === "fail";
        return (
          <div key={group.id} className="border border-gray-300 rounded overflow-hidden">
            {/* Group header */}
            <div className="bg-gray-100 px-3 py-2 flex items-center justify-between border-b border-gray-300">
              <div className="text-xs font-bold text-gray-800">
                {isAr ? `عمر الاختبار: ${group.testAge} يوم` : `Test Age: ${group.testAge} days`}
                {group.classOfConcrete && <span className="ms-3 text-gray-600">| {isAr ? "فئة الخرسانة:" : "Class:"} {group.classOfConcrete}</span>}
              </div>
              {group.complianceStatus && group.complianceStatus !== "partial" && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {isPass ? t("pass", lang) : t("fail", lang)}
                </span>
              )}
            </div>
            {/* Cubes table */}
            {cubes.length > 0 && (
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{t("cubeNo", lang)}</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{isAr ? "التاريخ" : "Date Tested"}</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{isAr ? "الحجم (مم)" : "Size (mm)"}</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{t("load", lang)}</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{t("strength", lang)}</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-center">{t("result", lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {cubes.map((c: any, i: number) => {
                    const str = c.compressiveStrengthMpa ? parseFloat(c.compressiveStrengthMpa) : null;
                    const pass = minAcc != null && str != null ? str >= minAcc : c.withinSpec;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border border-gray-300 px-1.5 py-1 text-center">{c.markNo ?? (i + 1)}</td>
                        <td className="border border-gray-300 px-1.5 py-1 text-center">{fmtDate(c.dateTested, lang)}</td>
                        <td className="border border-gray-300 px-1.5 py-1 text-center">
                          {c.length && c.width ? `${fmt(c.length, 0)}×${fmt(c.width, 0)}` : "150×150"}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(c.maxLoadKN)}</td>
                        <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">{fmt(c.compressiveStrengthMpa)}</td>
                        <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold text-[9px] ${pass ? "text-green-700" : pass === false ? "text-red-600" : "text-gray-500"}`}>
                          {pass === true ? t("pass", lang) : pass === false ? t("fail", lang) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {/* Summary row */}
            {(avg != null || minAcc != null) && (
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-300 flex gap-6 text-[10px]">
                {avg != null && (
                  <span><span className="text-gray-500">{t("avg", lang)}:</span> <strong className="text-gray-900">{fmt(avg)} N/mm²</strong></span>
                )}
                {minAcc != null && (
                  <span><span className="text-gray-500">{t("min", lang)}:</span> <strong className="text-gray-900">{fmt(minAcc)} N/mm²</strong></span>
                )}
                {validCubes.length > 0 && (
                  <span><span className="text-gray-500">{isAr ? "عدد المكعبات:" : "Cubes:"}</span> <strong className="text-gray-900">{validCubes.length}</strong></span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Specialized Test Section ─────────────────────────────────────────────────
function SpecializedSection({ specResult, lang }: { specResult: any; lang: string }) {
  const isAr = lang === "ar";
  const fd = specResult.formData ?? {};
  const sv = specResult.summaryValues ?? {};
  const isPass = specResult.overallResult === "pass";
  const isFail = specResult.overallResult === "fail";

  return (
    <div className="space-y-3">
      {/* Summary values */}
      {Object.keys(sv).length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(sv).map(([k, v]) => (
            <div key={k} className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
              <p className="text-gray-500 text-[9px] mb-0.5 capitalize">{k.replace(/_/g, " ")}</p>
              <p className="font-bold text-gray-900 text-xs">{String(v)}</p>
            </div>
          ))}
        </div>
      )}
      {/* Form data — render key fields generically */}
      {Object.keys(fd).length > 0 && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-[10px] border-collapse">
            <tbody>
              {Object.entries(fd)
                .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
                .slice(0, 20)
                .map(([k, v], i) => (
                  <tr key={k} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-200 px-2 py-1 text-gray-600 capitalize w-1/3">{k.replace(/_/g, " ")}</td>
                    <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-900">{String(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Overall result */}
      {specResult.overallResult !== "pending" && (
        <div className={`rounded p-2 text-center text-xs font-bold border ${isPass ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-800"}`}>
          {isPass ? `✓ ${t("pass", lang)}` : `✗ ${t("fail", lang)}`}
        </div>
      )}
    </div>
  );
}

// ─── Legacy Test Section ──────────────────────────────────────────────────────
function LegacyTestSection({ legacyResult, dist, lang }: { legacyResult: any; dist: any; lang: string }) {
  const isAr = lang === "ar";
  const rawValues: number[] = (legacyResult.chartsData as any)?.values ?? [];
  const avg = legacyResult.average ? parseFloat(legacyResult.average) : null;
  const minVal = dist?.minAcceptable ? parseFloat(dist.minAcceptable) : null;
  const maxVal = dist?.maxAcceptable ? parseFloat(dist.maxAcceptable) : null;
  const isPass = legacyResult.complianceStatus === "pass";
  const isFail = legacyResult.complianceStatus === "fail";

  return (
    <div className="space-y-3">
      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: t("avg", lang), value: avg != null ? `${fmt(avg)} ${legacyResult.unit ?? ""}` : "—" },
          { label: isAr ? "الانحراف المعياري" : "Std Dev", value: legacyResult.stdDeviation ?? "—" },
          { label: isAr ? "نسبة الامتثال" : "Compliance", value: legacyResult.percentage ? `${fmt(legacyResult.percentage)}%` : "—" },
          { label: t("status", lang), value: isPass ? t("pass", lang) : isFail ? t("fail", lang) : t("pending", lang) },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-500 text-[9px] mb-0.5">{s.label}</p>
            <p className={`font-bold text-xs ${s.label === t("status", lang) ? (isPass ? "text-green-700" : isFail ? "text-red-700" : "text-gray-600") : "text-gray-900"}`}>{s.value}</p>
          </div>
        ))}
      </div>
      {/* Values table */}
      {rawValues.length > 0 && (
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1 text-center">#</th>
              <th className="border border-gray-300 px-2 py-1 text-center">{isAr ? "القيمة" : "Value"} ({legacyResult.unit ?? "—"})</th>
              {minVal != null && <th className="border border-gray-300 px-2 py-1 text-center">{t("min", lang)}</th>}
              <th className="border border-gray-300 px-2 py-1 text-center">{t("result", lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rawValues.map((v, i) => {
              const pass = (minVal == null || v >= minVal) && (maxVal == null || v <= maxVal);
              return (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{v}</td>
                  {minVal != null && <td className="border border-gray-300 px-2 py-1 text-center">{minVal}</td>}
                  <td className={`border border-gray-300 px-2 py-1 text-center font-bold text-[9px] ${pass ? "text-green-700" : "text-red-600"}`}>
                    {pass ? t("pass", lang) : t("fail", lang)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Test Section ─────────────────────────────────────────────────────────────
function TestSection({ item, distWithResult, lang, index }: {
  item: any;
  distWithResult: { dist: any; specResult: any; legacyResult: any; concreteGroups: any[]; cubesByGroup: Record<number, any[]> } | null;
  lang: string;
  index: number;
}) {
  const isAr = lang === "ar";
  const dist = distWithResult?.dist;
  const specResult = distWithResult?.specResult;
  const legacyResult = distWithResult?.legacyResult;
  const concreteGroups = distWithResult?.concreteGroups ?? [];
  const cubesByGroup = distWithResult?.cubesByGroup ?? {};

  // Determine overall result
  let overallResult: "pass" | "fail" | "pending" = "pending";
  if (specResult) overallResult = specResult.overallResult ?? "pending";
  else if (legacyResult) overallResult = (legacyResult.complianceStatus as any) ?? "pending";
  else if (concreteGroups.length > 0) {
    const allPass = concreteGroups.every((g: any) => g.complianceStatus === "pass");
    const anyFail = concreteGroups.some((g: any) => g.complianceStatus === "fail");
    overallResult = allPass ? "pass" : anyFail ? "fail" : "pending";
  }

  const isPass = overallResult === "pass";
  const isFail = overallResult === "fail";

  // Reviewer signatures
  const managerName = specResult?.managerReviewedByName ?? legacyResult?.managerReviewedByName ?? null;
  const managerDate = specResult?.managerReviewedAt ?? legacyResult?.managerReviewedAt ?? null;
  const qcName = specResult?.qcReviewedByName ?? legacyResult?.qcReviewedByName ?? null;
  const qcDate = specResult?.qcReviewedAt ?? legacyResult?.qcReviewedAt ?? null;
  const testedBy = specResult?.testedBy ?? concreteGroups[0]?.testedBy ?? null;

  return (
    <div className="mb-6 border border-gray-400 rounded overflow-hidden">
      {/* Section header */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold opacity-70">#{index + 1}</span>
          <span className="text-sm font-bold">{safeText(item.testTypeName)}</span>
          {item.testSubType && (
            <span className="text-xs opacity-70 bg-white/10 px-2 py-0.5 rounded">{safeText(item.testSubType)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {overallResult !== "pending" && (
            <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${isPass ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
              {isPass ? <CheckCircle size={10} /> : <XCircle size={10} />}
              {isPass ? t("pass", lang) : t("fail", lang)}
            </span>
          )}
          {item.quantity > 1 && (
            <span className="text-xs opacity-70">{isAr ? `الكمية: ${safeText(item.quantity)}` : `Qty: ${safeText(item.quantity)}`}</span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Distribution info */}
        {dist && (
          <table className="metadata-table w-full border-collapse text-[10px] mb-4 pb-3 border-b border-gray-200">
            <tbody>
              <tr>
                <td className="border border-gray-200 px-2 py-1 text-gray-500 w-[18%]">{isAr ? "رمز التوزيع" : "Distribution Code"}</td>
                <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-900 w-[32%]">{safeText(dist.distributionCode)}</td>
                <td className="border border-gray-200 px-2 py-1 text-gray-500 w-[18%]">{isAr ? "تاريخ التكليف" : "Assigned Date"}</td>
                <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-900 w-[32%]">{fmtDate(dist.createdAt, lang)}</td>
              </tr>
              {dist.standardRef ? (
                <tr>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500">{isAr ? "المعيار" : "Standard"}</td>
                  <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-900" colSpan={3}>
                    {safeText(dist.standardRef)}
                  </td>
                </tr>
              ) : null}
              {dist.notes ? (
                <tr>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500 align-top">{t("notes", lang)}</td>
                  <td className="border border-gray-200 px-2 py-1 font-semibold text-gray-900" colSpan={3}>
                    {safeText(dist.notes)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}

        {/* Test results */}
        {concreteGroups.length > 0 ? (
          <div>
            <p className="text-[10px] font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">
              {isAr ? "نتائج مكعبات الخرسانة" : "Concrete Cube Test Results"}
            </p>
            <ConcreteCubesSection groups={concreteGroups} cubesByGroup={cubesByGroup} lang={lang} />
          </div>
        ) : specResult ? (
          <div>
            <p className="text-[10px] font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">
              {isAr ? "نتائج الاختبار المتخصص" : "Specialized Test Results"}
            </p>
            <SpecializedSection specResult={specResult} lang={lang} />
          </div>
        ) : legacyResult ? (
          <div>
            <p className="text-[10px] font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">
              {isAr ? "نتائج الاختبار" : "Test Results"}
            </p>
            <LegacyTestSection legacyResult={legacyResult} dist={dist} lang={lang} />
          </div>
        ) : (
          <div className="text-center py-4 text-[10px] text-gray-400">
            {t("noResults", lang)}
          </div>
        )}

        {/* Notes */}
        {(specResult?.notes || legacyResult?.testNotes) && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-[9px] font-bold text-gray-600 uppercase mb-1">{t("notes", lang)}</p>
            <p className="text-[10px] text-gray-700 bg-gray-50 border rounded p-2">
              {safeText(specResult?.notes ?? legacyResult?.testNotes)}
            </p>
          </div>
        )}

        <ReportSignatures
          sig={{
            testedBy,
            reviewedBy: managerName,
            reviewedAt: managerDate,
            approvedBy: qcName,
            approvedAt: qcDate,
          }}
          labels={{
            tested: t("testedBy", lang),
            reviewed: t("reviewedBy", lang),
            approved: t("approvedBy", lang),
          }}
          lang={isAr ? "ar" : "en"}
          className="mt-3 pt-2 border-t border-gray-200 report-signatures-block print-no-break"
        />
      </div>
    </div>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────
export default function OrderReport() {
  const params = useParams<{ orderId?: string; id?: string }>();
  const orderId = params.orderId ?? params.id;
  const { lang, setLang } = useLanguage();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  const orderIdNum = parseInt(orderId ?? "0");
  const { data, isLoading, error } = trpc.orders.getForReport.useQuery(
    { orderId: orderIdNum },
    { enabled: orderIdNum > 0 }
  );

  const handleClose = () => {
    if (window.opener) window.close();
    else window.history.back();
  };

  const handlePrint = async () => {
    if (!printRef.current) return window.print();
    setIsPdfLoading(true);
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `order-report-${data?.order?.orderCode ?? orderIdNum}`,
      mode: "print",
    });
    if (!ok) window.print();
    setIsPdfLoading(false);
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `order-report-${data?.order?.orderCode ?? orderIdNum}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t("loading", lang)}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-red-500 text-sm">{isAr ? "تعذر تحميل التقرير" : "Failed to load report"}</p>
      </div>
    );
  }

  const { order, items, sample, distsWithResults } = data;

  // Build a map from distributionId → distWithResult
  const distMap = new Map<number, typeof distsWithResults[0]>();
  for (const dwr of distsWithResults) {
    distMap.set(dwr.dist.id, dwr);
  }

  const overallSigs = pickReviewSignatures(distsWithResults.map((d) => d.specResult ?? d.legacyResult));
  if (!overallSigs.testedBy) {
    overallSigs.testedBy =
      distsWithResults[0]?.specResult?.testedBy ??
      distsWithResults[0]?.concreteGroups?.[0]?.testedBy ??
      null;
  }

  // Overall pass/fail
  const allResults: Array<"pass" | "fail" | "pending"> = distsWithResults.map(dwr => {
    if (dwr.specResult) return (dwr.specResult.overallResult ?? "pending") as "pass" | "fail" | "pending";
    if (dwr.legacyResult) {
      const cs = dwr.legacyResult.complianceStatus;
      if (cs === "pass" || cs === "fail") return cs;
      return "pending";
    }
    if (dwr.concreteGroups.length > 0) {
      const allPass = dwr.concreteGroups.every((g: any) => g.complianceStatus === "pass");
      const anyFail = dwr.concreteGroups.some((g: any) => g.complianceStatus === "fail");
      return allPass ? "pass" : anyFail ? "fail" : "pending";
    }
    return "pending";
  });
  const hasAnyResult = allResults.some(r => r === "pass" || r === "fail");
  const overallPass = hasAnyResult && allResults.every(r => r === "pass" || r === "pending");
  const overallFail = allResults.some(r => r === "fail");
  const overallStatus = !hasAnyResult ? "pending" : overallPass ? "pass" : overallFail ? "fail" : "pending";

  return (
    <>
      {/* ── Print Controls ── */}
      <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
        <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
          <X className="w-4 h-4" /> {t("close", lang)}
        </Button>
        <span className="text-sm font-medium">
          {t("title", lang)} — {safeText(order.orderCode)}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}>
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "English" : "العربية"}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t("download", lang)}
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {t("print", lang)}
          </Button>
        </div>
      </div>

      {/* ── Report Page ── */}
      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
        <div
          ref={printRef}
          className="lab-print-root mx-auto bg-white shadow-lg print:shadow-none"
          style={{ width: "210mm", padding: "10mm 12mm 12mm 12mm", fontFamily: "Arial, sans-serif", fontSize: "10px" }}
        >
          {/* ── Header ── */}
          <div className="mb-5">
            <div className="border-t-4 border-gray-900 pt-3 flex justify-between items-center">
              <div>
                <h1 className="text-[16px] font-extrabold text-gray-900 leading-snug">
                  {isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction Materials & Engineering Laboratory"}
                </h1>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isAr ? "Construction Materials & Engineering Laboratory" : "مختبر الإنشاءات والمواد الهندسية"}
                </p>
              </div>
              <div className="flex flex-col items-center px-4 border-x border-gray-300">
                <div className="w-11 h-11 rounded-full border-2 border-gray-800 flex items-center justify-center text-lg font-black">م</div>
                <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
              </div>
              <div className="text-[11px] text-gray-600 space-y-0.5">
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? "رقم الوثيقة:" : "Doc No.:"}</span>
                  <span className="font-mono font-bold text-gray-800">{safeText(order.orderCode)}</span>
                </div>
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? "التاريخ:" : "Date:"}</span>
                  <span>{fmtDate(new Date(), lang)}</span>
                </div>
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? "عدد الاختبارات:" : "Tests:"}</span>
                  <span className="font-bold">{items.length}</span>
                </div>
              </div>
            </div>
            {/* Title bar */}
            <div className="bg-gray-900 text-white text-center py-2 mt-3 mb-4">
              <p className="text-[14px] font-bold">{t("title", lang)}</p>
              <p className="text-[10px] text-gray-300 mt-0.5 tracking-wider uppercase">
                {isAr ? "Unified Laboratory Test Report" : "تقرير الاختبارات الموحد"}
              </p>
            </div>
            {/* Overall pass/fail badge */}
            {overallStatus !== "pending" && (
              <div className={`flex ${isAr ? "justify-start" : "justify-end"} mb-3`}>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${overallStatus === "pass" ? "bg-green-100 text-green-800 border-green-300" : "bg-red-100 text-red-800 border-red-300"}`}>
                  {overallStatus === "pass" ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {overallStatus === "pass"
                    ? (isAr ? "مطابق — PASS" : "PASS — مطابق")
                    : (isAr ? "غير مطابق — FAIL" : "FAIL — غير مطابق")}
                </div>
              </div>
            )}
          </div>

          {/* ── Order Info ── */}
          <div className="border border-gray-300 rounded mb-5 overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
              <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                {isAr ? "معلومات الطلب والعينة" : "Order & Sample Information"}
              </h2>
            </div>
            <table className="metadata-table w-full border-collapse text-[10px]">
              <tbody>
                {(() => {
                  const pairs: [string, unknown][] = [
                    [t("orderNo", lang), order.orderCode],
                    [t("sampleCode", lang), order.sampleCode ?? sample?.sampleCode],
                    [t("inspectionRef", lang), formatInspectionReference(sample?.referenceNo)],
                    [t("contractNo", lang), order.contractNumber],
                    [t("project", lang), order.contractName],
                    [t("contractor", lang), order.contractorName],
                    [t("sampleType", lang), sampleTypeLabel(order.sampleType, lang)],
                    [t("location", lang), order.location ?? sample?.location],
                    [t("sector", lang), sectorLabel(sample?.sector, lang)],
                    ...(order.castingDate ? [[t("castingDate", lang), fmtDate(order.castingDate, lang)]] as [string, unknown][] : []),
                    [t("receivedAt", lang), fmtDate(sample?.receivedAt ?? order.createdAt, lang)],
                    [t("reportDate", lang), fmtDate(new Date(), lang)],
                  ];
                  const rows: typeof pairs[] = [];
                  for (let i = 0; i < pairs.length; i += 2) rows.push(pairs.slice(i, i + 2));
                  return rows.map((pair, ri) => {
                    const [a, b] = [pair[0], pair[1]];
                    return (
                      <tr key={ri}>
                        <td className="border border-gray-200 px-2 py-1.5 text-gray-500 w-[18%]">{a[0]}</td>
                        <td className="border border-gray-200 px-2 py-1.5 font-semibold text-gray-900 w-[32%]">{safeText(a[1])}</td>
                        {b ? (
                          <>
                            <td className="border border-gray-200 px-2 py-1.5 text-gray-500 w-[18%]">{b[0]}</td>
                            <td className="border border-gray-200 px-2 py-1.5 font-semibold text-gray-900 w-[32%]">{safeText(b[1])}</td>
                          </>
                        ) : (
                          <td className="border border-gray-200 px-2 py-1.5" colSpan={2} />
                        )}
                      </tr>
                    );
                  });
                })()}
                {order.notes ? (
                  <tr>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-500 align-top">{t("notes", lang)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 font-semibold text-gray-900" colSpan={3}>
                      {safeText(order.notes)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* ── Tests Summary Table ── */}
          <div className="border border-gray-300 rounded mb-5 overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
              <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wide">{t("summary", lang)}</h2>
            </div>
            <table className="metadata-table w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-2 py-1.5 text-center w-8">#</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-start">{t("testName", lang)}</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-center">{isAr ? "الكمية" : "Qty"}</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-center">{t("status", lang)}</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-center">{t("result", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => {
                  const dwr = item.distributionId ? distMap.get(item.distributionId) : null;
                  let res: "pass" | "fail" | "pending" | "partial" = "pending";
                  if (dwr?.specResult) res = dwr.specResult.overallResult ?? "pending";
                  else if (dwr?.legacyResult) res = dwr.legacyResult.complianceStatus ?? "pending";
                  else if (dwr && dwr.concreteGroups.length > 0) {
                    const ap = dwr.concreteGroups.every((g: any) => g.complianceStatus === "pass");
                    const af = dwr.concreteGroups.some((g: any) => g.complianceStatus === "fail");
                    res = ap ? "pass" : af ? "fail" : "pending";
                  }
                  return (
                    <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">{i + 1}</td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        <span className="font-semibold">{safeText(item.testTypeName)}</span>
                        {item.testSubType && <span className="text-gray-500 ms-1.5">({safeText(item.testSubType)})</span>}
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">{safeText(item.quantity)}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.status === "completed" ? "bg-green-100 text-green-700" :
                          item.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                          item.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {item.status === "completed" ? (isAr ? "مكتمل" : "Completed") :
                           item.status === "in_progress" ? (isAr ? "جارٍ" : "In Progress") :
                           item.status === "cancelled" ? (isAr ? "ملغى" : "Cancelled") :
                           (isAr ? "معلق" : "Pending")}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5 text-center">
                        {res === "pass" ? (
                          <span className="text-[9px] font-bold text-green-700">✓ {t("pass", lang)}</span>
                        ) : res === "fail" ? (
                          <span className="text-[9px] font-bold text-red-700">✗ {t("fail", lang)}</span>
                        ) : (
                          <span className="text-[9px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Detailed Test Sections ── */}
          {items.map((item: any, i: number) => {
            const dwr = item.distributionId ? distMap.get(item.distributionId) ?? null : null;
            return (
              <TestSection
                key={item.id}
                item={item}
                distWithResult={dwr}
                lang={lang}
                index={i}
              />
            );
          })}

          <ReportSignatures
            sig={overallSigs}
            labels={{
              tested: t("testedBy", lang),
              reviewed: t("reviewedBy", lang),
              approved: t("approvedBy", lang),
            }}
            lang={isAr ? "ar" : "en"}
            showTitle
            title={t("signatures", lang)}
            className="mt-4 pt-3 border-t-2 border-gray-400 report-signatures-block print-no-break"
          />

          {/* ── Footer ── */}
          <div className="mt-4 pt-2 border-t border-gray-200 flex justify-between text-gray-400" style={{ fontSize: "8px" }}>
            <span>{t("footer", lang)}</span>
            <span>{isAr ? "تاريخ الإنشاء:" : "Generated:"} {new Date().toLocaleString(isAr ? "ar-AE" : "en-GB")}</span>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </>
  );
}
