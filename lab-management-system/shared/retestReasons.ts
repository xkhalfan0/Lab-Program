export const RETEST_REASONS = [
  { value: "failed_spec", en: "Failed specification", ar: "فشل المواصفات" },
  { value: "damaged_sample", en: "Damaged sample", ar: "عينة تالفة" },
  { value: "client_request", en: "Client request", ar: "طلب العميل" },
] as const;

export type RetestReason = (typeof RETEST_REASONS)[number]["value"];
