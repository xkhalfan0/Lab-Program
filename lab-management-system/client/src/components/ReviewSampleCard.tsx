import type { ReactNode } from "react";
import { Building2, ChevronRight, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";

export type ReviewCardAccent = "new" | "incomplete" | "completed" | "disabled";

const ACCENT_CLASS: Record<ReviewCardAccent, string> = {
  new: "border-l-red-500 bg-gradient-to-r from-red-50/50 to-background hover:from-red-50/70",
  incomplete: "border-l-amber-500 bg-gradient-to-r from-amber-50/40 to-background hover:from-amber-50/60",
  completed: "border-l-emerald-500 bg-gradient-to-r from-emerald-50/30 to-background hover:from-emerald-50/50",
  disabled: "border-l-muted bg-muted/20 opacity-90",
};

function parseTestNameEntry(entry: string): { label: string; quantity?: number } {
  const match = entry.match(/^(.+?)\s×(\d+)$/);
  if (match) {
    return { label: match[1].trim(), quantity: Number(match[2]) };
  }
  return { label: entry.trim() };
}

export function SampleTestsPanel({
  testNames,
  className,
  compact,
}: {
  testNames?: string[] | null;
  className?: string;
  compact?: boolean;
}) {
  if (!testNames?.length) return null;

  const items = testNames.map(parseTestNameEntry);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-background/80 shadow-sm overflow-hidden",
        compact ? "max-w-md" : "w-full max-w-2xl",
        className,
      )}
    >
      {items.map((item, idx) => (
        <div
          key={`${item.label}-${idx}`}
          className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border/40 last:border-b-0 rtl:flex-row-reverse"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
            <FlaskConical className="h-4 w-4" />
          </div>
          <p
            className={cn(
              "min-w-0 flex-1 font-medium leading-snug text-foreground break-words text-start",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {item.label}
          </p>
          {item.quantity != null && item.quantity > 1 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
              ×{item.quantity}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReviewSampleCard({
  sample,
  lang,
  accent,
  onClick,
  disabled,
  headerBadges,
  actions,
  showReviewHint = true,
  compact,
  sectorLabel,
  receivedAt,
}: {
  sample: {
    sampleCode: string;
    contractorName?: string | null;
    contractNumber?: string | null;
    contractName?: string | null;
    sampleType?: string | null;
    testNames?: string[] | null;
    sector?: string | null;
    receivedAt?: string | Date | null;
  };
  lang: string;
  accent: ReviewCardAccent;
  onClick: () => void;
  disabled?: boolean;
  headerBadges?: ReactNode;
  actions?: ReactNode;
  showReviewHint?: boolean;
  compact?: boolean;
  sectorLabel?: string | null;
  receivedAt?: string | Date | null;
}) {
  const isAr = lang === "ar";
  const material =
    SAMPLE_TYPE_LABELS[sample.sampleType ?? ""] ?? sample.sampleType ?? "—";
  const contractLine = [sample.contractorName, sample.contractNumber]
    .filter(Boolean)
    .join(" — ");
  const projectLine = sample.contractName?.trim();

  return (
    <Card
      className={cn(
        "group border-l-[5px] transition-all duration-200 overflow-hidden",
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:shadow-md",
        ACCENT_CLASS[disabled ? "disabled" : accent],
      )}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className={cn("p-0", compact ? "p-4" : "")}>
        <div
          className={cn(
            "flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between",
            compact ? "p-0" : "p-4 sm:p-5",
          )}
        >
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-base font-bold tracking-tight text-primary">
                {sample.sampleCode}
              </p>
              {headerBadges}
              {sectorLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <Building2 className="h-3 w-3" />
                  {sectorLabel}
                </span>
              ) : null}
            </div>

            {(contractLine || projectLine) && (
              <div className="space-y-0.5 text-start">
                {contractLine ? (
                  <p className="text-sm text-muted-foreground">{contractLine}</p>
                ) : null}
                {projectLine ? (
                  <p className="text-xs text-muted-foreground/80">{projectLine}</p>
                ) : null}
              </div>
            )}

            <SampleTestsPanel
              testNames={sample.testNames}
              compact={compact}
            />

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {material}
              </span>
              {receivedAt ? (
                <span className="text-xs text-muted-foreground">
                  {isAr ? "استلمت" : "Received"}{" "}
                  {new Date(receivedAt).toLocaleDateString(isAr ? "ar-AE" : "en-GB")}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 pt-3 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:border-s sm:pt-0 sm:ps-5"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
            {showReviewHint && !disabled ? (
              <div
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold text-primary opacity-80 transition-opacity group-hover:opacity-100",
                  isAr && "flex-row-reverse",
                )}
              >
                <span>{isAr ? "مراجعة" : "Review"}</span>
                <ChevronRight className={cn("h-4 w-4", isAr && "rotate-180")} />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
