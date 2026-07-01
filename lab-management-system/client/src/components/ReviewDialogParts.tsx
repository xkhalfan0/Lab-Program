import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  CheckSquare,
  Clock,
  ExternalLink,
  RotateCcw,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const REVIEW_DIALOG_CLASS =
  "max-w-2xl sm:max-w-3xl lg:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0";

export function ReviewDialogShell({
  lang,
  icon: Icon,
  title,
  code,
  badge,
  children,
}: {
  lang: string;
  icon: LucideIcon;
  title: string;
  code?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogContent className={REVIEW_DIALOG_CLASS} dir={lang === "ar" ? "rtl" : "ltr"}>
      <DialogHeader className="shrink-0 border-b bg-slate-50/90 px-6 py-5 space-y-0">
        <DialogTitle className="flex items-center gap-4 text-base font-semibold leading-tight">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </span>
            {code && (
              <span className="mt-0.5 block font-mono text-xl font-bold tracking-tight text-foreground">
                {code}
              </span>
            )}
          </span>
          {badge}
        </DialogTitle>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </DialogContent>
  );
}

export function ReviewDialogBody({ children }: { children: ReactNode }) {
  return <div className="space-y-6 px-6 py-5">{children}</div>;
}

/** Section heading inside the dialog body — creates clear visual hierarchy. */
export function ReviewSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="border-b border-slate-100 pb-2">
        <h3 className="text-base font-bold tracking-tight text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReviewDialogLoading({ lang }: { lang: string }) {
  return (
    <ReviewDialogBody>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
        <p className="text-base text-muted-foreground">
          {lang === "ar" ? "جاري تحميل النتائج..." : "Loading results..."}
        </p>
      </div>
    </ReviewDialogBody>
  );
}

export function ReviewReportAction({
  lang,
  onClick,
}: {
  lang: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 text-start shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100">
        <ExternalLink className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-foreground">
          {lang === "ar" ? "فتح تقرير الاختبار" : "Open Test Report"}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {lang === "ar" ? "عرض النتائج الكاملة في نافذة جديدة" : "View full results in a new tab"}
        </span>
      </span>
    </button>
  );
}

type TimelineKind = "supervisor" | "qc" | "warning" | "success" | "neutral";

const TIMELINE_STYLES: Record<TimelineKind, { dot: string; border: string; bg: string; title: string }> = {
  supervisor: {
    dot: "bg-teal-500",
    border: "border-teal-100",
    bg: "bg-teal-50/50",
    title: "text-teal-900",
  },
  qc: {
    dot: "bg-emerald-500",
    border: "border-emerald-100",
    bg: "bg-emerald-50/50",
    title: "text-emerald-900",
  },
  warning: {
    dot: "bg-amber-500",
    border: "border-amber-100",
    bg: "bg-amber-50/50",
    title: "text-amber-900",
  },
  success: {
    dot: "bg-green-500",
    border: "border-green-100",
    bg: "bg-green-50/50",
    title: "text-green-900",
  },
  neutral: {
    dot: "bg-slate-400",
    border: "border-slate-100",
    bg: "bg-slate-50/80",
    title: "text-slate-900",
  },
};

export function ReviewTimeline({
  title,
  items,
}: {
  title?: string;
  items: Array<{
    id: string | number;
    kind: TimelineKind;
    title: string;
    decision?: string;
    comments?: string | null;
    signature?: string | null;
    date?: Date | string | null;
    lang: string;
  }>;
}) {
  if (!items.length) return null;
  return (
    <ReviewSection title={title ?? (items[0]?.lang === "ar" ? "سجل المراجعات" : "Review History")}>
      <div className="space-y-3">
        {items.map((item) => {
          const style = TIMELINE_STYLES[item.kind];
          return (
            <div
              key={item.id}
              className={`relative rounded-xl border ${style.border} ${style.bg} px-5 py-4 ps-9`}
            >
              <span className={`absolute start-3.5 top-5 h-2.5 w-2.5 rounded-full ${style.dot}`} />
              <p className={`text-sm font-bold uppercase tracking-wide ${style.title}`}>{item.title}</p>
              {item.decision && (
                <p className="mt-2 text-base">
                  <span className="text-sm text-muted-foreground">
                    {item.lang === "ar" ? "القرار: " : "Decision: "}
                  </span>
                  <span className="font-semibold capitalize">{item.decision.replace(/_/g, " ")}</span>
                </p>
              )}
              {item.comments && (
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{item.comments}</p>
              )}
              {item.signature && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-black/5 pt-3 text-sm text-muted-foreground">
                  <UserCheck className="h-4 w-4 shrink-0" />
                  <span className="font-semibold text-foreground/80">{item.signature}</span>
                  {item.date && (
                    <span>
                      · {new Date(item.date).toLocaleDateString(item.lang === "ar" ? "ar-AE" : "en-GB")}
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ReviewSection>
  );
}

export function ReviewStatusNotice({
  variant,
  children,
}: {
  variant: "warning" | "info" | "success";
  children: ReactNode;
}) {
  const styles = {
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-blue-200 bg-blue-50 text-blue-950",
    success: "border-green-200 bg-green-50 text-green-950",
  };
  const icons = {
    warning: Clock,
    info: Clock,
    success: CheckCircle,
  };
  const Icon = icons[variant];
  return (
    <div className={`flex gap-3 rounded-xl border px-5 py-4 text-base leading-relaxed ${styles[variant]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 opacity-70" />
      <div>{children}</div>
    </div>
  );
}

export function ReviewDecisionTiles({
  lang,
  decision,
  disabled,
  onSelect,
}: {
  lang: string;
  decision: "approved" | "needs_revision" | "rejected" | null;
  disabled?: boolean;
  onSelect: (d: "approved" | "needs_revision" | "rejected") => void;
}) {
  const options = [
    {
      id: "approved" as const,
      icon: CheckSquare,
      label: lang === "ar" ? "اعتماد" : "Approve",
      hint: lang === "ar" ? "النتيجة مقبولة" : "Result accepted",
      active: "border-green-500 bg-green-50 text-green-800 shadow-md",
      idle: "border-slate-200 hover:border-green-300 hover:bg-green-50/40",
      iconActive: "text-green-600",
    },
    {
      id: "needs_revision" as const,
      icon: RotateCcw,
      label: lang === "ar" ? "طلب مراجعة" : "Revision",
      hint: lang === "ar" ? "إعادة للفني" : "Return to technician",
      active: "border-amber-500 bg-amber-50 text-amber-800 shadow-md",
      idle: "border-slate-200 hover:border-amber-300 hover:bg-amber-50/40",
      iconActive: "text-amber-600",
    },
    {
      id: "rejected" as const,
      icon: XCircle,
      label: lang === "ar" ? "رفض" : "Reject",
      hint: lang === "ar" ? "النتيجة مرفوضة" : "Result rejected",
      active: "border-red-500 bg-red-50 text-red-800 shadow-md",
      idle: "border-slate-200 hover:border-red-300 hover:bg-red-50/40",
      iconActive: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((opt) => {
        const selected = decision === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.id)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition-all ${
              selected ? opt.active : opt.idle
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <Icon className={`h-7 w-7 ${selected ? opt.iconActive : "text-muted-foreground"}`} />
            <span className="text-sm font-bold">{opt.label}</span>
            <span className="text-xs leading-tight text-center opacity-75">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ReviewNotesField({
  lang,
  decision,
  value,
  disabled,
  onChange,
}: {
  lang: string;
  decision: "approved" | "needs_revision" | "rejected" | null;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const required = decision === "rejected" || decision === "needs_revision";
  return (
    <div className="space-y-2">
      <Label className="text-base font-bold text-foreground">
        {lang === "ar" ? "ملاحظات" : "Notes"}
        {required ? (
          <span className="ms-2 text-sm font-medium text-red-500">
            {lang === "ar" ? "(إلزامي)" : "(required)"}
          </span>
        ) : (
          <span className="ms-2 text-sm font-normal text-muted-foreground">
            {lang === "ar" ? "(اختياري)" : "(optional)"}
          </span>
        )}
      </Label>
      <Textarea
        rows={4}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          decision === "rejected"
            ? lang === "ar"
              ? "اكتب سبب الرفض بوضوح..."
              : "Clearly state the reason for rejection..."
            : decision === "needs_revision"
              ? lang === "ar"
                ? "اكتب ما يجب تعديله..."
                : "Describe what needs to be revised..."
              : lang === "ar"
                ? "ملاحظات إضافية..."
                : "Additional notes..."
        }
        className={`min-h-[100px] resize-none text-sm leading-relaxed ${
          required && !value.trim() ? "border-amber-300 focus-visible:ring-amber-400/30" : ""
        }`}
      />
      {required && !value.trim() && (
        <p className="text-sm text-amber-600">
          {lang === "ar" ? "يجب كتابة سبب القرار" : "A reason is required for this decision"}
        </p>
      )}
    </div>
  );
}

export function ReviewSignatureField({
  lang,
  signature,
  loading,
}: {
  lang: string;
  signature: string;
  loading?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-base font-bold text-foreground">
        {lang === "ar" ? "التوقيع الرقمي" : "Digital signature"}
      </Label>
      <div className="flex items-center gap-3 rounded-xl border bg-slate-50/80 px-4 py-3 text-base">
        <UserCheck className="h-5 w-5 shrink-0 text-primary/70" />
        <span className="flex-1 font-semibold text-foreground">
          {loading ? (lang === "ar" ? "جاري التحميل..." : "Loading...") : signature || "—"}
        </span>
        <span className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
        </span>
      </div>
    </div>
  );
}

export function ReviewAttestation({
  lang,
  title,
  body,
}: {
  lang: string;
  title: string;
  body: string;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
      <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-sm font-normal text-muted-foreground group-open:hidden">
            {lang === "ar" ? "عرض" : "Show"}
          </span>
        </span>
      </summary>
      <p className="border-t border-slate-200 px-5 pb-4 pt-3 text-sm leading-relaxed text-slate-600">{body}</p>
    </details>
  );
}

export function ReviewDialogFooter({
  lang,
  readOnly,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  submitDisabled,
  submitVariant,
}: {
  lang: string;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  submitVariant?: "approved" | "needs_revision" | "rejected" | null;
}) {
  const submitClass =
    submitVariant === "approved"
      ? "bg-green-600 hover:bg-green-700"
      : submitVariant === "needs_revision"
        ? "bg-amber-600 hover:bg-amber-700"
        : submitVariant === "rejected"
          ? "bg-red-600 hover:bg-red-700"
          : "";

  return (
    <div className="sticky bottom-0 flex gap-3 border-t bg-white/95 px-6 py-4 backdrop-blur-sm">
      {!readOnly && onSubmit && (
        <Button
          size="lg"
          className={`flex-1 text-base ${submitClass}`}
          disabled={submitDisabled || submitting}
          onClick={onSubmit}
        >
          {submitting
            ? lang === "ar"
              ? "جاري الإرسال..."
              : "Submitting..."
            : submitLabel ?? (lang === "ar" ? "إرسال" : "Submit")}
        </Button>
      )}
      <Button
        size="lg"
        variant="outline"
        className={`text-base ${readOnly ? "flex-1" : ""}`}
        onClick={onClose}
      >
        {readOnly ? (lang === "ar" ? "إغلاق" : "Close") : lang === "ar" ? "إلغاء" : "Cancel"}
      </Button>
    </div>
  );
}
