import { useState, useCallback } from "react";
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
import { Plus, Trash2, Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Steel Rebar Specs ────────────────────────────────────────────────────────
// NOTE (CMW Practice): Gauge length = 100mm for ALL bar sizes (BS 4449)
// Elongation acceptance = ≥5% with L₀=100mm (CMW practice, per commentonlabtests.pdf)
const STEEL_STANDARDS = {
  "BS4449_B500B": {
    label: "BS 4449 Grade B500B",
    yieldMin: 500,       // N/mm²
    tensileMin: 540,     // N/mm²
    tensileYieldRatioMin: 1.08,
    elongationMin: 5,    // % — CMW practice with L₀=100mm (BS 4449 standard is 14% at L₀=5d)
    gaugeLengthDefault: "100", // mm — CMW uses 100mm for ALL sizes
    bendTest: "180° around 4d — No cracks or fractures",
    standard: "BS 4449",
    code: "STEEL_REBAR_BS4449",
  },
  "BS4449_B500C": {
    label: "BS 4449 Grade B500C",
    yieldMin: 500,
    tensileMin: 575,
    tensileYieldRatioMin: 1.15,
    elongationMin: 5,    // % — CMW practice
    gaugeLengthDefault: "100",
    bendTest: "180° around 4d — No cracks or fractures",
    standard: "BS 4449",
    code: "STEEL_REBAR_BS4449",
  },
  "ASTM_A615_60": {
    label: "ASTM A615 Grade 60",
    yieldMin: 420,       // N/mm² (60 ksi)
    tensileMin: 620,     // N/mm² (90 ksi)
    tensileYieldRatioMin: 1.0,
    elongationMin: 9,    // % — ASTM A615 standard
    gaugeLengthDefault: "200",
    bendTest: "180° around 6d — No cracks or fractures",
    standard: "ASTM A615",
    code: "STEEL_REBAR_A615",
  },
  "ASTM_A615_40": {
    label: "ASTM A615 Grade 40",
    yieldMin: 280,
    tensileMin: 480,
    tensileYieldRatioMin: 1.0,
    elongationMin: 12,   // % — ASTM A615 standard
    gaugeLengthDefault: "200",
    bendTest: "180° around 5d — No cracks or fractures",
    standard: "ASTM A615",
    code: "STEEL_REBAR_A615",
  },
};

type StandardKey = keyof typeof STEEL_STANDARDS;

// Nominal cross-sectional areas (mm²) for common bar sizes — used as fallback
const BAR_AREAS: Record<string, number> = {
  "T8": 50.3, "T10": 78.5, "T12": 113.1, "T16": 201.1,
  "T20": 314.2, "T25": 490.9, "T32": 804.2, "T40": 1256.6,
  "#3": 71.0, "#4": 129.0, "#5": 200.0, "#6": 284.0,
  "#7": 387.0, "#8": 510.0, "#9": 645.0, "#10": 819.0,
};

// Nominal mass per meter (kg/m) for BS/metric bar sizes
const BAR_MASS_PER_M: Record<string, number> = {
  "T8": 0.395, "T10": 0.617, "T12": 0.888, "T16": 1.579,
  "T20": 2.466, "T25": 3.854, "T32": 6.313, "T40": 9.865,
};

// Calculate cross-section area from measured mass
// area_mm2 = (mass_kg / length_mm) * 1e6 / 7850
function calcAreaFromMass(massKg: string, lengthMm: string): number | undefined {
  const m = parseFloat(massKg);
  const l = parseFloat(lengthMm);
  if (!m || !l || m <= 0 || l <= 0) return undefined;
  // density of steel = 7850 kg/m³ = 7.85e-6 kg/mm³
  return parseFloat(((m / l) / 7.85e-6).toFixed(1));
}

interface RebarRow {
  id: string;
  specimenNo: string;
  barSize: string;
  specimenLength: string;  // length of specimen in mm (for mass-based area calculation)
  massKg: string;          // measured mass of specimen (kg)
  gaugeLength: string;     // L₀ in mm (default 100mm per CMW)
  yieldLoadKN: string;
  maxLoadKN: string;
  finalGaugeLength: string; // L₁ after fracture
  bendResult: "Pass" | "Fail" | "";
  // computed
  calculatedArea?: number;  // from mass measurement (preferred)
  nominalArea?: number;     // fallback from bar size table
  effectiveArea?: number;   // calculatedArea if available, else nominalArea
  yieldStrength?: number;
  tensileStrength?: number;
  tsYsRatio?: number;
  elongation?: number;
  yieldResult?: "pass" | "fail" | "pending";
  tensileResult?: "pass" | "fail" | "pending";
  ratioResult?: "pass" | "fail" | "pending";
  elongationResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function newRow(index: number, spec: typeof STEEL_STANDARDS[StandardKey]): RebarRow {
  return {
    id: `row_${Date.now()}_${index}`,
    specimenNo: `S${index + 1}`,
    barSize: "T12",
    specimenLength: "500",
    massKg: "",
    gaugeLength: spec.gaugeLengthDefault,
    yieldLoadKN: "",
    maxLoadKN: "",
    finalGaugeLength: "",
    bendResult: "",
  };
}

function computeRow(row: RebarRow, spec: typeof STEEL_STANDARDS[StandardKey]): RebarRow {
  const nominalArea = BAR_AREAS[row.barSize] ?? 0;
  const calculatedArea = calcAreaFromMass(row.massKg, row.specimenLength);
  const effectiveArea = calculatedArea ?? nominalArea;

  const yieldLoad = parseFloat(row.yieldLoadKN);
  const maxLoad = parseFloat(row.maxLoadKN);
  const gl0 = parseFloat(row.gaugeLength);
  const gl1 = parseFloat(row.finalGaugeLength);

  if (!effectiveArea || !yieldLoad || !maxLoad) {
    return { ...row, nominalArea, calculatedArea, effectiveArea: effectiveArea || nominalArea };
  }

  const ys = (yieldLoad * 1000) / effectiveArea;
  const ts = (maxLoad * 1000) / effectiveArea;
  const ratio = ts / ys;
  const elong = gl0 && gl1 && gl1 > gl0 ? ((gl1 - gl0) / gl0) * 100 : undefined;

  const yieldResult: "pass" | "fail" = ys >= spec.yieldMin ? "pass" : "fail";
  const tensileResult: "pass" | "fail" = ts >= spec.tensileMin ? "pass" : "fail";
  const ratioResult: "pass" | "fail" = ratio >= spec.tensileYieldRatioMin ? "pass" : "fail";
  const elongResult: "pass" | "fail" | "pending" =
    elong !== undefined ? (elong >= spec.elongationMin ? "pass" : "fail") : "pending";
  const bendRes: "pass" | "fail" | "pending" =
    row.bendResult === "Pass" ? "pass" : row.bendResult === "Fail" ? "fail" : "pending";

  const allResults = [yieldResult, tensileResult, ratioResult, elongResult, bendRes].filter(r => r !== "pending");
  const overall: "pass" | "fail" | "pending" =
    allResults.length === 0 ? "pending"
    : allResults.every(r => r === "pass") ? "pass" : "fail";

  return {
    ...row,
    nominalArea,
    calculatedArea,
    effectiveArea,
    yieldStrength: parseFloat(ys.toFixed(1)),
    tensileStrength: parseFloat(ts.toFixed(1)),
    tsYsRatio: parseFloat(ratio.toFixed(3)),
    elongation: elong !== undefined ? parseFloat(elong.toFixed(1)) : undefined,
    yieldResult,
    tensileResult,
    ratioResult,
    elongationResult: elongResult,
    overallResult: overall,
  };
}

export default function SteelRebar() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [standard, setStandard] = useState<StandardKey>("BS4449_B500B");
  const [heatNo, setHeatNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<RebarRow[]>(() => {
    const spec = STEEL_STANDARDS["BS4449_B500B"];
    return [newRow(0, spec), newRow(1, spec), newRow(2, spec)];
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = STEEL_STANDARDS[standard];

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

  const computedRows = rows.map(r => computeRow(r, spec));
  const validRows = computedRows.filter(r => r.yieldStrength && r.yieldStrength > 0);
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof RebarRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  // When standard changes, update gauge length defaults
  const handleStandardChange = (val: StandardKey) => {
    setStandard(val);
    const newSpec = STEEL_STANDARDS[val];
    setRows(prev => prev.map(r => ({ ...r, gaugeLength: newSpec.gaugeLengthDefault })));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && validRows.length === 0) {
      toast.error("Please enter at least one specimen result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: spec.code,
        formTemplate: "steel_rebar",
        formData: { standard, spec, heatNo, supplier, specimens: computedRows, overallResult },
        overallResult,
        summaryValues: {
          standard: spec.label,
          specimensTested: validRows.length,
          overallResult,
          gaugeLengthUsed: spec.gaugeLengthDefault + "mm",
          elongationLimit: spec.elongationMin + "%",
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "القطر", value: dist?.testSubType ? `${dist.testSubType} mm` : null },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Steel Tests / Reinforcement Bars</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Tensile Test of Reinforcement Bars</h1>
            <p className="text-slate-500 text-sm mt-1">
              {spec.standard} | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
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
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* CMW Practice Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <Info size={12} className="inline mr-1" />
          {ar ? (
            <><strong>ممارسة مختبر CMW (BS 4449):</strong> طول القياس L₀ = <strong>100 مم</strong> لجميع الأقطار. حد الاستطالة = <strong>≥ 5%</strong>. تُحسب مساحة المقطع من الكتلة المقاسة عند توفرها.</>
          ) : (
            <><strong>CMW Lab Practice (BS 4449):</strong> Gauge length L₀ = <strong>100 mm</strong> for all bar sizes. Elongation acceptance limit = <strong>≥ 5%</strong> (with L₀=100mm). Cross-section area is calculated from measured specimen mass when available.</>
          )}
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المواصفة / الدرجة" : "Standard / Grade"}</Label>
                <Select value={standard} onValueChange={v => handleStandardChange(v as StandardKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STEEL_STANDARDS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "رقم الصهر / الدفعة" : "Heat / Cast No."}</Label>
                <Input value={heatNo} onChange={e => setHeatNo(e.target.value)} placeholder={ar ? "رقم الصهر" : "Heat number"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المورد / المصنع" : "Supplier / Mill"}</Label>
                <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder={ar ? "مورد الحديد" : "Steel supplier"} />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">{ar ? "حد الخضوع:" : "Yield:"}</span> ≥ {spec.yieldMin} N/mm²</div>
                  <div><span className="font-semibold">{ar ? "حد الشد:" : "Tensile:"}</span> ≥ {spec.tensileMin} N/mm²</div>
                  <div><span className="font-semibold">{ar ? "نسبة الشد/الخضوع:" : "T/Y ratio:"}</span> ≥ {spec.tensileYieldRatioMin}</div>
                  <div><span className="font-semibold">{ar ? `الاستطالة (L₀=${spec.gaugeLengthDefault}مم):` : `Elongation (L₀=${spec.gaugeLengthDefault}mm):`}</span> ≥ {spec.elongationMin}%</div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Tested By / الفاحص</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specimens Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "العينات — بيانات الإدخال" : "Specimens — Input Data"}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length, spec)])}>
                <Plus size={14} className="mr-1" /> {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "رقم العينة" : "Spec. No."}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "القطر" : "Bar Size"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الطول (مم)" : "Length (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الكتلة (كجم)" : "Mass (kg)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "المساحة (مم²)" : "Area (mm²)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">GL₀ (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "حمل الخضوع (كن)" : "Yield Load (kN)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الحمل الأقصى (كن)" : "Max Load (kN)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">GL₁ (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "إجهاد الخضوع" : "Yield (N/mm²)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "إجهاد الشد" : "Tensile (N/mm²)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "نسبة ش/خ" : "T/Y Ratio"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الاستطالة %" : "Elong. (%)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الثني" : "Bend"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "النتيجة" : "Overall"}</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.specimenNo} onChange={e => updateRow(row.id, "specimenNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Select value={row.barSize} onValueChange={v => updateRow(row.id, "barSize", v)}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.keys(BAR_AREAS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.specimenLength} onChange={e => updateRow(row.id, "specimenLength", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="500" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.massKg} onChange={e => updateRow(row.id, "massKg", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <span className={`font-mono text-xs ${row.calculatedArea ? "text-blue-700 font-bold" : "text-slate-400"}`}>
                        {row.calculatedArea ? `${row.calculatedArea}*` : (row.nominalArea ?? BAR_AREAS[row.barSize])}
                      </span>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.gaugeLength} onChange={e => updateRow(row.id, "gaugeLength", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.yieldLoadKN} onChange={e => updateRow(row.id, "yieldLoadKN", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.maxLoadKN} onChange={e => updateRow(row.id, "maxLoadKN", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.finalGaugeLength} onChange={e => updateRow(row.id, "finalGaugeLength", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.yieldStrength ? (
                        <span className={`font-mono text-xs font-bold ${row.yieldResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.yieldStrength}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.tensileStrength ? (
                        <span className={`font-mono text-xs font-bold ${row.tensileResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.tensileStrength}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.tsYsRatio !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.ratioResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.tsYsRatio}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.elongation !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.elongationResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.elongation}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Select value={row.bendResult} onValueChange={v => updateRow(row.id, "bendResult", v)}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pass">Pass</SelectItem>
                          <SelectItem value="Fail">Fail</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.overallResult && row.overallResult !== "pending" ? <PassFailBadge result={row.overallResult} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => setRows(p => p.filter(r => r.id !== row.id))} disabled={rows.length <= 1}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-blue-600 mt-2">{ar ? "* المساحة باللون الأزرق = محسوبة من الكتلة المقاسة (أفضل من الاسمية)" : "* Area marked in blue = calculated from measured mass (preferred over nominal area)"}</p>
          </CardContent>
        </Card>

        {/* Bend Test Note */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <Info size={12} className="inline mr-1" />
          <strong>{ar ? `متطلب اختبار الثني (${spec.standard}):` : `Bend Test Requirement (${spec.standard}):`}</strong> {spec.bendTest}
        </div>

        {/* Summary */}
        {validRows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <ResultBanner
                result={overallResult}
                testName={`Tensile Test of Reinforcement Bars — ${spec.label}`}
                standard={spec.standard}
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات / مشاهدات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
