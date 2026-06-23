/**
 * PrintReceipt — Sample reception receipt (bilingual AR/EN)
 * URL: /print-receipt/:id?lang=en|ar
 */
import { useParams } from "wouter";
import { useEffect, useMemo, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Printer, X, XCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import {
  getReceptionEntryDisplayPairs,
  parseSupplierFromNotes,
  stripStructuredNotes,
} from "@shared/receptionEntryFields";

type Lang = "ar" | "en";

const SECTOR_LABELS: Record<string, { ar: string; en: string }> = {
  sector_1: { ar: "قطاع/1", en: "Sector 1" },
  sector_2: { ar: "قطاع/2", en: "Sector 2" },
  sector_3: { ar: "قطاع/3", en: "Sector 3" },
  sector_4: { ar: "قطاع/4", en: "Sector 4" },
  sector_5: { ar: "قطاع/5", en: "Sector 5" },
};

const T = {
  close: { ar: "إغلاق", en: "Close" },
  print: { ar: "طباعة / حفظ PDF", en: "Print / Save PDF" },
  toolbarTitle: { ar: "وصل استلام عينة", en: "Sample Receipt" },
  notFound: { ar: "لم يتم العثور على العينة.", en: "Sample not found." },
  labNameAr: { ar: "مختبر الإنشاءات والمواد الهندسية", en: "Construction Materials & Engineering Laboratory" },
  labNameEn: { ar: "Construction Materials & Engineering Laboratory", en: "مختبر الإنشاءات والمواد الهندسية" },
  receiptTitleAr: { ar: "وصل استلام عينة", en: "وصل استلام عينة" },
  receiptTitleEn: { ar: "Sample Receipt", en: "Sample Receipt" },
  docNo: { ar: "رقم الوثيقة", en: "Doc. No." },
  date: { ar: "التاريخ", en: "Date" },
  sampleNo: { ar: "رقم العينة", en: "Sample No." },
  refNo: { ar: "رقم مرجع التفتيش", en: "Inspection Reference No." },
  sampleType: { ar: "نوع العينة", en: "Sample Type" },
  contractor: { ar: "المقاول", en: "Contractor" },
  contractNo: { ar: "رقم العقد", en: "Contract No." },
  project: { ar: "اسم المشروع", en: "Project Name" },
  sector: { ar: "القطاع", en: "Sector" },
  quantity: { ar: "الكمية", en: "Quantity" },
  tests: { ar: "الاختبارات", en: "Test(s)" },
  receivedAt: { ar: "تاريخ الاستلام", en: "Received At" },
  totalPrice: { ar: "إجمالي الرسوم", en: "Total Fees" },
  contractorForm: { ar: "نموذج المقاول", en: "Contractor Form" },
  viewFile: { ar: "عرض الملف", en: "View file" },
  viewForm: { ar: "عرض نموذج المقاول", en: "View contractor form" },
  printWithForm: { ar: "طباعة الوصل + النموذج", en: "Print receipt + form" },
  formPrintHint: {
    ar: "النموذج مرفق رقمياً — استخدم «عرض نموذج المقاول» لطباعته منفصلاً.",
    en: "Form stored digitally — use “View contractor form” to print it separately.",
  },
  digitalAttachment: { ar: "مرفق رقمي", en: "digital attachment" },
  notes: { ar: "ملاحظات", en: "Notes" },
  supplier: { ar: "المورد / المصدر", en: "Supplier / Source" },
  location: { ar: "موقع العينة", en: "Sample Location" },
  entryData: { ar: "بيانات الإدخال", en: "Entry Data" },
  printedAt: { ar: "طُبع في", en: "Printed at" },
} as const;

function tx(key: keyof typeof T, lang: Lang) {
  return T[key][lang];
}

function bilingualLabel(key: keyof typeof T) {
  return { en: T[key].en, ar: T[key].ar };
}

function receiptDocNo(sample: { id: number; receivedAt?: Date | string | null }) {
  const year = sample.receivedAt
    ? new Date(sample.receivedAt).getFullYear()
    : new Date().getFullYear();
  return `REC-${year}-${String(sample.id).padStart(5, "0")}`;
}

function fmtDateTime(d?: Date | string | null, lang: Lang = "ar") {
  if (!d) return "—";
  return new Date(d).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(amount: number, lang: Lang) {
  const formatted = amount.toFixed(0);
  return lang === "ar" ? `${formatted} درهم` : `${formatted} AED`;
}

function BilingualTh({ en, ar }: { en: string; ar: string }) {
  return (
    <td
      style={{
        background: "#eef2f7",
        fontWeight: 700,
        color: "#334155",
        padding: "10px 12px",
        width: "24%",
        verticalAlign: "middle",
        borderBottom: "1px solid #dbe3ee",
      }}
    >
      <div style={{ lineHeight: 1.4 }}>
        <div dir="ltr" style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600, letterSpacing: "0.02em" }}>
          {en}
        </div>
        <div style={{ fontSize: "12px", marginTop: "2px" }}>{ar}</div>
      </div>
    </td>
  );
}

function ValueTd({ children, mono, colSpan }: { children: ReactNode; mono?: boolean; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "10px 12px",
        fontSize: "12.5px",
        lineHeight: 1.45,
        fontFamily: mono ? "ui-monospace, monospace" : "inherit",
        fontWeight: mono ? 700 : 500,
        color: mono ? "#1d4ed8" : "#0f172a",
        verticalAlign: "middle",
        borderBottom: "1px solid #e8edf3",
      }}
    >
      {children}
    </td>
  );
}

function FullRow({ labelKey, children }: { labelKey: keyof typeof T; children: ReactNode }) {
  const l = bilingualLabel(labelKey);
  return (
    <tr>
      <BilingualTh en={l.en} ar={l.ar} />
      <ValueTd colSpan={3}>{children}</ValueTd>
    </tr>
  );
}

function SingleLabelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <td
        style={{
          background: "#eef2f7",
          fontWeight: 700,
          color: "#334155",
          padding: "10px 12px",
          width: "24%",
          verticalAlign: "middle",
          borderBottom: "1px solid #dbe3ee",
          fontSize: "12px",
        }}
      >
        {label}
      </td>
      <ValueTd colSpan={3}>{children}</ValueTd>
    </tr>
  );
}

export default function PrintReceipt({ sectorSampleId }: { sectorSampleId?: number } = {}) {
  const { id } = useParams<{ id: string }>();
  const sampleId = sectorSampleId ?? parseInt(id ?? "0");
  const isSectorMode = sectorSampleId != null && sectorSampleId > 0;
  const lang: Lang =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("lang") === "en"
      ? "en"
      : "ar";

  const { data: sectorBundle, isLoading: sectorLoading, isError: sectorError } = trpc.sector.getReceiptBundle.useQuery(
    { sampleId: sectorSampleId! },
    { enabled: isSectorMode },
  );

  const { data: labSample, isLoading: labLoading } = trpc.samples.get.useQuery(
    { id: sampleId },
    { enabled: sampleId > 0 && !isSectorMode },
  );
  const { data: labOrders } = trpc.orders.bySample.useQuery(
    { sampleId },
    { enabled: sampleId > 0 && !isSectorMode },
  );
  const { data: labAttachments = [] } = trpc.attachments.bySample.useQuery(
    { sampleId },
    { enabled: sampleId > 0 && !isSectorMode },
  );

  const sample = isSectorMode ? sectorBundle?.sample : labSample;
  const orders = isSectorMode ? sectorBundle?.orders : labOrders;
  const attachments = isSectorMode ? (sectorBundle?.attachments ?? []) : labAttachments;
  const isLoading = isSectorMode ? sectorLoading : labLoading;

  const contractorForm = attachments.find(
    (a: { attachmentType?: string }) => a.attachmentType === "contractor_form",
  );

  const totalPrice = useMemo(() => {
    if (!orders?.length) return 0;
    return orders.reduce((sum, order: any) => {
      const itemsTotal = (order.items ?? []).reduce((itemSum: number, item: any) => {
        return itemSum + (Number(item.quantity) || 0) * parseFloat(String(item.unitPrice ?? 0));
      }, 0);
      return sum + itemsTotal;
    }, 0);
  }, [orders]);

  const testNamesDisplay = useMemo(() => {
    const names: string[] = [];
    if (orders?.length) {
      for (const order of orders) {
        for (const item of (order as any).items ?? []) {
          const name = item.testTypeName || item.testName || item.testTypeCode;
          if (!name || name === "__multi__") continue;
          const qty = Number(item.quantity) || 1;
          names.push(qty > 1 ? `${name} ×${qty}` : name);
        }
      }
    }
    return names.length ? names.join(" · ") : "—";
  }, [orders]);

  let totalQuantity = 1;
  if (sample?.quantity != null && sample.quantity > 0) {
    totalQuantity = sample.quantity;
  } else if (orders?.length) {
    const itemsTotal = (orders[0] as any).items?.reduce((sum: number, item: any) => {
      return sum + (Number(item.quantity) || 0);
    }, 0);
    if (itemsTotal > 0) totalQuantity = itemsTotal;
  }

  const handleClose = () => {
    if (window.opener) window.close();
    else if (isSectorMode) window.location.href = "/sector/samples";
    else window.history.back();
  };

  useEffect(() => {
    if (sample && window.opener) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [sample]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!sample) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <XCircle className="text-red-400" size={40} />
        <p className="text-slate-600 font-medium">
          {isSectorMode && sectorError
            ? lang === "ar"
              ? "تعذّر تحميل وصل الاستلام"
              : "Could not load this receipt."
            : tx("notFound", lang)}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {tx("close", lang)}
        </Button>
      </div>
    );
  }

  const sectorLabel = SECTOR_LABELS[(sample as any).sector ?? ""];
  const sampleTypeRaw = SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType;
  const docNo = receiptDocNo(sample);
  const referenceNo = (sample as any).referenceNo?.trim() || "—";

  const rawNotes: string = (sample as any).notes ?? "";
  const supplierValue = parseSupplierFromNotes(rawNotes);
  const cleanNotes = stripStructuredNotes(rawNotes);
  const sampleLocation = (sample as any).location?.trim() || "—";
  const entryDataRows = getReceptionEntryDisplayPairs({
    notes: rawNotes,
    castingDate: (sample as any).castingDate,
    nominalCubeSize: (sample as any).nominalCubeSize,
    lang,
  });

  const th = (key: keyof typeof T) => {
    const l = bilingualLabel(key);
    return <BilingualTh en={l.en} ar={l.ar} />;
  };

  return (
    <>
      <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <Button
          variant="ghost"
          className="text-white hover:text-white hover:bg-slate-700 gap-2"
          onClick={handleClose}
        >
          <X className="w-4 h-4" /> {tx("close", lang)}
        </Button>
        <span className="text-sm font-medium">
          {tx("toolbarTitle", lang)} — {sample.sampleCode}
        </span>
        <div className="flex items-center gap-2">
          {contractorForm?.fileUrl ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
                onClick={() => window.open(contractorForm.fileUrl, "_blank", "noopener,noreferrer")}
              >
                <FileText className="w-3.5 h-3.5" />
                {tx("viewForm", lang)}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
                onClick={() => {
                  window.print();
                  window.open(contractorForm.fileUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                {tx("printWithForm", lang)}
              </Button>
            </>
          ) : null}
          <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Printer className="w-4 h-4" /> {tx("print", lang)}
          </Button>
        </div>
      </div>

      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0">
        <div
          className="mx-auto bg-white shadow-lg print:shadow-none"
          style={{
            width: "210mm",
            padding: "12mm 14mm 10mm 14mm",
            fontFamily: "'Segoe UI', Arial, sans-serif",
            fontSize: "12px",
            color: "#0f172a",
            direction: lang === "ar" ? "rtl" : "ltr",
          }}
        >
          {/* Header */}
          <div style={{ borderTop: "5px solid #0f172a", paddingTop: "10px", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ textAlign: lang === "ar" ? "right" : "left", flex: 1 }}>
                <h1 style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", lineHeight: 1.3 }}>
                  {T.labNameAr.ar}
                </h1>
                <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", fontWeight: 500 }}>{T.labNameEn.en}</p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "0 16px",
                  borderLeft: "1px solid #cbd5e1",
                  borderRight: "1px solid #cbd5e1",
                }}
              >
                <div
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "50%",
                    border: "2px solid #334155",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  م
                </div>
                <span style={{ fontSize: "9px", color: "#94a3b8", marginTop: "3px", letterSpacing: "2px", fontWeight: 700 }}>LAB</span>
              </div>
              <div
                style={{
                  textAlign: lang === "ar" ? "left" : "right",
                  flex: 1,
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                <div style={{ display: "flex", gap: "8px", justifyContent: lang === "ar" ? "flex-start" : "flex-end", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#0f172a", fontSize: "13px" }} dir="ltr">
                    {docNo}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "10.5px", fontWeight: 600 }} dir="ltr">
                    {T.docNo.en}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 600 }}>{T.docNo.ar}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: lang === "ar" ? "flex-start" : "flex-end",
                    marginTop: "6px",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                  }}
                >
                  <span dir="ltr" style={{ fontWeight: 600, color: "#0f172a" }}>{fmtDateTime(sample.receivedAt, lang)}</span>
                  <span style={{ color: "#64748b", fontSize: "10.5px", fontWeight: 600 }} dir="ltr">
                    {T.date.en}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 600 }}>{T.date.ar}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Title bar */}
          <div
            style={{
              background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
              color: "white",
              textAlign: "center",
              padding: "10px 12px",
              marginBottom: "12px",
              borderRadius: "4px",
            }}
          >
            <p style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "0.3px" }}>{T.receiptTitleAr.ar}</p>
            <p style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "3px", letterSpacing: "0.8px", fontWeight: 600 }}>
              {T.receiptTitleEn.en}
            </p>
          </div>

          {/* Data table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "8px", border: "1px solid #dbe3ee" }}>
            <tbody>
              <tr>
                {th("sampleNo")}
                <ValueTd mono>{sample.sampleCode}</ValueTd>
                {th("refNo")}
                <ValueTd>{referenceNo}</ValueTd>
              </tr>
              <tr>
                {th("contractNo")}
                <ValueTd mono>{sample.contractNumber ?? "—"}</ValueTd>
                {th("sector")}
                <ValueTd>
                  {sectorLabel ? `${sectorLabel.en} / ${sectorLabel.ar}` : "—"}
                </ValueTd>
              </tr>
              <tr>
                {th("contractor")}
                <ValueTd>{sample.contractorName ?? "—"}</ValueTd>
                {th("project")}
                <ValueTd>{sample.contractName ?? "—"}</ValueTd>
              </tr>
              <tr>
                {th("sampleType")}
                <ValueTd>{sampleTypeRaw}</ValueTd>
                {th("quantity")}
                <ValueTd>{totalQuantity}</ValueTd>
              </tr>
              <FullRow labelKey="location">{sampleLocation}</FullRow>
              <FullRow labelKey="tests">{testNamesDisplay}</FullRow>
              <tr>
                {th("totalPrice")}
                <ValueTd mono>{totalPrice > 0 ? fmtMoney(totalPrice, lang) : "—"}</ValueTd>
                {th("receivedAt")}
                <ValueTd>{fmtDateTime(sample.receivedAt, lang)}</ValueTd>
              </tr>
              {contractorForm && (
                <FullRow labelKey="contractorForm">
                  <span className="print:hidden">
                    <a
                      href={contractorForm.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline", fontSize: "12.5px" }}
                    >
                      {contractorForm.fileName} — {tx("viewFile", lang)}
                    </a>
                  </span>
                  <span className="hidden print:inline" style={{ color: "#334155", fontWeight: 600 }}>
                    {contractorForm.fileName}{" "}
                    <span style={{ color: "#94a3b8", fontSize: "10.5px", fontWeight: 500 }}>
                      ({tx("digitalAttachment", lang)})
                    </span>
                  </span>
                </FullRow>
              )}
              {supplierValue && (
                <FullRow labelKey="supplier">{supplierValue}</FullRow>
              )}
              {entryDataRows.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        background: "#f1f5f9",
                        padding: "8px 12px",
                        fontWeight: 700,
                        fontSize: "11px",
                        color: "#334155",
                        borderTop: "1px solid #dbe3ee",
                      }}
                    >
                      {tx("entryData", lang)}
                    </td>
                  </tr>
                  {entryDataRows.map((row) => (
                    <SingleLabelRow key={row.label} label={row.label}>
                      {row.value}
                    </SingleLabelRow>
                  ))}
                </>
              )}
              {cleanNotes && (
                <FullRow labelKey="notes">
                  <span style={{ color: "#475569" }}>{cleanNotes}</span>
                </FullRow>
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div
            style={{
              marginTop: "12px",
              paddingTop: "10px",
              borderTop: "2px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "10px",
              color: "#64748b",
              gap: "12px",
              fontWeight: 500,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {T.labNameAr.ar} — {T.labNameEn.en}
            </span>
            <span dir="ltr" style={{ fontWeight: 600 }}>
              {tx("printedAt", lang)}: {new Date().toLocaleString(lang === "ar" ? "ar-AE" : "en-AE")}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </>
  );
}
