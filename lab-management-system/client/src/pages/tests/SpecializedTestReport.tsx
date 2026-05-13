/**
 * SpecializedTestReport — Professional printable PDF report for all specialized test types
 * URL: /test-report/:distributionId
 * Supports Arabic / English toggle
 */
import { useParams } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Printer, X, CheckCircle, XCircle, Globe, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: any, dec = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toFixed(dec);
}
function fmtDate(d?: string | Date | null, lang = "ar") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// ─── Section renderers per formTemplate ───────────────────────────────────────
function renderConcreteCore(fd: any, isAr: boolean, castingDateMs?: number | null) {
  // Support both field name conventions: cores[] (new) or rows[] (old)
  const rows = fd.cores ?? fd.rows ?? [];
  const coreType = fd.coreType;
  const endCondition = fd.endCondition;
  const specifiedCubeStrength = fd.specifiedCubeStrength;
  const avgEqStrength = fd.avgEquivalentCubeStrength;
  const required = specifiedCubeStrength ? (specifiedCubeStrength * 1.0).toFixed(1) : null;
  const castMs = fd.castDate ? new Date(fd.castDate).getTime() : castingDateMs;
  // Age calculation helper: (testDate - castingDate) in days
  const calcAge = (testDateMs?: number | null): number | null => {
    if (fd.ageDays != null && !isNaN(Number(fd.ageDays))) return Number(fd.ageDays);
    if (!castMs || !testDateMs) return null;
    return Math.round((testDateMs - castMs) / (1000 * 60 * 60 * 24));
  };
  const hasAge = !!(castMs || fd.ageDays != null);
  const fmtStr = (v: any) => {
    const n = Number(v);
    if (isNaN(n) || v === null || v === undefined || v === "") return "—";
    return (Math.round(n * 10) / 10).toFixed(1);
  };
  // End condition label
  const endConditionLabel = endCondition === "grinded" ? (isAr ? "مطحون" : "Grinded")
    : endCondition === "capped" ? (isAr ? "مغطى" : "Capped")
    : (isAr ? "كما حفر" : "As-Drilled");
  const headers = isAr
    ? ["رقم الكور", "الموقع", ...(hasAge ? ["العمر (يوم)"] : []), "القطر (مم)", "الطول (مم)", "الكثافة (kg/m³)", "نسبة L/D", "معامل التصحيح", "الحمل (كن)", "مقاومة الكور (N/mm²)", "قوة المكعب المكافئة (N/mm²)", "النتيجة"]
    : ["Core No.", "Location", ...(hasAge ? ["Age (Days)"] : []), "Dia. (mm)", "Length (mm)", "Density (kg/m³)", "L/D", "C.F.", "Load (kN)", "Core Strength (N/mm²)", "Eq. Cube Strength (N/mm²)", "Result"];
  return (
    <>
      {/* Summary header */}
      <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
        {specifiedCubeStrength && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "القوة المحددة" : "Specified Str."}</p>
            <p className="font-bold text-amber-800">{specifiedCubeStrength} N/mm²</p>
          </div>
        )}
        {required && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "الحد المطلوب (100%)" : "Required (100%)"}</p>
            <p className="font-bold text-amber-800">{required} N/mm²</p>
          </div>
        )}
        {avgEqStrength != null && (
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط قوة المكعب المكافئة" : "Avg. Eq. Cube Str."}</p>
            <p className="font-bold text-green-800">{fmtStr(avgEqStrength)} N/mm²</p>
          </div>
        )}
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "حالة سطح النهاية" : "End Condition"}</p>
          <p className="font-bold text-slate-800">{endConditionLabel}{coreType ? ` • ${coreType}` : ""}</p>
        </div>
        {fd.castDate && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
            <p className="text-slate-600 font-semibold">{isAr ? "تاريخ الصب" : "Date Cast"}</p>
            <p className="font-bold text-slate-800">{fmtDate(fd.castDate, isAr ? "ar" : "en")}</p>
          </div>
        )}
        {fd.ageDays != null && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "العمر (يوم)" : "Age (days)"}</p>
            <p className="font-bold text-blue-800">{fd.ageDays}</p>
          </div>
        )}
      </div>
      <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-100">
          {headers.map(h => <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => {
          const eqStrength = r.equivalentCubeStrength ?? r.correctedStrength;
          const isLDOne = r.ld !== undefined && r.ld >= 1.0 && r.ld < 2.0;
          const isLDTwo = r.ld !== undefined && r.ld >= 2.0;
          // Length: use lengthAfterCap if available, otherwise length
          const displayLength = r.length ?? r.lengthAfterCap;
          return (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{r.coreNo ?? (i + 1)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{r.location || "—"}</td>
              {hasAge && <td className="border border-gray-300 px-1.5 py-1 text-center">{calcAge(r.testDateMs) ?? "—"}</td>}
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.diameter, 0)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{displayLength ? fmt(displayLength, 0) : "—"}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{r.density != null ? r.density : "—"}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.ld ?? r.ldRatio)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">
                {isLDOne || Number(r.correctionFactor) >= 0.999 ? "1.000" : fmt(r.correctionFactor)}
              </td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.maxLoad ?? r.maxLoadKN)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmtStr(r.coreStrength)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">
                {fmtStr(eqStrength)}
                {isLDTwo && <sup className="text-amber-600 text-[9px] ml-0.5" title={isAr ? "قوة أسطوانة" : "Cylinder strength"}>cyl</sup>}
              </td>
              <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${r.result === "pass" ? "text-green-700" : "text-red-600"}`}>
                {r.result === "pass" ? (isAr ? "مطابق" : "PASS") : r.result === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

function renderConcreteBlocks(fd: any, isAr: boolean) {
  if (typeof fd.blocks === "string") {
    try {
      fd.blocks = JSON.parse(fd.blocks);
    } catch {
      fd.blocks = [];
    }
  }
  const blocks = (fd.blocks ?? []).filter((b: any) =>
    typeof b === "object" &&
    b !== null &&
    b.strengthMpa != null &&
    Number(b.strengthMpa) > 0
  );
  const spec = fd.blockSpec ?? {};
  const BLOCK_CF_BY_THICKNESS: Record<number, number> = { 100: 0.80, 150: 0.86, 200: 1.00, 250: 1.05 };
  const inferThicknessMm = (b: any): number | undefined => {
    const fromWidth = Number(b.widthMm);
    if (Number.isFinite(fromWidth) && fromWidth > 0) return fromWidth;
    const sizeText = String(spec.size ?? "");
    const m = sizeText.match(/400[×x](\d+)[×x]200/i);
    if (m) return Number(m[1]);
    const blockSize = String(spec.blockSize ?? "");
    const cm = blockSize.match(/(\d+)\s*cm/i);
    if (cm) return Number(cm[1]) * 10;
    return undefined;
  };
  const getBlockCf = (b: any): number => {
    const existing = Number(b.correctionFactor);
    if (Number.isFinite(existing) && existing > 0) return existing;
    const th = inferThicknessMm(b);
    return BLOCK_CF_BY_THICKNESS[th ?? 0] ?? 1.0;
  };
  const getCorrectedStrength = (b: any): number | null => {
    const direct = Number(b.correctedStrengthMpa);
    if (Number.isFinite(direct)) return direct;
    const raw = Number(b.strengthMpa);
    if (!Number.isFinite(raw)) return null;
    return raw * getBlockCf(b);
  };
  const avgCorrectedStrength = blocks.length > 0
    ? blocks.reduce((sum: number, b: any) => sum + (getCorrectedStrength(b) ?? 0), 0) / blocks.length
    : Number(fd.avgStrength ?? 0);
  const fmtS = (v: any) => {
    const n = Number(v);
    if (isNaN(n) || v === "" || v == null) return "—";
    return (Math.round(n * 10) / 10).toFixed(1);
  };
  const headers = isAr
    ? ["المرجع", "التاريخ", "الطول", "العرض", "الوزن (غ)", "الحمل (كن)", "المساحة", "القوة", "CF", "القوة المصححة", "النتيجة"]
    : ["Block Ref", "Date Tested", "L (mm)", "W (mm)", "Weight (g)", "Load (kN)", "Gross Area (mm²)", "Strength (N/mm²)", "CF", "Corrected Strength (N/mm²)", "Result"];
  return (
    <div className="text-xs space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <p className="text-blue-600 font-semibold">{isAr ? "نوع البلوك" : "Block Type"}</p>
          <p className="font-bold text-blue-800">{spec.label ?? fd.blockType ?? "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2">
          <p className="text-gray-500 font-semibold">{isAr ? "الحجم" : "Size"}</p>
          <p className="font-bold">{spec.size ?? "—"}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2">
          <p className="text-amber-700 font-semibold">{isAr ? "المقاومة المطلوبة" : "Required Strength"}</p>
          <p className="font-bold">{spec.requiredStrength != null ? `${spec.requiredStrength} N/mm²` : "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2">
          <p className="text-gray-500 font-semibold">{isAr ? "المعيار" : "Standard"}</p>
          <p className="font-bold">BS EN 772-1</p>
        </div>
        {fd.manufacturer && (
          <div className="bg-gray-50 border rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "المصنع / المصدر" : "Manufacturer / Source"}</p>
            <p className="font-bold">{fd.manufacturer}</p>
          </div>
        )}
        {fd.mtsReference && (
          <div className="bg-gray-50 border rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "مرجع التقديم" : "Material Submittal Ref."}</p>
            <p className="font-bold">{fd.mtsReference}</p>
          </div>
        )}
        {fd.batchNo && (
          <div className="bg-gray-50 border rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "الدفعة" : "Batch No."}</p>
            <p className="font-bold">{fd.batchNo}</p>
          </div>
        )}
      </div>
      {blocks.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {headers.map(h => <th key={h} className="border border-gray-300 px-1 py-1 font-semibold text-center">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {blocks.map((b: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-300 px-1 py-1 text-center font-mono">{b.blockRef ?? i + 1}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.dateTested || "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.lengthMm ?? "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.widthMm ?? "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.weightG ?? "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.loadKN != null ? fmt(b.loadKN, 1) : "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center">{b.grossAreaMm2 ?? "—"}</td>
                <td className="border border-gray-300 px-1 py-1 text-center font-semibold">{fmtS(b.strengthMpa)}</td>
                <td className="border border-gray-300 px-1 py-1 text-center text-blue-700">{fmtS(getBlockCf(b))}</td>
                <td className="border border-gray-300 px-1 py-1 text-center font-bold">{fmtS(getCorrectedStrength(b))}</td>
                <td className={`border border-gray-300 px-1 py-1 text-center font-bold ${b.result === "pass" ? "text-green-700" : "text-red-600"}`}>
                  {b.result === "pass" ? (isAr ? "مطابق" : "PASS") : b.result === "fail" ? (isAr ? "راسب" : "FAIL") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-3 justify-end text-xs">
        <span className="font-semibold">
          {isAr ? "متوسط القوة المصححة:" : "Average Corrected Strength:"} {fmtS(avgCorrectedStrength)} N/mm²
          {" "}/ {isAr ? "المطلوب:" : "Required:"} {fmtS(spec.requiredStrength)} N/mm²
        </span>
        <span className={`font-bold px-2 py-1 rounded border ${fd.overallResult === "pass" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {isAr ? "النتيجة الكلية:" : "Overall:"} {fd.overallResult === "pass" ? (isAr ? "مطابق" : "PASS") : fd.overallResult === "fail" ? (isAr ? "راسب" : "FAIL") : "—"}
        </span>
      </div>
    </div>
  );
}

function renderSteelRebar(fd: any, isAr: boolean) {
  const rows = fd.rows ?? [];
  const headers = isAr
    ? ["رقم القضيب", "القطر (مم)", "الوزن/م (كغ)", "حمل الخضوع (كن)", "مقاومة الخضوع (MPa)", "حمل UTS (كن)", "UTS (MPa)", "الاستطالة (%)", "الانحناء", "النتيجة"]
    : ["Bar No.", "Dia (mm)", "Weight/m (kg)", "Yield Load (kN)", "Yield Strength (MPa)", "UTS Load (kN)", "UTS (MPa)", "Elong. (%)", "Bend", "Result"];
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-100">
          {headers.map(h => <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => (
          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{i + 1}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.diameter, 0)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.weightPerMeter)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.yieldLoadKN)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.yieldStrength)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.utsLoadKN)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.uts)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(r.elongation)}</td>
            <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${r.bendResult === "pass" ? "text-green-700" : "text-red-600"}`}>
              {r.bendResult === "pass" ? (isAr ? "مطابق" : "PASS") : r.bendResult === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
            </td>
            <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${r.overallResult === "pass" ? "text-green-700" : "text-red-600"}`}>
              {r.overallResult === "pass" ? (isAr ? "مطابق" : "PASS") : r.overallResult === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderSieveAnalysis(fd: any, isAr: boolean) {
  // Support both legacy 'sieves' and new 'rows' field names
  const rows = fd.rows ?? fd.sieves ?? [];
  const gradingType = fd.gradingType ?? "";
  const mortarSubtypeLabel =
    fd.mortarSandSubtype === "PLASTER_SAND"
      ? (isAr ? "رمل لياسة — BS 1199" : "Plaster Sand — BS 1199")
      : fd.mortarSandSubtype === "MASONRY_SAND"
        ? (isAr ? "رمل بناء — ASTM C144" : "Masonry Sand — ASTM C144")
        : null;
  const sieveStandard = fd.sieveStandard === "ASTM" || fd.sieveStandard === "BS" ? fd.sieveStandard : null;
  const gradingLabels: Record<string, string> = {
    COARSE_40: isAr ? "ركام خشن 40مم" : "Coarse Aggregate 40mm",
    COARSE_20: isAr ? "ركام خشن 20مم" : "Coarse Aggregate 20mm",
    FINE_SAND: isAr ? "ركام ناعم (رمل)" : "Fine Aggregate (Sand)",
    MORTAR_SAND: isAr ? "رمل ملاط (ASTM C144)" : "Mortar Sand (ASTM C144)",
    PLASTER_SAND: isAr ? "رمل جص (BS 1199)" : "Plaster Sand (BS 1199)",
    MASONRY_SAND: isAr ? "رمل بناء (ASTM C144)" : "Masonry Sand (ASTM C144)",
    ASTM_COARSE_NO57: isAr ? "ركام خشن ASTM (تدرج 57)" : "ASTM Coarse (No. 57–style)",
    ASTM_FINE_CONCRETE: isAr ? "رمل ناعم خرسانة ASTM C33" : "ASTM Fine (concrete sand, C33)",
  };
  const gradingLabel = gradingLabels[gradingType] ?? gradingType;
  const headers = isAr
    ? ["فتحة المنخل (مم)", "الكتلة المحتجزة (غ)", "% محتجز", "% محتجز تراكمي", "% مار", "حد أدنى", "حد أعلى", "نتيجة"]
    : ["Sieve (mm)", "Retained (g)", "% Ret.", "Cum. % Ret.", "% Passing", "Lower", "Upper", "Result"];
  return (
    <div className="space-y-3">
      {gradingLabel && (
        <div className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 space-y-0.5">
          {sieveStandard && (
            <div className="text-[11px] font-normal text-blue-800/90">
              {isAr ? "المواصفة:" : "Standard:"}{" "}
              {sieveStandard === "ASTM" ? "ASTM C33 / C136" : "BS 882 / BS EN 12620"}
            </div>
          )}
          <div>
            {isAr ? "نوع التدرج:" : "Grading Type:"} {gradingLabel}
          </div>
          {mortarSubtypeLabel && (
            <div className="text-[11px] font-normal text-blue-800/90">
              {isAr ? "رمل الملاط:" : "Mortar sand standard:"} {mortarSubtypeLabel}
            </div>
          )}
        </div>
      )}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            {headers.map(h => <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((s: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{s.sieve ?? s.size}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{s.massRetained ?? fmt(s.retained)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{s.pctRetained !== undefined ? s.pctRetained.toFixed(1) : fmt(s.percentRetained)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{s.cumRetained !== undefined ? s.cumRetained.toFixed(1) : fmt(s.cumRetained)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{s.cumPassing !== undefined ? s.cumPassing.toFixed(1) : fmt(s.percentPassing)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center text-blue-700">{s.lower ?? s.lowerLimit ?? "—"}</td>
              <td className="border border-gray-300 px-2 py-1 text-center text-blue-700">{s.upper ?? s.upperLimit ?? "—"}</td>
              <td className={`border border-gray-300 px-2 py-1 text-center font-bold ${s.withinLimits ? "text-green-700" : s.withinLimits === false ? "text-red-600" : "text-gray-500"}`}>
                {s.withinLimits === true ? "✓" : s.withinLimits === false ? "✗" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fd.finesModulus !== undefined && (
        <div className="text-xs bg-blue-50 border border-blue-100 rounded px-3 py-1.5">
          <span className="font-semibold text-blue-700">{isAr ? "معامل النعومة (FM):" : "Fineness Modulus (FM):"}</span>
          <span className="font-mono font-bold text-blue-900 mx-2">{parseFloat(fd.finesModulus).toFixed(2)}</span>
          <span className="text-gray-500">{isAr ? "(مقبول: 2.3 – 3.1)" : "(acceptable: 2.3 – 3.1)"}</span>
        </div>
      )}
    </div>
  );
}

function renderSoilProctor(fd: any, isAr: boolean) {
  const points = fd.points ?? [];
  const headers = isAr
    ? ["النقطة", "قالب+تربة (غ)", "القالب (غ)", "التربة (غ)", "الكثافة الرطبة (غ/سم³)", "نسبة الرطوبة (%)", "الكثافة الجافة (غ/سم³)"]
    : ["Point", "Mould+Soil (g)", "Mould (g)", "Soil (g)", "Wet Density (g/cm³)", "Water Content (%)", "Dry Density (g/cm³)"];
  return (
    <>
      <table className="w-full text-xs border-collapse mb-4">
        <thead>
          <tr className="bg-gray-100">
            {headers.map(h => <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {points.map((p: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{fmt(p.mouldSoil)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{fmt(p.mouldWeight)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{fmt(p.soilWeight)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{fmt(p.wetDensity)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{fmt(p.waterContent)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{fmt(p.dryDensity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "أقصى كثافة جافة (MDD)" : "Max Dry Density (MDD)"}</p>
          <p className="text-xl font-bold text-blue-800">{fmt(fd.mdd)} {isAr ? "غ/سم³" : "g/cm³"}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
          <p className="text-green-600 font-semibold">{isAr ? "نسبة الرطوبة المثلى (OMC)" : "Optimum Moisture Content (OMC)"}</p>
          <p className="text-xl font-bold text-green-800">{fmt(fd.omc)} %</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <p className="text-gray-600 font-semibold">{isAr ? "حجم القالب" : "Mould Volume"}</p>
          <p className="text-xl font-bold text-gray-800">{fmt(fd.mouldVolume)} {isAr ? "سم³" : "cm³"}</p>
        </div>
      </div>
    </>
  );
}

function renderAsphaltMarshall(fd: any, isAr: boolean) {
  const specimens = fd.specimens ?? [];
  const headers = isAr
    ? ["العينة", "نسبة البيتومين (%)", "الكثافة الكلية", "الثبات (كن)", "الانسياب (مم)", "VMA (%)", "VFA (%)", "الفراغات الهوائية (%)"]
    : ["Spec.", "Bitumen (%)", "Bulk Density", "Stability (kN)", "Flow (mm)", "VMA (%)", "VFA (%)", "Air Voids (%)"];
  return (
    <>
      <table className="w-full text-xs border-collapse mb-4">
        <thead>
          <tr className="bg-gray-100">
            {headers.map(h => <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {specimens.map((s: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{i + 1}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.bitumenContent)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.bulkDensity)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.stability)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.flow)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.vma)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.vfa)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(s.airVoids)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fd.obc && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-center">
          <span className="font-semibold text-amber-800">
            {isAr ? "نسبة البيتومين المثلى (OBC): " : "Optimum Bitumen Content (OBC): "}
          </span>
          <span className="text-xl font-bold text-amber-900">{fmt(fd.obc)} %</span>
        </div>
      )}
    </>
  );
}

function renderConcreteFoam(fd: any, isAr: boolean) {
  const cubes = fd.cubes ?? [];
  const densitySpecimens = fd.densitySpecimens ?? [];
  const hasCubes = cubes.length > 0;
  const hasDensity = densitySpecimens.length > 0;

  return (
    <div className="space-y-4">
      {/* Grade & Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "الدرجة" : "Grade"}</p>
          <p className="font-bold text-gray-800">{fd.grade || "—"}</p>
        </div>
        {fd.avgStrength !== undefined && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "متوسط المقاومة" : "Avg. Strength"}</p>
            <p className="font-bold text-blue-800">{Number(fd.avgStrength).toFixed(2)} N/mm²</p>
          </div>
        )}
        {fd.avgDryDensity !== undefined && (
          <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
            <p className="text-purple-600 font-semibold">{isAr ? "متوسط الكثافة الجافة" : "Avg. Dry Density"}</p>
            <p className="font-bold text-purple-800">{Number(fd.avgDryDensity).toFixed(0)} kg/m³</p>
          </div>
        )}
        {fd.minStrength !== undefined && (
          <div className="bg-gray-50 border rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "الحد الأدنى" : "Min. Strength"}</p>
            <p className="font-bold text-gray-800">{fd.minStrength} N/mm²</p>
          </div>
        )}
      </div>

      {/* Cubes Table */}
      {hasCubes && (
        <>
          <p className="text-xs font-semibold text-gray-600">{isAr ? "نتائج المكعبات" : "Cube Results"}</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                {[isAr ? "رقم" : "No.", isAr ? "العمر (يوم)" : "Age (days)", isAr ? "الحمل (كن)" : "Load (kN)", isAr ? "المساحة (مم²)" : "Area (mm²)", isAr ? "المقاومة (N/mm²)" : "Strength (N/mm²)", isAr ? "الكثافة (kg/m³)" : "Density (kg/m³)", isAr ? "النتيجة" : "Result"].map(h => (
                  <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cubes.map((c: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{c.age ?? "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{c.maxLoad ?? "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{c.area ? Number(c.area).toFixed(0) : "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">{c.strength ? Number(c.strength).toFixed(2) : "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{c.density ? Number(c.density).toFixed(0) : "—"}</td>
                  <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${c.result === "pass" ? "text-green-700" : c.result === "fail" ? "text-red-600" : "text-gray-500"}`}>
                    {c.result === "pass" ? (isAr ? "مطابق" : "PASS") : c.result === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Density Specimens Table */}
      {hasDensity && (
        <>
          <p className="text-xs font-semibold text-gray-600">{isAr ? "عينات الكثافة" : "Density Specimens"}</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                {[isAr ? "رقم" : "No.", isAr ? "الوزن الرطب (غ)" : "Wet Wt (g)", isAr ? "الوزن الجاف (غ)" : "Dry Wt (g)", isAr ? "الكثافة الطازجة (kg/m³)" : "Fresh Density (kg/m³)", isAr ? "الكثافة الجافة (kg/m³)" : "Dry Density (kg/m³)", isAr ? "الرطوبة (%)" : "Moisture (%)", isAr ? "النتيجة" : "Result"].map(h => (
                  <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {densitySpecimens.map((d: any, i: number) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{i + 1}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{d.wetWeight ?? "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{d.dryWeight ?? "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{d.freshDensity ? Number(d.freshDensity).toFixed(0) : "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">{d.dryDensity ? Number(d.dryDensity).toFixed(0) : "—"}</td>
                  <td className="border border-gray-300 px-1.5 py-1 text-center">{d.moistureContent ? Number(d.moistureContent).toFixed(1) : "—"}</td>
                  <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${d.result === "pass" ? "text-green-700" : d.result === "fail" ? "text-red-600" : "text-gray-500"}`}>
                    {d.result === "pass" ? (isAr ? "مطابق" : "PASS") : d.result === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function renderCementSettingTime(fd: any, isAr: boolean) {
  const readings = fd.readings ?? [];
  const validReadings = readings
    .map((r: any) => ({ time: parseFloat(r.time), pen: parseFloat(r.penetration) }))
    .filter((r: any) => !isNaN(r.time) && !isNaN(r.pen))
    .sort((a: any, b: any) => a.time - b.time);

  const formatTime = (min: number) => {
    if (isNaN(min) || min === undefined || min === null) return "—";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  // Re-compute from readings if stored values are NaN/null/undefined
  function interpolateTimeReport(targetPen: number): number | undefined {
    const sorted = [...validReadings].sort((a: any, b: any) => a.time - b.time);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if ((a.pen >= targetPen && b.pen <= targetPen) || (a.pen <= targetPen && b.pen >= targetPen)) {
        const denom = b.pen - a.pen;
        if (denom === 0) continue;
        const t = a.time + (targetPen - a.pen) / denom * (b.time - a.time);
        if (isNaN(t) || !isFinite(t)) continue;
        return parseFloat(t.toFixed(0));
      }
    }
    // Fallback: first reading where pen <= targetPen
    const fallback = sorted.find((r: any) => r.pen <= targetPen);
    return fallback ? fallback.time : undefined;
  }

  const rawInitialSet = fd.initialSettingTime ?? fd.initialSet;
  const rawFinalSet = fd.finalSettingTime ?? fd.finalSet;
  // Use stored value if valid number, otherwise re-compute from readings
  const initialSet = (rawInitialSet !== null && rawInitialSet !== undefined && !isNaN(Number(rawInitialSet)))
    ? Number(rawInitialSet)
    : interpolateTimeReport(25);
  let finalSet = (rawFinalSet !== null && rawFinalSet !== undefined && !isNaN(Number(rawFinalSet)))
    ? Number(rawFinalSet)
    : interpolateTimeReport(1);
  // Additional fallback for final set: last reading with pen <= 1
  if (finalSet === undefined && validReadings.length > 0) {
    const sorted = [...validReadings].sort((a: any, b: any) => a.time - b.time);
    const last = sorted[sorted.length - 1];
    if (last.pen <= 1) finalSet = last.time;
  }
  const spec = fd.spec ?? {};

  return (
    <div className="space-y-4">
      {/* Test Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "نوع الأسمنت" : "Cement Type"}</p>
          <p className="font-bold text-gray-800">{spec.label ?? fd.cementType ?? "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "محتوى الماء" : "Water Content"}</p>
          <p className="font-bold text-gray-800">{fd.waterContent ? `${fd.waterContent}%` : "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "درجة الحرارة" : "Temperature"}</p>
          <p className="font-bold text-gray-800">{fd.testTemp ? `${fd.testTemp}°C` : "—"}</p>
        </div>
        <div className="bg-gray-50 border rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "رقم الدفعة" : "Batch No."}</p>
          <p className="font-bold text-gray-800">{fd.cementBatch || "—"}</p>
        </div>
      </div>

      {/* Setting Times Results */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl p-4 text-center border-2 ${
          initialSet != null && !isNaN(initialSet) && initialSet >= (spec.initialSetMin ?? 45)
            ? "bg-emerald-50 border-emerald-300"
            : initialSet != null && !isNaN(initialSet) ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
        }`}>
          <p className="text-xs font-semibold text-gray-600 mb-1">{isAr ? "زمن الشك الابتدائي" : "Initial Setting Time"}</p>
          <p className="text-3xl font-extrabold text-gray-800">
            {initialSet != null && !isNaN(initialSet) ? formatTime(initialSet) : "—"}
          </p>
          {initialSet != null && !isNaN(initialSet) && (
            <p className="text-xs text-gray-500 mt-1">{isAr ? "الحد الأدنى:" : "Min:"} {spec.initialSetMin ?? "—"} min</p>
          )}
          {initialSet != null && !isNaN(initialSet) && (
            <p className={`text-xs font-bold mt-1 ${
              initialSet >= (spec.initialSetMin ?? 45) ? "text-emerald-700" : "text-red-700"
            }`}>
              {initialSet >= (spec.initialSetMin ?? 45)
                ? (isAr ? "✓ مطابق" : "✓ PASS")
                : (isAr ? "✗ غير مطابق" : "✗ FAIL")}
            </p>
          )}
        </div>
        <div className={`rounded-xl p-4 text-center border-2 ${
          finalSet != null && !isNaN(finalSet) && finalSet <= (spec.finalSetMax ?? 600)
            ? "bg-emerald-50 border-emerald-300"
            : finalSet != null && !isNaN(finalSet) ? "bg-red-50 border-red-300" : "bg-gray-50 border-gray-200"
        }`}>
          <p className="text-xs font-semibold text-gray-600 mb-1">{isAr ? "زمن الشك النهائي" : "Final Setting Time"}</p>
          <p className="text-3xl font-extrabold text-gray-800">
            {finalSet != null && !isNaN(finalSet) ? formatTime(finalSet) : "—"}
          </p>
          {finalSet != null && !isNaN(finalSet) && (
            <p className="text-xs text-gray-500 mt-1">{isAr ? "الحد الأقصى:" : "Max:"} {spec.finalSetMax ?? "600"} min</p>
          )}
          {finalSet != null && !isNaN(finalSet) && (
            <p className={`text-xs font-bold mt-1 ${
              finalSet <= (spec.finalSetMax ?? 600) ? "text-emerald-700" : "text-red-700"
            }`}>
              {finalSet <= (spec.finalSetMax ?? 600)
                ? (isAr ? "✓ مطابق" : "✓ PASS")
                : (isAr ? "✗ غير مطابق" : "✗ FAIL")}
            </p>
          )}
        </div>
      </div>

      {/* Readings Table */}
      {validReadings.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1 text-center">{isAr ? "الوقت (دقيقة)" : "Time (min)"}</th>
              <th className="border border-gray-300 px-2 py-1 text-center">{isAr ? "الاختراق (مم)" : "Penetration (mm)"}</th>
            </tr>
          </thead>
          <tbody>
            {validReadings.map((r: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-300 px-2 py-1 text-center">{r.time}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{r.pen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function renderInterlock(fd: any, isAr: boolean) {
  const blocks = (fd.blocks ?? []).filter((b: any) => b.strengthMpa && b.strengthMpa > 0);
  const spec = fd.spec ?? {};
  const avgStrength = fd.avgStrength ?? 0;
  const overallResult = fd.overallResult ?? "pending";
  const THICKNESS_FACTOR_RPT: Record<number, number> = { 60: 0.80, 80: 1.00, 100: 1.20 };
  const defaultTf = THICKNESS_FACTOR_RPT[spec.thickness] ?? 1.0;
  const headers = isAr
    ? ["رقم البلوكة", "السماكة (مم)", "الحمل (كن)", "المساحة (مم²)", "المقاومة (N/mm²)", "CF", "المقاومة المصححة (N/mm²)", "النتيجة"]
    : ["Block Ref.", "Thickness (mm)", "Load (kN)", "Area (mm²)", "Strength (N/mm²)", "CF", "Corrected Str. (N/mm²)", "Result"];
  return (
    <div className="text-xs">
      {/* Test Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <p className="text-blue-600 font-semibold">{isAr ? "النوع" : "Block Type"}</p>
          <p className="font-bold text-blue-800">{spec.label ?? fd.interlockType ?? "—"}</p>
        </div>
        {fd.manufacturer && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "المصنّع" : "Manufacturer"}</p>
            <p className="font-bold text-gray-800">{fd.manufacturer}</p>
          </div>
        )}
        {fd.blockShape && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "الشكل" : "Shape"}</p>
            <p className="font-bold text-gray-800">{fd.blockShape}</p>
          </div>
        )}
        {fd.blockColor && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "اللون" : "Color"}</p>
            <p className="font-bold text-gray-800">{fd.blockColor}</p>
          </div>
        )}
        {fd.mtsReference && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <p className="text-gray-500 font-semibold">{isAr ? "مرجع التقديم" : "Material Submittal Ref."}</p>
            <p className="font-bold text-gray-800">{fd.mtsReference}</p>
          </div>
        )}
      </div>
      {/* Results Table */}
      {blocks.length > 0 && (
        <table className="w-full text-xs border-collapse mb-3">
          <thead>
            <tr className="bg-gray-100">
              {headers.map((h: string) => <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {blocks.map((b: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="border border-gray-300 px-1.5 py-1 text-center font-mono">{b.blockRef}</td>
                <td className="border border-gray-300 px-1.5 py-1 text-center">{b.thickness ?? "—"}</td>
                <td className="border border-gray-300 px-1.5 py-1 text-center">{b.maxLoadKN != null ? Number(b.maxLoadKN).toFixed(1) : "—"}</td>
                <td className="border border-gray-300 px-1.5 py-1 text-center">{b.area != null ? Math.round(b.area) : "—"}</td>
                <td className="border border-gray-300 px-1.5 py-1 text-center">{b.strengthMpa != null ? Number(b.strengthMpa).toFixed(1) : "—"}</td>
                <td className="border border-gray-300 px-1.5 py-1 text-center text-blue-700">
                  {THICKNESS_FACTOR_RPT[Number(b.thickness)] ?? defaultTf}
                </td>
                <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">
                  {b.correctedStrengthMpa != null
                    ? Number(b.correctedStrengthMpa).toFixed(1)
                    : b.strengthMpa != null
                      ? (Number(b.strengthMpa) * (THICKNESS_FACTOR_RPT[Number(b.thickness)] ?? defaultTf)).toFixed(1)
                      : "—"}
                </td>
                <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${b.result === "pass" ? "text-green-700" : b.result === "fail" ? "text-red-600" : "text-gray-500"}`}>
                  {b.result === "pass" ? (isAr ? "مطابق" : "PASS") : b.result === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* Summary */}
      <div className="flex justify-end">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold border ${
          overallResult === "pass" ? "bg-green-50 border-green-300 text-green-800" :
          overallResult === "fail" ? "bg-red-50 border-red-300 text-red-800" :
          "bg-gray-50 border-gray-300 text-gray-700"
        }`}>
          {isAr ? "متوسط المقاومة المصححة:" : "Avg. Corrected Strength:"} {Number(avgStrength).toFixed(1)} N/mm²
          &nbsp;/&nbsp;
          {isAr ? "المطلوب:" : "Required:"} {spec.requiredStrength ?? "—"} N/mm²
        </div>
      </div>
    </div>
  );
}

function renderConcreteBeam(fd: any, isAr: boolean, castingDateMs?: number | null) {
  const rows = (fd.rows ?? []).filter((r: any) => !r.discarded && r.mor !== undefined);
  const allRows = fd.rows ?? [];
  const beamSize = fd.beamSize ?? "small";
  const span = fd.span ?? (beamSize === "large" ? 450 : 300);
  const specifiedStrength = fd.specifiedStrength;
  const minMOR = fd.minMOR;
  const avgMOR = fd.avgMOR;
  const standard = fd.standard ?? "ASTM C 78";
  const requiredAge = fd.requiredAge ?? null;

  const BEAM_SIZE_LABELS: Record<string, string> = {
    small: "100×100×500 mm (Span = 300 mm)",
    large: "150×150×750 mm (Span = 450 mm)",
  };

  const calcAge = (testDateMs?: number | null): number | null => {
    if (!castingDateMs || !testDateMs) return null;
    return Math.round((testDateMs - castingDateMs) / (1000 * 60 * 60 * 24));
  };

  // Use castDate/testDate/ageDays stored directly in formData (new format)
  const fdCastDate = fd.castDate ?? null;
  const fdTestDate = fd.testDate ?? null;
  const fdAgeDays = fd.ageDays ?? null;

  const hasAge = !!castingDateMs || !!fdCastDate;

  const headers = isAr
    ? ["رقم الكمرة", "الموقع", "العرض (مم)", "العمق (مم)", "الحمل الأقصى (كن)", "منطقة الكسر", "MOR (N/mm²)", ...(hasAge ? ["العمر (يوم)"] : []), "النتيجة"]
    : ["Beam No.", "Location", "Width (mm)", "Depth (mm)", "Max Load (kN)", "Fracture Zone", "MOR (N/mm²)", ...(hasAge ? ["Age (days)"] : []), "Result"];

  const fractureZoneLabel = (zone: string, isAr: boolean) => {
    if (zone === "middle_third") return isAr ? "الثلث الأوسط" : "Middle Third";
    if (zone === "outside_5pct") return isAr ? "خارج (ضمن 5%)" : "Outside (within 5%)";
    return isAr ? "مستبعد" : "Discarded";
  };

  return (
    <div className="space-y-4">
      {/* Test Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "حجم الكمرة" : "Beam Size"}</p>
          <p className="font-bold text-blue-800 text-[11px]">{BEAM_SIZE_LABELS[beamSize] ?? beamSize}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "طول الامتداد (مم)" : "Span (mm)"}</p>
          <p className="font-bold text-gray-800">{span}</p>
        </div>
        {specifiedStrength !== undefined && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "المقاومة المحددة (MPa)" : "Specified Strength (MPa)"}</p>
            <p className="font-bold text-gray-800">{specifiedStrength}</p>
          </div>
        )}
        {minMOR !== undefined && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-600 font-semibold">{isAr ? "الحد الأدنى MOR (MPa)" : "Min. MOR (MPa)"}</p>
          <p className="font-bold text-amber-800">{minMOR}</p>
          <p className="text-xs text-amber-600">{isAr ? "وفق ASTM C 78" : "per ASTM C 78"}</p>
        </div>
        )}
        {requiredAge !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "العمر المطلوب" : "Required Age"}</p>
            <p className="font-bold text-blue-800">{requiredAge} {isAr ? "يوم" : "days"}</p>
          </div>
        )}
        {fd.sampleLocation && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "موقع العينة" : "Sample Location"}</p>
            <p className="font-bold text-gray-800 text-[11px]">{fd.sampleLocation}</p>
          </div>
        )}
        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
          <p className="text-gray-500 font-semibold">{isAr ? "المعيار" : "Standard"}</p>
          <p className="font-bold text-gray-800 text-[11px]">{standard}</p>
        </div>
        {(castingDateMs || fdCastDate) && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "تاريخ الصب" : "Cast Date"}</p>
            <p className="font-bold text-gray-800">
              {fdCastDate
                ? new Date(fdCastDate).toLocaleDateString(isAr ? "ar-AE" : "en-GB")
                : castingDateMs ? new Date(castingDateMs).toLocaleDateString(isAr ? "ar-AE" : "en-GB") : "—"}
            </p>
          </div>
        )}
        {fdTestDate && (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-500 font-semibold">{isAr ? "تاريخ الفحص" : "Date Tested"}</p>
            <p className="font-bold text-gray-800">{new Date(fdTestDate).toLocaleDateString(isAr ? "ar-AE" : "en-GB")}</p>
          </div>
        )}
        {(fdAgeDays !== null || hasAge) && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-blue-600 font-semibold">{isAr ? "العمر (يوم)" : "Age (days)"}</p>
            <p className="font-bold text-blue-800">{fdAgeDays !== null ? fdAgeDays : "—"}</p>
          </div>
        )}
      </div>

      {/* Results Table */}
      {allRows.length > 0 && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {headers.map((h: string) => (
                <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((r: any, i: number) => {
              const isDiscarded = r.discarded;
              const age = hasAge ? calcAge(r.testDateMs ?? null) : null;
              return (
                <tr key={i} className={`${isDiscarded ? "opacity-40 bg-gray-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="border border-gray-300 px-2 py-1 text-center font-mono font-semibold">{r.beamNo ?? (i + 1)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{r.location || "—"}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{r.width ?? "—"}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{r.depth ?? "—"}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{r.maxLoad ?? "—"}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{fractureZoneLabel(r.fractureZone ?? "middle_third", isAr)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center font-semibold">
                    {isDiscarded ? (isAr ? "مستبعد" : "Discarded") : r.mor !== undefined ? Number(r.mor).toFixed(3) : "—"}
                  </td>
                  {hasAge && <td className="border border-gray-300 px-2 py-1 text-center">{age ?? "—"}</td>}
                  <td className={`border border-gray-300 px-2 py-1 text-center font-bold ${
                    isDiscarded ? "text-orange-600" :
                    r.result === "pass" ? "text-green-700" :
                    r.result === "fail" ? "text-red-600" : "text-gray-500"
                  }`}>
                    {isDiscarded
                      ? (isAr ? "مستبعد" : "Discarded")
                      : r.result === "pass" ? (isAr ? "مطابق" : "PASS")
                      : r.result === "fail" ? (isAr ? "غير مطابق" : "FAIL")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Summary */}
      {avgMOR !== null && avgMOR !== undefined && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط MOR" : "Average MOR"}</p>
            <p className="font-bold text-green-800 text-lg">{Number(avgMOR).toFixed(3)} N/mm²</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "الحد الأدنى المطلوب" : "Min. Required"}</p>
            <p className="font-bold text-amber-800 text-lg">{minMOR ?? "—"} N/mm²</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "عدد الكمرات الصالحة" : "Valid Beams"}</p>
            <p className="font-bold text-gray-800 text-lg">{rows.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function renderGeneric(fd: any, isAr: boolean) {
  return (
    <div className="text-xs border border-amber-200 bg-amber-50 rounded p-4 text-amber-900">
      <p className="font-semibold mb-1">
        {isAr ? "تنسيق التقرير غير متاح لهذا النوع بعد" : "Formatted report is not available for this test type yet"}
      </p>
      <p className="text-[11px] text-amber-800">
        {isAr
          ? "تم حفظ النتائج بنجاح، لكن عرض التقرير التفصيلي يحتاج إضافة قالب عرض مخصص."
          : "Results are saved successfully, but detailed rendering requires a dedicated report template."}
      </p>
    </div>
  );
}

function renderConcreteCubes(fd: any, isAr: boolean) {
  const cubes = fd.cubes ?? [];
  const castingDate = fd.castingDate ? new Date(fd.castingDate) : null;
  const ageDays = fd.sampleAgeDays;
  const specifiedStrength = fd.specifiedStrength;
  const requiredAtAge = fd.requiredAtAge;
  const avgStrength = fd.avgStrength;
  const structureType = fd.structureType;
  const batchReference = fd.batchReference;
  const curingKey = fd.curingCondition as string | undefined;
  const curingLabels: Record<string, { ar: string; en: string }> = {
    water_20c: { ar: "ماء عند 20±2°م", en: "Water at 20 ±2 °C" },
    water_lab: { ar: "ماء (معيار المختبر)", en: "Water (lab standard)" },
    site_covered: { ar: "موقع (مغطى)", en: "Site (covered)" },
    other: { ar: "أخرى", en: "Other" },
  };
  const curingLabel =
    curingKey && curingLabels[curingKey]
      ? (isAr ? curingLabels[curingKey].ar : curingLabels[curingKey].en)
      : curingKey || "—";
  // Nominal cube size: from saved formData or inferred from first cube row
  const nominalCubeSize = fd.nominalCubeSize ?? (cubes.length > 0 ? `${cubes[0].cubeSize ?? 150}mm` : "150mm");
  const headers = isAr
    ? ["رقم المكعب", "الموقع", "الحجم (مم)", "الحمل (كن)", "المساحة (مم²)", "القوة الخام (N/mm²)", "القوة المصححة (N/mm²)", "النتيجة"]
    : ["Cube No.", "Location", "Size (mm)", "Load (kN)", "Area (mm²)", "Raw Str. (N/mm²)", "Corrected Str. (N/mm²)", "Result"];
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4 text-xs">
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "تاريخ الصب" : "Casting Date"}</p>
          <p className="font-bold text-blue-800">{castingDate ? castingDate.toLocaleDateString() : "—"}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
          <p className="text-blue-600 font-semibold">{isAr ? "عمر العينة" : "Sample Age"}</p>
          <p className="font-bold text-blue-800">{ageDays != null ? `${ageDays} ${isAr ? "يوم" : "days"}` : "—"}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2 text-center">
          <p className="text-slate-600 font-semibold">{isAr ? "الحجم الاسمي للمكعب" : "Nominal Cube Size"}</p>
          <p className="font-bold text-slate-800">{nominalCubeSize}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-600 font-semibold">{isAr ? "القوة المحددة (28 يوم)" : "Specified Str. (28d)"}</p>
          <p className="font-bold text-amber-800">{specifiedStrength ?? "—"} N/mm²</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
          <p className="text-amber-600 font-semibold">{isAr ? "القوة المطلوبة عند العمر" : "Required at Age"}</p>
          <p className="font-bold text-amber-800">{requiredAtAge ?? "—"} N/mm²</p>
        </div>
        {structureType ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "نوع الهيكل" : "Structure Type"}</p>
            <p className="font-bold text-gray-800">{structureType}</p>
          </div>
        ) : null}
        <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
          <p className="text-gray-600 font-semibold">{isAr ? "المعالجة" : "Curing"}</p>
          <p className="font-bold text-gray-800">{curingLabel}</p>
        </div>
        {batchReference ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "مرجع الدفعة" : "Batch ref."}</p>
            <p className="font-bold text-gray-800">{batchReference}</p>
          </div>
        ) : null}
      </div>
      <table className="w-full text-xs border-collapse mb-4">
        <thead>
          <tr className="bg-gray-100">
            {headers.map(h => <th key={h} className="border border-gray-300 px-1.5 py-1 text-center font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {cubes.map((c: any, i: number) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{c.cubeNo ?? (i + 1)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{c.location || "—"}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{c.cubeSize ?? 150}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(c.maxLoad)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(c.area, 0)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center">{fmt(c.cubeStrength)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-center font-bold">{fmt(c.correctedStrength)}</td>
              <td className={`border border-gray-300 px-1.5 py-1 text-center font-bold ${c.result === "pass" ? "text-green-700" : "text-red-600"}`}>
                {c.result === "pass" ? (isAr ? "مطابق" : "PASS") : c.result === "fail" ? (isAr ? "غير مطابق" : "FAIL") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {avgStrength != null && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
            <p className="text-green-600 font-semibold">{isAr ? "متوسط القوة المصححة" : "Avg. Corrected Strength"}</p>
            <p className="font-bold text-green-800 text-lg">{fmt(avgStrength)} N/mm²</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <p className="text-amber-600 font-semibold">{isAr ? "القوة المطلوبة" : "Required Strength"}</p>
            <p className="font-bold text-amber-800 text-lg">{requiredAtAge ?? "—"} N/mm²</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
            <p className="text-gray-600 font-semibold">{isAr ? "عدد المكعبات" : "No. of Cubes"}</p>
            <p className="font-bold text-gray-800 text-lg">{cubes.filter((c: any) => c.correctedStrength).length}</p>
          </div>
        </div>
      )}
    </>
  );
}

function renderFormData(formTemplate: string, formData: any, isAr: boolean, castingDateMs?: number | null) {
  switch (formTemplate) {
    case "concrete_cubes": return renderConcreteCubes(formData, isAr);
    case "concrete_blocks":
      try {
        return renderConcreteBlocks(formData, isAr);
      } catch {
        return (
          <div className="text-xs border border-red-200 bg-red-50 rounded p-3 text-red-700">
            Report data could not be rendered. Please re-submit the test results.
          </div>
        );
      }
    case "concrete_cores": return renderConcreteCore(formData, isAr, castingDateMs);
    case "concrete_beam": return renderConcreteBeam(formData, isAr, castingDateMs);
    case "steel_rebar": return renderSteelRebar(formData, isAr);
    case "sieve_analysis": return renderSieveAnalysis(formData, isAr);
    case "soil_proctor": return renderSoilProctor(formData, isAr);
    case "asphalt_marshall": return renderAsphaltMarshall(formData, isAr);
    case "cement_setting_time": return renderCementSettingTime(formData, isAr);
    case "concrete_foam": return renderConcreteFoam(formData, isAr);
    case "interlock": return renderInterlock(formData, isAr);
    default: return renderGeneric(formData, isAr);
  }
}

// ─── Main Report Component ────────────────────────────────────────────────────
export default function SpecializedTestReport() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang, setLang } = useLanguage();
  const ar = lang === "ar";
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);
  const distId = parseInt(distributionId ?? "0");

  const { data: result, isLoading: specLoading } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  const { data: dist } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId }
  );

  // If this distribution belongs to a batch, fetch all batch distributions for consolidated report
  const batchDistId = (dist as any)?.batchDistributionId as string | undefined;
  const { data: batchDists } = trpc.distributions.getByBatch.useQuery(
    { batchDistributionId: batchDistId! },
    { enabled: !!batchDistId }
  );

  // Fetch legacy testResult for reviewer signatures (and legacy-only printable report)
  const { data: legacyResult, isLoading: legacyLoading } = trpc.testResults.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  const pageLoading = specLoading || legacyLoading;

  // Routed Manager Review opens /test-report for concrete; send users to the concrete printable report.
  useEffect(() => {
    if (!distId || result) return;
    const src = (legacyResult?.chartsData as { source?: string } | undefined)?.source;
    if (src === "concrete_cubes") {
      window.location.replace(`/concrete-report/${distId}`);
    }
  }, [distId, result, legacyResult]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      window.history.back();
    }
  };

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isDownloadLoading, setIsDownloadLoading] = useState(false);

  const handlePrint = async () => {
    if (!printRef.current) return window.print();
    setIsPdfLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `specialized-report-${distId}`,
      mode: "print",
    });
    if (!ok) window.print();
    setIsPdfLoading(false);
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsDownloadLoading(true);
    const { generatePdfFromElement } = await import("@/lib/pdf");
    const ok = await generatePdfFromElement(printRef.current, {
      filename: `specialized-report-${distId}`,
      mode: "download",
    });
    if (!ok) window.print();
    setIsDownloadLoading(false);
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!result && legacyResult && (legacyResult.chartsData as { source?: string } | null)?.source === "concrete_cubes") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="animate-spin text-slate-400" size={32} />
        <p className="text-sm text-slate-500">{isAr ? "جاري فتح تقرير الخرسانة…" : "Opening concrete report…"}</p>
      </div>
    );
  }

  if (!result && !legacyResult) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <XCircle className="text-red-400" size={40} />
        <p className="text-slate-600 font-medium">
          {isAr ? "لا توجد نتائج لهذا التوزيع" : "No test results found for this distribution."}
        </p>
        <Button variant="outline" onClick={handleClose}>
          {isAr ? "إغلاق" : "Close"}
        </Button>
      </div>
    );
  }

  // Legacy numeric test_results only (no specialized_test_results row)
  if (!result && legacyResult) {
    const lr = legacyResult as {
      average?: string | null;
      unit?: string | null;
      complianceStatus?: string | null;
      chartsData?: { values?: number[]; labels?: string[] } | null;
      testNotes?: string | null;
    };
    const cd = (lr.chartsData ?? {}) as { values?: number[]; labels?: string[] };
    const vals = Array.isArray(cd.values) ? cd.values : [];
    const labels = Array.isArray(cd.labels) ? cd.labels : vals.map((_, i) => `${isAr ? "قراءة" : "R"}${i + 1}`);
    const testNameDisplay = isAr
      ? ((dist as any)?.testNameAr ?? dist?.testName ?? "—")
      : ((dist as any)?.testNameEn ?? dist?.testName ?? "—");
    const passed = lr.complianceStatus === "pass";
    return (
      <>
        <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
          <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
            <X className="w-4 h-4" /> {isAr ? "إغلاق" : "Close"}
          </Button>
          <span className="text-sm font-medium">
            {isAr ? "تقرير الاختبار (نتيجة مسجلة)" : "Test Report (legacy)"} — {testNameDisplay}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
              onClick={() => setLang(isAr ? "en" : "ar")}
            >
              <Globe className="w-3.5 h-3.5" />
              {isAr ? "English" : "العربية"}
            </Button>
            <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
              {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isAr ? "تحميل PDF" : "Download PDF"}
            </Button>
            <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
              {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {isAr ? "طباعة / حفظ PDF" : "Print / Save PDF"}
            </Button>
          </div>
        </div>
        <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
          <div
            ref={printRef}
            className="mx-auto bg-white shadow-lg print:shadow-none"
            style={{ width: "210mm", minHeight: "297mm", padding: "15mm", fontFamily: "Arial, sans-serif", fontSize: "10px" }}
          >
            <div className="border-b-2 border-gray-900 pb-2 mb-4">
              <h1 className="text-[15px] font-extrabold">{isAr ? "تقرير نتائج الاختبار" : "Test results report"}</h1>
              <p className="text-[10px] text-gray-600 mt-1">
                {(dist as any)?.sampleCode && (
                  <span className="font-mono me-3">{isAr ? "العينة:" : "Sample:"} {(dist as any).sampleCode}</span>
                )}
                {dist?.distributionCode && (
                  <span className="font-mono">{isAr ? "التوزيع:" : "Distribution:"} {dist.distributionCode}</span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
              <div className="border border-gray-200 rounded p-2">
                <span className="text-gray-500">{isAr ? "المتوسط" : "Average"}</span>
                <p className="font-bold text-lg">{lr.average ?? "—"} {lr.unit ?? ""}</p>
              </div>
              <div className="border border-gray-200 rounded p-2">
                <span className="text-gray-500">{isAr ? "الامتثال" : "Compliance"}</span>
                <p className={`font-bold ${passed ? "text-green-700" : "text-red-700"}`}>
                  {lr.complianceStatus ?? "—"}
                </p>
              </div>
            </div>
            {vals.length > 0 && (
              <table className="w-full text-[10px] border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1">#</th>
                    {labels.map((lab, i) => (
                      <th key={i} className="border border-gray-300 px-2 py-1">{lab}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-2 py-1 font-medium">{isAr ? "قيمة" : "Value"}</td>
                    {vals.map((v, i) => (
                      <td key={i} className="border border-gray-300 px-2 py-1 text-center">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
            {lr.testNotes && (
              <p className="mt-4 text-[10px] text-gray-700 whitespace-pre-wrap border-t pt-2">{lr.testNotes}</p>
            )}
          </div>
        </div>
      </>
    );
  }

  const formData = result.formData as any ?? {};
  const summaryValues = result.summaryValues as any ?? {};
  const isPassed = result.overallResult === "pass";
  const testNameDisplay = isAr
    ? ((dist as any)?.testNameAr ?? dist?.testName ?? result.testTypeCode)
    : ((dist as any)?.testNameEn ?? dist?.testName ?? result.testTypeCode);

  return (
    <>
      {/* Print Controls — hidden when printing */}
      <div className="print:hidden bg-slate-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-10" dir={isAr ? "rtl" : "ltr"}>
        <Button variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-2" onClick={handleClose}>
          <X className="w-4 h-4" /> {isAr ? "إغلاق" : "Close"}
        </Button>
        <span className="text-sm font-medium">
          {isAr ? "تقرير الاختبار" : "Test Report"} — {testNameDisplay}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-white hover:bg-slate-700 gap-1.5 text-xs"
            onClick={() => setLang(isAr ? "en" : "ar")}
          >
            <Globe className="w-3.5 h-3.5" />
            {isAr ? "English" : "العربية"}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloadLoading} variant="ghost" className="text-white hover:text-white hover:bg-slate-700 gap-1.5">
            {isDownloadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isAr ? "تحميل PDF" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} disabled={isPdfLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {isAr ? "طباعة / حفظ PDF" : "Print / Save PDF"}
          </Button>
        </div>
      </div>

      {/* Report Page */}
      <div className="bg-gray-200 print:bg-white min-h-screen py-6 print:py-0" dir={isAr ? "rtl" : "ltr"}>
        <div
          ref={printRef}
          className="mx-auto bg-white shadow-lg print:shadow-none"
          style={{ width: "210mm", minHeight: "297mm", padding: "15mm 15mm 20mm 15mm", fontFamily: "Arial, sans-serif", fontSize: "10px" }}
        >
          {/* Header */}
          <div className="mb-5">
            <div className="border-t-4 border-gray-900 pt-3 flex justify-between items-center">
              <div>
                <h1 className="text-[16px] font-extrabold text-gray-900 leading-snug">
                  {isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction Materials & Engineering Laboratory"}
                </h1>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isAr ? "Construction Materials & Engineering Laboratory" : "مختبر الإنشاءات والمواد الهندسية"}
                </p>
              </div>
              <div className="flex flex-col items-center px-4 border-x border-gray-300">
                <div className="w-11 h-11 rounded-full border-2 border-gray-800 flex items-center justify-center text-lg font-black">م</div>
                <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
              </div>
              <div className="text-[11px] text-gray-600 space-y-0.5">
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? ":رقم الوثيقة" : "Doc No.:"}</span>
                  <span className="font-mono font-bold text-gray-800">{result.contractNo ?? `RPT-${String(distId).padStart(6, "0")}`}</span>
                </div>
                <div className="flex gap-1">
                  <span className="text-gray-500">{isAr ? ":التاريخ" : "Date:"}</span>
                  <span>{new Date().toLocaleDateString(isAr ? "ar-AE" : "en-GB")}</span>
                </div>
              </div>
            </div>
            {/* Document title bar */}
            <div className="bg-gray-900 text-white text-center py-2 mt-3 mb-4">
              <p className="text-[14px] font-bold">
                {isAr ? "تقرير نتيجة الفحص" : "Laboratory Test Report"}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5 tracking-wider uppercase">
                {isAr ? "Laboratory Test Report" : "تقرير نتيجة الفحص"}
              </p>
            </div>
            {/* Pass/Fail badge */}
            <div className={`flex ${isAr ? "justify-start" : "justify-end"}`}>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${isPassed ? "bg-green-100 text-green-800 border border-green-300" : "bg-red-100 text-red-800 border border-red-300"}`}>
                {isPassed ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {isPassed
                  ? (isAr ? "مطابق — PASS" : "PASS — مطابق")
                  : (isAr ? "غير مطابق — FAIL" : "FAIL — غير مطابق")}
              </div>
            </div>
          </div>

          {/* Sample Info */}
          <div className="border border-gray-200 rounded mb-5">
            {/* Reference numbers bar */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 grid grid-cols-3 gap-4 text-xs">
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isAr ? "رقم العينة" : "Sample No."}</span>
                <span className="font-mono font-bold text-gray-900 text-sm">{(dist as any)?.sampleCode ?? "—"}</span>
              </div>
              <div className="flex flex-col items-center border-x border-gray-200">
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isAr ? "رقم التوزيع" : "Distribution No."}</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{(dist as any)?.distributionCode ?? `DIST-${String(distId).padStart(6,'0')}`}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">{isAr ? "تاريخ الاستلام" : "Received Date"}</span>
                <span className="font-semibold text-gray-900">{fmtDate((dist as any)?.receivedAt, lang)}</span>
              </div>
            </div>
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 p-4 text-xs">
              <div className="space-y-2">
                <InfoRow label={isAr ? "نوع الفحص" : "Test Type"} value={testNameDisplay} />
                <InfoRow label={isAr ? "المعيار" : "Standard"} value={(dist as any)?.standardRef ?? "—"} />
                <InfoRow label={isAr ? "المقاول" : "Contractor"} value={(dist as any)?.contractorName ?? result.contractorName ?? "—"} />
                <InfoRow label={isAr ? "رقم العقد" : "Contract No."} value={(dist as any)?.contractNumber ?? result.contractNo ?? "—"} />
              </div>
              <div className="space-y-2">
                <InfoRow label={isAr ? "اسم المشروع" : "Project Name"} value={(dist as any)?.contractName ?? result.projectName ?? "—"} />
                <InfoRow label={isAr ? "القطاع" : "Sector"} value={(dist as any)?.sector ? ((dist as any).sector as string).replace("_", " ").toUpperCase() : "—"} />
                <InfoRow label={isAr ? "موقع العينة" : "Sample Location"} value={(dist as any)?.sampleLocation ?? "—"} />
                <InfoRow label={isAr ? "تاريخ الفحص" : "Test Date"} value={fmtDate(result.testDate, lang)} />
                <InfoRow label={isAr ? "تاريخ التقرير" : "Report Date"} value={fmtDate(new Date(), lang)} />
              </div>
            </div>
          </div>

          {/* Summary Values */}
          {summaryValues && Object.keys(summaryValues).length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-3">
                {isAr ? "ملخص النتائج" : "Summary Results"}
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(summaryValues).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
                    <p className="text-gray-500 text-xs mb-0.5 capitalize">{k.replace(/_/g, " ")}</p>
                    <p className="font-bold text-gray-900 text-sm">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Results — Batch (multiple types) or Single */}
          {batchDists && batchDists.length > 1 ? (
            <BatchResultsSection batchDists={batchDists} distId={distId} isAr={isAr} />
          ) : (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-3">
                {isAr ? "النتائج التفصيلية" : "Detailed Results"}
              </h3>
              {renderFormData(result.formTemplate, formData, isAr, dist?.castingDate ? new Date(dist.castingDate).getTime() : null)}
            </div>
          )}

          {/* Notes */}
          {result.notes && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-2">
                {isAr ? "ملاحظات" : "Notes"}
              </h3>
              <p className="text-xs text-gray-700 bg-gray-50 border rounded p-3">{result.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="mt-8 pt-4 border-t border-gray-300">
            <div className="grid grid-cols-3 gap-6 text-xs">
              <SignatureBox label={isAr ? "الفاحص" : "Tested By"} name={result.testedBy} />
              <SignatureBox
                label={isAr ? "المراجع" : "Reviewed By"}
                name={legacyResult?.managerReviewedByName ?? undefined}
                date={legacyResult?.managerReviewedAt ? fmtDate(legacyResult.managerReviewedAt, lang) : undefined}
              />
              <SignatureBox
                label={isAr ? "المعتمد" : "Approved By"}
                name={legacyResult?.qcReviewedByName ?? undefined}
                date={legacyResult?.qcReviewedAt ? fmtDate(legacyResult.qcReviewedAt, lang) : undefined}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-3 border-t border-gray-200 flex justify-between text-gray-400" style={{ fontSize: "8px" }}>
            <span>Construction Materials &amp; Engineering Laboratory — مختبر الإنشاءات والمواد الهندسية</span>
            <span>{isAr ? "تاريخ الإنشاء:" : "Generated:"} {new Date().toLocaleString(isAr ? "ar-AE" : "en-GB")}</span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
        }
      `}</style>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 min-w-[130px] shrink-0">{label}:</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function SignatureBox({ label, name, date }: { label: string; name?: string | null; date?: string }) {
  return (
    <div className="text-center">
      <div className="border-b border-gray-400 mb-1 h-10 flex items-end justify-center pb-1">
        {name && <span className="text-gray-700 text-xs font-semibold">{name}</span>}
      </div>
      <p className="text-gray-500">{label}</p>
      {date && <p className="text-gray-400 text-[9px] mt-0.5">{date}</p>}
    </div>
  );
}

// ─── BatchResultsSection ─────────────────────────────────────────────────────
// Renders a consolidated report split by test type for batch distributions
function BatchResultsSection({
  batchDists,
  distId,
  isAr,
}: {
  batchDists: any[];
  distId: number;
  isAr: boolean;
}) {
  const batchId = batchDists[0]?.batchDistributionId as string | undefined;
  const { data: batchResults } = trpc.specializedTests.getByBatch.useQuery(
    { batchId: batchId ?? "" },
    { enabled: !!batchId }
  );

  const resultByDistributionId = new Map<number, any>();
  for (const row of batchResults ?? []) {
    const tests = (row as any)?.testResults ?? [];
    for (const tr of tests) {
      if (typeof tr?.distributionId === "number") {
        resultByDistributionId.set(tr.distributionId, tr);
      }
    }
  }

  return (
    <div className="mb-5 space-y-6">
      <h3 className="text-xs font-bold text-gray-700 uppercase border-b border-gray-300 pb-1 mb-3">
        {isAr ? "النتائج التفصيلية — دفعة متعددة الأنواع" : "Detailed Results — Multi-Type Batch"}
      </h3>
      {batchDists.map((dist, idx) => {
        const result = resultByDistributionId.get(dist.id);
        const testLabel = isAr
          ? (dist.testNameAr ?? dist.testName ?? dist.testType)
          : (dist.testNameEn ?? dist.testName ?? dist.testType);
        const fd = (result?.formData as any) ?? {};
        const template = result?.formTemplate ?? dist.testType;
        return (
          <div key={dist.id} className="border border-gray-300 rounded-lg overflow-hidden">
            {/* Sub-report header */}
            <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-b border-gray-300">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-800 uppercase">
                  {isAr ? `النوع ${idx + 1}:` : `Type ${idx + 1}:`} {testLabel}
                </span>
                <span className="text-xs text-gray-500 font-mono">{dist.distributionCode}</span>
              </div>
              {result && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    result.overallResult === "pass"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {result.overallResult === "pass"
                    ? (isAr ? "✅ مطابق" : "✅ Pass")
                    : (isAr ? "❌ غير مطابق" : "❌ Fail")}
                </span>
              )}
            </div>
            <div className="p-3">
              {result ? (
                renderFormData(template, fd, isAr)
              ) : (
                <p className="text-xs text-gray-400 italic py-2">
                  {isAr ? "لا توجد نتائج بعد لهذا النوع" : "No results yet for this type"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
