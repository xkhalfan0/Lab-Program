import { formatPrintTimestamp } from "@/lib/dateFormat";

/** Light footer note showing when the report was printed (not the official report date). */
export function ReportPrintNote({ lang }: { lang: "ar" | "en" }) {
  return (
    <p className="text-center text-gray-400 mt-1.5 italic" style={{ fontSize: "7px" }}>
      {lang === "ar" ? "تاريخ الطباعة: " : "Printed: "}
      {formatPrintTimestamp(lang)}
    </p>
  );
}
