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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// CBR Test (BS 1377-4 / ASTM D1883)
// CBR = (Test Load / Standard Load) x 100
// Standard loads: 2.5mm -> 13.24 kN, 5.0mm -> 19.96 kN (BS 1377)

const STANDARD_LOADS = {
  "BS1377": {
    label: "BS 1377-4",
    load_2_5: 13.24, // kN
    load_5_0: 19.96, // kN
  },
  "ASTM_D1883": {
    label: "ASTM D1883",
    load_2_5: 13.44, // kN (3020 lbf)
    load_5_0: 20.00, // kN (4500 lbf)
  },
};

type StandardKey = keyof typeof STANDARD_LOADS;

// Penetration depths (mm) for CBR readings
const PENETRATION_DEPTHS = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0,
  5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
  10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0, 14.5];

interface CBRFace {
  id: string;
  faceLabel: string; // "Top" or "Bottom"
  readings: string[]; // 30 load readings in kN (at each penetration depth)
  // computed
  cbr_2_5?: number;
  cbr_5_0?: number;
  cbrValue?: number; // max of 2.5 and 5.0
  cbrAnomaly?: boolean; // true when CBR at 5.0mm > CBR at 2.5mm (repeat test required)
}

function newFace(label: string): CBRFace {
  return {
    id: `face_${Date.now()}_${label}`,
    faceLabel: label,
    readings: Array(30).fill(""),
  };
}

function computeFace(face: CBRFace, stdLoads: typeof STANDARD_LOADS[StandardKey]): CBRFace {
  const loads = face.readings.map(r => parseFloat(r) || 0);
  // Index 5 = 2.5mm (0, 0.5, 1.0, 1.5, 2.0, 2.5)
  // Index 10 = 5.0mm
  const load_2_5 = loads[5] || 0;
  const load_5_0 = loads[10] || 0;

  if (!load_2_5 && !load_5_0) return face;

  const cbr_2_5 = load_2_5 > 0 ? parseFloat(((load_2_5 / stdLoads.load_2_5) * 100).toFixed(1)) : undefined;
  const cbr_5_0 = load_5_0 > 0 ? parseFloat(((load_5_0 / stdLoads.load_5_0) * 100).toFixed(1)) : undefined;

  // CBR value = max of 2.5mm and 5.0mm CBR
  const cbrValue = Math.max(cbr_2_5 ?? 0, cbr_5_0 ?? 0);

  // BS 1377-4 Cl. 7.4: if CBR at 5.0mm > CBR at 2.5mm, repeat test is required
  const cbrAnomaly = !!(cbr_5_0 && cbr_2_5 && cbr_5_0 > cbr_2_5);

  return {
    ...face,
    cbr_2_5,
    cbr_5_0,
    cbrValue: cbrValue > 0 ? parseFloat(cbrValue.toFixed(1)) : undefined,
    cbrAnomaly,
  };
}

const LAYER_TYPES = [
  { value: "SUBGRADE", label: "Sub-grade (طبقة الأساس الطبيعي)", cbrMin: 15 },
  { value: "SUBBASE", label: "Sub-base (طبقة الأساس)", cbrMin: 25 },
  { value: "FILL", label: "Fill Material (مواد الردم)", cbrMin: 5 },
  { value: "EMBANKMENT", label: "Embankment (جسم الطريق)", cbrMin: 8 },
];

export default function SoilCBR() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [standard, setStandard] = useState<StandardKey>("BS1377");
  const [layerType, setLayerType] = useState("SUBGRADE");
  const [soilDescription, setSoilDescription] = useState("");
  const [soakingPeriod, setSoakingPeriod] = useState("96"); // hours
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [faces, setFaces] = useState<CBRFace[]>([newFace("Top"), newFace("Bottom")]);

  const stdLoads = STANDARD_LOADS[standard];
  const layerSpec = LAYER_TYPES.find(l => l.value === layerType) ?? LAYER_TYPES[0];
  const computedFaces = faces.map(f => computeFace(f, stdLoads));

  // Final CBR = average of top and bottom face CBR values
  const validFaces = computedFaces.filter(f => f.cbrValue !== undefined);
  const finalCBR = validFaces.length > 0
    ? parseFloat((validFaces.reduce((s, f) => s + (f.cbrValue ?? 0), 0) / validFaces.length).toFixed(1))
    : undefined;

  const overallResult: "pass" | "fail" | "pending" =
    finalCBR === undefined ? "pending"
    : finalCBR >= layerSpec.cbrMin ? "pass" : "fail";

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
    onError: (e) => toast.error(ar ? "حدث خطأ: " + e.message : e.message),
  });

  const updateReading = useCallback((faceId: string, depthIdx: number, value: string) => {
    setFaces(prev => prev.map(f => {
      if (f.id !== faceId) return f;
      const newReadings = [...f.readings];
      newReadings[depthIdx] = value;
      return { ...f, readings: newReadings };
    }));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && finalCBR === undefined) {
      toast.error(ar ? "الرجاء إدخال قراءات الحمل عند 2.5mm و 5.0mm على الأقل" : "Please enter at least 2.5mm and 5.0mm load readings");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "SOIL_CBR",
        formTemplate: "soil_cbr",
        formData: {
          standard,
          layerType,
          soilDescription,
          soakingPeriod,
          faces: computedFaces,
          finalCBR,
          cbrMin: layerSpec.cbrMin,
          overallResult,
        },
        overallResult,
        summaryValues: {
          finalCBR,
          cbrMin: layerSpec.cbrMin,
          layerType: layerSpec.label,
          standard: stdLoads.label,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  // Chart data for penetration curve
  const getChartData = (face: CBRFace) =>
    PENETRATION_DEPTHS.map((depth, i) => ({
      depth,
      load: parseFloat(face.readings[i] || "0") || 0,
    })).filter(d => d.load > 0 || d.depth === 0);

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
              <span>{ar ? "اختبارات التربة / CBR" : "Soil Tests / CBR"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار نسبة تحمل كاليفورنيا (CBR)" : "California Bearing Ratio (CBR) Test"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-4 / ASTM D1883 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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

        {/* Info Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <Info size={12} className="inline mr-1" />
          {ar ? (
            <><strong>إجراء CBR:</strong> 30 قراءة لكل وجه (علوي + سفلي) بفواصل 0.5mm من 0 إلى 14.5mm.
            CBR = (الحمل عند الاختراق / الحمل المعياري) x 100. CBR النهائي = متوسط الوجهين.
            الأحمال المعيارية: 2.5mm = {stdLoads.load_2_5} kN، 5.0mm = {stdLoads.load_5_0} kN.</>
          ) : (
            <><strong>CBR Procedure:</strong> 30 readings per face (Top + Bottom) at 0.5mm intervals from 0 to 14.5mm.
            CBR = (Load at penetration / Standard Load) x 100. Final CBR = average of top and bottom faces.
            Standard loads: 2.5mm = {stdLoads.load_2_5} kN, 5.0mm = {stdLoads.load_5_0} kN.</>
          )}
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المعيار" : "Standard"}</Label>
                <Select value={standard} onValueChange={v => setStandard(v as StandardKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STANDARD_LOADS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الطبقة" : "Layer Type"}</Label>
                <Select value={layerType} onValueChange={setLayerType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAYER_TYPES.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "فترة النقع (ساعة)" : "Soaking Period (hours)"}</Label>
                <Input value={soakingPeriod} onChange={e => setSoakingPeriod(e.target.value)} className="font-mono" placeholder="96" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "وصف التربة" : "Soil Description"}</Label>
                <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder={ar ? "مثال: طين رملي، ردم" : "e.g. Sandy clay, Fill"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">{ar ? "الطبقة:" : "Layer:"}</span> {layerSpec.label}</div>
                  <div><span className="font-semibold">{ar ? "الحد الأدنى:" : "Min. CBR:"}</span> {"≥"} {layerSpec.cbrMin}%</div>
                  {finalCBR !== undefined && (
                    <div className={`font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                      {ar ? "CBR النهائي:" : "Final CBR:"} {finalCBR}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Readings Tables - Top and Bottom Face */}
        {computedFaces.map((face) => (
          <Card key={face.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {ar ? (face.faceLabel === "Top" ? "الوجه العلوي" : "الوجه السفلي") : face.faceLabel + " Face"} — {ar ? "الاختراق مقابل الحمل" : "Penetration vs. Load Readings"}
                </CardTitle>
                {face.cbrValue !== undefined && (
                  <div className="flex flex-wrap gap-3 text-xs font-mono items-center">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      CBR @ 2.5mm: {face.cbr_2_5 ?? "—"}%
                    </span>
                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                      CBR @ 5.0mm: {face.cbr_5_0 ?? "—"}%
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-bold">
                      CBR Value: {face.cbrValue}%
                    </span>
                    {face.cbrAnomaly && (
                      <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded font-sans font-semibold">
                        ⚠ {ar ? "CBR عند 5mm > CBR عند 2.5mm — يلزم إعادة الاختبار (BS 1377-4)" : "CBR at 5.0mm > CBR at 2.5mm — repeat test required (BS 1377-4)"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Readings Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الاختراق (mm)" : "Penetration (mm)"}</th>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الحمل (kN)" : "Load (kN)"}</th>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الاختراق (mm)" : "Penetration (mm)"}</th>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الحمل (kN)" : "Load (kN)"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 15 }, (_, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          {/* Left column: readings 0-14 */}
                          <td className={`border border-slate-200 px-2 py-1 text-center font-mono text-xs font-semibold
                            ${PENETRATION_DEPTHS[i] === 2.5 ? "bg-blue-50 text-blue-700" :
                              PENETRATION_DEPTHS[i] === 5.0 ? "bg-purple-50 text-purple-700" : "text-slate-600"}`}>
                            {PENETRATION_DEPTHS[i].toFixed(1)}
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <Input
                              value={face.readings[i]}
                              onChange={e => updateReading(face.id, i, e.target.value)}
                              className={`h-7 text-xs w-20 text-center font-mono
                                ${PENETRATION_DEPTHS[i] === 2.5 ? "border-blue-300 bg-blue-50" :
                                  PENETRATION_DEPTHS[i] === 5.0 ? "border-purple-300 bg-purple-50" : ""}`}
                              placeholder="—"
                            />
                          </td>
                          {/* Right column: readings 15-29 */}
                          <td className={`border border-slate-200 px-2 py-1 text-center font-mono text-xs font-semibold text-slate-600`}>
                            {PENETRATION_DEPTHS[i + 15].toFixed(1)}
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <Input
                              value={face.readings[i + 15]}
                              onChange={e => updateReading(face.id, i + 15, e.target.value)}
                              className="h-7 text-xs w-20 text-center font-mono"
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-blue-600 mt-1">{ar ? "أزرق = 2.5mm، بنفسجي = 5.0mm (أعماق CBR الرئيسية)" : "Blue = 2.5mm, Purple = 5.0mm (key CBR depths)"}</p>
                </div>

                {/* Penetration Curve */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">{ar ? "منحنى الاختراق مقابل الحمل" : "Penetration vs. Load Curve"}</p>
                  {getChartData(face).length >= 2 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={getChartData(face)} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="depth"
                          tick={{ fontSize: 10 }}
                          label={{ value: "Penetration (mm)", position: "insideBottom", offset: -10, fontSize: 10 }}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          label={{ value: "Load (kN)", angle: -90, position: "insideLeft", fontSize: 10 }}
                        />
                        <Tooltip formatter={(v: number) => v.toFixed(2)} />
                        <ReferenceLine x={2.5} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "2.5mm", position: "top", fontSize: 9, fill: "#3b82f6" }} />
                        <ReferenceLine x={5.0} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: "5.0mm", position: "top", fontSize: 9, fill: "#8b5cf6" }} />
                        <Line type="monotone" dataKey="load" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-slate-400 text-sm border rounded-lg">
                      {ar ? "أدخل القراءات لعرض المنحنى" : "Enter readings to display curve"}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Summary */}
        {finalCBR !== undefined && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {computedFaces.map(f => f.cbrValue !== undefined && (
                  <div key={f.id} className="bg-slate-50 rounded-xl p-4 text-center border">
                    <p className="text-xs text-slate-500 mb-1">{ar ? (f.faceLabel === "Top" ? "CBR الوجه العلوي" : "CBR الوجه السفلي") : f.faceLabel + " Face CBR"}</p>
                    <p className="text-3xl font-bold text-slate-800">{f.cbrValue}%</p>
                  </div>
                ))}
                <div className={`rounded-xl p-4 text-center border ${overallResult === "pass" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                  <p className="text-xs text-slate-500 mb-1">{ar ? "CBR النهائي (المتوسط)" : "Final CBR (Average)"}</p>
                  <p className={`text-3xl font-bold ${overallResult === "pass" ? "text-emerald-800" : "text-red-800"}`}>{finalCBR}%</p>
                  <p className="text-xs text-slate-400">{ar ? "الحد الأدنى المطلوب:" : "Min. required:"} {layerSpec.cbrMin}%</p>
                </div>
              </div>
              <ResultBanner
                result={overallResult}
                testName={`CBR Test — ${layerSpec.label}`}
                standard={stdLoads.label}
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
