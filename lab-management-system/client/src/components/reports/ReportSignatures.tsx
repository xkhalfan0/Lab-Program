import { formatCalendarDate } from "@/lib/dateFormat";

export type ReportSignatureData = {
  testedBy?: string | null;
  testedAt?: Date | string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | string | null;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
};

type SignatureSource = {
  testedBy?: string | null;
  managerReviewedByName?: string | null;
  managerReviewedAt?: Date | string | null;
  qcReviewedByName?: string | null;
  qcReviewedAt?: Date | string | null;
} | null | undefined;

/** Merge signature fields from one or more test result rows (first non-empty wins). */
export function pickReviewSignatures(sources: SignatureSource[]): ReportSignatureData {
  let testedBy: string | null = null;
  let reviewedBy: string | null = null;
  let reviewedAt: Date | string | null = null;
  let approvedBy: string | null = null;
  let approvedAt: Date | string | null = null;

  for (const s of sources) {
    if (!s) continue;
    if (!testedBy && s.testedBy?.trim()) testedBy = s.testedBy.trim();
    if (!reviewedBy && s.managerReviewedByName?.trim()) {
      reviewedBy = s.managerReviewedByName.trim();
      reviewedAt = s.managerReviewedAt ?? null;
    }
    if (!approvedBy && s.qcReviewedByName?.trim()) {
      approvedBy = s.qcReviewedByName.trim();
      approvedAt = s.qcReviewedAt ?? null;
    }
  }

  return { testedBy, reviewedBy, reviewedAt, approvedBy, approvedAt };
}

function fmtSigDate(d?: Date | string | null) {
  if (!d) return undefined;
  const s = formatCalendarDate(d);
  return s === "—" ? undefined : s;
}

export function ReportSignatures({
  sig,
  labels,
  className = "mt-4 pt-3 border-t border-gray-300 report-signatures-block print-no-break",
  showTitle = false,
  title,
}: {
  sig: ReportSignatureData;
  labels: { tested: string; reviewed: string; approved: string };
  className?: string;
  showTitle?: boolean;
  title?: string;
}) {
  const slots = [
    sig.testedBy ? { label: labels.tested, name: sig.testedBy, date: fmtSigDate(sig.testedAt) } : null,
    sig.reviewedBy ? { label: labels.reviewed, name: sig.reviewedBy, date: fmtSigDate(sig.reviewedAt) } : null,
    sig.approvedBy ? { label: labels.approved, name: sig.approvedBy, date: fmtSigDate(sig.approvedAt) } : null,
  ].filter(Boolean) as Array<{ label: string; name: string; date?: string }>;

  if (!slots.length) return null;

  const colWidth = `${100 / slots.length}%`;

  return (
    <div className={className}>
      {showTitle && title ? (
        <h3 className="text-xs font-bold text-gray-700 uppercase mb-3 text-center tracking-wide">{title}</h3>
      ) : null}
      <table className="signatures-table w-full border-collapse text-xs">
        <tbody>
          <tr>
            {slots.map((s) => (
              <td
                key={s.label}
                className="signature-column align-top text-center border border-gray-300 px-2 py-1.5 text-xs"
                style={{ width: colWidth }}
              >
                <p className="text-[9px] font-bold text-gray-700 uppercase mb-0.5">{s.label}</p>
                <div className="signature-line border-b border-gray-800 min-h-[22px] mb-0.5 mx-1 flex items-end justify-center pb-0.5">
                  <span className="text-gray-700 text-xs font-semibold">{s.name}</span>
                </div>
                {s.date ? <p className="text-gray-400 text-[8px] mt-0.5">{s.date}</p> : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
