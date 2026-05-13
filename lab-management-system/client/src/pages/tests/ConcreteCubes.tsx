import { useState, useCallback, useEffect } from "react";
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
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Printer, Calendar } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatCalendarDate } from "@/lib/dateFormat";

// ─── Cube size factor → equivalent 150 mm cube strength (BS EN 12390-3 style) ─
// Reference specimen is 150 mm; smaller cubes tend to read higher, larger slightly lower.
const CUBE_SIZE_FACTORS: Record<string, number> = {
  "100": 0.97,
  "150": 1.0,
  "200": 1.05,
};

function getCubeSizeFactor(sizeLabel: string): number {
  const key = String(parseFloat(sizeLabel) || 150);
  return CUBE_SIZE_FACTORS[key] ?? 1.0;
}

// ─── Expected strength at age (Eurocode / BS approach) ───────────────────────
// Estimate expected strength at test age relative to 28-day strength
// Age factor: percentage of 28-day strength expected at test age.
// FIX: Range-based grouping per BS EN 12390-3 / BS EN 206.
// Cubes tested at days 8–13 belong to the 14-day set (85%), not 7-day.
// Cubes tested at days 15–28 belong to the 28-day set (100%).
// Age factors corrected: 7d→65% (was wrong at 70%). Added 3d/56d/>56d.
function getAgeGroupLabel(ageDays: number): string {
  if (ageDays <= 3)  return "3-day";
  if (ageDays <= 7)  return "7-day";
  if (ageDays <= 14) return "14-day";
  if (ageDays <= 28) return "28-day";
  if (ageDays <= 56) return "56-day";
  return ">56-day";
}

// BS EN 206 Table B.1 — k-factor for characteristic strength fck.
// Fixed k=1.48 is only valid for n≥15. Use this table for small batches.
const K_FACTORS: Record<number, number> = {
  3: 1.02, 4: 0.87, 5: 0.82, 6: 0.79, 7: 0.77, 8: 0.76, 9: 0.75,
  10: 0.74, 11: 0.73, 12: 0.72, 13: 0.71, 14: 0.70,
};
const K_CONTINUOUS = 1.48; // n ≥ 15

function getKFactor(n: number): number | null {
  if (n < 3) return null; // insufficient for statistical analysis
  if (n >= 15) return K_CONTINUOUS;
  return K_FACTORS[n] ?? K_CONTINUOUS;
}

interface CubeRow {
  id: string;
  cubeNo: string;
  location: string;
  cubeSize: string;   // e.g. "150" or "100"
  maxLoad: string;
  area?: number;
  cubeStrength?: number;
  correctedStrength?: number; // after size factor
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): CubeRow {
  return {
    id: `row_${Date.now()}_${index}`,
    cubeNo: `C${index + 1}`,
    location: "",
    cubeSize: "150",
    maxLoad: "",
  };
}

function computeRow(row: CubeRow, requiredStrength: number): CubeRow {
  const size = parseFloat(row.cubeSize) || 150;
  const load = parseFloat(row.maxLoad);
  if (!load) return row;
  const area = size * size;
  const rawStrength = (load * 1000) / area;
  const sizeFactor = getCubeSizeFactor(row.cubeSize);
  const correctedStrength = rawStrength * sizeFactor;
  // Round to nearest 0.5 N/mm²
  const correctedRounded = Math.round(correctedStrength * 2) / 2;
  return {
    ...row,
    area,
    cubeStrength: Math.round(rawStrength * 2) / 2,
    correctedStrength: correctedRounded,
    result: correctedRounded >= requiredStrength ? "pass" : "fail",
  };
}

export default function ConcreteCubes() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  const [specifiedStrength, setSpecifiedStrength] = useState("30");
  const [structureType, setStructureType] = useState("");
  const [curingCondition, setCuringCondition] = useState("water_20c");
  const [batchReference, setBatchReference] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<CubeRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [testAge, setTestAge] = useState<7 | 14 | 28 | null>(null);
  const [saving, setSaving] = useState(false);
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  // ─── Compute sample age from castingDate ──────────────────────────────────
  const castingDate = dist?.castingDate ? new Date(dist.castingDate) : null;
  const testDate = new Date();
  const sampleAgeDays = castingDate
    ? Math.floor((testDate.getTime() - castingDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  /** Calendar age from casting (same as sampleAgeDays); used for late-test UI and persisted actualAge. */
  const actualAge = sampleAgeDays;

  // Required strength at selected test age (7d / 14d / 28d factors)
  const specStr = parseFloat(specifiedStrength) || 30;
  const strengthFactor = testAge
    ? testAge === 7
      ? 0.65
      : testAge === 14
        ? 0.85
        : 1.0
    : 1.0;
  const requiredAtAge = specStr * strengthFactor;

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Test results submitted successfully");
        setSubmitted(true);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Load existing data ───────────────────────────────────────────────────
  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as any;
    if (fd.specifiedStrength) setSpecifiedStrength(String(fd.specifiedStrength));
    if (fd.structureType) setStructureType(fd.structureType);
    if (fd.curingCondition) setCuringCondition(String(fd.curingCondition));
    if (fd.batchReference) setBatchReference(String(fd.batchReference));
    if (fd.notes) setNotes(fd.notes);
    if (fd.testAge === 7 || fd.testAge === 14 || fd.testAge === 28) {
      setTestAge(fd.testAge);
    }
    if (fd.cubes && Array.isArray(fd.cubes)) {
      setRows(fd.cubes.map((c: any) => ({
        id: c.id || `row_${Date.now()}_${Math.random()}`,
        cubeNo: c.cubeNo || "",
        location: c.location || "",
        cubeSize: c.cubeSize || "150",
        maxLoad: c.maxLoad || "",
      })));
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const computedRows = rows.map(r => computeRow(r, requiredAtAge));
  const validRows = computedRows.filter(r => r.correctedStrength && r.correctedStrength > 0);
  const avgStrength = validRows.length > 0
    ? validRows.reduce((s, r) => s + (r.correctedStrength ?? 0), 0) / validRows.length
    : 0;
  // Characteristic strength with n-dependent k-factor (BS EN 206 Table B.1)
  const n = validRows.length;
  const k = getKFactor(n);
  let fck: number | null = null;
  let stdDev: number | null = null;

  if (k !== null && n >= 3) {
    const mean = avgStrength;
    const variance = validRows.reduce(
      (s, r) => s + Math.pow((r.correctedStrength ?? 0) - mean, 2), 0
    ) / (n - 1);
    stdDev = Math.sqrt(variance);
    fck = mean - k * stdDev;
  }
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.result === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof CubeRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);
  const addRow = () => setRows(prev => [...prev, newRow(prev.length)]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const handleSave = async (status: "draft" | "submitted") => {
    if (!testAge) {
      toast.error(
        lang === "ar" ? "يجب اختيار عمر الاختبار" : "Please select test age"
      );
      return;
    }
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة مكعب واحد على الأقل" : "Please enter at least one cube result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "CONC_CUBE",
        formTemplate: "concrete_cubes",
        formData: {
          testAge,
          actualAge,
          isLate: testAge ? (actualAge != null && actualAge > testAge + 5) : false,
          cubeSize: rows[0]?.cubeSize ?? "150",
          specifiedStrength: specStr,
          structureType,
          curingCondition,
          batchReference: batchReference.trim() || undefined,
          castingDate: castingDate?.toISOString(),
          sampleAgeDays,
          requiredAtAge: parseFloat(requiredAtAge.toFixed(2)),
          cubes: computedRows,
          avgStrength: parseFloat(avgStrength.toFixed(2)),
          fck: fck !== null ? parseFloat(fck.toFixed(2)) : null,
          stdDev: stdDev !== null ? parseFloat(stdDev.toFixed(3)) : null,
          kFactor: k,
          sampleCount: n,
          ageGroup: sampleAgeDays !== null ? getAgeGroupLabel(sampleAgeDays) : "unknown",
          // Nominal cube size: determined from the first cube row (all cubes in one test are same size)
          nominalCubeSize: computedRows.length > 0 ? `${computedRows[0].cubeSize ?? 150}mm` : "150mm",
        },
        overallResult,
        summaryValues: {
          avgStrength: avgStrength.toFixed(2),
          required: requiredAtAge.toFixed(1),
          ageDays: sampleAgeDays ?? "N/A",
          cubeCount: validRows.length,
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
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "Cube size (mm) / حجم المكعب (مم)", value: rows[0]?.cubeSize ? `${rows[0].cubeSize} mm` : "150 mm" },
            { label: "Specified strength / القوة المحددة (MPa)", value: specifiedStrength ? `${specifiedStrength} MPa` : null },
          ]}
        />

        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <label className="block text-sm font-semibold mb-2">
            {lang === "ar" ? "عمر الاختبار *" : "Test Age *"}
            <span className="text-red-600"> ({lang === "ar" ? "مطلوب" : "required"})</span>
          </label>

          <div className="flex flex-wrap gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="testAge"
                value="7"
                checked={testAge === 7}
                onChange={() => setTestAge(7)}
                className="w-4 h-4"
                disabled={submitted}
              />
              <span>{lang === "ar" ? "7 أيام" : "7-Day Test"}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="testAge"
                value="14"
                checked={testAge === 14}
                onChange={() => setTestAge(14)}
                className="w-4 h-4"
                disabled={submitted}
              />
              <span>{lang === "ar" ? "14 يوم" : "14-Day Test"}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="testAge"
                value="28"
                checked={testAge === 28}
                onChange={() => setTestAge(28)}
                className="w-4 h-4"
                disabled={submitted}
              />
              <span>{lang === "ar" ? "28 يوم" : "28-Day Test"}</span>
            </label>
          </div>

          {testAge != null && (
            <div
              className={`p-2 rounded text-sm ${
                actualAge != null && actualAge > testAge + 5
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {lang === "ar" ? "العمر الفعلي:" : "Current Age:"}
              <strong className="ml-2">
                {actualAge != null
                  ? `${actualAge} ${lang === "ar" ? "يوم" : "days"}`
                  : "—"}
              </strong>
              {actualAge != null && actualAge > testAge + 5 && (
                <span className="ml-2">
                  ⚠️ ({lang === "ar" ? "متأخر" : "tested late"})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الخرسانة" : "Concrete Tests"}</span>
              <span>/</span>
              <span className="font-medium text-slate-700">
                {ar ? "قوة الضغط لمكعبات الخرسانة" : "Compressive Strength of Concrete Cubes"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "قوة الضغط لمكعبات الخرسانة" : "Compressive Strength of Concrete Cubes"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {ar ? "BS EN 12390-3 | أمر التوزيع:" : "BS EN 12390-3 | Distribution:"}{" "}
              {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                  onClick={() => handleSave("submitted")}
                  disabled={saving}
                >
                  <Send size={14} />
                  {ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Sample Info & Age */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar size={16} />
              {ar ? "معلومات العينة والعمر" : "Sample Info & Age"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-lg p-3 border">
                <p className="text-xs text-slate-500 mb-1">Sample Code / رمز العينة</p>
                <p className="font-semibold text-slate-800 text-sm">{dist?.sampleCode ?? "—"}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border">
                <p className="text-xs text-slate-500 mb-1">Cast date / تاريخ الصب</p>
                <p className="font-semibold text-slate-800 text-sm">
                  {castingDate ? formatCalendarDate(castingDate) : (
                    <span className="text-amber-600 text-xs">Not set / غير محدد</span>
                  )}
                </p>
              </div>
              <div className={`rounded-lg p-3 border ${sampleAgeDays !== null ? "bg-blue-50 border-blue-200" : "bg-slate-50"}`}>
                <p className="text-xs text-slate-500 mb-1">Sample age (calculated) / عمر العينة (محسوب)</p>
                <p className={`font-bold text-xl ${sampleAgeDays !== null ? "text-blue-700" : "text-slate-400"}`}>
                  {sampleAgeDays !== null ? `${sampleAgeDays} days / ${sampleAgeDays} يوم` : "—"}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border">
                <p className="text-xs text-slate-500 mb-1">Sample location / موقع العينة</p>
                <p className="font-semibold text-slate-800 text-sm">{dist?.sampleLocation ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معاملات الاختبار" : "Test Parameters"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 md:col-span-3">
                <Label className="text-xs">
                  {ar ? "حجم المكعب الافتراضي (يطبّق على كل الصفوف)" : "Default cube size (applies to all rows)"}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 text-sm border rounded px-2 font-mono min-w-[120px]"
                    value={rows[0]?.cubeSize ?? "150"}
                    disabled={submitted}
                    onChange={e => {
                      const v = e.target.value;
                      setRows(prev => prev.map(r => ({ ...r, cubeSize: v })));
                    }}
                  >
                    <option value="100">100 mm</option>
                    <option value="150">150 mm</option>
                    <option value="200">200 mm</option>
                  </select>
                  <span className="text-[11px] text-slate-500">
                    {ar
                      ? "عوامل التصحيح: 100→0.97، 150→1.00، 200→1.05 (مكافئ 150مم)"
                      : "Correction to 150 mm equiv.: 100→0.97, 150→1.00, 200→1.05"}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{ar ? "قوة المكعب المحددة عند 28 يوم (N/mm²)" : "Specified Cube Strength at 28 days (N/mm²)"}</Label>
                <Input
                  type="number"
                  value={specifiedStrength}
                  onChange={e => setSpecifiedStrength(e.target.value)}
                  className="font-mono"
                  placeholder="30"
                  disabled={submitted}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{ar ? "نوع الهيكل" : "Structure Type"}</Label>
                <Input
                  value={structureType}
                  onChange={e => setStructureType(e.target.value)}
                  placeholder={ar ? "مثال: عمود، جسر، بلاطة..." : "e.g. Column, Beam, Slab..."}
                  disabled={submitted}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{ar ? "ظروف المعالجة" : "Curing condition"}</Label>
                <select
                  className="w-full h-9 text-sm border rounded px-2 bg-white"
                  value={curingCondition}
                  disabled={submitted}
                  onChange={e => setCuringCondition(e.target.value)}
                >
                  <option value="water_20c">{ar ? "ماء عند 20±2°م" : "Water at 20 ±2 °C"}</option>
                  <option value="water_lab">{ar ? "ماء حسب المختبر" : "Water (lab standard)"}</option>
                  <option value="site_covered">{ar ? "موقع (مغطى)" : "Site (covered)"}</option>
                  <option value="other">{ar ? "أخرى (انظر الملاحظات)" : "Other (see notes)"}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{ar ? "مرجع الدفعة / الشهادة" : "Batch / certificate ref."}</Label>
                <Input
                  value={batchReference}
                  onChange={e => setBatchReference(e.target.value)}
                  placeholder={ar ? "اختياري" : "Optional"}
                  disabled={submitted}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium mb-1">
                  {ar ? "القوة المطلوبة عند عمر الاختبار" : "Required Strength at Test Age"}
                </p>
                <p className="text-2xl font-bold text-amber-800">
                  {requiredAtAge.toFixed(1)} <span className="text-sm font-normal">N/mm²</span>
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {ar ? "7 أيام → 65% من المقاومة المحددة" : "7 days → 65% of specified strength"}
                </p>
                <p className="text-xs text-amber-600">
                  {ar ? "14 يومًا → 85% من المقاومة المحددة" : "14 days → 85% of specified strength"}
                </p>
                <p className="text-xs text-amber-600">
                  {ar ? "28 يومًا → 100% من المقاومة المحددة" : "28 days → 100% of specified strength"}
                </p>
                {testAge != null && (
                  <p className="text-xs text-amber-600 mt-1">
                    {ar
                      ? `${specStr} × ${(strengthFactor * 100).toFixed(0)}% (${testAge} يوم — معامل الاختبار المختار)`
                      : `${specStr} × ${(strengthFactor * 100).toFixed(0)}% (${testAge}-day selected test factor)`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {ar ? "نتائج المكعبات" : "Cube Test Results"}
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({ar ? "3 مكعبات كحد أدنى" : "3 cubes minimum"})
              </span>
            </CardTitle>
            {!submitted && (
              <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
                <Plus size={14} />
                {ar ? "إضافة مكعب" : "Add Cube"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    ar ? "رقم المكعب" : "Cube No.",
                    ar ? "الموقع" : "Location",
                    ar ? "الحجم (مم)" : "Size (mm)",
                    ar ? "الحمل الأقصى (كيلونيوتن)" : "Max Load (kN)",
                    ar ? "المساحة (مم²)" : "Area (mm²)",
                    ar ? "القوة الخام (N/mm²)" : "Raw Str. (N/mm²)",
                    ar ? "القوة المصححة (N/mm²)" : "Corrected Str. (N/mm²)",
                    ar ? "النتيجة" : "Result",
                    "",
                  ].map(h => (
                    <th key={h} className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.cubeNo}
                        onChange={e => updateRow(row.id, "cubeNo", e.target.value)}
                        className="h-7 text-xs w-14"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.location}
                        onChange={e => updateRow(row.id, "location", e.target.value)}
                        className="h-7 text-xs w-28"
                        placeholder={ar ? "الموقع" : "Location"}
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <select
                        value={row.cubeSize}
                        onChange={e => updateRow(row.id, "cubeSize", e.target.value)}
                        className="h-7 text-xs w-[4.25rem] border rounded px-1 font-mono"
                        disabled={submitted}
                      >
                        <option value="100">100</option>
                        <option value="150">150</option>
                        <option value="200">200</option>
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.maxLoad}
                        onChange={e => updateRow(row.id, "maxLoad", e.target.value)}
                        className="h-7 text-xs w-20 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.area ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.cubeStrength ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                      {row.correctedStrength ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? (
                        <PassFailBadge result={row.result} size="sm" />
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {!submitted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 1}
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          </CardContent>
        </Card>

        {/* Summary */}
        {validRows.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "ملخص" : "Summary"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "عدد المكعبات المختبرة" : "No. of Cubes Tested"}</p>
                  <p className="text-3xl font-bold text-slate-800">{validRows.length}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "متوسط القوة المصححة" : "Avg. Corrected Strength"}</p>
                  <p className="text-3xl font-bold text-slate-800">{avgStrength.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">
                    {ar
                      ? testAge != null
                        ? `المطلوب — اختبار ${testAge} يوم (عمر العينة: ${sampleAgeDays ?? "—"} يوم)`
                        : `المطلوب عند ${sampleAgeDays ?? "—"} يوم`
                      : testAge != null
                        ? `Required — ${testAge}-day test (sample age: ${sampleAgeDays ?? "—"} days)`
                        : `Required at ${sampleAgeDays ?? "—"} days`}
                  </p>
                  <p className="text-3xl font-bold text-slate-800">{requiredAtAge.toFixed(1)}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
                <div className={`rounded-xl p-4 text-center border ${
                  fck !== null
                    ? fck >= specStr ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    : "bg-slate-50"
                }`}>
                  <p className="text-xs text-slate-500 mb-1">
                    {`Char. Strength fck (n=${n}, k=${k?.toFixed(2) ?? "—"})`}
                  </p>
                  {fck !== null ? (
                    <>
                      <p className={`text-3xl font-bold ${fck >= specStr ? "text-green-700" : "text-red-700"}`}>
                        {fck.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-400">N/mm²</p>
                      <p className="text-xs mt-1">
                        {fck >= specStr ? "✓ Meets requirement" : "✗ Below requirement"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400 mt-2">
                      {n < 3 ? "Min 3 samples required" : "—"}
                    </p>
                  )}
                </div>
              </div>
              <ResultBanner
                result={overallResult}
                testName={ar ? "قوة الضغط لمكعبات الخرسانة" : "Compressive Strength of Concrete Cubes"}
                standard="BS EN 12390-3"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">
              {ar ? "ملاحظات الاختبار" : "Test Notes / Observations"}
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={ar ? "أدخل أي ملاحظات أو معلومات إضافية..." : "Enter any observations or additional information..."}
              rows={3}
              disabled={submitted}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
