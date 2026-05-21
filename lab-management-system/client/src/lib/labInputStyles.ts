/** Shared styles for user-entered numeric fields in lab test forms. */
const BASE =
  "lab-numeric-input text-center bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export const LAB_NUMERIC_INPUT_SM = `h-7 text-xs ${BASE}`;
export const LAB_NUMERIC_INPUT_MD = `h-8 text-sm ${BASE}`;
export const LAB_NUMERIC_INPUT_LG = `h-9 ${BASE}`;
/** Compact numeric fields inside dense lab tables (Hot Bin, etc.). */
export const LAB_TABLE_NUMERIC = `h-6 w-full min-w-0 text-[11px] px-1 py-0 ${BASE}`;
/** Hot Bin table — user entry (original gradation). */
export const LAB_HOTBIN_INPUT = `lab-numeric-input h-9 w-full min-w-[64px] text-sm text-center bg-white border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500`;
/** Hot Bin table — aggregate % in header. */
export const LAB_HOTBIN_PCT_INPUT = `lab-numeric-input h-8 w-20 text-sm font-bold text-center bg-white border-2 border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500`;
/** Hot Bin table — JMF limit entry. */
export const LAB_HOTBIN_JMF_INPUT = `lab-numeric-input h-9 w-full min-w-[64px] text-sm text-center bg-white border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500`;
