/**
 * AsphaltMixBatchReport - Combined printable report for the 4-test asphalt mix batch
 * URL: /test-report/:distributionId (when all batch siblings are completed)
 */
import { useParams } from "wouter";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Printer, X, CheckCircle, XCircle, Globe, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlexibleResultsTable, type Column } from "@/components/reports/FlexibleResultsTable";
import { formatCalendarDate } from "@/lib/dateFormat";
import { renderFormData } from "./SpecializedTestReport";

const EM_DASH = "\u2014";
const NDASH = "\u2014";

function fmt(v: unknown, dec = 2): string {
  if (v === null || v === undefined || v === "") return NDASH;
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toFixed(dec);
}

const BATCH_ORDER: {
  code: string;
  titleEn: string;
  titleAr: string;
  template: string;
  standardEn: string;
  standardAr: string;
}[] = [
  {
    code: "ASPH_BITUMEN_EXTRACT",
    titleEn: `Section 1 ${EM_DASH} Bitumen Extraction`,
    titleAr: `\u0627\u0644\u0642\u0633\u0645 1 ${EM_DASH} \u0627\u0633\u062a\u062e\u0644\u0627\u0635 \u0627\u0644\u0628\u064a\u062a\u0648\u0645\u064a\u0646`,
    template: "asphalt_bitumen_extraction",
    standardEn: "BS EN 12697-1 / ASTM D2172",
    standardAr: "BS EN 12697-1 / ASTM D2172",
  },
  {
    code: "ASPH_EXTRACTED_SIEVE",
    titleEn: `Section 2 ${EM_DASH} Sieve Analysis (Extracted Aggregate)`,
    titleAr: `\u0627\u0644\u0642\u0633\u0645 2 ${EM_DASH} \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u0646\u0627\u062e\u0644 (\u0627\u0644\u0631\u0643\u0627\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u0644\u0635)`,
    template: "asphalt_extracted_sieve",
    standardEn: "BS EN 12697-2 / ASTM D5444",
    standardAr: "BS EN 12697-2 / ASTM D5444",
  },
  {
    code: "ASPH_MARSHALL_DENSITY",
    titleEn: `Section 3 ${EM_DASH} Marshall Bulk Density (Gmb)`,
    titleAr: `\u0627\u0644\u0642\u0633\u0645 3 ${EM_DASH} \u0643\u062b\u0627\u0641\u0629 \u0645\u0627\u0631\u0634\u0627\u0644 \u0627\u0644\u062d\u062c\u0645\u064a\u0629 (Gmb)`,
    template: "asphalt_marshall_density",
    standardEn: "ASTM T 166",
    standardAr: "ASTM T 166",
  },
  {
    code: "ASPH_MARSHALL",
    titleEn: `Section 4 ${EM_DASH} Marshall Stability & Flow`,
    titleAr: `\u0627\u0644\u0642\u0633\u0645 4 ${EM_DASH} \u0627\u0633\u062a\u0642\u0631\u0627\u0631 \u0648\u062a\u062f\u0641\u0642 \u0645\u0627\u0631\u0634\u0627\u0644`,
    template: "asphalt_marshall",
    standardEn: "BS EN 12697-34",
    standardAr: "BS EN 12697-34",
  },
];

function siblingMatchesCode(testType: string, code: string): boolean {
  if (code === "ASPH_EXTRACTED_SIEVE") {
    return testType === code || testType.startsWith("ASPH_EXTRACTED_SIEVE_");
  }
  return testType === code;
}

export function isCompleteAsphaltMixBatch(siblings: { testType: string; status: string }[]): boolean {
  if (siblings.length !== 4) return false;
  return (
    BATCH_ORDER.every(meta => siblings.some(s => siblingMatchesCode(s.testType, meta.code))) &&
    siblings.every(s => s.status === "completed")
  );
}

type BatchStatusKind = "accepted" | "partial" | "rejected";

function computeBatchStatus(passCount: number, total: number) {
  if (passCount >= total) {
    return {
      kind: "accepted" as BatchStatusKind,
      labelEn: "ACCEPTED",
      labelAr: `\u0645\u0642\u0628\u0648\u0644 ${EM_DASH} ACCEPTED`,
    };
  }
  if (passCount === 0) {
    return {
      kind: "rejected" as BatchStatusKind,
      labelEn: "REJECTED",
      labelAr: `\u0645\u0631\u0641\u0648\u0636 ${EM_DASH} REJECTED`,
    };
  }
  return {
    kind: "partial" as BatchStatusKind,
    labelEn: `PARTIAL PASS (${passCount}/${total})`,
    labelAr: `\u0646\u062c\u0627\u062d \u062c\u0632\u0626\u064a (${passCount}/${total})`,
  };
}

function formTemplateForTestType(testType: string): string {
  if (testType.startsWith("ASPH_EXTRACTED_SIEVE")) return "asphalt_extracted_sieve";
  const row = BATCH_ORDER.find(b => b.code === testType);
  return row?.template ?? "asphalt_bitumen_extraction";
}

function sectionShortTitle(meta: (typeof BATCH_ORDER)[number], isAr: boolean): string {
  const full = isAr ? meta.titleAr : meta.titleEn;
  const parts = full.split(EM_DASH);
  return parts.length > 1 ? parts[1].trim() : full;
}

function renderBitumenSection(fd: Record<string, unknown>, isAr: boolean) {
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const samples = (fd.samples as Record<string, unknown>[]) ?? [];
  const cols: Column[] = [
    { header: L("Sample", "\u0627\u0644\u0639\u064a\u0646\u0629"), field: "sampleNo", align: "center" },
    { header: L("Location", "\u0627\u0644\u0645\u0648\u0642\u0639"), field: "location", align: "center" },
    { header: L("W Sample (g)", "\u0648\u0632\u0646 \u0627\u0644\u0639\u064a\u0646\u0629"), field: "wSample", align: "right", render: v => fmt(v, 1) },
    { header: L("W Aggregate (g)", "\u0648\u0632\u0646 \u0627\u0644\u0631\u0643\u0627\u0645"), field: "wAggregate", align: "right", render: v => fmt(v, 1) },
    { header: L("Bitumen (%)", "\u0627\u0644\u0628\u064a\u062a\u0648\u0645\u064a\u0646 %"), field: "bitumenContent", align: "center", render: v => fmt(v, 2) },
    {
      header: L("Result", "\u0627\u0644\u0646\u062a\u064a\u062c\u0629"),
      field: "result",
      align: "center",
      render: v => {
        if (v === "pass") return <span className="text-emerald-800 font-bold">{L("PASS", "\u0645\u0637\u0627\u0628\u0642")}</span>;
        if (v === "fail") return <span className="text-red-800 font-bold">{L("FAIL", "\u063a\u064a\u0631 \u0645\u0637\u0627\u0628\u0642")}</span>;
        return NDASH;
      },
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Method", "\u0627\u0644\u0637\u0631\u064a\u0642\u0629")}</span>
          <span className="font-semibold">{String(fd.method ?? NDASH)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Design Bitumen (%)", "\u0627\u0644\u0628\u064a\u062a\u0648\u0645\u064a\u0646 \u0627\u0644\u062a\u0635\u0645\u064a\u0645\u064a %")}</span>
          <span className="font-semibold">{fmt(fd.designBitumen, 2)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Tolerance (+/-%)", "\u0627\u0644\u0633\u0645\u0627\u062d\u064a\u0629 +/-%")}</span>
          <span className="font-semibold">{fmt(fd.tolerance, 2)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-blue-50">
          <span className="text-blue-600 block">{L("Average Bitumen (%)", "\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0628\u064a\u062a\u0648\u0645\u064a\u0646 %")}</span>
          <span className="font-bold text-blue-900 text-sm">{fmt(fd.avgBitumen, 2)}</span>
        </div>
      </div>
      <FlexibleResultsTable columns={cols} rows={samples} />
    </div>
  );
}

function renderExtractedSieveSection(fd: Record<string, unknown>, isAr: boolean) {
  const L = (en: string, ar: string) => (isAr ? ar : en);
  const rows = (fd.rows as Record<string, unknown>[]) ?? [];
  const cols: Column[] = [
    { header: L("Sieve (mm)", "\u0627\u0644\u0645\u0646\u062e\u0644 (\u0645\u0645)"), field: "sieve", align: "center" },
    { header: L("Mass Ret. (g)", "\u0627\u0644\u0643\u062a\u0644\u0629 \u0627\u0644\u0645\u062d\u062a\u062c\u0632\u0629"), field: "massRetained", align: "right", render: v => fmt(v, 1) },
    { header: L("% Passing", "% \u0646\u0627\u0639\u0645"), field: "percentPassing", align: "right", render: v => fmt(v, 1) },
    { header: L("Lower", "\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649"), field: "lower", align: "center", render: v => fmt(v, 0) },
    { header: L("Upper", "\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0639\u0644\u0649"), field: "upper", align: "center", render: v => fmt(v, 0) },
    {
      header: L("Within Limits", "\u0636\u0645\u0646 \u0627\u0644\u062d\u062f\u0648\u062f"),
      field: "withinLimits",
      align: "center",
      render: v =>
        v === true ? (
          <span className="text-emerald-800 font-bold">{L("PASS", "\u0645\u0637\u0627\u0628\u0642")}</span>
        ) : v === false ? (
          <span className="text-red-800 font-bold">{L("FAIL", "\u063a\u064a\u0631 \u0645\u0637\u0627\u0628\u0642")}</span>
        ) : (
          NDASH
        ),
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Mix Type", "\u0646\u0648\u0639 \u0627\u0644\u062e\u0644\u0637\u0629")}</span>
          <span className="font-semibold">{String(fd.mixType ?? NDASH)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Sample Mass (g)", "\u0643\u062a\u0644\u0629 \u0627\u0644\u0639\u064a\u0646\u0629")}</span>
          <span className="font-semibold">{fmt(fd.sampleMass, 1)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-gray-50">
          <span className="text-gray-500 block">{L("Pan Mass (g)", "\u0643\u062a\u0644\u0629 \u0627\u0644\u0635\u064a\u0646\u064a\u0629")}</span>
          <span className="font-semibold">{fmt(fd.panMass, 1)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 bg-blue-50">
          <span className="text-blue-600 block">{L("Total Mass (g)", "\u0627\u0644\u0643\u062a\u0644\u0629 \u0627\u0644\u0643\u0644\u064a\u0629")}</span>
          <span className="font-bold text-blue-900 text-sm">{fmt(fd.totalMass, 1)}</span>
        </div>
      </div>
      <FlexibleResultsTable columns={cols} rows={rows.filter(r => r.percentPassing != null)} />
    </div>
  );
}

function renderSectionBody(template: string, fd: Record<string, unknown>, isAr: boolean) {
  if (template === "asphalt_bitumen_extraction") return renderBitumenSection(fd, isAr);
  if (template === "asphalt_extracted_sieve") return renderExtractedSieveSection(fd, isAr);
  return renderFormData(template, fd, isAr);
}

function SignatureBox({ label, name }: { label: string; name?: string }) {
  return (
    <td className="signature-column align-top text-center border border-gray-300 px-2 py-2 text-xs w-1/3">
      <p className="text-gray-600 text-[10px] font-bold uppercase mb-1">{label}</p>
      <div className="signature-line border-b border-gray-800 min-h-[28px] mb-1 mx-1" />
      {name ? <p className="text-xs font-semibold text-gray-800">{name}</p> : null}
    </td>
  );
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
  const palette =
    status.kind === "accepted"
      ? { border: "#10b981", bg: "#f0fdf4", Icon: CheckCircle, text: "text-emerald-800" }
      : status.kind === "partial"
        ? { border: "#f59e0b", bg: "#fffbeb", Icon: AlertTriangle, text: "text-amber-800" }
        : { border: "#ef4444", bg: "#fef2f2", Icon: XCircle, text: "text-red-800" };

  const Icon = palette.Icon;

  return (
    <div className="mt-4 p-3 border-2 rounded-lg" style={{ borderColor: palette.border, backgroundColor: palette.bg }}>
      <div className={`flex items-center gap-3 ${isAr ? "flex-row-reverse" : ""}`}>
        <div className="shrink-0">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: palette.border }}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className={isAr ? "text-right flex-1" : "flex-1"}>
          <p className={`text-lg font-extrabold ${palette.text}`}>{isAr ? status.labelAr : status.labelEn}</p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {isAr
              ? `\u0646\u062a\u064a\u062c\u0629 \u0627\u0644\u062d\u0632\u0645\u0629: ${passCount} \u0645\u0646 ${total} \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0645\u0637\u0627\u0628\u0642\u0629`
              : `Batch result: ${passCount} of ${total} tests passed`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AsphaltMixBatchReport() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang, setLang } = useLanguage();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);
  const distId = parseInt(distributionId ?? "0", 10);

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const distOrderId = (dist as { orderId?: number } | undefined)?.orderId;

  const { data: siblings = [], isLoading: siblingsLoading } = trpc.distributions.getBatchSiblings.useQuery(
    { sampleId: dist?.sampleId ?? 0, orderId: distOrderId ?? 0 },
    { enabled: !!dist?.sampleId && !!distOrderId },
  );

  const resultQueries = trpc.useQueries(t =>
    siblings.map(s => t.specializedTests.getByDistribution({ distributionId: s.id }, { enabled: !!s.id })),
  );

  const resultsLoading = resultQueries.some(q => q.isLoading);
  const isLoading = siblingsLoading || resultsLoading;

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  const handleClose = () => {
    if (window.opener) window.close();
    else window.history.back();
  };

  const handlePrint = async () => {
    if (!printRef.current) return window.print();
    setIsPdfLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `asphalt-mix-batch-${(dist as { sampleCode?: string })?.sampleCode ?? distId}`,
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
      filename: `asphalt-mix-batch-${(dist as { sampleCode?: string })?.sampleCode ?? distId}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  const batchComplete = isCompleteAsphaltMixBatch(siblings);

  const sections = BATCH_ORDER.map(meta => {
    const sibling = siblings.find(s => siblingMatchesCode(s.testType, meta.code));
    const idx = sibling ? siblings.indexOf(sibling) : -1;
    const result = idx >= 0 ? resultQueries[idx]?.data : undefined;
    const passed = result?.overallResult === "pass";
    return { meta, sibling, result, passed };
  });

  const resolvedSections = sections.filter(s => s.sibling && s.result);
  const passCount = resolvedSections.filter(s => s.passed).length;
  const total = BATCH_ORDER.length;
  const batchStatus = computeBatchStatus(passCount, total);
  const testedBy = resolvedSections.map(s => s.result?.testedBy).find(Boolean) as string | undefined;

  if (!batchComplete) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" dir={isAr ? "rtl" : "ltr"}>
        <AlertTriangle className="text-amber-500" size={40} />
        <p className="text-slate-700 font-medium text-center max-w-md px-4">
          {isAr
            ? "\u062d\u0632\u0645\u0629 \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0627\u0644\u0623\u0633\u0641\u0644\u062a \u063a\u064a\u0631 \u0645\u0643\u062a\u0645\u0644\u0629. \u064a\u062c\u0628 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0627\u0644\u0623\u0631\u0628\u0639\u0629 \u0639\u0644\u0649 \u0646\u0641\u0633 \u0627\u0644\u0639\u064a\u0646\u0629."
            : "Asphalt mix batch is incomplete. All four tests must be completed on the same sample."}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {isAr ? "\u0625\u063a\u0644\u0627\u0642" : "Close"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10"
        dir={isAr ? "rtl" : "ltr"}
      >
        <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
          <X className="w-4 h-4" /> {isAr ? "\u0625\u063a\u0644\u0627\u0642" : "Close"}
        </Button>
        <span className="text-sm font-medium">
          {isAr
            ? `\u062a\u0642\u0631\u064a\u0631 \u062e\u0644\u0637\u0629 \u0627\u0644\u0623\u0633\u0641\u0644\u062a ${EM_DASH} \u062d\u0632\u0645\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a`
            : "Asphalt Mix Batch Report"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}
          >
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isDownloadLoading}
            variant="ghost"
            className="text-white hover:text-white hover:bg-slate-700 gap-1.5"
          >
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isAr ? "\u062a\u062d\u0645\u064a\u0644 PDF" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {isAr ? "\u0637\u0628\u0627\u0639\u0629 / \u062d\u0641\u0638 PDF" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
        <div
          ref={printRef}
          className="lab-print-root mx-auto bg-white shadow-lg print:shadow-none"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "15mm 15mm 20mm 15mm",
            fontFamily: "Arial, sans-serif",
            fontSize: "10px",
          }}
        >
          <div className="mb-5">
            <div className="border-t-4 border-gray-900 pt-3 flex justify-between items-center">
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
              <div className="flex flex-col items-center px-4 border-x border-gray-300">
                <div className="w-11 h-11 rounded-full border-2 border-gray-800 flex items-center justify-center text-lg font-black">
                  {"\u0645"}
                </div>
                <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
              </div>
              <div className="text-[11px] text-gray-600 space-y-0.5">
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? ":\u0631\u0642\u0645 \u0627\u0644\u062a\u0642\u0631\u064a\u0631" : "Report No.:"}</span>
                  <span className="font-mono font-bold">RPT-{String(distId).padStart(6, "0")}</span>
                </div>
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? ":\u0627\u0644\u062a\u0627\u0631\u064a\u062e" : "Date:"}</span>
                  <span>{formatCalendarDate(new Date())}</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-900 text-white text-center py-2 mt-3 mb-2">
              <p className="text-[14px] font-bold">
                {isAr
                  ? `\u062a\u0642\u0631\u064a\u0631 \u062e\u0644\u0637\u0629 \u0627\u0644\u0623\u0633\u0641\u0644\u062a ${EM_DASH} \u062d\u0632\u0645\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a`
                  : "Asphalt Mix - Combined Test Report"}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">
                {isAr
                  ? `BS EN 12697 ${EM_DASH} \u062d\u0632\u0645\u0629 \u062a\u0635\u0645\u064a\u0645 \u062e\u0644\u0637\u0629 \u0627\u0644\u0623\u0633\u0641\u0644\u062a`
                  : `BS EN 12697 ${EM_DASH} Asphalt Mix Design Package`}
              </p>
            </div>
            <BatchStatusPanel status={batchStatus} passCount={passCount} total={total} isAr={isAr} />
          </div>

          <div className="border border-gray-200 rounded mb-5 overflow-hidden">
            <table className="metadata-table w-full border-collapse text-xs bg-gray-50">
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-2 text-center w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase block mb-1">
                      {isAr ? "\u0631\u0642\u0645 \u0627\u0644\u0639\u064a\u0646\u0629" : "Sample No."}
                    </span>
                    <span className="font-mono font-bold text-sm">
                      {(dist as { sampleCode?: string })?.sampleCode ?? NDASH}
                    </span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase block mb-1">
                      {isAr ? "\u0646\u0648\u0639 \u0627\u0644\u0637\u0628\u0642\u0629" : "Mix Course"}
                    </span>
                    <span className="font-semibold">{(dist as { testSubType?: string })?.testSubType ?? NDASH}</span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase block mb-1">
                      {isAr ? "\u0639\u062f\u062f \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a" : "Tests in Batch"}
                    </span>
                    <span className="font-bold text-blue-700">{total}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="metadata-table w-full border-collapse text-xs">
              <tbody>
                <tr>
                  {resolvedSections.map(({ meta, passed }) => (
                    <td key={meta.code} className="border border-gray-200 px-2 py-2 text-center">
                      <span className="text-gray-400 text-[9px] block mb-1">{sectionShortTitle(meta, isAr)}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {passed ? (isAr ? "\u0645\u0637\u0627\u0628\u0642" : "PASS") : isAr ? "\u063a\u064a\u0631 \u0645\u0637\u0627\u0628\u0642" : "FAIL"}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-4">
              {isAr ? "\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0627\u0644\u0623\u0631\u0628\u0639\u0629" : "Four-Test Batch Results"}
            </h3>

            {resolvedSections.map(({ meta, sibling, result, passed }, i) => {
              const fd = (result?.formData as Record<string, unknown>) ?? {};
              const template = formTemplateForTestType(sibling!.testType);
              return (
                <div
                  key={sibling!.id}
                  className={`mb-6 ${i > 0 ? "print:break-before-page pt-4 border-t border-gray-200" : ""}`}
                >
                  <div className="border border-gray-300 rounded overflow-hidden">
                    <div className="bg-slate-100 border-b border-gray-300 px-3 py-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h2 className="text-[12px] font-bold text-gray-900">{isAr ? meta.titleAr : meta.titleEn}</h2>
                          <p className="text-[9px] text-gray-500 mt-0.5">{isAr ? meta.standardAr : meta.standardEn}</p>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded ${
                            passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {passed
                            ? isAr
                              ? `\u0645\u0637\u0627\u0628\u0642 ${EM_DASH} PASS`
                              : "PASS"
                            : isAr
                              ? `\u063a\u064a\u0631 \u0645\u0637\u0627\u0628\u0642 ${EM_DASH} FAIL`
                              : "FAIL"}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">{renderSectionBody(template, fd, isAr)}</div>
                    {result?.notes ? (
                      <div className="px-3 pb-3 text-[10px] text-gray-600 border-t border-gray-100 pt-2">
                        <span className="font-semibold">{isAr ? "\u0645\u0644\u0627\u062d\u0638\u0627\u062a: " : "Notes: "}</span>
                        {String(result.notes)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-300">
            <table className="signatures-table w-full border-collapse text-xs">
              <tbody>
                <tr>
                  <SignatureBox label={isAr ? "\u0627\u0644\u0641\u0627\u062d\u0635" : "Tested By"} name={testedBy} />
                  <SignatureBox label={isAr ? "\u0627\u0644\u0645\u0631\u0627\u062c\u0639" : "Reviewed By"} />
                  <SignatureBox label={isAr ? "\u0627\u0644\u0645\u0639\u062a\u0645\u062f" : "Approved By"} />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-3 border-t border-gray-200 flex justify-between text-gray-400" style={{ fontSize: "8px" }}>
            <span>
              Construction Materials &amp; Engineering Laboratory {EM_DASH}{" "}
              {"\u0645\u062e\u062a\u0628\u0631 \u0627\u0644\u0625\u0646\u0634\u0627\u0621\u0627\u062a \u0648\u0627\u0644\u0645\u0648\u0627\u062f \u0627\u0644\u0647\u0646\u062f\u0633\u064a\u0629"}
            </span>
            <span>
              {isAr ? "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0646\u0634\u0627\u0621:" : "Generated:"}{" "}
              {new Date().toLocaleString(isAr ? "ar-AE" : "en-GB")}
            </span>
          </div>
        </div>
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
    </>
  );
}
