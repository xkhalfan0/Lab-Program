/**
 * ConcreteFoam — Foamed Concrete Compressive Strength & Density Test
 * Standards: BS 1881-116 (Compressive Strength), BS 1881-114 (Density)
 *
 * Reception uses a single test code (CONC_FOAM). Strength vs density mode is selected on this form.
 *
 * Strength: compute N/mm² from load, display & compare in kg/cm² (× 10.197).
 * Density: dry density vs user-specified maximum (kg/m³).
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Printer, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

/** N/mm² (MPa) → kg/cm² */
const N_PER_MM2_TO_KG_CM2 = 10.197;

interface CubeRow {
  id: string;
  cubeNo: string;
  age: string;
  sideA: string;
  sideB: string;
  height: string;
  mass: string;
  maxLoad: string;
  area?: number;
  /** Compressive strength in kg/cm² (for display & pass/fail) */
  strength?: number;
  /** Raw strength N/mm² (optional, for audit) */
  strengthNmm2?: number;
  density?: number;
  result?: "pass" | "fail" | "pending";
}

interface DensityRow {
  id: string;
  specimenNo: string;
  length: string;
  width: string;
  height: string;
  wetMass: string;
  dryMass: string;
  volume?: number;
  freshDensity?: number;
  dryDensity?: number;
  moistureContent?: number;
  result?: "pass" | "fail" | "pending";
}

function newCubeRow(index: number, defaultAge: string): CubeRow {
  return {
    id: `cube_${Date.now()}_${index}`,
    cubeNo: `FC${index + 1}`,
    age: defaultAge,
    sideA: "100",
    sideB: "100",
    height: "100",
    mass: "",
    maxLoad: "",
  };
}

function newDensityRow(index: number): DensityRow {
  return {
    id: `den_${Date.now()}_${index}`,
    specimenNo: `D${index + 1}`,
    length: "100",
    width: "100",
    height: "100",
    wetMass: "",
    dryMass: "",
  };
}

function computeCubeRow(row: CubeRow, minStrengthKgCm2: number): CubeRow {
  const a = parseFloat(row.sideA);
  const b = parseFloat(row.sideB);
  const h = parseFloat(row.height);
  const m = parseFloat(row.mass);
  const P = parseFloat(row.maxLoad);
  if (!a || !b || !P) return { ...row, result: "pending" };
  const area = a * b;
  const strengthNmm2 = (P * 1000) / area;
  const strength = parseFloat((strengthNmm2 * N_PER_MM2_TO_KG_CM2).toFixed(2));
  const volume = a * b * h * 1e-9;
  const density = m && h ? parseFloat((m / volume).toFixed(0)) : undefined;
  const result =
    minStrengthKgCm2 > 0 ? (strength >= minStrengthKgCm2 ? "pass" : "fail") : "pending";
  return { ...row, area, strength, strengthNmm2, density, result };
}

function computeDensityRow(row: DensityRow, maxDryDensityKgM3: number): DensityRow {
  const l = parseFloat(row.length);
  const w = parseFloat(row.width);
  const h = parseFloat(row.height);
  const wet = parseFloat(row.wetMass);
  const dry = parseFloat(row.dryMass);
  if (!l || !w || !h) return { ...row, result: "pending" };
  const volume = l * w * h * 1e-9;
  const freshDensity = wet ? parseFloat((wet / volume).toFixed(0)) : undefined;
  const dryDensity = dry ? parseFloat((dry / volume).toFixed(0)) : undefined;
  const moistureContent = wet && dry ? parseFloat(((wet - dry) / dry * 100).toFixed(2)) : undefined;
  const result =
    dryDensity && maxDryDensityKgM3 > 0 ? (dryDensity <= maxDryDensityKgM3 ? "pass" : "fail") : "pending";
  return { ...row, volume: parseFloat((volume * 1e6).toFixed(2)), freshDensity, dryDensity, moistureContent, result };
}

export default function ConcreteFoam() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId || "0", 10);

  const [testMode, setTestMode] = useState<"strength" | "density">("strength");
  const [gradeLabel, setGradeLabel] = useState("");
  const [requiredStrengthKgCm2, setRequiredStrengthKgCm2] = useState("51.0");
  const [requiredMaxDryDensity, setRequiredMaxDryDensity] = useState("1400");
  const [receivedDateStr, setReceivedDateStr] = useState("");
  const [cubeRows, setCubeRows] = useState<CubeRow[]>([newCubeRow(0, "28"), newCubeRow(1, "28"), newCubeRow(2, "28")]);
  const [densityRows, setDensityRows] = useState<DensityRow[]>([newDensityRow(0), newDensityRow(1)]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId },
  );

  useEffect(() => {
    if (!distribution?.receivedAt) return;
    const d = new Date(distribution.receivedAt as string | Date);
    if (!Number.isNaN(d.getTime())) {
      setReceivedDateStr(d.toISOString().split("T")[0]);
    }
  }, [distribution?.receivedAt]);

  const testAge = useMemo(() => {
    if (!receivedDateStr) return null;
    const rd = new Date(`${receivedDateStr}T12:00:00`);
    if (Number.isNaN(rd.getTime())) return null;
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - rd.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [receivedDateStr]);

  useEffect(() => {
    if (testAge == null) return;
    setCubeRows(prev => prev.map(r => ({ ...r, age: String(testAge) })));
  }, [testAge]);

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حفظ نتائج الخرسانة الرغوية بنجاح" : "Foamed concrete results saved successfully");
      setSubmitted(true);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const minStrengthKgCm2 = parseFloat(requiredStrengthKgCm2) || 0;
  const maxDryDensityKgM3 = parseFloat(requiredMaxDryDensity) || 0;

  const computedCubes = cubeRows.map(r => computeCubeRow(r, minStrengthKgCm2));
  const computedDensity = densityRows.map(r => computeDensityRow(r, maxDryDensityKgM3));

  const validCubes = computedCubes.filter(r => r.strength !== undefined);
  const avgStrength =
    validCubes.length > 0
      ? parseFloat((validCubes.reduce((s, r) => s + (r.strength || 0), 0) / validCubes.length).toFixed(2))
      : undefined;
  const passCount = validCubes.filter(r => r.result === "pass").length;
  const overallStrengthPass = validCubes.length > 0 && passCount === validCubes.length;
  const overallStrengthBadge: "pass" | "fail" | "pending" =
    validCubes.length === 0 ? "pending" : overallStrengthPass ? "pass" : "fail";

  const validDensity = computedDensity.filter(r => r.dryDensity !== undefined);
  const avgDryDensity =
    validDensity.length > 0
      ? parseFloat((validDensity.reduce((s, r) => s + (r.dryDensity || 0), 0) / validDensity.length).toFixed(0))
      : undefined;
  const densityPassCount = validDensity.filter(r => r.result === "pass").length;
  const overallDensityPass = validDensity.length > 0 && densityPassCount === validDensity.length;
  const overallDensityBadge: "pass" | "fail" | "pending" =
    validDensity.length === 0 ? "pending" : overallDensityPass ? "pass" : "fail";

  const updateCube = useCallback((id: string, field: keyof CubeRow, value: string) => {
    setCubeRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const updateDensity = useCallback((id: string, field: keyof DensityRow, value: string) => {
    setDensityRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const handleSubmit = () => {
    if (!distribution?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (!distributionId) return;

    const overallResult: "pass" | "fail" | "pending" =
      testMode === "strength"
        ? overallStrengthBadge
        : overallDensityBadge;

    const resultData = {
      testType: "CONC_FOAM",
      testMode,
      strengthUnit: "kg/cm2" as const,
      gradeLabel,
      minStrength: minStrengthKgCm2,
      minStrengthKgCm2,
      maxDensity: maxDryDensityKgM3,
      requiredMaxDryDensityKgM3: maxDryDensityKgM3,
      receivedDate: receivedDateStr || undefined,
      testAgeDays: testAge ?? undefined,
      cubes: computedCubes,
      densitySpecimens: computedDensity,
      avgStrength,
      avgDryDensity,
      overallStrengthPass,
      overallDensityPass,
      notes,
      submittedBy: user?.name,
      submittedAt: new Date().toISOString(),
    };

    saveMut.mutate({
      distributionId: distId,
      sampleId: distribution.sampleId,
      testTypeCode: distribution.testType ?? "CONC_FOAM",
      formTemplate: "concrete_foam",
      formData: resultData,
      overallResult,
      notes,
      status: "submitted",
    });
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
      <div className="container max-w-5xl py-6 space-y-6">
        <SampleInfoCard dist={distribution} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-500" />
              {ar ? "فحص الخرسانة الرغوية" : "Foamed Concrete Test"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">BS 1881-116 (Strength) | BS 1881-114 (Density)</p>
          </div>
          {distribution && (
            <Badge variant="outline" className="text-sm">
              {distribution.distributionCode} — {distribution.testName}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "إعدادات الفحص" : "Test Settings"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>{ar ? "نوع الفحص" : "Test Type"}</Label>
              <Select value={testMode} onValueChange={v => setTestMode(v as "strength" | "density")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">{ar ? "مقاومة الضغط" : "Strength"}</SelectItem>
                  <SelectItem value="density">{ar ? "الكثافة" : "Density"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{ar ? "التدرج / الدرجة (نص)" : "Grade (text)"}</Label>
              <Input
                value={gradeLabel}
                onChange={e => setGradeLabel(e.target.value)}
                placeholder={ar ? "مثال: FC مخصص، مواصفات المشروع…" : "e.g. Project spec, mix ID…"}
              />
            </div>
            <div>
              <Label>{ar ? "المقاومة المطلوبة (كجم/سم²)" : "Required Strength (kg/cm²)"}</Label>
              <Input
                value={requiredStrengthKgCm2}
                onChange={e => setRequiredStrengthKgCm2(e.target.value)}
                type="number"
                step="0.1"
                min="0"
              />
            </div>
            <div>
              <Label>{ar ? "أقصى كثافة جافة مسموحة (كجم/م³)" : "Required max dry density (kg/m³)"}</Label>
              <Input
                value={requiredMaxDryDensity}
                onChange={e => setRequiredMaxDryDensity(e.target.value)}
                type="number"
                step="10"
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {ar ? "العينة تكون مطابقة إذا كانت الكثافة الجافة ≤ هذا الحد" : "Pass when dry density ≤ this limit"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{ar ? "أمر التوزيع" : "Distribution"}</Label>
              <Input value={distribution?.distributionCode || "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "اسم الاختبار" : "Test Name"}</Label>
              <Input value={distribution?.testName || "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "تاريخ الاستلام" : "Received Date"}</Label>
              <Input type="date" value={receivedDateStr} onChange={e => setReceivedDateStr(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                {ar ? "يُستخدم لحساب عمر العينة بالأيام" : "Used to calculate sample age in days"}
              </p>
            </div>
            <div>
              <Label>{ar ? "عمر العينة (يوم)" : "Sample age (days)"}</Label>
              <Input
                value={testAge != null ? `${testAge} ${ar ? "يوم" : "days"}` : "—"}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label>{ar ? "الفاحص" : "Tested By"}</Label>
              <Input value={user?.name || "N/A"} disabled />
            </div>
          </CardContent>
        </Card>

        {testMode === "strength" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ar ? "اختبار مقاومة الضغط" : "Compressive Strength Test"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCubeRows(prev => [...prev, newCubeRow(prev.length, String(testAge ?? "28"))])}>
                <Plus className="mr-2 h-4 w-4" /> {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">{ar ? "رقم المكعب" : "Cube No."}</th>
                      <th className="p-2 text-left">{ar ? "العمر (يوم)" : "Age (days)"}</th>
                      <th className="p-2 text-left">{ar ? "الجانب أ (مم)" : "Side A (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الجانب ب (مم)" : "Side B (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الارتفاع (مم)" : "Height (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الكتلة (كجم)" : "Mass (kg)"}</th>
                      <th className="p-2 text-left">{ar ? "الحمل الأقصى (كن)" : "Max Load (kN)"}</th>
                      <th className="p-2 text-left">{ar ? "المساحة (مم²)" : "Area (mm²)"}</th>
                      <th className="p-2 text-left">{ar ? "المقاومة (كجم/سم²)" : "Strength (kg/cm²)"}</th>
                      <th className="p-2 text-left">{ar ? "الكثافة (كجم/م³)" : "Density (kg/m³)"}</th>
                      <th className="p-2 text-left">{ar ? "النتيجة" : "Result"}</th>
                      <th className="p-2 text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {computedCubes.map(row => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="p-2">
                          <Input value={row.cubeNo} onChange={e => updateCube(row.id, "cubeNo", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <Input value={row.age} onChange={e => updateCube(row.id, "age", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.sideA} onChange={e => updateCube(row.id, "sideA", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.sideB} onChange={e => updateCube(row.id, "sideB", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.height} onChange={e => updateCube(row.id, "height", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.mass} onChange={e => updateCube(row.id, "mass", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.maxLoad} onChange={e => updateCube(row.id, "maxLoad", e.target.value)} type="number" />
                        </td>
                        <td className="p-2 font-medium">{row.area?.toFixed(0) || "-"}</td>
                        <td className="p-2 font-medium">{row.strength ?? "-"}</td>
                        <td className="p-2 font-medium">{row.density ?? "-"}</td>
                        <td className="p-2">
                          <PassFailBadge result={row.result ?? "pending"} />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setCubeRows(prev => prev.filter(r => r.id !== row.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap justify-end items-center gap-4">
                <div className="font-medium">
                  {ar ? `متوسط المقاومة: ${avgStrength ?? "-"} كجم/سم²` : `Average Strength: ${avgStrength ?? "-"} kg/cm²`}
                </div>
                <div className="font-medium flex items-center gap-2">
                  {ar ? "النتيجة الكلية:" : "Overall:"}{" "}
                  <PassFailBadge result={overallStrengthBadge} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {testMode === "density" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ar ? "اختبار الكثافة" : "Density Test"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setDensityRows(prev => [...prev, newDensityRow(prev.length)])}>
                <Plus className="mr-2 h-4 w-4" /> {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">{ar ? "رقم العينة" : "Specimen No."}</th>
                      <th className="p-2 text-left">{ar ? "الطول (مم)" : "Length (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "العرض (مم)" : "Width (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الارتفاع (مم)" : "Height (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الكتلة الرطبة (كجم)" : "Wet Mass (kg)"}</th>
                      <th className="p-2 text-left">{ar ? "الكتلة الجافة (كجم)" : "Dry Mass (kg)"}</th>
                      <th className="p-2 text-left">{ar ? "الحجم (سم³)" : "Volume (cm³)"}</th>
                      <th className="p-2 text-left">{ar ? "الكثافة الطازجة (كجم/م³)" : "Fresh Density (kg/m³)"}</th>
                      <th className="p-2 text-left">{ar ? "الكثافة الجافة (كجم/م³)" : "Dry Density (kg/m³)"}</th>
                      <th className="p-2 text-left">{ar ? "محتوى الرطوبة (%)" : "Moisture Content (%)"}</th>
                      <th className="p-2 text-left">{ar ? "النتيجة" : "Result"}</th>
                      <th className="p-2 text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {computedDensity.map(row => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="p-2">
                          <Input value={row.specimenNo} onChange={e => updateDensity(row.id, "specimenNo", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <Input value={row.length} onChange={e => updateDensity(row.id, "length", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.width} onChange={e => updateDensity(row.id, "width", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.height} onChange={e => updateDensity(row.id, "height", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.wetMass} onChange={e => updateDensity(row.id, "wetMass", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.dryMass} onChange={e => updateDensity(row.id, "dryMass", e.target.value)} type="number" />
                        </td>
                        <td className="p-2 font-medium">{row.volume ?? "-"}</td>
                        <td className="p-2 font-medium">{row.freshDensity ?? "-"}</td>
                        <td className="p-2 font-medium">{row.dryDensity ?? "-"}</td>
                        <td className="p-2 font-medium">{row.moistureContent ?? "-"}</td>
                        <td className="p-2">
                          <PassFailBadge result={row.result ?? "pending"} />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setDensityRows(prev => prev.filter(r => r.id !== row.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap justify-end items-center gap-4">
                <div className="font-medium">
                  {ar ? `متوسط الكثافة الجافة: ${avgDryDensity ?? "-"} كجم/م³` : `Average Dry Density: ${avgDryDensity ?? "-"} kg/m³`}
                </div>
                <div className="font-medium flex items-center gap-2">
                  {ar ? "النتيجة الكلية:" : "Overall:"}{" "}
                  <PassFailBadge result={overallDensityBadge} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "ملاحظات" : "Notes"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={ar ? "ملاحظات إضافية حول الاختبار…" : "Additional notes about the test…"}
              rows={5}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {submitted ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/technician")}>
                {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 gap-1.5 text-white"
                onClick={() => window.open(`/test-report/${distributionId}`, "_blank")}
              >
                <Printer size={14} />
                {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
              onClick={handleSubmit}
              disabled={submitted || saveMut.isPending}
            >
              {saveMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {ar ? "جاري الإرسال…" : "Submitting…"}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {ar ? "إرسال النتائج" : "Submit Results"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
