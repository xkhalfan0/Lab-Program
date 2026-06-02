import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge, ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, UserCheck, Printer, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { GradationCurveChart } from "@/components/GradationCurveChart";
import { sandBlendGradationLegendItems, extractedSieveLegendItems } from "@/components/GradationChartLegend";
import { LAB_NUMERIC_INPUT_MD, LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

// ─── Sand blend — sieve stacks (limits % passing) ───────────────────────────

export type BlendStandardKey = "ASTM_C144" | "BS_1199_A";

type SieveSpec = { mm: number; upper: number | null; lower: number | null };

/** ASTM C144 — masonry (manufactured) sand, % passing */
const ASTM_C144_SPECS: SieveSpec[] = [
  { mm: 6.3, upper: 100, lower: 100 },
  { mm: 4.75, upper: 100, lower: 100 },
  { mm: 2.36, upper: 100, lower: 95 },
  { mm: 1.18, upper: 100, lower: 70 },
  { mm: 0.6, upper: 75, lower: 40 },
  { mm: 0.3, upper: 40, lower: 20 },
  { mm: 0.15, upper: 25, lower: 10 },
  { mm: 0.075, upper: 10, lower: 0 },
];

/** BS 1199:76 Type A — plaster sand; 6.30 mm row has no limits and is omitted from the worksheet */
const BS_1199_TYPE_A_SPECS: SieveSpec[] = [
  { mm: 6.3, upper: null, lower: null },
  { mm: 5.0, upper: 100, lower: 95 },
  { mm: 2.36, upper: 100, lower: 60 },
  { mm: 1.18, upper: 100, lower: 30 },
  { mm: 0.6, upper: 80, lower: 15 },
  { mm: 0.3, upper: 50, lower: 5 },
  { mm: 0.15, upper: 15, lower: 0 },
  { mm: 0.075, upper: 5, lower: 0 },
];

export interface SieveRow {
  sieveMm: number;
  upperLimit: number;
  lowerLimit: number;
  whitePassPct: number | null;
  blackPassPct: number | null;
}

function sieveKey(mm: number): string {
  return String(Math.round(mm * 1000) / 1000);
}

export function initializeSieveRows(standard: BlendStandardKey): SieveRow[] {
  const sieves = standard === "ASTM_C144" ? ASTM_C144_SPECS : BS_1199_TYPE_A_SPECS;
  return sieves
    .filter(s => s.upper !== null && s.lower !== null)
    .map(s => ({
      sieveMm: s.mm,
      upperLimit: s.upper as number,
      lowerLimit: s.lower as number,
      whitePassPct: null,
      blackPassPct: null,
    }));
}

function parseFieldNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Final blend % passing = (White Used% × White Pass% + Black Used% × Black Pass%) ÷ 100.
 * Missing pass % is treated as 0 in the weighted sum (used % must both be set).
 */
export function calculateFinalBlend(
  whiteUsedPct: number | null,
  whitePassPct: number | null,
  blackUsedPct: number | null,
  blackPassPct: number | null,
): number | null {
  if (whiteUsedPct === null || blackUsedPct === null) return null;
  if (whitePassPct === null && blackPassPct === null) return null;
  const whitePart = whiteUsedPct * (whitePassPct ?? 0);
  const blackPart = blackUsedPct * (blackPassPct ?? 0);
  return (whitePart + blackPart) / 100;
}

/** @deprecated Prefer calculateFinalBlend — kept for older imports; standard arg ignored */
export function calculateTheBlend(
  _standard: BlendStandardKey,
  whiteUsedPct: number | null,
  whitePassPct: number | null,
  blackUsedPct: number | null,
  blackPassPct: number | null,
): number | null {
  return calculateFinalBlend(whiteUsedPct, whitePassPct, blackUsedPct, blackPassPct);
}

function mergeRowsFromSaved(standard: BlendStandardKey, saved: Array<Record<string, unknown>>): SieveRow[] {
  const template = initializeSieveRows(standard);
  const bySieve = new Map<string, Record<string, unknown>>();
  for (const r of saved) {
    const k = Number(r.sieveMm ?? r.sieve ?? NaN);
    if (Number.isFinite(k)) bySieve.set(sieveKey(k), r);
  }
  return template.map(row => {
    const s = bySieve.get(sieveKey(row.sieveMm));
    if (!s) return row;
    const ul = parseFieldNum(s.upperLimit);
    const ll = parseFieldNum(s.lowerLimit);
    const wp =
      parseFieldNum(s.whitePassPct) ??
      parseFieldNum(s.whiteSandOriginalPass) ??
      parseFieldNum(s.whiteSandOriginal);
    const bp =
      parseFieldNum(s.blackPassPct) ??
      parseFieldNum(s.blackSandOriginalPass) ??
      parseFieldNum(s.blackSandOriginal);
    return {
      ...row,
      upperLimit: ul ?? row.upperLimit,
      lowerLimit: ll ?? row.lowerLimit,
      whitePassPct: wp,
      blackPassPct: bp,
    };
  });
}

// ─── Standard (single-sample, by-weight) sieve analysis ─────────────────────
// Tech enters Total Weight + Retained weight per sieve; the form computes
// Ret% = retained / total × 100 and cumulative % passing (100 − Σ retained%).
// Matches the lab Excel worksheet (ASTM D422 / AASHTO M147 grading).

export interface WeightSieveRow {
  sieveMm: number;
  retained: string; // technician input (g)
  lower: number | null; // spec % passing
  upper: number | null;
}

type WeightBandDef = { label: string; rows: Array<{ mm: number; lower: number | null; upper: number | null }> };

export const WEIGHT_SIEVE_BANDS: Record<string, WeightBandDef> = {
  AASHTO_M147_B: {
    label: "AASHTO M147 — Table 1, Grading B",
    rows: [
      { mm: 50, lower: 100, upper: 100 },
      { mm: 37.5, lower: null, upper: null },
      { mm: 25, lower: 75, upper: 95 },
      { mm: 19.5, lower: null, upper: null },
      { mm: 9.5, lower: 40, upper: 75 },
      { mm: 4.75, lower: 30, upper: 60 },
      { mm: 2.0, lower: 20, upper: 45 },
      { mm: 0.425, lower: 15, upper: 30 },
      { mm: 0.075, lower: 5, upper: 20 },
    ],
  },
  CUSTOM: {
    label: "Custom (enter limits manually)",
    rows: [
      { mm: 50, lower: null, upper: null },
      { mm: 37.5, lower: null, upper: null },
      { mm: 25, lower: null, upper: null },
      { mm: 19.5, lower: null, upper: null },
      { mm: 9.5, lower: null, upper: null },
      { mm: 4.75, lower: null, upper: null },
      { mm: 2.0, lower: null, upper: null },
      { mm: 0.425, lower: null, upper: null },
      { mm: 0.075, lower: null, upper: null },
    ],
  },
};

export type WeightBandKey = keyof typeof WEIGHT_SIEVE_BANDS;

export function initWeightRows(band: WeightBandKey): WeightSieveRow[] {
  return WEIGHT_SIEVE_BANDS[band].rows.map(r => ({
    sieveMm: r.mm,
    retained: "",
    lower: r.lower,
    upper: r.upper,
  }));
}

export interface ComputedWeightRow extends WeightSieveRow {
  retainedNum: number | null;
  pctRetained: number | null;
  cumRetained: number | null;
  cumPassing: number | null;
  withinLimits: boolean | null;
}

const LIMIT_EPS = 0.05;

/** Compute Ret%, cumulative retained% and cumulative passing% per the Excel chain. */
export function computeWeightRows(totalWeight: number | null, rows: WeightSieveRow[]): ComputedWeightRow[] {
  const total = totalWeight != null && Number.isFinite(totalWeight) && totalWeight > 0 ? totalWeight : null;
  let cumRet = 0;
  return rows.map(r => {
    const n = r.retained.trim() === "" ? null : parseFloat(r.retained);
    const retainedNum = n != null && Number.isFinite(n) ? n : null;
    if (total == null) {
      return { ...r, retainedNum, pctRetained: null, cumRetained: null, cumPassing: null, withinLimits: null };
    }
    const pctRetained = ((retainedNum ?? 0) / total) * 100;
    cumRet += pctRetained;
    const cumPassing = 100 - cumRet;
    const withinLimits =
      r.lower != null && r.upper != null
        ? cumPassing >= r.lower - LIMIT_EPS && cumPassing <= r.upper + LIMIT_EPS
        : null;
    return { ...r, retainedNum, pctRetained, cumRetained: cumRet, cumPassing, withinLimits };
  });
}

/** Display sieve opening (mm) for worksheet / chart labels */
export function formatDisplaySieveMm(mm: number): string {
  if (Math.abs(mm - 6.3) < 0.02) return "6.3";
  if (Math.abs(mm - 4.75) < 0.001) return "4.75";
  if (Math.abs(mm - 5) < 0.001) return "5";
  if (mm >= 1) {
    const r = Math.round(mm * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
  }
  return mm.toFixed(3).replace(/\.?0+$/, "");
}

export default function SieveAnalysis() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const isMortarSandDist = dist?.testType === "CONC_MORTAR_SAND";
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [blendStandard, setBlendStandard] = useState<BlendStandardKey>("ASTM_C144");
  const [whiteUsedPct, setWhiteUsedPct] = useState<number | null>(null);
  const [blackUsedPct, setBlackUsedPct] = useState<number | null>(null);
  const [sieveRows, setSieveRows] = useState<SieveRow[]>(() => initializeSieveRows("ASTM_C144"));
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // ── Weight-based (standard) sieve analysis — used for soil/aggregate sieve ──
  // Mortar sand keeps the two-sand blend form; everything else is by-weight.
  const weightMode = !!dist && dist.testType !== "CONC_MORTAR_SAND";
  const [weightBand, setWeightBand] = useState<WeightBandKey>("AASHTO_M147_B");
  const [totalWeightStr, setTotalWeightStr] = useState("");
  const [weightRows, setWeightRows] = useState<WeightSieveRow[]>(() => initWeightRows("AASHTO_M147_B"));

  const mixTotal = (whiteUsedPct ?? 0) + (blackUsedPct ?? 0);
  const mixOk = whiteUsedPct != null && blackUsedPct != null && Math.abs(mixTotal - 100) < 0.001;

  const totalWeightNum = totalWeightStr.trim() === "" ? null : parseFloat(totalWeightStr);
  const computedWeightRows = useMemo(
    () => computeWeightRows(totalWeightNum, weightRows),
    [totalWeightNum, weightRows],
  );
  const retainedSum = weightRows.reduce((s, r) => {
    const n = parseFloat(r.retained);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const weightHasData =
    (totalWeightNum != null && totalWeightNum > 0) || weightRows.some(r => r.retained.trim() !== "");
  const weightTotalOk = totalWeightNum != null && Number.isFinite(totalWeightNum) && totalWeightNum > 0;
  const weightAnyRetained = weightRows.some(r => r.retained.trim() !== "");
  const weightSpecRows = computedWeightRows.filter(r => r.lower != null && r.upper != null);
  const weightWithinSpec =
    weightSpecRows.length > 0 && weightSpecRows.every(r => r.withinLimits === true);
  const weightSubmitReady = weightTotalOk && weightAnyRetained;
  const weightResult: "pass" | "fail" | "pending" = !weightHasData
    ? "pending"
    : !weightSubmitReady || weightSpecRows.length === 0
      ? "pending"
      : weightWithinSpec
        ? "pass"
        : "fail";

  const updateWeightRow = (idx: number, field: "retained" | "lower" | "upper", raw: string) => {
    setWeightRows(prev =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === "retained") return { ...row, retained: raw };
        const t = raw.trim();
        const n = t === "" ? null : parseFloat(t);
        return { ...row, [field]: n != null && Number.isFinite(n) ? n : null };
      }),
    );
  };

  const updateWeightSieveMm = (idx: number, raw: string) => {
    const n = parseFloat(raw);
    setWeightRows(prev => prev.map((row, i) => (i === idx ? { ...row, sieveMm: Number.isFinite(n) ? n : row.sieveMm } : row)));
  };

  const addWeightRow = () =>
    setWeightRows(prev => [...prev, { sieveMm: 0, retained: "", lower: null, upper: null }]);
  const removeWeightRow = (idx: number) => setWeightRows(prev => prev.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: "whitePassPct" | "blackPassPct", raw: string) => {
    const t = raw.trim();
    const n = t === "" ? null : parseFloat(t);
    const val = n !== null && Number.isFinite(n) ? n : null;
    setSieveRows(prev => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  };

  const setUsedPct = (which: "white" | "black", raw: string) => {
    const t = raw.trim();
    const n = t === "" ? null : parseFloat(t);
    const val = n !== null && Number.isFinite(n) ? n : null;
    if (which === "white") setWhiteUsedPct(val);
    else setBlackUsedPct(val);
  };

  useEffect(() => {
    if (!isMortarSandDist || hydrated || existing?.formData) return;
    if (dist?.testSubType === "masonry_sand") setBlendStandard("ASTM_C144");
    else if (dist?.testSubType === "plaster_sand") setBlendStandard("BS_1199_A");
  }, [isMortarSandDist, dist?.testSubType, hydrated, existing?.formData]);

  // Hydrate weight-based (standard) sieve analysis from a saved test.
  useEffect(() => {
    if (!weightMode || hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    const savedRows = Array.isArray(fd.rows)
      ? (fd.rows as Array<Record<string, unknown>>)
      : Array.isArray(fd.sieves)
        ? (fd.sieves as Array<Record<string, unknown>>)
        : [];
    const band =
      fd.weightBand === "CUSTOM" || fd.weightBand === "AASHTO_M147_B"
        ? (fd.weightBand as WeightBandKey)
        : "AASHTO_M147_B";
    setWeightBand(band);
    if (fd.totalWeight != null && fd.totalWeight !== "") setTotalWeightStr(String(fd.totalWeight));
    if (savedRows.length) {
      setWeightRows(
        savedRows.map(r => ({
          sieveMm: Number(r.sieveMm ?? r.sieve ?? r.size ?? 0),
          retained: r.massRetained != null ? String(r.massRetained) : r.retained != null ? String(r.retained) : "",
          lower: parseFieldNum(r.lower ?? r.lowerLimit),
          upper: parseFieldNum(r.upper ?? r.upperLimit),
        })),
      );
    } else {
      setWeightRows(initWeightRows(band));
    }
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [weightMode, existing, hydrated]);

  useEffect(() => {
    if (weightMode || hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    const std =
      fd.standard === "BS_1199_A" || fd.blendStandard === "BS_1199_A" ? "BS_1199_A" : "ASTM_C144";
    setBlendStandard(std);
    const savedRows = Array.isArray(fd.sieveData) ? (fd.sieveData as Array<Record<string, unknown>>) : [];
    if (fd.whiteUsedPct != null && fd.whiteUsedPct !== "") setWhiteUsedPct(parseFieldNum(fd.whiteUsedPct));
    else if (typeof fd.masonryWhiteSandUsedPct === "string" && fd.masonryWhiteSandUsedPct.trim() !== "") {
      setWhiteUsedPct(parseFieldNum(fd.masonryWhiteSandUsedPct));
    } else if (savedRows[0]?.whiteSandUsed != null && String(savedRows[0].whiteSandUsed).trim() !== "") {
      setWhiteUsedPct(parseFieldNum(savedRows[0].whiteSandUsed));
    }
    if (fd.blackUsedPct != null && fd.blackUsedPct !== "") setBlackUsedPct(parseFieldNum(fd.blackUsedPct));
    else if (savedRows[0]?.blackSandUsed != null && String(savedRows[0].blackSandUsed).trim() !== "") {
      setBlackUsedPct(parseFieldNum(savedRows[0].blackSandUsed));
    }
    if (savedRows.length) {
      setSieveRows(mergeRowsFromSaved(std, savedRows));
    } else {
      setSieveRows(initializeSieveRows(std));
    }
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [existing, hydrated]);

  const rowsWithBlend = useMemo(() => {
    return sieveRows.map(row => {
      const blend = calculateFinalBlend(whiteUsedPct, row.whitePassPct, blackUsedPct, row.blackPassPct);
      const bothPassEntered = row.whitePassPct !== null && row.blackPassPct !== null;
      const passes =
        mixOk &&
        blend !== null &&
        bothPassEntered &&
        blend >= row.lowerLimit &&
        blend <= row.upperLimit;
      return { ...row, finalBlend: blend, passes };
    });
  }, [sieveRows, whiteUsedPct, blackUsedPct, mixOk]);

  const allPassesFilled = sieveRows.every(r => r.whitePassPct !== null && r.blackPassPct !== null);
  const blendWithinSpec = rowsWithBlend.every(r => r.passes);
  const blendAnyData =
    whiteUsedPct != null ||
    blackUsedPct != null ||
    sieveRows.some(r => r.whitePassPct !== null || r.blackPassPct !== null);

  const overallResult: "pass" | "fail" | "pending" =
    !blendAnyData ? "pending" : !mixOk || !allPassesFilled ? "pending" : blendWithinSpec ? "pass" : "fail";

  const passesBlendSpec = mixOk && allPassesFilled && blendWithinSpec;
  /** Submit allowed whenever mix is 100% and all sieve pass% entered — failures must be reportable */
  const submitReady = mixOk && allPassesFilled;

  const chartKeys = useMemo(() => {
    const kWhite = ar ? "أبيض % مار" : "White Sand / الرمل الأبيض";
    const kBlack = ar ? "أسود % مار" : "Black Sand / الرمل الأسود";
    const kBlend = ar ? "الخليط النهائي %" : "Final Blend / الخلطة النهائية";
    const kUp = ar ? "الحد الأعلى" : "Upper Limit / الحد الأعلى";
    const kLo = ar ? "الحد الأدنى" : "Lower Limit / الحد الأدنى";
    return { kWhite, kBlack, kBlend, kUp, kLo };
  }, [ar]);

  const chartData = useMemo(() => {
    return rowsWithBlend.map(r => {
      const wp = r.whitePassPct ?? 0;
      const bp = r.blackPassPct ?? 0;
      const fb = r.finalBlend;
      return {
        sieveMm: formatDisplaySieveMm(r.sieveMm),
        sieveLog: Math.max(r.sieveMm, 0.01),
        [chartKeys.kWhite]: wp,
        [chartKeys.kBlack]: bp,
        [chartKeys.kBlend]: fb != null ? Number(fb.toFixed(2)) : null,
        [chartKeys.kUp]: r.upperLimit,
        [chartKeys.kLo]: r.lowerLimit,
      };
    });
  }, [rowsWithBlend, chartKeys]);

  const weightChartKeys = useMemo(() => {
    const kPass = ar ? "% المار" : "% Passing / النسبة المارة";
    const kUp = ar ? "الحد الأعلى" : "Upper Limit / الحد الأعلى";
    const kLo = ar ? "الحد الأدنى" : "Lower Limit / الحد الأدنى";
    return { kPass, kUp, kLo };
  }, [ar]);

  const weightChartData = useMemo(() => {
    return computedWeightRows.map(r => ({
      sieveMm: formatDisplaySieveMm(r.sieveMm),
      sieveLog: Math.max(r.sieveMm, 0.01),
      [weightChartKeys.kPass]: r.cumPassing != null ? Number(r.cumPassing.toFixed(1)) : null,
      [weightChartKeys.kUp]: r.upper,
      [weightChartKeys.kLo]: r.lower,
    }));
  }, [computedWeightRows, weightChartKeys]);

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        const fd = vars.formData as { passesSpec?: boolean } | undefined;
        const passed = fd?.passesSpec === true;
        toast.success(
          passed
            ? ar
              ? "تم الإرسال — مطابق للمواصفة"
              : "Submitted — PASSED specification"
            : ar
              ? "تم الإرسال — غير مطابق (تم التسجيل لمراجعة المقاول)"
              : "Submitted — FAILED specification (recorded for contractor review)",
        );
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const validateBlend = (): boolean => {
    if (!mixOk) {
      toast.error(ar ? "يجب أن يكون مجموع نسب الرمل الأبيض والأسود = 100٪" : "White Used % + Black Used % must equal 100%");
      return false;
    }
    if (!allPassesFilled) {
      toast.error(
        ar
          ? "أدخل نسبة المرور الأصلية للرمل الأبيض والأسود في كل منخل"
          : "Enter Original Grad Pass % for both White and Black sand at all sieves",
      );
      return false;
    }
    return true;
  };

  const handleSaveWeight = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && !weightSubmitReady) {
      toast.error(
        ar
          ? "أدخل الوزن الكلي والوزن المحتجز على المناخل"
          : "Enter Total Weight and the retained weight on the sieves",
      );
      return;
    }

    const rows = computedWeightRows.map(r => ({
      sieve: formatDisplaySieveMm(r.sieveMm),
      sieveMm: r.sieveMm,
      massRetained: r.retainedNum,
      pctRetained: r.pctRetained != null ? Number(r.pctRetained.toFixed(2)) : null,
      cumRetained: r.cumRetained != null ? Number(r.cumRetained.toFixed(2)) : null,
      cumPassing: r.cumPassing != null ? Number(r.cumPassing.toFixed(2)) : null,
      lower: r.lower,
      upper: r.upper,
      withinLimits: r.withinLimits,
    }));

    const passesSpec = weightSpecRows.length > 0 && weightWithinSpec;
    const overall = passesSpec ? "pass" : status === "submitted" ? "fail" : "pending";

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist.testType ?? "AGG_SIEVE",
        formTemplate: "sieve_analysis",
        formData: {
          testMode: "weight" as const,
          sieveStandard: null,
          weightBand,
          gradingType: weightBand === "AASHTO_M147_B" ? "AASHTO M147 — Grading B" : "Custom limits",
          totalWeight: totalWeightNum,
          retainedSum: Number(retainedSum.toFixed(2)),
          rows,
          passesSpec,
          overallResult: overall,
          source,
          testedBy: user?.name ?? undefined,
        },
        overallResult: overall,
        summaryValues: {
          totalWeight: totalWeightNum,
          weightBand,
          passesSpec,
          overallResult: overall,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (weightMode) return handleSaveWeight(status);
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted") {
      if (!validateBlend()) return;
    }

    const sieveData = rowsWithBlend.map(r => ({
      sieveMm: r.sieveMm,
      upperLimit: r.upperLimit,
      lowerLimit: r.lowerLimit,
      whitePassPct: r.whitePassPct,
      blackPassPct: r.blackPassPct,
      whiteUsedPct,
      blackUsedPct,
      finalBlend: r.finalBlend != null ? Number(r.finalBlend.toFixed(4)) : null,
      passes: r.passes,
    }));

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "AGG_SIEVE_FINE",
        formTemplate: "sieve_analysis",
        formData: {
          testMode: "blend" as const,
          standard: blendStandard,
          blendStandard,
          blendFormula: "WEIGHTED_PASS_V1",
          whiteUsedPct,
          blackUsedPct,
          sieveData,
          passesSpec: passesBlendSpec,
          overallResult: passesBlendSpec ? "pass" : status === "submitted" ? "fail" : "pending",
          source,
          testedBy: user?.name ?? undefined,
        },
        overallResult: passesBlendSpec ? "pass" : status === "submitted" ? "fail" : "pending",
        summaryValues: {
          standard: blendStandard,
          blendStandard,
          whiteUsedPct,
          blackUsedPct,
          passesSpec: passesBlendSpec,
          overallResult: passesBlendSpec ? "pass" : status === "submitted" ? "fail" : "pending",
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!distId || distId === 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center text-red-600">
            {lang === "ar" ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Wait for the distribution so we render the correct mode (weight vs blend).
  if (!dist) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto p-6">
          <div className="text-center text-slate-400 text-sm py-20">
            {ar ? "جاري التحميل..." : "Loading..."}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Standard weight-based sieve analysis (soil / aggregate) ───────────────
  if (weightMode) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
          <SampleInfoCard
            dist={dist}
            extraFields={[{ label: "Material / المادة", value: dist?.testSubType }]}
          />

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {ar ? "تحليل المناخل (بالوزن)" : "Sieve Analysis"}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {ar ? "تحليل منخلي لعينة واحدة — ASTM D422 / AASHTO" : "Single-sample particle-size analysis — ASTM D422 / AASHTO"}
              </p>
              <p className="text-slate-500 text-sm mt-2">
                {ar ? "التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {submitted ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                    {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 gap-1.5"
                    onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                  >
                    <Printer size={14} />
                    {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                    {ar ? "حفظ مسودة" : "Save Draft"}
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleSave("submitted")}
                    disabled={saving || !weightSubmitReady}
                  >
                    <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                    {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {ar ? "جدول المواصفة" : "Specification / Grading Band"}
                  </Label>
                  <Select
                    value={weightBand}
                    disabled={submitted}
                    onValueChange={v => {
                      const band = v as WeightBandKey;
                      setWeightBand(band);
                      // Re-apply the band's limits but keep any retained weights already typed.
                      setWeightRows(prev => {
                        const def = WEIGHT_SIEVE_BANDS[band].rows;
                        return prev.map(row => {
                          const match = def.find(d => Math.abs(d.mm - row.sieveMm) < 0.001);
                          return match ? { ...row, lower: match.lower, upper: match.upper } : row;
                        });
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(WEIGHT_SIEVE_BANDS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {ar ? "الوزن الكلي للعينة (g)" : "Total Sample Weight (g)"}
                  </Label>
                  <Input
                    type="number"
                    value={totalWeightStr}
                    onChange={e => setTotalWeightStr(e.target.value)}
                    placeholder={ar ? "مثال: 6112" : "e.g. 6112"}
                    className={`font-mono ${LAB_NUMERIC_INPUT_MD}`}
                    disabled={submitted}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                  <Input value={source} onChange={e => setSource(e.target.value)} disabled={submitted} placeholder="—" />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
                    <UserCheck size={14} className="text-green-600 shrink-0" />
                    <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  {ar ? "مجموع المحتجز:" : "Σ Retained:"} <strong className="font-mono">{retainedSum.toFixed(1)} g</strong>
                </span>
                {weightTotalOk && (
                  <span>
                    {ar ? "المار من المنخل الأخير (الوعاء):" : "Passing finest (pan):"}{" "}
                    <strong className="font-mono">{Math.max(totalWeightNum! - retainedSum, 0).toFixed(1)} g</strong>
                  </span>
                )}
                <span className="text-blue-600">
                  {ar
                    ? "الوزن المحتجز يُدخل بواسطة الفني، والنسب تُحسب تلقائياً."
                    : "Retained weights are technician inputs; percentages are auto-calculated."}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {ar ? "بيانات التحليل المنخلي" : "Sieve Analysis Data"}
              </CardTitle>
              {!submitted && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={addWeightRow}>
                  <Plus size={14} /> {ar ? "إضافة منخل" : "Add Sieve"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-xs min-w-[820px]">
                  <thead>
                    <tr className="bg-slate-100 text-[11px]">
                      <th className="border border-slate-300 px-2 py-2">{ar ? "مقاس المنخل (مم)" : "Sieve Size (mm)"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-green-50">{ar ? "الوزن المحتجز (g)" : "Retained Weight (g)"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-yellow-50">{ar ? "% محتجز" : "Retained %"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-yellow-50">{ar ? "% محتجز تراكمي" : "Cum. Retained %"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-yellow-100">{ar ? "% المار" : "Passing %"}</th>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "حد أدنى" : "Lower"}</th>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "حد أعلى" : "Upper"}</th>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "النتيجة" : "Result"}</th>
                      {!submitted && <th className="border border-slate-300 px-1 py-2 w-8"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {computedWeightRows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="border border-slate-300 px-1 py-1 text-center">
                          <Input
                            type="number"
                            value={r.sieveMm || ""}
                            onChange={e => updateWeightSieveMm(idx, e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} w-20 font-mono font-bold mx-auto text-center`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1 bg-green-50/50">
                          <Input
                            type="number"
                            value={r.retained}
                            onChange={e => updateWeightRow(idx, "retained", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} w-24 font-mono mx-auto`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-yellow-50/60 font-mono">
                          {r.pctRetained != null ? r.pctRetained.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-yellow-50/60 font-mono">
                          {r.cumRetained != null ? r.cumRetained.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-yellow-100/70 font-mono font-bold text-sm">
                          {r.cumPassing != null ? r.cumPassing.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center">
                          <Input
                            type="number"
                            value={r.lower ?? ""}
                            onChange={e => updateWeightRow(idx, "lower", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} w-16 font-mono mx-auto text-center`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center">
                          <Input
                            type="number"
                            value={r.upper ?? ""}
                            onChange={e => updateWeightRow(idx, "upper", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} w-16 font-mono mx-auto text-center`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {r.withinLimits === true ? (
                            <span className="text-emerald-600 font-bold text-lg">✓</span>
                          ) : r.withinLimits === false ? (
                            <span className="text-red-600 font-bold text-lg">✗</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        {!submitted && (
                          <td className="border border-slate-300 px-1 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeWeightRow(idx)}
                              className="text-slate-400 hover:text-red-600"
                              title={ar ? "حذف" : "Remove"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-600 mt-2 p-2 bg-blue-50 rounded-md border border-blue-100 space-y-0.5">
                <p><strong>{ar ? "% محتجز" : "Retained %"}</strong> = {ar ? "الوزن المحتجز ÷ الوزن الكلي × 100" : "Retained Weight ÷ Total Weight × 100"}</p>
                <p><strong>{ar ? "% المار" : "Passing %"}</strong> = {ar ? "100 − (مجموع % المحتجز التراكمي)" : "100 − (cumulative Retained %)"}</p>
              </div>
            </CardContent>
          </Card>

          <GradationCurveChart
            title={ar ? "منحنى التدرج" : "Grading Curve / منحنى التدرج"}
            data={weightChartData}
            show={weightAnyRetained && weightTotalOk}
            legendItems={extractedSieveLegendItems(ar)}
            xDataKey="sieveLog"
            xAxisOptions={{ logScale: true }}
            xTickFormatter={(v) => formatDisplaySieveMm(Number(v))}
            ar={ar}
            tooltipLabels={{
              [weightChartKeys.kPass]: weightChartKeys.kPass,
              [weightChartKeys.kUp]: weightChartKeys.kUp,
              [weightChartKeys.kLo]: weightChartKeys.kLo,
            }}
            lines={[
              { dataKey: weightChartKeys.kPass, variant: "primary", connectNulls: true },
              {
                dataKey: weightChartKeys.kUp,
                variant: "custom",
                stroke: "#ef4444",
                strokeWidth: 2,
                strokeDasharray: "5 5",
                connectNulls: true,
              },
              {
                dataKey: weightChartKeys.kLo,
                variant: "custom",
                stroke: "#ef4444",
                strokeWidth: 2,
                strokeDasharray: "5 5",
                connectNulls: true,
              },
            ]}
            emptyContent={
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                <FlaskConical size={32} className="opacity-30" />
                <span className="ms-2">{ar ? "أدخل البيانات لعرض المنحنى" : "Enter data to plot the curve"}</span>
              </div>
            }
          />

          {weightHasData && (
            <ResultBanner
              result={weightResult}
              testName={ar ? "تحليل المناخل" : "Sieve Analysis"}
              standard={weightBand === "AASHTO_M147_B" ? "AASHTO M147 — Grading B" : "Custom limits"}
            />
          )}

          {weightSubmitReady && weightSpecRows.length > 0 && (
            <div className="flex items-center gap-2">
              <PassFailBadge result={weightWithinSpec ? "pass" : "fail"} lang={lang} />
            </div>
          )}

          <Card>
            <CardContent className="pt-4">
              <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: "Aggregate type / نوع الركام", value: dist?.testSubType }]}
        />

        {!submitted && submitReady && (
          <div
            className={`p-3 rounded-lg border ${
              passesBlendSpec
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-amber-50 border-amber-300 text-amber-950"
            }`}
          >
            <div className={`flex items-start gap-2 text-sm ${ar ? "flex-row-reverse" : ""}`}>
              <span className="text-xl shrink-0 leading-none">{passesBlendSpec ? "✓" : "ℹ"}</span>
              <span className="font-medium leading-snug">
                {passesBlendSpec
                  ? ar
                    ? "الخليط يطابق المواصفة — جاهز للإرسال."
                    : "Blend meets specification — Ready to submit."
                  : ar
                    ? "الخليط لا يطابق المواصفة في منخل واحد على الأقل — يمكنك الإرسال لتسجيل النتيجة لمراجعة المقاول."
                    : "Blend fails specification at one or more sieves — You can still submit for contractor review."}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="mb-0 md:mb-0">
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل المناخل — تصميم خليط الرمل" : "Sieve Analysis - Sand Blend Design"}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {ar ? "اختبار خليط رملين — طريقة ASTM C136" : "Two-sand blend testing (ASTM C136 test method)"}
            </p>
            <p className="text-slate-500 text-sm mt-2">
              {ar ? "التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                >
                  <Printer size={14} />
                  {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleSave("submitted")}
                  disabled={saving || !submitReady}
                >
                  <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "جدول المواصفة" : "Specification Standard"}
                </Label>
                <Select
                  value={blendStandard}
                  disabled={submitted}
                  onValueChange={v => {
                    const std = v as BlendStandardKey;
                    setBlendStandard(std);
                    setSieveRows(initializeSieveRows(std));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ASTM_C144">
                      ASTM C 144 — Masonry Sand (Type: Manufactured Sand)
                    </SelectItem>
                    <SelectItem value="BS_1199_A">BS 1199:76 Type A — Plaster Sand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} disabled={submitted} placeholder="—" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">
                {ar ? "نسب خلط المواد" : "Material Blend Proportions / نسب خلط المواد"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-blue-300 rounded-md p-3 bg-white">
                  <Label className="font-medium text-blue-800 text-sm">
                    {ar ? "نسبة الرمل الأبيض %" : "White Sand Used % / نسبة الرمل الأبيض %"}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={whiteUsedPct ?? ""}
                    onChange={e => setUsedPct("white", e.target.value)}
                    placeholder="e.g. 60"
                    className={`mt-2 font-mono ${LAB_NUMERIC_INPUT_MD}`}
                    disabled={submitted}
                  />
                </div>
                <div className="border border-slate-300 rounded-md p-3 bg-white">
                  <Label className="font-medium text-slate-800 text-sm">
                    {ar ? "نسبة الرمل الأسود %" : "Black Sand Used % / نسبة الرمل الأسود %"}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={blackUsedPct ?? ""}
                    onChange={e => setUsedPct("black", e.target.value)}
                    placeholder="e.g. 40"
                    className={`mt-2 font-mono ${LAB_NUMERIC_INPUT_MD}`}
                    disabled={submitted}
                  />
                </div>
              </div>
              <div className="mt-3 p-2 rounded bg-white border border-slate-200 text-sm">
                <span className="font-medium text-slate-700">{ar ? "المجموع:" : "Total / المجموع:"} </span>
                <span className={mixOk ? "text-emerald-600 font-bold text-lg" : "text-red-600 font-bold text-lg"}>
                  {mixTotal.toFixed(1)}%
                </span>
                {!mixOk && (whiteUsedPct != null || blackUsedPct != null) && (
                  <span className="text-red-600 ms-2 text-sm">
                    {ar ? "⚠ يجب أن يساوي 100٪" : "⚠ Must equal 100% / يجب أن يساوي 100%"}
                  </span>
                )}
              </div>
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <p>
                  <strong>{ar ? "ملاحظة:" : "Note:"}</strong>{" "}
                  {ar
                    ? "الخلايا الخضراء = إدخال الفني. الخلايا الصفراء = حساب تلقائي."
                    : "Green cells = Technician inputs. Yellow cells = Auto-calculated."}
                </p>
                <p className="text-slate-500">
                  {ar
                    ? "Green cells = Technician inputs. Yellow cells = Auto-calculated."
                    : "الخلايا الخضراء = إدخال الفني. الخلايا الصفراء = حساب تلقائي."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {ar ? "بيانات التحليل المنخلي" : "Sieve Analysis Data / بيانات التحليل المنخلي"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-xs min-w-[920px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle text-[10px] leading-tight">
                      {ar ? "مقاس المنخل (مم)" : "Sieve Size / مقاس المنخل (mm)"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-50 align-middle text-[10px] leading-tight">
                      {ar ? "الحد الأدنى %" : "Spec Lower / الحد الأدنى %"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-50 align-middle text-[10px] leading-tight">
                      {ar ? "الحد الأعلى %" : "Spec Upper / الحد الأعلى %"}
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-2 py-2 bg-blue-100 text-center text-[11px]">
                      {ar ? "الرمل الأبيض" : "White Sand / الرمل الأبيض"}
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-200 text-center text-[11px]">
                      {ar ? "الرمل الأسود" : "Black Sand / الرمل الأسود"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-yellow-100 align-middle text-[10px] leading-tight">
                      {ar ? "الخلطة النهائية %" : "Final Blend / الخلطة النهائية %"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle text-[10px] leading-tight">
                      {ar ? "النتيجة" : "Result / النتيجة"}
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-[10px]">
                    <th className="border border-slate-300 px-1 py-1 bg-green-100 leading-tight">
                      {ar ? "نسبة المار" : "Original Pass % / نسبة المار"}
                    </th>
                    <th className="border border-slate-300 px-1 py-1 bg-blue-50 leading-tight">
                      {ar ? "المستخدم %" : "Used % / المستخدم"}
                    </th>
                    <th className="border border-slate-300 px-1 py-1 bg-green-100 leading-tight">
                      {ar ? "نسبة المار" : "Original Pass % / نسبة المار"}
                    </th>
                    <th className="border border-slate-300 px-1 py-1 bg-slate-100 leading-tight">
                      {ar ? "المستخدم %" : "Used % / المستخدم"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBlend.map((row, idx) => {
                    const blend = row.finalBlend;
                    const blendStr = blend !== null ? blend.toFixed(1) : "—";
                    return (
                      <tr key={row.sieveMm} className="hover:bg-slate-50/80">
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">
                          {formatDisplaySieveMm(row.sieveMm)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-50 font-mono">{row.lowerLimit}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-50 font-mono">{row.upperLimit}</td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.whitePassPct ?? ""}
                            onChange={e => updateRow(idx, "whitePassPct", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_MD} w-20 font-mono mx-auto`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-mono font-medium">
                          {whiteUsedPct ?? "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.blackPassPct ?? ""}
                            onChange={e => updateRow(idx, "blackPassPct", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_MD} w-20 font-mono mx-auto`}
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-100 font-mono font-medium">
                          {blackUsedPct ?? "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-bold bg-yellow-50 font-mono text-base">
                          {blendStr}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {blend !== null && row.whitePassPct !== null && row.blackPassPct !== null ? (
                            row.passes ? (
                              <span className="text-emerald-600 font-bold text-lg">✓</span>
                            ) : (
                              <span className="text-red-600 font-bold text-lg">✗</span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-600 mt-2 p-2 bg-blue-50 rounded-md border border-blue-100">
              <strong>{ar ? "الصيغة:" : "Formula / الصيغة:"}</strong>{" "}
              {ar
                ? "الخليط % = (مستخدم أبيض × مرور أبيض + مستخدم أسود × مرور أسود) ÷ 100"
                : "Final Blend % = (White Used% × White Pass% + Black Used% × Black Pass%) ÷ 100"}
            </div>
          </CardContent>
        </Card>

        <GradationCurveChart
          title={ar ? "منحنى التدرج" : "Grading Curve / منحنى التدرج"}
          data={chartData}
          show={blendAnyData}
          legendItems={sandBlendGradationLegendItems(ar, {
            blend: chartKeys.kBlend,
            white: chartKeys.kWhite,
            black: chartKeys.kBlack,
            upper: chartKeys.kUp,
            lower: chartKeys.kLo,
          })}
          xDataKey="sieveLog"
          xAxisOptions={{ logScale: true }}
          xTickFormatter={(v) => formatDisplaySieveMm(Number(v))}
          ar={ar}
          tooltipLabels={{
            [chartKeys.kBlend]: chartKeys.kBlend,
            [chartKeys.kWhite]: chartKeys.kWhite,
            [chartKeys.kBlack]: chartKeys.kBlack,
            [chartKeys.kUp]: chartKeys.kUp,
            [chartKeys.kLo]: chartKeys.kLo,
          }}
          lines={[
            { dataKey: chartKeys.kBlend, variant: "primary", connectNulls: true },
            {
              dataKey: chartKeys.kWhite,
              variant: "custom",
              stroke: "#3b82f6",
              strokeWidth: 2,
              dot: { r: 4, fill: "#3b82f6" },
            },
            {
              dataKey: chartKeys.kBlack,
              variant: "custom",
              stroke: "#374151",
              strokeWidth: 2,
              dot: { r: 4, fill: "#374151" },
            },
            {
              dataKey: chartKeys.kUp,
              variant: "custom",
              stroke: "#888888",
              strokeWidth: 2,
              strokeDasharray: "5 5",
              connectNulls: true,
            },
            {
              dataKey: chartKeys.kLo,
              variant: "custom",
              stroke: "#888888",
              strokeWidth: 2,
              strokeDasharray: "5 5",
              connectNulls: true,
            },
          ]}
          emptyContent={
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              <FlaskConical size={32} className="opacity-30" />
              <span className="ms-2">{ar ? "أدخل البيانات لعرض المنحنى" : "Enter data to plot the curve"}</span>
            </div>
          }
        />

        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">
                  {blendStandard === "ASTM_C144"
                    ? ar
                      ? "ASTM C 144 — رمل بناء (رمل مصنع)"
                      : "ASTM C 144 — Masonry Sand (Type: Manufactured Sand)"
                    : ar
                      ? "BS 1199:76 النوع أ — رمل لياسة"
                      : "BS 1199:76 Type A — Plaster Sand"}
                </p>
                <p>
                  {ar
                    ? "يُقارن الخليط المحسوب بحدود المواصفة لكل منخل. مجموع نسب الاستخدام يجب أن يساوي 100٪. يمكن إرسال النتائج حتى عند عدم المطابقة لتسجيلها للمقاول."
                    : "The blend is checked against spec limits per sieve; white + black used % must total 100%. You may submit even when out of spec so failures are recorded for contractor review."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {blendAnyData && (
          <ResultBanner
            result={overallResult}
            testName={ar ? "تحليل المناخل — خليط الرمل" : "Sieve Analysis — Sand Blend"}
            standard={blendStandard === "ASTM_C144" ? "ASTM C 144 (Manufactured Sand)" : "BS 1199:76 Type A"}
          />
        )}

        {mixOk && allPassesFilled && (
          <div className="flex items-center gap-2">
            <PassFailBadge result={passesBlendSpec ? "pass" : "fail"} lang={lang} />
          </div>
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
