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

const ASTM_C144_SIEVES = [
  { mm: 6.3, upper: 100, lower: 100 },
  { mm: 4.75, upper: 100, lower: 100 },
  { mm: 2.36, upper: 100, lower: 95 },
  { mm: 1.18, upper: 100, lower: 70 },
  { mm: 0.6, upper: 75, lower: 40 },
  { mm: 0.3, upper: 40, lower: 20 },
  { mm: 0.15, upper: 25, lower: 10 },
  { mm: 0.075, upper: 10, lower: 0 },
];

const BS_1199_TYPE_A_SIEVES = [
  { mm: 5.0, upper: 100, lower: 100 },
  { mm: 2.36, upper: 90, lower: 80 },
  { mm: 1.18, upper: 70, lower: 55 },
  { mm: 0.6, upper: 40, lower: 15 },
  { mm: 0.3, upper: 25, lower: 5 },
  { mm: 0.15, upper: 15, lower: 0 },
  { mm: 0.075, upper: 10, lower: 0 },
];

const SIEVE_STACK: Record<BlendStandardKey, { mm: number; upper: number; lower: number }[]> = {
  ASTM_C144: ASTM_C144_SIEVES,
  BS_1199_A: BS_1199_TYPE_A_SIEVES,
};

export interface SieveBlendRow {
  sieveMm: number;
  upperLimit: number;
  lowerLimit: number;
  whitePassPct: string;
  blackPassPct: string;
}

function emptyRows(standard: BlendStandardKey): SieveBlendRow[] {
  return SIEVE_STACK[standard].map(s => ({
    sieveMm: s.mm,
    upperLimit: s.upper,
    lowerLimit: s.lower,
    whitePassPct: "",
    blackPassPct: "",
  }));
}

function parsePct(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Final blend % passing = (White Used% × White Pass% + Black Used% × Black Pass%) ÷ 100
 * Same for ASTM C144 and BS 1199 Type A per lab worksheet.
 */
export function calculateTheBlend(
  _standard: BlendStandardKey,
  whiteUsedPct: number | null,
  whitePassPct: number | null,
  blackUsedPct: number | null,
  blackPassPct: number | null,
): number | null {
  if (
    whiteUsedPct === null ||
    blackUsedPct === null ||
    whitePassPct === null ||
    blackPassPct === null
  ) {
    return null;
  }
  const white = whiteUsedPct * whitePassPct;
  const black = blackUsedPct * blackPassPct;
  return (white + black) / 100;
}

function mergeRowsFromSaved(standard: BlendStandardKey, saved: Array<Record<string, unknown>>): SieveBlendRow[] {
  const template = emptyRows(standard);
  const bySieve = new Map<number, Record<string, unknown>>();
  for (const r of saved) {
    const k = Number(r.sieveMm ?? r.sieve ?? NaN);
    if (Number.isFinite(k)) bySieve.set(k, r);
  }
  return template.map(row => {
    const s = bySieve.get(row.sieveMm);
    if (!s) return row;
    const wp =
      s.whitePassPct != null && String(s.whitePassPct) !== ""
        ? String(s.whitePassPct)
        : s.whiteSandOriginalPass != null && String(s.whiteSandOriginalPass) !== ""
          ? String(s.whiteSandOriginalPass)
          : "";
    const bp =
      s.blackPassPct != null && String(s.blackPassPct) !== ""
        ? String(s.blackPassPct)
        : s.blackSandOriginalPass != null && String(s.blackSandOriginalPass) !== ""
          ? String(s.blackSandOriginalPass)
          : "";
    return { ...row, whitePassPct: wp, blackPassPct: bp };
  });
}

function formatSieveMm(mm: number): string {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(2).replace(/\.?0+$/, "");
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
  const [whiteUsedPctStr, setWhiteUsedPctStr] = useState("");
  const [blackUsedPctStr, setBlackUsedPctStr] = useState("");
  const [sieveRows, setSieveRows] = useState<SieveBlendRow[]>(() => emptyRows("ASTM_C144"));
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const whiteUsedPct = parsePct(whiteUsedPctStr);
  const blackUsedPct = parsePct(blackUsedPctStr);
  const mixTotal = (whiteUsedPct ?? 0) + (blackUsedPct ?? 0);
  const mixOk = whiteUsedPct != null && blackUsedPct != null && Math.abs(mixTotal - 100) < 0.001;

  const updateRow = (idx: number, field: "whitePassPct" | "blackPassPct", value: string) => {
    setSieveRows(prev => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  useEffect(() => {
    if (!isMortarSandDist || hydrated || existing?.formData) return;
    if (dist?.testSubType === "masonry_sand") setBlendStandard("ASTM_C144");
    else if (dist?.testSubType === "plaster_sand") setBlendStandard("BS_1199_A");
  }, [isMortarSandDist, dist?.testSubType, hydrated, existing?.formData]);

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    const std = fd.blendStandard === "BS_1199_A" ? "BS_1199_A" : "ASTM_C144";
    setBlendStandard(std);
    const savedRows = Array.isArray(fd.sieveData) ? (fd.sieveData as Array<Record<string, unknown>>) : [];
    if (fd.whiteUsedPct != null && fd.whiteUsedPct !== "") setWhiteUsedPctStr(String(fd.whiteUsedPct));
    else if (typeof fd.masonryWhiteSandUsedPct === "string" && fd.masonryWhiteSandUsedPct.trim() !== "") {
      setWhiteUsedPctStr(fd.masonryWhiteSandUsedPct);
    } else if (savedRows[0]?.whiteSandUsed != null && String(savedRows[0].whiteSandUsed).trim() !== "") {
      setWhiteUsedPctStr(String(savedRows[0].whiteSandUsed));
    }
    if (fd.blackUsedPct != null && fd.blackUsedPct !== "") setBlackUsedPctStr(String(fd.blackUsedPct));
    else if (savedRows[0]?.blackSandUsed != null && String(savedRows[0].blackSandUsed).trim() !== "") {
      setBlackUsedPctStr(String(savedRows[0].blackSandUsed));
    }
    if (savedRows.length) {
      setSieveRows(mergeRowsFromSaved(std, savedRows));
    } else {
      setSieveRows(emptyRows(std));
    }
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [existing, hydrated]);

  const rowsWithBlend = useMemo(() => {
    return sieveRows.map(row => {
      const blend = calculateTheBlend(
        blendStandard,
        whiteUsedPct,
        parsePct(row.whitePassPct),
        blackUsedPct,
        parsePct(row.blackPassPct),
      );
      const passes =
        blend !== null && blend >= row.lowerLimit && blend <= row.upperLimit;
      return { ...row, finalBlend: blend, passes };
    });
  }, [sieveRows, blendStandard, whiteUsedPct, blackUsedPct]);

  const allPassesFilled = sieveRows.every(
    r => parsePct(r.whitePassPct) !== null && parsePct(r.blackPassPct) !== null,
  );
  const blendWithinSpec = rowsWithBlend.every(r => r.passes);
  const blendAnyData =
    whiteUsedPctStr.trim() !== "" ||
    blackUsedPctStr.trim() !== "" ||
    sieveRows.some(r => r.whitePassPct.trim() !== "" || r.blackPassPct.trim() !== "");

  const overallResult: "pass" | "fail" | "pending" =
    !blendAnyData ? "pending" : !mixOk || !allPassesFilled ? "pending" : blendWithinSpec ? "pass" : "fail";

  const passesBlendSpec = mixOk && allPassesFilled && blendWithinSpec;

  const chartKeys = useMemo(() => {
    const kWhite = ar ? "أبيض % مار" : "White sand pass %";
    const kBlack = ar ? "أسود % مار" : "Black sand pass %";
    const kBlend = ar ? "الخليط النهائي %" : "Final blend %";
    const kUp = ar ? "حد أعلى" : "Upper limit";
    const kLo = ar ? "حد أدنى" : "Lower limit";
    return { kWhite, kBlack, kBlend, kUp, kLo };
  }, [ar]);

  const chartData = useMemo(() => {
    return rowsWithBlend.map(r => {
      const wp = parsePct(r.whitePassPct) ?? 0;
      const bp = parsePct(r.blackPassPct) ?? 0;
      const fb = r.finalBlend;
      return {
        sieveMm: formatSieveMm(r.sieveMm),
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
        setLocation("/technician");
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
      whitePassPct: parsePct(r.whitePassPct),
      blackPassPct: parsePct(r.blackPassPct),
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
          blendStandard,
          blendFormula: "WEIGHTED_PASS_V1",
          whiteUsedPct,
          blackUsedPct,
          sieveData,
          passesSpec: passesBlendSpec,
          overallResult: passesBlendSpec ? "pass" : status === "submitted" ? "fail" : "pending",
          source,
        },
        overallResult: passesBlendSpec ? "pass" : status === "submitted" ? "fail" : "pending",
        summaryValues: {
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
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / خليط الرمل" : "Aggregates / Sand blend"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل المناخل — تصميم خليط الرمل" : "Sieve Analysis — Sand Blend Design"}
            </h1>
            <p className="text-sm text-slate-600">
              {ar
                ? "ASTM C136 / BS 882 | اختبار خليط رملين — بناء أو لياسة"
                : "ASTM C136 / BS 882 | Two-sand blend testing for masonry or plaster sand"}
            </p>
            <p className="text-slate-500 text-sm mt-1">
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
                  {ar ? "جدول المواصفة" : "Specification table"}
                </Label>
                <Select
                  value={blendStandard}
                  disabled={submitted}
                  onValueChange={v => {
                    const std = v as BlendStandardKey;
                    setBlendStandard(std);
                    setSieveRows(emptyRows(std));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ASTM_C144">ASTM C 144 — Masonry Sand</SelectItem>
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
                {ar ? "نسب الخليط في المواد" : "Material Blend Proportions"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-blue-300 rounded-md p-3 bg-white">
                  <Label className="font-medium text-blue-800 text-sm">{ar ? "رمل أبيض — مستخدم %" : "White Sand Used %"}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={whiteUsedPctStr}
                    onChange={e => setWhiteUsedPctStr(e.target.value)}
                    placeholder="e.g. 60"
                    className="mt-2 font-mono"
                    disabled={submitted}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {ar ? "نسبة الرمل الأبيض في الخليط الكلي" : "Percentage of white sand in total mix"}
                  </p>
                </div>
                <div className="border border-slate-300 rounded-md p-3 bg-white">
                  <Label className="font-medium text-slate-800 text-sm">{ar ? "رمل أسود — مستخدم %" : "Black Sand Used %"}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={blackUsedPctStr}
                    onChange={e => setBlackUsedPctStr(e.target.value)}
                    placeholder="e.g. 40"
                    className="mt-2 font-mono"
                    disabled={submitted}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {ar ? "نسبة الرمل الأسود في الخليط الكلي" : "Percentage of black sand in total mix"}
                  </p>
                </div>
              </div>
              <div className="mt-3 text-sm">
                <span className="font-medium text-slate-700">{ar ? "المجموع:" : "Total:"} </span>
                <span className={mixOk ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {mixTotal.toFixed(1)}%
                </span>
                {!mixOk && (whiteUsedPctStr || blackUsedPctStr) && (
                  <span className="text-red-600 ms-2">{ar ? "⚠ يجب أن يساوي 100٪" : "⚠ Must equal 100%"}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "جدول المناخل والخليط" : "Sieve & blend worksheet"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-xs min-w-[880px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle">
                      {ar ? "المنخل (مم)" : "Sieve (mm)"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-50 align-middle">
                      {ar ? "حد أدنى %" : "Spec Lower %"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-50 align-middle">
                      {ar ? "حد أعلى %" : "Spec Upper %"}
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-2 py-2 bg-blue-100 text-center">
                      {ar ? "رمل أبيض" : "White Sand"}
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-2 py-2 bg-slate-200 text-center">
                      {ar ? "رمل أسود" : "Black Sand"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 bg-yellow-100 align-middle">
                      {ar ? "الخليط النهائي %" : "Final Blend %"}
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle">
                      {ar ? "النتيجة" : "Result"}
                    </th>
                  </tr>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-300 px-2 py-1 bg-green-100">
                      {ar ? "أصلي % مار" : "Original Pass %"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 bg-blue-50">{ar ? "مستخدم %" : "Used %"}</th>
                    <th className="border border-slate-300 px-2 py-1 bg-green-100">
                      {ar ? "أصلي % مار" : "Original Pass %"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 bg-slate-100">{ar ? "مستخدم %" : "Used %"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBlend.map((row, idx) => {
                    const blend = row.finalBlend;
                    const blendStr = blend !== null ? blend.toFixed(2) : "—";
                    return (
                      <tr key={row.sieveMm}>
                        <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">
                          {formatSieveMm(row.sieveMm)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-50 font-mono">{row.lowerLimit}</td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-50 font-mono">{row.upperLimit}</td>
                        <td className="border border-slate-300 px-1 py-1 bg-green-50">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.whitePassPct}
                            onChange={e => updateRow(idx, "whitePassPct", e.target.value)}
                            className="h-8 w-20 text-center font-mono mx-auto"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-mono font-semibold">
                          {whiteUsedPct != null ? whiteUsedPct : "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 bg-green-50">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={row.blackPassPct}
                            onChange={e => updateRow(idx, "blackPassPct", e.target.value)}
                            className="h-8 w-20 text-center font-mono mx-auto"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-slate-100 font-mono font-semibold">
                          {blackUsedPct != null ? blackUsedPct : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center font-bold bg-yellow-50 font-mono">
                          {blendStr}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {blend !== null ? (
                            row.passes ? (
                              <span className="text-emerald-600 font-bold">✓</span>
                            ) : (
                              <span className="text-red-600 font-bold">✗</span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              <strong>{ar ? "المعادلة:" : "Formula:"}</strong>{" "}
              {ar
                ? "الخليط % = (مستخدم أبيض × مرور أبيض + مستخدم أسود × مرور أسود) ÷ 100"
                : "Final Blend % = (White Used% × White Pass% + Black Used% × Black Pass%) ÷ 100"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "منحنى التدرج" : "Grading curve"}</CardTitle>
          </CardHeader>
          <CardContent>
            {blendAnyData ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="sieveLog"
                    scale="log"
                    domain={[0.05, 10]}
                    tick={{ fontSize: 10 }}
                    label={{
                      value: ar ? "حجم المنخل (مم) — مقياس لوغاريتمي" : "Sieve size (mm) — log scale",
                      position: "insideBottom",
                      offset: -18,
                      fontSize: 11,
                    }}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={48} />
                  <Tooltip formatter={(v: number) => (v != null && Number.isFinite(v) ? `${Number(v).toFixed(1)}%` : "—")} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kLo}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    dot={false}
                    strokeWidth={1.5}
                    name={chartKeys.kLo}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kUp}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    dot={false}
                    strokeWidth={1.5}
                    name={chartKeys.kUp}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kWhite}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name={chartKeys.kWhite}
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kBlack}
                    stroke="#374151"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name={chartKeys.kBlack}
                  />
                  <Line
                    type="monotone"
                    dataKey={chartKeys.kBlend}
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 4 }}
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
                  {blendStandard === "ASTM_C144" ? "ASTM C 144 — Masonry Sand" : "BS 1199:76 Type A — Plaster Sand"}
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
            standard={blendStandard === "ASTM_C144" ? "ASTM C 144" : "BS 1199:76 Type A"}
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
