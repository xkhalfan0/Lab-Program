import { useState, useEffect } from "react";
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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Grading Limits (BS 882 / BS EN 12620) ───────────────────────────────────
const GRADING_LIMITS: Record<string, { sieves: string[]; lower: number[]; upper: number[] }> = {
  // Coarse aggregate 40mm — BS 882 / BS EN 12620
  "COARSE_40": {
    sieves: ["50", "37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,   90,    35,   20,   10,   0,    0,    0,      0,     0,    0,    0],
    upper:  [100,   100,   70,   55,   40,   15,   5,    5,      5,     5,    5,    5],
  },
  // Coarse aggregate 20mm — BS 882 / BS EN 12620 (includes 6.3mm sieve)
  "COARSE_20": {
    sieves: ["37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,    90,   50,   15,   0,    0,    0,      0,      0,    0,    0],
    upper:  [100,    100,  90,   55,   20,   10,   5,      5,      5,    5,    5],
  },
  // Fine aggregate (sand) — BS 882 (includes 5.0mm sieve)
  "FINE_SAND": {
    sieves: ["9.5", "5.0", "4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,    95,    90,     80,     50,     25,    10,    2],
    upper:  [100,    100,   100,    100,    85,     60,    30,    10],
  },
  "MORTAR_SAND": {
    sieves: ["4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,     95,     70,     40,    10,    2],
    upper:  [100,     100,    100,    85,    60,    20],
  },
  // Plaster Sand — BS 1199 Table 1 (Type A & B combined envelope)
  // BS sieve sizes: 6.30, 5.00, 2.36, 1.18mm + 600, 300, 150, 75µm
  // Type A: 100 | 95-100 | 60-100 | 30-100 | 15-80 | 5-40 | 0-20 | 0-5
  // Type B: 100 | 95-100 | 80-100 | 70-100 | 55-100 | 5-75 | 0-20 | not>5
  // Using Type A limits (more restrictive, standard for plastering)
  "PLASTER_SAND": {
    sieves: ["6.30", "5.00", "2.36", "1.18", "0.600", "0.300", "0.150", "0.075"],
    lower:  [100,    95,     60,     30,     15,      5,       0,       0],
    upper:  [100,    100,    100,    100,    80,      40,      20,      5],
  },
  // Masonry Sand — ASTM C144 Table 1
  // Sieve sizes: 9.5mm, 4.75mm, 2.36mm, 1.18mm, 600µm, 300µm, 150µm
  "MASONRY_SAND": {
    sieves: ["9.5", "4.75", "2.36", "1.18", "0.600", "0.300", "0.150"],
    lower:  [100,    95,     70,     40,     10,      2,       0],
    upper:  [100,    100,    100,    85,     60,      30,      10],
  },
  // ASTM C33 / C136 style stacks (simplified envelope limits for lab QA — verify against project spec)
  "ASTM_COARSE_NO57": {
    sieves: ["37.5", "25", "19", "12.5", "9.5", "4.75", "2.36"],
    lower:  [100,   95,  35,  10,   0,    0,    0],
    upper:  [100,   100, 100, 90,   60,   25,   5],
  },
  "ASTM_FINE_CONCRETE": {
    sieves: ["9.5", "4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,  95,   80,   50,   25,   10,   2],
    upper:  [100,  100,  100,  85,   60,   30,   10],
  },
};

type GradingType = keyof typeof GRADING_LIMITS;

const BS_GRADING_KEYS = [
  "COARSE_40",
  "COARSE_20",
  "FINE_SAND",
  "PLASTER_SAND",
] as const satisfies readonly GradingType[];

const ASTM_GRADING_KEYS = [
  "ASTM_COARSE_NO57",
  "ASTM_FINE_CONCRETE",
  "MASONRY_SAND",
  "MORTAR_SAND",
] as const satisfies readonly GradingType[];

interface SieveRow {
  sieve: string;
  massRetained: string;
  // computed
  pctRetained?: number;      // % محتجز جزئي
  cumRetained?: number;      // % محتجز تراكمي
  cumPassing?: number;       // % مار تراكمي
  lower?: number;
  upper?: number;
  withinLimits?: boolean;
}

function computeSieveData(rows: SieveRow[], totalMass: number, limits: typeof GRADING_LIMITS[GradingType]): SieveRow[] {
  let cumRetainedG = 0;
  return rows.map((row, idx) => {
    const mass = parseFloat(row.massRetained) || 0;
    cumRetainedG += mass;
    const pctRetained = totalMass > 0 ? (mass / totalMass) * 100 : undefined;
    const cumPassing = totalMass > 0 ? ((totalMass - cumRetainedG) / totalMass) * 100 : undefined;
    const lower = limits.lower[idx];
    const upper = limits.upper[idx];
    const withinLimits = cumPassing !== undefined ? cumPassing >= lower && cumPassing <= upper : undefined;
    return {
      ...row,
      pctRetained: pctRetained !== undefined ? parseFloat(pctRetained.toFixed(1)) : undefined,
      cumRetained: totalMass > 0 ? parseFloat(((cumRetainedG / totalMass) * 100).toFixed(1)) : undefined,
      cumPassing: cumPassing !== undefined ? parseFloat(cumPassing.toFixed(1)) : undefined,
      lower,
      upper,
      withinLimits,
    };
  });
}

function gradingKeysForStandard(std: "BS" | "ASTM"): GradingType[] {
  return std === "BS" ? [...BS_GRADING_KEYS] : [...ASTM_GRADING_KEYS];
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
    { enabled: !!distId }
  );

  const [sieveStandard, setSieveStandard] = useState<"BS" | "ASTM">("BS");
  const [gradingType, setGradingType] = useState<GradingType>("COARSE_20");
  const [totalMassStr, setTotalMassStr] = useState("1000");
  const [panMass, setPanMass] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Keep grading type consistent with BS/ASTM list (avoids Radix Select crash if value ∉ items)
  useEffect(() => {
    if (isMortarSandDist) return;
    const keys = gradingKeysForStandard(sieveStandard);
    if (keys.includes(gradingType)) return;
    const next = keys[0];
    setGradingType(next);
    setMassRetained(Object.fromEntries(GRADING_LIMITS[next].sieves.map(s => [s, ""])));
  }, [sieveStandard, gradingType, isMortarSandDist]);

  useEffect(() => {
    if (!isMortarSandDist || !dist?.testSubType || existing?.formData) return;
    if (dist.testSubType === "masonry_sand") {
      setSieveStandard("ASTM");
      setGradingType("MASONRY_SAND");
      setMassRetained(Object.fromEntries(GRADING_LIMITS.MASONRY_SAND.sieves.map(s => [s, ""])));
    } else {
      setSieveStandard("BS");
      setGradingType("PLASTER_SAND");
      setMassRetained(Object.fromEntries(GRADING_LIMITS.PLASTER_SAND.sieves.map(s => [s, ""])));
    }
  }, [isMortarSandDist, dist?.testSubType, dist?.id, existing?.formData]);

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    let std: "BS" | "ASTM" | null =
      fd.sieveStandard === "BS" || fd.sieveStandard === "ASTM" ? fd.sieveStandard : null;
    const gt0 = fd.gradingType as GradingType | undefined;
    if (!std && gt0) {
      if ((BS_GRADING_KEYS as readonly string[]).includes(gt0)) std = "BS";
      else if ((ASTM_GRADING_KEYS as readonly string[]).includes(gt0)) std = "ASTM";
    }
    if (std) setSieveStandard(std);
    const ms = fd.mortarSandSubtype as string | undefined;
    if (ms === "MASONRY_SAND") {
      setSieveStandard("ASTM");
      setGradingType("MASONRY_SAND");
    } else if (ms === "PLASTER_SAND") {
      setSieveStandard("BS");
      setGradingType("PLASTER_SAND");
    }
    const gt = fd.gradingType as GradingType | undefined;
    if (gt && GRADING_LIMITS[gt]) {
      setGradingType(gt);
      const lim = GRADING_LIMITS[gt];
      const map: Record<string, string> = {};
      if (Array.isArray(fd.rows)) {
        for (const r of fd.rows as Array<{ sieve?: string; massRetained?: string | number }>) {
          if (r.sieve != null) {
            map[String(r.sieve)] =
              r.massRetained != null && r.massRetained !== "" ? String(r.massRetained) : "";
          }
        }
      }
      setMassRetained(Object.fromEntries(lim.sieves.map(s => [s, map[s] ?? ""])));
    }
    if (fd.totalMass != null && fd.totalMass !== "") setTotalMassStr(String(fd.totalMass));
    if (fd.panMass != null && fd.panMass !== "") setPanMass(String(fd.panMass));
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const limits = GRADING_LIMITS[gradingType];
  const [massRetained, setMassRetained] = useState<Record<string, string>>(
    Object.fromEntries(limits.sieves.map(s => [s, ""]))
  );

  const totalMass = parseFloat(totalMassStr) || 0;
  const rows: SieveRow[] = limits.sieves.map(s => ({
    sieve: s,
    massRetained: massRetained[s] ?? "",
  }));
  const computedRows = computeSieveData(rows, totalMass, limits);

  // Fineness Modulus (for sand)
  const fmSieves = ["4.75", "2.36", "1.18", "0.6", "0.3", "0.15"];
  const fm = computedRows
    .filter(r => fmSieves.includes(r.sieve) && r.cumRetained !== undefined)
    .reduce((s, r) => s + (r.cumRetained ?? 0), 0) / 100;

  const allWithinLimits = computedRows.every(r => r.withinLimits !== false);
  const anyComputed = computedRows.some(r => r.cumPassing !== undefined);
  const overallResult: "pass" | "fail" | "pending" =
    !anyComputed ? "pending" : allWithinLimits ? "pass" : "fail";

  // Chart data
  const chartData = computedRows.map(r => ({
    sieve: r.sieve,
    [ar ? "% المار" : "% Passing"]: r.cumPassing,
    [ar ? "الحد الأدنى" : "Lower Limit"]: r.lower,
    [ar ? "الحد الأعلى" : "Upper Limit"]: r.upper,
  }));

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة" : "Draft saved");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && !anyComputed) {
      toast.error(ar ? "يرجى إدخال كتل المناخل" : "Please enter sieve masses");
      return;
    }
    setSaving(true);
    try {
      const isFineGrading =
        gradingType.startsWith("FINE") ||
        gradingType.includes("FINE") ||
        gradingType.includes("SAND") ||
        gradingType.includes("MORTAR") ||
        gradingType.includes("PLASTER") ||
        gradingType.includes("MASONRY");
      const testTypeCode = isFineGrading ? "AGG_SIEVE_FINE" : "AGG_SIEVE_COARSE";
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode,
        formTemplate: "sieve_analysis",
        formData: {
          sieveStandard,
          gradingType,
          mortarSandSubtype:
            gradingType === "PLASTER_SAND" ? "PLASTER_SAND" : gradingType === "MASONRY_SAND" ? "MASONRY_SAND" : undefined,
          totalMass,
          panMass,
          source,
          rows: computedRows,
          finesModulus: isFineGrading ? fm : undefined,
          overallResult,
        },
        overallResult,
        summaryValues: {
          sieveStandard,
          gradingType,
          totalMass,
          finesModulus: fm.toFixed(2),
          overallResult,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const GRADING_LABELS: Record<GradingType, { ar: string; en: string }> = {
    "COARSE_40": { ar: "ركام خشن 40مم", en: "Coarse Aggregate 40mm" },
    "COARSE_20": { ar: "ركام خشن 20مم", en: "Coarse Aggregate 20mm" },
    "FINE_SAND": { ar: "ركام ناعم (رمل)", en: "Fine Aggregate (Sand)" },
    "MORTAR_SAND": { ar: "رمل ملاط (ASTM C144)", en: "Mortar Sand (ASTM C144)" },
    "PLASTER_SAND": { ar: "رمل جص (BS 1199)", en: "Plaster Sand (BS 1199)" },
    "MASONRY_SAND": { ar: "رمل بناء (ASTM C144)", en: "Masonry Sand (ASTM C144)" },
    "ASTM_COARSE_NO57": { ar: "ركام خشن ASTM (تدرج 57)", en: "ASTM Coarse (No. 57–style)" },
    "ASTM_FINE_CONCRETE": { ar: "رمل ناعم خرسانة ASTM C33", en: "ASTM Fine (concrete sand, C33)" },
  };

  const gradingLabel = (k: GradingType) => ar ? GRADING_LABELS[k].ar : GRADING_LABELS[k].en;

  const gradingOptions = gradingKeysForStandard(sieveStandard);
  const showFinenessModulus =
    gradingType.includes("SAND") ||
    gradingType.includes("MORTAR") ||
    gradingType.includes("PLASTER") ||
    gradingType.includes("MASONRY") ||
    gradingType === "ASTM_FINE_CONCRETE";

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "نوع الركام", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / تحليل المناخل" : "Aggregates / Sieve Analysis"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل المناخل (توزيع الأحجام)" : "Sieve Analysis (Particle Size Distribution)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 882 / ASTM C136 | {ar ? "التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button size="sm" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {isMortarSandDist && (
                <div className="col-span-2 md:col-span-4">
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {ar ? "رمل الملاط — المعيار" : "Mortar sand — standard"}
                  </Label>
                  <Select
                    value={gradingType === "MASONRY_SAND" ? "masonry_sand" : "plaster_sand"}
                    disabled={submitted}
                    onValueChange={v => {
                      if (v === "masonry_sand") {
                        setSieveStandard("ASTM");
                        setGradingType("MASONRY_SAND");
                        setMassRetained(Object.fromEntries(GRADING_LIMITS.MASONRY_SAND.sieves.map(s => [s, ""])));
                      } else {
                        setSieveStandard("BS");
                        setGradingType("PLASTER_SAND");
                        setMassRetained(Object.fromEntries(GRADING_LIMITS.PLASTER_SAND.sieves.map(s => [s, ""])));
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plaster_sand">{ar ? "رمل لياسة (BS 1199)" : "Plaster Sand (BS 1199)"}</SelectItem>
                      <SelectItem value="masonry_sand">{ar ? "رمل بناء (ASTM C144)" : "Masonry Sand (ASTM C144)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "المواصفة" : "Sieve standard"}
                </Label>
                <Select
                  value={sieveStandard}
                  disabled={submitted || isMortarSandDist}
                  onValueChange={v => {
                    const std = v as "BS" | "ASTM";
                    setSieveStandard(std);
                    const keys = gradingKeysForStandard(std);
                    const next = keys.includes(gradingType) ? gradingType : keys[0];
                    setGradingType(next);
                    setMassRetained(Object.fromEntries(GRADING_LIMITS[next].sieves.map(s => [s, ""])));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BS">BS 882 / BS EN 12620</SelectItem>
                    <SelectItem value="ASTM">ASTM C33 / C136</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "نوع الركام / التدرج" : "Aggregate Type / Grading"}
                </Label>
                <Select
                  value={gradingType}
                  disabled={submitted || isMortarSandDist}
                  onValueChange={v => {
                    setGradingType(v as GradingType);
                    setMassRetained(Object.fromEntries(GRADING_LIMITS[v as GradingType].sieves.map(s => [s, ""])));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gradingOptions.map(k => (
                      <SelectItem key={k} value={k}>{gradingLabel(k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "كتلة العينة الكلية (جم)" : "Total Sample Mass (g)"}
                </Label>
                <Input value={totalMassStr} onChange={e => setTotalMassStr(e.target.value)} className="font-mono" placeholder="1000" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "كتلة الصينية (جم)" : "Pan Mass (g)"}
                </Label>
                <Input value={panMass} onChange={e => setPanMass(e.target.value)} className="font-mono" placeholder="—" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "المصدر / المحجر" : "Source / Quarry"}
                </Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder={ar ? "مصدر الركام" : "Aggregate source"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sieve Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "بيانات المناخل" : "Sieve Data"}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "فتحة المنخل (مم)" : "Sieve (mm)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "الكتلة المحتجزة (جم)" : "Mass Retained (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% محتجز" : "% Retained"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% محتجز تراكمي" : "Cum. % Ret."}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% مار تراكمي" : "% Passing"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "الحدود" : "Limits"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.sieve} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-2 py-1 font-mono text-xs font-semibold text-slate-700 text-center">{row.sieve}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <Input
                          value={massRetained[row.sieve] ?? ""}
                          onChange={e => setMassRetained(prev => ({ ...prev, [row.sieve]: e.target.value }))}
                          className="h-7 text-xs w-20 text-center font-mono mx-auto"
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-600">
                        {row.pctRetained?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-600">
                        {row.cumRetained?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs font-bold text-slate-800">
                        {row.cumPassing?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500">
                        {row.lower}–{row.upper}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center">
                        {row.withinLimits !== undefined ? (
                          row.withinLimits
                            ? <span className="text-emerald-600 font-bold text-base">✓</span>
                            : <span className="text-red-600 font-bold text-base">✗</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                  {panMass && (
                    <tr className="bg-slate-100">
                      <td className="border border-slate-200 px-2 py-1 font-mono text-xs font-semibold text-center">
                        {ar ? "الصينية" : "Pan"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs">{panMass}</td>
                      <td colSpan={5} className="border border-slate-200"></td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Fineness Modulus */}
              {showFinenessModulus && anyComputed && (
                <div className="mt-3 bg-blue-50 rounded-lg p-3 text-xs border border-blue-100">
                  <span className="font-semibold text-blue-700">
                    {ar ? "معامل النعومة (FM):" : "Fineness Modulus (FM):"}
                  </span>
                  <span className="font-mono font-bold text-blue-900 mx-2">{fm.toFixed(2)}</span>
                  <span className="text-slate-400">
                    {ar ? "(المقبول: 2.3 – 3.1)" : "(acceptable: 2.3 – 3.1)"}
                  </span>
                </div>
              )}

              {/* Mass balance check */}
              {anyComputed && totalMass > 0 && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded p-2">
                  {ar ? "مجموع الكتل المحتجزة:" : "Sum of retained masses:"}
                  <span className="font-mono font-bold mx-1">
                    {computedRows.reduce((s, r) => s + (parseFloat(r.massRetained) || 0), 0).toFixed(1)} جم
                  </span>
                  {" / "}
                  {ar ? "الكتلة الكلية:" : "Total:"}
                  <span className="font-mono font-bold mx-1">{totalMass} {ar ? "جم" : "g"}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grading Curve Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "منحنى التدرج" : "Grading Curve"}</CardTitle>
            </CardHeader>
            <CardContent>
              {anyComputed ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="sieve"
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "فتحة المنخل (مم)" : "Sieve Size (mm)", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "% المار" : "% Passing", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={ar ? "الحد الأدنى" : "Lower Limit"}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      dot={false}
                      strokeWidth={1.5}
                    />
                    <Line
                      type="monotone"
                      dataKey={ar ? "الحد الأعلى" : "Upper Limit"}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      dot={false}
                      strokeWidth={1.5}
                    />
                    <Line
                      type="monotone"
                      dataKey={ar ? "% المار" : "% Passing"}
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  <div className="text-center">
                    <FlaskConical size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium">
                      {ar ? "أدخل كتل المناخل لرؤية منحنى التدرج" : "Enter sieve masses to see grading curve"}
                    </p>
                    <p className="text-xs mt-1">
                      {ar ? "يتحدث الرسم تلقائياً" : "Chart will update automatically"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Spec Reference */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">
                  {ar ? "المواصفة المرجعية:" : "Reference Standard:"}{" "}
                  {sieveStandard === "ASTM" ? "ASTM C33 / C136" : "BS 882 / BS EN 12620"} — {gradingLabel(gradingType)}
                </p>
                <p>
                  {sieveStandard === "ASTM"
                    ? (ar
                        ? "حدود مبسّطة لأغراض المختبر — تأكد من مطابقة المشروع لجدول ASTM الفعلي."
                        : "Simplified envelope for lab QA — verify against your project’s ASTM gradation table.")
                    : (ar
                        ? "الحدود المعتمدة من BS 882 / BS EN 12620. يُعتبر الركام مطابقاً إذا مرّت جميع نقاط % المار ضمن الحدود."
                        : "Limits per BS 882 / BS EN 12620. Aggregate passes if all % passing values fall within the specified limits.")}
                </p>
                {(gradingType === "COARSE_20" || gradingType === "COARSE_40") && (
                  <p className="text-blue-700">
                    {ar ? "✓ يشمل منخل 6.3مم للركام الخشن" : "✓ Includes 6.3mm sieve for coarse aggregate"}
                  </p>
                )}
                {gradingType === "FINE_SAND" && (
                  <p className="text-blue-700">
                    {ar ? "✓ يشمل منخل 5.0مم للركام الناعم" : "✓ Includes 5.0mm sieve for fine aggregate"}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overall Result */}
        {anyComputed && (
          <ResultBanner
            result={overallResult}
            testName={ar
              ? `تحليل المناخل — ${gradingLabel(gradingType)}`
              : `Sieve Analysis — ${gradingLabel(gradingType)}`}
            standard="BS 882 / ASTM C136"
          />
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
