import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X, Download, Loader2 } from "lucide-react";
import { generatePdfFromElement } from "@/lib/pdf";
import { useLanguage } from "@/contexts/LanguageContext";
import { FlexibleResultsTable, type Column } from "@/components/reports/FlexibleResultsTable";

// --- Lab print branding (override via Vite env for deployment-specific details) ---
const LAB_PRINT_BRANDING = {
  nameEn:
    (import.meta.env.VITE_LAB_NAME as string | undefined)?.trim() ||
    "Construction Materials & Engineering Laboratory",
  nameAr: (import.meta.env.VITE_LAB_NAME_AR as string | undefined)?.trim() || "",
  address: (import.meta.env.VITE_LAB_ADDRESS as string | undefined)?.trim() || "",
  phone: (import.meta.env.VITE_LAB_PHONE as string | undefined)?.trim() || "",
  email: (import.meta.env.VITE_LAB_EMAIL as string | undefined)?.trim() || "",
  accreditation: (import.meta.env.VITE_LAB_ACCREDITATION as string | undefined)?.trim() || "",
  logoUrl: (import.meta.env.VITE_LAB_LOGO_URL as string | undefined)?.trim() || "/logo.png",
};

/** Same marker as ConcreteTest — hidden JSON suffix must never appear on printed reports. */
const AGE_META_MARKER = "\n__AGE_META__:";
function stripAgeMetaFromComments(comments: string): string {
  const i = comments.indexOf(AGE_META_MARKER);
  if (i === -1) return comments;
  return comments.slice(0, i).trimEnd();
}

/**
 * User-entered remarks from the concrete test form only (group.comments).
 * Strips persisted age metadata; hides accidental raw JSON blobs.
 */
function getUserRemarksForReport(raw: string | null | undefined): string {
  let s = stripAgeMetaFromComments(String(raw ?? "")).trim();
  if (!s) return "";
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const parts: string[] = [];
        for (const k of ["remarks", "notes", "comments", "text"]) {
          const v = o[k];
          if (typeof v === "string" && v.trim()) parts.push(v.trim());
        }
        s = parts.join("\n").trim();
      }
    } catch {
      return "";
    }
  }
  return s.trim();
}

// --- Helpers ---
function fmt(val: string | null | undefined, decimals = 2): string {
  if (!val) return "";
  const n = parseFloat(val);
  return isNaN(n) ? "" : n.toFixed(decimals);
}
// Round to nearest 0.5 N/mm² (BS 1881 Part 116)
function fmtStrength(val: string | null | undefined): string {
  if (!val) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return (Math.round(n * 2) / 2).toFixed(1);
}
// Round to nearest 10 kg/m³ (BS 1881 Part 114)
function fmtDensity(val: string | null | undefined): string {
  if (!val) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return (Math.round(n / 10) * 10).toString();
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function fmtDateTime(d: Date | string | null | undefined, lang: "en" | "ar"): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString(lang === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Concrete compliance helpers (age-based) ────────────────────────────────────────────
// Concrete strength percentage guidelines (approximate):
// 1d=16%, 3d=40%, 7d=65%, 14d=90%, 28d=99%, 56d+=105%
function getRequiredStrengthReport(targetMpa: number, actualAge: number): number {
  if (actualAge <= 1)  return targetMpa * 0.16;
  if (actualAge <= 3)  return targetMpa * 0.40;
  if (actualAge <= 7)  return targetMpa * 0.65;
  if (actualAge <= 14) return targetMpa * 0.90;
  if (actualAge <= 28) return targetMpa * 0.99;
  return targetMpa * 1.05; // 56+ days
}

function getEffectiveAgeReport(actualAge: number, groupAge: number): number {
  if (actualAge <= groupAge) return groupAge;
  const milestones = [1, 3, 7, 14, 28, 56];
  for (const m of milestones) { if (actualAge <= m) return m; }
  return actualAge;
}

function calcCubeAgeReport(castingDateStr: string | null | undefined, testDateStr: string | null | undefined): number | null {
  if (!castingDateStr || !testDateStr) return null;
  const casting = new Date(castingDateStr);
  const tested = new Date(testDateStr);
  if (isNaN(casting.getTime()) || isNaN(tested.getTime())) return null;
  const diffMs = tested.getTime() - casting.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getAgePctReport(age: number): number {
  if (age <= 1)  return 16;
  if (age <= 3)  return 40;
  if (age <= 7)  return 65;
  if (age <= 14) return 90;
  if (age <= 28) return 99;
  return 105;
}
// Extract target strength from classOfConcrete string e.g. "C40/20 35%OPC" → 40
function extractTargetFromClass(classStr: string | null | undefined): number | null {
  if (!classStr) return null;
  const m = classStr.match(/C(\d+)/i);
  return m ? parseFloat(m[1]) : null;
}

function LabReportHeader({ lang }: { lang: "en" | "ar" }) {
  const ar = lang === "ar";
  const displayName =
    ar && LAB_PRINT_BRANDING.nameAr ? LAB_PRINT_BRANDING.nameAr : LAB_PRINT_BRANDING.nameEn;
  const [logoOk, setLogoOk] = useState(!!LAB_PRINT_BRANDING.logoUrl);

  return (
    <header className="mb-4 pb-3 border-b-2 border-slate-800 print:mb-3">
      <div className="flex items-start gap-3 justify-between">
        <div className="flex gap-3 items-start min-w-0 flex-1">
          {LAB_PRINT_BRANDING.logoUrl && logoOk ? (
            <img
              src={LAB_PRINT_BRANDING.logoUrl}
              alt=""
              className="h-12 w-auto max-w-[100px] object-contain shrink-0"
              onError={() => setLogoOk(false)}
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[13px] font-bold text-slate-900 leading-snug">{displayName}</h1>
            <div className="mt-1 text-[10px] text-slate-700 space-y-0.5 leading-snug">
              {LAB_PRINT_BRANDING.address ? <p>{LAB_PRINT_BRANDING.address}</p> : null}
              {(LAB_PRINT_BRANDING.phone || LAB_PRINT_BRANDING.email) && (
                <p>
                  {LAB_PRINT_BRANDING.phone ? (
                    <span>
                      {ar ? "هاتف: " : "Tel: "}
                      {LAB_PRINT_BRANDING.phone}
                    </span>
                  ) : null}
                  {LAB_PRINT_BRANDING.phone && LAB_PRINT_BRANDING.email ? " · " : null}
                  {LAB_PRINT_BRANDING.email ? (
                    <span>
                      {ar ? "البريد: " : "Email: "}
                      {LAB_PRINT_BRANDING.email}
                    </span>
                  ) : null}
                </p>
              )}
              {LAB_PRINT_BRANDING.accreditation ? (
                <p className="font-medium text-slate-800">
                  {ar ? "اعتماد: " : "Accreditation: "}
                  {LAB_PRINT_BRANDING.accreditation}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Single Report Page (one age group = one page) ────────────────────────────
function ReportPage({
  group,
  refNo,
  castingDate: distCastingDate,
  testedByName,
  managerReviewedByName,
  qcReviewedByName,
  lang,
  pageIndex,
  totalPages,
  testedSignedAt,
  managerSignedAt,
  qcSignedAt,
}: {
  group: any;
  refNo: string;
  castingDate?: Date | string | null;
  testedByName?: string | null;
  managerReviewedByName?: string | null;
  qcReviewedByName?: string | null;
  lang: "en" | "ar";
  pageIndex: number;
  totalPages: number;
  testedSignedAt?: Date | string | null;
  managerSignedAt?: Date | string | null;
  qcSignedAt?: Date | string | null;
}) {
  const ar = lang === "ar";
  const userRemarks = getUserRemarksForReport(group.comments);
  const remarksDisplay = userRemarks || (ar ? "لا توجد ملاحظات إضافية" : "No additional remarks");
  const sig = ar
    ? {
        tested: "أعدّ التقرير / الفحص",
        reviewed: "راجع",
        approved: "اعتمد",
        roleT: "فني مختبر",
        roleM: "مدير المختبر",
        roleQ: "مسؤول الجودة",
        dig: "تم التوقيع إلكترونياً في",
        ref: "المرجع",
        dateLbl: "التاريخ",
        labTitle: "تقرير اختبار مختبري",
      }
    : {
        tested: "Prepared / Tested By",
        reviewed: "Reviewed By",
        approved: "Approved By",
        roleT: "Laboratory Technician",
        roleM: "Laboratory Manager",
        roleQ: "Quality Officer",
        dig: "Digitally signed on",
        ref: "Reference",
        dateLbl: "Date",
        labTitle: "LABORATORY TEST REPORT",
      };
  const cubes: any[] = group.cubes ?? [];
  const avg = group.avgCompressiveStrength ? parseFloat(group.avgCompressiveStrength) : null;
  // Use minAcceptable from DB; fallback to extracting from classOfConcrete
  const targetMpa = group.minAcceptable
    ? parseFloat(group.minAcceptable)
    : extractTargetFromClass(group.classOfConcrete);
  const testAge = group.testAge ?? 28;
  // Casting date: prefer distribution-level castingDate (from sample), fallback to group batchDateTime
  const castingDate = distCastingDate
    ? (distCastingDate instanceof Date ? distCastingDate.toISOString() : String(distCastingDate))
    : (group.batchDateTime ? group.batchDateTime.split(' ')[0] : null);
  // Group-level:28d+ uses f_ck on average; earlier ages use % of f_ck
  const requiredMpa =
    targetMpa != null && testAge >= 28 ? targetMpa : targetMpa != null ? getRequiredStrengthReport(targetMpa, testAge) : null;
  const agePct = getAgePctReport(testAge);
  // Per-cube compliance
  const cubesWithAge = cubes.map(c => {
    const actualAge = calcCubeAgeReport(castingDate, c.dateTested);
    const effectiveAge = actualAge !== null ? getEffectiveAgeReport(actualAge, testAge) : testAge;
    const cubeRequiredEarly = targetMpa && testAge < 28 ? getRequiredStrengthReport(targetMpa, effectiveAge) : null;
    const s = parseFloat(c.compressiveStrengthMpa ?? "0");
    let autoFail = false;
    if (s > 0 && c.withinSpec !== true) {
      if (testAge >= 28 && targetMpa != null) autoFail = s < targetMpa - 4;
      else if (cubeRequiredEarly != null) autoFail = s < cubeRequiredEarly;
    }
    const isFail = c.withinSpec === true ? false : autoFail;
    const isPass = c.withinSpec === true
      ? true
      : s > 0 && (
          (testAge >= 28 && targetMpa != null && s >= targetMpa - 4)
          || (testAge < 28 && cubeRequiredEarly != null && s >= cubeRequiredEarly)
        );
    return { ...c, actualAge, effectiveAge, cubeRequired: cubeRequiredEarly, isFail, isPass };
  });

  const withinSpec = cubesWithAge.filter(c => c.isPass && parseFloat(c.compressiveStrengthMpa ?? "0") > 0);
  const outsideSpec = cubesWithAge.filter(c => c.isFail && parseFloat(c.compressiveStrengthMpa ?? "0") > 0);
  const strengthsForAvg = cubes.map(c => parseFloat(c.compressiveStrengthMpa ?? "0")).filter(v => v > 0);
  const minCubeStr = strengthsForAvg.length ? Math.min(...strengthsForAvg) : null;
  const avgPass =
    avg !== null && targetMpa != null && testAge >= 28
      ? avg >= targetMpa && (minCubeStr == null || minCubeStr >= targetMpa - 4)
      : avg !== null && requiredMpa !== null
        ? avg >= requiredMpa
        : null;

  const padCount = Math.max(0, 3 - cubes.length);
  const concreteResultRows: Record<string, unknown>[] = [
    ...cubesWithAge.map((cube, idx) => ({
      ...cube,
      testAgeFallback: testAge,
      densityDisplay: fmtDensity(cube.densityKgM3),
      avgStrengthCell:
        idx === cubesWithAge.length - 1 && avg !== null ? (Math.round(avg * 2) / 2).toFixed(1) : "",
    })),
    ...Array.from({ length: padCount }, (_, i) => ({
      _padded: true,
      markNo: cubes.length + i + 1,
      cubeId: "",
      dateTested: "",
      actualAge: null,
      effectiveAge: null,
      length: "",
      width: "",
      height: "",
      massKg: "",
      densityDisplay: "",
      maxLoadKN: "",
      compressiveStrengthMpa: "",
      avgStrengthCell: "",
      fractureType: "",
      isFail: false,
      isPass: false,
      testAgeFallback: testAge,
    })),
  ];

  const concreteCubeColumns: Column[] = [
    { header: "Mark No.", field: "markNo", align: "center" },
    { header: "Cube ID", field: "cubeId", align: "center", render: (v, row) => (row._padded ? "" : String(v ?? "")) },
    {
      header: "Date Tested",
      field: "dateTested",
      align: "center",
      render: (v, row) => (row._padded ? "" : fmtDate(v as string)),
    },
    {
      header: "Test Age, Days",
      field: "actualAge",
      align: "center",
      render: (_, row) => {
        if (row._padded) return "";
        const actualAge = row.actualAge as number | null;
        const effectiveAge = row.effectiveAge as number;
        const tf = row.testAgeFallback as number;
        if (actualAge !== null && actualAge !== undefined) {
          return (
            <span
              title={effectiveAge !== actualAge ? `Evaluated as ${effectiveAge}-day band` : undefined}
              style={effectiveAge !== actualAge ? { color: "#c2410c" } : {}}
            >
              {actualAge}
              {effectiveAge !== actualAge ? `→${effectiveAge}` : ""}
            </span>
          );
        }
        return String(tf);
      },
    },
    { header: "Length (mm)", field: "length", type: "number", decimals: 0, align: "right" },
    { header: "Width (mm)", field: "width", type: "number", decimals: 0, align: "right" },
    { header: "Height (mm)", field: "height", type: "number", decimals: 0, align: "right" },
    { header: "Mass (kg) sat.", field: "massKg", type: "number", decimals: 3, align: "right" },
    { header: "Density (kg/m³) sat.", field: "densityDisplay", align: "right", render: (v, row) => (row._padded ? "" : String(v ?? "")) },
    {
      header: "Max. Load (kN)",
      field: "maxLoadKN",
      align: "right",
      render: (v, row) => (row._padded ? "" : <span className="font-semibold">{fmt(v as string, 1)}</span>),
    },
    {
      header: "Compressive Strength (N/mm²)",
      field: "compressiveStrengthMpa",
      align: "center",
      render: (_, row) => {
        if (row._padded) return "";
        const strength = fmtStrength(row.compressiveStrengthMpa as string);
        const isFail = row.isFail as boolean;
        const isPass = row.isPass as boolean;
        const s = parseFloat(String(row.compressiveStrengthMpa ?? "0"));
        const cls = isFail && s > 0 ? "text-red-700" : isPass && s > 0 ? "text-green-700" : "";
        return <span className={`font-bold ${cls}`}>{strength}</span>;
      },
    },
    {
      header: "Avg. Strength (N/mm²)",
      field: "avgStrengthCell",
      align: "center",
      render: (v, row) => (row._padded ? "" : <span className="font-bold">{String(v ?? "")}</span>),
    },
    { header: "Fracture", field: "fractureType", align: "center", render: (v, row) => (row._padded ? "" : String(v ?? "")) },
  ];

  const reportDateStr = new Date().toLocaleDateString(ar ? "ar-AE" : "en-GB");
  const footer = ar
    ? {
        repro: "لا يجوز إعادة إنتاج هذا التقرير إلا كاملاً دون أي حذف أو تعديل.",
        cert: "أجريت الاختبارات وفق إجراءات المختبر الموثقة والمعايير والطرق المعتمدة.",
        page: "صفحة",
        of: "من",
        remarksTitle: "ملاحظات / تعليقات",
        fractureNote: "نوع الكسر: SF — مقبول، USF — غير مقبول",
        curingNote: "* أجريت المعالجة قبل تسليم العينات للمختبر خارج نطاق سيطرة المختبر.",
      }
    : {
        repro: "This report may not be reproduced except in full without prior written approval from the laboratory.",
        cert: "Testing was performed in accordance with the laboratory's documented procedures and applicable recognised methods and standards.",
        page: "Page",
        of: "of",
        remarksTitle: "Comments / Remarks",
        fractureNote: "Type of fracture: SF — Satisfactory, USF — Unsatisfactory",
        curingNote: "* Curing before delivery to the laboratory was performed outside the control of the laboratory.",
      };

  const testedDisplay = (testedByName ?? group.testedBy ?? "").trim() || "—";
  const managerDisplay = (managerReviewedByName ?? "").trim() || "—";
  const qcDisplay = (qcReviewedByName ?? "").trim() || "—";

  return (
    <div
      className="report-page bg-white p-8 print:p-6 flex flex-col"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', Arial, Helvetica, sans-serif",
        fontSize: "11px",
        minHeight: "297mm",
        width: "210mm",
      }}
    >
      <LabReportHeader lang={lang} />

      {/* Top Reference Box */}
      <div className="flex justify-end mb-3">
        <table
          className="report-ref-table border-collapse border border-black text-center"
          style={{ minWidth: "160px" }}
        >
          <tbody>
            <tr>
              <td className="border border-black px-3 py-1 font-bold text-xs">{sig.ref}</td>
            </tr>
            <tr>
              <td className="border border-black px-3 py-2 font-bold text-sm">{refNo}</td>
            </tr>
            <tr>
              <td className="border border-black px-3 py-1 font-bold text-xs">{sig.dateLbl}</td>
            </tr>
            <tr>
              <td className="border border-black px-3 py-1 text-xs">{reportDateStr}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Title */}
      <div className="text-center font-bold text-base border-2 border-slate-900 py-2.5 mb-2 bg-slate-100">
        {sig.labTitle}
      </div>

      {/* Subtitle — same band style as main title for print/screen parity */}
      <div className="text-center font-bold text-[11px] border border-slate-900 py-1.5 mb-4 bg-slate-100">
        COMPRESSIVE STRENGTH OF CONCRETE CUBES TO BS 1881; PART 114 &amp; 116: 1983
      </div>

      {/* Project Info Grid */}
      <table className="metadata-table w-full border-collapse border border-black mb-2 text-xs">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 w-1/4">CONTRACT NO:</td>
            <td className="border border-black px-2 py-1 w-1/4 font-semibold">{group.contractNo ?? ""}</td>
            <td className="border border-black px-2 py-1 w-1/4">REGION :</td>
            <td className="border border-black px-2 py-1 w-1/4 font-semibold">{group.region ?? ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">PROJECT:</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.projectName ?? ""}</td>
            <td className="border border-black px-2 py-1">CONSULTANT:</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.consultant ?? ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">CONTRACTOR:</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.contractorName ?? ""}</td>
            <td className="border border-black px-2 py-1">CSC REF.</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.cscRef ?? ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">LOCATION:</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.location ?? ""}</td>
            <td className="border border-black px-2 py-1">Place of Sampling</td>
            <td className="border border-black px-2 py-1 font-semibold">{group.placeOfSampling ?? ""}</td>
          </tr>
        </tbody>
      </table>

      {/* Source/Batch/Slump row */}
      <table className="metadata-table w-full border-collapse border border-black mb-2 text-xs">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 w-1/4">SOURCE/SUPPLIER :</td>
            <td className="border border-black px-2 py-1 w-1/4 font-semibold">{group.sourceSupplier ?? ""}</td>
            <td className="border border-black px-2 py-1 w-1/4 text-center">Date of Casting</td>
            <td className="border border-black px-2 py-1 w-1/4 font-semibold">{fmtDate(distCastingDate ?? group.batchDateTime)}</td>
          </tr>
        </tbody>
      </table>

      {/* Class / Slump row */}
      <table className="metadata-table w-full border-collapse border border-black mb-3 text-xs">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 w-2/3">
              Class of Concrete: <strong>{group.classOfConcrete ?? ""}</strong>
            </td>
            <td className="border border-black px-2 py-1 w-1/3">
              Max Agg. Size Site <strong>{group.maxAggSize ?? ""}</strong>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">
              Nominal Size of Cube: <strong>{group.nominalCubeSize ?? "150mm"}</strong>
            </td>
            <td className="border border-black px-2 py-1">
              Method of compaction: <strong>{group.methodOfCompaction ?? "Using Compacting Bar"}</strong>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">
              Appearance of sample when received: <strong>{group.appearance ?? "Normal"}</strong>
            </td>
            <td className="border border-black px-2 py-1">
              Date of Casting: <strong>{fmtDate(distCastingDate ?? group.dateSampled ?? group.batchDateTime)}</strong>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">
              Moisture condition at testing: <strong>{group.moistureCondition ?? "Saturated"}</strong>
            </td>
            <td className="border border-black px-2 py-1">
              Sampled By: <strong>{group.sampledBy ?? "Contractor"}</strong>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">
              Removal of Fins (if present): <strong>{group.removalOfFins ?? "Using Steel File"}</strong>
            </td>
            <td className="border border-black px-2 py-1">
              Curing Method*: <strong>{group.curingMethod ?? "BS 1881 Part 111: 1983"}</strong>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">
              Volume Determination: <strong>{group.volumeDetermination ?? "By Calculation"}</strong>
            </td>
            <td className="border border-black px-2 py-1">
              Tested by: <strong>{group.testedBy ?? ""}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Results */}
      <div className="mb-3">
        <FlexibleResultsTable
          columns={concreteCubeColumns}
          rows={concreteResultRows}
          rowClassName={(row) => {
            if (row._padded) return "";
            const s = parseFloat(String(row.compressiveStrengthMpa ?? "0"));
            if (row.isFail && s > 0) return "bg-red-50";
            if (row.isPass && s > 0) return "bg-green-50";
            return "";
          }}
        />
      </div>

      {/* Comments — user notes from test form only (no hidden metadata / auto system notes) */}
      <div className="border border-slate-400 rounded-sm p-3 mb-3 min-h-[4.5rem] bg-slate-50/90">
        <div className="font-bold text-slate-900 text-xs mb-1.5">{footer.remarksTitle}</div>
        <p
          className={`text-xs leading-relaxed whitespace-pre-wrap ${
            userRemarks ? "text-slate-900" : "text-slate-500 italic"
          }`}
        >
          {remarksDisplay}
        </p>
      </div>

      <div className="text-[10px] text-slate-500 border border-slate-200 rounded-sm px-2 py-1.5 mb-3 bg-slate-50/60 italic">
        <p>{footer.fractureNote}</p>
        <p className="mt-0.5">{footer.curingNote}</p>
      </div>

      {/* Signatures */}
      <table className="signatures-table w-full border-collapse text-[10px] mb-3 print:mb-2">
        <tbody>
          <tr>
            {[
              {
                label: sig.tested,
                role: sig.roleT,
                name: testedDisplay,
                signedAt: testedSignedAt,
              },
              {
                label: sig.reviewed,
                role: sig.roleM,
                name: managerDisplay,
                signedAt: managerSignedAt,
              },
              {
                label: sig.approved,
                role: sig.roleQ,
                name: qcDisplay,
                signedAt: qcSignedAt,
              },
            ].map((col, i) => (
              <td key={i} className="signature-column align-top text-center border border-slate-300 px-1 py-2 bg-white">
                <p className="font-bold text-slate-900">{col.label}</p>
                <p className="text-slate-600 text-[9px] mt-0.5">{col.role}</p>
                <div className="signature-line border-b border-slate-900 h-9 mb-1.5 mt-2 mx-1" aria-hidden />
                <p className="font-semibold text-slate-900 text-[11px]">{col.name}</p>
                {col.signedAt ? (
                  <p className="text-slate-500 italic mt-1 leading-tight">
                    {sig.dig} {fmtDateTime(col.signedAt, lang)}
                  </p>
                ) : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Auto-note when technician manually overrides withinSpec for cubes below auto threshold */}
      {(() => {
        const manualOverrides = cubes.filter(c => {
          if (c.withinSpec !== true) return false;
          const s = parseFloat(c.compressiveStrengthMpa ?? "");
          if (!s || targetMpa === null) return false;
          const thresh = testAge >= 28 ? targetMpa - 4 : (requiredMpa ?? targetMpa);
          return s < thresh;
        });
        if (manualOverrides.length === 0) return null;
        const strengths = manualOverrides.map(c => fmtStrength(c.compressiveStrengthMpa)).join(", ");
        return (
          <div className="text-xs italic text-gray-700 border border-amber-200 bg-amber-50/80 p-2 mb-3 rounded-sm">
            ** Results {strengths} N/mm² accepted within specification limits based on technician assessment.
          </div>
        );
      })()}
      {/* Spec Limits Summary */}
      <div className="text-xs border border-slate-400 rounded-sm p-2.5 mb-3 bg-slate-50/70 space-y-1.5">
        {requiredMpa !== null && targetMpa !== null && (
          <div className="font-semibold text-slate-800">
            {testAge >= 28 ? (
              <>
                Acceptance (BS EN 12390-3 / 206): average ≥ {targetMpa.toFixed(1)} N/mm²; each cube ≥
                {" "}{(targetMpa - 4).toFixed(1)} N/mm²
              </>
            ) : (
              <>
                Required Strength at {testAge} days ({agePct}% of {targetMpa} N/mm²):
                <span className="text-blue-800 ml-1">{requiredMpa.toFixed(1)} N/mm²</span>
              </>
            )}
            {avgPass !== null && (
              <span
                className={`ml-3 font-bold inline-block rounded px-2 py-0.5 ${
                  avgPass ? "text-emerald-800 bg-emerald-100/90" : "text-red-800 bg-red-100/90"
                }`}
              >
                {avgPass ? "✓ PASS" : "✗ FAIL"}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-slate-300 pt-2">
          <div>
            <span className="font-semibold text-slate-800">Within specification: </span>
            <span className="font-bold text-emerald-800">
              {withinSpec.map(c => fmtStrength(c.compressiveStrengthMpa)).join(", ")}
              {withinSpec.length > 0 ? " N/mm²" : "—"}
            </span>
          </div>
          <div className="text-right">
            <span className="font-semibold text-slate-800">Outside specification: </span>
            <span className="font-bold text-red-800">
              {outsideSpec.map(c => fmtStrength(c.compressiveStrengthMpa)).join(", ")}
              {outsideSpec.length > 0 ? " N/mm²" : "—"}
            </span>
          </div>
        </div>
      </div>

      <footer className="mt-auto pt-3 border-t border-slate-400 text-[9px] text-slate-600 leading-snug space-y-1">
        <p className="text-center font-medium">{footer.repro}</p>
        <p className="text-center">{footer.cert}</p>
        <p className="text-center pt-1 font-semibold text-slate-800">
          {footer.page} {pageIndex + 1} {footer.of} {totalPages}
        </p>
      </footer>
    </div>
  );
}

// ─── Main Report Page ─────────────────────────────────────────────────────────
export default function ConcreteReport() {
  const { lang } = useLanguage();
  const { distributionId } = useParams<{ distributionId: string }>();
  const distId = parseInt(distributionId ?? "0");
  const printRef = useRef<HTMLDivElement>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  // Close this tab (opened via window.open) instead of navigating away
  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      window.history.back();
    }
  };

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: distId > 0 }
  );

  const { data: groups = [], isLoading } = trpc.concrete.groupsByDistribution.useQuery(
    { distributionId: distId },
    { enabled: distId > 0 }
  );
  const { data: testResult } = trpc.testResults.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: distId > 0 }
  );

  const handlePrint = async () => {
    if (!printRef.current) return window.print();
    setIsPdfLoading(true);
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `concrete-report-${refNo}`,
      mode: "print",
    });
    if (!ok) window.print();
    setIsPdfLoading(false);
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `concrete-report-${refNo}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  // Auto-print when opened in a new tab
  useEffect(() => {
    if (!isLoading && (groups as any[]).length > 0 && window.opener) {
      const timer = setTimeout(() => handlePrint(), 600);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading report...</p>
      </div>
    );
  }

  const refNo = distribution?.distributionCode ?? `DIST-${distId}`;
  const distributionAny = distribution as any;
  const testResultAny = testResult as any;

  return (
    <>
      {/* Print Controls — hidden when printing */}
      <div className="print:hidden bg-gray-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-gray-700"
            onClick={handleClose}>
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <span className="text-sm text-gray-300">
            Concrete Compression Test Report — {refNo}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="outline" className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 gap-2">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={printRef} className="lab-print-root bg-gray-200 print:bg-white min-h-screen py-6 print:py-0">
        {(groups as any[]).length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No test results found. Please enter results first.
          </div>
        ) : (
          (groups as any[]).map((group: any, idx: number, arr: any[]) => (
            <div key={group.id} className={`mx-auto mb-6 shadow-lg print:shadow-none print:mb-0 ${idx > 0 ? "print:page-break-before" : ""}`}
              style={{ width: "210mm" }}>
              <ReportPage
                group={group}
                refNo={refNo}
                castingDate={distribution?.castingDate}
                testedByName={distributionAny?.technicianName ?? testResultAny?.testedBy ?? group?.testedBy}
                managerReviewedByName={testResultAny?.managerReviewedByName ?? null}
                qcReviewedByName={testResultAny?.qcReviewedByName ?? null}
                lang={lang}
                pageIndex={idx}
                totalPages={arr.length}
                testedSignedAt={testResultAny?.processedAt ?? null}
                managerSignedAt={testResultAny?.managerReviewedAt ?? null}
                qcSignedAt={testResultAny?.qcReviewedAt ?? null}
              />
            </div>
          ))
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white !important; }
          .print\\:page-break-before { page-break-before: always; }
          .report-page { page-break-inside: avoid; }
        }
      `}</style>
    </>
  );
}
