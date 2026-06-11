/**
 * Boss dashboard report generator — PDF (puppeteer) or Excel (CSV).
 * Returns base64 inline so reports work without external storage credentials.
 */
import puppeteer from "puppeteer";
import {
  computeContractReadinessRows,
  computeContractorScores,
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
};

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
  const allSamples = await getAllSamples();
  const inRange = allSamples.filter((s) => {
    const t = new Date(s.receivedAt ?? s.createdAt);
    return t >= from && t <= to;
  });

  const data: Record<string, unknown> = {};

  if (sections.includes("overview")) {
    const active = allSamples.filter(
      (s) => !["clearance_issued", "rejected", "qc_failed", "deleted"].includes(s.status)
    ).length;
    const completed = allSamples.filter((s) => s.status === "clearance_issued").length;
    const needsAction = allSamples.filter((s) =>
      isInGroup(s.status, SAMPLE_STATUS_GROUPS.needsAction)
    ).length;
    data.overview = {
      total: allSamples.length,
      active,
      completed,
      needsAction,
      periodReceived: inRange.length,
    };
  }

  if (sections.includes("status")) {
    const counts: Record<string, number> = {};
    for (const s of inRange) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    data.status = Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  if (sections.includes("type")) {
    const counts: Record<string, number> = {};
    for (const s of inRange) {
      counts[s.sampleType] = (counts[s.sampleType] ?? 0) + 1;
    }
    data.type = Object.entries(counts).map(([type, count]) => ({ type, count }));
  }

  if (sections.includes("trend")) {
    const byMonth: Record<string, number> = {};
    for (const s of inRange) {
      const m = new Date(s.receivedAt).toISOString().slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    data.trend = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }

  if (sections.includes("passfail")) {
    const cats: Record<string, { pass: number; fail: number }> = {};
    for (const s of inRange) {
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

  const orders = await getAllLabOrders();
  if (sections.includes("readiness")) {
    data.readiness = computeContractReadinessRows(orders);
  }
  if (sections.includes("scorecard")) {
    data.scorecard = computeContractorScores(orders);
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
    for (const s of inRange) {
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

function buildHtml(data: Record<string, unknown>, sections: ReportSection[]): string {
  const parts: string[] = [
    `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}
      h1{font-size:20px;margin-bottom:4px} h2{font-size:14px;margin:24px 0 8px;color:#475569}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
      th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
      th{background:#f8fafc}
      .kpi{display:inline-block;margin:8px 16px 8px 0;padding:12px 20px;background:#f1f5f9;border-radius:8px}
      .kpi b{font-size:22px;display:block}
    </style></head><body>`,
    `<h1>Lab Dashboard Report</h1><p>Generated ${new Date().toLocaleString()}</p>`,
  ];

  if (sections.includes("overview") && data.overview) {
    const o = data.overview as Record<string, number>;
    parts.push(`<h2>Overview KPIs</h2>`);
    for (const [k, v] of Object.entries(o)) {
      parts.push(`<div class="kpi"><b>${v}</b>${k}</div>`);
    }
  }

  if (sections.includes("status") && Array.isArray(data.status)) {
    parts.push(`<h2>Samples by Status</h2><table><tr><th>Status</th><th>Count</th></tr>`);
    for (const row of data.status as { status: string; count: number }[]) {
      parts.push(`<tr><td>${row.status}</td><td>${row.count}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("type") && Array.isArray(data.type)) {
    parts.push(`<h2>Samples by Type</h2><table><tr><th>Type</th><th>Count</th></tr>`);
    for (const row of data.type as { type: string; count: number }[]) {
      parts.push(`<tr><td>${row.type}</td><td>${row.count}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("trend") && Array.isArray(data.trend)) {
    parts.push(`<h2>Monthly Trend</h2><table><tr><th>Month</th><th>Count</th></tr>`);
    for (const row of data.trend as { month: string; count: number }[]) {
      parts.push(`<tr><td>${row.month}</td><td>${row.count}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("passfail") && Array.isArray(data.passfail)) {
    parts.push(`<h2>Pass/Fail by Category</h2><table><tr><th>Category</th><th>Pass</th><th>Fail</th></tr>`);
    for (const row of data.passfail as { category: string; pass: number; fail: number }[]) {
      parts.push(`<tr><td>${row.category}</td><td>${row.pass}</td><td>${row.fail}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("readiness") && Array.isArray(data.readiness)) {
    parts.push(`<h2>Contract Readiness</h2><table><tr><th>Contract</th><th>Contractor</th><th>Readiness %</th></tr>`);
    for (const row of data.readiness as { contractNo: string; contractor: string; readiness: number }[]) {
      parts.push(`<tr><td>${row.contractNo}</td><td>${row.contractor}</td><td>${row.readiness}%</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("scorecard") && Array.isArray(data.scorecard)) {
    parts.push(`<h2>Contractor Scorecard</h2><table><tr><th>Contractor</th><th>Pass %</th><th>Risk</th></tr>`);
    for (const row of data.scorecard as { contractor: string; passRate: number; riskLevel: string }[]) {
      parts.push(`<tr><td>${row.contractor}</td><td>${row.passRate}%</td><td>${row.riskLevel}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("toptests") && Array.isArray(data.toptests)) {
    parts.push(`<h2>Most Frequent Tests</h2><table><tr><th>Test</th><th>Count</th></tr>`);
    for (const row of data.toptests as { name: string; count: number }[]) {
      parts.push(`<tr><td>${row.name}</td><td>${row.count}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  if (sections.includes("techperf") && Array.isArray(data.techperf)) {
    parts.push(`<h2>Technician Performance</h2><table><tr><th>Name</th><th>Open</th><th>Completed</th></tr>`);
    for (const row of data.techperf as { name: string; assigned: number; completed: number }[]) {
      parts.push(`<tr><td>${row.name}</td><td>${row.assigned}</td><td>${row.completed}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  parts.push(`</body></html>`);
  return parts.join("");
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

  const html = buildHtml(data, input.sections);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
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
    };
  } finally {
    await browser.close();
  }
}
