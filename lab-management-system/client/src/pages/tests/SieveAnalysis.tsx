import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
import { Send, FlaskConical, Info, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

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

  const mixTotal = (whiteUsedPct ?? 0) + (blackUsedPct ?? 0);
  const mixOk = whiteUsedPct != null && blackUsedPct != null && Math.abs(mixTotal - 100) < 0.001;

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

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
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

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        // Full navigation so we always leave /test/:id and load the printable report (wouter SPA alone can stay on the form in some cases).
        window.location.assign(`/test-report/${distId}`);
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

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted") {
      if (!validateBlend()) return;
      if (!passesBlendSpec) {
        toast.error(
          ar ? "الخليط خارج حدود المواصفة في منخل واحد على الأقل" : "Blend fails specification at one or more sieves",
        );
        return;
      }
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

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: "Aggregate type / نوع الركام", value: dist?.testSubType }]}
        />

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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
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
                    className="mt-2 font-mono"
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
                    className="mt-2 font-mono"
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
                        <td className="border border-slate-300 px-1 py-1 bg-green-50">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.whitePassPct ?? ""}
                            onChange={e => updateRow(idx, "whitePassPct", e.target.value)}
                            className="h-8 w-20 text-center font-mono mx-auto text-sm"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-mono font-medium">
                          {whiteUsedPct ?? "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 bg-green-50">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.blackPassPct ?? ""}
                            onChange={e => updateRow(idx, "blackPassPct", e.target.value)}
                            className="h-8 w-20 text-center font-mono mx-auto text-sm"
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {ar ? "منحنى التدرج" : "Grading Curve / منحنى التدرج"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blendAnyData ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 8, right: 24, left: 16, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="sieveLog"
                    scale="log"
                    domain={[0.05, 10]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => formatDisplaySieveMm(Number(v))}
                    label={{
                      value: ar ? "مقاس المنخل (مم)" : "Sieve Size (mm) / مقاس المنخل",
                      position: "insideBottom",
                      offset: -22,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    width={52}
                    label={{
                      value: ar ? "النسبة المارة %" : "% Passing / النسبة المارة",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11 },
                    }}
                  />
                  <Tooltip formatter={(v: number) => (v != null && Number.isFinite(v) ? `${Number(v).toFixed(1)}%` : "—")} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kLo}
                    stroke="#888888"
                    strokeDasharray="5 5"
                    dot={false}
                    strokeWidth={2}
                    name={chartKeys.kLo}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kUp}
                    stroke="#888888"
                    strokeDasharray="5 5"
                    dot={false}
                    strokeWidth={2}
                    name={chartKeys.kUp}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kWhite}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name={chartKeys.kWhite}
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kBlack}
                    stroke="#374151"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name={chartKeys.kBlack}
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kBlend}
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 5, fill: "#ef4444" }}
                    name={chartKeys.kBlend}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                <FlaskConical size={32} className="opacity-30" />
                <span className="ms-2">{ar ? "أدخل البيانات لعرض المنحنى" : "Enter data to plot the curve"}</span>
              </div>
            )}
          </CardContent>
        </Card>

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
                    ? "يُقارن الخليط المحسوب بحدود المواصفة لكل منخل. يجب أن يساوي مجموع نسب الاستخدام 100٪."
                    : "The calculated blend is checked against upper/lower spec limits per sieve. White + black used % must total 100%."}
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
