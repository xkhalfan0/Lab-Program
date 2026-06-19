import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  pickMainSummaryEntries,
} from "./sectorReportUtils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  Building2,
  User,
  CalendarDays,
  FileText,
  ClipboardList,
  Info,
  X,
  ExternalLink,
} from "lucide-react";

const REPORT_LABELS = {
  ar: {
    sampleCode: "رمز العينة",
    inspectionReferenceNo: "رقم مرجع التفتيش",
    contractNumber: "رقم العقد",
    contractorName: "المقاول",
    testType: "نوع الاختبار",
    testDate: "تاريخ الفحص",
    testedBy: "الفني",
    notes: "ملاحظات",
    approved: "ناجح",
    failed: "راسب",
    pending: "قيد المراجعة",
    generating: "جاري التوليد...",
    loadError: "تعذّر تحميل التقرير",
    viewFullReport: "عرض التقرير الكامل",
    resultSummary: "ملخص سريع",
    title: "نتيجة الاختبار",
    failAlert: "هذه العينة لم تجتز الفحص — يرجى مراجعة التقرير الكامل",
    close: "إغلاق",
    projectName: "اسم المشروع",
    overallResult: "النتيجة",
    summaryValues: "ملخص النتائج",
    formData: "بيانات الفحص",
    managerReview: "مراجعة المشرف",
    qcReview: "اعتماد الجودة",
  },
  en: {
    sampleCode: "Sample Code",
    inspectionReferenceNo: "Inspection Reference No.",
    contractNumber: "Contract No.",
    contractorName: "Contractor",
    testType: "Test Type",
    testDate: "Test Date",
    testedBy: "Technician",
    notes: "Notes",
    approved: "Pass",
    failed: "Fail",
    pending: "Pending",
    generating: "Generating...",
    loadError: "Could not load report",
    viewFullReport: "View Full Report",
    resultSummary: "Quick Summary",
    title: "Test Result",
    failAlert: "This sample did not pass — review the full report",
    close: "Close",
    projectName: "Project",
    overallResult: "Result",
    summaryValues: "Summary",
    formData: "Test Data",
    managerReview: "Manager Review",
    qcReview: "QC Approval",
  },
};

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
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

  function handleOpenReport() {
    if (!resultId) return;
    const url = `/sector/test-report/${resultId}`;
    const opened = window.open(url, "_blank");
    if (!opened) window.location.href = url;
  }

  const r = detail?.type === "result" ? detail.result : null;
  const s = detail?.type === "result" ? detail.sample : null;
  const mainSummary = pickMainSummaryEntries(r?.summaryValues as Record<string, unknown>, lang);

  const overallBadge =
    r?.overallResult === "pass"
      ? { label: T.approved, className: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 }
      : r?.overallResult === "fail"
        ? { label: T.failed, className: "bg-red-50 text-red-700 ring-red-200", icon: XCircle }
        : { label: T.pending, className: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock };

  const resolvedTestType =
    testTypeLabel ??
    (lang === "ar" ? r?.testTypeNameAr ?? r?.testTypeName : r?.testTypeNameEn) ??
    r?.testTypeCode ??
    "—";
  const isFail = r?.overallResult === "fail";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        showCloseButton={false}
        className={`max-h-[90vh] max-w-lg overflow-y-auto p-0 ${isFail ? "border-red-300" : ""}`}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <DialogHeader className="sticky top-0 z-10 flex flex-row items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1 text-start">
            <DialogTitle className="text-lg font-bold text-slate-900">{T.title}</DialogTitle>
            <p className="mt-1 font-mono text-sm text-slate-500">{s?.sampleCode ?? "—"}</p>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={T.close}
              className="flex-shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogClose>
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
              <div className={`flex justify-center rounded-xl p-4 ${isFail ? "bg-red-50" : "bg-slate-50"}`}>
                <span className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-bold ring-1 ring-inset ${overallBadge.className}`}>
                  <overallBadge.icon className="h-5 w-5" />
                  {overallBadge.label}
                </span>
              </div>

              {isFail && (
                <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  {T.failAlert}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="px-4">
                  <DetailRow icon={Hash} label={T.sampleCode} value={s?.sampleCode} />
                  <DetailRow icon={ClipboardList} label={T.inspectionReferenceNo} value={s?.referenceNo} />
                  <DetailRow icon={ClipboardList} label={T.contractNumber} value={s?.contractNumber ?? r.contractNo} />
                  <DetailRow icon={Building2} label={T.contractorName} value={r.contractorName ?? s?.contractorName} />
                  <DetailRow icon={FileText} label={T.testType} value={resolvedTestType} />
                  <DetailRow
                    icon={CalendarDays}
                    label={T.testDate}
                    value={r.testDate ? new Date(r.testDate).toLocaleDateString(isRtl ? "ar-AE" : "en-GB") : null}
                  />
                  <DetailRow icon={User} label={T.testedBy} value={r.testedBy} />
                </div>
              </div>

              {mainSummary.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {T.resultSummary}
                  </div>
                  <div className="px-4">
                    {mainSummary.map((e) => (
                      <DetailRow key={e.key} icon={Info} label={e.label} value={e.value} />
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="button"
                className="w-full gap-2"
                onClick={handleOpenReport}
              >
                <ExternalLink className="h-4 w-4" />
                {T.viewFullReport}
              </Button>

              <Button type="button" variant="outline" className="w-full" onClick={onClose}>
                {T.close}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
