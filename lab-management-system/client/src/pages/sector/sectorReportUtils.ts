/** Shared helpers for sector test-result display and PDF/HTML reports. */

import {
  formatReportSummaryLabel,
  formatReportSummaryValue,
} from "@/lib/reportFormatting";

const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
  blockSpec: { ar: "مواصفات البلوك", en: "Block Specification" },
  blockType: { ar: "نوع البلوك", en: "Block Type" },
  avgStrength: { ar: "متوسط المقاومة", en: "Average strength" },
  required: { ar: "المقاومة المطلوبة", en: "Required strength" },
  count: { ar: "عدد العينات", en: "Sample count" },
  testDate: { ar: "تاريخ الفحص", en: "Test date" },
  overallResult: { ar: "النتيجة", en: "Overall Result" },
  blocks: { ar: "نتائج البلوكات", en: "Block Results" },
  cubes: { ar: "نتائج المكعبات", en: "Cube Results" },
  specimens: { ar: "العينات", en: "Specimens" },
  strengthMpa: { ar: "المقاومة", en: "Strength (N/mm²)" },
  widthMm: { ar: "العرض", en: "Width (mm)" },
  lengthMm: { ar: "الطول", en: "Length (mm)" },
  heightMm: { ar: "الارتفاع", en: "Height (mm)" },
  grossAreaMm2: { ar: "المساحة", en: "Area (mm²)" },
  result: { ar: "النتيجة", en: "Result" },
  id: { ar: "#", en: "#" },
  code: { ar: "الرمز", en: "Code" },
  size: { ar: "الحجم", en: "Size" },
  standard: { ar: "المعيار", en: "Standard" },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportFontLinks(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;
}

function labelFor(key: string, lang: string, formTemplate = "default"): string {
  const tableColumnKeys = new Set([
    "strengthMpa", "widthMm", "lengthMm", "heightMm", "grossAreaMm2",
    "blocks", "cubes", "specimens", "blockSpec", "result", "id", "code", "size",
  ]);
  const mapped = FIELD_LABELS[key];
  if (mapped && tableColumnKeys.has(key)) {
    return lang === "ar" ? mapped.ar : mapped.en;
  }
  return formatReportSummaryLabel(key, formTemplate, lang === "ar");
}

function formatScalar(value: unknown, lang: string, key?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No";
  let display: string;
  if (typeof value === "number") {
    display = Number.isInteger(value) ? String(value) : value.toFixed(2);
  } else if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        return new Date(value).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB");
      } catch {
        return value;
      }
    }
    if (value === "pass") return lang === "ar" ? "ناجح" : "Pass";
    if (value === "fail") return lang === "ar" ? "راسب" : "Fail";
    if (value === "pending") return lang === "ar" ? "قيد المراجعة" : "Pending";
    display = value;
  } else {
    display = String(value);
  }
  const cellUnits: Record<string, string> = {
    strengthMpa: "N/mm²",
    widthMm: "mm",
    lengthMm: "mm",
    heightMm: "mm",
    grossAreaMm2: "mm²",
  };
  if (key && cellUnits[key]) {
    return display.includes(cellUnits[key]) ? display : `${display} ${cellUnits[key]}`;
  }
  return display;
}

function formatObjectSummary(obj: Record<string, unknown>, lang: string): string {
  if ("nameAr" in obj || "nameEn" in obj) {
    return lang === "ar" ? String(obj.nameAr ?? obj.nameEn ?? "") : String(obj.nameEn ?? obj.nameAr ?? "");
  }
  if ("code" in obj && "size" in obj) return `${obj.code} — ${obj.size}`;
  if ("label" in obj) return String(obj.label);
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${labelFor(k, lang)}: ${formatScalar(v, lang)}`);
  return parts.join(" · ") || "—";
}

function isRecordArray(arr: unknown[]): arr is Record<string, unknown>[] {
  return arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null && !Array.isArray(arr[0]);
}

function buildArrayTable(rows: Record<string, unknown>[], lang: string, formTemplate = "default"): string {
  const cols = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("_"))))
  ).filter((k) => !["blockSpec"].includes(k));

  const preferred = ["id", "lengthMm", "widthMm", "heightMm", "grossAreaMm2", "strengthMpa", "result"];
  const ordered = [
    ...preferred.filter((c) => cols.includes(c)),
    ...cols.filter((c) => !preferred.includes(c)),
  ].slice(0, 8);

  if (ordered.length === 0) return "";

  const thead = ordered.map((c) => `<th>${labelFor(c, lang, formTemplate)}</th>`).join("");
  const tbody = rows
    .map((row) => `<tr>${ordered.map((c) => `<td>${formatScalar(row[c], lang, c)}</td>`).join("")}</tr>`)
    .join("");

  return `<table class="data-table" style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px"><thead><tr>${ordered.map((c) => `<th style="background:#1e40af;color:#fff;padding:6px 8px;text-align:${lang === "ar" ? "right" : "left"}">${labelFor(c, lang, formTemplate)}</th>`).join("")}</tr></thead><tbody>${tbody}</tbody></table>`;
}

const SKIP_SUMMARY_KEYS = new Set([
  "rows",
  "gradingReport",
  "elongationInputs",
  "flakinessInputs",
  "sieveRows",
  "blocks",
  "cubes",
  "specimens",
  "fractions",
  "readings",
  "blockSpec",
]);

/** Scalar summary fields only — for the compact result preview (no tables). */
export function pickMainSummaryEntries(
  summary: Record<string, unknown> | null | undefined,
  lang: string,
  max = 6,
  formTemplate = "default",
) {
  return formatSummaryEntries(summary, lang, formTemplate)
    .filter((e) => !e.isTable && !SKIP_SUMMARY_KEYS.has(e.key))
    .slice(0, max);
}

export function formatSummaryEntries(
  summary: Record<string, unknown> | null | undefined,
  lang: string,
  formTemplate = "default",
) {
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      key: k,
      label: labelFor(k, lang, formTemplate),
      value: typeof v === "object" && v !== null && !Array.isArray(v)
        ? formatObjectSummary(v as Record<string, unknown>, lang)
        : formatReportSummaryValue(k, v, formTemplate, lang === "ar"),
      isTable: Array.isArray(v) && isRecordArray(v as unknown[]),
      tableHtml: Array.isArray(v) && isRecordArray(v as unknown[])
        ? buildArrayTable(v as Record<string, unknown>[], lang, formTemplate)
        : undefined,
    }));
}

const SKIP_FORM_KEYS = new Set(["blocks", "cubes", "specimens", "rows", "fractions", "readings"]);

export function formatFormSections(
  formData: Record<string, unknown> | null | undefined,
  lang: string,
  formTemplate = "default",
) {
  if (!formData) return { fields: [] as { label: string; value: string }[], tables: [] as { title: string; html: string }[] };

  const fields: { label: string; value: string }[] = [];
  const tables: { title: string; html: string }[] = [];

  for (const [key, value] of Object.entries(formData)) {
    if (value === null || value === undefined || value === "") continue;

    if (Array.isArray(value) && isRecordArray(value)) {
      tables.push({ title: labelFor(key, lang, formTemplate), html: buildArrayTable(value, lang, formTemplate) });
      continue;
    }

    if (SKIP_FORM_KEYS.has(key)) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      fields.push({ label: labelFor(key, lang, formTemplate), value: formatObjectSummary(value as Record<string, unknown>, lang) });
      continue;
    }

    fields.push({ label: labelFor(key, lang, formTemplate), value: formatScalar(value, lang) });
  }

  return { fields, tables };
}

export function buildSectorResultReportHtml(
  detail: { result: any; sample: any },
  lang: string,
  labName: string,
  labels: Record<string, string>
): string {
  const r = detail.result;
  const s = detail.sample;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const font = lang === "ar" ? "'Tajawal', 'Noto Sans Arabic', Arial, sans-serif" : "'Inter', Arial, sans-serif";
  const align = lang === "ar" ? "right" : "left";

  const formTemplate = String(r.formTemplate ?? "default");
  const summary = formatSummaryEntries(r.summaryValues as Record<string, unknown>, lang, formTemplate);
  const form = formatFormSections(r.formData as Record<string, unknown>, lang, formTemplate);

  const summaryRows = summary
    .filter((e) => !e.isTable)
    .map((e) => `<tr><td>${e.label}</td><td><strong>${e.value}</strong></td></tr>`)
    .join("");

  const summaryTables = summary
    .filter((e) => e.isTable && e.tableHtml)
    .map((e) => `<div class="section"><div class="section-title">${e.label}</div>${e.tableHtml}</div>`)
    .join("");

  const formFieldRows = form.fields
    .map((f) => `<tr><td>${f.label}</td><td>${f.value}</td></tr>`)
    .join("");

  const formTables = form.tables
    .map((t) => `<div class="section"><div class="section-title">${t.title}</div>${t.html}</div>`)
    .join("");

  const pass = r.overallResult === "pass";
  const resultLabel = pass ? (lang === "ar" ? "ناجح ✓" : "PASSED ✓") : lang === "ar" ? "راسب ✗" : "FAILED ✗";

  return `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="UTF-8">
${reportFontLinks()}
<style>
  * { box-sizing: border-box; }
  body { font-family: ${font}; direction: ${dir}; margin: 0; padding: 20px; color: #0f172a; font-size: 12px; line-height: 1.5; }
  .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
  .lab-name { font-size: 20px; font-weight: 700; color: #1e40af; }
  .report-title { font-size: 14px; color: #000; margin-top: 4px; }
  .report-id { font-size: 11px; color: #000; margin-top: 4px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.04em; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .field-label { font-size: 11px; font-weight: 700; color: #000; margin-bottom: 3px; }
  .field-value { font-size: 13px; font-weight: 600; color: #000; }
  .result-badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; }
  .pass { background: #dcfce7; color: #166534; }
  .fail { background: #fee2e2; color: #991b1b; }
  table.data-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
  table.data-table th { background: #1e40af; color: #fff; padding: 6px 8px; text-align: ${align}; }
  table.data-table td { padding: 5px 8px; border: 1px solid #e2e8f0; }
  table.data-table tr:nth-child(even) td { background: #f8fafc; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.kv td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  table.kv td:first-child { width: 38%; color: #000; background: #f8fafc; font-weight: 700; font-size: 11px; }
  table.kv td { color: #000; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
  .sig { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
  .sig-title { font-size: 10px; color: #000; margin-bottom: 6px; }
  .sig-name { font-size: 12px; font-weight: 600; color: #1e40af; }
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="header">
  <div class="lab-name">${labName}</div>
  <div class="report-title">${lang === "ar" ? "تقرير نتيجة الاختبار" : "Test Result Report"}</div>
  <div class="report-id">${labels.sampleCode}: ${s?.sampleCode ?? "—"}</div>
</div>

<div class="section">
  <div class="section-title">${lang === "ar" ? "معلومات العينة" : "Sample Information"}</div>
  <div class="grid">
    <div class="field"><div class="field-label">${labels.sampleCode}</div><div class="field-value">${s?.sampleCode ?? "—"}</div></div>
    <div class="field"><div class="field-label">${labels.inspectionReferenceNo ?? (lang === "ar" ? "رقم مرجع التفتيش" : "Inspection Reference No.")}</div><div class="field-value">${s?.referenceNo?.trim() || "—"}</div></div>
    <div class="field"><div class="field-label">${labels.contractNumber}</div><div class="field-value">${s?.contractNumber ?? "—"}</div></div>
    <div class="field"><div class="field-label">${labels.projectName}</div><div class="field-value">${r.projectName ?? s?.contractName ?? "—"}</div></div>
    <div class="field"><div class="field-label">${labels.contractorName}</div><div class="field-value">${r.contractorName ?? s?.contractorName ?? "—"}</div></div>
    <div class="field"><div class="field-label">${labels.testType}</div><div class="field-value">${lang === "ar" ? (r.testTypeNameAr ?? r.testTypeName ?? r.testTypeCode) : (r.testTypeNameEn ?? r.testTypeCode ?? "—")}</div></div>
    <div class="field"><div class="field-label">${labels.testDate}</div><div class="field-value">${r.testDate ? new Date(r.testDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : "—"}</div></div>
    <div class="field"><div class="field-label">${labels.testedBy}</div><div class="field-value">${r.testedBy ?? "—"}</div></div>
    <div class="field"><div class="field-label">${labels.overallResult}</div><div class="field-value"><span class="result-badge ${pass ? "pass" : "fail"}">${resultLabel}</span></div></div>
  </div>
</div>

${summaryRows ? `<div class="section"><div class="section-title">${labels.summaryValues}</div><table class="kv"><tbody>${summaryRows}</tbody></table></div>` : ""}
${summaryTables}
${formFieldRows ? `<div class="section"><div class="section-title">${labels.formData}</div><table class="kv"><tbody>${formFieldRows}</tbody></table></div>` : ""}
${formTables}

${r.notes ? `<div class="section"><div class="section-title">${labels.notes}</div><div class="field">${r.notes}</div></div>` : ""}

<div class="signatures">
  <div class="sig">
    <div class="sig-title">${labels.managerReview}</div>
    ${r.managerReviewedByName ? `<div class="sig-name">${escapeHtml(r.managerReviewedByName)}</div><div style="font-size:10px;color:#64748b;margin-top:4px">${r.managerReviewedAt ? new Date(r.managerReviewedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : ""}</div>` : `<div style="height:24px"></div>`}
    ${r.managerNotes ? `<div style="font-size:9px;color:#475569;margin-top:6px;font-style:italic;white-space:pre-wrap">${escapeHtml(String(r.managerNotes))}</div>` : ""}
  </div>
  <div class="sig">
    <div class="sig-title">${labels.qcReview}</div>
    ${r.qcReviewedByName ? `<div class="sig-name">${escapeHtml(r.qcReviewedByName)}</div><div style="font-size:10px;color:#64748b;margin-top:4px">${r.qcReviewedAt ? new Date(r.qcReviewedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB") : ""}</div>` : `<div style="height:24px"></div>`}
    ${r.qcNotes ? `<div style="font-size:9px;color:#475569;margin-top:6px;font-style:italic;white-space:pre-wrap">${escapeHtml(String(r.qcNotes))}</div>` : ""}
  </div>
</div>

<div class="footer">${labName} — ${new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</div>
</body></html>`;
}
