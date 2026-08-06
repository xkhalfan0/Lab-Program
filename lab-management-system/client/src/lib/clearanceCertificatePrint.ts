import { LAB_PRINT_BRANDING } from "@/lib/labPrintBranding";
import {
  calculateTax,
  buildTaxSummaryHtml,
  requiresContractorTrn,
  TAX_PRINT_CSS,
  type TaxPrintOptions,
  DEFAULT_VAT_RATE,
} from "@shared/tax";

export type ClearancePrintLang = "ar" | "en";

export type ClearanceCertificateRequest = {
  requestCode?: string | null;
  certificateCode?: string | null;
  certificateIssuedAt?: Date | string | null;
  contractorName?: string | null;
  contractNumber?: string | null;
  contractName?: string | null;
  totalTests?: number | null;
  passedTests?: number | null;
  failedTests?: number | null;
  totalAmount?: string | number | null;
  paymentOrderNumber?: string | null;
  paymentOrderDate?: Date | string | null;
  paymentReceiptNumber?: string | null;
  notes?: string | null;
  inventoryData?: unknown;
  contractorTrn?: string | null;
};

function formatDate(value: Date | string | null | undefined, isAr: boolean) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(isAr ? "ar-AE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resultCell(result: string, L: { pass: string; fail: string; pending: string }) {
  if (result === "pass") return `<span class="result-pass">${L.pass}</span>`;
  if (result === "fail") return `<span class="result-fail">${L.fail}</span>`;
  return `<span class="result-pending">${L.pending}</span>`;
}

export function buildClearanceCertificateHtml(
  req: ClearanceCertificateRequest,
  printLang: ClearancePrintLang = "ar",
  taxOptions: TaxPrintOptions = {}
): string {
  const isAr = printLang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const align = isAr ? "right" : "left";
  const inventory = (Array.isArray(req.inventoryData) ? req.inventoryData : []) as any[];

  const vatRate = taxOptions.vatRate ?? DEFAULT_VAT_RATE;
  const subtotal = Number(req.totalAmount ?? inventory.reduce((s, i) => s + Number(i.price ?? 0), 0));
  const tax = calculateTax(subtotal, vatRate);
  const amountFormatted = `${tax.total.toFixed(2)} ${isAr ? "درهم إ.م" : "AED"}`;
  const taxSummaryHtml = buildTaxSummaryHtml(subtotal, {
    ...taxOptions,
    vatRate,
    isAr,
    contractorTrn: req.contractorTrn ?? taxOptions.contractorTrn,
  });

  const certDate = formatDate(req.certificateIssuedAt ?? null, isAr);
  const poDate = formatDate(req.paymentOrderDate ?? null, isAr);
  const printedAt = new Date().toLocaleString(isAr ? "ar-AE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const labName = isAr ? LAB_PRINT_BRANDING.nameAr : LAB_PRINT_BRANDING.nameEn;
  const labNameSub = isAr ? LAB_PRINT_BRANDING.nameEn : LAB_PRINT_BRANDING.nameAr;
  const contact = [LAB_PRINT_BRANDING.phone, LAB_PRINT_BRANDING.email].filter(Boolean).join(" · ");

  const L = {
    docTitle: isAr ? "شهادة براءة الذمة" : "Clearance Certificate",
    docTitleSub: isAr ? "Clearance Certificate" : "شهادة براءة الذمة",
    docNo: isAr ? "رقم الوثيقة:" : "Doc No.:",
    reportDate: isAr ? "تاريخ التقرير:" : "Report Date:",
    reqNo: isAr ? "رقم طلب البراءة:" : "Clearance Request No.:",
    contractor: isAr ? "المقاول" : "Contractor",
    contractNo: isAr ? "رقم العقد" : "Contract No.",
    project: isAr ? "اسم المشروع" : "Project Name",
    poNo: isAr ? "رقم أمر الدفع" : "Payment Order No.",
    poDate: isAr ? "تاريخ أمر الدفع" : "Payment Order Date",
    receiptNo: isAr ? "رقم وصل الدفع" : "Payment Receipt No.",
    amountPaid: isAr ? "المبلغ المسدَّد (شامل الضريبة)" : "Amount Paid (incl. VAT)",
    taxSummary: isAr ? "تفاصيل المبالغ والضريبة" : "Amount & VAT Summary",
    summaryTitle: isAr ? "ملخص الطلب" : "Request Summary",
    servicesTitle: isAr ? "ملخص الاختبارات المنجزة" : "Completed Tests Summary",
    statementTitle: isAr ? "نص الشهادة" : "Certificate Statement",
    colNo: "#",
    colSample: isAr ? "كود العينة" : "Sample Code",
    colTest: isAr ? "نوع الاختبار" : "Test Type",
    colStd: isAr ? "المعيار" : "Standard",
    colResult: isAr ? "النتيجة" : "Result",
    pass: isAr ? "مطابق" : "PASS",
    fail: isAr ? "غير مطابق" : "FAIL",
    pending: isAr ? "قيد الفحص" : "Pending",
    body: isAr
      ? `يشهد ${LAB_PRINT_BRANDING.nameAr} بأن المقاول <strong>${req.contractorName ?? "—"}</strong> قد أتمّ جميع إجراءات الفحص والاختبار المتعلقة بالعقد رقم <strong>${req.contractNumber ?? "—"}</strong> للمشروع <strong>${req.contractName ?? "—"}</strong>، وأن جميع الاختبارات المنجزة قد اجتازت مراجعة ضبط الجودة، كما تم سداد جميع الرسوم المستحقة البالغة <strong>${amountFormatted}</strong>. وبناءً على ذلك، تُصدر هذه الشهادة تأكيداً لبراءة ذمته من أي التزامات مالية أو فنية تجاه المختبر فيما يخص هذا العقد.`
      : `The ${LAB_PRINT_BRANDING.nameEn} certifies that contractor <strong>${req.contractorName ?? "—"}</strong> has completed all testing and inspection procedures for contract no. <strong>${req.contractNumber ?? "—"}</strong> (${req.contractName ?? "—"}). All completed tests have passed quality control review, and all outstanding fees totaling <strong>${amountFormatted}</strong> have been paid. This certificate confirms clearance of all financial and technical obligations to the laboratory for this contract.`,
    approved: isAr ? "معتمد — جميع الاختبارات مُراجَعة ومطابقة" : "Approved — All tests reviewed and cleared",
    notes: isAr ? "ملاحظات" : "Notes",
    footerLab: `${LAB_PRINT_BRANDING.nameEn} — ${LAB_PRINT_BRANDING.nameAr}`,
    footerPrinted: isAr ? "تاريخ الطباعة" : "Printed",
  };

  const rows = inventory.map((item: any, i: number) => {
    const testName = isAr ? (item.testNameAr || item.testName) : (item.testName || item.testNameAr);
    return `<tr>
      <td class="col-no">${i + 1}</td>
      <td class="mono">${item.sampleCode ?? "—"}</td>
      <td>${testName ?? "—"}</td>
      <td class="col-std">${item.standard ?? "—"}</td>
      <td class="col-result">${resultCell(item.result ?? "pending", L)}</td>
    </tr>`;
  }).join("");

  const notesBlock = req.notes
    ? `<div class="info-section"><h3 class="section-heading">${L.notes}</h3><p class="notes-text">${req.notes}</p></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${L.docTitle} — ${req.certificateCode ?? req.requestCode ?? ""}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${isAr ? "'Segoe UI', 'IBM Plex Sans Arabic', Arial, sans-serif" : "Arial, Helvetica, sans-serif"};
      direction: ${dir};
      color: #111827;
      font-size: 11px;
      line-height: 1.45;
      background: #fff;
    }
    .page { max-width: 210mm; margin: 0 auto; }

    /* ── Header (matches LabReportHeader) ── */
    .header-wrap { border-top: 4px solid #111827; padding-top: 12px; margin-bottom: 4px; }
    .header { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 12px; }
    .logo {
      width: 56px; height: 56px; border: 2px solid #1f2937; border-radius: 50%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-weight: 900; font-size: 22px; line-height: 1; color: #111827; flex-shrink: 0;
    }
    .logo-sub { font-size: 8px; letter-spacing: 0.18em; margin-top: 2px; color: #374151; }
    .lab-name { font-size: 17px; font-weight: 800; color: #111827; line-height: 1.3; }
    .lab-sub { font-size: 13px; color: #111827; margin-top: 2px; }
    .lab-contact { font-size: 11px; color: #111827; margin-top: 2px; }
    .doc-meta {
      display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 8px; padding-top: 8px;
      border-top: 1px solid #d1d5db; font-size: 12px; color: #111827;
    }
    .doc-meta strong { font-weight: 700; }
    .doc-meta .mono { font-family: ui-monospace, monospace; font-weight: 400; }

    /* ── Title bar (matches test report) ── */
    .title-bar {
      background: #111827; color: #fff; text-align: center;
      padding: 6px 16px; margin: 4px 0 14px;
    }
    .title-bar h1 { font-size: 14px; font-weight: 700; }
    .title-bar p { font-size: 12px; color: #f3f4f6; margin-top: 2px; letter-spacing: 0.06em; }

    /* ── Info sections (matches report-info-section) ── */
    .info-section { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
    .section-heading {
      font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase;
      letter-spacing: 0.08em; border-bottom: 2px solid #64748b; padding-bottom: 6px; margin-bottom: 10px;
    }
    .info-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .info-table td { padding: 8px 8px 8px 0; vertical-align: top; }
    .info-table .label {
      width: 24%; font-size: 13px; font-weight: 800; color: #0f172a;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .info-table .value { width: 26%; font-size: 12px; font-weight: 400; color: #334155; padding-left: 8px; }

    .body-text {
      font-size: 12px; line-height: 1.85; text-align: justify; color: #1f2937;
      padding: 12px 0;
    }
    .body-text strong { color: #111827; font-weight: 700; }
    .notes-text { font-size: 12px; color: #374151; line-height: 1.6; }

    /* ── Results table (matches lab-results-table) ── */
    .results-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
    .results-table thead tr { background: #f3f4f6; }
    .results-table th {
      padding: 8px 10px; text-align: ${align}; font-weight: 700; font-size: 11px;
      color: #111827; border-bottom: 1px solid #d1d5db;
    }
    .results-table td {
      padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: ${align}; vertical-align: middle;
      color: #374151;
    }
    .results-table tbody tr:nth-child(even) td { background: #fafafa; }
    .col-no { width: 32px; text-align: center !important; color: #6b7280; font-weight: 600; }
    .col-std { font-size: 10px; color: #6b7280; }
    .col-result { text-align: center !important; font-weight: 700; }
    .mono { font-family: ui-monospace, monospace; font-weight: 600; color: #111827; }
    .result-pass { color: #15803d; }
    .result-fail { color: #b91c1c; }
    .result-pending { color: #6b7280; }

    .approved-box { display: flex; justify-content: center; margin: 16px 0 8px; }
    .approved-badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px;
      background: #f9fafb; border: 1px solid #d1d5db; border-radius: 4px;
      color: #111827; font-weight: 700; font-size: 12px;
    }

    .footer {
      margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af;
    }

    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    ${TAX_PRINT_CSS}
  </style>
</head>
<body>
  <div class="page lab-print-root report-page">
    <header class="header-wrap">
      <div class="header">
        <div class="logo">م<span class="logo-sub">LAB</span></div>
        <div class="flex-1">
          <div class="lab-name">${labName}</div>
          <div class="lab-sub">${labNameSub}</div>
          ${LAB_PRINT_BRANDING.address ? `<div class="lab-contact">${LAB_PRINT_BRANDING.address}</div>` : ""}
          ${contact ? `<div class="lab-contact">${contact}</div>` : ""}
          <div class="doc-meta">
            <div><strong>${L.docNo}</strong> <span class="mono">${req.certificateCode ?? "—"}</span></div>
            <div><strong>${L.reportDate}</strong> ${certDate}</div>
            <div><strong>${L.reqNo}</strong> <span class="mono">${req.requestCode ?? "—"}</span></div>
          </div>
        </div>
      </div>
    </header>

    <div class="title-bar">
      <h1>${L.docTitle}</h1>
      <p>${L.docTitleSub}</p>
    </div>

    <div class="info-section">
      <h3 class="section-heading">${L.summaryTitle}</h3>
      <table class="info-table">
        <tbody>
          <tr>
            <td class="label">${L.contractor}</td>
            <td class="value">${req.contractorName ?? "—"}</td>
            <td class="label">${L.contractNo}</td>
            <td class="value">${req.contractNumber ?? "—"}</td>
          </tr>
          <tr>
            <td class="label">${L.project}</td>
            <td class="value" colspan="3">${req.contractName ?? "—"}</td>
          </tr>
          <tr>
            <td class="label">${L.poNo}</td>
            <td class="value">${req.paymentOrderNumber ?? "—"}</td>
            <td class="label">${L.poDate}</td>
            <td class="value">${poDate}</td>
          </tr>
          <tr>
            <td class="label">${L.receiptNo}</td>
            <td class="value">${req.paymentReceiptNumber ?? "—"}</td>
            <td class="label">${L.amountPaid}</td>
            <td class="value">${amountFormatted}</td>
          </tr>
        </tbody>
      </table>
      <h3 class="section-heading" style="margin-top:12px;font-size:13px">${L.taxSummary}</h3>
      ${taxSummaryHtml}
      ${requiresContractorTrn(tax.total) && !(req.contractorTrn ?? taxOptions.contractorTrn)
        ? `<p class="notes-text" style="margin-top:8px;color:#b45309">${isAr ? "ملاحظة: المبلغ ≥ 10,000 درهم — يُفضَّل تسجيل الرقم الضريبي للمقاول." : "Note: Amount ≥ AED 10,000 — contractor TRN should be on file."}</p>`
        : ""}
    </div>

    <div class="info-section">
      <h3 class="section-heading">${L.statementTitle}</h3>
      <div class="body-text">${L.body}</div>
    </div>
    ${notesBlock}

    ${inventory.length > 0 ? `
    <div class="info-section">
      <h3 class="section-heading">${L.servicesTitle}</h3>
      <table class="results-table lab-results-table">
        <thead>
          <tr>
            <th class="col-no">${L.colNo}</th>
            <th>${L.colSample}</th>
            <th>${L.colTest}</th>
            <th>${L.colStd}</th>
            <th class="col-result">${L.colResult}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ""}

    <div class="approved-box">
      <div class="approved-badge"><span style="font-size:16px">✓</span> ${L.approved}</div>
    </div>

    <div class="footer">
      <span>${L.footerLab}</span>
      <span>${L.footerPrinted}: ${printedAt}</span>
    </div>
  </div>
</body>
</html>`;
}

export function openClearanceCertificatePrint(
  req: ClearanceCertificateRequest,
  printLang: ClearancePrintLang = "ar",
  taxOptions: TaxPrintOptions = {}
) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(buildClearanceCertificateHtml(req, printLang, taxOptions));
  w.document.close();
  w.focus();
  w.print();
  return true;
}
