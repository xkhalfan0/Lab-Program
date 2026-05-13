/**
 * Calendar dates for lab UI and reports.
 * DD/MM/YYYY with Western (Latin) digits — avoids Arabic-Indic numerals from default ar-AE.
 */

function toValidDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DD/MM/YYYY (Latin digits). Same shape for EN/AR UI. */
export function formatCalendarDate(input: Date | string | number | null | undefined): string {
  const d = toValidDate(input);
  if (!d) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Medium text date: Latin digits in Arabic via ar-SA-u-nu-latn. */
export function formatDateMedium(
  input: Date | string | number | null | undefined,
  lang: "en" | "ar",
): string {
  const d = toValidDate(input);
  if (!d) return "—";
  if (lang === "ar") {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
