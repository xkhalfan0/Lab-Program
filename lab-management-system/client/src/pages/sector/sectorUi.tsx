import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export const sectorTheme = {
  pageBg: "bg-slate-50",
  headerGradient: "from-slate-900 via-slate-800 to-blue-950",
  accent: "text-blue-600",
  card: "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
  cardHeader: "border-b border-slate-100 bg-slate-50/80 px-5 py-4",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectorCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${sectorTheme.card} overflow-hidden ${className}`}>{children}</div>;
}

export function SectorLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      {label && <p className="text-sm">{label}</p>}
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
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function SectorEmpty({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-slate-400">
      <Icon className="h-10 w-10" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
