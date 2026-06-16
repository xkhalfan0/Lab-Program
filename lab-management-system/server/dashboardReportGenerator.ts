/**
 * Boss dashboard report generator — PDF (puppeteer) or Excel (CSV).
 * Returns base64 inline so reports work without external storage credentials.
 */
import { launchPuppeteerBrowser } from "./puppeteerBrowser";
import {
  computeContractReadinessRows,
  computeContractorScores,
  computeOrderKpisFromStatusCounts,
} from "@shared/dashboardInsights";
import {
  getAllSamples,
  getAllLabOrders,
  getAllUsers,
  getAllDistributions,
} from "./db";
import { SAMPLE_STATUS_GROUPS, isInGroup } from "@shared/statusGroups";

export type ReportSection =
  | "overview"
  | "status"
  | "type"
  | "trend"
  | "passfail"
  | "readiness"
  | "scorecard"
  | "toptests"
  | "techperf";

export type ReportInput = {
  sections: ReportSection[];
  range: "month" | "quarter" | "year" | "custom";
  dateFrom?: string;
  dateTo?: string;
  format: "pdf" | "excel";
  lang?: ReportLang;
};

export type ReportLang = "ar" | "en" | "both";

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  concrete: { ar: "خرسانة", en: "Concrete" },
  soil: { ar: "تربة", en: "Soil" },
  steel: { ar: "حديد", en: "Steel" },
  metal: { ar: "معادن", en: "Metal" },
  asphalt: { ar: "أسفلت", en: "Asphalt" },
  aggregates: { ar: "ركام", en: "Aggregates" },
  other: { ar: "أخرى", en: "Other" },
};

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  received: { ar: "مستلم", en: "Received" },
  distributed: { ar: "موزع", en: "Distributed" },
  testing_in_progress: { ar: "قيد الاختبار", en: "Testing In Progress" },
  awaiting_review: { ar: "في انتظار المراجعة", en: "Awaiting Review" },
  under_review: { ar: "قيد المراجعة", en: "Under Review" },
  tested: { ar: "تم الاختبار", en: "Tested" },
  processed: { ar: "قيد المعالجة", en: "Processed" },
  reviewed: { ar: "قيد المراجعة", en: "Reviewed" },
  approved: { ar: "معتمد من المشرف", en: "Supervisor Approved" },
  qc_passed: { ar: "اجتاز ضبط الجودة", en: "QC Passed" },
  qc_failed: { ar: "رفض ضبط الجودة", en: "QC Failed" },
  clearance_requested: { ar: "طلب براءة الذمة", en: "Clearance Requested" },
  clearance_issued: { ar: "صدرت براءة الذمة", en: "Clearance Issued" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  revision_requested: { ar: "طلب مراجعة", en: "Revision Requested" },
  deleted: { ar: "محذوف", en: "Deleted" },
};

const RISK_LABELS: Record<string, { ar: string; en: string }> = {
  low: { ar: "منخفض", en: "Low" },
  medium: { ar: "متوسط", en: "Medium" },
  high: { ar: "مرتفع", en: "High" },
  critical: { ar: "حرج", en: "Critical" },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bi(ar: string, en: string, lang: ReportLang): string {
  if (lang === "ar") return escapeHtml(ar);
  if (lang === "en") return escapeHtml(en);
  return `<span>${escapeHtml(en)}</span> <span dir="rtl" style="color:#475569;font-size:0.9em">/ ${escapeHtml(ar)}</span>`;
}

function biBlock(ar: string, en: string, lang: ReportLang): string {
  if (lang === "ar") return `<span dir="rtl">${escapeHtml(ar)}</span>`;
  if (lang === "en") return escapeHtml(en);
  return `<div>${escapeHtml(en)}</div><div dir="rtl" style="font-size:0.88em;color:#64748b;margin-top:3px;line-height:1.35">${escapeHtml(ar)}</div>`;
}

function biSection(ar: string, en: string, lang: ReportLang): string {
  if (lang === "both") {
    return `${escapeHtml(en)}<span style="color:#cbd5e1;margin:0 8px">|</span><span dir="rtl">${escapeHtml(ar)}</span>`;
  }
  return lang === "ar" ? escapeHtml(ar) : escapeHtml(en);
}

function statusText(status: string): { ar: string; en: string } {
  const en =
    STATUS_LABELS[status]?.en ??
    status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const ar = STATUS_LABELS[status]?.ar ?? en;
  return { ar, en };
}

function categoryText(category: string): { ar: string; en: string } {
  const en =
    CATEGORY_LABELS[category]?.en ??
    category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const ar = CATEGORY_LABELS[category]?.ar ?? en;
  return { ar, en };
}

function formatStatusCell(status: string, lang: ReportLang): string {
  const { ar, en } = statusText(status);
  return biBlock(ar, en, lang);
}

function formatCategoryCell(category: string, lang: ReportLang): string {
  const { ar, en } = categoryText(category);
  return biBlock(ar, en, lang);
}

function formatMonth(ym: string, lang: ReportLang): string {
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return escapeHtml(ym);
  const date = new Date(year, month - 1, 1);
  const en = date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const ar = date.toLocaleDateString("ar-AE", { month: "long", year: "numeric" });
  return biBlock(ar, en, lang);
}

function formatRangeLabel(input: ReportInput, lang: ReportLang): string {
  const { from, to } = resolveRange(input);
  const fmtEn = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const fmtAr = (d: Date) =>
    d.toLocaleDateString("ar-AE", { day: "numeric", month: "long", year: "numeric" });
  const presets: Record<ReportInput["range"], { ar: string; en: string }> = {
    month: { ar: "هذا الشهر", en: "Current Month" },
    quarter: { ar: "هذا الربع", en: "Current Quarter" },
    year: { ar: "هذا العام", en: "Current Year" },
    custom: { ar: "نطاق مخصص", en: "Custom Period" },
  };
  const preset = presets[input.range];
  const en = `${preset.en} (${fmtEn(from)} — ${fmtEn(to)})`;
  const ar = `${preset.ar} (${fmtAr(from)} — ${fmtAr(to)})`;
  return biBlock(ar, en, lang);
}

function formatRiskCell(riskLevel: string, lang: ReportLang): string {
  const riskKey = riskLevel.toLowerCase();
  const ar = RISK_LABELS[riskKey]?.ar ?? riskLevel;
  const en = RISK_LABELS[riskKey]?.en ?? riskLevel;
  return biBlock(ar, en, lang);
}

function resolveRange(input: ReportInput): { from: Date; to: Date } {
  const now = new Date();
  if (input.range === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  if (input.range === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return { from: new Date(now.getFullYear(), q, 1), to: now };
  }
  if (input.range === "year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  return {
    from: new Date(input.dateFrom!),
    to: new Date(`${input.dateTo}T23:59:59`),
  };
}

async function collectSectionData(sections: ReportSection[], from: Date, to: Date) {
  const allOrders = await getAllLabOrders();
  const allSamples = await getAllSamples();
  const ordersInRange = allOrders.filter((o) => {
    const t = new Date(o.createdAt ?? 0);
    return t >= from && t <= to;
  });
  const samplesInRange = allSamples.filter((s) => {
    const t = new Date(s.receivedAt ?? s.createdAt);
    return t >= from && t <= to;
  });

  const data: Record<string, unknown> = {};

  if (sections.includes("overview")) {
    const kpis = computeOrderKpisFromStatusCounts(
      Object.entries(
        allOrders.reduce<Record<string, number>>((acc, o) => {
          const st = o.status ?? "pending";
          acc[st] = (acc[st] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([status, count]) => ({ status, count }))
    );
    data.overview = {
      total: kpis.total,
      active: kpis.active,
      completed: kpis.completed,
      needsAction: kpis.needsAction,
      periodReceived: ordersInRange.length,
    };
  }

  if (sections.includes("status")) {
    const counts: Record<string, number> = {};
    for (const o of ordersInRange) {
      counts[o.status ?? "pending"] = (counts[o.status ?? "pending"] ?? 0) + 1;
    }
    data.status = Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  if (sections.includes("type")) {
    const counts: Record<string, number> = {};
    for (const o of ordersInRange) {
      const t = o.sampleType ?? "unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    data.type = Object.entries(counts).map(([type, count]) => ({ type, count }));
  }

  if (sections.includes("trend")) {
    const byMonth: Record<string, number> = {};
    for (const o of ordersInRange) {
      const m = new Date(o.createdAt ?? 0).toISOString().slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    data.trend = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }

  if (sections.includes("passfail")) {
    const cats: Record<string, { pass: number; fail: number }> = {};
    for (const s of samplesInRange) {
      const cat = s.sampleType ?? "other";
      if (!cats[cat]) cats[cat] = { pass: 0, fail: 0 };
      if (isInGroup(s.status, SAMPLE_STATUS_GROUPS.completed)) cats[cat].pass++;
      if (isInGroup(s.status, SAMPLE_STATUS_GROUPS.failed)) cats[cat].fail++;
    }
    data.passfail = Object.entries(cats).map(([category, v]) => ({
      category,
      pass: v.pass,
      fail: v.fail,
    }));
  }

  if (sections.includes("readiness")) {
    data.readiness = computeContractReadinessRows(allOrders);
  }
  if (sections.includes("scorecard")) {
    data.scorecard = computeContractorScores(allOrders);
  }

  if (sections.includes("techperf")) {
    const dists = await getAllDistributions();
    const users = await getAllUsers();
    const techs = users.filter((u) => u.role === "technician");
    data.techperf = techs.map((t) => {
      const mine = dists.filter((d) => d.assignedTechnicianId === t.id);
      return {
        name: t.name ?? "—",
        assigned: mine.filter((d) => d.status !== "completed").length,
        completed: mine.filter((d) => d.status === "completed").length,
      };
    });
  }

  if (sections.includes("toptests")) {
    const typeCounts: Record<string, number> = {};
    for (const s of samplesInRange) {
      const key = s.testTypeName ?? s.sampleType;
      typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    }
    data.toptests = Object.entries(typeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }

  return data;
}

function sectionHeading(title: string, accent: string): string {
  return `
    <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid ${accent}">
      ${title}
    </h2>`;
}

function dataTable(
  headers: Array<{ label: string; align?: "left" | "center" | "right" }>,
  rows: string[][],
  emptyMessage: string
): string {
  if (!rows.length) {
    return `<p style="color:#64748b;font-size:12px;font-style:italic;padding:12px 0">${emptyMessage}</p>`;
  }
  const head = headers
    .map(
      (h) =>
        `<th style="padding:10px 12px;text-align:${h.align ?? "left"};font-weight:600">${h.label}</th>`
    )
    .join("");
  const body = rows
    .map(
      (cells, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        ${cells
          .map((cell, ci) => {
            const align = headers[ci]?.align ?? (ci === 0 ? "left" : "center");
            return `<td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:${align}">${cell}</td>`;
          })
          .join("")}
      </tr>`
    )
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0">
      <thead>
        <tr style="background:#1e293b;color:#fff">${head}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function buildHtml(
  data: Record<string, unknown>,
  sections: ReportSection[],
  input: ReportInput
): string {
  const lang: ReportLang = input.lang ?? "both";
  const isAr = lang === "ar";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const textAlign = isAr ? "right" : "left";
  const rangeLabel = formatRangeLabel(input, lang);
  const generatedEn = new Date().toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const generatedAr = new Date().toLocaleString("ar-AE", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const generatedAt = biBlock(generatedAr, generatedEn, lang);

  const t = {
    orgName: biBlock(
      "مختبر الإنشاءات والمواد الهندسية",
      "Construction & Engineering Materials Laboratory",
      lang
    ),
    reportTitle: biBlock("تقرير ذكاء الجودة", "Quality Intelligence Dashboard Report", lang),
    reportingPeriod: bi("فترة التقرير", "Reporting Period", lang),
    generated: bi("تاريخ الإصدار", "Date of Issue", lang),
    confidential: biBlock(
      "سري — للاستخدام الرسمي فقط",
      "Confidential — For Official Use Only",
      lang
    ),
    footer: biBlock(
      "تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المختبر",
      "This report was auto-generated by the Laboratory Management System",
      lang
    ),
    noData: bi(
      "لا توجد بيانات للعرض في هذه الفترة.",
      "No data available for this reporting period.",
      lang
    ),
    overview: biSection("ملخص تنفيذي", "Executive Summary", lang),
    status: biSection("العينات حسب الحالة", "Samples by Status", lang),
    type: biSection("العينات حسب النوع", "Samples by Material Type", lang),
    trend: biSection("الاتجاه الشهري للاستقبال", "Monthly Sample Receipt Trend", lang),
    passfail: biSection("النتائج حسب فئة المادة", "Pass / Fail by Material Category", lang),
    readiness: biSection("جاهزية إغلاق العقود", "Contract Closure Readiness", lang),
    scorecard: biSection("بطاقة جودة المقاولين", "Contractor Quality Scorecard", lang),
    toptests: biSection("أكثر الاختبارات تكراراً", "Most Frequent Tests", lang),
    techperf: biSection("أداء الفنيين", "Technician Performance", lang),
    total: biBlock("إجمالي العينات المسجلة", "Total Registered Samples", lang),
    active: biBlock("عينات نشطة (قيد المعالجة)", "Active Samples (In Pipeline)", lang),
    completed: biBlock("براءات ذمة صادرة", "Clearances Issued", lang),
    needsAction: biBlock("تتطلب إجراء", "Requiring Action", lang),
    periodReceived: biBlock("مستلمة خلال فترة التقرير", "Received in Reporting Period", lang),
    statusCol: bi("الحالة", "Status", lang),
    typeCol: bi("نوع المادة", "Material Type", lang),
    monthCol: bi("الشهر", "Month", lang),
    countCol: bi("العدد", "Count", lang),
    shareCol: bi("النسبة", "Share", lang),
    categoryCol: bi("الفئة", "Category", lang),
    passCol: bi("ناجح", "Passed", lang),
    failCol: bi("راسب", "Failed", lang),
    rateCol: bi("نسبة النجاح", "Pass Rate", lang),
    contractCol: bi("رقم العقد", "Contract No.", lang),
    contractorCol: bi("المقاول", "Contractor", lang),
    readinessCol: bi("نسبة الجاهزية", "Readiness", lang),
    riskCol: bi("مستوى المخاطر", "Risk Level", lang),
    testCol: bi("نوع الاختبار", "Test Type", lang),
    techCol: bi("اسم الفني", "Technician", lang),
    openCol: bi("قيد التنفيذ", "Open Assignments", lang),
    doneCol: bi("مكتملة", "Completed", lang),
  };

  const sectionBlocks: string[] = [];

  if (sections.includes("overview") && data.overview) {
    const o = data.overview as Record<string, number>;
    const kpis = [
      { label: t.total, value: o.total, color: "#1e40af" },
      { label: t.active, value: o.active, color: "#0369a1" },
      { label: t.completed, value: o.completed, color: "#047857" },
      { label: t.needsAction, value: o.needsAction, color: "#b45309" },
      { label: t.periodReceived, value: o.periodReceived, color: "#6d28d9" },
    ];
    const cards = kpis
      .map(
        (k) => `
        <div style="flex:1;min-width:140px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:26px;font-weight:700;color:${k.color};line-height:1.2">${k.value}</div>
          <div style="font-size:10px;color:#64748b;margin-top:6px;line-height:1.4">${k.label}</div>
        </div>`
      )
      .join("");
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.overview, "#1e40af")}
        <div style="display:flex;flex-wrap:wrap;gap:10px">${cards}</div>
      </section>`);
  }

  if (sections.includes("status") && Array.isArray(data.status)) {
    const rows = (data.status as { status: string; count: number }[])
      .slice()
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.status, "#3b82f6")}
        ${dataTable(
          [
            { label: "#", align: "center" },
            { label: t.statusCol },
            { label: t.countCol, align: "center" },
            { label: t.shareCol, align: "center" },
          ],
          rows.map((row, i) => {
            const share = total > 0 ? `${Math.round((row.count / total) * 100)}%` : "—";
            return [
              String(i + 1),
              formatStatusCell(row.status, lang),
              `<span style="font-weight:600">${row.count}</span>`,
              share,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("type") && Array.isArray(data.type)) {
    const rows = (data.type as { type: string; count: number }[])
      .slice()
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.type, "#0d9488")}
        ${dataTable(
          [
            { label: "#", align: "center" },
            { label: t.typeCol },
            { label: t.countCol, align: "center" },
            { label: t.shareCol, align: "center" },
          ],
          rows.map((row, i) => {
            const share = total > 0 ? `${Math.round((row.count / total) * 100)}%` : "—";
            return [
              String(i + 1),
              formatCategoryCell(row.type, lang),
              `<span style="font-weight:600">${row.count}</span>`,
              share,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("trend") && Array.isArray(data.trend)) {
    const rows = data.trend as { month: string; count: number }[];
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.trend, "#7c3aed")}
        ${dataTable(
          [
            { label: t.monthCol },
            { label: t.countCol, align: "center" },
          ],
          rows.map((row) => [
            formatMonth(row.month, lang),
            `<span style="font-weight:600">${row.count}</span>`,
          ]),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("passfail") && Array.isArray(data.passfail)) {
    const rows = (data.passfail as { category: string; pass: number; fail: number }[])
      .slice()
      .sort((a, b) => b.pass + b.fail - (a.pass + a.fail));
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.passfail, "#059669")}
        ${dataTable(
          [
            { label: t.categoryCol },
            { label: t.passCol, align: "center" },
            { label: t.failCol, align: "center" },
            { label: t.rateCol, align: "center" },
          ],
          rows.map((row) => {
            const total = row.pass + row.fail;
            const rate = total > 0 ? Math.round((row.pass / total) * 100) : null;
            const rateColor =
              rate === null ? "#64748b" : rate >= 80 ? "#047857" : rate >= 60 ? "#b45309" : "#b91c1c";
            return [
              formatCategoryCell(row.category, lang),
              `<span style="color:#047857;font-weight:600">${row.pass}</span>`,
              `<span style="color:#b91c1c;font-weight:600">${row.fail}</span>`,
              `<span style="color:${rateColor};font-weight:700">${rate !== null ? `${rate}%` : "—"}</span>`,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("readiness") && Array.isArray(data.readiness)) {
    const rows = data.readiness as { contractNo: string; contractor: string; readiness: number }[];
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.readiness, "#2563eb")}
        ${dataTable(
          [
            { label: t.contractCol },
            { label: t.contractorCol },
            { label: t.readinessCol, align: "center" },
          ],
          rows.map((row) => {
            const color =
              row.readiness >= 80 ? "#047857" : row.readiness >= 50 ? "#b45309" : "#b91c1c";
            return [
              escapeHtml(row.contractNo),
              escapeHtml(row.contractor),
              `<span style="color:${color};font-weight:700">${row.readiness}%</span>`,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("scorecard") && Array.isArray(data.scorecard)) {
    const rows = data.scorecard as { contractor: string; passRate: number; riskLevel: string }[];
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.scorecard, "#dc2626")}
        ${dataTable(
          [
            { label: t.contractorCol },
            { label: t.rateCol, align: "center" },
            { label: t.riskCol, align: "center" },
          ],
          rows.map((row) => {
            const riskKey = row.riskLevel.toLowerCase();
            const riskColor =
              riskKey === "critical" || riskKey === "high"
                ? "#b91c1c"
                : riskKey === "medium"
                  ? "#b45309"
                  : "#047857";
            const passColor =
              row.passRate >= 80 ? "#047857" : row.passRate >= 60 ? "#b45309" : "#b91c1c";
            return [
              escapeHtml(row.contractor),
              `<span style="color:${passColor};font-weight:700">${row.passRate}%</span>`,
              `<span style="color:${riskColor};font-weight:600">${formatRiskCell(row.riskLevel, lang)}</span>`,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("toptests") && Array.isArray(data.toptests)) {
    const rows = data.toptests as { name: string; count: number }[];
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.toptests, "#4f46e5")}
        ${dataTable(
          [
            { label: "#", align: "center" },
            { label: t.testCol },
            { label: t.countCol, align: "center" },
          ],
          rows.map((row, i) => [
            String(i + 1),
            escapeHtml(row.name),
            `<span style="font-weight:600">${row.count}</span>`,
          ]),
          t.noData
        )}
      </section>`);
  }

  if (sections.includes("techperf") && Array.isArray(data.techperf)) {
    const rows = (data.techperf as { name: string; assigned: number; completed: number }[])
      .slice()
      .sort((a, b) => b.completed - a.completed);
    sectionBlocks.push(`
      <section style="margin-bottom:28px">
        ${sectionHeading(t.techperf, "#0891b2")}
        ${dataTable(
          [
            { label: t.techCol },
            { label: t.openCol, align: "center" },
            { label: t.doneCol, align: "center" },
            { label: t.rateCol, align: "center" },
          ],
          rows.map((row) => {
            const total = row.assigned + row.completed;
            const rate = total > 0 ? Math.round((row.completed / total) * 100) : null;
            const rateColor =
              rate === null ? "#64748b" : rate >= 80 ? "#047857" : rate >= 60 ? "#b45309" : "#b91c1c";
            return [
              escapeHtml(row.name),
              `<span style="font-weight:600">${row.assigned}</span>`,
              `<span style="color:#047857;font-weight:600">${row.completed}</span>`,
              `<span style="color:${rateColor};font-weight:700">${rate !== null ? `${rate}%` : "—"}</span>`,
            ];
          }),
          t.noData
        )}
      </section>`);
  }

  const pageTitle =
    lang === "ar"
      ? "تقرير ذكاء الجودة"
      : lang === "en"
        ? "Quality Intelligence Dashboard Report"
        : "Quality Intelligence Dashboard Report | تقرير ذكاء الجودة";
  const bodyFont =
    lang === "ar"
      ? "'IBM Plex Sans Arabic', sans-serif"
      : lang === "en"
        ? "'Inter', sans-serif"
        : "'Inter', 'IBM Plex Sans Arabic', sans-serif";

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang === "ar" ? "ar" : "en"}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(pageTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 12mm; }
    body {
      font-family: ${bodyFont};
      direction: ${dir};
      color: #1e293b;
      background: #fff;
      padding: 28px 32px;
      font-size: 13px;
      line-height: 1.5;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    section { page-break-inside: avoid; }
  </style>
</head>
<body>
  <header style="border-bottom:3px solid #1e293b;padding-bottom:18px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
      <div style="text-align:${textAlign}">
        <div style="margin-bottom:10px;line-height:1.4">${t.orgName}</div>
        <h1 style="font-size:22px;font-weight:700;color:#1e293b;line-height:1.35">
          ${t.reportTitle}
        </h1>
        <p style="font-size:11px;color:#94a3b8;margin-top:8px;font-weight:500">
          ${t.confidential}
        </p>
      </div>
      <div style="text-align:${isAr ? "left" : "right"};min-width:240px">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">
          ${t.reportingPeriod}
        </div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-top:4px;line-height:1.45">
          ${rangeLabel}
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">
          ${t.generated}
        </div>
        <div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.45">${generatedAt}</div>
      </div>
    </div>
  </header>

  <main>${sectionBlocks.join("")}</main>

  <footer style="margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="font-size:10px;color:#94a3b8;line-height:1.6">${t.footer}</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:4px;line-height:1.45">${generatedAt}</p>
  </footer>
</body>
</html>`;
}

function buildCsv(data: Record<string, unknown>, sections: ReportSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`# ${section}`);
    const block = data[section];
    if (!block || !Array.isArray(block)) continue;
    const rows = block as Record<string, unknown>[];
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]);
    lines.push(headers.join(","));
    for (const row of rows) {
      lines.push(headers.map((h) => String(row[h] ?? "")).join(","));
    }
    lines.push("");
  }
  return lines.join("\n");
}

export type DashboardReportResult = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  html?: string;
};

export async function generateDashboardReport(
  input: ReportInput
): Promise<DashboardReportResult> {
  const { from, to } = resolveRange(input);
  const data = await collectSectionData(input.sections, from, to);
  const stamp = Date.now();

  if (input.format === "excel") {
    const csv = buildCsv(data, input.sections);
    const fileName = `dashboard-report-${stamp}.csv`;
    return {
      fileName,
      mimeType: "text/csv",
      dataBase64: Buffer.from(csv, "utf-8").toString("base64"),
    };
  }

  const html = buildHtml(data, input.sections, input);
  const browser = await launchPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    const fileName = `dashboard-report-${stamp}.pdf`;
    return {
      fileName,
      mimeType: "application/pdf",
      dataBase64: Buffer.from(pdfBuffer).toString("base64"),
      html,
    };
  } finally {
    await browser.close();
  }
}
