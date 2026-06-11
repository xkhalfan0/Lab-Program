import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { RETEST_REASONS } from "@shared/retestReasons";

type Props = {
  retestNumber?: number | null;
  originalSampleId?: number | null;
  originalSampleCode?: string | null;
  retestReason?: string | null;
  compact?: boolean;
};

export function RetestBadge({
  retestNumber,
  originalSampleId,
  originalSampleCode,
  retestReason,
  compact = false,
}: Props) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  if (!retestNumber) return null;

  const reasonLabel = RETEST_REASONS.find((r) => r.value === retestReason);

  return (
    <div className={`flex flex-col gap-0.5 ${compact ? "inline-flex" : ""}`}>
      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300 w-fit">
        {isAr ? `إعادة ${retestNumber}` : `Retest ${retestNumber}`}
      </Badge>
      {originalSampleCode && originalSampleId && (
        <span className="text-[10px] text-muted-foreground">
          {isAr ? "الأصل:" : "Original:"}{" "}
          <Link href={`/sample/${originalSampleId}`} className="text-primary hover:underline font-mono">
            {originalSampleCode}
          </Link>
        </span>
      )}
      {!compact && reasonLabel && (
        <span className="text-[10px] text-muted-foreground">
          {isAr ? reasonLabel.ar : reasonLabel.en}
        </span>
      )}
    </div>
  );
}
