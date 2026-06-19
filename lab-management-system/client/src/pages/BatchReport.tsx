/**
 * BatchReport — Generic consolidated printable report for any multi-test batch (same sample + order)
 * URL: /batch-report/:sampleId/:orderId
 */
import { useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PassFailBadge, ResultBanner } from "@/components/PassFailBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatCalendarDate, formatReportDate } from "@/lib/dateFormat";
import { formatInspectionReference, inspectionRefLabel } from "@/lib/inspectionReference";
import { ReportPrintNote } from "@/components/reports/ReportPrintNote";
import { getOfficialTestDisplayName } from "@/lib/officialTestCatalog";
import {
  formatSummaryLabel,
  formatSummaryValue,
  renderFormData,
} from "@/pages/tests/SpecializedTestReport";
import {
  REPORT_META_LABEL_CLASS,
  REPORT_META_VALUE_CLASS,
  REPORT_REF_LABEL_CLASS,
} from "@/lib/reportFormatting";
import { ReportSignatures, pickReviewSignatures } from "@/components/reports/ReportSignatures";
import {
  Loader2,
  Printer,
  Globe,
  Download,
  ExternalLink,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

const EM_DASH = "\u2014";
const SUMMARY_SKIP_KEYS = new Set(["overallResult", "overallPass", "passesSpec"]);

/** Proctor supplies MDD/OMC only — no pass/fail; batch verdict uses CBR (and similar) tests only. */
const INFORMATIONAL_BATCH_TESTS = new Set(["SOIL_PROCTOR"]);

function isInformationalBatchTest(testType: string | null | undefined): boolean {
  return !!testType && INFORMATIONAL_BATCH_TESTS.has(testType);
}

type BatchSibling = {
  id: number;
  testType: string;
  testName: string;
  status: string;
  distributionCode?: string | null;
  testSubType?: string | null;
  specializedTestResults?: Array<{
    overallResult?: string | null;
    summaryValues?: Record<string, unknown> | null;
    formTemplate?: string | null;
    formData?: unknown;
    testedBy?: string | null;
    testDate?: string | Date | null;
    createdAt?: string | Date | null;
  }>;
  testResults?: Array<{
    complianceStatus?: string | null;
    average?: string | null;
    unit?: string | null;
  }>;
};

type ResultKind = "pass" | "fail" | "pending";

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function resolveOverallResult(sibling: BatchSibling): ResultKind {
  const spec = sibling.specializedTestResults?.[0];
  if (spec?.overallResult === "pass" || spec?.overallResult === "fail") {
    return spec.overallResult;
  }
  const legacy = sibling.testResults?.[0];
  if (legacy?.complianceStatus === "pass") return "pass";
  if (legacy?.complianceStatus === "fail") return "fail";
  if (sibling.status === "completed") return "pending";
  return "pending";
}

function resolveSummaryValues(sibling: BatchSibling): Record<string, unknown> {
  const spec = sibling.specializedTestResults?.[0];
  if (spec?.summaryValues && typeof spec.summaryValues === "object") {
    return spec.summaryValues as Record<string, unknown>;
  }
  const legacy = sibling.testResults?.[0];
  if (legacy) {
    const out: Record<string, unknown> = {};
    if (legacy.average != null && legacy.average !== "") out.average = legacy.average;
    if (legacy.unit) out.unit = legacy.unit;
    if (legacy.complianceStatus) out.compliance = legacy.complianceStatus;
    return out;
  }
  return {};
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function MarshallDensityBatchSummary({
  summaryValues,
  isAr,
}: {
  summaryValues: Record<string, unknown>;
  isAr: boolean;
}) {
  const avgAirVoids = asNumber(summaryValues.avgAirVoids);
  const avgVMA = asNumber(summaryValues.avgVMA);
  const airVoidsPass = avgAirVoids != null && avgAirVoids >= 3 && avgAirVoids <= 5;
  const vmaPass = avgVMA != null && avgVMA >= 13;

  return (
    <div>
      <h3 className="text-base font-semibold mb-2">
        {isAr
          ? "الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)"
          : "Bulk Specific Gravity of Compacted HMA (ASTM D 2726)"}
      </h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-600">{isAr ? "متوسط Gmb:" : "Avg Gmb:"}</span>
          <span className="font-semibold ml-1">{String(summaryValues.avgGmb ?? EM_DASH)}</span>
        </div>
        <div>
          <span className="text-slate-600">{isAr ? "الفراغات الهوائية:" : "% Air Voids:"}</span>
          <span className="font-semibold ml-1">
            {avgAirVoids != null ? `${avgAirVoids.toFixed(1)}%` : EM_DASH}
          </span>
          {avgAirVoids != null && (
            <span className={airVoidsPass ? "text-green-600" : "text-red-600"}>
              {airVoidsPass ? " ✓" : " ✗"}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-600">{isAr ? "VMA:" : "VMA:"}</span>
          <span className="font-semibold ml-1">{avgVMA != null ? avgVMA.toFixed(1) : EM_DASH}</span>
          {avgVMA != null && (
            <span className={vmaPass ? "text-green-600" : "text-red-600"}>
              {vmaPass ? " ✓" : " ✗"}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-600">{isAr ? "VFB:" : "VFB:"}</span>
          <span className="font-semibold ml-1">{String(summaryValues.avgVFB ?? EM_DASH)}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        {isAr ? "الحد: الفراغات الهوائية 3 - 5%، و VMA لا يقل عن 13" : "Spec: Air Voids 3 - 5%, VMA min 13"}
      </p>
    </div>
  );
}

function computeBatchStatus(passCount: number, total: number, completedCount: number) {
  if (completedCount < total) {
    return {
      kind: "incomplete" as const,
      labelEn: "INCOMPLETE",
      labelAr: `\u063a\u064a\u0631 \u0645\u0643\u062a\u0645\u0644 ${EM_DASH} INCOMPLETE`,
    };
  }
  if (passCount >= total) {
    return {
      kind: "accepted" as const,
      labelEn: "ACCEPTED",
      labelAr: `\u0645\u0642\u0628\u0648\u0644 ${EM_DASH} ACCEPTED`,
    };
  }
  if (passCount === 0) {
    return {
      kind: "rejected" as const,
      labelEn: "REJECTED",
      labelAr: `\u0645\u0631\u0641\u0648\u0636 ${EM_DASH} REJECTED`,
    };
  }
  return {
    kind: "partial" as const,
    labelEn: `PARTIAL PASS (${passCount}/${total})`,
    labelAr: `\u0646\u062c\u0627\u062d \u062c\u0632\u0626\u064a (${passCount}/${total})`,
  };
}

function BatchStatusPanel({
  status,
  passCount,
  total,
  isAr,
}: {
  status: ReturnType<typeof computeBatchStatus>;
  passCount: number;
  total: number;
  isAr: boolean;
}) {
  if (status.kind === "accepted") {
    return (
      <ResultBanner
        result="pass"
        testName={isAr ? "\u0646\u062a\u064a\u062c\u0629 \u0627\u0644\u062d\u0632\u0645\u0629 \u0627\u0644\u0643\u0644\u064a\u0629" : "Overall Batch Result"}
        lang={isAr ? "ar" : "en"}
        className="mt-4"
      />
    );
  }
  if (status.kind === "rejected") {
    return (
      <ResultBanner
        result="fail"
        testName={isAr ? "\u0646\u062a\u064a\u062c\u0629 \u0627\u0644\u062d\u0632\u0645\u0629 \u0627\u0644\u0643\u0644\u064a\u0629" : "Overall Batch Result"}
        lang={isAr ? "ar" : "en"}
        className="mt-4"
      />
    );
  }

  const palette =
    status.kind === "partial"
      ? { border: "#f59e0b", bg: "#fffbeb", Icon: AlertTriangle, text: "text-amber-800" }
      : { border: "#94a3b8", bg: "#f8fafc", Icon: AlertTriangle, text: "text-slate-700" };

  const Icon = palette.Icon;

  return (
    <div className="mt-4 p-3 border-2 rounded-lg" style={{ borderColor: palette.border, backgroundColor: palette.bg }}>
      <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <div className="shrink-0">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: palette.border }}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className={isAr ? "text-right flex-1" : "flex-1"}>
          <p className={`text-lg font-extrabold ${palette.text}`}>{isAr ? status.labelAr : status.labelEn}</p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {status.kind === "partial"
              ? isAr
                ? `${passCount} \u0645\u0646 ${total} \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0645\u0637\u0627\u0628\u0642\u0629`
                : `${passCount} of ${total} tests passed`
              : isAr
                ? `\u0627\u0643\u062a\u0645\u0644 ${passCount} \u0645\u0646 ${total} \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a`
                : `${passCount} of ${total} tests completed`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BatchReport() {
  const params = useParams<{ sampleId: string; orderId: string }>();
  const [, navigate] = useLocation();
  const { lang, setLang } = useLanguage();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  const sampleId = parseInt(params.sampleId ?? "0", 10);
  const orderId = parseInt(params.orderId ?? "0", 10);

  const { data: sample, isLoading: sampleLoading } = trpc.samples.get.useQuery(
    { id: sampleId },
    { enabled: sampleId > 0 },
  );

  const { data: siblings = [], isLoading: siblingsLoading } = trpc.distributions.getBatchSiblings.useQuery(
    { sampleId, orderId },
    { enabled: sampleId > 0 && orderId > 0 },
  );

  const { data: testTypes = [] } = trpc.testTypes.list.useQuery();

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  const sorted = useMemo(
    () => [...(siblings as BatchSibling[])].sort((a, b) => a.id - b.id),
    [siblings],
  );

  const sections = useMemo(
    () =>
      sorted.map(sibling => {
        const overallResult = resolveOverallResult(sibling);
        const summaryValues = resolveSummaryValues(sibling);
        const tt = testTypes.find(
          t =>
            t.code === sibling.testType ||
            (sibling.testType === "DIST-2026-042" && t.code === "ASPH_MARSHALL_DENSITY") ||
            (sibling.testType.startsWith("ASPH_EXTRACTED_SIEVE") && t.code === "ASPH_EXTRACTED_SIEVE"),
        );
        const catalogName = getOfficialTestDisplayName(sibling.testType, isAr ? "ar" : "en");
        return {
          sibling,
          overallResult,
          summaryValues,
          testName: catalogName ?? (isAr ? tt?.nameAr ?? tt?.nameEn ?? sibling.testName : tt?.nameEn ?? tt?.nameAr ?? sibling.testName),
          standard: tt?.standardRef ?? EM_DASH,
          formTemplate: sibling.specializedTestResults?.[0]?.formTemplate ?? null,
          formData: sibling.specializedTestResults?.[0]?.formData ?? null,
          testedBy: sibling.specializedTestResults?.[0]?.testedBy ?? undefined,
        };
      }),
    [sorted, testTypes, isAr],
  );

  const evaluatableSections = sections.filter(s => !isInformationalBatchTest(s.sibling.testType));
  const total = evaluatableSections.length;
  const completedCount = evaluatableSections.filter(s => s.sibling.status === "completed").length;
  const passCount = evaluatableSections.filter(s => s.overallResult === "pass").length;
  const batchStatus = computeBatchStatus(passCount, total, completedCount);
  const testedBy = sections.map(s => s.testedBy).find(Boolean);
  const batchSignatures = useMemo(() => {
    const sig = pickReviewSignatures(sections.flatMap(s => s.sibling.specializedTestResults ?? []));
    if (!sig.testedBy && testedBy) sig.testedBy = testedBy;
    return sig;
  }, [sections, testedBy]);
  const signatureLabels = {
    tested: isAr ? "الفاحص" : "Tested By",
    reviewed: isAr ? "المراجع" : "Reviewed By",
    approved: isAr ? "المعتمد" : "Approved By",
  };
  const reportDateStr = formatReportDate(batchSignatures.approvedAt);

  const isLoading = sampleLoading || siblingsLoading;

  const handleClose = () => {
    if (window.opener) window.close();
    else navigate(`/batch/${sampleId}/${orderId}`);
  };

  const handlePrint = async () => {
    if (!printRef.current) return window.print();
    setIsPdfLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `batch-report-${sample?.sampleCode ?? sampleId}-order-${orderId}`,
      mode: "print",
    });
    if (!ok) window.print();
    setIsPdfLoading(false);
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `batch-report-${sample?.sampleCode ?? sampleId}-order-${orderId}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="print:hidden bg-slate-800 text-white px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
            <ArrowLeft className="w-4 h-4" />
            {isAr ? "\u0625\u063a\u0644\u0627\u0642" : "Close"}
          </Button>
        </div>
        <span className="text-sm font-medium hidden sm:inline">
          {isAr ? "\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062d\u0632\u0645\u0629" : "Batch Report"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}
          >
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "EN" : "\u0639\u0631"}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isDownloadLoading}
            variant="ghost"
            className="text-white hover:bg-slate-700 gap-1.5"
          >
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {isAr ? "\u0637\u0628\u0627\u0639\u0629" : "Print"}
          </Button>
        </div>
      </div>

      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
        {isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : total === 0 ? (
          <Card className="max-w-lg mx-auto">
            <CardContent className="py-10 text-center text-slate-600">
              {isAr ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u062d\u0632\u0645\u0629." : "No tests found in this batch."}
            </CardContent>
          </Card>
        ) : (
          <div
            ref={printRef}
            className="lab-print-root mx-auto bg-white shadow-lg print:shadow-none"
            style={{
              width: "210mm",
              padding: "10mm 12mm 12mm 12mm",
              fontFamily: "Arial, sans-serif",
              fontSize: "10px",
            }}
          >
            <div className="mb-5">
              <div className="border-t-4 border-gray-900 pt-3 flex justify-between items-center gap-3">
                <div>
                  <h1 className="text-[16px] font-extrabold text-gray-900 leading-snug">
                    {isAr
                      ? "\u0645\u062e\u062a\u0628\u0631 \u0627\u0644\u0625\u0646\u0634\u0627\u0621\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0627\u062f \u0627\u0644\u0647\u0646\u062f\u0633\u064a\u0629"
                      : "Construction Materials & Engineering Laboratory"}
                  </h1>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {isAr
                      ? "Construction Materials & Engineering Laboratory"
                      : "\u0645\u062e\u062a\u0628\u0631 \u0627\u0644\u0625\u0646\u0634\u0627\u0621\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0627\u062f \u0627\u0644\u0647\u0646\u062f\u0633\u064a\u0629"}
                  </p>
                </div>
                <div className="flex flex-col items-center px-4 border-x border-gray-300 shrink-0">
                  <div className="w-11 h-11 rounded-full border-2 border-gray-800 flex items-center justify-center text-lg font-black">
                    {"\u0645"}
                  </div>
                  <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
                </div>
                <div className="text-[11px] text-gray-600 space-y-0.5 text-end">
                  <div className="flex gap-1 justify-end">
                    <span className="text-gray-500">{isAr ? ":\u0627\u0644\u062a\u0627\u0631\u064a\u062e" : "Date:"}</span>
                    <span>{reportDateStr}</span>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <span className="text-gray-500">{isAr ? ":\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628" : "Order:"}</span>
                    <span className="font-mono font-bold">{orderId}</span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-900 text-white text-center py-2 mt-3 mb-2">
                <p className="text-[14px] font-bold">
                  {isAr ? "\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062d\u0632\u0645\u0629 \u0627\u0644\u0645\u062c\u0645\u0639" : "Combined Batch Test Report"}
                </p>
                <p className="text-[10px] text-gray-300 mt-0.5">
                  {isAr ? `${total} \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a` : `${total} tests`}
                </p>
              </div>
              <BatchStatusPanel status={batchStatus} passCount={passCount} total={total} isAr={isAr} />
            </div>

            <div className="border border-gray-200 rounded mb-5 overflow-hidden">
              <table className="metadata-table w-full border-collapse text-xs bg-gray-50">
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-2 py-2 text-center w-1/4">
                      <span className={REPORT_REF_LABEL_CLASS}>
                        {isAr ? "\u0631\u0642\u0645 \u0627\u0644\u0639\u064a\u0646\u0629" : "Sample No."}
                      </span>
                      <span className="font-mono font-bold text-sm">{sample?.sampleCode ?? EM_DASH}</span>
                    </td>
                    <td className="border border-gray-200 px-2 py-2 text-center w-1/4">
                      <span className={REPORT_REF_LABEL_CLASS}>
                        {inspectionRefLabel(isAr ? "ar" : "en")}
                      </span>
                      <span className="font-mono font-bold text-sm">{formatInspectionReference(sample?.referenceNo)}</span>
                    </td>
                    <td className="border border-gray-200 px-2 py-2 text-center w-1/4">
                      <span className={REPORT_REF_LABEL_CLASS}>
                        {isAr ? "\u0627\u0644\u0645\u0642\u0627\u0648\u0644" : "Contractor"}
                      </span>
                      <span className="font-semibold text-[11px]">{sample?.contractorName ?? EM_DASH}</span>
                    </td>
                    <td className="border border-gray-200 px-2 py-2 text-center w-1/4">
                      <span className={REPORT_REF_LABEL_CLASS}>
                        {isAr ? "\u0627\u0644\u0645\u0634\u0631\u0648\u0639" : "Project"}
                      </span>
                      <span className="font-semibold text-[11px]">{sample?.contractName ?? EM_DASH}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-5 space-y-4">
              <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1">
                {isAr ? "\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a" : "Test Results"}
              </h3>

              {sections.map(({ sibling, overallResult, summaryValues, testName, standard, formTemplate, formData }, index) => {
                const summaryEntries = Object.entries(summaryValues).filter(
                  ([k, v]) => !SUMMARY_SKIP_KEYS.has(k) && v != null && v !== "" && typeof v !== "object",
                );
                const hasDetailedForm =
                  sibling.status === "completed" &&
                  !!formTemplate &&
                  formData != null &&
                  typeof formData === "object";
                const isMarshallDensity =
                  formTemplate === "asphalt_marshall_density" ||
                  sibling.testType === "ASPH_MARSHALL_DENSITY" ||
                  sibling.testType === "DIST-2026-042";
                const hasReport =
                  sibling.status === "completed" &&
                  (sibling.specializedTestResults?.length || sibling.testResults?.length);

                return (
                  <div
                    key={sibling.id}
                    className={`border border-gray-300 rounded overflow-hidden ${index > 0 ? "print:break-before-page" : ""}`}
                  >
                    <div className="bg-slate-100 border-b border-gray-300 px-3 py-2 flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <h2 className="text-[12px] font-bold text-gray-900">
                          {index + 1}. {testName}
                        </h2>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          {isAr ? "\u0627\u0644\u0645\u0639\u064a\u0627\u0631" : "Standard"}: {standard}
                        </p>
                      </div>
                      {isInformationalBatchTest(sibling.testType) ? (
                        sibling.status === "completed" ? (
                          <span className="inline-flex items-center rounded-full text-xs px-2 py-0.5 font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                            {isAr ? "مكتمل" : "DONE"}
                          </span>
                        ) : (
                          <PassFailBadge result="pending" size="sm" lang={isAr ? "ar" : "en"} />
                        )
                      ) : (
                        <PassFailBadge result={overallResult} size="sm" lang={isAr ? "ar" : "en"} />
                      )}
                    </div>
                    <div className="p-3 space-y-3">
                      {isMarshallDensity && summaryEntries.length > 0 ? (
                        <MarshallDensityBatchSummary summaryValues={summaryValues} isAr={isAr} />
                      ) : summaryEntries.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase">
                            {isAr ? "\u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629" : "Key results"}
                          </p>
                          <table className="metadata-table w-full border-collapse text-xs">
                            <tbody>
                              {(() => {
                                const rows: Array<typeof summaryEntries> = [];
                                for (let i = 0; i < summaryEntries.length; i += 2) {
                                  rows.push(summaryEntries.slice(i, i + 2));
                                }
                                return rows.map((pair, ri) => {
                                  const [a, b] = [pair[0], pair[1]];
                                  return (
                                    <tr key={ri}>
                                      <td className={REPORT_META_LABEL_CLASS}>
                                        {formatSummaryLabel(a[0], formTemplate ?? "", isAr)}
                                      </td>
                                      <td className={`${REPORT_META_VALUE_CLASS} font-bold`}>
                                        {formatSummaryValue(a[0], a[1], isAr, formTemplate ?? "")}
                                      </td>
                                      {b ? (
                                        <>
                                          <td className={REPORT_META_LABEL_CLASS}>
                                            {formatSummaryLabel(b[0], formTemplate ?? "", isAr)}
                                          </td>
                                          <td className={`${REPORT_META_VALUE_CLASS} font-bold`}>
                                            {formatSummaryValue(b[0], b[1], isAr, formTemplate ?? "")}
                                          </td>
                                        </>
                                      ) : (
                                        <td className="border border-gray-200 px-2 py-1" colSpan={2} />
                                      )}
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-500 italic">
                          {sibling.status === "completed"
                            ? isAr
                              ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u064a\u0645 \u0645\u0644\u062e\u0635\u0629 \u0645\u062d\u0641\u0648\u0638\u0629."
                              : "No summary values recorded."
                            : isAr
                              ? "\u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0644\u0645 \u064a\u0643\u062a\u0645\u0644 \u0628\u0639\u062f."
                              : "Test not yet completed."}
                        </p>
                      )}

                      {hasDetailedForm && (
                        <div className="pt-1 border-t border-gray-200">
                          <p className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase">
                            {isAr ? "\u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a\u0629" : "Detailed results"}
                          </p>
                          {renderFormData(formTemplate as string, formData, isAr, {
                            sieveReportTestedBy: sibling.specializedTestResults?.[0]?.testedBy ?? null,
                          })}
                        </div>
                      )}

                      {hasReport && (
                        <a
                          href={`/test-report/${sibling.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="print:hidden inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 hover:text-blue-900"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {isAr ? "\u0639\u0631\u0636 \u0627\u0644\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a" : "View detailed individual report"}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <ReportSignatures sig={batchSignatures} labels={signatureLabels} lang={isAr ? "ar" : "en"} />

            <div
              className="mt-4 pt-2 border-t border-gray-200"
              style={{ fontSize: "8px" }}
            >
              <div className="flex justify-between text-gray-400">
                <span>
                  Construction Materials &amp; Engineering Laboratory {EM_DASH}{" "}
                  {"\u0645\u062e\u062a\u0628\u0631 \u0627\u0644\u0625\u0646\u0634\u0627\u0621\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0627\u062f \u0627\u0644\u0647\u0646\u062f\u0633\u064a\u0629"}
                </span>
              </div>
              <ReportPrintNote lang={isAr ? "ar" : "en"} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          .print\\:break-before-page { break-before: page; page-break-before: always; }
        }
      `}</style>
    </DashboardLayout>
  );
}
