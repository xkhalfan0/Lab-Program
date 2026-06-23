import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

export const sectorTheme = {
  pageBg: "bg-slate-50",
  headerGradient: "from-slate-900 via-slate-800 to-blue-950",
  accent: "text-blue-600",
  card: "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
  cardHeader: "border-b border-slate-200 bg-slate-50/90 px-6 py-4",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
  searchInput:
    "h-12 w-full rounded-xl border border-slate-200 bg-white text-base text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
  filterPill:
    "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors",
  filterPillActive: "border-blue-600 bg-blue-600 text-white shadow-sm",
  filterPillIdle: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  filterClear: "inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100",
  table: "w-full border-collapse text-base",
  tableHeadRow: "border-b-2 border-slate-200 bg-slate-100/95",
  tableHeadCell:
    "whitespace-nowrap px-5 py-4 text-start text-sm font-bold tracking-wide text-slate-700",
  tableBodyRow: "border-b border-slate-100 transition-colors hover:bg-blue-50/50",
  tableCell: "px-5 py-4 align-middle text-[15px] text-slate-700 leading-snug",
  tableCellMuted: "px-5 py-4 align-middle text-[15px] text-slate-500 leading-snug",
  tableCellMono:
    "px-5 py-4 align-middle font-mono text-[15px] font-semibold text-blue-700 leading-snug",
  actionButton:
    "inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100",
  paginationBar:
    "flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 px-5 py-4",
  paginationText: "text-sm font-medium text-slate-600",
  paginationButton:
    "inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
  pillActive: "bg-blue-600 text-white border-blue-600",
  pillIdle: "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
};

export function SectorPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-slate-600 leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectorCard({
  children,
  className = "",
  header,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
}) {
  return (
    <div className={`${sectorTheme.card} overflow-hidden ${className}`}>
      {header}
      {children}
    </div>
  );
}

export function SectorCardHeader({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className={`${sectorTheme.cardHeader} flex flex-wrap items-center justify-between gap-3`}>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {meta}
    </div>
  );
}

export function SectorSearchBar({
  value,
  onChange,
  placeholder,
  isRtl,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  isRtl: boolean;
}) {
  return (
    <div className="relative">
      <Search
        className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 ${isRtl ? "right-4" : "left-4"}`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${sectorTheme.searchInput} ${isRtl ? "pr-12 pl-4" : "pl-12 pr-4"}`}
      />
    </div>
  );
}

export function SectorDateRangePanel({
  fromLabel,
  toLabel,
  dateFrom,
  dateTo,
  onFromChange,
  onToChange,
}: {
  fromLabel: string;
  toLabel: string;
  dateFrom: string;
  dateTo: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-5 rounded-2xl border border-slate-200 bg-slate-50/90 p-5">
      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
        <label className="text-sm font-semibold text-slate-600">{fromLabel}</label>
        <input type="date" value={dateFrom} onChange={(e) => onFromChange(e.target.value)} className={sectorTheme.input} />
      </div>
      <div className="flex min-w-[200px] flex-1 flex-col gap-2">
        <label className="text-sm font-semibold text-slate-600">{toLabel}</label>
        <input type="date" value={dateTo} onChange={(e) => onToChange(e.target.value)} className={sectorTheme.input} />
      </div>
    </div>
  );
}

export function SectorTable({
  children,
  isRtl,
}: {
  children: ReactNode;
  isRtl: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={sectorTheme.table} dir={isRtl ? "rtl" : "ltr"}>
        {children}
      </table>
    </div>
  );
}

export function SectorTableHead({ headers }: { headers: string[] }) {
  return (
    <thead>
      <tr className={sectorTheme.tableHeadRow}>
        {headers.map((h) => (
          <th key={h} className={sectorTheme.tableHeadCell}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function SectorPagination({
  total,
  page,
  totalPages,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  pageLabel,
  totalLabel,
  isRtl,
}: {
  total: number;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  pageLabel: string;
  totalLabel: string;
  isRtl: boolean;
}) {
  return (
    <div className={sectorTheme.paginationBar}>
      <span className={sectorTheme.paginationText}>
        {totalLabel}: <span className="font-bold text-slate-800">{total}</span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onPrev} disabled={page === 1} className={sectorTheme.paginationButton}>
          {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {prevLabel}
        </button>
        <span className={sectorTheme.paginationText}>
          {pageLabel} <span className="font-bold text-slate-800">{page}</span> / {totalPages}
        </span>
        <button type="button" onClick={onNext} disabled={page >= totalPages} className={sectorTheme.paginationButton}>
          {nextLabel}
          {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SectorSampleTypeBadge({
  sampleType,
  lang,
}: {
  sampleType?: string | null;
  lang: "ar" | "en";
}) {
  const labels: Record<string, { ar: string; en: string }> = {
    concrete: { ar: "خرسانة", en: "Concrete" },
    soil: { ar: "تربة", en: "Soil" },
    steel: { ar: "حديد", en: "Steel" },
    asphalt: { ar: "أسفلت", en: "Asphalt" },
    metal: { ar: "معادن", en: "Metal" },
    aggregates: { ar: "ركام", en: "Aggregates" },
  };
  const key = (sampleType ?? "").toLowerCase();
  const label = labels[key]?.[lang] ?? sampleType ?? "—";
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
      {label}
    </span>
  );
}

export function SectorLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-9 w-9 animate-spin text-blue-600" />
      {label && <p className="text-base">{label}</p>}
    </div>
  );
}

export function SectorError({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-11 w-11 text-amber-500" />
      <p className="max-w-md text-base leading-relaxed text-slate-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-base font-semibold text-white hover:bg-blue-700"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function SectorEmpty({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-400">
      <Icon className="h-11 w-11" />
      <p className="text-base">{message}</p>
    </div>
  );
}

export function SectorClearFiltersButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={sectorTheme.filterClear}>
      <X className="h-4 w-4" />
      {label}
    </button>
  );
}
