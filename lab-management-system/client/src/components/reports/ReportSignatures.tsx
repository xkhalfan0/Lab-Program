import { formatCalendarDate } from "@/lib/dateFormat";

export type ReportSignatureData = {
  testedBy?: string | null;
  testedAt?: Date | string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | string | null;
  reviewedNotes?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
  approvedNotes?: string | null;
};

type SignatureSource = {
  testedBy?: string | null;
  managerReviewedByName?: string | null;
  managerReviewedAt?: Date | string | null;
  managerNotes?: string | null;
  qcReviewedByName?: string | null;
  qcReviewedAt?: Date | string | null;
  qcNotes?: string | null;
} | null | undefined;

const PENDING = {
  ar: {
    tested: "لم يُفحص بعد",
    reviewed: "لم يُراجع بعد",
    approved: "لم يُعتمد بعد",
  },
  en: {
    tested: "Not tested yet",
    reviewed: "Not reviewed yet",
    approved: "Not approved yet",
  },
} as const;

/** Merge signature fields from one or more test result rows (first non-empty wins). */
export function pickReviewSignatures(sources: SignatureSource[]): ReportSignatureData {
  let testedBy: string | null = null;
  let reviewedBy: string | null = null;
  let reviewedAt: Date | string | null = null;
  let reviewedNotes: string | null = null;
  let approvedBy: string | null = null;
  let approvedAt: Date | string | null = null;
  let approvedNotes: string | null = null;

  for (const s of sources) {
    if (!s) continue;
    if (!testedBy && s.testedBy?.trim()) testedBy = s.testedBy.trim();
    if (!reviewedBy && s.managerReviewedByName?.trim()) {
      reviewedBy = s.managerReviewedByName.trim();
      reviewedAt = s.managerReviewedAt ?? null;
    }
    if (!reviewedNotes && s.managerNotes?.trim()) reviewedNotes = s.managerNotes.trim();
    if (!approvedBy && s.qcReviewedByName?.trim()) {
      approvedBy = s.qcReviewedByName.trim();
      approvedAt = s.qcReviewedAt ?? null;
    }
    if (!approvedNotes && s.qcNotes?.trim()) approvedNotes = s.qcNotes.trim();
  }

  return { testedBy, reviewedBy, reviewedAt, reviewedNotes, approvedBy, approvedAt, approvedNotes };
}

function fmtSigDate(d?: Date | string | null) {
  if (!d) return undefined;
  const s = formatCalendarDate(d);
  return s === "—" ? undefined : s;
}

export function ReportSignatures({
  sig,
  labels,
  lang = "en",
  className = "mt-4 pt-3 border-t border-gray-300 report-signatures-block print-no-break",
  showTitle = false,
  title,
}: {
  sig: ReportSignatureData;
  labels: { tested: string; reviewed: string; approved: string };
  lang?: "ar" | "en";
  className?: string;
  showTitle?: boolean;
  title?: string;
}) {
  const pending = PENDING[lang];

  const slots = [
    {
      key: "tested",
      label: labels.tested,
      name: sig.testedBy?.trim() || null,
      date: fmtSigDate(sig.testedAt),
      pending: pending.tested,
    },
    {
      key: "reviewed",
      label: labels.reviewed,
      name: sig.reviewedBy?.trim() || null,
      date: fmtSigDate(sig.reviewedAt),
      notes: sig.reviewedNotes?.trim() || null,
      pending: pending.reviewed,
    },
    {
      key: "approved",
      label: labels.approved,
      name: sig.approvedBy?.trim() || null,
      date: fmtSigDate(sig.approvedAt),
      notes: sig.approvedNotes?.trim() || null,
      pending: pending.approved,
    },
  ];

  return (
    <div className={className}>
      {showTitle && title ? (
        <h3 className="text-xs font-bold text-gray-900 uppercase mb-3 text-center tracking-wide">{title}</h3>
      ) : null}
      <table className="signatures-table w-full border-collapse text-xs">
        <tbody>
          <tr>
            {slots.map((s) => (
              <td
                key={s.key}
                className="signature-column align-top text-center border border-gray-300 px-2 py-1.5 text-xs w-1/3"
              >
                <p className="text-[9px] font-bold text-gray-900 uppercase mb-0.5">{s.label}</p>
                <div className="signature-line border-b border-gray-800 min-h-[22px] mb-0.5 mx-1 flex items-end justify-center pb-0.5">
                  {s.name ? (
                    <span className="text-gray-900 text-xs font-normal">{s.name}</span>
                  ) : (
                    <span className="text-gray-700 text-[9px] italic font-normal">{s.pending}</span>
                  )}
                </div>
                {s.date ? (
                  <p className="signature-date text-black text-[8px] font-normal mt-0.5 print:text-black">{s.date}</p>
                ) : null}
                {s.notes ? (
                  <p className="text-gray-900 text-[8px] font-normal mt-1 px-0.5 whitespace-pre-wrap text-start leading-snug italic border-t border-gray-200 pt-1">
                    {s.notes}
                  </p>
                ) : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
