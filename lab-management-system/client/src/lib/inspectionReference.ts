/** Inspection reference registered at reception (samples.referenceNo). */

export const INSPECTION_REF_LABEL = {
  en: "Inspection Reference No.",
  ar: "رقم مرجع التفتيش",
} as const;

export function inspectionRefLabel(lang: string): string {
  return lang === "ar" ? INSPECTION_REF_LABEL.ar : INSPECTION_REF_LABEL.en;
}

export function formatInspectionReference(value: unknown): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s || "—";
}

/** Document number for test reports — never use contract number here. */
export function reportDocNo(opts: {
  distributionCode?: string | null;
  distributionId?: number | null;
  receivedAt?: Date | string | null;
}): string {
  if (opts.distributionCode?.trim()) return opts.distributionCode.trim();
  const id = opts.distributionId;
  if (id != null) {
    const year = opts.receivedAt
      ? new Date(opts.receivedAt).getFullYear()
      : new Date().getFullYear();
    return `RPT-${year}-${String(id).padStart(6, "0")}`;
  }
  return "—";
}
