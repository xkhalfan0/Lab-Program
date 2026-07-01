import type { ReactNode } from "react";
import {
  REPORT_INFO_SECTION_CLASS,
  REPORT_INFO_TABLE_CLASS,
  REPORT_META_EMPTY_CLASS,
  REPORT_META_LABEL_CLASS,
  REPORT_META_VALUE_CLASS,
  REPORT_REF_LABEL_CLASS,
} from "@/lib/reportFormatting";

export type ReportReferenceItem = {
  label: string;
  value: ReactNode;
  extra?: ReactNode;
};

/** Sample No. / Inspection Ref / Received Date — no grid lines */
export function ReportReferenceBar({ items }: { items: ReportReferenceItem[] }) {
  const cols = Math.min(Math.max(items.length, 1), 4);
  return (
    <div
      className="report-reference-bar grid gap-x-6 gap-y-3 mb-4 text-xs text-center"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => (
        <div key={i} className="px-1 py-1">
          <span className={REPORT_REF_LABEL_CLASS}>{item.label}</span>
          <div className="font-mono font-normal text-gray-900 text-sm">{item.value}</div>
          {item.extra}
        </div>
      ))}
    </div>
  );
}

/** Two-column label/value pairs (summary, test conditions) — borderless */
export function ReportInfoPairsTable({ pairs }: { pairs: [string, string][] }) {
  if (!pairs.length) return null;
  return (
    <table className={REPORT_INFO_TABLE_CLASS}>
      <tbody>
        {Array.from({ length: Math.ceil(pairs.length / 2) }, (_, ri) => {
          const a = pairs[ri * 2];
          const b = pairs[ri * 2 + 1];
          return (
            <tr key={ri}>
              <td className={REPORT_META_LABEL_CLASS}>{a[0]}</td>
              <td className={REPORT_META_VALUE_CLASS}>{a[1]}</td>
              {b ? (
                <>
                  <td className={REPORT_META_LABEL_CLASS}>{b[0]}</td>
                  <td className={REPORT_META_VALUE_CLASS}>{b[1]}</td>
                </>
              ) : (
                <td colSpan={2} className={REPORT_META_EMPTY_CLASS} />
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Four-column detail grid (left + right field lists) — borderless */
export function ReportDetailGrid({
  left,
  right,
}: {
  left: [string, string][];
  right: [string, string][];
}) {
  const n = Math.max(left.length, right.length);
  if (n === 0) return null;
  return (
    <table className={REPORT_INFO_TABLE_CLASS}>
      <tbody>
        {Array.from({ length: n }, (_, i) => (
          <tr key={i}>
            <td className={REPORT_META_LABEL_CLASS}>{left[i]?.[0] ?? ""}</td>
            <td className={REPORT_META_VALUE_CLASS}>{left[i]?.[1] ?? ""}</td>
            <td className={REPORT_META_LABEL_CLASS}>{right[i]?.[0] ?? ""}</td>
            <td className={REPORT_META_VALUE_CLASS}>{right[i]?.[1] ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportInfoSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${REPORT_INFO_SECTION_CLASS}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export function ReportInfoHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-gray-900 uppercase border-b border-gray-300 pb-1 mb-3">
      {children}
    </h3>
  );
}
