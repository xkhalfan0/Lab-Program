import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildSectorResultReportHtml,
  formatFormSections,
  formatSummaryEntries,
} from "./sectorReportUtils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Printer,
  RefreshCw,
  FlaskConical,
  Hash,
  Building2,
  User,
  CalendarDays,
  FileText,
  ClipboardList,
  ShieldCheck,
  BadgeCheck,
  Info,
} from "lucide-react";

const REPORT_LABELS = {
  ar: {
    sampleCode: "رمز العينة",
    contractNumber: "رقم العقد",
    projectName: "اسم المشروع",
    contractorName: "المقاول",
    testType: "نوع الاختبار",
    testDate: "تاريخ الفحص",
    testedBy: "الفني",
    overallResult: "النتيجة",
    summaryValues: "ملخص النتائج",
    formData: "بيانات الفحص",
    notes: "ملاحظات",
    managerReview: "مراجعة المدير",
    qcReview: "مراجعة الجودة",
    approved: "ناجح",
    failed: "راسب",
    pending: "قيد المراجعة",
    download: "تنزيل التقرير",
    print: "طباعة",
    generating: "جاري التوليد...",
    loadError: "تعذّر تحميل التقرير",
    sampleInfo: "معلومات العينة",
    notReviewed: "لم تتم المراجعة بعد",
  },
  en: {
    sampleCode: "Sample Code",
    contractNumber: "Contract No.",
    projectName: "Project Name",
    contractorName: "Contractor",
    testType: "Test Type",
    testDate: "Test Date",
    testedBy: "Technician",
    overallResult: "Result",
    summaryValues: "Summary Results",
    formData: "Test Data",
    notes: "Notes",
    managerReview: "Manager Review",
    qcReview: "QC Review",
    approved: "Pass",
    failed: "Fail",
    pending: "Pending",
    download: "Download Report",
    print: "Print",
    generating: "Generating...",
    loadError: "Could not load report",
    sampleInfo: "Sample Information",
    notReviewed: "Not reviewed yet",
  },
};

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-xs text-slate-500">{label}</p>
        <div className="break-words text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}

export function SectorTestResultDialog({
  resultId,
  open,
  onClose,
  lang,
  testTypeLabel,
}: {
  resultId: number | null;
  open: boolean;
  onClose: () => void;
  lang: "ar" | "en";
  testTypeLabel?: string;
}) {
  const T = REPORT_LABELS[lang];
  const isRtl = lang === "ar";
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const utils = trpc.useUtils();
  const { data: detail, isLoading, isError } = trpc.sector.getInboxItemDetail.useQuery(
    { type: "result", refId: resultId ?? 0 },
    { enabled: open && !!resultId, staleTime: 30000 }
  );

  const markRead = trpc.sector.markResultRead.useMutation({
    onSuccess: () => {
      utils.sector.getTestResults.invalidate();
      utils.sector.getInbox.invalidate();
      utils.sector.getUnreadCount.invalidate();
    },
  });

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) onClose();
    else if (resultId) markRead.mutate({ resultId });
  };

  const generatePdf = useCallback(async (pdfLang: "ar" | "en"): Promise<Blob | null> => {
    if (!detail || detail.type !== "result") return null;
    const labName =
      pdfLang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory";
    const labels = REPORT_LABELS[pdfLang];
    const html = buildSectorResultReportHtml(detail, pdfLang, labName, labels);
    const filename = `test-result-${detail.sample?.sampleCode ?? resultId}-${pdfLang}.pdf`;
    try {
      setIsPdfLoading(true);
      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ html, filename }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.blob();
    } catch {
      return null;
    } finally {
      setIsPdfLoading(false);
    }
  }, [detail, resultId]);

  async function handlePrint() {
    const blob = await generatePdf(lang);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 800);
      else URL.revokeObjectURL(url);
      return;
    }
    if (!detail || detail.type !== "result") return;
    const labName = lang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory";
    const html = buildSectorResultReportHtml(detail, lang, labName, T);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  async function handleDownload() {
    const blob = await generatePdf(lang);
    const filename = `test-result-${detail?.type === "result" ? detail.sample?.sampleCode ?? resultId : resultId}-${lang}.pdf`;
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const r = detail?.type === "result" ? detail.result : null;
  const s = detail?.type === "result" ? detail.sample : null;
  const summary = formatSummaryEntries(r?.summaryValues as Record<string, unknown>, lang);
  const form = formatFormSections(r?.formData as Record<string, unknown>, lang);

  const overallBadge =
    r?.overallResult === "pass"
      ? { label: T.approved, className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 }
      : r?.overallResult === "fail"
        ? { label: T.failed, className: "bg-red-50 text-red-700 ring-red-200", icon: XCircle }
        : { label: T.pending, className: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock };

  const resolvedTestType = testTypeLabel ?? r?.testTypeName ?? r?.testTypeCode ?? "—";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0" dir={isRtl ? "rtl" : "ltr"}>
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {isRtl ? "تقرير نتيجة الاختبار" : "Test Result Report"}
              </DialogTitle>
              <p className="mt-1 font-mono text-sm text-slate-500">{s?.sampleCode ?? "—"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={isLoading || !detail || isPdfLoading}>
                {isPdfLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {T.print}
              </Button>
              <Button size="sm" onClick={handleDownload} disabled={isLoading || !detail || isPdfLoading}>
                {isPdfLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isPdfLoading ? T.generating : T.download}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {isLoading ? (
            <div className="space-y-3 py-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : isError || !r ? (
            <div className="py-12 text-center text-sm text-slate-500">{T.loadError}</div>
          ) : (
            <>
              <div className="flex justify-center">
                <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ring-inset ${overallBadge.className}`}>
                  <overallBadge.icon className="h-4 w-4" />
                  {overallBadge.label}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <FlaskConical className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-slate-800">{T.sampleInfo}</span>
                </div>
                <div className="px-4">
                  <DetailRow icon={Hash} label={T.sampleCode} value={s?.sampleCode} />
                  <DetailRow icon={ClipboardList} label={T.contractNumber} value={r.contractNo ?? s?.contractNumber} />
                  <DetailRow icon={Building2} label={T.projectName} value={r.projectName ?? s?.contractName} />
                  <DetailRow icon={User} label={T.contractorName} value={r.contractorName ?? s?.contractorName} />
                  <DetailRow icon={FileText} label={T.testType} value={resolvedTestType} />
                  <DetailRow
                    icon={CalendarDays}
                    label={T.testDate}
                    value={r.testDate ? new Date(r.testDate).toLocaleDateString(isRtl ? "ar-AE" : "en-GB") : null}
                  />
                  <DetailRow icon={User} label={T.testedBy} value={r.testedBy} />
                </div>
              </div>

              {summary.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">{T.summaryValues}</div>
                  <div className="divide-y divide-slate-100 px-4">
                    {summary.filter((e) => !e.isTable).map((e) => (
                      <DetailRow key={e.key} icon={Info} label={e.label} value={e.value} />
                    ))}
                  </div>
                  {summary.filter((e) => e.isTable && e.tableHtml).map((e) => (
                    <div key={e.key} className="overflow-x-auto p-4" dangerouslySetInnerHTML={{ __html: e.tableHtml ?? "" }} />
                  ))}
                </div>
              )}

              {(form.fields.length > 0 || form.tables.length > 0) && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">{T.formData}</div>
                  <div className="divide-y divide-slate-100 px-4">
                    {form.fields.map((f) => (
                      <DetailRow key={f.label} icon={Info} label={f.label} value={f.value} />
                    ))}
                  </div>
                  {form.tables.map((t) => (
                    <div key={t.title} className="border-t border-slate-100 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.title}</p>
                      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: t.html }} />
                    </div>
                  ))}
                </div>
              )}

              {r.notes && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-1 text-xs text-slate-500">{T.notes}</p>
                  <p className="text-sm text-slate-700">{r.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    {T.managerReview}
                  </div>
                  {r.managerReviewedByName ? (
                    <>
                      <p className="text-sm font-semibold text-blue-700">{r.managerReviewedByName}</p>
                      {r.managerReviewedAt && (
                        <p className="mt-1 text-xs text-slate-500">{new Date(r.managerReviewedAt).toLocaleDateString(isRtl ? "ar-AE" : "en-GB")}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs italic text-slate-400">{T.notReviewed}</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    {T.qcReview}
                  </div>
                  {r.qcReviewedByName ? (
                    <>
                      <p className="text-sm font-semibold text-emerald-700">{r.qcReviewedByName}</p>
                      {r.qcReviewedAt && (
                        <p className="mt-1 text-xs text-slate-500">{new Date(r.qcReviewedAt).toLocaleDateString(isRtl ? "ar-AE" : "en-GB")}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs italic text-slate-400">{T.notReviewed}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
