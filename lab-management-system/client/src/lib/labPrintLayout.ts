import type { CSSProperties } from "react";

/** A4 printable page shell — width/margins live in index.css + print.css only. */
export const LAB_PRINT_PAGE_CLASS =
  "lab-print-root mx-auto bg-white shadow-lg print:shadow-none report-page print:mx-0 print:w-full print:max-w-none print:p-0";

/** Main report content (metadata, summary, detailed results). */
export const LAB_PRINT_BODY_CLASS = "report-page-body";

/** Signatures + footer — flows directly after body content. */
export const LAB_PRINT_TAIL_CLASS = "report-page-tail";

/** Grey canvas behind the white report sheet (hidden padding when printing). */
export const LAB_PRINT_CANVAS_CLASS =
  "bg-gray-200 print:bg-white min-h-screen py-6 print:py-0";

/** Legacy/minimal reports that use the same A4 shell without full metadata layout. */
export const LAB_PRINT_LEGACY_CLASS =
  "lab-print-root mx-auto bg-white shadow-lg print:shadow-none report-page report-page--compact print:mx-0 print:w-full print:max-w-none print:p-0";

/** Keep inline styles empty so print/PDF CSS fully controls sizing (no 210mm inline override). */
export const LAB_PRINT_PAGE_STYLE: CSSProperties = {};

/** Browser print / Save as PDF — uses @media print CSS on the live report page. */
export function printLabReport(): void {
  window.print();
}
