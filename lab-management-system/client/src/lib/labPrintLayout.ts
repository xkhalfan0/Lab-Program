import type { CSSProperties } from "react";

/** A4 printable page shell — screen preview matches print.css rules. */
export const LAB_PRINT_PAGE_CLASS =
  "lab-print-root mx-auto bg-white shadow-lg print:shadow-none report-page";

/** Wrapper around main report content (flex-grow; keeps signatures at page bottom). */
export const LAB_PRINT_BODY_CLASS = "report-page-body";

/** Signatures + footer — kept together at bottom / end of report. */
export const LAB_PRINT_TAIL_CLASS = "report-page-tail";

/** Grey canvas behind the white report sheet (hidden padding when printing). */
export const LAB_PRINT_CANVAS_CLASS =
  "bg-gray-200 print:bg-white min-h-screen py-6 print:py-0";

/** Legacy/minimal reports that use the same A4 shell without full metadata layout. */
export const LAB_PRINT_LEGACY_CLASS =
  "lab-print-root mx-auto bg-white shadow-lg print:shadow-none report-page report-page--compact";

/** Inline styles kept minimal — dimensions & typography live in print.css / index.css. */
export const LAB_PRINT_PAGE_STYLE: CSSProperties = {
  width: "210mm",
  maxWidth: "100%",
};
