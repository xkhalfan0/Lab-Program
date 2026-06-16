import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang } from "./SectorLayout";
import {
  SectorPageHeader,
  SectorCard,
  SectorLoading,
  SectorError,
  SectorEmpty,
  sectorTheme,
} from "./sectorUi";
import { TestTube2, Search, ChevronLeft, ChevronRight, Calendar, Hash, Building2, X } from "lucide-react";

const t = {
  ar: {
    title: "العينات المستلمة",
    subtitle: "جميع العينات المقدمة من قطاعكم",
    search: "بحث برمز العينة أو رقم العقد أو المقاول...",
    sampleCode: "رمز العينة",
    contractNumber: "رقم العقد",
    contractName: "اسم العقد",
    contractor: "المقاول",
    sampleType: "نوع العينة",
    status: "الحالة",
    receivedAt: "تاريخ الاستلام",
    noData: "لا توجد عينات بعد",
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
    total: "الإجمالي",
    allStatuses: "الكل",
    from: "من تاريخ",
    to: "إلى تاريخ",
    clearFilters: "مسح الفلاتر",
    loadError: "تعذّر تحميل العينات. تحقق من الاتصال أو سجّل الدخول مرة أخرى.",
    retry: "إعادة المحاولة",
    statuses: {
      received: "مستلمة",
      distributed: "موزعة",
      testing_in_progress: "قيد الفحص",
      in_progress: "قيد الفحص",
      processed: "تم الاختبار",
      supervisor_review: "مراجعة نتائج الاختبارات",
      approved: "معتمدة",
      needs_revision: "تحتاج مراجعة",
      rejected: "مرفوضة",
      qc_review: "ضبط الجودة",
      qc_passed: "اجتازت الجودة",
      qc_failed: "رفضت الجودة",
      clearance_issued: "صدرت شهادة براءة الذمة",
    } as Record<string, string>,
  },
  en: {
    title: "Received Samples",
    subtitle: "All samples submitted by your sector",
    search: "Search by sample code, contract no., or contractor...",
    sampleCode: "Sample Code",
    contractNumber: "Contract No.",
    contractName: "Contract Name",
    contractor: "Contractor",
    sampleType: "Sample Type",
    status: "Status",
    receivedAt: "Received At",
    noData: "No samples yet",
    prev: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    total: "Total",
    allStatuses: "All",
    from: "From Date",
    to: "To Date",
    clearFilters: "Clear Filters",
    loadError: "Could not load samples. Check your connection or sign in again.",
    retry: "Retry",
    statuses: {
      received: "Received",
      distributed: "Distributed",
      testing_in_progress: "In Progress",
      in_progress: "In Progress",
      processed: "Tested",
      supervisor_review: "Test Results Review",
      approved: "Approved",
      needs_revision: "Needs Revision",
      rejected: "Rejected",
      qc_review: "Quality Control",
      qc_passed: "QC Passed",
      qc_failed: "QC Failed",
      clearance_issued: "Clearance Issued",
    } as Record<string, string>,
  },
};

const statusColors: Record<string, string> = {
  received: "bg-blue-50 text-blue-700 ring-blue-200",
  distributed: "bg-amber-50 text-amber-700 ring-amber-200",
  testing_in_progress: "bg-violet-50 text-violet-700 ring-violet-200",
  in_progress: "bg-violet-50 text-violet-700 ring-violet-200",
  processed: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  supervisor_review: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  needs_revision: "bg-orange-50 text-orange-700 ring-orange-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  qc_review: "bg-amber-50 text-amber-700 ring-amber-200",
  qc_passed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  qc_failed: "bg-red-50 text-red-700 ring-red-200",
  clearance_issued: "bg-teal-50 text-teal-700 ring-teal-200",
};

function statusLabel(status: string | null | undefined, T: typeof t.ar) {
  const key = status ?? "received";
  return T.statuses[key] ?? key;
}

export default function SectorSamples() {
  const { lang } = useSectorLang();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const T = t[lang];
  const isRtl = lang === "ar";
  const limit = 15;

  const { data, isLoading, isError, refetch } = trpc.sector.getSamples.useQuery({
    page,
    limit,
    search: search.trim() || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const samples = data?.samples ?? [];
  const statusSummary = data?.statusSummary ?? {};
  const totalAll = Object.values(statusSummary).reduce((a, b) => a + b, 0);
  const uniqueStatuses = Object.keys(statusSummary).sort();
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const hasDateFilters = dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter("");
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
          <Search
            className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ${isRtl ? "right-3" : "left-3"}`}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={T.search}
            className={`${sectorTheme.input} ${isRtl ? "pr-10" : "pl-10"}`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === "" ? sectorTheme.pillActive : sectorTheme.pillIdle
            }`}
          >
            {T.allStatuses}
            <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{totalAll}</span>
          </button>

          {uniqueStatuses.map((st) => {
            const isActive = statusFilter === st;
            const count = statusSummary[st] ?? 0;
            const color = statusColors[st] ?? statusColors.received;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isActive ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {statusLabel(st, T)}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : color
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowDateFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showDateFilters || hasDateFilters
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {T.from} / {T.to}
            {hasDateFilters && <span className="h-2 w-2 rounded-full bg-orange-400" />}
          </button>

          {(statusFilter || hasDateFilters || search) && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
            >
              <X className="h-3.5 w-3.5" />
              {T.clearFilters}
            </button>
          )}
        </div>

        {showDateFilters && (
          <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex min-w-[160px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{T.from}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className={sectorTheme.input}
              />
            </div>
            <div className="flex min-w-[160px] flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{T.to}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className={sectorTheme.input}
              />
            </div>
          </div>
        )}
      </div>

      <SectorCard>
        {isLoading ? (
          <SectorLoading />
        ) : isError ? (
          <SectorError message={T.loadError} onRetry={() => refetch()} retryLabel={T.retry} />
        ) : samples.length === 0 ? (
          <SectorEmpty icon={TestTube2} message={T.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir={isRtl ? "rtl" : "ltr"}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {[T.sampleCode, T.contractNumber, T.contractName, T.contractor, T.sampleType, T.status, T.receivedAt].map(
                    (h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => {
                  const color = statusColors[s.status ?? "received"] ?? statusColors.received;
                  return (
                    <tr key={s.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 text-slate-400" />
                          {s.sampleCode}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.contractNumber ?? "—"}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-slate-600">{s.contractName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {s.contractorName ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.sampleType ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${color}`}>
                          {statusLabel(s.status, T)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {s.receivedAt ? new Date(s.receivedAt).toLocaleDateString("en-US") : "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(data?.total ?? 0) > limit && !isLoading && !isError && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">
              {T.total}: {data?.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRtl ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {T.prev}
              </button>
              <span className="text-xs text-slate-500">
                {T.page} {page} {T.of} {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {T.next}
                {isRtl ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </SectorCard>
    </SectorLayout>
  );
}
