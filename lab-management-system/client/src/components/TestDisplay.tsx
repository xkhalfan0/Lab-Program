import type { ReactNode } from "react";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type TestDisplayLang = "ar" | "en";

export type TestChipStatus = "default" | "pending" | "completed" | "failed";

const CHIP_STATUS_CLASS: Record<TestChipStatus, string> = {
  default: "bg-slate-50 text-slate-600 border-slate-200",
  pending: "bg-slate-50 text-slate-600 border-slate-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export function formatTestPrice(
  amount: number | string | null | undefined,
  lang: TestDisplayLang,
  decimals = 0,
): string {
  const value = Number(amount ?? 0);
  const formatted = decimals > 0 ? value.toFixed(decimals) : value.toFixed(0);
  return `${formatted} ${lang === "ar" ? "درهم" : "AED"}`;
}

export function resolveOrderItemTestLabel(item: {
  testName?: string | null;
  testTypeCode?: string | null;
}): string {
  if (item.testName && item.testName !== "__multi__") return item.testName;
  return item.testTypeCode ?? "—";
}

export function TestCodeBadge({
  code,
  variant = "block",
  className,
}: {
  code?: string | null;
  variant?: "block" | "inline";
  className?: string;
}) {
  if (!code) return null;
  if (variant === "inline") {
    return (
      <code
        className={cn(
          "text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground uppercase",
          className,
        )}
      >
        {code}
      </code>
    );
  }
  return (
    <span
      className={cn(
        "block text-[10px] font-mono uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {code}
    </span>
  );
}

export function TestPriceBadge({
  amount,
  lang,
  decimals = 0,
  className,
}: {
  amount: number | string | null | undefined;
  lang: TestDisplayLang;
  decimals?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap tabular-nums",
        className,
      )}
    >
      {formatTestPrice(amount, lang, decimals)}
    </span>
  );
}

export function TestNameBlock({
  name,
  className,
  nameClassName,
}: {
  name: string;
  code?: string | null;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1 text-start", className)}>
      <span className={cn("block text-sm font-medium leading-snug text-foreground text-start", nameClassName)}>
        {name}
      </span>
    </div>
  );
}

export function TestChip({
  label,
  quantity,
  status = "default",
  showIcon = true,
  className,
}: {
  label: string;
  quantity?: number;
  status?: TestChipStatus;
  showIcon?: boolean;
  className?: string;
}) {
  const Icon = status === "completed" ? CheckCircle2 : FlaskConical;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-start gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
        CHIP_STATUS_CLASS[status],
        className,
      )}
    >
      {showIcon && <Icon className="w-3 h-3 shrink-0 mt-0.5" />}
      <span className="min-w-0 break-words leading-snug">{label}</span>
      {quantity != null && quantity > 1 && (
        <span className="shrink-0 tabular-nums opacity-80">×{quantity}</span>
      )}
    </span>
  );
}

/** Compact stacked test rows for order / distribution tables. */
export function TestOrderItemRow({
  label,
  quantity,
  status = "default",
  showIcon = true,
}: {
  label: string;
  quantity?: number;
  status?: TestChipStatus;
  showIcon?: boolean;
}) {
  const Icon = status === "completed" ? CheckCircle2 : FlaskConical;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2 py-1.5 min-w-[11rem] rtl:flex-row-reverse",
        CHIP_STATUS_CLASS[status],
      )}
    >
      {showIcon && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-background/70">
          <Icon className="h-3 w-3" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-0.5 text-start">
        <p className="text-xs font-medium leading-snug text-foreground break-words text-start">{label}</p>
      </div>
      {quantity != null && quantity > 1 && (
        <span className="shrink-0 self-start rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          ×{quantity}
        </span>
      )}
    </div>
  );
}

export function TestOrderItemList({
  items,
  emptyLabel = "None",
  className,
}: {
  items: Array<{
    key?: string;
    label: string;
    quantity?: number;
    status?: TestChipStatus;
  }>;
  emptyLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground italic">{emptyLabel}</span>;
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {items.map((item, idx) => (
        <TestOrderItemRow
          key={item.key ?? `${item.label}-${idx}`}
          label={item.label}
          quantity={item.quantity}
          status={item.status}
        />
      ))}
    </div>
  );
}

export function mapOrderItemsToTestList(
  items: unknown[],
  statusFromItem?: (item: Record<string, unknown>) => TestChipStatus | undefined,
) {
  return (items ?? [])
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item, idx) => ({
      key: String(item.id ?? item._id ?? idx),
      label: resolveOrderItemTestLabel({
        testName: typeof item.testName === "string" ? item.testName : null,
        testTypeCode:
          typeof item.testTypeCode === "string"
            ? item.testTypeCode
            : typeof item.testCode === "string"
              ? item.testCode
              : null,
      }),
      quantity: Number(item.quantity) || undefined,
      status: statusFromItem?.(item),
    }));
}

/** Full-width test row for assignment / distribution dialogs — no truncated pill chips. */
export function TestAssignmentRow({
  label,
  quantity,
  lang = "en",
}: {
  label: string;
  quantity?: number;
  lang?: TestDisplayLang;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background px-3.5 py-3 shadow-sm rtl:flex-row-reverse">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <FlaskConical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-start">
        <p className="text-sm font-semibold leading-snug text-foreground break-words text-start">{label}</p>
      </div>
      {quantity != null && quantity > 0 && (
        <div className="shrink-0 rounded-md bg-muted/60 px-2.5 py-1 text-center min-w-[3rem]">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {lang === "ar" ? "الكمية" : "Qty"}
          </p>
          <p className="text-sm font-bold tabular-nums text-foreground">{quantity}</p>
        </div>
      )}
    </div>
  );
}

export function TestSelectionPanel({
  hint,
  selectedCount,
  selectedLabel = "selected",
  children,
  footer,
  className,
}: {
  hint?: string;
  selectedCount?: number;
  selectedLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const showHeader = Boolean(hint || (selectedCount != null && selectedCount > 0));
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-sm overflow-hidden",
        className,
      )}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b text-xs text-muted-foreground">
          {hint ? <span>{hint}</span> : <span />}
          {selectedCount != null && selectedCount > 0 && (
            <span className="font-semibold text-foreground shrink-0">
              {selectedCount} {selectedLabel}
            </span>
          )}
        </div>
      )}
      <div className="max-h-[min(420px,52vh)] overflow-y-auto overscroll-contain">
        <div className="space-y-3 p-3">{children}</div>
      </div>
      {footer}
    </div>
  );
}

export function TestSectionLabel({
  icon,
  children,
  required,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}>
      {icon}
      {children}
      {required && <span className="text-red-500">*</span>}
    </p>
  );
}

export function TestGroupHeading({ label, className }: { label: string; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold text-foreground flex items-center gap-2", className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
      {label}
    </p>
  );
}

export function TestListEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TestSelectionGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-1.5", className)}>
      {children}
    </div>
  );
}

export function TestSelectionCard({
  selected,
  children,
  className,
  fullWidth,
}: {
  selected?: boolean;
  children: ReactNode;
  className?: string;
  /** Span both columns when the card has expanded details (subtypes, add-ons, etc.). */
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2 transition-colors min-w-0",
        selected
          ? "border-primary/45 bg-primary/[0.04] ring-1 ring-primary/10"
          : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/25",
        fullWidth && "col-span-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TestSelectionRow({
  id,
  checked,
  onCheckedChange,
  name,
  code,
  trailing,
  disabled,
  compact,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name: string;
  code?: string | null;
  trailing?: ReactNode;
  disabled?: boolean;
  /** Stack name and controls vertically — fits narrow two-column cells. */
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rtl:flex-row-reverse">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="shrink-0 mt-0.5"
      />
      <label
        htmlFor={id}
        className={cn(
          "flex flex-1 min-w-0 gap-1.5 text-start",
          compact ? "flex-col items-stretch" : "flex-row items-center justify-between gap-2",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <TestNameBlock
          name={name}
          code={code}
          nameClassName={compact ? "text-xs leading-snug line-clamp-2" : undefined}
        />
        {trailing && (
          <div
            className={cn(
              "flex items-center gap-1.5 shrink-0",
              compact && "justify-between w-full pt-0.5",
            )}
          >
            {trailing}
          </div>
        )}
      </label>
    </div>
  );
}

export function TestDetailIndent({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return <div className={cn("ms-7", className)}>{children}</div>;
}

export function TestNestedRow({
  selected,
  children,
  className,
}: {
  selected?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
        selected ? "border-primary/30 bg-primary/5" : "border-border/70",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TestQtyInput({
  className,
  warning,
  ...props
}: React.ComponentProps<typeof Input> & { warning?: boolean }) {
  return (
    <Input
      {...props}
      className={cn(
        "h-7 w-14 text-center text-xs",
        warning && "border-amber-400 text-amber-700",
        className,
      )}
    />
  );
}

export function TestOrderQtyRow({
  name,
  subLabel,
  quantity,
  onDecrement,
  onIncrement,
  min = 1,
}: {
  name: string;
  subLabel?: string | null;
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  min?: number;
}) {
  return (
    <TestNestedRow className="justify-between px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {subLabel && subLabel !== "__multi__" && (
          <span className="ms-1 text-xs text-muted-foreground">({subLabel})</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="h-7 w-7 rounded border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors"
          onClick={onDecrement}
          disabled={quantity <= min}
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-medium tabular-nums">{quantity}</span>
        <button
          type="button"
          className="h-7 w-7 rounded border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors"
          onClick={onIncrement}
        >
          +
        </button>
      </div>
    </TestNestedRow>
  );
}
