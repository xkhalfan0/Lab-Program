import { useState } from "react";
import { LAB_PRINT_BRANDING } from "@/lib/labPrintBranding";

export type LabReportHeaderMeta = { label: string; value: string };

export type LabReportHeaderProps = {
  lang: "en" | "ar";
  docNo: string;
  reportDate: string;
  /** Defaults to Doc No. / رقم الوثيقة (use for Order No., Batch No., etc.) */
  docLabel?: string;
  /** Main document title (localized) */
  titlePrimary: string;
  /** Subtitle under title bar (often the other language) */
  titleSecondary?: string;
  /** Extra doc meta shown beside doc no / date (e.g. test count) */
  metaExtra?: LabReportHeaderMeta[];
  className?: string;
};

function LabLogo({ className = "h-14 w-14" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !LAB_PRINT_BRANDING.logoUrl) {
    return (
      <div
        className={`${className} rounded-full border-2 border-gray-800 flex flex-col items-center justify-center shrink-0 bg-white`}
      >
        <span className="text-xl font-black text-gray-900 leading-none">م</span>
        <span className="text-[8px] text-gray-900 tracking-widest mt-0.5">LAB</span>
      </div>
    );
  }
  return (
    <img
      src={LAB_PRINT_BRANDING.logoUrl}
      alt=""
      className={`${className} object-contain shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

export function LabReportHeader({
  lang,
  docNo,
  reportDate,
  docLabel,
  titlePrimary,
  titleSecondary,
  metaExtra = [],
  className = "mb-3",
}: LabReportHeaderProps) {
  const isAr = lang === "ar";
  const namePrimary = isAr ? LAB_PRINT_BRANDING.nameAr : LAB_PRINT_BRANDING.nameEn;
  const nameSecondary = isAr ? LAB_PRINT_BRANDING.nameEn : LAB_PRINT_BRANDING.nameAr;
  const contact = [LAB_PRINT_BRANDING.phone, LAB_PRINT_BRANDING.email].filter(Boolean).join(" · ");
  const docLabelText = docLabel ?? (isAr ? "رقم الوثيقة:" : "Doc No.:");

  return (
    <header className={`lab-report-header ${className}`}>
      <div className="border-t-4 border-gray-900 pt-3 pb-3">
        <div className="flex items-start gap-4">
          <LabLogo />
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-extrabold text-gray-900 leading-snug print:text-black">
              {namePrimary}
            </h1>
            <p className="text-[11px] text-gray-900 mt-0.5 print:text-black">{nameSecondary}</p>
            {LAB_PRINT_BRANDING.address ? (
              <p className="text-[10px] text-gray-900 mt-0.5 print:text-black">{LAB_PRINT_BRANDING.address}</p>
            ) : null}
            {contact ? (
              <p className="text-[10px] text-gray-900 mt-0.5 print:text-black">{contact}</p>
            ) : null}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-2 pt-2 border-t border-gray-300 text-[11px] text-gray-900 print:text-black">
              <div>
                <span className="font-bold">{docLabelText}</span>{" "}
                <span className="font-mono font-normal">{docNo}</span>
              </div>
              <div>
                <span className="font-bold">{isAr ? "تاريخ التقرير:" : "Report Date:"}</span>{" "}
                <span className="font-normal">{reportDate}</span>
              </div>
              {metaExtra.map((m) => (
                <div key={m.label}>
                  <span className="font-bold">{m.label}</span>{" "}
                  <span className="font-normal">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="bg-gray-900 text-white text-center py-1.5 mt-1">
        <p className="text-[13px] font-bold">{titlePrimary}</p>
        {titleSecondary ? (
          <p className="text-[9px] text-gray-200 mt-0.5 tracking-wider uppercase">{titleSecondary}</p>
        ) : null}
      </div>
    </header>
  );
}
