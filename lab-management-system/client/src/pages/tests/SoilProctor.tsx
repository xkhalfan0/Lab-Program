import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import { proctorMethodFromReceptionSubtype } from "@/lib/soilTestReception";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart,
} from "recharts";
import {
  PROCTOR_METHOD_SPECS,
  PROCTOR_METHOD_ORDER,
  PROCTOR_MOLD_VOLUMES,
  computeCorrectedProctor,
  peakProctorMdd,
  peakProctorOmc,
  computeProctorPoint,
  isAstmProctorMethod,
  type ProctorMethodKey,
  type ProctorMoldKey,
  type ProctorPointInput,
} from "@/lib/soilProctor";

// ─── Proctor Test (BS 1377 / ASTM D1557) ─────────────────────────────────────

type ProctorPoint = ProctorPointInput;

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
  const { lang, dir } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [testMethod, setTestMethod] = useState<ProctorMethodKey>("BS_HEAVY");
  const [moldType, setMoldType] = useState<ProctorMoldKey>("CBR_MOLD");
  const [mouldVolumeStr, setMouldVolumeStr] = useState(String(PROCTOR_MOLD_VOLUMES.CBR_MOLD.volume));
  const [soilDescription, setSoilDescription] = useState("");
  const [mouldBaseMass, setMouldBaseMass] = useState("");
  const [bulkSpGr, setBulkSpGr] = useState("2.65");
  const [oversizePct, setOversizePct] = useState("0");
  const [mddFinerUnit, setMddFinerUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [points, setPoints] = useState<ProctorPoint[]>(
    Array.from({ length: 4 }, (_, i) => newPoint(i))
  );

  const orderedProctorMethod = proctorMethodFromReceptionSubtype(dist?.testSubType);
  const currentSpecs = PROCTOR_METHOD_SPECS[testMethod];
  const isAstm = isAstmProctorMethod(testMethod);

  useEffect(() => {
    if (hydrated || existing?.formData) return;
    const fromOrder = proctorMethodFromReceptionSubtype(dist?.testSubType);
    if (fromOrder) setTestMethod(fromOrder);
  }, [dist?.testSubType, hydrated, existing?.formData]);

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (typeof fd.testMethod === "string") {
      const method = fd.testMethod === "STANDARD_PROCTOR"
        ? "MODIFIED_PROCTOR"
        : fd.testMethod;
      if (method in PROCTOR_METHOD_SPECS) {
        setTestMethod(method as ProctorMethodKey);
      }
    }
    if (typeof fd.moldType === "string" && fd.moldType in PROCTOR_MOLD_VOLUMES) {
      setMoldType(fd.moldType as ProctorMoldKey);
    }
    if (fd.mouldVolume != null || fd.moldVolume != null) {
      setMouldVolumeStr(String(fd.mouldVolume ?? fd.moldVolume));
    }
    if (typeof fd.soilDescription === "string") setSoilDescription(fd.soilDescription);
    if (fd.mouldBaseMass != null) setMouldBaseMass(String(fd.mouldBaseMass));
    if (fd.bulkSpGr != null) setBulkSpGr(String(fd.bulkSpGr));
    if (fd.oversizePct != null) setOversizePct(String(fd.oversizePct));
    if (fd.mddFinerUnit != null) setMddFinerUnit(String(fd.mddFinerUnit));
    if (typeof existing.notes === "string") setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    if (Array.isArray(fd.points) && fd.points.length > 0) {
      setPoints(fd.points.map((p: Record<string, unknown>, i: number) => ({
        id: `pt_${i}_${Date.now()}`,
        waterAdded: String(p.waterAdded ?? ""),
        mouldBaseSpecimen: String(p.mouldSoil ?? p.mouldBaseSpecimen ?? ""),
        containerNo: String(p.containerNo ?? ""),
        wetSoilContainer: String(p.wetSoilContainer ?? ""),
        drySoilContainer: String(p.drySoilContainer ?? ""),
        container: String(p.container ?? ""),
      })));
    }
    setHydrated(true);
  }, [existing, hydrated]);

  const moldVolume = Number.isFinite(num(mouldVolumeStr)) && num(mouldVolumeStr) > 0
    ? num(mouldVolumeStr)
    : PROCTOR_MOLD_VOLUMES[moldType].volume;
  const mouldBaseMassNum = num(mouldBaseMass);
  const computedPoints = points.map(p => computeProctorPoint(p, moldVolume, mouldBaseMassNum));
  const validPoints = computedPoints.filter(p => p.dryDensity != null && p.waterContent != null);

  const chartData = validPoints
    .map(p => ({ wc: p.waterContent as number, dd: p.dryDensity as number }))
    .sort((a, b) => a.wc - b.wc);

  const fitResult = fitParabola(chartData.map(d => ({ x: d.wc, y: d.dd ?? 0 })));
  const peakMdd = peakProctorMdd(validPoints, fitResult?.mdd);
  const peakOmc = peakProctorOmc(validPoints, fitResult?.omc);

  const mddFinerNum = parseFloat(mddFinerUnit) || peakMdd || 0;
  const omcFinerNum = peakOmc ?? 0;
  const oversizeNum = parseFloat(oversizePct) || 0;
  const bulkSpGrNum = parseFloat(bulkSpGr) || 2.65;
  const { correctedMDD, correctedOMC, pctFiner } = computeCorrectedProctor(
    oversizeNum,
    bulkSpGrNum,
    mddFinerNum,
    omcFinerNum,
  );
  const handleMethodChange = (val: ProctorMethodKey) => {
    setTestMethod(val);
    const spec = PROCTOR_METHOD_SPECS[val];
    if (spec.isAstm) {
      setMouldVolumeStr(String(spec.mouldVolume));
      const rec = spec.recommendedMolds[0] as ProctorMoldKey;
      if (rec in PROCTOR_MOLD_VOLUMES) setMoldType(rec);
    }
  };

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
          cbrStandard: isAstm ? currentSpecs.cbrStandard : "BS 1377-4",
          bulkSpGr: isAstm ? bulkSpGrNum : null,
          oversizePct: isAstm ? oversizeNum : null,
          mddFinerUnit: isAstm && mddFinerNum > 0 ? mddFinerNum : null,
          pctFiner: isAstm ? pctFiner : null,
          correctedMDD: isAstm && correctedMDD > 0 ? correctedMDD : null,
          correctedOMC: isAstm && correctedOMC > 0 ? correctedOMC : null,
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
          mdd: peakMdd ?? null,
          omc: peakOmc ?? null,
          mddValue: peakMdd ?? null,
          omcValue: peakOmc ?? null,
        },
        overallResult: "pending",
        summaryValues: {
          mdd: peakMdd ?? null,
          omc: peakOmc ?? null,
          testMethod,
          cbrStandard: currentSpecs.cbrStandard,
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
              {isAstm
                ? (ar ? "اختبار الدمك بروكتور — ASTM" : "Proctor Compaction Test — ASTM")
                : (ar ? "اختبار الدمك بروكتور — BS 1377" : "Proctor Compaction Test — BS 1377")}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {currentSpecs.standardRef} | {ar ? "أمر التوزيع" : "Distribution"}: {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "طريقة الاختبار" : "Test Method"}</Label>
                <Select
                  value={testMethod}
                  disabled={!!orderedProctorMethod}
                  onValueChange={v => handleMethodChange(v as ProctorMethodKey)}
                >
                  <SelectTrigger className="w-full *:data-[slot=select-value]:min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROCTOR_METHOD_ORDER.map(key => {
                      const spec = PROCTOR_METHOD_SPECS[key];
                      return (
                        <SelectItem key={key} value={key}>{ar ? spec.labelAr : spec.label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع القالب" : "Mold Type"}</Label>
                <Select
                  value={moldType}
                  onValueChange={v => {
                    const key = v as ProctorMoldKey;
                    setMoldType(key);
                    setMouldVolumeStr(String(PROCTOR_MOLD_VOLUMES[key].volume));
                  }}
                >
                  <SelectTrigger className="w-full *:data-[slot=select-value]:min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROCTOR_MOLD_VOLUMES).map(([k, v]) => (
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
              {isAstm && (
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">{ar ? "معيار CBR المرتبط" : "Linked CBR Standard"}</Label>
                  <div className="h-9 px-3 flex items-center bg-blue-50 border border-blue-200 rounded-md">
                    <span className="text-sm font-semibold text-blue-700">{currentSpecs.cbrStandard}</span>
                    <span className="text-xs text-blue-500 ml-2">({ar ? "تلقائي" : "auto"})</span>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "وصف التربة" : "Soil Description"}</Label>
                <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder={ar ? "مثال: طين رملي، مواد ردم" : "e.g. Sandy clay, Fill material"} />
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
              const spec = currentSpecs;
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
                      {ar ? "المواصفات المرجعية — " : "Reference Specifications — "}
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeMap[spec.color]}`}>{spec.standardRef}</span>
                    </span>
                  </div>
                  {spec.isAstm ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="flex flex-col items-center p-2 bg-white rounded-lg border border-blue-100">
                        <span className="text-[10px] text-blue-600 mb-1">{ar ? "عدد الطبقات" : "Layers"}</span>
                        <span className="text-xl font-bold text-blue-900">{spec.layers}</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-lg border border-blue-100">
                        <span className="text-[10px] text-blue-600 mb-1">{ar ? "ضربات/طبقة" : "Blows/Layer"}</span>
                        <span className="text-xl font-bold text-blue-900">{spec.blowsPerLayer}</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-lg border border-blue-100">
                        <span className="text-[10px] text-blue-600 mb-1">{ar ? "كتلة المطرقة" : "Hammer"}</span>
                        <span className="text-xl font-bold text-blue-900">{spec.hammerMass} kg</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-lg border border-blue-100">
                        <span className="text-[10px] text-blue-600 mb-1">{ar ? "ارتفاع السقوط" : "Drop Height"}</span>
                        <span className="text-xl font-bold text-blue-900">{spec.dropHeight} mm</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-white rounded-lg border border-blue-100">
                        <span className="text-[10px] text-blue-600 mb-1">{ar ? "طاقة الضغط" : "Energy"}</span>
                        <span className="text-lg font-bold text-blue-900">{spec.energy} kN·m/m³</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="opacity-60 uppercase tracking-wide">{ar ? "عدد الطبقات" : "Layers"}</span>
                        <span className="text-lg font-bold">{spec.layers}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="opacity-60 uppercase tracking-wide">{ar ? "ضربات/طبقة" : "Blows/Layer"}</span>
                        <span className="text-lg font-bold">{spec.blowsPerLayer}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="opacity-60 uppercase tracking-wide">{ar ? "طاقة الدمك" : "Compaction Energy"}</span>
                        <span className="font-bold">{spec.legacyEnergy}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="opacity-60 uppercase tracking-wide">{ar ? "المطرقة" : "Hammer"}</span>
                        <span className="font-bold">{spec.legacyHammer}</span>
                      </div>
                    </div>
                  )}
                  {isMoldWarning && (
                    <div className="mt-3 flex items-center gap-2 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded p-2 text-xs">
                      <span>⚠️</span>
                      <span>
                        {ar
                          ? `تحذير: القالب المختار غير موصى به لهذه الطريقة. القالبات الموصى بها: ${spec.recommendedMolds.map(m => PROCTOR_MOLD_VOLUMES[m as ProctorMoldKey]?.label).join(" أو ")}`
                          : `Warning: Selected mold is not standard for this method. Recommended: ${spec.recommendedMolds.map(m => PROCTOR_MOLD_VOLUMES[m as ProctorMoldKey]?.label).join(" or ")}`
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
              {(peakMdd != null || peakOmc != null) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-emerald-600 font-semibold mb-1">
                      {lang === "ar" ? "أقصى كثافة جافة (MDD)" : "Maximum Dry Density (MDD)"}
                    </p>
                    <p className="text-3xl font-bold text-emerald-800">{peakMdd != null ? peakMdd.toFixed(2) : "—"}</p>
                    <p className="text-xs text-emerald-500">Mg/m³</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-blue-600 font-semibold mb-1">
                      {lang === "ar" ? "نسبة الرطوبة المثلى (OMC)" : "Optimum Moisture Content (OMC)"}
                    </p>
                    <p className="text-3xl font-bold text-blue-800">{peakOmc != null ? peakOmc : "—"}</p>
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
                    {peakMdd != null && peakOmc != null && (
                      <>
                        <ReferenceLine
                          y={peakMdd}
                          stroke="#059669"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `MDD = ${peakMdd.toFixed(2)} Mg/m³`,
                            position: "insideTopRight",
                            fontSize: 12,
                            fontWeight: 700,
                            fill: "#047857",
                          }}
                        />
                        <ReferenceLine
                          x={peakOmc}
                          stroke="#059669"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `OMC = ${peakOmc}%`,
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

        {/* Corrected MDD — ASTM D4718 only (not used for BS 1377 heavy/light) */}
        {isAstm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar
                ? "تصحيح الكثافة الجافة القصوى (للمواد الحاوية على حصى خشن)"
                : "Corrected MDD (For materials with oversize particles)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "الثقل النوعي (Gs)" : "Bulk Specific Gravity (Gs)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bulkSpGr}
                  onChange={e => setBulkSpGr(e.target.value)}
                  className="h-9 bg-white font-mono"
                  placeholder="2.65"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "كثافة المواد الناعمة (Mg/m³)" : "MDD of Finer Unit (Mg/m³)"}</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={mddFinerUnit}
                  onChange={e => setMddFinerUnit(e.target.value)}
                  className="h-9 bg-white font-mono"
                  placeholder={peakMdd != null ? String(peakMdd) : (ar ? "من المنحنى" : "From curve")}
                />
                {peakMdd != null && !mddFinerUnit && (
                  <p className="text-[10px] text-slate-500">
                    {ar ? `من المنحنى: ${peakMdd.toFixed(3)} Mg/m³` : `From curve: ${peakMdd.toFixed(3)} Mg/m³`}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "% الحصى الخشن (>19mm)" : "% Oversize (retained >19mm)"}</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={oversizePct}
                  onChange={e => setOversizePct(e.target.value)}
                  className="h-9 bg-white font-mono"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 border-2 border-green-400 rounded-xl text-center">
                <p className="text-xs text-green-700 font-medium mb-1">{ar ? "الكثافة الجافة القصوى المصححة" : "Corrected MDD"}</p>
                <p className="text-3xl font-bold text-green-800">
                  {correctedMDD > 0 && mddFinerNum > 0 ? correctedMDD.toFixed(3) : "—"}
                </p>
                <p className="text-xs text-green-600 mt-1">Mg/m³</p>
                <p className="text-[10px] text-green-500 mt-1">1 / (Pover/Gs + Pfiner/MDD_finer)</p>
              </div>
              <div className="p-4 bg-blue-50 border-2 border-blue-400 rounded-xl text-center">
                <p className="text-xs text-blue-700 font-medium mb-1">{ar ? "محتوى الرطوبة الأمثل المصحح" : "Corrected OMC"}</p>
                <p className="text-3xl font-bold text-blue-800">
                  {correctedOMC > 0 && omcFinerNum > 0 ? correctedOMC.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-blue-600 mt-1">%</p>
                <p className="text-[10px] text-blue-500 mt-1">OMC × (% Finer / 100)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">
              {ar ? "ملاحظات / مشاهدات" : "Notes / Observations"}
            </Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
