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
        background: "#f3f4f6",
        fontWeight: 600,
        color: "#374151",
        padding: "5px 8px",
        width: "22%",
        verticalAlign: "middle",
      }}
    >
      <div style={{ lineHeight: 1.35 }}>
        <div dir="ltr" style={{ fontSize: "9px", color: "#64748b", fontWeight: 500 }}>
          {en}
        </div>
        <div style={{ fontSize: "10.5px" }}>{ar}</div>
      </div>
    </td>
  );
}

function ValueTd({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <td
      style={{
        padding: "5px 8px",
        fontFamily: mono ? "monospace" : "inherit",
        fontWeight: mono ? 700 : 400,
        color: mono ? "#1d4ed8" : "#111",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
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
  const supplierMatch = rawNotes.match(/^__SUPPLIER__:(.+?)(?:\n|$)/);
  const supplierValue = supplierMatch ? supplierMatch[1].trim() : null;
  const cleanNotes = rawNotes.replace(/^__SUPPLIER__:[^\n]*\n?/, "").trim();
  const sampleLocation: string | null = (sample as any).location?.trim() || null;

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
            maxHeight: "148mm",
            padding: "5mm 8mm 4mm 8mm",
            fontFamily: "Arial, sans-serif",
            fontSize: "10px",
            direction: lang === "ar" ? "rtl" : "ltr",
          }}
        >
          {/* Header */}
          <div className="border-t-4 border-gray-900 pt-1 pb-0 mb-0">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ textAlign: lang === "ar" ? "right" : "left", flex: 1 }}>
                <h1 style={{ fontSize: "14px", fontWeight: 900, color: "#111", lineHeight: 1.25 }}>
                  {T.labNameAr.ar}
                </h1>
                <p style={{ fontSize: "9px", color: "#666", marginTop: "1px" }}>{T.labNameEn.en}</p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "0 14px",
                  borderLeft: "1px solid #ccc",
                  borderRight: "1px solid #ccc",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    border: "2px solid #333",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "17px",
                    fontWeight: 900,
                  }}
                >
                  م
                </div>
                <span style={{ fontSize: "8px", color: "#999", marginTop: "1px", letterSpacing: "2px" }}>LAB</span>
              </div>
              <div
                style={{
                  textAlign: lang === "ar" ? "left" : "right",
                  flex: 1,
                  fontSize: "11px",
                  color: "#555",
                }}
              >
                <div style={{ display: "flex", gap: "6px", justifyContent: lang === "ar" ? "flex-start" : "flex-end", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#111" }} dir="ltr">
                    {docNo}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "9px" }} dir="ltr">
                    {T.docNo.en}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "9px" }}>{T.docNo.ar}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    justifyContent: lang === "ar" ? "flex-start" : "flex-end",
                    marginTop: "4px",
                    alignItems: "baseline",
                  }}
                >
                  <span dir="ltr">{fmtDateTime(sample.receivedAt, lang)}</span>
                  <span style={{ color: "#64748b", fontSize: "9px" }} dir="ltr">
                    {T.date.en}
                  </span>
                  <span style={{ color: "#64748b", fontSize: "9px" }}>{T.date.ar}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Title bar */}
          <div
            style={{
              background: "#1a1a2e",
              color: "white",
              textAlign: "center",
              padding: "4px 0",
              marginBottom: "6px",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>{T.receiptTitleAr.ar}</p>
            <p style={{ fontSize: "9px", color: "#aaa", marginTop: "1px", letterSpacing: "1px" }}>
              {T.receiptTitleEn.en}
            </p>
          </div>

          {/* Data table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", marginBottom: "4px" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("sampleNo")}
                <ValueTd mono>{sample.sampleCode}</ValueTd>
                {th("refNo")}
                <ValueTd>{referenceNo}</ValueTd>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("sampleType")}
                <ValueTd>{sampleTypeRaw}</ValueTd>
                {th("contractNo")}
                <ValueTd mono>{sample.contractNumber ?? "—"}</ValueTd>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("contractor")}
                <ValueTd>{sample.contractorName ?? "—"}</ValueTd>
                {th("sector")}
                <ValueTd>
                  {sectorLabel ? `${sectorLabel.en} / ${sectorLabel.ar}` : "—"}
                </ValueTd>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("project")}
                <td colSpan={3} style={{ padding: "5px 8px" }}>
                  {sample.contractName ?? "—"}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("quantity")}
                <ValueTd>{totalQuantity}</ValueTd>
                {th("totalPrice")}
                <ValueTd mono>{totalPrice > 0 ? fmtMoney(totalPrice, lang) : "—"}</ValueTd>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("tests")}
                <td colSpan={3} style={{ padding: "5px 8px", lineHeight: 1.4 }}>
                  {testNamesDisplay}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {th("receivedAt")}
                <td colSpan={3} style={{ padding: "5px 8px" }}>
                  {fmtDateTime(sample.receivedAt, lang)}
                </td>
              </tr>
              {contractorForm && (
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {th("contractorForm")}
                  <td colSpan={3} style={{ padding: "5px 8px" }}>
                    <span className="print:hidden">
                      <a
                        href={contractorForm.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1d4ed8", fontWeight: 600, textDecoration: "underline" }}
                      >
                        {contractorForm.fileName} — {tx("viewFile", lang)}
                      </a>
                    </span>
                    <span className="hidden print:inline" style={{ color: "#374151" }}>
                      {contractorForm.fileName}{" "}
                      <span style={{ color: "#9ca3af", fontSize: "8px" }}>
                        ({tx("digitalAttachment", lang)})
                      </span>
                    </span>
                  </td>
                </tr>
              )}
              {supplierValue && (
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {th("supplier")}
                  <td colSpan={3} style={{ padding: "5px 8px", color: "#111", fontWeight: 500 }}>
                    {supplierValue}
                  </td>
                </tr>
              )}
              {sampleLocation && (
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {th("location")}
                  <td colSpan={3} style={{ padding: "5px 8px", color: "#111" }}>
                    {sampleLocation}
                  </td>
                </tr>
              )}
              {cleanNotes && (
                <tr>
                  {th("notes")}
                  <td colSpan={3} style={{ padding: "5px 8px", color: "#555" }}>
                    {cleanNotes}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div
            style={{
              marginTop: "8px",
              paddingTop: "6px",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "7.5px",
              color: "#aaa",
              gap: "8px",
            }}
          >
            <span>
              {T.labNameAr.ar} — {T.labNameEn.en}
            </span>
            <span dir="ltr">
              {tx("printedAt", lang)}: {new Date().toLocaleString(lang === "ar" ? "ar-AE" : "en-AE")}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A5 landscape; margin: 0; }
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </>
  );
}
