import { calculateTax, formatVatRatePercent } from "@shared/tax";
import { cn } from "@/lib/utils";

type TaxBreakdownProps = {
  subtotal: number;
  vatRate: number;
  lang?: "ar" | "en";
  size?: "sm" | "md" | "lg";
  className?: string;
  emphasizeTotal?: boolean;
};

export function TaxBreakdown({
  subtotal,
  vatRate,
  lang = "en",
  size = "md",
  className,
  emphasizeTotal = true,
}: TaxBreakdownProps) {
  const isAr = lang === "ar";
  const tax = calculateTax(subtotal, vatRate);
  const pct = formatVatRatePercent(vatRate);

  const textSize =
    size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  const totalSize =
    size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base";

  if (tax.subtotal <= 0) {
    return (
      <div className={cn("text-muted-foreground", textSize, className)}>—</div>
    );
  }

  return (
    <div className={cn("space-y-1", textSize, className)}>
      <div className="flex justify-between gap-3 text-muted-foreground">
        <span>{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
        <span>{tax.subtotal.toFixed(2)} AED</span>
      </div>
      <div className="flex justify-between gap-3 text-muted-foreground">
        <span>
          {isAr ? `ض.ق.م (${pct}%)` : `VAT (${pct}%)`}
        </span>
        <span>{tax.vat.toFixed(2)} AED</span>
      </div>
      <div
        className={cn(
          "flex justify-between gap-3 pt-1 border-t",
          emphasizeTotal && "font-semibold text-foreground",
          totalSize
        )}
      >
        <span>{isAr ? "الإجمالي" : "Total"}</span>
        <span className={emphasizeTotal ? "text-primary" : undefined}>
          {tax.total.toFixed(2)} AED
        </span>
      </div>
    </div>
  );
}
