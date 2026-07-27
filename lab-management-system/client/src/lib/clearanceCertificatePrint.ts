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
};

function formatDate(value: Date | string | null | undefined, isAr: boolean) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(isAr ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resultBadge(result: string, L: { pass: string; fail: string; pending: string }) {
  if (result === "pass") return `<span class="badge badge-pass">${L.pass}</span>`;
  if (result === "fail") return `<span class="badge badge-fail">${L.fail}</span>`;
  return `<span class="badge badge-pending">${L.pending}</span>`;
}

export function buildClearanceCertificateHtml(
  req: ClearanceCertificateRequest,
  printLang: ClearancePrintLang = "ar"
): string {
  const isAr = printLang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const align = isAr ? "right" : "left";
  const alignOpp = isAr ? "left" : "right";
  const inventory = (Array.isArray(req.inventoryData) ? req.inventoryData : []) as any[];

  const testCount = Number(req.totalTests ?? inventory.length);
  const passedCount = Number(req.passedTests ?? inventory.filter((i) => i.result === "pass").length);
  const failedCount = Number(req.failedTests ?? inventory.filter((i) => i.result === "fail").length);
  const totalAmount = Number(req.totalAmount ?? inventory.reduce((s, i) => s + Number(i.price ?? 0), 0));
  const amountFormatted = `${totalAmount.toFixed(2)} ${isAr ? "درهم إ.م" : "AED"}`;

  const certDate = formatDate(req.certificateIssuedAt ?? null, isAr);
  const poDate = formatDate(req.paymentOrderDate ?? null, isAr);
  const printedAt = new Date().toLocaleString(isAr ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const L = {
    docTitle: isAr ? "شهادة براءة الذمة" : "Clearance Certificate",
    docTitleSub: isAr ? "Clearance Certificate" : "شهادة براءة الذمة",
    labName: isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction Materials & Engineering Laboratory",
    labNameSub: isAr ? "Construction Materials & Engineering Laboratory" : "مختبر الإنشاءات والمواد الهندسية",
    certNo: isAr ? "رقم الشهادة" : "Certificate No.",
    issueDate: isAr ? "تاريخ الإصدار" : "Issue Date",
    reqNo: isAr ? "رقم طلب البراءة" : "Clearance Request No.",
    contractor: isAr ? "المقاول" : "Contractor",
    contractNo: isAr ? "رقم العقد" : "Contract No.",
    project: isAr ? "اسم المشروع" : "Project Name",
    poNo: isAr ? "رقم أمر الدفع" : "Payment Order No.",
    poDate: isAr ? "تاريخ أمر الدفع" : "Payment Order Date",
    receiptNo: isAr ? "رقم وصل الدفع" : "Payment Receipt No.",
    amountPaid: isAr ? "المبلغ المسدَّد" : "Amount Paid",
    summaryTests: isAr ? "الاختبارات" : "Tests",
    summaryPass: isAr ? "مطابق" : "Pass",
    summaryFail: isAr ? "غير مطابق" : "Fail",
    servicesTitle: isAr ? "ملخص الاختبارات المنجزة" : "Completed Tests Summary",
    colNo: "#",
    colSample: isAr ? "كود العينة" : "Sample Code",
    colTest: isAr ? "نوع الاختبار" : "Test Type",
    colStd: isAr ? "المعيار" : "Standard",
    colResult: isAr ? "النتيجة" : "Result",
    pass: isAr ? "مطابق" : "Pass",
    fail: isAr ? "غير مطابق" : "Fail",
    pending: isAr ? "قيد الفحص" : "Pending",
    bodyTitle: isAr ? "نص الشهادة" : "Certificate Statement",
    body: isAr
      ? `يشهد مختبر الإنشاءات والمواد الهندسية بأن المقاول <strong>${req.contractorName ?? "—"}</strong> قد أتمّ جميع إجراءات الفحص والاختبار المتعلقة بالعقد رقم <strong>${req.contractNumber ?? "—"}</strong> للمشروع <strong>${req.contractName ?? "—"}</strong>، وأن جميع الاختبارات المنجزة قد اجتازت مراجعة ضبط الجودة، كما تم سداد جميع الرسوم المستحقة البالغة <strong>${amountFormatted}</strong>. وبناءً على ذلك، تُصدر هذه الشهادة تأكيداً لبراءة ذمته من أي التزامات مالية أو فنية تجاه المختبر فيما يخص هذا العقد.`
      : `The Construction Materials & Engineering Laboratory certifies that contractor <strong>${req.contractorName ?? "—"}</strong> has completed all testing and inspection procedures for contract no. <strong>${req.contractNumber ?? "—"}</strong> (${req.contractName ?? "—"}). All completed tests have passed quality control review, and all outstanding fees totaling <strong>${amountFormatted}</strong> have been paid. This certificate confirms clearance of all financial and technical obligations to the laboratory for this contract.`,
    approved: isAr ? "معتمد — جميع الاختبارات مُراجَعة ومطابقة" : "Approved — All tests reviewed and cleared",
    sigManager: isAr ? "مدير المختبر" : "Laboratory Manager",
    sigQc: isAr ? "مسؤول ضبط الجودة" : "QC Inspector",
    sigAccountant: isAr ? "المحاسب" : "Accountant",
    sigContractor: isAr ? "المقاول / الختم" : "Contractor / Stamp",
    sigDate: isAr ? "التاريخ" : "Date",
    footerPrinted: isAr ? "طُبع في" : "Printed",
    notes: isAr ? "ملاحظات" : "Notes",
  };

  const rows = inventory.map((item: any, i: number) => {
    const testName = isAr ? (item.testNameAr || item.testName) : (item.testName || item.testNameAr);
    return `<tr>
      <td class="col-no">${i + 1}</td>
      <td class="mono">${item.sampleCode ?? "—"}</td>
      <td>${testName ?? "—"}</td>
      <td class="col-std">${item.standard ?? "—"}</td>
      <td class="col-result">${resultBadge(item.result ?? "pending", L)}</td>
    </tr>`;
  }).join("");

  const notesBlock = req.notes
    ? `<div class="notes-box"><strong>${L.notes}:</strong> ${req.notes}</div>`
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
      font-family: ${isAr ? "'Segoe UI', 'IBM Plex Sans Arabic', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"};
      direction: ${dir};
      color: #0f172a;
      font-size: 12px;
      line-height: 1.45;
      background: #fff;
    }
    .page { max-width: 210mm; margin: 0 auto; }
    .top-rule { border-top: 4px solid #14532d; padding-top: 14px; margin-bottom: 12px; }
    .header { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: start; }
    .logo {
      width: 56px; height: 56px; border: 2px solid #14532d; border-radius: 50%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-weight: 900; font-size: 22px; line-height: 1;
    }
    .logo-sub { font-size: 8px; letter-spacing: 0.18em; margin-top: 2px; color: #64748b; }
    .lab-name { font-size: 17px; font-weight: 800; color: #14532d; line-height: 1.25; }
    .lab-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
    .doc-meta { text-align: ${alignOpp}; font-size: 11px; color: #475569; line-height: 1.7; }
    .doc-meta strong { color: #0f172a; font-weight: 700; }
    .doc-meta .mono { font-family: ui-monospace, monospace; font-weight: 700; color: #15803d; }
    .title-bar {
      background: linear-gradient(135deg, #14532d 0%, #166534 100%);
      color: #fff; text-align: center; padding: 14px 16px; margin: 14px 0 16px; border-radius: 4px;
    }
    .title-bar h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.04em; }
    .title-bar p { font-size: 10px; color: #bbf7d0; margin-top: 4px; letter-spacing: 0.12em; text-transform: uppercase; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; text-align: center; background: #f8fafc; }
    .stat-value { font-size: 20px; font-weight: 800; line-height: 1.1; }
    .stat-label { font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-pass .stat-value { color: #15803d; }
    .stat-fail .stat-value { color: #b91c1c; }
    .stat-amount { background: #f0fdf4; border-color: #bbf7d0; }
    .stat-amount .stat-value { color: #15803d; font-size: 15px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #dbe3ee; border-radius: 6px; overflow: hidden; }
    .info-table td { padding: 9px 12px; border-bottom: 1px solid #e8edf3; vertical-align: top; }
    .info-table tr:last-child td { border-bottom: none; }
    .info-table .label { width: 22%; background: #ecfdf5; font-weight: 700; color: #166534; font-size: 11px; }
    .info-table .value { font-weight: 600; color: #0f172a; }
    .section-title {
      font-size: 11px; font-weight: 800; color: #166534; text-transform: uppercase;
      letter-spacing: 0.06em; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #14532d;
    }
    .body-text {
      font-size: 13px; line-height: 1.9; text-align: justify; padding: 18px 20px;
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; margin-bottom: 16px; color: #14532d;
    }
    .body-text strong { color: #14532d; }
    .notes-box {
      font-size: 11px; color: #475569; padding: 10px 14px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 16px;
    }
    .services-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
    .services-table thead tr { background: #14532d; color: #fff; }
    .services-table th { padding: 9px 10px; text-align: ${align}; font-weight: 700; font-size: 10px; }
    .services-table td { padding: 8px 10px; border-bottom: 1px solid #e8edf3; text-align: ${align}; vertical-align: middle; }
    .services-table tbody tr:nth-child(even) td { background: #f8fafc; }
    .col-no { width: 32px; text-align: center !important; color: #64748b; font-weight: 700; }
    .col-std { font-size: 10px; color: #64748b; max-width: 120px; }
    .col-result { text-align: center !important; }
    .mono { font-family: ui-monospace, monospace; font-weight: 700; color: #15803d; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
    .badge-pass { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-fail { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-pending { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
    .approved-box {
      display: flex; justify-content: center; margin: 16px 0 24px;
    }
    .approved-badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px;
      background: #f0fdf4; border: 2px solid #16a34a; border-radius: 8px;
      color: #15803d; font-weight: 800; font-size: 13px;
    }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; margin-top: 8px; }
    .sig-block { text-align: center; }
    .sig-line { border-top: 1.5px solid #334155; margin-top: 44px; padding-top: 8px; }
    .sig-title { font-size: 10px; font-weight: 800; color: #334155; }
    .sig-name { font-size: 10px; color: #64748b; margin-top: 4px; min-height: 14px; }
    .sig-date { font-size: 9px; color: #94a3b8; margin-top: 8px; }
    .footer {
      margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;
    }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-rule">
      <div class="header">
        <div class="logo">م<span class="logo-sub">LAB</span></div>
        <div>
          <div class="lab-name">${L.labName}</div>
          <div class="lab-sub">${L.labNameSub}</div>
        </div>
        <div class="doc-meta">
          <div><strong>${L.certNo}:</strong> <span class="mono">${req.certificateCode ?? "—"}</span></div>
          <div><strong>${L.issueDate}:</strong> ${certDate}</div>
          <div><strong>${L.reqNo}:</strong> <span class="mono">${req.requestCode ?? "—"}</span></div>
        </div>
      </div>
    </div>

    <div class="title-bar">
      <h1>${L.docTitle}</h1>
      <p>${L.docTitleSub}</p>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${testCount}</div><div class="stat-label">${L.summaryTests}</div></div>
      <div class="stat stat-pass"><div class="stat-value">${passedCount}</div><div class="stat-label">${L.summaryPass}</div></div>
      <div class="stat stat-fail"><div class="stat-value">${failedCount}</div><div class="stat-label">${L.summaryFail}</div></div>
      <div class="stat stat-amount"><div class="stat-value">${amountFormatted}</div><div class="stat-label">${L.amountPaid}</div></div>
    </div>

    <table class="info-table">
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
    </table>

    <div class="section-title">${L.bodyTitle}</div>
    <div class="body-text">${L.body}</div>
    ${notesBlock}

    ${inventory.length > 0 ? `
    <div class="section-title">${L.servicesTitle}</div>
    <table class="services-table">
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
    </table>` : ""}

    <div class="approved-box">
      <div class="approved-badge"><span style="font-size:18px">✓</span> ${L.approved}</div>
    </div>

    <div class="signatures">
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigManager}</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigQc}</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigAccountant}</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigContractor}</div>
          <div class="sig-name">${req.contractorName ?? ""}</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>${L.labName}</span>
      <span>${L.footerPrinted}: ${printedAt}</span>
    </div>
  </div>
</body>
</html>`;
}

export function openClearanceCertificatePrint(
  req: ClearanceCertificateRequest,
  printLang: ClearancePrintLang = "ar"
) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(buildClearanceCertificateHtml(req, printLang));
  w.document.close();
  w.focus();
  w.print();
  return true;
}
