/**
 * ConcreteFoam — Foamed Concrete Compressive Strength & Density Test
 * Standards: BS 1881-116 (Compressive Strength), BS 1881-114 (Density)
 *
 * Tests:
 *   CONC_FOAM_CUBE    — Compressive strength of foamed concrete cubes (100mm)
 *   CONC_FOAM_DENSITY — Dry density of foamed concrete after oven drying
 *
 * Formulas:
 *   Compressive Strength (N/mm²) = Max Load (N) / Area (mm²)
 *   Fresh Density (kg/m³) = Mass of fresh concrete / Volume of mould
 *   Dry Density (kg/m³) = Oven-dry mass / Volume of specimen
 *   Moisture Content (%) = (Wet mass - Dry mass) / Dry mass × 100
 */
import { useState, useCallback } from "react";
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
import { Plus, Trash2, Send, FlaskConical, Info, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Foam Concrete Grade Targets ─────────────────────────────────────────────
const FOAM_GRADES: Record<string, { minStrength: number; targetDensity: number; label: string }> = {
  FC3: { minStrength: 3.0, targetDensity: 1200, label: "FC3 (3 MPa, ≤1200 kg/m³)" },
  FC5: { minStrength: 5.0, targetDensity: 1400, label: "FC5 (5 MPa, ≤1400 kg/m³)" },
  FC8: { minStrength: 8.0, targetDensity: 1600, label: "FC8 (8 MPa, ≤1600 kg/m³)" },
  FC10: { minStrength: 10.0, targetDensity: 1800, label: "FC10 (10 MPa, ≤1800 kg/m³)" },
  CUSTOM: { minStrength: 0, targetDensity: 0, label: "Custom / مخصص" },
};

interface CubeRow {
  id: string;
  cubeNo: string;
  age: string;
  sideA: string;
  sideB: string;
  height: string;
  mass: string;
  maxLoad: string;
  // computed
  area?: number;
  strength?: number;
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
  // computed
  volume?: number;
  freshDensity?: number;
  dryDensity?: number;
  moistureContent?: number;
  result?: "pass" | "fail" | "pending";
}

function newCubeRow(index: number): CubeRow {
  return {
    id: `cube_${Date.now()}_${index}`,
    cubeNo: `FC${index + 1}`,
    age: "28",
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

function computeCubeRow(row: CubeRow, minStrength: number): CubeRow {
  const a = parseFloat(row.sideA);
  const b = parseFloat(row.sideB);
  const h = parseFloat(row.height);
  const m = parseFloat(row.mass);
  const P = parseFloat(row.maxLoad);
  if (!a || !b || !P) return { ...row, result: "pending" };
  const area = a * b;
  const strength = parseFloat(((P * 1000) / area).toFixed(2));
  const volume = a * b * h * 1e-9; // m³
  const density = m && h ? parseFloat((m / volume).toFixed(0)) : undefined;
  const result = minStrength > 0 ? (strength >= minStrength ? "pass" : "fail") : "pending";
  return { ...row, area, strength, density, result };
}

function computeDensityRow(row: DensityRow, maxDensity: number): DensityRow {
  const l = parseFloat(row.length);
  const w = parseFloat(row.width);
  const h = parseFloat(row.height);
  const wet = parseFloat(row.wetMass);
  const dry = parseFloat(row.dryMass);
  if (!l || !w || !h) return { ...row, result: "pending" };
  const volume = l * w * h * 1e-9; // m³
  const freshDensity = wet ? parseFloat((wet / volume).toFixed(0)) : undefined;
  const dryDensity = dry ? parseFloat((dry / volume).toFixed(0)) : undefined;
  const moistureContent = wet && dry ? parseFloat(((wet - dry) / dry * 100).toFixed(2)) : undefined;
  const result = dryDensity && maxDensity > 0 ? (dryDensity <= maxDensity ? "pass" : "fail") : "pending";
  return { ...row, volume: parseFloat((volume * 1e6).toFixed(2)), freshDensity, dryDensity, moistureContent, result };
}

export default function ConcreteFoam() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [testMode, setTestMode] = useState<"strength" | "density">("strength");
  const [grade, setGrade] = useState("FC5");
  const [customMinStr, setCustomMinStr] = useState("5.0");
  const [customMaxDen, setCustomMaxDen] = useState("1400");
  const [cubeRows, setCubeRows] = useState<CubeRow[]>([newCubeRow(0), newCubeRow(1), newCubeRow(2)]);
  const [densityRows, setDensityRows] = useState<DensityRow[]>([newDensityRow(0), newDensityRow(1)]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: parseInt(distributionId || "0") },
    { enabled: !!distributionId }
  );

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حفظ نتائج الخرسانة الرغوية بنجاح" : "Foamed concrete results saved successfully");
      setSubmitted(true);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const gradeConfig = FOAM_GRADES[grade] || FOAM_GRADES.FC5;
  const minStrength = grade === "CUSTOM" ? parseFloat(customMinStr) || 0 : gradeConfig.minStrength;
  const maxDensity = grade === "CUSTOM" ? parseFloat(customMaxDen) || 0 : gradeConfig.targetDensity;

  const computedCubes = cubeRows.map(r => computeCubeRow(r, minStrength));
  const computedDensity = densityRows.map(r => computeDensityRow(r, maxDensity));

  const validCubes = computedCubes.filter(r => r.strength !== undefined);
  const avgStrength = validCubes.length > 0
    ? parseFloat((validCubes.reduce((s, r) => s + (r.strength || 0), 0) / validCubes.length).toFixed(2))
    : undefined;
  const passCount = validCubes.filter(r => r.result === "pass").length;
  const overallStrengthPass = validCubes.length > 0 && passCount === validCubes.length;

  const validDensity = computedDensity.filter(r => r.dryDensity !== undefined);
  const avgDryDensity = validDensity.length > 0
    ? parseFloat((validDensity.reduce((s, r) => s + (r.dryDensity || 0), 0) / validDensity.length).toFixed(0))
    : undefined;
  const densityPassCount = validDensity.filter(r => r.result === "pass").length;
  const overallDensityPass = validDensity.length > 0 && densityPassCount === validDensity.length;

  const updateCube = useCallback((id: string, field: keyof CubeRow, value: string) => {
    setCubeRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const updateDensity = useCallback((id: string, field: keyof DensityRow, value: string) => {
    setDensityRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSubmit = () => {
    if (!distributionId) return;
    const resultData = {
      testType: "CONC_FOAM",
      grade,
      minStrength,
      maxDensity,
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
      distributionId: parseInt(distributionId),
      sampleId: distribution?.sampleId ?? 0,
      testTypeCode: testMode === "strength" ? "CONC_FOAM_CUBE" : "CONC_FOAM_DENSITY",
      formTemplate: "concrete_foam",
      formData: resultData,
      overallResult: (overallStrengthPass && overallDensityPass) ? "pass" : "fail",
      notes,
      status: "submitted",
    });
  };

  return (
    <DashboardLayout>
      <div className="container max-w-5xl py-6 space-y-6">
        <SampleInfoCard dist={distribution} />
        {/* Header */}
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

        {/* Grade & Mode Selection */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "إعدادات الفحص" : "Test Settings"}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>{ar ? "درجة الخرسانة الرغوية" : "Foamed Concrete Grade"}</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FOAM_GRADES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {grade === "CUSTOM" && (
              <>
                <div>
                  <Label>{ar ? "أدنى مقاومة مطلوبة (MPa)" : "Min. Required Strength (MPa)"}</Label>
                  <Input value={customMinStr} onChange={e => setCustomMinStr(e.target.value)} type="number" step="0.5" />
                </div>
                <div>
                  <Label>{ar ? "أقصى كثافة جافة (kg/m³)" : "Max. Dry Density (kg/m³)"}</Label>
                  <Input value={customMaxDen} onChange={e => setCustomMaxDen(e.target.value)} type="number" step="50" />
                </div>
              </>
            )}
            <div>
              <Label>{ar ? "نوع الفحص" : "Test Type"}</Label>
              <Select value={testMode} onValueChange={v => setTestMode(v as "strength" | "density")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">{ar ? "مقاومة الضغط" : "Strength"}</SelectItem>
                  <SelectItem value="density">{ar ? "الكثافة" : "Density"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Test Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{ar ? "أمر التوزيع:" : "Distribution:"}</Label>
              <Input value={distribution?.distributionCode || "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "اسم الاختبار:" : "Test Name:"}</Label>
              <Input value={distribution?.testName || "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "تاريخ الاستلام:" : "Received Date:"}</Label>
              <Input value={distribution?.receivedAt ? new Date(distribution.receivedAt).toLocaleDateString() : "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "الفاحص:" : "Tested By:"}</Label>
              <Input value={user?.name || "N/A"} disabled />
            </div>
          </CardContent>
        </Card>

        {/* Strength Test Section */}
        {testMode === "strength" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ar ? "اختبار مقاومة الضغط" : "Compressive Strength Test"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCubeRows(prev => [...prev, newCubeRow(prev.length)])}>
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
                      <th className="p-2 text-left">{ar ? "الحمل الأقصى (كيلو نيوتن)" : "Max Load (kN)"}</th>
                      <th className="p-2 text-left">{ar ? "المساحة (مم²)" : "Area (mm²)"}</th>
                      <th className="p-2 text-left">{ar ? "المقاومة (نيوتن/مم²)" : "Strength (N/mm²)"}</th>
                      <th className="p-2 text-left">{ar ? "الكثافة (كجم/م³)" : "Density (kg/m³)"}</th>
                      <th className="p-2 text-left">{ar ? "النتيجة" : "Result"}</th>
                      <th className="p-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedCubes.map((row, i) => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="p-2"><Input value={row.cubeNo} onChange={e => updateCube(row.id, "cubeNo", e.target.value)} /></td>
                        <td className="p-2"><Input value={row.age} onChange={e => updateCube(row.id, "age", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.sideA} onChange={e => updateCube(row.id, "sideA", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.sideB} onChange={e => updateCube(row.id, "sideB", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.height} onChange={e => updateCube(row.id, "height", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.mass} onChange={e => updateCube(row.id, "mass", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.maxLoad} onChange={e => updateCube(row.id, "maxLoad", e.target.value)} type="number" /></td>
                        <td className="p-2 font-medium">{row.area?.toFixed(0) || "-"}</td>
                        <td className="p-2 font-medium">{row.strength || "-"}</td>
                        <td className="p-2 font-medium">{row.density || "-"}</td>
                        <td className="p-2"><PassFailBadge result={row.result ?? "pending"} /></td>
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
              <div className="mt-4 flex justify-end items-center gap-4">
                <div className="font-medium">{ar ? `متوسط المقاومة: ${avgStrength || "-"} نيوتن/مم²` : `Average Strength: ${avgStrength || "-"} N/mm²`}</div>
                <div className="font-medium">{ar ? "النتيجة الكلية:" : "Overall Result:"} <PassFailBadge result={overallStrengthPass ? "pass" : "fail"} /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Density Test Section */}
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
                      <th className="p-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedDensity.map((row, i) => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="p-2"><Input value={row.specimenNo} onChange={e => updateDensity(row.id, "specimenNo", e.target.value)} /></td>
                        <td className="p-2"><Input value={row.length} onChange={e => updateDensity(row.id, "length", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.width} onChange={e => updateDensity(row.id, "width", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.height} onChange={e => updateDensity(row.id, "height", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.wetMass} onChange={e => updateDensity(row.id, "wetMass", e.target.value)} type="number" /></td>
                        <td className="p-2"><Input value={row.dryMass} onChange={e => updateDensity(row.id, "dryMass", e.target.value)} type="number" /></td>
                        <td className="p-2 font-medium">{row.volume || "-"}</td>
                        <td className="p-2 font-medium">{row.freshDensity || "-"}</td>
                        <td className="p-2 font-medium">{row.dryDensity || "-"}</td>
                        <td className="p-2 font-medium">{row.moistureContent || "-"}</td>
                        <td className="p-2"><PassFailBadge result={row.result ?? "pending"} /></td>
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
              <div className="mt-4 flex justify-end items-center gap-4">
                <div className="font-medium">{ar ? `متوسط الكثافة الجافة: ${avgDryDensity || "-"} كجم/م³` : `Average Dry Density: ${avgDryDensity || "-"} kg/m³`}</div>
                <div className="font-medium">{ar ? "النتيجة الكلية:" : "Overall Result:"} <PassFailBadge result={overallDensityPass ? "pass" : "fail"} /></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "ملاحظات" : "Notes"}</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={ar ? "ملاحظات إضافية حول الاختبار..." : "Additional notes about the test..."} rows={5} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {submitted ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/technician")}>
                {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 gap-1.5"
                onClick={() => window.open(`/test-report/${distributionId}`, "_blank")}
              >
                <Printer size={14} />
                {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
              </Button>
            </>
          ) : (
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleSubmit}
              disabled={submitted || saveMut.isPending}
            >
              {saveMut.isPending && <span className="i-lucide-loader-2 mr-2 h-4 w-4 animate-spin" />} {ar ? "جاري..." : "Submitting..."}
              <Send className="mr-2 h-4 w-4" /> {ar ? "إرسال النتائج" : "Submit Results"}
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
