import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang } from "./SectorLayout";
import { SectorTestResultDialog } from "./SectorTestResultDialog";
import { Link, useLocation } from "wouter";
import {
  SectorPageHeader,
  SectorCard,
  SectorLoading,
  SectorEmpty,
  sectorTheme,
} from "./sectorUi";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  X,
  Calendar,
  FileText,
} from "lucide-react";

const t = {
  ar: {
    title: "أرشيف نتائج الاختبارات",
    subtitle: "جميع نتائج الفحص المعتمدة من المختبر — اضغط على أي نتيجة لعرض التقرير",
    sampleCode: "رمز العينة",
    contractNumber: "رقم العقد",
    testType: "نوع الاختبار",
    result: "النتيجة",
    testedBy: "الفني",
    testDate: "تاريخ الفحص",
    noData: "لا توجد نتائج بعد",
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
    total: "الإجمالي",
    unread: "جديد",
    pass: "ناجح",
    fail: "راسب",
    search: "بحث برمز العينة أو رقم العقد أو نوع الاختبار...",
    clearFilters: "مسح الفلاتر",
    allResults: "الكل",
    from: "من تاريخ",
    to: "إلى تاريخ",
    unreadOnly: "غير مقروءة",
    readOnly: "مقروءة",
    passOnly: "ناجحة",
    failOnly: "راسبة",
    viewReport: "عرض التقرير",
    actions: "إجراءات",
  },
  en: {
    title: "Test Results Archive",
    subtitle: "All approved lab test results — click any row to open the report",
    sampleCode: "Sample Code",
    contractNumber: "Contract No.",
    testType: "Test Type",
    result: "Result",
    testedBy: "Technician",
    testDate: "Test Date",
    noData: "No results yet",
    prev: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    total: "Total",
    unread: "New",
    pass: "Pass",
    fail: "Fail",
    search: "Search by sample code, contract no., or test type...",
    clearFilters: "Clear Filters",
    allResults: "All",
    from: "From Date",
    to: "To Date",
    unreadOnly: "Unread",
    readOnly: "Read",
    passOnly: "Pass",
    failOnly: "Fail",
    viewReport: "View Report",
    actions: "Actions",
  },
};

export default function SectorResults() {
  const { lang } = useSectorLang();
  const [location] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedTestTypeLabel, setSelectedTestTypeLabel] = useState<string>("");
  const T = t[lang];
  const isRtl = lang === "ar";
  const limit = 15;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter === "fail" || filter === "pass") setResultFilter(filter);
  }, [location]);

  const { data, isLoading } = trpc.sector.getTestResults.useQuery({ page, limit });

  const allResults = data?.results ?? [];

  const unreadCount = allResults.filter((r) => !r.isRead).length;
  const readCount = allResults.filter((r) => r.isRead).length;
  const passCount = allResults.filter((r) => r.overallResult?.toLowerCase() === "pass").length;
  const failCount = allResults.filter((r) => r.overallResult?.toLowerCase() === "fail").length;
  const activeFailedCount = data?.activeFailedCount ?? allResults.filter((r) => r.failedAlertActive).length;

  const filtered = allResults.filter((r) => {
    const testLabel = isRtl ? (r.testTypeNameAr ?? r.testType) : (r.testTypeNameEn ?? r.testType);
    if (search) {
      const q = search.toLowerCase();
      const match =
        r.sampleCode?.toLowerCase().includes(q) ||
        r.contractNumber?.toLowerCase().includes(q) ||
        testLabel?.toLowerCase().includes(q) ||
        r.testTypeCode?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (resultFilter === "pass" && r.overallResult?.toLowerCase() !== "pass") return false;
    if (resultFilter === "fail" && r.overallResult?.toLowerCase() !== "fail") return false;
    if (resultFilter === "fail" && !r.failedAlertActive) return false;
    if (readFilter === "unread" && r.isRead) return false;
    if (readFilter === "read" && !r.isRead) return false;
    if (dateFrom && r.testDate && new Date(r.testDate) < new Date(dateFrom)) return false;
    if (dateTo && r.testDate) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(r.testDate) > end) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const hasDateFilters = dateFrom || dateTo;
  const hasActiveFilters = resultFilter || readFilter || hasDateFilters || search;

  const openReport = (id: number, testTypeLabel: string) => {
    setSelectedResultId(id);
    setSelectedTestTypeLabel(testTypeLabel);
  };

  const clearFilters = () => {
    setResultFilter("");
    setReadFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  return (
    <SectorLayout>
      <SectorPageHeader title={T.title} subtitle={T.subtitle} />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ${isRtl ? "right-3" : "left-3"}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={T.search}
            className={`${sectorTheme.input} ${isRtl ? "pr-10" : "pl-10"}`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: T.allResults, count: allResults.length, active: !resultFilter && !readFilter, onClick: () => { setResultFilter(""); setReadFilter(""); setPage(1); } },
            { key: "unread", label: T.unreadOnly, count: unreadCount, active: readFilter === "unread", onClick: () => { setReadFilter(readFilter === "unread" ? "" : "unread"); setPage(1); } },
            { key: "read", label: T.readOnly, count: readCount, active: readFilter === "read", onClick: () => { setReadFilter(readFilter === "read" ? "" : "read"); setPage(1); } },
            { key: "pass", label: T.passOnly, count: passCount, active: resultFilter === "pass", onClick: () => { setResultFilter(resultFilter === "pass" ? "" : "pass"); setPage(1); } },
            { key: "fail", label: T.failOnly, count: activeFailedCount, active: resultFilter === "fail", onClick: () => { setResultFilter(resultFilter === "fail" ? "" : "fail"); setPage(1); } },
          ].map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={btn.onClick}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                btn.active ? sectorTheme.pillActive : sectorTheme.pillIdle
              }`}
            >
              {btn.label}
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{btn.count}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowDateFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              showDateFilters || hasDateFilters ? "border-indigo-600 bg-indigo-600 text-white" : sectorTheme.pillIdle
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {T.from} / {T.to}
          </button>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
              <X className="h-3.5 w-3.5" />
              {T.clearFilters}
            </button>
          )}
        </div>

        {showDateFilters && (
          <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex min-w-[160px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{T.from}</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={sectorTheme.input} />
            </div>
            <div className="flex min-w-[160px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{T.to}</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={sectorTheme.input} />
            </div>
          </div>
        )}
      </div>

      <SectorCard>
        {isLoading ? (
          <SectorLoading />
        ) : filtered.length === 0 ? (
          <SectorEmpty icon={FlaskConical} message={T.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir={isRtl ? "rtl" : "ltr"}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="w-4 px-3 py-3" />
                  {[T.sampleCode, T.contractNumber, T.testType, T.result, T.testedBy, T.testDate, T.actions].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isPass = r.overallResult?.toLowerCase() === "pass";
                  const isFail = r.overallResult?.toLowerCase() === "fail";
                  const testLabel = isRtl ? (r.testTypeNameAr ?? r.testType ?? r.testTypeCode) : (r.testTypeNameEn ?? r.testType ?? r.testTypeCode);
                  const showFailAlert = Boolean(r.failedAlertActive);
                  return (
                    <tr
                      key={r.id}
                      className={`cursor-pointer transition hover:bg-blue-50/50 ${
                        showFailAlert
                          ? "bg-red-50/40"
                          : !r.isRead
                            ? "bg-blue-50/30"
                            : i % 2 === 0
                              ? "bg-white"
                              : "bg-slate-50/50"
                      }`}
                      onClick={() => openReport(r.id, testLabel ?? "")}
                    >
                      <td className="px-3 py-3">
                        {showFailAlert ? (
                          <div className="mx-auto h-2 w-2 rounded-full bg-red-500" title={isRtl ? "تنبيه نتيجة راسبة" : "Failed result alert"} />
                        ) : !r.isRead ? (
                          <div className="mx-auto h-2 w-2 rounded-full bg-blue-500" />
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {r.sampleCode}
                        {showFailAlert ? (
                          <span className="ms-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{T.fail}</span>
                        ) : !r.isRead ? (
                          <span className="ms-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{T.unread}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.contractNumber ?? "—"}</td>
                      <td className="max-w-[220px] px-4 py-3 text-slate-700">{testLabel ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 font-medium ${isPass ? "text-emerald-700" : isFail ? "text-red-700" : "text-slate-600"}`}>
                          {isPass && <CheckCircle2 className="h-4 w-4" />}
                          {isFail && <XCircle className="h-4 w-4" />}
                          {isPass ? T.pass : isFail ? T.fail : r.overallResult ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.testedBy ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {r.testDate ? new Date(r.testDate).toLocaleDateString(isRtl ? "ar-AE" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openReport(r.id, testLabel ?? ""); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {T.viewReport}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(data?.total ?? 0) > limit && !isLoading && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">{T.total}: {data?.total}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">
                {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {T.prev}
              </button>
              <span className="text-xs text-slate-500">{T.page} {page} {T.of} {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">
                {T.next}
                {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </SectorCard>

      <SectorTestResultDialog
        resultId={selectedResultId}
        open={selectedResultId !== null}
        onClose={() => setSelectedResultId(null)}
        lang={lang}
        testTypeLabel={selectedTestTypeLabel}
      />
    </SectorLayout>
  );
}
