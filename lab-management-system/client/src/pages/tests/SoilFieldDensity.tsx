import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Field Density Test (Relative Compaction) — Sand Replacement Method ───────
// Standards: BS 1377-9 / ASTM D1556
const METHODS = {
  SAND_REPLACEMENT: { label: "Sand Replacement Method (BS 1377-9)" },
  CORE_CUTTER: { label: "Core Cutter Method" },
} as const;

type Method = keyof typeof METHODS;

interface FieldDensityParams {
  testMethod: Method;
  mdd: string; // MDD (g/cm³)
  mddReference: string; // lab test reference for MDD source
  coneNo: string;
  wtSandInCone: string; // g
  bulkDensityOfSand: string; // g/cc
  requiredCompaction: string; // %
  location: string;
}

interface TestPoint {
  id: string;
  pointNumber: number;
  // User inputs
  location: string;
  depth: string;
  wtWetSoilFromHole: string;
  wtSandInCylinderBefore: string;
  wtSandInCylinderAfter: string;
  containerNo: string;
  wtWetSoilPlusContainer: string;
  wtDrySoilPlusContainer: string;
  wtContainer: string;
}

interface ComputedPoint extends TestPoint {
  bulkDensity: number;
  wtMoisture: number;
  wtDrySoil: number;
  moistureContent: number;
  dryDensity: number;
  compaction: number;
  result: "pass" | "fail" | null;
}

// Round half away from zero (so .5 rounds up) and format to fixed decimals.
function fmtHalfUp(v: number, dec: number): string {
  if (!Number.isFinite(v)) return "—";
  const factor = 10 ** dec;
  return (Math.round((v + Number.EPSILON) * factor) / factor).toFixed(dec);
}

function createEmptyTestPoint(pointNumber: number): TestPoint {
  return {
    id: `pt_${Date.now()}_${pointNumber}`,
    pointNumber,
    location: "",
    depth: "",
    wtWetSoilFromHole: "",
    wtSandInCylinderBefore: "",
    wtSandInCylinderAfter: "",
    containerNo: "",
    wtWetSoilPlusContainer: "",
    wtDrySoilPlusContainer: "",
    wtContainer: "",
  };
}

function computePoint(point: TestPoint, params: FieldDensityParams): ComputedPoint {
  const mdd = parseFloat(params.mdd) || 0;
  const wtSandInCone = parseFloat(params.wtSandInCone) || 0;
  const bulkDensitySand = parseFloat(params.bulkDensityOfSand) || 0;
  const requiredCompaction = parseFloat(params.requiredCompaction) || 95;

  const wtWetSoil = parseFloat(point.wtWetSoilFromHole) || 0;
  const sandBefore = parseFloat(point.wtSandInCylinderBefore) || 0;
  const sandAfter = parseFloat(point.wtSandInCylinderAfter) || 0;
  const wtWetSoilPlusCont = parseFloat(point.wtWetSoilPlusContainer) || 0;
  const wtDrySoilPlusCont = parseFloat(point.wtDrySoilPlusContainer) || 0;
  const wtCont = parseFloat(point.wtContainer) || 0;

  // Bulk Density (g/cc) = wtWetSoil / ((sandBefore - sandAfter - wtSandInCone) / bulkDensitySand)
  const volumeHole = bulkDensitySand > 0 ? (sandBefore - sandAfter - wtSandInCone) / bulkDensitySand : 0;
  const bulkDensity = volumeHole > 0 ? wtWetSoil / volumeHole : 0;

  // Wt. of moisture = wtWetSoilPlusContainer - wtDrySoilPlusContainer
  const wtMoisture = wtWetSoilPlusCont - wtDrySoilPlusCont;

  // Wt. of dry soil = wtDrySoilPlusContainer - wtContainer
  const wtDrySoil = wtDrySoilPlusCont - wtCont;

  // Moisture content % = (wtMoisture / wtDrySoil) × 100
  const moistureContent = wtDrySoil > 0 ? (wtMoisture / wtDrySoil) * 100 : 0;

  // Dry Density (g/cc) = bulkDensity / (100 + moistureContent) × 100
  const dryDensity = bulkDensity > 0 ? (bulkDensity / (100 + moistureContent)) * 100 : 0;

  // Compaction % = (dryDensity / MDD) × 100, rounded to the nearest whole %
  // (94.8 → 95, 94.2 → 94). Pass when the rounded RC ≥ required compaction.
  const compactionRaw = mdd > 0 && dryDensity > 0 ? (dryDensity / mdd) * 100 : 0;
  const compaction = Math.round(compactionRaw);

  const result: "pass" | "fail" | null =
    compactionRaw > 0 ? (compaction >= requiredCompaction ? "pass" : "fail") : null;

  return {
    ...point,
    bulkDensity: parseFloat(bulkDensity.toFixed(3)),
    wtMoisture: parseFloat(wtMoisture.toFixed(2)),
    wtDrySoil: parseFloat(wtDrySoil.toFixed(2)),
    moistureContent: parseFloat(moistureContent.toFixed(2)),
    dryDensity: parseFloat(dryDensity.toFixed(3)),
    compaction,
    result,
  };
}

export default function SoilFieldDensity() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [params, setParams] = useState<FieldDensityParams>({
    testMethod: "SAND_REPLACEMENT",
    mdd: "",
    mddReference: "",
    coneNo: "",
    wtSandInCone: "",
    bulkDensityOfSand: "",
    requiredCompaction: "95",
    location: "",
  });
  const [notes, setNotes] = useState("");
  const [testPoints, setTestPoints] = useState<TestPoint[]>([createEmptyTestPoint(1)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const computedPoints = testPoints.map((p) => computePoint(p, params));
  const allResults = computedPoints.filter((p) => p.result !== null);
  const overallPass = allResults.length > 0 && allResults.every((p) => p.result === "pass");
  const failedPoints = allResults.filter((p) => p.result === "fail").length;
  const overallResult: "pass" | "fail" | "pending" =
    allResults.length === 0 ? "pending" : overallPass ? "pass" : "fail";

  const updatePoint = (idx: number, field: keyof TestPoint, value: string) => {
    setTestPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const addTestPoint = () => {
    setTestPoints((prev) => [...prev, createEmptyTestPoint(prev.length + 1)]);
  };

  const deletePoint = (id: string) => {
    setTestPoints((prev) =>
      prev.filter((p) => p.id !== id).map((p, idx) => ({ ...p, pointNumber: idx + 1 }))
    );
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && allResults.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة نقطة اختبار واحدة على الأقل" : "Please enter at least one test point result");
      return;
    }
    setSaving(true);
    try {
      const formData = {
        testMethod: params.testMethod,
        mdd: parseFloat(params.mdd) || 0,
        mddReference: params.mddReference,
        coneNo: params.coneNo,
        wtSandInCone: parseFloat(params.wtSandInCone) || 0,
        bulkDensityOfSand: parseFloat(params.bulkDensityOfSand) || 0,
        requiredCompaction: parseFloat(params.requiredCompaction) || 95,
        location: params.location,
        testPoints: computedPoints.map((p) => ({
          pointNumber: p.pointNumber,
          location: p.location,
          depth: parseFloat(p.depth) || 0,
          wtWetSoilFromHole: parseFloat(p.wtWetSoilFromHole) || 0,
          wtSandInCylinderBefore: parseFloat(p.wtSandInCylinderBefore) || 0,
          wtSandInCylinderAfter: parseFloat(p.wtSandInCylinderAfter) || 0,
          containerNo: p.containerNo,
          wtWetSoilPlusContainer: parseFloat(p.wtWetSoilPlusContainer) || 0,
          wtDrySoilPlusContainer: parseFloat(p.wtDrySoilPlusContainer) || 0,
          wtContainer: parseFloat(p.wtContainer) || 0,
          bulkDensity: p.bulkDensity,
          wtMoisture: p.wtMoisture,
          wtDrySoil: p.wtDrySoil,
          moistureContent: p.moistureContent,
          dryDensity: p.dryDensity,
          compaction: p.compaction,
          result: p.result,
        })),
        overallResult,
        failedPoints,
        totalPoints: allResults.length,
      };

      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "SOIL_FIELD_DENSITY",
        formTemplate: "soil_field_density",
        formData,
        overallResult,
        summaryValues: {
          method: params.testMethod,
          mdd: parseFloat(params.mdd) || 0,
          requiredCompaction: parseFloat(params.requiredCompaction) || 95,
          pointsTested: allResults.length,
          failedPoints,
          overallResult,
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
            {ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const inputCls = "h-8 text-xs text-center bg-white border border-slate-300";
  const inputTdCls = "border border-slate-200 px-1 py-1 bg-amber-50/60";
  const thCls = "border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-600";
  const subThCls = "border border-slate-200 px-1.5 py-1.5 text-[10px] font-medium text-slate-500 leading-tight";

  return (
    <DashboardLayout>
      {/* Remove number input spinners */}
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات التربة / الكثافة الحقلية" : "Soil Tests / Field Density"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار الكثافة الحقلية (نسبة الدمك)" : "Field Density Test (Relative Compaction)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-9 / ASTM D1556 | {ar ? "التوزيع" : "Distribution"}: {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* SECTION 1: Test Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معاملات الاختبار" : "Test Parameters"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "طريقة الاختبار" : "Test Method"}</Label>
                <Select
                  value={params.testMethod}
                  onValueChange={(v) => setParams({ ...params, testMethod: v as Method })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHODS).map(([k, m]) => (
                      <SelectItem key={k} value={k}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "أقصى كثافة جافة (g/cm³)" : "MDD (g/cm³)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={params.mdd}
                  onChange={(e) => setParams({ ...params, mdd: e.target.value })}
                  className="h-9 bg-white border border-slate-300 font-mono"
                  placeholder="2.35"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "رقم المخروط" : "Cone No."}</Label>
                <Input
                  type="text"
                  value={params.coneNo}
                  onChange={(e) => setParams({ ...params, coneNo: e.target.value })}
                  className="h-9 bg-white border border-slate-300"
                  placeholder="C"
                />
              </div>
            </div>
            {/* Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "وزن الرمل في المخروط (g)" : "Wt. of sand in cone (g)"}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={params.wtSandInCone}
                  onChange={(e) => setParams({ ...params, wtSandInCone: e.target.value })}
                  className="h-9 bg-white border border-slate-300 font-mono"
                  placeholder="1390"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الكثافة الظاهرية للرمل (g/cc)" : "Bulk Density of Sand (g/cc)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={params.bulkDensityOfSand}
                  onChange={(e) => setParams({ ...params, bulkDensityOfSand: e.target.value })}
                  className="h-9 bg-white border border-slate-300 font-mono"
                  placeholder="1.45"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نسبة الدمك المطلوبة (%)" : "Required Relative Compaction (%)"}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={params.requiredCompaction}
                  onChange={(e) => setParams({ ...params, requiredCompaction: e.target.value })}
                  className="h-9 bg-white border border-slate-300 font-mono"
                  placeholder="95"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الموقع / المنطقة" : "Location / Area"}</Label>
                <Input
                  type="text"
                  value={params.location}
                  onChange={(e) => setParams({ ...params, location: e.target.value })}
                  className="h-9 bg-white border border-slate-300"
                  placeholder={ar ? "مثال: طبقة الأساس، الطبقة 3" : "e.g. Road base layer, Layer 3"}
                />
              </div>
            </div>
            {/* Row 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مرجع اختبار MDD (رقم التقرير المختبري)" : "MDD Source — Lab Test Reference"}</Label>
                <Input
                  type="text"
                  value={params.mddReference}
                  onChange={(e) => setParams({ ...params, mddReference: e.target.value })}
                  className="h-9 bg-white border border-slate-300"
                  placeholder={ar ? "مثال: LAB-2026-01-12345" : "e.g. LAB-2026-01-12345"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2 + 4: Test Points Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نقاط الاختبار الميداني" : "Field Test Points"}</CardTitle>
              <Button variant="outline" size="sm" onClick={addTestPoint}>
                <Plus size={14} className="mr-1" /> {ar ? "إضافة نقطة" : "Add Point"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* Main header row */}
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className={thCls}>{ar ? "رقم النقطة" : "Point No."}</th>
                    <th rowSpan={2} className={thCls}>{ar ? "الموقع" : "Location"}</th>
                    <th rowSpan={2} className={thCls}>{ar ? "العمق (م)" : "Depth (m)"}</th>
                    <th colSpan={3} className={thCls}>{ar ? "استبدال الرمل" : "Sand Replacement"}</th>
                    <th rowSpan={2} className={`${thCls} bg-blue-50`}>
                      {ar ? "الكثافة الرطبة الموقعية للتربة" : "In-situ Wet Density of Soil"}<br />(Mg/m³)
                    </th>
                    <th colSpan={4} className={thCls}>{ar ? "تحليل الرطوبة" : "Moisture Analysis"}</th>
                    <th colSpan={3} className={`${thCls} bg-green-50`}>{ar ? "النتائج" : "Results"}</th>
                    <th rowSpan={2} className={thCls}>{ar ? "الإجراء" : "Action"}</th>
                  </tr>
                  {/* Sub-header row */}
                  <tr className="bg-slate-50">
                    <th className={subThCls}>{ar ? "وزن التربة الرطبة من الحفرة (g)" : "Wt. wet soil from hole (g)"}</th>
                    <th className={subThCls}>{ar ? "وزن الرمل في الأسطوانة قبل (g)" : "Wt. sand in cylinder before (g)"}</th>
                    <th className={subThCls}>{ar ? "وزن الرمل في الأسطوانة بعد (g)" : "Wt. sand in cylinder after (g)"}</th>
                    <th className={subThCls}>{ar ? "رقم العلبة" : "Container No."}</th>
                    <th className={subThCls}>{ar ? "تربة رطبة + علبة (g)" : "Wet soil + container (g)"}</th>
                    <th className={subThCls}>{ar ? "تربة جافة + علبة (g)" : "Dry soil + container (g)"}</th>
                    <th className={subThCls}>{ar ? "وزن العلبة (g)" : "Wt. container (g)"}</th>
                    <th className={`${subThCls} bg-green-50`}>{ar ? "محتوى الرطوبة %" : "W.C. (%)"}</th>
                    <th className={`${subThCls} bg-green-50`}>{ar ? "الكثافة الجافة (Mg/m³)" : "Dry Density (Mg/m³)"}</th>
                    <th className={`${subThCls} bg-green-50`}>{ar ? "درجة الدمك (%)" : "Degree of Compaction (%)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {computedPoints.map((point, idx) => (
                    <tr key={point.id}>
                      <td className="border border-slate-200 px-2 py-1 text-center font-semibold text-xs text-slate-700">
                        P{point.pointNumber}
                      </td>
                      <td className={inputTdCls}>
                        <Input type="text" value={point.location}
                          onChange={(e) => updatePoint(idx, "location", e.target.value)}
                          className={`${inputCls} text-left`} placeholder={ar ? "نقطة 1" : "Point 1"} />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.depth}
                          onChange={(e) => updatePoint(idx, "depth", e.target.value)}
                          className={inputCls} placeholder="0.3" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtWetSoilFromHole}
                          onChange={(e) => updatePoint(idx, "wtWetSoilFromHole", e.target.value)}
                          className={inputCls} placeholder="8189" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtSandInCylinderBefore}
                          onChange={(e) => updatePoint(idx, "wtSandInCylinderBefore", e.target.value)}
                          className={inputCls} placeholder="8000" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtSandInCylinderAfter}
                          onChange={(e) => updatePoint(idx, "wtSandInCylinderAfter", e.target.value)}
                          className={inputCls} placeholder="1288" />
                      </td>
                      {/* In-situ Wet Density of Soil — calculated (blue) */}
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs font-bold bg-blue-50 text-blue-800">
                        {point.bulkDensity > 0 ? fmtHalfUp(point.bulkDensity, 2) : "—"}
                      </td>
                      <td className={inputTdCls}>
                        <Input type="text" value={point.containerNo}
                          onChange={(e) => updatePoint(idx, "containerNo", e.target.value)}
                          className={inputCls} placeholder="28" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtWetSoilPlusContainer}
                          onChange={(e) => updatePoint(idx, "wtWetSoilPlusContainer", e.target.value)}
                          className={inputCls} placeholder="1531" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtDrySoilPlusContainer}
                          onChange={(e) => updatePoint(idx, "wtDrySoilPlusContainer", e.target.value)}
                          className={inputCls} placeholder="1478" />
                      </td>
                      <td className={inputTdCls}>
                        <Input type="number" step="0.1" value={point.wtContainer}
                          onChange={(e) => updatePoint(idx, "wtContainer", e.target.value)}
                          className={inputCls} placeholder="291.3" />
                      </td>
                      {/* Moisture Content — calculated (blue) */}
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs font-semibold bg-blue-50 text-blue-800">
                        {point.moistureContent > 0 ? `${fmtHalfUp(point.moistureContent, 1)}%` : "—"}
                      </td>
                      {/* Dry Density — final (green) */}
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs font-bold bg-green-50 text-green-800">
                        {point.dryDensity > 0 ? fmtHalfUp(point.dryDensity, 2) : "—"}
                      </td>
                      {/* RC % — final (green, pass/fail tint) */}
                      <td
                        className={`border border-slate-200 px-2 py-1 text-center font-mono text-xs font-bold ${
                          point.result === "pass"
                            ? "bg-green-50 text-emerald-700"
                            : point.result === "fail"
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-slate-500"
                        }`}
                      >
                        {point.compaction > 0 ? `${point.compaction}%` : "—"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {testPoints.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deletePoint(point.id)}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={15} className="border border-slate-200 px-3 py-2 text-[11px] text-slate-500 bg-slate-50">
                      {ar
                        ? `نسبة الدمك المطلوبة: ${params.requiredCompaction || 95}% | النجاح = نسبة الدمك ≥ ${params.requiredCompaction || 95}%`
                        : `Required Compaction: ${params.requiredCompaction || 95}% | Pass = RC ≥ ${params.requiredCompaction || 95}%`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: Overall Result */}
        {allResults.length > 0 && (
          <Card className={overallPass ? "border-emerald-200" : "border-red-200"}>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div
                  className={`text-xl font-extrabold ${overallPass ? "text-emerald-700" : "text-red-700"}`}
                >
                  {overallPass ? (ar ? "✓ مطابق" : "✓ PASS") : (ar ? "✗ غير مطابق" : "✗ FAIL")}
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xs text-slate-500">{ar ? "إجمالي النقاط" : "Total Points"}</div>
                    <div className="text-lg font-bold text-slate-800">{allResults.length}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-500">{ar ? "ناجح" : "Passed"}</div>
                    <div className="text-lg font-bold text-emerald-700">
                      {allResults.filter((p) => p.result === "pass").length}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-500">{ar ? "راسب" : "Failed"}</div>
                    <div className="text-lg font-bold text-red-700">{failedPoints}</div>
                  </div>
                </div>
              </div>
              {!overallPass && failedPoints > 0 && (
                <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
                  {ar
                    ? `${failedPoints} نقطة خارج الحد المطلوب (${params.requiredCompaction || 95}%)`
                    : `${failedPoints} point(s) below required compaction (${params.requiredCompaction || 95}%)`}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
