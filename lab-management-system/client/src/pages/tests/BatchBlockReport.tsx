/**
 * BatchBlockReport — Unified printable report for multi-type block batches
 * URL: /batch-report/:batchId
 * Shows one section per block type, all from the same batch
 */
import { useParams } from "wouter";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Printer, X, CheckCircle, XCircle, Globe, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlexibleResultsTable, type Column } from "@/components/reports/FlexibleResultsTable";
import { ReportSignatures, pickReviewSignatures } from "@/components/reports/ReportSignatures";

import { formatCalendarDate } from "@/lib/dateFormat";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: any, dec = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toFixed(dec);
}
function fmtDate(d?: string | Date | null) {
  return formatCalendarDate(d);
}

// ─── Block Section Renderer ───────────────────────────────────────────────────
function renderBlockSection(formData: any, isAr: boolean) {
  const blocks: any[] = formData?.blocks ?? [];
  const spec = formData?.blockSpec ?? {};
  const avgStrength = formData?.avgStrength ?? 0;
  const overallResult = formData?.overallResult ?? "pending";
  const required = spec.requiredStrength ?? 0;

  const headers = isAr
    ? ["رقم البلوكة", "تاريخ الفحص", "الطول (مم)", "العرض (مم)", "المساحة (مم²)", "الحمل (كن)", "المقاومة (N/mm²)", "النتيجة"]
    : ["Block Ref.", "Date Tested", "Length (mm)", "Width (mm)", "Area (mm²)", "Load (kN)", "Strength (N/mm²)", "Result"];

  const dataRows = blocks
    .filter((b: any) => b.strengthMpa && b.strengthMpa > 0)
    .map((b: any, i: number) => ({ ...b, _rowIndex: i }));

  const columns: Column[] = [
    {
      header: headers[0],
      field: "blockRef",
      align: "center",
      render: (v, row) => (
        <span className="font-mono">{String((row as any).blockRef || `B${(row as any)._rowIndex + 1}`)}</span>
      ),
    },
    {
      header: headers[1],
      field: "dateTested",
      align: "center",
      render: (v) => (v ? fmtDate(v as string) : "—"),
    },
    { header: headers[2], field: "lengthMm", type: "number", decimals: 0, align: "right", render: (v, row) => fmt((row as any).lengthMm ?? (row as any).length, 0) },
    { header: headers[3], field: "widthMm", type: "number", decimals: 0, align: "right", render: (v, row) => fmt((row as any).widthMm ?? (row as any).width, 0) },
    { header: headers[4], field: "grossAreaMm2", type: "number", decimals: 0, align: "right", render: (v, row) => fmt((row as any).grossAreaMm2 ?? (row as any).grossArea, 0) },
    { header: headers[5], field: "loadKN", type: "number", decimals: 1, align: "right" },
    { header: headers[6], field: "strengthMpa", align: "right", render: (_, row) => <span className="font-bold">{fmt((row as any).strengthMpa, 1)}</span> },
    {
      header: headers[7],
      field: "result",
      align: "center",
      render: (_, row) => {
        const r = (row as any).result;
        const passTxt = isAr ? "مطابق" : "PASS";
        const failTxt = isAr ? "غير مطابق" : "FAIL";
        if (r === "pass") return <span className="text-emerald-800 font-bold">{passTxt}</span>;
        if (r === "fail") return <span className="text-red-800 font-bold">{failTxt}</span>;
        return <span className="text-gray-500">—</span>;
      },
    },
  ];

  return (
    <div className="mb-6">
      {/* Block type header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold text-gray-800">
            {isAr ? (spec.labelAr ?? spec.label ?? "بلوكة") : (spec.label ?? "Block")}
          </h4>
          <p className="text-xs text-gray-500">
            {isAr ? "المعيار:" : "Standard:"} {spec.standard ?? "BS 6073"} &nbsp;|&nbsp;
            {isAr ? "الحجم:" : "Size:"} {spec.size ?? "—"} &nbsp;|&nbsp;
            {isAr ? "المقاومة المطلوبة:" : "Required Strength:"} {required} N/mm²
          </p>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${overallResult === "pass" ? "bg-green-100 text-green-800 border border-green-300" : overallResult === "fail" ? "bg-red-100 text-red-800 border border-red-300" : "bg-gray-100 text-gray-600 border border-gray-300"}`}>
          {overallResult === "pass" ? <CheckCircle size={12} /> : overallResult === "fail" ? <XCircle size={12} /> : null}
          {overallResult === "pass" ? (isAr ? "مطابق" : "PASS") : overallResult === "fail" ? (isAr ? "غير مطابق" : "FAIL") : (isAr ? "قيد المعالجة" : "Pending")}
        </div>
      </div>

      {/* Results table */}
      <div className="mb-2">
        <FlexibleResultsTable columns={columns} rows={dataRows} />
      </div>

      {/* Average */}
      <div className="flex justify-end">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold border ${overallResult === "pass" ? "bg-green-50 border-green-300 text-green-800" : overallResult === "fail" ? "bg-red-50 border-red-300 text-red-800" : "bg-gray-50 border-gray-300 text-gray-700"}`}>
          {isAr ? "متوسط المقاومة:" : "Average Strength:"} {fmt(avgStrength, 1)} N/mm²
          &nbsp;/&nbsp;
          {isAr ? "المطلوب:" : "Required:"} {required} N/mm²
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BatchBlockReport() {
  const { batchId } = useParams<{ batchId: string }>();
  const { lang, setLang } = useLanguage();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  const { data: batchData, isLoading } = trpc.specializedTests.getByBatch.useQuery(
    { batchId: batchId ?? "" },
    { enabled: !!batchId }
  );

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
      filename: `batch-report-${batchId}`,
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
      filename: `batch-report-${batchId}`,
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

  if (!batchData || batchData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <XCircle className="text-red-400" size={40} />
        <p className="text-slate-600 font-medium">
          {isAr ? "لا توجد نتائج لهذه الدفعة" : "No results found for this batch."}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {isAr ? "إغلاق" : "Close"}
        </Button>
      </div>
    );
  }

  // Get shared info from first sample
  const firstSample = batchData[0]?.sample;
  const allResults = batchData.flatMap(b => b.testResults);
  const batchSignatures = pickReviewSignatures(allResults);
  const signatureLabels = {
    tested: isAr ? "الفاحص" : "Tested By",
    reviewed: isAr ? "المراجع" : "Reviewed By",
    approved: isAr ? "المعتمد" : "Approved By",
  };
  const overallBatchResult = allResults.every(r => r.overallResult === "pass") ? "pass"
    : allResults.some(r => r.overallResult === "fail") ? "fail"
    : "pending";
  const isPassed = overallBatchResult === "pass";

  return (
    <>
      {/* Print Controls */}
      <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
        <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
          <X className="w-4 h-4" /> {isAr ? "إغلاق" : "Close"}
        </Button>
        <span className="text-sm font-medium">
          {isAr ? "تقرير دفعة البلوكات" : "Batch Block Report"} — {batchId}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}>
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "English" : "العربية"}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isAr ? "تحميل PDF" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {isAr ? "طباعة / حفظ PDF" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* Report Page */}
      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
        <div
          ref={printRef}
          className="lab-print-root mx-auto bg-white shadow-lg print:shadow-none"
          style={{ width: "210mm", padding: "10mm 12mm 12mm 12mm", fontFamily: "Arial, sans-serif", fontSize: "10px" }}
        >
          {/* Header */}
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
                  <span className="text-gray-500">{isAr ? ":رقم الدفعة" : "Batch No.:"}</span>
                  <span className="font-mono font-bold text-gray-800">{batchId}</span>
                </div>
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? ":التاريخ" : "Date:"}</span>
                  <span>{formatCalendarDate(new Date())}</span>
                </div>
              </div>
            </div>
            {/* Document title bar */}
            <div className="bg-gray-900 text-white text-center py-2 mt-3 mb-4">
              <p className="text-[14px] font-bold">
                {isAr ? "تقرير نتيجة فحص البلوكات الخرسانية" : "Masonry Blocks Compressive Strength Report"}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5 tracking-wider uppercase">
                {isAr ? "BS 6073 — Compressive Strength of Masonry Blocks" : "BS 6073 — مقاومة الضغط للبلوك الخرساني"}
              </p>
            </div>
            {/* Overall Pass/Fail badge */}
            <div className={`flex ${isAr ? "justify-start" : "justify-end"}`}>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${isPassed ? "bg-green-100 text-green-800 border border-green-300" : overallBatchResult === "fail" ? "bg-red-100 text-red-800 border border-red-300" : "bg-yellow-100 text-yellow-800 border border-yellow-300"}`}>
                {isPassed ? <CheckCircle size={14} /> : overallBatchResult === "fail" ? <XCircle size={14} /> : null}
                {isPassed
                  ? (isAr ? "مطابق — PASS" : "PASS — مطابق")
                  : overallBatchResult === "fail"
                    ? (isAr ? "غير مطابق — FAIL" : "FAIL — غير مطابق")
                    : (isAr ? "قيد المعالجة" : "Pending")}
              </div>
            </div>
          </div>

          {/* Sample Info */}
          <div className="border border-gray-200 rounded mb-5 overflow-hidden">
            <table className="metadata-table w-full border-collapse text-xs bg-gray-50">
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-2 text-center align-top w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wide block mb-1">{isAr ? "رقم الدفعة" : "Batch No."}</span>
                    <span className="font-mono font-bold text-gray-900 text-sm">{batchId}</span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center align-top w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wide block mb-1">{isAr ? "عدد الأنواع" : "Block Types"}</span>
                    <span className="font-mono font-bold text-blue-700 text-sm">{batchData.length}</span>
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center align-top w-1/3">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wide block mb-1">{isAr ? "تاريخ الاستلام" : "Received Date"}</span>
                    <span className="font-semibold text-gray-900">{fmtDate(firstSample?.receivedAt)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="metadata-table w-full border-collapse text-xs">
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500 w-[22%]">{isAr ? "المقاول" : "Contractor"}</td>
                  <td className="border border-gray-200 px-2 py-1 font-medium text-gray-900 w-[28%]">{firstSample?.contractorName ?? "—"}</td>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500 w-[22%]">{isAr ? "اسم المشروع" : "Project Name"}</td>
                  <td className="border border-gray-200 px-2 py-1 font-medium text-gray-900 w-[28%]">{firstSample?.contractName ?? "—"}</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500">{isAr ? "رقم العقد" : "Contract No."}</td>
                  <td className="border border-gray-200 px-2 py-1 font-medium text-gray-900">{firstSample?.contractNumber ?? "—"}</td>
                  <td className="border border-gray-200 px-2 py-1 text-gray-500">{isAr ? "القطاع" : "Sector"}</td>
                  <td className="border border-gray-200 px-2 py-1 font-medium text-gray-900">
                    {firstSample?.sector ? (firstSample.sector as string).replace("_", " ").toUpperCase() : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Sections per block type */}
          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-4">
              {isAr ? "نتائج الفحص حسب نوع البلوكة" : "Test Results by Block Type"}
            </h3>
            {batchData.map((entry, idx) => {
              const testResult = entry.testResults?.[0];
              if (!testResult) {
                return (
                  <div key={idx} className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                    {isAr
                      ? `العينة ${entry.sample.sampleCode} — لم يتم إدخال النتائج بعد`
                      : `Sample ${entry.sample.sampleCode} — Results not yet entered`}
                  </div>
                );
              }
              const formData = testResult.formData as any ?? {};
              return (
                <div key={idx} className={idx > 0 ? "mt-6 pt-6 border-t border-gray-200" : ""}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded">
                      {isAr ? `نوع ${idx + 1}` : `Type ${idx + 1}`}
                    </span>
                    <span className="text-xs font-mono text-gray-500">{entry.sample.sampleCode}</span>
                  </div>
                  {renderBlockSection(formData, isAr)}
                </div>
              );
            })}
          </div>

          <ReportSignatures sig={batchSignatures} labels={signatureLabels} />

          {/* Footer */}
          <div className="mt-4 pt-2 border-t border-gray-200 flex justify-between text-gray-400" style={{ fontSize: "8px" }}>
            <span>Construction Materials &amp; Engineering Laboratory — مختبر الإنشاءات والمواد الهندسية</span>
            <span>{isAr ? "تاريخ الإنشاء:" : "Generated:"} {new Date().toLocaleString(isAr ? "ar-AE" : "en-GB")}</span>
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
        }
      `}</style>
    </>
  );
}
