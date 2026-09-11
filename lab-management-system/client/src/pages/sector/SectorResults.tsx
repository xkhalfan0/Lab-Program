import { useState, useEffect, useMemo } from "react";
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
  SectorSegmentedFilter,
  sectorTheme,
} from "./sectorUi";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Circle,
  Eye,
  Calendar,
  FileText,
} from "lucide-react";

const t = {
  ar: {
    title: "أرشيف نتائج الاختبارات",
    subtitle: "جميع نتائج الفحص المعتمدة من المختبر — اضغط على أي نتيجة لعرض التقرير",
    sampleCode: "رمز العينة",
    contractNumber: "رقم العقد",
    inspectionReferenceNo: "رقم مرجع التفتيش",
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
    search: "بحث برمز العينة أو مرجع التفتيش...",
    clearFilters: "مسح الفلاتر",
    allResults: "الكل",
    allContracts: "كل العقود",
    allTestTypes: "كل الاختبارات",
    filterContract: "رقم العقد",
    filterTestType: "نوع الاختبار",
    from: "من تاريخ",
    to: "إلى تاريخ",
    filterStatus: "الحالة",
    filterResult: "النتيجة",
    unreadOnly: "جديد",
    readOnly: "مقروء",
    passOnly: "ناجح",
    failOnly: "راسب",
    viewReport: "عرض التقرير",
    actions: "إجراءات",
  },
  en: {
    title: "Test Results Archive",
    subtitle: "All approved lab test results — click any row to open the report",
    sampleCode: "Sample Code",
    contractNumber: "Contract No.",
    inspectionReferenceNo: "Inspection Reference No.",
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
    search: "Search by sample code or inspection ref....",
    clearFilters: "Clear Filters",
    allResults: "All",
    allContracts: "All contracts",
    allTestTypes: "All test types",
    filterContract: "Contract No.",
    filterTestType: "Test Type",
    from: "From Date",
    to: "To Date",
    filterStatus: "Status",
    filterResult: "Result",
    unreadOnly: "New",
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
  const [contractFilter, setContractFilter] = useState("");
  const [testTypeFilter, setTestTypeFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedResultSource, setSelectedResultSource] = useState<"specialized" | "legacy" | undefined>();
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

  const contractOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of allResults) {
      const contractNumber = r.contractNumber?.trim();
      if (contractNumber) values.add(contractNumber);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [allResults]);

  const testTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allResults) {
      const code = (r.testTypeCode || r.testType || "").trim();
      if (!code) continue;
      const label =
        (isRtl ? (r.testTypeNameAr ?? r.testType) : (r.testTypeNameEn ?? r.testType)) || code;
      if (!map.has(code)) map.set(code, label);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], isRtl ? "ar" : "en"));
  }, [allResults, isRtl]);

  const filtered = allResults.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        r.sampleCode?.toLowerCase().includes(q) ||
        r.referenceNo?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (contractFilter && r.contractNumber !== contractFilter) return false;
    if (testTypeFilter) {
      const code = (r.testTypeCode || r.testType || "").trim();
      if (code !== testTypeFilter) return false;
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
  const hasActiveFilters =
    resultFilter || readFilter || hasDateFilters || search || contractFilter || testTypeFilter;

  const openReport = (
    id: number,
    testTypeLabel: string,
    resultSource?: "specialized" | "legacy",
  ) => {
    setSelectedResultId(id);
    setSelectedResultSource(resultSource);
    setSelectedTestTypeLabel(testTypeLabel);
  };

  const clearFilters = () => {
    setResultFilter("");
    setReadFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setContractFilter("");
    setTestTypeFilter("");
    setPage(1);
  };

  const filterSelectClass =
    "h-[42px] min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <SectorLayout>
      <SectorPageHeader title={T.title} subtitle={T.subtitle} />

      <div className="mb-5 space-y-4">
        <SectorSearchBar
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          placeholder={T.search}
          isRtl={isRtl}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="inline-flex flex-col gap-1.5">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{T.filterContract}</span>
            <select
              value={contractFilter}
              onChange={(e) => { setContractFilter(e.target.value); setPage(1); }}
              className={filterSelectClass}
            >
              <option value="">{T.allContracts}</option>
              {contractOptions.map((contractNumber) => (
                <option key={contractNumber} value={contractNumber}>{contractNumber}</option>
              ))}
            </select>
          </div>

          <div className="inline-flex flex-col gap-1.5">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{T.filterTestType}</span>
            <select
              value={testTypeFilter}
              onChange={(e) => { setTestTypeFilter(e.target.value); setPage(1); }}
              className={`${filterSelectClass} min-w-[220px]`}
            >
              <option value="">{T.allTestTypes}</option>
              {testTypeOptions.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <SectorSegmentedFilter
            label={T.filterStatus}
            value={readFilter}
            onChange={(value) => { setReadFilter(value); setPage(1); }}
            options={[
              { value: "", label: T.allResults },
              { value: "unread", label: T.unreadOnly, count: unreadCount },
              { value: "read", label: T.readOnly, count: readCount },
            ]}
          />

          <SectorSegmentedFilter
            label={T.filterResult}
            value={resultFilter}
            onChange={(value) => { setResultFilter(value); setPage(1); }}
            options={[
              { value: "", label: T.allResults },
              { value: "pass", label: T.passOnly, count: passCount },
              { value: "fail", label: T.failOnly, count: activeFailedCount },
            ]}
          />

          <div className="inline-flex flex-col gap-1.5">
            <span className="h-[18px]" aria-hidden />
            <button
              type="button"
              onClick={() => setShowDateFilters((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                showDateFilters || hasDateFilters
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Calendar className="h-4 w-4" />
              {T.from} / {T.to}
            </button>
          </div>

          {hasActiveFilters && (
            <div className="inline-flex flex-col gap-1.5">
              <span className="h-[18px]" aria-hidden />
              <SectorClearFiltersButton label={T.clearFilters} onClick={clearFilters} />
            </div>
          )}
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
                  {[T.sampleCode, T.contractNumber, T.inspectionReferenceNo, T.testType, T.result, T.testedBy, T.testDate, T.actions].map((h) => (
                    <th key={h} className={sectorTheme.tableHeadCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isPass = r.overallResult?.toLowerCase() === "pass";
                  const isFail = r.overallResult?.toLowerCase() === "fail";
                  const testLabel =
                    (isRtl
                      ? (r.testTypeNameAr || r.testType || r.testTypeCode)
                      : (r.testTypeNameEn || r.testType || r.testTypeCode)) || "—";
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
                      onClick={() => openReport(r.id, testLabel, r.resultSource)}
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
                      <td className={`${sectorTheme.tableCell} font-mono text-slate-600`}>{r.referenceNo?.trim() || "—"}</td>
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
                          onClick={(e) => { e.stopPropagation(); openReport(r.id, testLabel, r.resultSource); }}
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
        resultSource={selectedResultSource}
        open={selectedResultId !== null}
        onClose={() => {
          setSelectedResultId(null);
          setSelectedResultSource(undefined);
        }}
        lang={lang}
        testTypeLabel={selectedTestTypeLabel}
      />
    </SectorLayout>
  );
}
