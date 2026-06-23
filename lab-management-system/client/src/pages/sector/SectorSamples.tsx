import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang } from "./SectorLayout";
import {
  SectorPageHeader,
  SectorCard,
  SectorCardHeader,
  SectorLoading,
  SectorError,
  SectorEmpty,
  SectorSearchBar,
  SectorDateRangePanel,
  SectorTable,
  SectorTableHead,
  SectorPagination,
  SectorSampleTypeBadge,
  SectorClearFiltersButton,
  sectorTheme,
} from "./sectorUi";
import { TestTube2, Calendar, Building2, FileText } from "lucide-react";

const t = {
  ar: {
    title: "العينات المستلمة",
    subtitle: "جميع العينات المقدمة من قطاعكم — يمكنكم عرض وصل الاستلام لكل عينة",
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
    listTitle: "قائمة العينات",
    dateFilter: "تصفية بالتاريخ",
  },
  en: {
    title: "Received Samples",
    subtitle: "All samples submitted by your sector — open the reception receipt for any sample",
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
    listTitle: "Sample list",
    dateFilter: "Date range",
  },
};

function formatReceivedDate(value: string | Date | null | undefined, lang: "ar" | "en") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasDateFilters = Boolean(dateFrom || dateTo);
  const hasActiveFilters = hasDateFilters || Boolean(search.trim());

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

      <div className="mb-5 space-y-4">
        <SectorSearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={T.search}
          isRtl={isRtl}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDateFilters((v) => !v)}
            className={`${sectorTheme.filterPill} ${
              showDateFilters || hasDateFilters ? sectorTheme.filterPillActive : sectorTheme.filterPillIdle
            }`}
          >
            <Calendar className="h-4 w-4" />
            {T.dateFilter}
            {hasDateFilters && <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />}
          </button>

          {hasActiveFilters && <SectorClearFiltersButton label={T.clearFilters} onClick={clearFilters} />}
        </div>

        {showDateFilters && (
          <SectorDateRangePanel
            fromLabel={T.from}
            toLabel={T.to}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onFromChange={(value) => {
              setDateFrom(value);
              setPage(1);
            }}
            onToChange={(value) => {
              setDateTo(value);
              setPage(1);
            }}
          />
        )}
      </div>

      <SectorCard
        header={
          <SectorCardHeader
            title={T.listTitle}
            meta={
              !isLoading && !isError ? (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
                  {T.total}: {total}
                </span>
              ) : null
            }
          />
        }
      >
        {isLoading ? (
          <SectorLoading />
        ) : isError ? (
          <SectorError message={T.loadError} onRetry={() => refetch()} retryLabel={T.retry} />
        ) : samples.length === 0 ? (
          <SectorEmpty icon={TestTube2} message={T.noData} />
        ) : (
          <>
            <SectorTable isRtl={isRtl}>
              <SectorTableHead headers={headers} />
              <tbody>
                {samples.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`${sectorTheme.tableBodyRow} ${i % 2 === 1 ? "bg-slate-50/40" : "bg-white"}`}
                  >
                    <td className={sectorTheme.tableCellMono}>{s.sampleCode}</td>
                    <td className={`${sectorTheme.tableCell} font-mono text-slate-600`}>{s.contractNumber ?? "—"}</td>
                    <td className={`${sectorTheme.tableCell} max-w-[220px] break-words font-medium text-slate-800`}>
                      {s.contractName ?? "—"}
                    </td>
                    <td className={sectorTheme.tableCell}>
                      <div className="flex items-start gap-2">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span className="break-words">{s.contractorName ?? "—"}</span>
                      </div>
                    </td>
                    <td className={sectorTheme.tableCell}>
                      <SectorSampleTypeBadge sampleType={s.sampleType} lang={lang} />
                    </td>
                    <td className={sectorTheme.tableCell}>
                      <button
                        type="button"
                        onClick={() => openReceipt(s.id)}
                        className={sectorTheme.actionButton}
                        title={T.viewReceipt}
                      >
                        <FileText className="h-4 w-4" />
                        {T.viewReceipt}
                      </button>
                    </td>
                    <td className={sectorTheme.tableCellMuted}>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                        {formatReceivedDate(s.receivedAt, lang)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SectorTable>

            {total > limit && (
              <SectorPagination
                total={total}
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
          </>
        )}
      </SectorCard>
    </SectorLayout>
  );
}
