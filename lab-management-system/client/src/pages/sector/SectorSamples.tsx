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
import { TestTube2, Search, ChevronLeft, ChevronRight, Calendar, Hash, Building2, X, FileText } from "lucide-react";

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
    receipt: "وصل الاستلام",
    viewReceipt: "عرض الوصل",
    receivedAt: "تاريخ الاستلام",
    noData: "لا توجد عينات بعد",
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
    total: "الإجمالي",
    from: "من تاريخ",
    to: "إلى تاريخ",
    clearFilters: "مسح الفلاتر",
    loadError: "تعذّر تحميل العينات. تحقق من الاتصال أو سجّل الدخول مرة أخرى.",
    retry: "إعادة المحاولة",
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
    receipt: "Receipt",
    viewReceipt: "View receipt",
    receivedAt: "Received At",
    noData: "No samples yet",
    prev: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    total: "Total",
    from: "From Date",
    to: "To Date",
    clearFilters: "Clear Filters",
    loadError: "Could not load samples. Check your connection or sign in again.",
    retry: "Retry",
  },
};

export default function SectorSamples() {
  const { lang } = useSectorLang();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
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
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const samples = data?.samples ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const hasDateFilters = dateFrom || dateTo;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  const openReceipt = (sampleId: number) => {
    window.open(`/sector/receipt/${sampleId}?lang=${lang}`, "_blank", "noopener,noreferrer");
  };

  const headers = [T.sampleCode, T.contractNumber, T.contractName, T.contractor, T.sampleType, T.receipt, T.receivedAt];

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

          {(hasDateFilters || search) && (
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
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => (
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
                      <button
                        type="button"
                        onClick={() => openReceipt(s.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                        title={T.viewReceipt}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {T.viewReceipt}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {s.receivedAt ? new Date(s.receivedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : "—"}
                      </div>
                    </td>
                  </tr>
                ))}
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
