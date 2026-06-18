import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang } from "./SectorLayout";
import { FileCheck2, CheckCircle2, Clock, Circle, ChevronLeft, ChevronRight, Eye, ExternalLink, Search, X, Plus, Upload, FileText, AlertCircle, Calendar } from "lucide-react";
import { Loader2 } from "lucide-react";

const CLEARANCE_LETTER_MAX_BYTES = 10 * 1024 * 1024;
const CLEARANCE_LETTER_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

function validateContractorLetterFile(file: File, lang: "ar" | "en"): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExt = ["pdf", "jpg", "jpeg", "png"];
  const allowedMime = ["application/pdf", "image/jpeg", "image/png", ""];

  if (!allowedExt.includes(ext) && !allowedMime.includes(file.type)) {
    return lang === "ar"
      ? "نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG."
      : "Unsupported file type. Use PDF, JPG, or PNG.";
  }
  if (file.size > CLEARANCE_LETTER_MAX_BYTES) {
    return lang === "ar"
      ? "حجم الملف كبير جداً. الحد الأقصى 10 ميغابايت."
      : "File is too large. Maximum size is 10 MB.";
  }
  if (file.size <= 0) {
    return lang === "ar" ? "الملف فارغ." : "The file is empty.";
  }
  return null;
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      const payload = result.includes(",") ? result.split(",")[1] : result;
      if (!payload) {
        reject(new Error("Could not encode file"));
        return;
      }
      resolve(payload);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const t = {
  ar: {
    title: "براءة الذمة",
    subtitle: "حالة طلبات براءة الذمة لعقودكم",
    requestCode: "رمز الطلب",
    contractNumber: "رقم العقد",
    contractName: "اسم العقد",
    contractor: "المقاول",
    totalTests: "إجمالي الاختبارات",
    passed: "ناجح",
    failed: "راسب",
    status: "الحالة",
    issuedAt: "تاريخ الإصدار",
    certificate: "الشهادة",
    noData: "لا توجد طلبات براءة الذمة بعد",
    requestClearance: "طلب براءة ذمة",
    newRequest: "طلب جديد",
    selectContract: "اختر العقد",
    contractLabel: "العقد",
    contractorLetter: "كتاب المقاول",
    contractorLetterHint: "ارفع كتاب المقاول الرسمي (PDF أو صورة — حتى 10 م.ب)",
    uploadFile: "رفع ملف",
    fileSelected: "تم اختيار الملف",
    notesLabel: "ملاحظات",
    notesPlaceholder: "أي ملاحظات إضافية...",
    submit: "إرسال الطلب",
    cancel: "إلغاء",
    submitting: "جاري الإرسال...",
    successMsg: "تم إرسال طلب براءة الذمة بنجاح",
    errorConflict: "يوجد طلب براءة ذمة مفتوح لهذا العقد",
    errorGeneral: "حدث خطأ، يرجى المحاولة مرة أخرى",
    noContracts: "لا توجد عقود مرتبطة بهذا القطاع",
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
    total: "الإجمالي",
    unread: "جديد",
    markRead: "تحديد كمقروء",
    unreadCount: "براءات جديدة",
    allRead: "لا توجد براءات جديدة",
    download: "تحميل",
    search: "بحث برمز الطلب أو رقم العقد أو اسم العقد...",
    filters: "فلترة",
    clearFilters: "مسح الفلاتر",
    allStatuses: "جميع الطلبات",
    from: "من تاريخ",
    to: "إلى تاريخ",
    readStatus: "حالة القراءة",
    allReadStatus: "الكل",
    unreadOnly: "جديدة فقط",
    readOnly: "مقروءة فقط",
    filterNew: "جديدة",
    filterInProgress: "قيد الإجراء",
    filterCompleted: "مكتملة",
    statuses: {
      pending: "بانتظار مراجعة ضبط الجودة",
      under_review: "قيد المراجعة",
      approved: "معتمدة",
      issued: "صدرت الشهادة",
      rejected: "مرفوضة",
      inventory_ready: "معتمد من QC — بانتظار أمر الدفع",
      payment_ordered: "معتمد — أمر الدفع صدر",
      docs_uploaded: "مستندات مرفوعة — بانتظار الإصدار",
    } as Record<string, string>,
  },
  en: {
    title: "Clearance Certificate",
    subtitle: "Clearance certificate status for your contracts",
    requestCode: "Request Code",
    contractNumber: "Contract No.",
    contractName: "Contract Name",
    contractor: "Contractor",
    totalTests: "Total Tests",
    passed: "Passed",
    failed: "Failed",
    status: "Status",
    issuedAt: "Issued At",
    certificate: "Certificate",
    noData: "No clearance requests yet",
    requestClearance: "Request Clearance",
    newRequest: "New Request",
    selectContract: "Select Contract",
    contractLabel: "Contract",
    contractorLetter: "Contractor Letter",
    contractorLetterHint: "Upload the official contractor letter (PDF or image — max 10 MB)",
    uploadFile: "Upload File",
    fileSelected: "File selected",
    notesLabel: "Notes",
    notesPlaceholder: "Any additional notes...",
    submit: "Submit Request",
    cancel: "Cancel",
    submitting: "Submitting...",
    successMsg: "Clearance request submitted successfully",
    errorConflict: "An open clearance request already exists for this contract",
    errorGeneral: "An error occurred, please try again",
    noContracts: "No contracts linked to this sector",
    prev: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    total: "Total",
    unread: "New",
    markRead: "Mark as read",
    unreadCount: "New clearances",
    allRead: "No new clearances",
    download: "Download",
    search: "Search by request code, contract no., or contract name...",
    filters: "Filters",
    clearFilters: "Clear Filters",
    allStatuses: "All Requests",
    from: "From Date",
    to: "To Date",
    readStatus: "Read Status",
    allReadStatus: "All",
    unreadOnly: "New only",
    readOnly: "Read only",
    filterNew: "New",
    filterInProgress: "In Progress",
    filterCompleted: "Completed",
    statuses: {
      pending: "Awaiting QC Review",
      under_review: "Under Review",
      approved: "Approved",
      issued: "Certificate Issued",
      rejected: "Rejected",
      inventory_ready: "QC Approved — Awaiting Payment Order",
      payment_ordered: "Approved — Payment Order Issued",
      docs_uploaded: "Docs Uploaded — Awaiting Certificate",
    } as Record<string, string>,
  },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "rgba(245,158,11,0.1)", text: "#d97706" },
  under_review: { bg: "rgba(139,92,246,0.1)", text: "#7c3aed" },
  approved: { bg: "rgba(59,130,246,0.1)", text: "#2563eb" },
  issued: { bg: "rgba(16,185,129,0.12)", text: "#047857" },
  rejected: { bg: "rgba(239,68,68,0.1)", text: "#dc2626" },
  payment_ordered: { bg: "rgba(245,158,11,0.12)", text: "#b45309" },
  inventory_ready: { bg: "rgba(16,185,129,0.1)", text: "#059669" },
  docs_uploaded: { bg: "rgba(99,102,241,0.1)", text: "#4f46e5" },
};

export default function SectorClearances() {
  const { lang } = useSectorLang();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<number | "">("");
  const [contractorLetterFile, setContractorLetterFile] = useState<File | null>(null);
  const [requestNotes, setRequestNotes] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const T = t[lang];
  const isRtl = lang === "ar";
  const limit = 15;

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sector.getClearances.useQuery({ page, limit });
  const { data: sectorContracts } = trpc.sector.getSectorContracts.useQuery();

  const createRequest = trpc.sector.createClearanceRequest.useMutation({
    onSuccess: () => {
      setSubmitSuccess(true);
      setSubmitError("");
      setShowNewRequest(false);
      setSelectedContractId("");
      setContractorLetterFile(null);
      setRequestNotes("");
      utils.sector.getClearances.invalidate();
      utils.sector.getDashboardStats.invalidate();
    },
    onError: (err) => {
      if (err.message?.includes("CONFLICT") || err.message?.includes("already exists")) {
        setSubmitError(T.errorConflict);
      } else if (err.message?.includes("upload contractor letter") || err.message?.includes("Invalid file") || err.message?.includes("File too large") || err.message?.includes("Empty file")) {
        setSubmitError(
          lang === "ar" && err.message.includes("Invalid file")
            ? "نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG."
            : lang === "ar" && err.message.includes("File too large")
              ? "حجم الملف كبير جداً. الحد الأقصى 10 ميغابايت."
              : lang === "ar" && (err.message.includes("upload contractor letter") || err.message.includes("Could not upload"))
                ? "تعذر رفع كتاب المقاول. تحقق من نوع الملف (PDF/صورة) أو أرسل الطلب بدون ملف."
                : err.message
        );
      } else if (err.message && err.message.length < 120) {
        setSubmitError(err.message);
      } else {
        setSubmitError(T.errorGeneral);
      }
    },
  });

  const handleSubmitRequest = async () => {
    if (!selectedContractId) return;
    setSubmitError("");
    let base64: string | undefined;
    let fileName: string | undefined;
    if (contractorLetterFile) {
      const fileError = validateContractorLetterFile(contractorLetterFile, lang);
      if (fileError) {
        setSubmitError(fileError);
        return;
      }
      try {
        base64 = await readFileAsBase64(contractorLetterFile);
        fileName = contractorLetterFile.name;
      } catch {
        setSubmitError(lang === "ar" ? "تعذر قراءة الملف. حاول مرة أخرى." : "Could not read the file. Please try again.");
        return;
      }
    }
    createRequest.mutate({
      contractId: selectedContractId as number,
      contractorLetterBase64: base64,
      contractorLetterFileName: fileName,
      notes: requestNotes || undefined,
    });
  };

  const handleContractorLetterChange = (file: File | null) => {
    if (!file) {
      setContractorLetterFile(null);
      setSubmitError("");
      return;
    }
    const fileError = validateContractorLetterFile(file, lang);
    if (fileError) {
      setContractorLetterFile(null);
      setSubmitError(fileError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSubmitError("");
    setContractorLetterFile(file);
  };

  const markRead = trpc.sector.markClearanceRead.useMutation({
    onSuccess: () => {
      utils.sector.getClearances.invalidate();
      utils.sector.getUnreadCount.invalidate();
      utils.sector.getDashboardStats.invalidate();
    },
  });

  const filtered = (data?.clearances ?? []).filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.requestCode?.toLowerCase().includes(q) ||
        c.contractNumber?.toLowerCase().includes(q) ||
        c.contractName?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (statusFilter === "__inprogress__") {
      if (!["pending","under_review","payment_ordered","inventory_ready"].includes(c.status ?? "")) return false;
    } else if (statusFilter === "__completed__") {
      if (!["issued","approved"].includes(c.status ?? "")) return false;
    } else if (statusFilter) {
      if (c.status !== statusFilter) return false;
    }
    if (readFilter === "unread" && c.isRead) return false;
    if (readFilter === "read" && !c.isRead) return false;
    if (dateFrom && c.certificateIssuedAt) {
      if (new Date(c.certificateIssuedAt) < new Date(dateFrom)) return false;
    }
    if (dateTo && c.certificateIssuedAt) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (new Date(c.certificateIssuedAt) > toDate) return false;
    }
    return true;
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);
  const hasDateFilters = dateFrom || dateTo;
  const hasActiveFilters = statusFilter || readFilter || hasDateFilters;
  const uniqueStatuses = Array.from(new Set((data?.clearances ?? []).map(c => c.status).filter(Boolean)));

  // Counts per status
  const statusCounts: Record<string, number> = {};
  for (const c of (data?.clearances ?? [])) {
    const st = c.status ?? "pending";
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
  }
  const unreadItemCount = (data?.clearances ?? []).filter(c => !c.isRead).length;
  const readItemCount = (data?.clearances ?? []).filter(c => c.isRead).length;

  const clearFilters = () => {
    setStatusFilter("");
    setReadFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  return (
    <SectorLayout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#1e293b" }}>{T.title}</h1>
            <p className="text-base mt-1.5" style={{ color: "#64748b" }}>{T.subtitle}</p>
          </div>
          <button
              onClick={() => { setShowNewRequest(true); setSubmitSuccess(false); setSubmitError(""); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all"
              style={{ background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer" }}>
              <Plus className="w-5 h-5" />
              {T.requestClearance}
            </button>
        </div>

        {/* Search */}
        <div className="relative w-full mb-5">
          <Search className="absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{
            color: "#94a3b8",
            [isRtl ? "right" : "left"]: "14px",
          }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={T.search}
            className="w-full h-11 rounded-xl text-base outline-none"
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              paddingInlineStart: "42px",
              paddingInlineEnd: "16px",
              color: "#1e293b",
            }}
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2.5 mb-4">
          {/* All Requests */}
          {([
            { key: "all", label: T.allStatuses, filter: () => { setStatusFilter(""); setReadFilter(""); }, isActive: !statusFilter && !readFilter, color: "#3b82f6", count: (data?.clearances ?? []).length },
            { key: "new", label: T.filterNew, filter: () => { setReadFilter(readFilter === "unread" ? "" : "unread"); setStatusFilter(""); }, isActive: readFilter === "unread", color: "#10b981", count: unreadItemCount },
            { key: "inprogress", label: T.filterInProgress, filter: () => { setStatusFilter(statusFilter === "__inprogress__" ? "" : "__inprogress__"); setReadFilter(""); }, isActive: statusFilter === "__inprogress__", color: "#f59e0b", count: (data?.clearances ?? []).filter(c => ["pending","under_review","payment_ordered","inventory_ready"].includes(c.status ?? "")).length },
            { key: "completed", label: T.filterCompleted, filter: () => { setStatusFilter(statusFilter === "__completed__" ? "" : "__completed__"); setReadFilter(""); }, isActive: statusFilter === "__completed__", color: "#059669", count: (data?.clearances ?? []).filter(c => ["issued","approved"].includes(c.status ?? "")).length },
          ] as { key: string; label: string; filter: () => void; isActive: boolean; color: string; count: number }[]).map(btn => (
            <button
              key={btn.key}
              onClick={() => { btn.filter(); setPage(1); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: btn.isActive ? btn.color : "#fff",
                border: `1px solid ${btn.isActive ? btn.color : "#e2e8f0"}`,
                color: btn.isActive ? "#fff" : "#475569",
              }}>
              {btn.label}
              <span className="px-2 py-0.5 rounded-full text-sm font-bold min-w-[1.5rem] text-center"
                style={{ background: btn.isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9", color: btn.isActive ? "#fff" : "#64748b" }}>
                {btn.count}
              </span>
            </button>
          ))}

          {/* Date filter toggle */}
          <button
            onClick={() => setShowDateFilters(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: showDateFilters || hasDateFilters ? "#6366f1" : "#fff",
              border: `1px solid ${showDateFilters || hasDateFilters ? "#6366f1" : "#e2e8f0"}`,
              color: showDateFilters || hasDateFilters ? "#fff" : "#475569",
            }}>
            <Calendar className="w-4 h-4" />
            {T.from} / {T.to}
            {hasDateFilters && <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />}
          </button>

          {/* Clear all */}
          {(hasActiveFilters || search) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}>
              <X className="w-4 h-4" />
              {T.clearFilters}
            </button>
          )}
        </div>

        {/* Date filter panel */}
        {showDateFilters && (
          <div className="rounded-xl p-5 mb-4 flex flex-wrap gap-5"
            style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div className="flex flex-col gap-2 min-w-[180px]">
              <label className="text-sm font-medium" style={{ color: "#64748b" }}>{T.from}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-10 py-2 px-3 rounded-lg text-base outline-none"
                style={{ background: "#fff", border: "1px solid #e2e8f0", color: "#1e293b" }}
              />
            </div>
            <div className="flex flex-col gap-2 min-w-[180px]">
              <label className="text-sm font-medium" style={{ color: "#64748b" }}>{T.to}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-10 py-2 px-3 rounded-lg text-base outline-none"
                style={{ background: "#fff", border: "1px solid #e2e8f0", color: "#1e293b" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Table Card */}
      <div className="rounded-2xl overflow-hidden bg-white"
        style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.05)" }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-52">
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#3b82f6" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 gap-4">
            <FileCheck2 className="w-14 h-14" style={{ color: "#cbd5e1" }} />
            <p className="text-base" style={{ color: "#94a3b8" }}>{T.noData}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base" dir={isRtl ? "rtl" : "ltr"}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th className="px-5 py-4 font-semibold text-start w-4 text-sm" style={{ color: "#475569" }}></th>
                  {[T.requestCode, T.contractNumber, T.contractName, T.totalTests, T.status, T.issuedAt, T.certificate, ""].map((h) => (
                    <th key={h} className="px-5 py-4 font-semibold text-start text-sm" style={{ color: "#475569", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const sc = statusColors[c.status ?? "pending"] ?? statusColors.pending;
                  return (
                    <tr key={c.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: !c.isRead
                          ? "rgba(16,185,129,0.04)"
                          : i % 2 === 0 ? "#fff" : "#fafafa",
                      }}>
                      <td className="px-4 py-4">
                        {!c.isRead && <div className="w-2.5 h-2.5 rounded-full bg-green-500 mx-auto" />}
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-[15px]" style={{ color: "#1e293b" }}>
                        {c.requestCode}
                        {!c.isRead && (
                          <span className="ms-2 px-2 py-0.5 rounded text-sm font-medium"
                            style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
                            {T.unread}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4" style={{ color: "#475569" }}>{c.contractNumber ?? "—"}</td>
                      <td className="px-5 py-4 max-w-[200px] truncate" style={{ color: "#475569" }}>{c.contractName ?? "—"}</td>
                      <td className="px-5 py-4">
                        <div className="text-center">
                          <div className="font-semibold text-lg" style={{ color: "#1e293b" }}>{c.totalTests ?? 0}</div>
                          <div className="text-sm mt-0.5" style={{ color: "#64748b" }}>
                            <span style={{ color: "#059669" }}>{c.passedTests ?? 0} {T.passed}</span>
                            {" / "}
                            <span style={{ color: "#dc2626" }}>{c.failedTests ?? 0} {T.failed}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit"
                          style={{ background: sc.bg, color: sc.text }}>
                          {c.status === "issued" ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          {T.statuses[c.status ?? "pending"] ?? c.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-[15px]" style={{ color: "#64748b" }}>
                        {c.certificateIssuedAt
                          ? new Date(c.certificateIssuedAt).toLocaleDateString("en-US")
                          : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {c.certificatePdfUrl ? (
                          <a
                            href={c.certificatePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={{
                              background: "rgba(16,185,129,0.08)",
                              border: "1px solid rgba(16,185,129,0.2)",
                              color: "#059669",
                            }}>
                            <ExternalLink className="w-4 h-4" />
                            {T.download}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {!c.isRead && (
                          <button
                            onClick={() => markRead.mutate({ clearanceId: c.id })}
                            disabled={markRead.isPending}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={{
                              background: "rgba(16,185,129,0.08)",
                              border: "1px solid rgba(16,185,129,0.2)",
                              color: "#059669",
                              cursor: "pointer",
                            }}>
                            <Eye className="w-4 h-4" />
                            {T.markRead}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(data?.total ?? 0) > limit && (
          <div className="flex items-center justify-between px-5 py-4 border-t" style={{ borderColor: "#e2e8f0" }}>
            <span className="text-sm" style={{ color: "#64748b" }}>
              {T.total}: {data?.total}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: page === 1 ? "#f1f5f9" : "#fff",
                  border: "1px solid #e2e8f0",
                  color: page === 1 ? "#94a3b8" : "#475569",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }}>
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                {T.prev}
              </button>
              <span className="text-sm font-medium" style={{ color: "#64748b" }}>
                {T.page} {page} {T.of} {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: page >= totalPages ? "#f1f5f9" : "#fff",
                  border: "1px solid #e2e8f0",
                  color: page >= totalPages ? "#94a3b8" : "#475569",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                }}>
                {T.next}
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Clearance Request Dialog */}
      {showNewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="rounded-2xl shadow-2xl p-7 w-full max-w-lg mx-4" style={{ background: "#fff" }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: "#1e293b" }}>{T.newRequest}</h2>
              <button onClick={() => setShowNewRequest(false)} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contract selector */}
            <div className="mb-5">
              <label className="block text-base font-medium mb-2" style={{ color: "#374151" }}>{T.contractLabel}</label>
              {(!sectorContracts || sectorContracts.length === 0) ? (
                <p className="text-base" style={{ color: "#ef4444" }}>{T.noContracts}</p>
              ) : (
                <select
                  value={selectedContractId}
                  onChange={(e) => setSelectedContractId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full h-11 py-2 px-3 rounded-xl text-base outline-none"
                  style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#1e293b" }}>
                  <option value="">{T.selectContract}</option>
                  {sectorContracts.map((c) => (
                    <option key={c.contractId} value={c.contractId}>
                      {c.contractNumber} {c.contractName ? `— ${c.contractName}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Contractor letter upload */}
            <div className="mb-5">
              <label className="block text-base font-medium mb-2" style={{ color: "#374151" }}>{T.contractorLetter}</label>
              <p className="text-sm mb-2" style={{ color: "#64748b" }}>{T.contractorLetterHint}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={CLEARANCE_LETTER_ACCEPT}
                className="hidden"
                onChange={(e) => handleContractorLetterChange(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-medium w-full transition-all"
                style={{
                  background: contractorLetterFile ? "rgba(16,185,129,0.08)" : "#f8fafc",
                  border: "1px dashed",
                  borderColor: contractorLetterFile ? "#10b981" : "#cbd5e1",
                  color: contractorLetterFile ? "#059669" : "#64748b",
                  cursor: "pointer",
                  justifyContent: "center",
                }}>
                {contractorLetterFile ? (
                  <><FileText className="w-4 h-4" /> {contractorLetterFile.name}</>
                ) : (
                  <><Upload className="w-4 h-4" /> {T.uploadFile}</>
                )}
              </button>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-base font-medium mb-2" style={{ color: "#374151" }}>{T.notesLabel}</label>
              <textarea
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder={T.notesPlaceholder}
                rows={3}
                className="w-full py-3 px-3 rounded-xl text-base outline-none resize-none"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#1e293b" }}
              />
            </div>

            {/* Error */}
            {submitError && (
              <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#ef4444" }} />
                <span className="text-sm" style={{ color: "#dc2626" }}>{submitError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewRequest(false)}
                className="flex-1 h-11 rounded-xl text-base font-semibold"
                style={{ background: "#f1f5f9", color: "#64748b", border: "none", cursor: "pointer" }}>
                {T.cancel}
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={!selectedContractId || createRequest.isPending}
                className="flex-1 h-11 rounded-xl text-base font-semibold flex items-center justify-center gap-2"
                style={{
                  background: !selectedContractId || createRequest.isPending ? "#94a3b8" : "#3b82f6",
                  color: "#fff",
                  border: "none",
                  cursor: !selectedContractId || createRequest.isPending ? "not-allowed" : "pointer",
                }}>
                {createRequest.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> {T.submitting}</> : T.submit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {submitSuccess && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl shadow-lg pointer-events-auto" style={{ background: "#10b981", color: "#fff" }}>
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">{T.successMsg}</span>
            <button onClick={() => setSubmitSuccess(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", marginInlineStart: "8px" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </SectorLayout>
  );
}
