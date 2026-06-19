import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang } from "./SectorLayout";
import { buildSectorResultReportHtml } from "./sectorReportUtils";
import { SectorTestResultDialog } from "./SectorTestResultDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Inbox,
  FlaskConical,
  FileCheck2,
  Bell,
  CheckCheck,
  Clock,
  RefreshCw,
  MailOpen,
  Mail,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Printer,
  Download,
  X,
  CalendarDays,
  User,
  Hash,
  Building2,
  FileText,
  ClipboardList,
  ShieldCheck,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";

// ─── i18n ─────────────────────────────────────────────────────────────────────
const T_AR = {
  title: "صندوق الوارد",
  subtitle: "جميع الرسائل والإشعارات الواردة من المختبر",
  all: "الكل",
  results: "نتائج الاختبارات",
  clearances: "براءات الذمة",
  notifications: "الإشعارات",
  unread: "غير مقروء",
  markAllRead: "تحديد الكل كمقروء",
  noMessages: "لا توجد رسائل",
  noMessagesDesc: "ستظهر هنا الإشعارات ونتائج الفحص وطلبات براءة الذمة",
  loading: "جاري التحميل...",
  refresh: "تحديث",
  new: "جديد",
  approved: "مجتاز",
  failed: "راسب",
  failedOnly: "راسبة",
  pending: "قيد المراجعة",
  issued: "صادرة",
  rejected: "مرفوض",
  just_now: "الآن",
  minutes_ago: "دقيقة مضت",
  hours_ago: "ساعة مضت",
  days_ago: "يوم مضى",
  // Detail dialog
  details: "تفاصيل",
  close: "إغلاق",
  print: "طباعة",
  download: "تحميل",
  printAr: "طباعة (عربي)",
  printEn: "Print (English)",
  sampleCode: "رمز العينة",
  inspectionReferenceNo: "رقم مرجع التفتيش",
  contractNumber: "رقم العقد",
  contractName: "اسم العقد",
  contractorName: "اسم المقاول",
  testType: "نوع الاختبار",
  testDate: "تاريخ الفحص",
  testedBy: "أُجري بواسطة",
  overallResult: "النتيجة الإجمالية",
  status: "الحالة",
  notes: "الملاحظات",
  managerReview: "مراجعة المشرف",
  qcReview: "اعتماد ضبط الجودة",
  reviewedBy: "المراجع",
  reviewedAt: "تاريخ المراجعة",
  reviewNotes: "ملاحظات المراجعة",
  testResults: "نتائج الاختبار",
  clearanceDetails: "تفاصيل براءة الذمة",
  requestCode: "رقم الطلب",
  totalTests: "إجمالي الاختبارات",
  passedTests: "الاختبارات المجتازة",
  failedTests: "الاختبارات الراسبة",
  pendingTests: "الاختبارات المعلقة",
  totalAmount: "المبلغ الإجمالي",
  certificateCode: "رقم الشهادة",
  certificateIssuedAt: "تاريخ الإصدار",
  downloadCertificate: "تحميل الشهادة",
  notificationDetails: "تفاصيل الإشعار",
  message: "الرسالة",
  receivedAt: "وقت الاستلام",
  projectName: "اسم المشروع",
  formData: "بيانات الاختبار",
  summaryValues: "القيم الملخصة",
};

const T_EN = {
  title: "Inbox",
  subtitle: "All messages and notifications from the laboratory",
  all: "All",
  results: "Test Results",
  clearances: "Clearances",
  notifications: "Notifications",
  unread: "Unread",
  markAllRead: "Mark all as read",
  noMessages: "No messages",
  noMessagesDesc: "Notifications, test results and clearance requests will appear here",
  loading: "Loading...",
  refresh: "Refresh",
  new: "New",
  approved: "Passed",
  failed: "Failed",
  failedOnly: "Failed",
  pending: "Pending",
  issued: "Issued",
  rejected: "Rejected",
  just_now: "Just now",
  minutes_ago: "min ago",
  hours_ago: "hr ago",
  days_ago: "d ago",
  details: "Details",
  close: "Close",
  print: "Print",
  download: "Download",
  printAr: "طباعة (عربي)",
  printEn: "Print (English)",
  sampleCode: "Sample Code",
  inspectionReferenceNo: "Inspection Reference No.",
  contractNumber: "Contract No.",
  contractName: "Contract Name",
  contractorName: "Contractor",
  testType: "Test Type",
  testDate: "Test Date",
  testedBy: "Tested By",
  overallResult: "Overall Result",
  status: "Status",
  notes: "Notes",
  managerReview: "Manager Review",
  qcReview: "QC Approval",
  reviewedBy: "Reviewed By",
  reviewedAt: "Review Date",
  reviewNotes: "Review Notes",
  testResults: "Test Results",
  clearanceDetails: "Clearance Details",
  requestCode: "Request Code",
  totalTests: "Total Tests",
  passedTests: "Passed Tests",
  failedTests: "Failed Tests",
  pendingTests: "Pending Tests",
  totalAmount: "Total Amount",
  certificateCode: "Certificate No.",
  certificateIssuedAt: "Issue Date",
  downloadCertificate: "Download Certificate",
  notificationDetails: "Notification Details",
  message: "Message",
  receivedAt: "Received At",
  projectName: "Project Name",
  formData: "Test Data",
  summaryValues: "Summary Values",
};

function timeAgo(dateVal: any, lang: string): string {
  if (!dateVal) return "";
  const T = lang === "ar" ? T_AR : T_EN;
  const now = Date.now();
  const then = new Date(dateVal).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return T.just_now;
  if (diff < 3600) return `${Math.floor(diff / 60)} ${T.minutes_ago}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${T.hours_ago}`;
  return `${Math.floor(diff / 86400)} ${T.days_ago}`;
}

function formatDate(dateVal: any, lang: string): string {
  if (!dateVal) return "—";
  return new Date(dateVal).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type InboxItem = {
  id: string;
  type: "result" | "clearance" | "notification";
  title: string;
  titleEn?: string;
  subtitle?: string;
  status?: string;
  isRead: boolean;
  failedAlertActive?: boolean;
  createdAt: any;
  refId: number;
  sampleCode?: string;
  contractNumber?: string;
};

function getTypeConfig(type: string, lang: string, isFail = false) {
  if (type === "result") return {
    icon: FlaskConical,
    color: isFail ? "text-red-600" : "text-blue-600",
    bg: isFail ? "bg-red-100 border-red-300" : "bg-blue-50 border-blue-100",
    label: lang === "ar" ? "نتيجة فحص" : "Test Result",
  };
  if (type === "clearance") return {
    icon: FileCheck2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-100",
    label: lang === "ar" ? "براءة ذمة" : "Clearance",
  };
  return {
    icon: Bell,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-100",
    label: lang === "ar" ? "إشعار" : "Notification",
  };
}

function getStatusBadge(status: string | undefined, lang: string) {
  const T = lang === "ar" ? T_AR : T_EN;
  if (!status) return null;
  const map: Record<string, { label: string; color: string; icon: any }> = {
    approved: { label: T.approved, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    pass: { label: T.approved, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    qc_passed: { label: T.approved, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    fail: { label: T.failed, color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    failed: { label: T.failed, color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    rejected: { label: T.rejected, color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
    pending: { label: T.pending, color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
    issued: { label: T.issued, color: "bg-purple-50 text-purple-700 border-purple-200", icon: CheckCircle2 },
    clearance_issued: { label: T.issued, color: "bg-purple-50 text-purple-700 border-purple-200", icon: CheckCircle2 },
  };
  return map[status] ?? { label: status, color: "bg-slate-50 text-slate-600 border-slate-200", icon: Info };
}

// ─── Detail Row helper ────────────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: any; highlight?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: "rgba(255,255,255,0.05)" }}>
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className={`text-sm font-medium break-words ${highlight ? "text-emerald-300" : "text-slate-200"}`}>
          {String(value)}
        </p>
      </div>
    </div>
  );
}

// ─── Print content builder ────────────────────────────────────────────────────
function buildPrintContent(detail: any, lang: string, labName: string): string {
  const T = lang === "ar" ? T_AR : T_EN;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const font = lang === "ar" ? "'Tajawal', Arial" : "Arial, sans-serif";

  if (detail?.type === "result") {
    return buildSectorResultReportHtml(detail, lang, labName, {
      sampleCode: T.sampleCode,
      inspectionReferenceNo: T.inspectionReferenceNo,
      contractNumber: T.contractNumber,
      projectName: T.projectName,
      contractorName: T.contractorName,
      testType: T.testType,
      testDate: T.testDate,
      testedBy: T.testedBy,
      overallResult: T.overallResult,
      summaryValues: T.summaryValues,
      formData: T.formData,
      notes: T.notes,
      managerReview: T.managerReview,
      qcReview: T.qcReview,
    });
  }

  if (detail?.type === "clearance") {
    const c = detail.clearance;
    return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8">
<style>
  body { font-family: ${font}; direction: ${dir}; margin: 0; padding: 24px; color: #1a1a2e; }
  .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 16px; margin-bottom: 24px; }
  .lab-name { font-size: 22px; font-weight: 700; color: #059669; }
  .report-title { font-size: 16px; color: #374151; margin-top: 4px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { background: #f9fafb; border-radius: 6px; padding: 10px 12px; }
  .field-label { font-size: 11px; color: #6b7280; margin-bottom: 2px; }
  .field-value { font-size: 13px; font-weight: 600; color: #111827; }
  .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; background: #d1fae5; color: #065f46; }
  .footer { text-align: center; margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="header">
  <div class="lab-name">${labName}</div>
  <div class="report-title">${lang === "ar" ? "طلب براءة الذمة" : "Clearance Request"}</div>
  <div style="font-size:12px;color:#6b7280;margin-top:4px">${c.requestCode}</div>
</div>

<div class="section">
  <div class="section-title">${lang === "ar" ? "معلومات الطلب" : "Request Information"}</div>
  <div class="grid">
    <div class="field"><div class="field-label">${T.requestCode}</div><div class="field-value">${c.requestCode}</div></div>
    <div class="field"><div class="field-label">${T.status}</div><div class="field-value"><span class="status-badge">${c.status}</span></div></div>
    <div class="field"><div class="field-label">${T.contractNumber}</div><div class="field-value">${c.contractNumber}</div></div>
    <div class="field"><div class="field-label">${T.contractName}</div><div class="field-value">${c.contractName ?? "—"}</div></div>
    <div class="field"><div class="field-label">${T.contractorName}</div><div class="field-value">${c.contractorName}</div></div>
    <div class="field"><div class="field-label">${T.totalAmount}</div><div class="field-value">${c.totalAmount} AED</div></div>
    <div class="field"><div class="field-label">${T.totalTests}</div><div class="field-value">${c.totalTests}</div></div>
    <div class="field"><div class="field-label">${T.passedTests}</div><div class="field-value">${c.passedTests}</div></div>
  </div>
</div>

${c.certificateCode ? `<div class="section">
  <div class="section-title">${lang === "ar" ? "شهادة براءة الذمة" : "Clearance Certificate"}</div>
  <div class="grid">
    <div class="field"><div class="field-label">${T.certificateCode}</div><div class="field-value">${c.certificateCode}</div></div>
    <div class="field"><div class="field-label">${T.certificateIssuedAt}</div><div class="field-value">${c.certificateIssuedAt ? new Date(c.certificateIssuedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : "—"}</div></div>
  </div>
</div>` : ""}

${c.notes ? `<div class="section">
  <div class="section-title">${T.notes}</div>
  <div style="background:#f9fafb;border-radius:6px;padding:12px;font-size:13px;color:#374151">${c.notes}</div>
</div>` : ""}

<div class="footer">${lang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory"} — ${new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</div>
</body></html>`;
  }

  // notification
  const n = detail?.notification;
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="UTF-8">
<style>
  body { font-family: ${font}; direction: ${dir}; margin: 0; padding: 24px; color: #1a1a2e; }
  .header { text-align: center; border-bottom: 3px solid #d97706; padding-bottom: 16px; margin-bottom: 24px; }
  .lab-name { font-size: 22px; font-weight: 700; color: #d97706; }
  .content { background: #f9fafb; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.7; color: #374151; }
  .footer { text-align: center; margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="header">
  <div class="lab-name">${labName}</div>
  <div style="font-size:16px;color:#374151;margin-top:4px">${n?.title ?? ""}</div>
  <div style="font-size:12px;color:#6b7280;margin-top:4px">${n?.createdAt ? new Date(n.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { year: "numeric", month: "long", day: "numeric" }) : ""}</div>
</div>
<div class="content">${n?.content ?? ""}</div>
<div class="footer">${lang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory"} — ${new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</div>
</body></html>`;
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────
function InboxDetailDialog({
  item,
  onClose,
  lang,
}: {
  item: InboxItem | null;
  onClose: () => void;
  lang: string;
}) {
  const T = lang === "ar" ? T_AR : T_EN;
  const isRtl = lang === "ar";
  const printLang = useRef<string>(lang);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const { data: detail, isLoading } = trpc.sector.getInboxItemDetail.useQuery(
    { type: item?.type ?? "notification", refId: item?.refId ?? 0 },
    { enabled: !!item, staleTime: 30000 }
  );

  const getFilename = useCallback((dlLang: string) => {
    const ext = "pdf";
    if (item?.type === "result") return `test-result-${item?.sampleCode ?? item?.refId}-${dlLang}.${ext}`;
    if (item?.type === "clearance") return `clearance-${item?.contractNumber ?? item?.refId}-${dlLang}.${ext}`;
    return `notification-${item?.refId}-${dlLang}.${ext}`;
  }, [item]);

  const generatePdf = useCallback(async (pdfLang: string): Promise<Blob | null> => {
    const labName = pdfLang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory";
    const html = buildPrintContent(detail, pdfLang, labName);
    const filename = getFilename(pdfLang);
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
    } catch (err) {
      console.error("[PDF] Generation failed:", err);
      return null;
    } finally {
      setIsPdfLoading(false);
    }
  }, [detail, getFilename]);

  async function handlePrint(printLangChoice: string) {
    const blob = await generatePdf(printLangChoice);
    if (!blob) {
      // Fallback to browser print
      const labName = printLangChoice === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory";
      const html = buildPrintContent(detail, printLangChoice, labName);
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 500);
      return;
    }
    // Open PDF in new tab for printing
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 1000);
    } else {
      URL.revokeObjectURL(url);
    }
  }

  async function handleDownload(dlLang: string) {
    const blob = await generatePdf(dlLang);
    if (!blob) {
      // Fallback to HTML download
      const labName = dlLang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory";
      const html = buildPrintContent(detail, dlLang, labName);
      const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(htmlBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFilename(dlLang).replace(".pdf", ".html");
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getFilename(dlLang);
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!item) return null;

  const typeConf = getTypeConfig(item.type, lang);
  const TypeIcon = typeConf.icon;
  const title = isRtl ? item.title : (item.titleEn ?? item.title);

  return (
    <Dialog open={!!item} onOpenChange={() => onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto p-0"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white",
        }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-white/10"
          style={{ background: "rgba(15,23,42,0.95)", backdropFilter: "blur(8px)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0 ${typeConf.bg}`}>
              <TypeIcon className={`w-4.5 h-4.5 ${typeConf.color}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold text-white truncate">{title}</DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">{timeAgo(item.createdAt, lang)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Print buttons */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePrint("ar")}
                disabled={isLoading || !detail || isPdfLoading}
                className="gap-1.5 text-xs h-8"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(148,163,184,0.9)", background: "rgba(255,255,255,0.05)" }}
                title="طباعة بالعربي"
              >
                {isPdfLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                ع
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePrint("en")}
                disabled={isLoading || !detail || isPdfLoading}
                className="gap-1.5 text-xs h-8"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(148,163,184,0.9)", background: "rgba(255,255,255,0.05)" }}
                title="Print in English"
              >
                {isPdfLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                EN
              </Button>
            </div>
            {/* Download */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(lang)}
              disabled={isLoading || !detail || isPdfLoading}
              className="gap-1.5 text-xs h-8"
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(148,163,184,0.9)", background: "rgba(255,255,255,0.05)" }}
            >
              {isPdfLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isPdfLoading ? (lang === "ar" ? "جاري التوليد..." : "Generating...") : T.download}</span>
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          ) : !detail ? (
            <div className="text-center py-12 text-slate-500">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{isRtl ? "تعذّر تحميل التفاصيل" : "Failed to load details"}</p>
            </div>
          ) : detail.type === "result" ? (
            <ResultDetail detail={detail} T={T} lang={lang} />
          ) : detail.type === "clearance" ? (
            <ClearanceDetail detail={detail} T={T} lang={lang} />
          ) : (
            <NotificationDetail detail={detail} T={T} lang={lang} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Result Detail ────────────────────────────────────────────────────────────
function ResultDetail({ detail, T, lang }: { detail: any; T: typeof T_AR; lang: string }) {
  const r = detail.result;
  const s = detail.sample;
  const isRtl = lang === "ar";

  const overallBadge = r.overallResult === "pass"
    ? { label: T.approved, color: "bg-green-500/20 text-green-300 border-green-500/30", icon: CheckCircle2 }
    : r.overallResult === "fail"
    ? { label: T.failed, color: "bg-red-500/20 text-red-300 border-red-500/30", icon: XCircle }
    : { label: T.pending, color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", icon: Clock };

  return (
    <div className="space-y-5">
      {/* Result badge */}
      <div className="flex items-center justify-center">
        <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-bold border ${overallBadge.color}`}>
          <overallBadge.icon className="w-5 h-5" />
          {overallBadge.label}
        </span>
      </div>

      {/* Sample info */}
      <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">{isRtl ? "معلومات العينة" : "Sample Information"}</span>
        </div>
        <div className="px-4 divide-y divide-white/5">
          <DetailRow icon={Hash} label={T.sampleCode} value={s?.sampleCode} />
          <DetailRow icon={ClipboardList} label={T.inspectionReferenceNo} value={s?.referenceNo} />
          <DetailRow icon={ClipboardList} label={T.contractNumber} value={s?.contractNumber ?? r.contractNo} />
          <DetailRow icon={Building2} label={T.projectName} value={r.projectName} />
          <DetailRow icon={User} label={T.contractorName} value={r.contractorName} />
          <DetailRow icon={FileText} label={T.testType} value={r.testTypeCode} />
          <DetailRow icon={CalendarDays} label={T.testDate} value={r.testDate ? new Date(r.testDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : null} />
          <DetailRow icon={User} label={T.testedBy} value={r.testedBy} />
        </div>
      </div>

      {/* Summary values */}
      {r.summaryValues && Object.keys(r.summaryValues as object).length > 0 && (
        <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">{T.summaryValues}</span>
          </div>
          <div className="px-4 divide-y divide-white/5">
            {Object.entries(r.summaryValues as Record<string, any>).map(([k, v]) => (
              <DetailRow key={k} icon={Info} label={k} value={String(v)} />
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {r.notes && (
        <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-xs text-slate-500 mb-1.5">{T.notes}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{r.notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-3">
        {/* Manager */}
        <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-300">{T.managerReview}</span>
          </div>
          {r.managerReviewedByName ? (
            <>
              <p className="text-sm font-semibold text-blue-300">{r.managerReviewedByName}</p>
              {r.managerReviewedAt && (
                <p className="text-xs text-slate-500 mt-1">{new Date(r.managerReviewedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</p>
              )}
              {r.managerNotes && <p className="text-xs text-slate-400 mt-2 italic">{r.managerNotes}</p>}
            </>
          ) : (
            <p className="text-xs text-slate-600 italic">{isRtl ? "لم تتم المراجعة بعد" : "Not reviewed yet"}</p>
          )}
        </div>
        {/* QC */}
        <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BadgeCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">{T.qcReview}</span>
          </div>
          {r.qcReviewedByName ? (
            <>
              <p className="text-sm font-semibold text-emerald-300">{r.qcReviewedByName}</p>
              {r.qcReviewedAt && (
                <p className="text-xs text-slate-500 mt-1">{new Date(r.qcReviewedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</p>
              )}
              {r.qcNotes && <p className="text-xs text-slate-400 mt-2 italic">{r.qcNotes}</p>}
            </>
          ) : (
            <p className="text-xs text-slate-600 italic">{isRtl ? "لم يتم الاعتماد بعد" : "Not approved yet"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Clearance Detail ─────────────────────────────────────────────────────────
function ClearanceDetail({ detail, T, lang }: { detail: any; T: typeof T_AR; lang: string }) {
  const c = detail.clearance;
  const isRtl = lang === "ar";
  const statusBadge = getStatusBadge(c.status, lang);

  return (
    <div className="space-y-5">
      {/* Status */}
      {statusBadge && statusBadge.label && (
        <div className="flex items-center justify-center">
          <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-bold border ${statusBadge.color}`}>
            {statusBadge.icon && <statusBadge.icon className="w-5 h-5" />}
            {statusBadge.label}
          </span>
        </div>
      )}

      {/* Request info */}
      <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">{T.clearanceDetails}</span>
        </div>
        <div className="px-4 divide-y divide-white/5">
          <DetailRow icon={Hash} label={T.requestCode} value={c.requestCode} />
          <DetailRow icon={ClipboardList} label={T.contractNumber} value={c.contractNumber} />
          <DetailRow icon={Building2} label={T.contractName} value={c.contractName} />
          <DetailRow icon={User} label={T.contractorName} value={c.contractorName} />
          <DetailRow icon={CalendarDays} label={isRtl ? "تاريخ الطلب" : "Request Date"} value={c.createdAt ? new Date(c.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : null} />
        </div>
      </div>

      {/* Tests summary */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: T.totalTests, value: c.totalTests, color: "text-slate-200" },
          { label: T.passedTests, value: c.passedTests, color: "text-green-300" },
          { label: T.failedTests, value: c.failedTests, color: "text-red-300" },
          { label: T.pendingTests, value: c.pendingTests, color: "text-yellow-300" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/8 p-4 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-2xl font-bold mb-1" style={{ color: color.replace("text-", "") }}>{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Amount */}
      <div className="rounded-xl border border-emerald-500/20 p-4 text-center" style={{ background: "rgba(16,185,129,0.05)" }}>
        <p className="text-xs text-slate-500 mb-1">{T.totalAmount}</p>
        <p className="text-2xl font-bold text-emerald-300">{c.totalAmount} <span className="text-sm font-normal text-slate-400">AED</span></p>
      </div>

      {/* Certificate */}
      {c.certificateCode && (
        <div className="rounded-xl border border-purple-500/20 p-4" style={{ background: "rgba(168,85,247,0.05)" }}>
          <div className="flex items-center gap-2 mb-3">
            <BadgeCheck className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-purple-300">{isRtl ? "شهادة براءة الذمة" : "Clearance Certificate"}</span>
          </div>
          <div className="space-y-2">
            <DetailRow icon={Hash} label={T.certificateCode} value={c.certificateCode} />
            <DetailRow icon={CalendarDays} label={T.certificateIssuedAt} value={c.certificateIssuedAt ? new Date(c.certificateIssuedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : null} />
          </div>
          {c.certificatePdfUrl && (
            <a
              href={c.certificatePdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-2 justify-center w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "rgba(168,85,247,0.2)", color: "#c4b5fd", border: "1px solid rgba(168,85,247,0.3)" }}
            >
              <Download className="w-4 h-4" />
              {T.downloadCertificate}
            </a>
          )}
        </div>
      )}

      {c.notes && (
        <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-xs text-slate-500 mb-1.5">{T.notes}</p>
          <p className="text-sm text-slate-300 leading-relaxed">{c.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Notification Detail ──────────────────────────────────────────────────────
function NotificationDetail({ detail, T, lang }: { detail: any; T: typeof T_AR; lang: string }) {
  const n = detail.notification;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 p-5" style={{ background: "rgba(245,158,11,0.05)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">{n?.title}</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{n?.content}</p>
      </div>
      <DetailRow icon={CalendarDays} label={T.receivedAt} value={n?.createdAt ? new Date(n.createdAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-GB") : null} />
    </div>
  );
}

// ─── Inbox Row ────────────────────────────────────────────────────────────────
function isResultFail(item: InboxItem) {
  return item.type === "result" && (item.status === "fail" || item.status === "failed");
}

function isFailedResultAlert(item: InboxItem) {
  return item.type === "result" && Boolean(item.failedAlertActive);
}

function InboxRow({ item, lang, onClick }: { item: InboxItem; lang: string; onClick: () => void }) {
  const T = lang === "ar" ? T_AR : T_EN;
  const isRtl = lang === "ar";
  const isFail = isFailedResultAlert(item);
  const typeConf = getTypeConfig(item.type, lang, isFail);
  const statusBadge = getStatusBadge(item.status, lang);
  const TypeIcon = typeConf.icon;
  const title = isRtl ? item.title : (item.titleEn ?? item.title);

  return (
    <div
      className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
        isFail
          ? "border-red-400 bg-red-50 ring-2 ring-red-200 hover:bg-red-100/80"
          : !item.isRead
            ? "border-blue-200 bg-blue-50/60 hover:border-blue-300 hover:bg-blue-50"
            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
      }`}
      onClick={onClick}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${typeConf.bg}`}>
        {isFail ? <XCircle className="h-5 w-5 text-red-600" /> : <TypeIcon className={`h-5 w-5 ${typeConf.color}`} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {!item.isRead && !isFail && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
              {isFail && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {T.failed}
                </span>
              )}
              <span className={`truncate text-sm font-semibold ${isFail ? "text-red-900" : !item.isRead ? "text-slate-900" : "text-slate-700"}`}>
                {title}
              </span>
              {!isFail && statusBadge && statusBadge.label && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge.color}`}>
                  {statusBadge.icon && <statusBadge.icon className="h-3 w-3" />}
                  {statusBadge.label}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className={`mt-0.5 truncate text-xs ${isFail ? "text-red-700/80" : "text-slate-500"}`}>{item.subtitle}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className={`text-xs ${isFail ? "text-red-600" : "text-slate-400"}`}>{timeAgo(item.createdAt, lang)}</span>
            {!item.isRead ? <Mail className={`h-4 w-4 ${isFail ? "text-red-500" : "text-blue-500"}`} /> : <MailOpen className="h-4 w-4 text-slate-400" />}
          </div>
        </div>
      </div>

      <ChevronRight className={`mt-1 h-4 w-4 flex-shrink-0 ${isFail ? "text-red-500" : "text-slate-400"} ${isRtl ? "rotate-180" : ""}`} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SectorInbox() {
  const { lang } = useSectorLang();
  const T = lang === "ar" ? T_AR : T_EN;
  const isRtl = lang === "ar";

  const [filter, setFilter] = useState<"all" | "result" | "clearance" | "notification" | "unread" | "failed">("all");
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);

  const { data, isLoading, refetch } = trpc.sector.getInbox.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const markAllRead = trpc.sector.markAllNotificationsRead.useMutation({
    onSuccess: () => refetch(),
  });

  const items: InboxItem[] = data?.items ?? [];

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "unread") list = items.filter((i) => !i.isRead);
    else if (filter === "failed") list = items.filter((i) => isFailedResultAlert(i));
    else if (filter !== "all") list = items.filter((i) => i.type === filter);

    if (filter === "all") {
      return [...list].sort((a, b) => {
        const aFail = isFailedResultAlert(a) ? 0 : 1;
        const bFail = isFailedResultAlert(b) ? 0 : 1;
        if (aFail !== bFail) return aFail - bFail;
        return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      });
    }
    return list;
  }, [items, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    unread: items.filter((i) => !i.isRead).length,
    result: items.filter((i) => i.type === "result").length,
    clearance: items.filter((i) => i.type === "clearance").length,
    notification: items.filter((i) => i.type === "notification").length,
    failed: items.filter((i) => isFailedResultAlert(i)).length,
  }), [items]);

  const filterBtns: { key: typeof filter; label: string; icon: any; count: number; danger?: boolean }[] = [
    { key: "all", label: T.all, icon: Inbox, count: counts.all },
    { key: "unread", label: T.unread, icon: Mail, count: counts.unread },
    { key: "result", label: T.results, icon: FlaskConical, count: counts.result },
    { key: "failed", label: T.failedOnly, icon: XCircle, count: counts.failed, danger: true },
    { key: "clearance", label: T.clearances, icon: FileCheck2, count: counts.clearance },
    { key: "notification", label: T.notifications, icon: Bell, count: counts.notification },
  ];

  return (
    <SectorLayout>
      <div className="max-w-3xl mx-auto space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{T.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{T.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {counts.unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="gap-1.5 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {T.markAllRead}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden text-xs sm:inline">{T.refresh}</span>
            </Button>
          </div>
        </div>

        {/* Failed results alert */}
        {counts.failed > 0 && filter !== "failed" && (
          <button
            type="button"
            onClick={() => setFilter("failed")}
            className="flex w-full items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-left transition hover:bg-red-100"
          >
            <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {isRtl
                ? `${counts.failed} نتيجة راسبة — اضغط للعرض`
                : `${counts.failed} failed result${counts.failed > 1 ? "s" : ""} — tap to view`}
            </span>
          </button>
        )}

        {/* Unread badge */}
        {counts.unread > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600" />
            <span className="text-sm text-blue-800">
              {isRtl
                ? `لديك ${counts.unread} رسالة غير مقروءة`
                : `You have ${counts.unread} unread message${counts.unread > 1 ? "s" : ""}`}
            </span>
          </div>
        )}

        {/* Filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {filterBtns.map(({ key, label, icon: Icon, count, danger }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? danger
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-blue-600 bg-blue-600 text-white"
                    : danger
                      ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : danger ? "bg-red-100" : "bg-slate-100"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Messages list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-slate-600">{T.noMessages}</p>
              <p className="mt-1 text-sm text-slate-400">{T.noMessagesDesc}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <InboxRow
                key={item.id}
                item={item}
                lang={lang}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      {selectedItem?.type === "result" ? (
        <SectorTestResultDialog
          resultId={selectedItem.refId}
          open={!!selectedItem}
          onClose={() => { setSelectedItem(null); refetch(); }}
          lang={lang as "ar" | "en"}
          testTypeLabel={selectedItem.subtitle?.split(" — ").slice(1).join(" — ")}
        />
      ) : (
        <InboxDetailDialog
          item={selectedItem}
          onClose={() => { setSelectedItem(null); refetch(); }}
          lang={lang}
        />
      )}
    </SectorLayout>
  );
}
