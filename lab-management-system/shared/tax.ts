/** UAE VAT defaults — read rate from lab settings at runtime; this is the fallback only. */
export const DEFAULT_VAT_RATE = 0.05;

export type TaxBreakdown = {
  subtotal: number;
  vat: number;
  total: number;
};

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** subtotal = sum(test prices); vat and total rounded once at the end. */
export function calculateTax(subtotal: number, vatRate: number = DEFAULT_VAT_RATE): TaxBreakdown {
  const sub = roundCurrency(Number(subtotal) || 0);
  const rate = Number(vatRate) || 0;
  const vat = roundCurrency(sub * rate);
  const total = roundCurrency(sub + vat);
  return { subtotal: sub, vat, total };
}

export function formatVatRatePercent(vatRate: number): string {
  const pct = (Number(vatRate) || 0) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function formatAedAmount(amount: number, decimals = 2): string {
  return `${roundCurrency(amount).toFixed(decimals)} AED`;
}

/** Certificates ≥ this amount (incl. VAT) require contractor TRN on the document. */
export const CONTRACTOR_TRN_THRESHOLD_AED = 10_000;

export function requiresContractorTrn(totalInclVat: number): boolean {
  return totalInclVat >= CONTRACTOR_TRN_THRESHOLD_AED;
}

export type TaxPrintOptions = {
  vatRate?: number;
  labTrn?: string | null;
  contractorTrn?: string | null;
};

export function taxDisplayLabels(vatRate: number, isAr: boolean) {
  const pct = formatVatRatePercent(vatRate);
  return {
    subtotal: isAr ? "المجموع الفرعي (بدون ضريبة)" : "Subtotal (excl. VAT)",
    vat: isAr ? `ضريبة القيمة المضافة (${pct}%)` : `VAT (${pct}%)`,
    total: isAr ? "الإجمالي شامل الضريبة" : "Total (incl. VAT)",
    labTrn: isAr ? "الرقم الضريبي للمختبر (TRN)" : "Lab TRN",
    contractorTrn: isAr ? "الرقم الضريبي للمقاول (TRN)" : "Contractor TRN",
  };
}

/** Compact HTML block for print templates (payment order, certificate, inventory). */
export function buildTaxSummaryHtml(
  subtotal: number,
  options: TaxPrintOptions & { isAr: boolean; align?: "left" | "right" }
): string {
  const vatRate = options.vatRate ?? DEFAULT_VAT_RATE;
  const tax = calculateTax(subtotal, vatRate);
  const L = taxDisplayLabels(vatRate, options.isAr);
  const align = options.align ?? (options.isAr ? "right" : "left");
  const currency = options.isAr ? "درهم" : "AED";

  const rows = [
    [L.subtotal, `${tax.subtotal.toFixed(2)} ${currency}`],
    [L.vat, `${tax.vat.toFixed(2)} ${currency}`],
    [L.total, `${tax.total.toFixed(2)} ${currency}`],
  ]
    .map(
      ([label, amount]) =>
        `<tr><td class="tax-label">${label}</td><td class="tax-amount" style="text-align:${align}">${amount}</td></tr>`
    )
    .join("");

  const trnRows: string[] = [];
  if (options.labTrn) {
    trnRows.push(
      `<tr><td class="tax-label">${L.labTrn}</td><td class="tax-amount" style="text-align:${align}">${options.labTrn}</td></tr>`
    );
  }
  if (requiresContractorTrn(tax.total) && options.contractorTrn) {
    trnRows.push(
      `<tr><td class="tax-label">${L.contractorTrn}</td><td class="tax-amount" style="text-align:${align}">${options.contractorTrn}</td></tr>`
    );
  }

  return `<table class="tax-summary"><tbody>${rows}${trnRows.join("")}</tbody></table>`;
}

export const TAX_PRINT_CSS = `
  .tax-summary { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  .tax-summary td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  .tax-summary tr:last-child td { border-bottom: none; font-weight: 800; color: #1d4ed8; }
  .tax-label { color: #64748b; font-weight: 600; }
  .tax-amount { font-weight: 700; color: #0f172a; }
`;
