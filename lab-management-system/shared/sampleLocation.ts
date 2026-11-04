export function sampleLocationRequiredMessage(lang: "en" | "ar"): string {
  return lang === "ar" ? "موقع العينة مطلوب" : "Sample location is required";
}

export function trimSampleLocation(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

export function isSampleLocationProvided(value: string | undefined | null): boolean {
  return trimSampleLocation(value).length > 0;
}
