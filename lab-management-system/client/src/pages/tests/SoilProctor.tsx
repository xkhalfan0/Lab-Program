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
  // ── Technician inputs ──
  waterAdded: string;          // Water added % (target / nominal label, reference only)
  mouldBaseSpecimen: string;   // Mass of Mould + Base + Compacted Specimen (g)
  containerNo: string;         // Moisture container number/label
  wetSoilContainer: string;    // Mass of Wet Soil + Container (g)
  drySoilContainer: string;    // Mass of Dry Soil + Container (g)
  container: string;           // Mass of Container (g)
  // ── Computed ──
  compactedSpecimen?: number;  // (Mould+Base+Specimen) − (Mould+Base)
  bulkDensity?: number;        // Compacted Specimen / Mould Volume
  moistureMass?: number;       // (Wet+Container) − (Dry+Container)
  drySoilMass?: number;        // (Dry+Container) − Container
  waterContent?: number;       // moistureMass / drySoilMass × 100
  dryDensity?: number;         // 100 × bulkDensity / (100 + waterContent)
}

function newPoint(index: number): ProctorPoint {
  return {
    id: `pt_${Date.now()}_${index}`,
    waterAdded: "",
    mouldBaseSpecimen: "",
    containerNo: "",
    wetSoilContainer: "",
    drySoilContainer: "",
    container: "",
  };
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Compute a Proctor point following the lab Excel sheet exactly.
 *  - Mass of Compacted Specimen = (Mould+Base+Specimen) − (Mould+Base)
 *  - Bulk Density               = Compacted Specimen / Mould Volume
 *  - Mass of Moisture           = (Wet Soil+Container) − (Dry Soil+Container)
 *  - Mass of Dry Soil           = (Dry Soil+Container) − Container
 *  - Moisture Content %         = Mass of Moisture / Mass of Dry Soil × 100
 *  - Dry Density                = 100 × Bulk Density / (100 + Moisture Content %)
 */
function computePoint(pt: ProctorPoint, mouldVolumeCm3: number, mouldBaseMass: number): ProctorPoint {
  const out: ProctorPoint = { ...pt };

  // ── Moisture content (container method) ──
  const wsc = num(pt.wetSoilContainer);
  const dsc = num(pt.drySoilContainer);
  const cont = num(pt.container);
  if (Number.isFinite(wsc) && Number.isFinite(dsc)) {
    out.moistureMass = parseFloat((wsc - dsc).toFixed(2));
  }
  if (Number.isFinite(dsc) && Number.isFinite(cont)) {
    out.drySoilMass = parseFloat((dsc - cont).toFixed(2));
  }
  if (out.moistureMass != null && out.drySoilMass != null && out.drySoilMass > 0) {
    // Keep full precision; displays round to 1 decimal (matches the Excel green values).
    out.waterContent = (out.moistureMass / out.drySoilMass) * 100;
  }

  // ── Bulk (wet) density ──
  const mbs = num(pt.mouldBaseSpecimen);
  if (Number.isFinite(mbs) && Number.isFinite(mouldBaseMass) && mouldVolumeCm3 > 0) {
    const specimen = mbs - mouldBaseMass;
    out.compactedSpecimen = parseFloat(specimen.toFixed(1));
    if (specimen > 0) out.bulkDensity = parseFloat((specimen / mouldVolumeCm3).toFixed(3));
  }

  // ── Dry density ──
  if (out.bulkDensity != null && out.waterContent != null) {
    out.dryDensity = parseFloat(((100 * out.bulkDensity) / (100 + out.waterContent)).toFixed(3));
  }

  return out;
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
  // Editable mould volume (cm³) — defaults to the selected mould preset but can be
  // overridden to the lab's actual calibrated volume (e.g. 2303).
  const [mouldVolumeStr, setMouldVolumeStr] = useState(String(MOLD_VOLUMES.CBR_MOLD.volume));
  const [soilDescription, setSoilDescription] = useState("");
  const [mouldBaseMass, setMouldBaseMass] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [points, setPoints] = useState<ProctorPoint[]>(
    Array.from({ length: 4 }, (_, i) => newPoint(i))
  );

  const moldVolume = Number.isFinite(num(mouldVolumeStr)) && num(mouldVolumeStr) > 0
    ? num(mouldVolumeStr)
    : MOLD_VOLUMES[moldType].volume;
  const mouldBaseMassNum = num(mouldBaseMass);
  const computedPoints = points.map(p => computePoint(p, moldVolume, mouldBaseMassNum));
  const validPoints = computedPoints.filter(p => p.dryDensity != null && p.waterContent != null);

  const chartData = validPoints
    .map(p => ({ wc: p.waterContent as number, dd: p.dryDensity as number }))
    .sort((a, b) => a.wc - b.wc);

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
          mouldVolume: moldVolume,
          mouldBaseMass: Number.isFinite(mouldBaseMassNum) ? mouldBaseMassNum : null,
          soilDescription,
          // Persist raw inputs + computed values, and mirror the field names the
          // report renderer expects (mouldSoil / mouldWeight / soilWeight / wetDensity / waterContent / dryDensity).
          points: computedPoints.map(p => ({
            waterAdded: p.waterAdded,
            containerNo: p.containerNo,
            wetSoilContainer: p.wetSoilContainer,
            drySoilContainer: p.drySoilContainer,
            container: p.container,
            moistureMass: p.moistureMass,
            drySoilMass: p.drySoilMass,
            mouldSoil: Number.isFinite(num(p.mouldBaseSpecimen)) ? num(p.mouldBaseSpecimen) : null,
            mouldWeight: Number.isFinite(mouldBaseMassNum) ? mouldBaseMassNum : null,
            soilWeight: p.compactedSpecimen ?? null,
            wetDensity: p.bulkDensity ?? null,
            waterContent: p.waterContent ?? null,
            dryDensity: p.dryDensity ?? null,
          })),
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

  const removePoint = (id: string) => {
    setPoints(prev => (prev.length > 1 ? prev.filter(p => p.id !== id) : prev));
  };

  const isRtl = dir === "rtl";

  // Shared table cell styles for the transposed Proctor sheet
  const labelCls = "border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 whitespace-nowrap text-start";
  const inCls = "border border-slate-200 px-1 py-1";
  const calcCls = "border border-slate-200 px-2 py-1.5 text-center font-mono text-xs";
  const inputCls = "h-7 text-xs text-center font-mono w-full min-w-[4.5rem]";
  const fmtN = (v?: number | null, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

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
                <Select
                  value={moldType}
                  onValueChange={v => {
                    const key = v as keyof typeof MOLD_VOLUMES;
                    setMoldType(key);
                    setMouldVolumeStr(String(MOLD_VOLUMES[key].volume));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOLD_VOLUMES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {lang === "ar" ? "حجم القالب (cm³)" : "Mould Volume (cm³)"}
                </Label>
                <Input
                  type="number"
                  value={mouldVolumeStr}
                  onChange={e => setMouldVolumeStr(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: 2303" : "e.g. 2303"}
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {lang === "ar" ? "كتلة القالب + القاعدة الفارغ (g)" : "Mass of Empty Mould + Base (g)"}
                </Label>
                <Input
                  type="number"
                  value={mouldBaseMass}
                  onChange={e => setMouldBaseMass(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: 5640" : "e.g. 5640"}
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{lang === "ar" ? "وصف التربة" : "Soil Description"}</Label>
                <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder={lang === "ar" ? "مثال: طين رملي، مواد ردم" : "e.g. Sandy clay, Fill material"} />
              </div>
              <div className="md:col-span-4 flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  {lang === "ar"
                    ? <>حجم القالب المستخدم في الحساب: <strong>{moldVolume} cm³</strong>. «كتلة القالب + القاعدة» هي وزن القالب الفارغ (عادةً ~5640 g) وليست الحجم. يُنصح بـ 5 نقاط على الأقل للحصول على MDD/OMC دقيق.</>
                    : <>Calculation uses Mould Volume <strong>{moldVolume} cm³</strong>. "Mass of Empty Mould + Base" is the weight of the empty mould (typically ~5640 g) — not the volume. Min. 5 points recommended for accurate MDD/OMC.</>}
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

        <div className="space-y-6">
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
              <table className="w-full text-sm border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={`${labelCls} bg-slate-100 font-semibold`}>
                      {lang === "ar" ? "البيان" : "Parameter"}
                    </th>
                    {computedPoints.map((pt, idx) => (
                      <th key={pt.id} className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 min-w-[6rem]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{lang === "ar" ? `اختبار ${idx + 1}` : `Test ${idx + 1}`}</span>
                          {points.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePoint(pt.id)}
                              className="text-slate-400 hover:text-red-500 leading-none text-base"
                              title={lang === "ar" ? "حذف" : "Remove"}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Water added % (reference) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "الماء المضاف %" : "Water Added %"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input value={pt.waterAdded} onChange={e => updatePoint(pt.id, "waterAdded", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Mould + Base + Compacted Specimen (input) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "كتلة القالب+القاعدة+العينة المدموكة (g)" : "Mass of Mould + Base + Compacted Specimen (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input type="number" value={pt.mouldBaseSpecimen} onChange={e => updatePoint(pt.id, "mouldBaseSpecimen", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Mould + Base (shared constant) */}
                  <tr className="bg-slate-50/60">
                    <td className={labelCls}>{lang === "ar" ? "كتلة القالب + القاعدة (g)" : "Mass of Mould + Base (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={calcCls}>{fmtN(mouldBaseMassNum, 1)}</td>
                    ))}
                  </tr>
                  {/* Mass of Compacted Specimen (calc) */}
                  <tr className="bg-blue-50/40">
                    <td className={labelCls}>{lang === "ar" ? "كتلة العينة المدموكة (g)" : "Mass of Compacted Specimen (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={calcCls}>{fmtN(pt.compactedSpecimen, 1)}</td>
                    ))}
                  </tr>
                  {/* Bulk Density (calc) */}
                  <tr className="bg-blue-50/40">
                    <td className={labelCls}>{lang === "ar" ? "الكثافة الرطبة (Mg/m³)" : "Bulk Density (Mg/m³)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={`${calcCls} font-semibold text-slate-800`}>{fmtN(pt.bulkDensity, 3)}</td>
                    ))}
                  </tr>
                  {/* Moisture Container No (input) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "رقم وعاء الرطوبة" : "Moisture Container No."}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input value={pt.containerNo} onChange={e => updatePoint(pt.id, "containerNo", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Wet Soil + Container (input) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "كتلة التربة الرطبة + الوعاء (g)" : "Mass of Wet Soil + Container (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input type="number" value={pt.wetSoilContainer} onChange={e => updatePoint(pt.id, "wetSoilContainer", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Dry Soil + Container (input) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "كتلة التربة الجافة + الوعاء (g)" : "Mass of Dry Soil + Container (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input type="number" value={pt.drySoilContainer} onChange={e => updatePoint(pt.id, "drySoilContainer", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Container (input) */}
                  <tr>
                    <td className={labelCls}>{lang === "ar" ? "كتلة الوعاء (g)" : "Mass of Container (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={inCls}>
                        <Input type="number" value={pt.container} onChange={e => updatePoint(pt.id, "container", e.target.value)} className={inputCls} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                  {/* Mass of Moisture (calc) */}
                  <tr className="bg-blue-50/40">
                    <td className={labelCls}>{lang === "ar" ? "كتلة الرطوبة (g)" : "Mass of Moisture (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={calcCls}>{fmtN(pt.moistureMass, 1)}</td>
                    ))}
                  </tr>
                  {/* Mass of Dry Soil (calc) */}
                  <tr className="bg-blue-50/40">
                    <td className={labelCls}>{lang === "ar" ? "كتلة التربة الجافة (g)" : "Mass of Dry Soil (g)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={calcCls}>{fmtN(pt.drySoilMass, 1)}</td>
                    ))}
                  </tr>
                  {/* Moisture Content % (calc) */}
                  <tr className="bg-blue-50/40">
                    <td className={labelCls}>{lang === "ar" ? "المحتوى الرطوبي %" : "Moisture Content %"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={`${calcCls} font-semibold text-amber-700`}>{fmtN(pt.waterContent, 1)}</td>
                    ))}
                  </tr>
                  {/* Dry Density (calc) */}
                  <tr className="bg-emerald-50/60">
                    <td className={labelCls}>{lang === "ar" ? "الكثافة الجافة (Mg/m³)" : "Dry Density (Mg/m³)"}</td>
                    {computedPoints.map(pt => (
                      <td key={pt.id} className={`${calcCls} font-bold text-emerald-800`}>{fmtN(pt.dryDensity, 3)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Equation reference */}
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-0.5 leading-relaxed">
              <p>• {lang === "ar" ? "كتلة العينة المدموكة = (القالب+القاعدة+العينة) − (القالب+القاعدة)" : "Compacted Specimen = (Mould+Base+Specimen) − (Mould+Base)"}</p>
              <p>• {lang === "ar" ? "الكثافة الرطبة = كتلة العينة المدموكة ÷ حجم القالب" : "Bulk Density = Compacted Specimen ÷ Mould Volume"}</p>
              <p>• {lang === "ar" ? "المحتوى الرطوبي % = (كتلة الرطوبة ÷ كتلة التربة الجافة) × 100" : "Moisture Content % = (Mass of Moisture ÷ Mass of Dry Soil) × 100"}</p>
              <p>• {lang === "ar" ? "الكثافة الجافة = 100 × الكثافة الرطبة ÷ (100 + المحتوى الرطوبي %)" : "Dry Density = 100 × Bulk Density ÷ (100 + Moisture Content %)"}</p>
            </div>

              {/* MDD / OMC Summary */}
              {fitResult && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-emerald-600 font-semibold mb-1">
                      {lang === "ar" ? "أقصى كثافة جافة (MDD)" : "Maximum Dry Density (MDD)"}
                    </p>
                    <p className="text-3xl font-bold text-emerald-800">{fitResult.mdd.toFixed(2)}</p>
                    <p className="text-xs text-emerald-500">Mg/m³</p>
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
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData} margin={{ top: 34, right: 24, left: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="wc"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      label={{ value: lang === "ar" ? "نسبة الرطوبة (%)" : "Water Content (%)", position: "insideBottom", offset: -12, fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="dd"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      label={{ value: lang === "ar" ? "الكثافة الجافة (Mg/m³)" : "Dry Density (Mg/m³)", angle: -90, position: "insideLeft", fontSize: 10 }}
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
                      <>
                        <ReferenceLine
                          y={fitResult.mdd}
                          stroke="#059669"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `MDD = ${fitResult.mdd.toFixed(2)} Mg/m³`,
                            position: "insideTopRight",
                            fontSize: 12,
                            fontWeight: 700,
                            fill: "#047857",
                          }}
                        />
                        <ReferenceLine
                          x={fitResult.omc}
                          stroke="#059669"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `OMC = ${fitResult.omc}%`,
                            position: "top",
                            fontSize: 12,
                            fontWeight: 700,
                            fill: "#047857",
                          }}
                        />
                      </>
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
