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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart,
} from "recharts";

// ─── Proctor Test (BS 1377 / ASTM D1557) ─────────────────────────────────────

const METHOD_SPECS: Record<string, {
  standard: string;
  layers: number;
  blowsPerLayer: number;
  energy: string;
  hammer: string;
  recommendedMolds: string[];
  color: string;
}> = {
  MODIFIED_PROCTOR: {
    standard: "ASTM D1557",
    layers: 5,
    blowsPerLayer: 25,
    energy: "2700 kN·m/m³",
    hammer: "4.54 kg / 457 mm",
    recommendedMolds: ["CBR_MOLD", "STANDARD_MOLD"],
    color: "blue",
  },
  STANDARD_PROCTOR: {
    standard: "ASTM D698",
    layers: 3,
    blowsPerLayer: 25,
    energy: "600 kN·m/m³",
    hammer: "2.49 kg / 305 mm",
    recommendedMolds: ["STANDARD_MOLD", "LARGE_MOLD"],
    color: "green",
  },
  BS_HEAVY: {
    standard: "BS 1377-4",
    layers: 5,
    blowsPerLayer: 27,
    energy: "2674 kN·m/m³",
    hammer: "4.5 kg / 450 mm",
    recommendedMolds: ["CBR_MOLD", "STANDARD_MOLD"],
    color: "purple",
  },
  BS_LIGHT: {
    standard: "BS 1377-4",
    layers: 3,
    blowsPerLayer: 27,
    energy: "596 kN·m/m³",
    hammer: "2.5 kg / 300 mm",
    recommendedMolds: ["STANDARD_MOLD", "LARGE_MOLD"],
    color: "orange",
  },
};

const MOLD_VOLUMES = {
  "CBR_MOLD": { label: "CBR Mold (2305 cm³)", volume: 2305 },
  "STANDARD_MOLD": { label: "Standard Mold (944 cm³)", volume: 944 },
  "LARGE_MOLD": { label: "Large Mold (2124 cm³)", volume: 2124 },
};

interface ProctorPoint {
  id: string;
  // Method A: direct water content input
  waterContent: string;
  moldMass: string;
  moldPlusSoilMass: string;
  // Method B: wet + dry mass for auto WC calculation
  wetMass: string;
  dryMass: string;
  // computed
  dryDensity?: number;
  bulkDensity?: number;
  computedWC?: number;
}

function newPoint(index: number): ProctorPoint {
  return {
    id: `pt_${Date.now()}_${index}`,
    waterContent: "",
    moldMass: "",
    moldPlusSoilMass: "",
    wetMass: "",
    dryMass: "",
  };
}

function computePoint(pt: ProctorPoint, moldVolumeCm3: number): ProctorPoint {
  // Determine water content: if wet/dry masses provided, compute automatically
  let wc: number;
  if (pt.wetMass && pt.dryMass) {
    const wet = parseFloat(pt.wetMass);
    const dry = parseFloat(pt.dryMass);
    if (wet > 0 && dry > 0 && wet > dry) {
      wc = ((wet - dry) / dry) * 100;
    } else {
      wc = parseFloat(pt.waterContent);
    }
  } else {
    wc = parseFloat(pt.waterContent);
  }

  const moldMass = parseFloat(pt.moldMass);
  const totalMass = parseFloat(pt.moldPlusSoilMass);
  if (!wc || !moldMass || !totalMass || !moldVolumeCm3) {
    return { ...pt, computedWC: pt.wetMass && pt.dryMass ? wc : undefined };
  }
  const soilMass = totalMass - moldMass;
  const bulkDensity = soilMass / moldVolumeCm3; // g/cm³
  const dryDensity = bulkDensity / (1 + wc / 100);
  return {
    ...pt,
    computedWC: parseFloat(wc.toFixed(2)),
    bulkDensity: parseFloat(bulkDensity.toFixed(3)),
    dryDensity: parseFloat(dryDensity.toFixed(3)),
  };
}

// Simple polynomial fit to find MDD and OMC
function fitParabola(points: { x: number; y: number }[]): { mdd: number; omc: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
  for (const p of points) {
    sx += p.x; sx2 += p.x ** 2; sx3 += p.x ** 3; sx4 += p.x ** 4;
    sy += p.y; sxy += p.x * p.y; sx2y += p.x ** 2 * p.y;
  }
  const A = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]];
  const B = [sy, sxy, sx2y];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const f = A[j][i] / A[i][i];
      for (let k = i; k < 3; k++) A[j][k] -= f * A[i][k];
      B[j] -= f * B[i];
    }
  }
  const c = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    c[i] = B[i];
    for (let j = i + 1; j < 3; j++) c[i] -= A[i][j] * c[j];
    c[i] /= A[i][i];
  }
  const [cVal, bVal, aVal] = c;
  if (aVal >= 0) return null;
  const omc = -bVal / (2 * aVal);
  const mdd = aVal * omc ** 2 + bVal * omc + cVal;
  return { mdd: parseFloat(mdd.toFixed(3)), omc: parseFloat(omc.toFixed(1)) };
}

export default function SoilProctor() {
  const { user } = useAuth();
  const { lang, t, dir } = useLanguage();
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [testMethod, setTestMethod] = useState("MODIFIED_PROCTOR");
  const [moldType, setMoldType] = useState<keyof typeof MOLD_VOLUMES>("CBR_MOLD");
  const [soilDescription, setSoilDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // WC input mode: "direct" = user types WC%, "auto" = computed from wet/dry masses
  const [wcMode, setWcMode] = useState<"direct" | "auto">("direct");
  const [points, setPoints] = useState<ProctorPoint[]>(
    Array.from({ length: 5 }, (_, i) => newPoint(i))
  );

  const moldVolume = MOLD_VOLUMES[moldType].volume;
  const computedPoints = points.map(p => computePoint(p, moldVolume));
  const validPoints = computedPoints.filter(p => p.dryDensity && (p.computedWC || p.waterContent));

  const chartData = validPoints.map(p => ({
    wc: p.computedWC ?? parseFloat(p.waterContent),
    dd: p.dryDensity,
  })).sort((a, b) => a.wc - b.wc);

  const fitResult = fitParabola(chartData.map(d => ({ x: d.wc, y: d.dd ?? 0 })));

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(lang === "ar" ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(lang === "ar" ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validPoints.length < 3) {
      toast.error(lang === "ar" ? "يرجى إدخال 3 نقاط على الأقل لاختبار بروكتور" : "Please enter at least 3 data points for Proctor test");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "SOIL_PROCTOR",
        formTemplate: "soil_proctor",
        formData: {
          testMethod,
          moldType,
          moldVolume,
          soilDescription,
          wcMode,
          points: computedPoints,
          mdd: fitResult?.mdd,
          omc: fitResult?.omc,
        },
        overallResult: "pending",
        summaryValues: {
          mdd: fitResult?.mdd,
          omc: fitResult?.omc,
          testMethod,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const updatePoint = (id: string, field: keyof ProctorPoint, value: string) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const isRtl = dir === "rtl";

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
      <div className="max-w-5xl mx-auto p-6 space-y-6" dir={dir}>
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{lang === "ar" ? "فحوصات التربة / الدمك" : "Soil Tests / Compaction"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {lang === "ar" ? "اختبار الدمك بروكتور المعدّل" : "Modified Proctor Compaction Test"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-4 / ASTM D1557 | {lang === "ar" ? "أمر التوزيع" : "Distribution"}: {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {lang === "ar" ? "العودة للوحة التحكم" : "Back to Dashboard"}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                >
                  <Printer size={14} />
                  {lang === "ar" ? "طباعة التقرير / PDF" : "Print Report / PDF"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {lang === "ar" ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className={isRtl ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (lang === "ar" ? "جاري الإرسال..." : "Submitting...") : (lang === "ar" ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{lang === "ar" ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{lang === "ar" ? "طريقة الاختبار" : "Test Method"}</Label>
                <Select value={testMethod} onValueChange={setTestMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MODIFIED_PROCTOR">{lang === "ar" ? "بروكتور المعدّل (ASTM D1557)" : "Modified Proctor (ASTM D1557)"}</SelectItem>
                    <SelectItem value="STANDARD_PROCTOR">{lang === "ar" ? "بروكتور القياسي (ASTM D698)" : "Standard Proctor (ASTM D698)"}</SelectItem>
                    <SelectItem value="BS_HEAVY">{lang === "ar" ? "BS 1377 دمك ثقيل" : "BS 1377 Heavy Compaction"}</SelectItem>
                    <SelectItem value="BS_LIGHT">{lang === "ar" ? "BS 1377 دمك خفيف" : "BS 1377 Light Compaction"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{lang === "ar" ? "نوع القالب" : "Mold Type"}</Label>
                <Select value={moldType} onValueChange={v => setMoldType(v as keyof typeof MOLD_VOLUMES)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOLD_VOLUMES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{lang === "ar" ? "وصف التربة" : "Soil Description"}</Label>
                <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder={lang === "ar" ? "مثال: طين رملي، مواد ردم" : "e.g. Sandy clay, Fill material"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{lang === "ar" ? "طريقة إدخال نسبة الرطوبة" : "Moisture Content Input"}</Label>
                <Select value={wcMode} onValueChange={v => setWcMode(v as "direct" | "auto")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">{lang === "ar" ? "إدخال مباشر (%)" : "Direct Input (%)"}</SelectItem>
                    <SelectItem value="auto">{lang === "ar" ? "حساب تلقائي (كتلة رطبة/جافة)" : "Auto-Calculate (Wet/Dry Mass)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  {lang === "ar" ? "حجم القالب" : "Mold volume"}: <strong>{moldVolume} cm³</strong><br />
                  {lang === "ar" ? "يُنصح بـ 5 نقاط على الأقل للحصول على MDD/OMC دقيق" : "Min. 5 points recommended for accurate MDD/OMC"}
                </div>
              </div>
            </div>

            {/* ─── Method Reference Specs Card ─── */}
            {(() => {
              const spec = METHOD_SPECS[testMethod];
              if (!spec) return null;
              const isMoldWarning = !spec.recommendedMolds.includes(moldType);
              const colorMap: Record<string, string> = {
                blue: "bg-blue-50 border-blue-200 text-blue-800",
                green: "bg-green-50 border-green-200 text-green-800",
                purple: "bg-purple-50 border-purple-200 text-purple-800",
                orange: "bg-orange-50 border-orange-200 text-orange-800",
              };
              const badgeMap: Record<string, string> = {
                blue: "bg-blue-100 text-blue-700",
                green: "bg-green-100 text-green-700",
                purple: "bg-purple-100 text-purple-700",
                orange: "bg-orange-100 text-orange-700",
              };
              return (
                <div className={`mt-4 border rounded-lg p-4 ${colorMap[spec.color]}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Info size={14} />
                    <span className="font-semibold text-sm">
                      {lang === "ar" ? "المواصفات المرجعية — " : "Reference Specifications — "}
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeMap[spec.color]}`}>{spec.standard}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60 uppercase tracking-wide">{lang === "ar" ? "عدد الطبقات" : "Layers"}</span>
                      <span className="text-lg font-bold">{spec.layers}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60 uppercase tracking-wide">{lang === "ar" ? "ضربات/طبقة" : "Blows/Layer"}</span>
                      <span className="text-lg font-bold">{spec.blowsPerLayer}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60 uppercase tracking-wide">{lang === "ar" ? "طاقة الدمك" : "Compaction Energy"}</span>
                      <span className="font-bold">{spec.energy}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="opacity-60 uppercase tracking-wide">{lang === "ar" ? "المطرقة" : "Hammer"}</span>
                      <span className="font-bold">{spec.hammer}</span>
                    </div>
                  </div>
                  {isMoldWarning && (
                    <div className="mt-3 flex items-center gap-2 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded p-2 text-xs">
                      <span>⚠️</span>
                      <span>
                        {lang === "ar"
                          ? `تحذير: القالب المختار غير موصى به لهذه الطريقة. القالبات الموصى بها: ${spec.recommendedMolds.map(m => MOLD_VOLUMES[m as keyof typeof MOLD_VOLUMES]?.label).join(" أو ")}`
                          : `Warning: Selected mold is not standard for this method. Recommended: ${spec.recommendedMolds.map(m => MOLD_VOLUMES[m as keyof typeof MOLD_VOLUMES]?.label).join(" or ")}`
                        }
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}


          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Data Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{lang === "ar" ? "نقاط بيانات الدمك" : "Compaction Data Points"}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setPoints(p => [...p, newPoint(p.length)])}>
                  + {lang === "ar" ? "إضافة نقطة" : "Add Point"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">#</th>
                    {wcMode === "auto" ? (
                      <>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                          {lang === "ar" ? "كتلة رطبة (g)" : "Wet Mass (g)"}
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                          {lang === "ar" ? "كتلة جافة (g)" : "Dry Mass (g)"}
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 bg-amber-50">
                          {lang === "ar" ? "W.C. % (محسوب)" : "W.C. % (calc)"}
                        </th>
                      </>
                    ) : (
                      <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                        {lang === "ar" ? "نسبة الرطوبة (%)" : "W.C. (%)"}
                      </th>
                    )}
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {lang === "ar" ? "كتلة القالب (g)" : "Mold Mass (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {lang === "ar" ? "قالب+تربة (g)" : "Mold+Soil (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {lang === "ar" ? "ρ كلية" : "Bulk ρ"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {lang === "ar" ? "ρ جافة" : "Dry ρ"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {computedPoints.map((pt, idx) => (
                    <tr key={pt.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-2 py-1 text-center text-xs font-semibold text-slate-500">{idx + 1}</td>
                      {wcMode === "auto" ? (
                        <>
                          <td className="border border-slate-200 px-1 py-1">
                            <Input value={pt.wetMass} onChange={e => updatePoint(pt.id, "wetMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1">
                            <Input value={pt.dryMass} onChange={e => updatePoint(pt.id, "dryMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                          </td>
                          <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-amber-700 bg-amber-50">
                            {pt.computedWC !== undefined ? pt.computedWC.toFixed(2) : "—"}
                          </td>
                        </>
                      ) : (
                        <td className="border border-slate-200 px-1 py-1">
                          <Input value={pt.waterContent} onChange={e => updatePoint(pt.id, "waterContent", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                        </td>
                      )}
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.moldMass} onChange={e => updatePoint(pt.id, "moldMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.moldPlusSoilMass} onChange={e => updatePoint(pt.id, "moldPlusSoilMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{pt.bulkDensity ?? "—"}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">{pt.dryDensity ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
</div>

              {/* Formula note */}
              {wcMode === "auto" && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                  <Info size={11} className="inline mr-1" />
                  {lang === "ar"
                    ? "نسبة الرطوبة = ((كتلة رطبة − كتلة جافة) ÷ كتلة جافة) × 100"
                    : "W.C. = ((Wet Mass − Dry Mass) ÷ Dry Mass) × 100"}
                </div>
              )}

              {/* MDD / OMC Summary */}
              {fitResult && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-emerald-600 font-semibold mb-1">
                      {lang === "ar" ? "أقصى كثافة جافة (MDD)" : "Maximum Dry Density (MDD)"}
                    </p>
                    <p className="text-3xl font-bold text-emerald-800">{fitResult.mdd}</p>
                    <p className="text-xs text-emerald-500">g/cm³</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-blue-600 font-semibold mb-1">
                      {lang === "ar" ? "نسبة الرطوبة المثلى (OMC)" : "Optimum Moisture Content (OMC)"}
                    </p>
                    <p className="text-3xl font-bold text-blue-800">{fitResult.omc}</p>
                    <p className="text-xs text-blue-500">%</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compaction Curve */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {lang === "ar" ? "منحنى الدمك (الكثافة الجافة مقابل نسبة الرطوبة)" : "Compaction Curve (Dry Density vs. Water Content)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="wc"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      label={{ value: lang === "ar" ? "نسبة الرطوبة (%)" : "Water Content (%)", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="dd"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      label={{ value: lang === "ar" ? "الكثافة الجافة (g/cm³)" : "Dry Density (g/cm³)", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <Tooltip formatter={(v: number) => v.toFixed(3)} />
                    <Scatter
                      name={lang === "ar" ? "نقاط الاختبار" : "Test Points"}
                      data={chartData}
                      dataKey="dd"
                      fill="#2563eb"
                      line={{ stroke: "#2563eb", strokeWidth: 2 }}
                    />
                    {fitResult && (
                      <ReferenceLine
                        x={fitResult.omc}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        label={{ value: `OMC=${fitResult.omc}%`, position: "top", fontSize: 10, fill: "#10b981" }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{lang === "ar" ? "أدخل نقطتَي بيانات على الأقل" : "Enter at least 2 data points"}</p>
                    <p className="text-xs mt-1">{lang === "ar" ? "لعرض منحنى الدمك" : "to display compaction curve"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">
              {lang === "ar" ? "ملاحظات / مشاهدات" : "Notes / Observations"}
            </Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
