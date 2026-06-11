/**
 * Monthly Performance Report — Server-side PDF Generator
 * Uses puppeteer to render an HTML template and produce a PDF,
 * then uploads the result to S3 via storagePut.
 */
import { launchPuppeteerBrowser } from "./puppeteerBrowser";
import { storagePut } from "./storage";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MonthlyReportData {
  period: { year: number; month: number };
  orders: { total: number; completed: number; rejected: number; pending: number; qcPassed: number };
  clearances: { total: number; issued: number; pending: number; avgDays: number | null };
  tests: { total: number; passed: number; failed: number; passRate: number | null };
  testBreakdown: Array<{ code: string; nameAr: string; nameEn: string; category: string; count: number; passed: number; failed: number }>;
  technicianPerformance: Array<{ id: number; name: string; completed: number; total: number }>;
  bySampleType: Array<{ type: string; count: number }>;
}

const ARABIC_MONTHS = [
  "", "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];
const ENGLISH_MONTHS = [
  "", "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  concrete:   { ar: "خرسانة",  en: "Concrete" },
  soil:       { ar: "تربة",    en: "Soil" },
  steel:      { ar: "حديد",    en: "Steel" },
  asphalt:    { ar: "أسفلت",   en: "Asphalt" },
  aggregates: { ar: "ركام",    en: "Aggregates" },
};

// ─── HTML Template ────────────────────────────────────────────────────────────
function buildHtml(data: MonthlyReportData, lang: "ar" | "en"): string {
  const isAr = lang === "ar";
  const dir  = isAr ? "rtl" : "ltr";
  const monthLabel = isAr
    ? `${ARABIC_MONTHS[data.period.month]} ${data.period.year}`
    : `${ENGLISH_MONTHS[data.period.month]} ${data.period.year}`;

  const completionRate = data.orders.total > 0
    ? Math.round((data.orders.completed / data.orders.total) * 100)
    : 0;

  // ── KPI cards row ──────────────────────────────────────────────────────────
  const kpiCards = [
    { label: isAr ? "إجمالي الطلبات"    : "Total Orders",     value: data.orders.total,        color: "#3b82f6" },
    { label: isAr ? "مكتملة"            : "Completed",        value: data.orders.completed,    color: "#10b981" },
    { label: isAr ? "اجتازت QC"         : "QC Passed",        value: data.orders.qcPassed,     color: "#8b5cf6" },
    { label: isAr ? "قيد التنفيذ"       : "In Progress",      value: data.orders.pending,      color: "#f59e0b" },
    { label: isAr ? "مرفوضة"            : "Rejected",         value: data.orders.rejected,     color: "#ef4444" },
    { label: isAr ? "نسبة الإنجاز"      : "Completion Rate",  value: `${completionRate}%`,     color: "#06b6d4" },
  ].map(k => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;min-width:100px;flex:1">
      <div style="font-size:28px;font-weight:700;color:${k.color}">${k.value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${k.label}</div>
    </div>`).join("");

  // ── Clearance KPIs ─────────────────────────────────────────────────────────
  const clearanceCards = [
    { label: isAr ? "إجمالي طلبات البراءة" : "Total Clearance Requests", value: data.clearances.total,   color: "#3b82f6" },
    { label: isAr ? "صادرة"                : "Issued",                    value: data.clearances.issued,  color: "#10b981" },
    { label: isAr ? "قيد الإجراء"          : "In Progress",               value: data.clearances.pending, color: "#f59e0b" },
    {
      label: isAr ? "متوسط وقت الإنجاز (أيام)" : "Avg Turnaround (days)",
      value: data.clearances.avgDays !== null ? `${data.clearances.avgDays}` : (isAr ? "—" : "—"),
      color: "#8b5cf6",
    },
  ].map(k => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;min-width:100px;flex:1">
      <div style="font-size:28px;font-weight:700;color:${k.color}">${k.value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${k.label}</div>
    </div>`).join("");

  // ── Tests KPIs ─────────────────────────────────────────────────────────────
  const testCards = [
    { label: isAr ? "إجمالي الاختبارات" : "Total Tests",  value: data.tests.total,                                                      color: "#3b82f6" },
    { label: isAr ? "ناجحة"             : "Passed",        value: data.tests.passed,                                                     color: "#10b981" },
    { label: isAr ? "فاشلة"             : "Failed",        value: data.tests.failed,                                                     color: "#ef4444" },
    { label: isAr ? "نسبة النجاح"       : "Pass Rate",     value: data.tests.passRate !== null ? `${data.tests.passRate}%` : "—",        color: "#06b6d4" },
  ].map(k => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;min-width:100px;flex:1">
      <div style="font-size:28px;font-weight:700;color:${k.color}">${k.value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px">${k.label}</div>
    </div>`).join("");

  // ── Test breakdown table ───────────────────────────────────────────────────
  const testRows = data.testBreakdown.map((t, i) => {
    const rate = t.count > 0 ? Math.round((t.passed / t.count) * 100) : 0;
    const catLabel = CATEGORY_LABELS[t.category]?.[lang] ?? t.category;
    return `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${isAr ? t.nameAr : t.nameEn}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${catLabel}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600">${t.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#10b981;font-weight:600">${t.passed}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#ef4444;font-weight:600">${t.failed}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:${rate >= 80 ? "#10b981" : rate >= 60 ? "#f59e0b" : "#ef4444"};font-weight:700">${t.count > 0 ? `${rate}%` : "—"}</td>
      </tr>`;
  }).join("");

  // ── Technician table ───────────────────────────────────────────────────────
  const techRows = data.technicianPerformance.map((tech, i) => {
    const rate = tech.total > 0 ? Math.round((tech.completed / tech.total) * 100) : 0;
    return `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:500">${tech.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${tech.total}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#10b981;font-weight:600">${tech.completed}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:${rate >= 80 ? "#10b981" : rate >= 60 ? "#f59e0b" : "#ef4444"};font-weight:700">${rate}%</td>
      </tr>`;
  }).join("");

  const techSection = data.technicianPerformance.length > 0 ? `
    <div style="margin-top:32px">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px;border-bottom:2px solid #3b82f6;padding-bottom:6px">
        ${isAr ? "أداء الفنيين" : "Technician Performance"}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#1e293b;color:#fff">
            <th style="padding:10px 12px;text-align:${isAr ? "right" : "left"}">${isAr ? "الفني" : "Technician"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "إجمالي الطلبات" : "Total Orders"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "مكتملة" : "Completed"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "نسبة الإنجاز" : "Completion Rate"}</th>
          </tr>
        </thead>
        <tbody>${techRows}</tbody>
      </table>
    </div>` : "";

  const testSection = data.testBreakdown.length > 0 ? `
    <div style="margin-top:32px">
      <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px;border-bottom:2px solid #3b82f6;padding-bottom:6px">
        ${isAr ? "تفاصيل الاختبارات حسب النوع" : "Test Breakdown by Type"}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#1e293b;color:#fff">
            <th style="padding:10px 12px;text-align:${isAr ? "right" : "left"}">${isAr ? "نوع الاختبار" : "Test Type"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "الفئة" : "Category"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "العدد" : "Count"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "ناجح" : "Passed"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "فاشل" : "Failed"}</th>
            <th style="padding:10px 12px;text-align:center">${isAr ? "نسبة النجاح" : "Pass Rate"}</th>
          </tr>
        </thead>
        <tbody>${testRows}</tbody>
      </table>
    </div>` : "";

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${isAr ? "تقرير الأداء الشهري" : "Monthly Performance Report"}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${isAr ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"};
      direction: ${dir};
      color: #1e293b;
      background: #fff;
      padding: 32px;
      font-size: 13px;
      line-height: 1.6;
    }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="border-bottom:3px solid #1e293b;padding-bottom:16px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1 style="font-size:22px;font-weight:700;color:#1e293b">
          ${isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory"}
        </h1>
        <p style="font-size:13px;color:#64748b;margin-top:4px">
          ${isAr ? "تقرير الأداء الشهري" : "Monthly Performance Report"}
        </p>
      </div>
      <div style="text-align:${isAr ? "left" : "right"}">
        <div style="font-size:18px;font-weight:700;color:#3b82f6">${monthLabel}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">
          ${isAr ? "تاريخ الإصدار:" : "Generated:"} ${new Date().toLocaleDateString(isAr ? "ar-AE" : "en-GB")}
        </div>
      </div>
    </div>
  </div>

  <!-- Orders KPIs -->
  <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;border-bottom:2px solid #3b82f6;padding-bottom:6px">
    ${isAr ? "أداء الطلبات" : "Orders Performance"}
  </h2>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">${kpiCards}</div>

  <!-- Clearance KPIs -->
  <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;border-bottom:2px solid #10b981;padding-bottom:6px">
    ${isAr ? "براءات الذمة" : "Clearance Certificates"}
  </h2>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">${clearanceCards}</div>

  <!-- Tests KPIs -->
  <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;border-bottom:2px solid #8b5cf6;padding-bottom:6px">
    ${isAr ? "أداء الاختبارات" : "Tests Performance"}
  </h2>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">${testCards}</div>

  <!-- Test Breakdown Table -->
  ${testSection}

  <!-- Technician Performance Table -->
  ${techSection}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8">
    ${isAr
      ? `تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المختبر — ${new Date().toLocaleString("ar-AE")}`
      : `Auto-generated by Lab Management System — ${new Date().toLocaleString("en-GB")}`}
  </div>
</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateMonthlyReportPdf(
  data: MonthlyReportData,
  lang: "ar" | "en" = "ar"
): Promise<string> {
  const html = buildHtml(data, lang);

  const browser = await launchPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    // Upload to S3
    const key = `monthly-reports/${data.period.year}-${String(data.period.month).padStart(2, "0")}-${lang}-${Date.now()}.pdf`;
    const { url } = await storagePut(key, Buffer.from(pdfBuffer), "application/pdf");
    return url;
  } finally {
    await browser.close();
  }
}
