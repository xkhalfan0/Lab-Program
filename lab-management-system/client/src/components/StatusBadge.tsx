import { SampleStatus, STATUS_LABELS, STATUS_LABELS_AR } from "@/lib/labTypes";
import { useLanguage } from "@/contexts/LanguageContext";

interface StatusBadgeProps {
  status: SampleStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const { lang, t } = useLanguage();
  const translationKey = `status.${status}`;
  const translated = t(translationKey);
  // If translation key not found, fall back to STATUS_LABELS or raw status
  const fallback =
    lang === "ar"
      ? STATUS_LABELS_AR[status as SampleStatus] ?? STATUS_LABELS[status as SampleStatus]
      : STATUS_LABELS[status as SampleStatus];
  const label = translated !== translationKey ? translated : (fallback ?? status);

  return (
    <span
      className={`inline-flex items-center border px-2.5 py-0.5 rounded-full text-xs font-medium status-${status} ${className}`}
    >
      {label}
    </span>
  );
}
