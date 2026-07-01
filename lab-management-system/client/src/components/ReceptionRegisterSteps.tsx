import type { ReactNode } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReceptionStepStatus = "locked" | "ready" | "active" | "done";

const STEP_LABELS = {
  en: ["Contract", "Documents", "Tests", "Details"],
  ar: ["العقد", "المستندات", "الاختبارات", "التفاصيل"],
};

export function ReceptionProgressRail({
  lang,
  focusedStep,
  stepComplete,
  canOpenStep,
  onStepClick,
}: {
  lang: "en" | "ar";
  focusedStep: number;
  stepComplete: (step: number) => boolean;
  canOpenStep: (step: number) => boolean;
  onStepClick: (step: number) => void;
}) {
  const labels = lang === "ar" ? STEP_LABELS.ar : STEP_LABELS.en;
  const ar = lang === "ar";

  return (
    <nav aria-label={ar ? "خطوات التسجيل" : "Registration steps"} className="mb-6">
      <ol className="flex items-center gap-0">
        {labels.map((label, i) => {
          const step = i + 1;
          const done = stepComplete(step);
          const active = focusedStep === step;
          const locked = !canOpenStep(step);
          const clickable = canOpenStep(step) && !active;

          return (
            <li key={step} className="flex flex-1 items-center min-w-0 last:flex-none">
              <button
                type="button"
                disabled={!clickable && !active}
                onClick={() => clickable && onStepClick(step)}
                className={cn(
                  "group flex flex-col items-center gap-1.5 flex-1 min-w-0 px-1 transition-opacity",
                  locked && "opacity-40 cursor-not-allowed",
                  clickable && "cursor-pointer hover:opacity-90",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 transition-all",
                    done && !active && "bg-emerald-500 border-emerald-500 text-white",
                    active && "bg-primary border-primary text-primary-foreground scale-110 shadow-md",
                    !done && !active && !locked && "bg-white border-slate-300 text-slate-600",
                    locked && "bg-slate-100 border-slate-200 text-slate-400",
                  )}
                >
                  {done && !active ? <Check className="h-4 w-4" strokeWidth={3} /> : locked ? <Lock className="h-3.5 w-3.5" /> : step}
                </span>
                <span
                  className={cn(
                    "text-[10px] sm:text-xs font-medium text-center leading-tight truncate w-full",
                    active ? "text-primary" : done ? "text-emerald-700" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
              {step < 4 && (
                <div
                  className={cn(
                    "hidden sm:block h-0.5 flex-1 min-w-[12px] mx-0.5 rounded-full transition-colors",
                    stepComplete(step) ? "bg-emerald-400" : "bg-slate-200",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs text-muted-foreground mt-3">
        {ar
          ? `الخطوة ${focusedStep} من 4 — ركّز على خطوة واحدة في كل مرة`
          : `Step ${focusedStep} of 4 — one step at a time`}
      </p>
    </nav>
  );
}

export function ReceptionStepPanel({
  step,
  title,
  subtitle,
  status,
  summary,
  children,
  onContinue,
  onEdit,
  continueLabel,
  continueDisabled,
  skipLabel,
  onSkip,
  lang,
}: {
  step: number;
  title: string;
  subtitle: string;
  status: ReceptionStepStatus;
  summary?: string;
  children: ReactNode;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  skipLabel?: string;
  onSkip?: () => void;
  onEdit?: () => void;
  lang: "en" | "ar";
}) {
  const ar = lang === "ar";
  const isActive = status === "active";
  const isDone = status === "done";
  const isLocked = status === "locked";

  if (isLocked) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 text-xs font-bold">
          {step}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-xs text-slate-400">
            {ar ? "أكمل الخطوات السابقة أولاً" : "Complete the previous steps first"}
          </p>
        </div>
        <Lock className="h-4 w-4 text-slate-300 shrink-0 ms-auto" />
      </div>
    );
  }

  if (status === "ready") {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="w-full rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-start gap-3 text-start hover:bg-primary/10 transition-colors"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs font-medium text-primary shrink-0 mt-1">{ar ? "متابعة" : "Resume"}</span>
      </button>
    );
  }

  if (isDone && !isActive) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex items-start gap-3 text-start hover:bg-emerald-50 transition-colors"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">{title}</p>
          {summary ? (
            <p className="text-xs text-emerald-800/80 mt-0.5 truncate">{summary}</p>
          ) : (
            <p className="text-xs text-emerald-700/70 mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="text-xs text-emerald-700 shrink-0 mt-1">{ar ? "تعديل" : "Edit"}</span>
      </button>
    );
  }

  return (
    <section
      className={cn(
        "rounded-2xl border-2 bg-white shadow-sm transition-shadow",
        isActive ? "border-primary/40 shadow-md ring-4 ring-primary/5" : "border-slate-200",
      )}
    >
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {step}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
      {(onContinue || onSkip) && (
        <div className="px-5 pb-5 flex flex-wrap items-center gap-2 justify-end border-t border-slate-100 pt-4 bg-slate-50/50 rounded-b-2xl">
          {onSkip && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip}>
              {skipLabel ?? (ar ? "تخطي" : "Skip")}
            </Button>
          )}
          {onContinue && (
            <Button
              type="button"
              size="lg"
              className="gap-2 px-6 font-semibold"
              disabled={continueDisabled}
              onClick={onContinue}
            >
              {continueLabel ?? (ar ? "متابعة" : "Continue")}
              <ChevronRight className={cn("h-4 w-4", ar && "rotate-180")} />
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function ReceptionSidebarChecklist({
  lang,
  items,
}: {
  lang: "en" | "ar";
  items: Array<{ label: string; done: boolean; hint?: string }>;
}) {
  const ar = lang === "ar";
  const doneCount = items.filter(i => i.done).length;
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{ar ? "جاهزية التسجيل" : "Ready to register?"}</p>
        <span className="text-xs font-medium text-muted-foreground">
          {doneCount}/{items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                item.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 bg-white",
              )}
            >
              {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <span className={cn("font-medium", item.done ? "text-emerald-800" : "text-foreground")}>
                {item.label}
              </span>
              {!item.done && item.hint && (
                <p className="text-xs text-amber-700 mt-0.5">{item.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
