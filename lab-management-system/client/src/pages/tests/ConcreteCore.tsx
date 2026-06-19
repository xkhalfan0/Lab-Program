import { useState, useCallback, useEffect, useRef } from "react";
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
import { Send, FlaskConical, Info, Printer, UserCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── L/D Correction Factors (BS EN 12504-1) ─────────────────────────────
// BS EN 12504-1 Table 1 — L/D correction factors.
// BUGS FIXED:
//  1. Missing 0.96–1.04 no-correction range. L/D=1.00 was returning
//     0.82 — wrong. Per BS EN 12504-1, L/D 0.96–1.04 → CF = 1.00.
//  2. Wrong table values: old 1.50→0.96 (correct: 0.93),
//     old 1.25→0.93 (correct: 0.87).
//  3. No interpolation — now uses linear interpolation.

const LD_CORRECTION_TABLE = [
  { ld: 1.00, cf: 0.80 },
  { ld: 1.10, cf: 0.82 },
  { ld: 1.25, cf: 0.87 },
  { ld: 1.50, cf: 0.93 },
  { ld: 1.75, cf: 0.97 },
  { ld: 2.00, cf: 1.00 },
] as const;

/** Density from immersion weights (kg/m³); rounded to nearest 10 kg/m³. */
function calculateDensityFromWeights(
  weightInAir: number,
  weightInAirSSD: number,
  weightInWater: number
): number | null {
  if (!weightInAir || !weightInAirSSD || !weightInWater) return null;
  if (weightInAir <= 0 || weightInAirSSD <= 0 || weightInWater <= 0) return null;
  const denominator = weightInAirSSD - weightInWater;
  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  const raw = (weightInAir / denominator) * 1000;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw / 10) * 10;
}

function getLDCorrectionFactor(ld: number): { cf: number; isCylinderStrength: boolean; noCorrection: boolean } {
  // Priority 1: no-correction range — MUST be checked before table
  if (ld >= 0.96 && ld <= 1.04) {
    return { cf: 1.00, isCylinderStrength: false, noCorrection: true };
  }
  // Priority 2: cylinder strength
  if (ld >= 2.00) {
    return { cf: 1.00, isCylinderStrength: true, noCorrection: false };
  }
  // Priority 3: linear interpolation between table values
  for (let i = 0; i < LD_CORRECTION_TABLE.length - 1; i++) {
    const lo = LD_CORRECTION_TABLE[i];
    const hi = LD_CORRECTION_TABLE[i + 1];
    if (ld >= lo.ld && ld < hi.ld) {
      const t = (ld - lo.ld) / (hi.ld - lo.ld);
      const cf = lo.cf + t * (hi.cf - lo.cf);
      return { cf: parseFloat(cf.toFixed(3)), isCylinderStrength: false, noCorrection: false };
    }
  }
  // Fallback: very short cores (L/D < 1.00)
  return { cf: 0.80, isCylinderStrength: false, noCorrection: false };
}

interface CoreRow {
  id: string;
  coreNo: string;
  diameter: string;
  length: string; // Length (mm) for L/D and density volume when weights absent
  weightInAir: string;     // Weight in air (g)
  weightInAirSSD: string;  // Weight in air SSD (g)
  weightInWater: string;   // Weight in water (g)
  maxLoad: string;
  area?: number;
  ld?: number;
  correctionFactor?: number;
  density?: number;        // kg/m³ rounded to nearest 10
  coreStrength?: number;
  equivalentCubeStrength?: number;
  isCylinderStrength?: boolean; // true when L/D ≥ 2.0 (result is cylinder strength, not eq. cube)
  noLDCorrection?: boolean;
  result?: "pass" | "fail" | "pending";
}

/** Core strength N/mm² from max load (kN) and cross-section area (mm²). */
function calculateCoreStrength(maxLoadKN: number, areaSquareMM: number): number | null {
  if (!maxLoadKN || !areaSquareMM) return null;
  const v = (maxLoadKN * 1000) / areaSquareMM;
  return Number.isFinite(v) ? v : null;
}

/** Returns an error message if weight fields are partially filled or inconsistent. */
function validateCoreWeights(row: CoreRow, ar: boolean): string | null {
  const a = row.weightInAir?.trim();
  const s = row.weightInAirSSD?.trim();
  const w = row.weightInWater?.trim();
  const any = Boolean(a || s || w);
  if (!any) return null;
  const na = a ? parseFloat(a) : NaN;
  const ns = s ? parseFloat(s) : NaN;
  const nw = w ? parseFloat(w) : NaN;
  if (!a || !s || !w) {
    return ar ? "أدخل الأوزان الثلاثة معاً أو اتركها فارغة" : "Enter all three weight fields together, or leave all empty";
  }
  if (![na, ns, nw].every(n => Number.isFinite(n) && n > 0)) {
    return ar ? "الأوزان يجب أن تكون أرقاماً موجبة" : "All weights must be positive numbers";
  }
  if (ns < na) {
    return ar ? "وزن SSD يجب أن يكون ≥ وزن الهواء" : "Weight in Air (SSD) should be ≥ Weight in Air";
  }
  if (nw >= na) {
    return ar ? "وزن الماء يجب أن يكون < وزن الهواء" : "Weight in Water should be < Weight in Air";
  }
  if (ns - nw === 0) {
    return ar ? "SSD − وزن الماء يجب أن يكون ≠ 0" : "SSD − water weight must be non-zero for density";
  }
  return null;
}

function newRow(index: number): CoreRow {
  return {
    id: `row_${Date.now()}_${index}`,
    coreNo: `C${index + 1}`,
    diameter: "100",
    length: "",
    weightInAir: "",
    weightInAirSSD: "",
    weightInWater: "",
    maxLoad: "",
  };
}

function rowsFromQuantity(quantity: number | null | undefined): CoreRow[] {
  const n = Math.max(1, Math.min(999, Number(quantity) || 1));
  return Array.from({ length: n }, (_, i) => newRow(i));
}

function computeRow(row: CoreRow, specifiedCubeStrength: number): CoreRow {
  const d = parseFloat(row.diameter);
  const l = parseFloat(row.length);
  const load = parseFloat(row.maxLoad);
  if (!d || !l || !load) {
    const dOnly = parseFloat(row.diameter);
    const lOnly = parseFloat(row.length);
    const wAir = parseFloat(row.weightInAir || "");
    const wSsd = parseFloat(row.weightInAirSSD || "");
    const wWat = parseFloat(row.weightInWater || "");
    const fromW = calculateDensityFromWeights(wAir, wSsd, wWat);
    const density: number | undefined = fromW ?? undefined;
    if (density != null && dOnly && lOnly) {
      const areaOnly = Math.PI * (dOnly / 2) ** 2;
      return { ...row, area: Math.round(areaOnly), density };
    }
    if (density != null) return { ...row, density };
    return row;
  }
  const area = Math.PI * (d / 2) ** 2;
  const ld = l / d;
  const { cf, isCylinderStrength, noCorrection } = getLDCorrectionFactor(ld);
  const coreStrRaw = calculateCoreStrength(load, area);
  const coreStr = coreStrRaw != null ? coreStrRaw : 0;
  const eqCubeStr = coreStr * cf;
  // When L/D >= 2.0: result is cylinder strength (not equivalent cube strength)
  // BS EN 12504-1: at L/D=2, CF=1.0 and result is treated as cylinder strength
  // BS EN 13791 Method A: Eq. cube strength ≥ 0.85 × fck
  // ORIGINAL used 1.0 × fck — too strict. Valid cores were failing.
  const required = specifiedCubeStrength * 0.85;
  const coreStrRounded = coreStrRaw != null ? Math.round(coreStrRaw * 10) / 10 : 0;
  const eqCubeStrRounded = Math.round(eqCubeStr * 10) / 10;

  // Density: immersion method only (kg/m³)
  const wAir = parseFloat(row.weightInAir || "");
  const wSsd = parseFloat(row.weightInAirSSD || "");
  const wWat = parseFloat(row.weightInWater || "");
  let density: number | undefined;
  const fromWeights = calculateDensityFromWeights(wAir, wSsd, wWat);
  if (fromWeights != null) {
    density = fromWeights;
  }

  return {
    ...row,
    area: Math.round(area),
    ld: parseFloat(ld.toFixed(2)),
    correctionFactor: parseFloat(cf.toFixed(3)),
    density,
    coreStrength: load ? coreStrRounded : undefined,
    equivalentCubeStrength: eqCubeStrRounded,
    isCylinderStrength,
    noLDCorrection: noCorrection,
    result: eqCubeStrRounded >= required ? "pass" : "fail",
  };
}

export default function ConcreteCore() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing, isFetched: existingFetched } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  const initFromDistRef = useRef(false);

  useEffect(() => {
    initFromDistRef.current = false;
  }, [distId]);

  const coreCount = Math.max(1, Math.min(999, Number(dist?.quantity) || 1));

  const [specifiedStrength, setSpecifiedStrength] = useState("30");
  const [coreType, setCoreType] = useState("Drilled Core");
  const [endCondition, setEndCondition] = useState("as-drilled"); // as-drilled | grinded | capped
  const [structureType, setStructureType] = useState("");
  const [castDate, setCastDate] = useState("");
  const [testDate, setTestDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<CoreRow[]>([]);
  const [saving, setSaving] = useState(false);

  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Test results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!dist?.castingDate) return;
    const iso = new Date(dist.castingDate).toISOString().split("T")[0];
    setCastDate(prev => prev || iso);
  }, [dist?.castingDate]);

  // Load existing data
  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as any;
    if (fd.specifiedCubeStrength) setSpecifiedStrength(String(fd.specifiedCubeStrength));
    if (fd.coreType) setCoreType(fd.coreType);
    if (fd.endCondition) setEndCondition(fd.endCondition);
    if (fd.structureType) setStructureType(fd.structureType);
    if (fd.castDate) setCastDate(String(fd.castDate).split("T")[0]);
    if (fd.testDate) setTestDate(String(fd.testDate).split("T")[0]);
    if (fd.notes) setNotes(fd.notes);
    if (fd.cores && Array.isArray(fd.cores)) {
      setRows(fd.cores.map((c: any) => ({
        id: c.id || `row_${Date.now()}_${Math.random()}`,
        coreNo: c.coreNo || "",
        diameter: String(c.diameter || "100"),
        length: String(c.length || c.lengthAfterCap || ""),
        weightInAir: String(c.weightInAir ?? ""),
        weightInAirSSD: String(c.weightInAirSSD ?? ""),
        weightInWater: String(c.weightInWater ?? ""),
        maxLoad: String(c.maxLoad || ""),
      })));
    }
       if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  // Row count fixed to reception/distribution quantity when no saved cores yet
  useEffect(() => {
    if (!dist || !existingFetched) return;
    const fd = existing?.formData as { cores?: unknown[] } | undefined;
    if (Array.isArray(fd?.cores) && fd.cores.length > 0) return;
    if (initFromDistRef.current) return;
    setRows(rowsFromQuantity(dist.quantity));
    initFromDistRef.current = true;
  }, [dist, existingFetched, existing?.formData]);

  const ageDays =
    castDate && testDate
      ? Math.round((new Date(testDate).getTime() - new Date(castDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

  const specStr = parseFloat(specifiedStrength) || 30;
  const computedRows = rows.map(r => computeRow(r, specStr));
  const validRows = computedRows.filter(r => r.equivalentCubeStrength && r.equivalentCubeStrength > 0);
  const avgEqStrength = validRows.length > 0
    ? validRows.reduce((s, r) => s + (r.equivalentCubeStrength ?? 0), 0) / validRows.length
    : 0;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.result === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof CoreRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    for (const r of rows) {
      const wErr = validateCoreWeights(r, ar);
      if (wErr) {
        toast.error(wErr);
        return;
      }
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة لب واحدة على الأقل" : "Please enter at least one core result");
      return;
    }
    if (status === "submitted" && validRows.length < coreCount) {
      toast.error(
        ar
          ? `الرجاء إدخال نتائج لجميع اللبابات (${coreCount}) حسب الكمية المسجلة في الاستلام`
          : `Please enter results for all ${coreCount} core(s) registered at reception`,
      );
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "CONC_CORE",
        formTemplate: "concrete_cores",
        formData: {
          specifiedCubeStrength: specStr,
          coreType,
          endCondition,
          structureType,
          castDate: castDate || undefined,
          testDate: testDate || undefined,
          ageDays: ageDays ?? undefined,
          cores: computedRows.map(r => ({
            ...r,
            testDateMs: testDate ? new Date(testDate).getTime() : undefined,
          })),
          avgEquivalentCubeStrength: Math.round(avgEqStrength * 10) / 10,
        },
        overallResult,
        summaryValues: {
          avgEqStrength: avgEqStrength.toFixed(2),
          required: (specStr * 0.85).toFixed(1),
          coreCount: validRows.length,
          registeredQuantity: coreCount,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const LD_TABLE = [
    { ld: "0.96–1.04", cf: "1.00 (no correction)" },
    { ld: "1.00", cf: "0.80" },
    { ld: "1.10", cf: "0.82" },
    { ld: "1.25", cf: "0.87" },
    { ld: "1.50", cf: "0.93" },
    { ld: "1.75", cf: "0.97" },
    { ld: "2.00", cf: "1.00 (cylinder strength)" },
  ];

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
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الخرسانة" : "Concrete Tests"}</span>
              <span>/</span>
              <span className="font-medium text-slate-700">
                {ar ? "قوة الضغط لعينات الخرسانة اللبية" : "Compressive Strength of Concrete Cores"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "قوة الضغط لعينات الخرسانة اللبية" : "Compressive Strength of Concrete Cores"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {ar ? "BS EN 12504-1 | أمر التوزيع:" : "BS EN 12504-1 | Distribution:"}{" "}
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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* General Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "مقاومة المكعب المحددة (نيوتن/مم²)" : "Specified Cube Strength (N/mm²)"}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={specifiedStrength}
                  onChange={e => setSpecifiedStrength(e.target.value)}
                  placeholder={ar ? "مثال: 30" : "e.g. 30"}
                  className="font-mono"
                  disabled={submitted}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع اللب" : "Core Type"}</Label>
                <Select value={coreType} onValueChange={setCoreType} disabled={submitted}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Drilled Core">{ar ? "لب محفور" : "Drilled Core"}</SelectItem>
                    <SelectItem value="Cut Core">{ar ? "لب مقطوع" : "Cut Core"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "حالة سطح النهاية" : "End Condition"}</Label>
                <Select value={endCondition} onValueChange={setEndCondition} disabled={submitted}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="as-drilled">{ar ? "كما حفر (As-Drilled)" : "As-Drilled"}</SelectItem>
                    <SelectItem value="grinded">{ar ? "مطحون (Grinded)" : "Grinded"}</SelectItem>
                    <SelectItem value="capped">{ar ? "مغطى (Capped)" : "Capped"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الهيكل" : "Structure Type"}</Label>
                <Input
                  value={structureType}
                  onChange={e => setStructureType(e.target.value)}
                  placeholder={ar ? "مثال: عمود، بلاطة، جدار" : "e.g. Column, Slab, Wall"}
                  disabled={submitted}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "تاريخ الصب" : "Date Cast"}</Label>
                <Input type="date" value={castDate} onChange={e => setCastDate(e.target.value)} disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "تاريخ الفحص" : "Test Date"}</Label>
                <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "العمر (يوم)" : "Age (days)"}</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-slate-50 text-sm font-mono font-semibold">
                  {ageDays !== null && ageDays >= 0 ? ageDays : "—"}
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-end col-span-2 md:col-span-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 w-full space-y-1">
                  <div>
                    <Info size={12} className="inline mr-1" />
                    {ar
                      ? `ناجح: قوة المكعب المكافئة ≥ 0.85 × fck = ${(specStr * 0.85).toFixed(1)} N/mm² — BS EN 13791`
                      : `Pass: Eq. cube strength ≥ 0.85 × fck = ${(specStr * 0.85).toFixed(1)} N/mm² — BS EN 13791 Method A`}
                  </div>
                  <div className="text-amber-700">
                    <Info size={12} className="inline mr-1" />
                    {ar
                      ? "تنبيه: عند L/D = 2 تُعتبر النتيجة قوة أسطوانة (Cylinder Strength) وليس قوة مكعب مكافئة"
                      : "Note: When L/D = 2, the result is Cylinder Strength — not equivalent cube strength"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cores Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">{ar ? "نتائج اختبار اللب" : "Core Test Results"}</CardTitle>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
                {ar
                  ? `${coreCount} لب — الكمية من الاستلام (لا يمكن الإضافة أو الحذف)`
                  : `${coreCount} core(s) — quantity from reception (fixed)`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    { en: "Core No.", ar: "رقم اللب" },
                    { en: "Dia. (mm)", ar: "القطر (مم)" },
                    { en: "Length (mm)", ar: "الطول (مم)" },
                    { en: "Weight in Air (g)", ar: "الوزن في الهواء (غ)" },
                    { en: "Weight in Air (SSD) (g)", ar: "الوزن في الهواء SSD (غ)" },
                    { en: "Weight in Water (g)", ar: "الوزن في الماء (غ)" },
                    { en: "Density (kg/m³)", ar: "الكثافة (كغ/م³)" },
                    { en: "Max Load (kN)", ar: "الحمل الأقصى (كن)" },
                    { en: "Area (mm²)", ar: "المساحة (مم²)" },
                    { en: "L/D", ar: "L/D" },
                    { en: "CF", ar: "عامل التصحيح" },
                    { en: "Core Str. (N/mm²)", ar: "قوة اللب (نيوتن/مم²)" },
                    { en: "Eq. Cube Str. (N/mm²)", ar: "قوة المكعب المكافئة (نيوتن/مم²)" },
                    { en: "Result", ar: "النتيجة" },
                  ].map(h => (
                    <th
                      key={h.en}
                      className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap"
                    >
                      {ar ? h.ar : h.en}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.coreNo}
                        onChange={e => updateRow(row.id, "coreNo", e.target.value)}
                        className="h-7 text-xs w-14"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.diameter}
                        onChange={e => updateRow(row.id, "diameter", e.target.value)}
                        className="h-7 text-xs w-24 text-center font-mono"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.length}
                        onChange={e => updateRow(row.id, "length", e.target.value)}
                        className="h-7 text-xs w-24 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.weightInAir}
                        onChange={e => updateRow(row.id, "weightInAir", e.target.value)}
                        className="h-7 text-xs w-28 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.weightInAirSSD}
                        onChange={e => updateRow(row.id, "weightInAirSSD", e.target.value)}
                        className="h-7 text-xs w-28 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.weightInWater}
                        onChange={e => updateRow(row.id, "weightInWater", e.target.value)}
                        className="h-7 text-xs w-28 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.density != null ? row.density : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.maxLoad}
                        onChange={e => updateRow(row.id, "maxLoad", e.target.value)}
                        className="h-7 text-xs w-24 text-center font-mono"
                        placeholder="—"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.area ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.ld ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.correctionFactor ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-semibold">
                      {row.coreStrength ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                      {row.equivalentCubeStrength != null ? (
                        <span title={row.isCylinderStrength ? (ar ? "قوة أسطوانة (L/D=2)" : "Cylinder strength (L/D=2)") : undefined}>
                          {row.equivalentCubeStrength}
                          {row.isCylinderStrength && <sup className="text-amber-600 text-[9px] ml-0.5">cyl</sup>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? (
                        <PassFailBadge result={row.result} size="sm" />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          </CardContent>
        </Card>

        {/* L/D Reference */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">
              {ar
                ? "عوامل تصحيح L/D (BS EN 12504-1)"
                : "L/D Correction Factors (BS EN 12504-1)"}
            </p>
            <div className="flex gap-6 flex-wrap">
              {LD_TABLE.map(({ ld, cf }) => (
                <div key={ld} className="text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-700">L/D = {ld}</span>: CF = {cf}
                </div>
              ))}
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
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "عدد اللبابات المختبرة" : "No. of Cores Tested"}</p>
                  <p className="text-3xl font-bold text-slate-800">{validRows.length}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "متوسط قوة المكعب المكافئة" : "Avg. Eq. Cube Strength"}</p>
                  <p className="text-3xl font-bold text-slate-800">{avgEqStrength.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">
                    {ar ? `المطلوب (0.85 × ${specStr})` : `Required (0.85 × ${specStr})`}
                  </p>
                  <p className="text-3xl font-bold text-slate-800">{(specStr * 0.85).toFixed(1)}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
              </div>
              <ResultBanner
                result={overallResult}
                testName={ar ? "قوة الضغط لعينات الخرسانة اللبية" : "Compressive Strength of Concrete Cores"}
                standard="BS EN 12504-1"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">
              {ar ? "ملاحظات الاختبار / الملاحظات" : "Test Notes / Observations"}
            </Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={ar ? "أدخل أي ملاحظات أو حالات شاذة أو معلومات إضافية..." : "Enter any observations, anomalies, or additional information..."}
              rows={3}
              disabled={submitted}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
