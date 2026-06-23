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
  SectorSearchBar,
  SectorDateRangePanel,
  SectorTable,
  SectorPagination,
  SectorClearFiltersButton,
  sectorTheme,
} from "./sectorUi";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Circle,
  Eye,
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
    refSearch: "رقم المرجع...",
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
    refSearch: "Ref No. filter...",
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
  const [refSearch, setRefSearch] = useState("");
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
    if (refSearch.trim()) {
      const q = refSearch.trim().toLowerCase();
      if (!(r as any).referenceNo?.toLowerCase().includes(q)) return false;
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
  const hasActiveFilters = resultFilter || readFilter || hasDateFilters || search || refSearch;

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
    setRefSearch("");
    setPage(1);
  };

  return (
    <SectorLayout>
      <SectorPageHeader title={T.title} subtitle={T.subtitle} />

      <div className="mb-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <SectorSearchBar
              value={search}
              onChange={(value) => { setSearch(value); setPage(1); }}
              placeholder={T.search}
              isRtl={isRtl}
            />
          </div>
          <div className="relative sm:w-56">
            <input
              type="text"
              value={refSearch}
              onChange={(e) => { setRefSearch(e.target.value.replace(/\s/g, "")); setPage(1); }}
              placeholder={T.refSearch}
              className={`${sectorTheme.searchInput} ${refSearch ? (isRtl ? "pl-10 pr-4" : "pr-10 pl-4") : ""}`}
            />
            {refSearch && (
              <button
                type="button"
                onClick={() => { setRefSearch(""); setPage(1); }}
                className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition ${isRtl ? "left-4" : "right-4"}`}
                aria-label="Clear ref search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
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
              className={`${sectorTheme.filterPill} ${btn.active ? sectorTheme.filterPillActive : sectorTheme.filterPillIdle}`}
            >
              {btn.label}
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold">{btn.count}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowDateFilters((v) => !v)}
            className={`${sectorTheme.filterPill} ${
              showDateFilters || hasDateFilters ? sectorTheme.filterPillActive : sectorTheme.filterPillIdle
            }`}
          >
            <Calendar className="h-4 w-4" />
            {T.from} / {T.to}
          </button>

          {hasActiveFilters && <SectorClearFiltersButton label={T.clearFilters} onClick={clearFilters} />}
        </div>

        {showDateFilters && (
          <SectorDateRangePanel
            fromLabel={T.from}
            toLabel={T.to}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onFromChange={(value) => { setDateFrom(value); setPage(1); }}
            onToChange={(value) => { setDateTo(value); setPage(1); }}
          />
        )}
      </div>

      <SectorCard>
        {isLoading ? (
          <SectorLoading />
        ) : filtered.length === 0 ? (
          <SectorEmpty icon={FlaskConical} message={T.noData} />
        ) : (
          <SectorTable isRtl={isRtl}>
              <thead>
                <tr className={sectorTheme.tableHeadRow}>
                  <th className="w-5 px-4 py-4" />
                  {[T.sampleCode, T.contractNumber, T.testType, T.result, T.testedBy, T.testDate, T.actions].map((h) => (
                    <th key={h} className={sectorTheme.tableHeadCell}>{h}</th>
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
                      className={`cursor-pointer ${sectorTheme.tableBodyRow} ${
                        showFailAlert
                          ? "bg-red-50/40"
                          : !r.isRead
                            ? "bg-blue-50/30"
                            : i % 2 === 1
                              ? "bg-slate-50/40"
                              : "bg-white"
                      }`}
                      onClick={() => openReport(r.id, testLabel ?? "")}
                    >
                      <td className="px-4 py-4">
                        {showFailAlert ? (
                          <div className="mx-auto h-2.5 w-2.5 rounded-full bg-red-500" title={isRtl ? "تنبيه نتيجة راسبة" : "Failed result alert"} />
                        ) : !r.isRead ? (
                          <div className="mx-auto h-2.5 w-2.5 rounded-full bg-blue-500" />
                        ) : null}
                      </td>
                      <td className={sectorTheme.tableCellMono}>
                        {r.sampleCode}
                        {showFailAlert ? (
                          <span className="ms-2 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{T.fail}</span>
                        ) : !r.isRead ? (
                          <span className="ms-2 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{T.unread}</span>
                        ) : null}
                      </td>
                      <td className={`${sectorTheme.tableCell} font-mono text-slate-600`}>{r.contractNumber ?? "—"}</td>
                      <td className={`${sectorTheme.tableCell} max-w-[260px] break-words font-medium text-slate-800`}>{testLabel ?? "—"}</td>
                      <td className={sectorTheme.tableCell}>
                        <span className={`inline-flex items-center gap-1.5 text-[15px] font-semibold ${isPass ? "text-emerald-700" : isFail ? "text-red-700" : "text-slate-600"}`}>
                          {isPass && <CheckCircle2 className="h-4 w-4" />}
                          {isFail && <XCircle className="h-4 w-4" />}
                          {isPass ? T.pass : isFail ? T.fail : r.overallResult ?? "—"}
                        </span>
                      </td>
                      <td className={sectorTheme.tableCell}>{r.testedBy ?? "—"}</td>
                      <td className={`${sectorTheme.tableCellMuted} whitespace-nowrap`}>
                        {r.testDate ? new Date(r.testDate).toLocaleDateString(isRtl ? "ar-AE" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className={sectorTheme.tableCell}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openReport(r.id, testLabel ?? ""); }}
                          className={sectorTheme.actionButton}
                        >
                          <FileText className="h-4 w-4" />
                          {T.viewReport}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </SectorTable>
        )}

        {(data?.total ?? 0) > limit && !isLoading && (
          <SectorPagination
            total={data?.total ?? 0}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            prevLabel={T.prev}
            nextLabel={T.next}
            pageLabel={T.page}
            totalLabel={T.total}
            isRtl={isRtl}
          />
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
