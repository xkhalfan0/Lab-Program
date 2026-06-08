import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

import {
  CBR_STANDARDS,
  computeCBRFace,
  formatPenetrationDepth,
  newCBRFace,
  type CBRFaceInput,
  type CBRStandardKey,
} from "@/lib/soilCBR";
import { proctorMethodLinksToAstmCbr } from "@/lib/soilProctor";

type CBRFace = CBRFaceInput;

// CBR acceptance limit applies to BOTH the top and bottom faces.
const LAYER_TYPES = [
  { value: "SUBBASE", label: "Sub-base (طبقة الأساس)", cbrMin: 30 },
  { value: "SUBGRADE", label: "Sub-grade (طبقة الأساس الطبيعي)", cbrMin: 15 },
  { value: "FILL", label: "Structural Fill (ردم إنشائي)", cbrMin: 30 },
  { value: "EMBANKMENT", label: "Embankment (جسم الطريق)", cbrMin: 80 },
];

export default function SoilCBR() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [standard, setStandard] = useState<CBRStandardKey>("BS1377");
  const standardTouched = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [layerType, setLayerType] = useState("SUBGRADE");
  const [soilDescription, setSoilDescription] = useState("");
  const [soakingPeriod, setSoakingPeriod] = useState("96"); // hours
  // % passing the 19.5 mm sieve (from the sieve analysis of the same sample).
  const [passing19_5, setPassing19_5] = useState("");
  const passing19Touched = useRef(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const stdSpec = CBR_STANDARDS[standard];
  const [faces, setFaces] = useState<CBRFace[]>([
    newCBRFace("Top", CBR_STANDARDS.BS1377.penetrationDepths.length),
    newCBRFace("Bottom", CBR_STANDARDS.BS1377.penetrationDepths.length),
  ]);

  // Initial density / moisture content (as-moulded sample, before soaking)
  const [massWetSoilCont, setMassWetSoilCont] = useState("");   // mass of wet soil + container, g
  const [massDrySoilCont, setMassDrySoilCont] = useState("");   // mass of dry soil + container, g
  const [massContainer, setMassContainer] = useState("");       // mass of container, g
  const [mouldBase, setMouldBase] = useState("");               // mould + base, g
  const [mouldBaseSoil, setMouldBaseSoil] = useState("");       // mould + base + soil, g
  const [volumeMould, setVolumeMould] = useState("");           // volume of mould, cc
  const [mddStr, setMddStr] = useState("");
  const [omcStr, setOmcStr] = useState("");
  const mddTouched = useRef(false);
  const omcTouched = useRef(false);
  const [linkedProctorMethod, setLinkedProctorMethod] = useState<string | null>(null);

  // Pull a sieve analysis from the same sample (if CBR is run in a batch with it).
  // This only auto-fills the value; the two tests are NOT linked/required for each other.
  const { data: sampleTests } = trpc.specializedTests.getBySample.useQuery(
    { sampleId: dist?.sampleId ?? 0 },
    { enabled: !!dist?.sampleId },
  );
  const sievePassing19_5 = useMemo(() => {
    if (!Array.isArray(sampleTests)) return undefined;
    for (const t of sampleTests as any[]) {
      const fd = t?.formData;
      if (t?.formTemplate !== "sieve_analysis" || !fd || !Array.isArray(fd.rows)) continue;
      const row = fd.rows.find((r: any) => Math.abs(Number(r.sieveMm) - 19.5) < 0.05);
      const val = row?.cumPassing;
      if (val != null && Number.isFinite(Number(val))) return Number(val);
    }
    return undefined;
  }, [sampleTests]);

  // Auto-fill once from the linked sieve analysis (only if the tech hasn't typed a value).
  useEffect(() => {
    if (sievePassing19_5 !== undefined && !passing19Touched.current && passing19_5 === "") {
      setPassing19_5(String(sievePassing19_5));
    }
  }, [sievePassing19_5, passing19_5]);

  const proctorData = useMemo(() => {
    if (!Array.isArray(sampleTests)) return undefined;
    for (const t of sampleTests as any[]) {
      if (t?.formTemplate !== "soil_proctor") continue;
      return t;
    }
    return undefined;
  }, [sampleTests]);

  const proctorMdd = useMemo(() => {
    const fd = proctorData?.formData;
    if (!fd) return undefined;
    const corrected = fd.correctedMDD;
    if (corrected != null && Number(corrected) > 0) return Number(corrected);
    const m = fd.mddValue ?? fd.mdd ?? proctorData?.summaryValues?.mdd;
    if (m != null && Number.isFinite(Number(m))) return Number(m);
    return undefined;
  }, [proctorData]);

  const proctorOmc = useMemo(() => {
    const fd = proctorData?.formData;
    if (!fd) return undefined;
    const corrected = fd.correctedOMC;
    if (corrected != null && Number(corrected) > 0) return Number(corrected);
    const o = fd.omcValue ?? fd.omc ?? proctorData?.summaryValues?.omc;
    if (o != null && Number.isFinite(Number(o))) return Number(o);
    return undefined;
  }, [proctorData]);

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (typeof fd.standard === "string" && fd.standard in CBR_STANDARDS) {
      setStandard(fd.standard as CBRStandardKey);
      standardTouched.current = true;
    }
    if (typeof fd.layerType === "string") setLayerType(fd.layerType);
    if (typeof fd.soilDescription === "string") setSoilDescription(fd.soilDescription);
    if (fd.soakingPeriod != null) setSoakingPeriod(String(fd.soakingPeriod));
    if (fd.passing19_5 != null) setPassing19_5(String(fd.passing19_5));
    if (fd.mdd != null) setMddStr(String(fd.mdd));
    if (fd.omc != null) setOmcStr(String(fd.omc));
    const idd = fd.initialDensity as Record<string, unknown> | undefined;
    if (idd) {
      if (idd.massWetSoilCont != null) setMassWetSoilCont(String(idd.massWetSoilCont));
      if (idd.massDrySoilCont != null) setMassDrySoilCont(String(idd.massDrySoilCont));
      if (idd.massContainer != null) setMassContainer(String(idd.massContainer));
      if (idd.mouldBase != null) setMouldBase(String(idd.mouldBase));
      if (idd.mouldBaseSoil != null) setMouldBaseSoil(String(idd.mouldBaseSoil));
      if (idd.volumeMould != null) setVolumeMould(String(idd.volumeMould));
    }
    if (Array.isArray(fd.faces) && fd.faces.length > 0) {
      setFaces((fd.faces as CBRFace[]).map(f => ({
        id: f.id ?? `face_${Date.now()}_${f.faceLabel}`,
        faceLabel: f.faceLabel,
        readings: Array.isArray(f.readings) ? f.readings.map(String) : [],
      })));
    }
    if (typeof existing.notes === "string") setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [existing, hydrated]);

  useEffect(() => {
    const tm = proctorData?.formData?.testMethod as string | undefined;
    if (!tm) return;
    setLinkedProctorMethod(tm);
    if (!standardTouched.current && proctorMethodLinksToAstmCbr(tm)) {
      setStandard("ASTM_D1883");
    }
  }, [proctorData]);

  useEffect(() => {
    if (proctorMdd !== undefined && !mddTouched.current && mddStr === "") {
      setMddStr(String(proctorMdd));
    }
  }, [proctorMdd, mddStr]);

  useEffect(() => {
    if (proctorOmc !== undefined && !omcTouched.current && omcStr === "") {
      setOmcStr(String(proctorOmc));
    }
  }, [proctorOmc, omcStr]);

  const handleStandardChange = (val: CBRStandardKey) => {
    standardTouched.current = true;
    setStandard(val);
    const depthCount = CBR_STANDARDS[val].penetrationDepths.length;
    setFaces(prev => prev.map(f => ({
      ...f,
      readings: Array.from({ length: depthCount }, (_, i) => f.readings[i] ?? ""),
    })));
  };

  const layerSpec = LAYER_TYPES.find(l => l.value === layerType) ?? LAYER_TYPES[0];
  const computedFaces = faces.map(f => computeCBRFace(f, stdSpec));
  const penetrationDepths = stdSpec.penetrationDepths;

  const topFace = faces.find(f => f.faceLabel === "Top") ?? faces[0];
  const bottomFace = faces.find(f => f.faceLabel === "Bottom") ?? faces[1];
  const topComputed = computedFaces.find(f => f.faceLabel === "Top");
  const bottomComputed = computedFaces.find(f => f.faceLabel === "Bottom");

  // Retained % on the 20 mm sieve = 100 − (% passing 19.5 mm)
  const passing19Num = parseFloat(passing19_5);
  const retained20mm = Number.isFinite(passing19Num)
    ? parseFloat((100 - passing19Num).toFixed(1))
    : undefined;

  // Initial density / moisture content calculation (Excel: Moisture Content + Initial Density)
  const initialDensity = useMemo(() => {
    const wetC = parseFloat(massWetSoilCont);
    const dryC = parseFloat(massDrySoilCont);
    const cont = parseFloat(massContainer);
    const mb = parseFloat(mouldBase);
    const mbs = parseFloat(mouldBaseSoil);
    const vol = parseFloat(volumeMould);

    // Moisture content % = (wet+cont − dry+cont) / (dry+cont − cont) × 100
    const drySoil = dryC - cont;
    const moisture = Number.isFinite(wetC) && Number.isFinite(dryC) && Number.isFinite(cont) && drySoil > 0
      ? ((wetC - dryC) / drySoil) * 100
      : undefined;
    // Initial (bulk) sample density Mg/m³ = (mould+base+soil − mould+base) / volume
    const bulkDensity = Number.isFinite(mb) && Number.isFinite(mbs) && Number.isFinite(vol) && vol > 0
      ? (mbs - mb) / vol
      : undefined;
    // Dry density Mg/m³ = bulk density / (100 + moisture) × 100
    const dryDensity = bulkDensity !== undefined && moisture !== undefined
      ? bulkDensity / (100 + moisture) * 100
      : undefined;
    return { moisture, bulkDensity, dryDensity, volume: Number.isFinite(vol) ? vol : undefined };
  }, [massWetSoilCont, massDrySoilCont, massContainer, mouldBase, mouldBaseSoil, volumeMould]);

  // Degree of Compaction % = (initial dry density / MDD) × 100, MDD from Proctor.
  const mddNum = parseFloat(mddStr);
  const dryDensityPct = (initialDensity.dryDensity !== undefined && Number.isFinite(mddNum) && mddNum > 0)
    ? parseFloat(((initialDensity.dryDensity / mddNum) * 100).toFixed(1))
    : undefined;

  // Each face CBR is the higher of its 2.5 / 5.0 mm values (computeFace → cbrValue).
  const validFaces = computedFaces.filter(f => f.cbrValue !== undefined);
  const topCBR = topComputed?.cbrValue;
  const bottomCBR = bottomComputed?.cbrValue;
  const bothFaces = topCBR != null && bottomCBR != null;
  const cbrDiff = bothFaces ? Math.abs((topCBR as number) - (bottomCBR as number)) : null;
  // The average is only reported when the two faces agree within 10 (else repeat the test).
  const avgApplicable = bothFaces ? (cbrDiff as number) <= 10 : validFaces.length > 0;
  const cbrAverage = validFaces.length > 0
    ? parseFloat((validFaces.reduce((s, f) => s + (f.cbrValue ?? 0), 0) / validFaces.length).toFixed(1))
    : undefined;
  // Final reported CBR = average when applicable; otherwise undefined (show top & bottom only).
  const finalCBR = avgApplicable ? cbrAverage : undefined;

  // The acceptance limit applies to BOTH faces — each face must be ≥ the layer minimum.
  const facesMeetMin = validFaces.length > 0 && validFaces.every(f => (f.cbrValue ?? 0) >= layerSpec.cbrMin);
  const overallResult: "pass" | "fail" | "pending" =
    validFaces.length === 0 ? "pending"
    : !avgApplicable ? "pending"
    : facesMeetMin ? "pass" : "fail";

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
    if (status === "submitted" && validFaces.length === 0) {
      const d1 = stdSpec.keyDepthPrimary;
      const d2 = stdSpec.keyDepthSecondary;
      const unit = stdSpec.penetrationUnit;
      toast.error(ar
        ? `الرجاء إدخال قراءات الحمل عند ${d1}${unit} و ${d2}${unit} على الأقل`
        : `Please enter load readings at ${d1}" and ${d2}" (${unit})`);
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
          standardLabel: stdSpec.label,
          penetrationUnit: stdSpec.penetrationUnit,
          loadUnit: stdSpec.loadUnit,
          linkedProctorMethod,
          layerType,
          soilDescription,
          soakingPeriod,
          passing19_5: Number.isFinite(passing19Num) ? passing19Num : null,
          retained20mm: retained20mm ?? null,
          faces: computedFaces,
          finalCBR,
          cbrAverage: cbrAverage ?? null,
          cbrDiff: cbrDiff ?? null,
          avgApplicable,
          cbrMin: layerSpec.cbrMin,
          overallResult,
          mdd: Number.isFinite(mddNum) ? mddNum : null,
          omc: parseFloat(omcStr) || null,
          dryDensityPct: dryDensityPct ?? null,
          initialDensity: {
            massWetSoilCont: parseFloat(massWetSoilCont) || null,
            massDrySoilCont: parseFloat(massDrySoilCont) || null,
            massContainer: parseFloat(massContainer) || null,
            mouldBase: parseFloat(mouldBase) || null,
            mouldBaseSoil: parseFloat(mouldBaseSoil) || null,
            volumeMould: initialDensity.volume ?? null,
            moistureContent: initialDensity.moisture != null ? Number(initialDensity.moisture.toFixed(1)) : null,
            bulkDensity: initialDensity.bulkDensity != null ? Number(initialDensity.bulkDensity.toFixed(3)) : null,
            dryDensity: initialDensity.dryDensity != null ? Number(initialDensity.dryDensity.toFixed(3)) : null,
            mdd: Number.isFinite(mddNum) ? mddNum : null,
            dryDensityPct: dryDensityPct ?? null,
          },
        },
        overallResult,
        summaryValues: {
          topCBR: topCBR ?? null,
          bottomCBR: bottomCBR ?? null,
          finalCBR: finalCBR ?? null,
          cbrMin: layerSpec.cbrMin,
          layerType: layerSpec.label,
          standard: stdSpec.label,
          retained20mm: retained20mm ?? null,
          dryDensityPct: dryDensityPct ?? null,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  // Combined penetration curve data (top + bottom on one chart, like the Excel).
  // Empty cells are left as null (not 0) so the curve simply skips unfilled points
  // instead of dropping to zero. `connectNulls` bridges any gaps.
  const readingToNum = (raw: string | undefined): number | null => {
    if (raw == null || raw.trim() === "") return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };
  const mergedChartData = penetrationDepths.map((depth, i) => ({
    depth,
    top: readingToNum(topFace?.readings[i]),
    bottom: readingToNum(bottomFace?.readings[i]),
  })).filter(d => d.top != null || d.bottom != null);
  const hasCurveData = mergedChartData.some(d => (d.top ?? 0) > 0 || (d.bottom ?? 0) > 0);

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
          {standard === "ASTM_D1883" ? (
            ar ? (
              <><strong>إجراء ASTM D1883:</strong> {penetrationDepths.length} قراءة لكل وجه (علوي + سفلي) بالبوصة.
              CBR @ 0.1" = الحمل / 1000 lbf × 100 | CBR @ 0.2" = الحمل / 1500 lbf × 100.
              CBR المعتمد = الأعلى بين 0.1" و 0.2" | CBR النهائي = متوسط الوجهين.
              3 عينات: {stdSpec.specimens.join("، ")} ضربة/طبقة ({stdSpec.layers} طبقات).</>
            ) : (
              <><strong>ASTM D1883 Procedure:</strong> {penetrationDepths.length} readings per face (Top + Bottom) in inches.
              CBR @ 0.1" = Load / 1000 lbf × 100 | CBR @ 0.2" = Load / 1500 lbf × 100.
              Adopted CBR = max(0.1", 0.2") | Final CBR = average of top and bottom faces.
              3 specimens: {stdSpec.specimens.join(", ")} blows/layer ({stdSpec.layers} layers).</>
            )
          ) : (
            ar ? (
              <><strong>إجراء BS 1377-4:</strong> {penetrationDepths.length} قراءة لكل وجه بفواصل 0.25mm من 0 إلى 7.5mm.
              CBR = (الحمل / الحمل المعياري) × 100. CBR النهائي = متوسط الوجهين.
              الأحمال المعيارية: 2.5mm = {stdSpec.standardLoadPrimary} kN، 5.0mm = {stdSpec.standardLoadSecondary} kN.</>
            ) : (
              <><strong>BS 1377-4 Procedure:</strong> {penetrationDepths.length} readings per face at 0.25mm intervals from 0 to 7.5mm.
              CBR = (Load / Standard Load) × 100. Final CBR = average of top and bottom faces.
              Standard loads: 2.5mm = {stdSpec.standardLoadPrimary} kN, 5.0mm = {stdSpec.standardLoadSecondary} kN.</>
            )
          )}
        </div>

        {linkedProctorMethod && proctorMethodLinksToAstmCbr(linkedProctorMethod) && standard === "ASTM_D1883" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
            {ar
              ? `تم ربط CBR تلقائياً باختبار بروكتور (${linkedProctorMethod === "MODIFIED_PROCTOR" ? "ASTM D1557" : "ASTM D698"}) → ASTM D1883`
              : `CBR auto-linked to Proctor (${linkedProctorMethod === "MODIFIED_PROCTOR" ? "ASTM D1557" : "ASTM D698"}) → ASTM D1883`}
            {proctorMdd != null && (
              <span className="ml-2 font-semibold">| MDD: {proctorMdd} Mg/m³{proctorOmc != null ? `, OMC: ${proctorOmc}%` : ""}</span>
            )}
          </div>
        )}

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المعيار" : "Standard"}</Label>
                <Select value={standard} onValueChange={v => handleStandardChange(v as CBRStandardKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CBR_STANDARDS).map(([k, s]) => (
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
                  {bothFaces && !avgApplicable && (
                    <div className="font-bold text-amber-700">
                      {ar ? `الفرق ${cbrDiff}% > 10 — أعد الاختبار` : `Δ ${cbrDiff}% > 10 — repeat test`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Retained % on 20mm sieve = 100 − passing(19.5mm), from the sieve analysis */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "النسبة المارة من منخل 19.5 مم %" : "Passing % on 19.5 mm sieve"}
                </Label>
                <Input
                  type="number"
                  value={passing19_5}
                  onChange={e => { passing19Touched.current = true; setPassing19_5(e.target.value); }}
                  className="font-mono"
                  placeholder={ar ? "من تحليل المناخل، مثال: 92.8" : "from sieve analysis, e.g. 92.8"}
                  disabled={submitted}
                />
                {sievePassing19_5 !== undefined && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    {ar ? "تم جلبه من تحليل المناخل لنفس العينة" : "Auto-filled from sieve analysis of the same sample"}
                  </p>
                )}
              </div>
              <div className="flex items-end">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 w-full flex items-center justify-between">
                  <span className="font-semibold">
                    {ar ? "النسبة المحتجزة على منخل 20 مم" : "Retained % on 20 mm sieve"}
                    <span className="block text-[10px] font-normal text-amber-700">
                      = 100 − {ar ? "النسبة المارة من 19.5 مم" : "passing 19.5 mm"}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-lg">
                    {retained20mm !== undefined ? `${retained20mm}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Penetration vs. Load — Top & Bottom in one table + one combined chart */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                {ar ? "الاختراق مقابل الحمل (الوجهان)" : "Penetration vs. Load Readings (Top & Bottom)"}
              </CardTitle>
              <div className="flex flex-wrap gap-2 text-xs font-mono items-center">
                {topComputed?.cbrValue !== undefined && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {ar ? "CBR العلوي:" : "Top CBR:"} {topComputed.cbrValue}%
                  </span>
                )}
                {bottomComputed?.cbrValue !== undefined && (
                  <span className="bg-rose-100 text-rose-800 px-2 py-1 rounded">
                    {ar ? "CBR السفلي:" : "Bottom CBR:"} {bottomComputed.cbrValue}%
                  </span>
                )}
                {(topComputed?.cbrAnomaly || bottomComputed?.cbrAnomaly) && (
                  <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded font-sans font-semibold">
                    ⚠ {ar
                      ? `CBR عند ${stdSpec.keyDepthSecondary}${stdSpec.penetrationUnit} > CBR عند ${stdSpec.keyDepthPrimary}${stdSpec.penetrationUnit} — يلزم إعادة الاختبار`
                      : `CBR at ${stdSpec.keyDepthSecondary}${stdSpec.penetrationUnit} > ${stdSpec.keyDepthPrimary}${stdSpec.penetrationUnit} — repeat test required`}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Combined readings table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                        {ar ? `الاختراق (${stdSpec.penetrationUnit})` : `Pen. (${stdSpec.penetrationUnit})`}
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-blue-700">
                        {ar ? `العلوي (${stdSpec.loadUnit})` : `Top (${stdSpec.loadUnit})`}
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-rose-700">
                        {ar ? `السفلي (${stdSpec.loadUnit})` : `Bottom (${stdSpec.loadUnit})`}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {penetrationDepths.map((depth, i) => {
                      const isPrimary = Math.abs(depth - stdSpec.keyDepthPrimary) < 0.001;
                      const isSecondary = Math.abs(depth - stdSpec.keyDepthSecondary) < 0.001;
                      return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className={`border border-slate-200 px-2 py-1 text-center font-mono text-xs font-semibold
                          ${isPrimary ? "bg-blue-50 text-blue-700" : isSecondary ? "bg-purple-50 text-purple-700" : "text-slate-600"}`}>
                          {formatPenetrationDepth(depth, stdSpec.penetrationUnit)}
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <Input
                            value={topFace?.readings[i] ?? ""}
                            onChange={e => topFace && updateReading(topFace.id, i, e.target.value)}
                            disabled={submitted}
                            className={`h-7 text-xs w-full text-center font-mono
                              ${isPrimary ? "border-blue-300 bg-blue-50" : isSecondary ? "border-purple-300 bg-purple-50" : ""}`}
                            placeholder="—"
                          />
                        </td>
                        <td className="border border-slate-200 px-1 py-1">
                          <Input
                            value={bottomFace?.readings[i] ?? ""}
                            onChange={e => bottomFace && updateReading(bottomFace.id, i, e.target.value)}
                            disabled={submitted}
                            className={`h-7 text-xs w-full text-center font-mono
                              ${isPrimary ? "border-blue-300 bg-blue-50" : isSecondary ? "border-purple-300 bg-purple-50" : ""}`}
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
                <p className="text-xs text-blue-600 mt-1">
                  {ar
                    ? `أزرق = ${stdSpec.keyDepthPrimary}${stdSpec.penetrationUnit}، بنفسجي = ${stdSpec.keyDepthSecondary}${stdSpec.penetrationUnit}`
                    : `Blue = ${stdSpec.keyDepthPrimary}${stdSpec.penetrationUnit}, Purple = ${stdSpec.keyDepthSecondary}${stdSpec.penetrationUnit} (key CBR depths)`}
                </p>
              </div>

              {/* Combined penetration curve */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">{ar ? "منحنى الاختراق مقابل الحمل (العلوي والسفلي)" : "Penetration vs. Load Curve (Top & Bottom)"}</p>
                {hasCurveData ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={mergedChartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="depth"
                        type="number"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10 }}
                        label={{ value: ar ? `الاختراق (${stdSpec.penetrationUnit})` : `Penetration (${stdSpec.penetrationUnit})`, position: "insideBottom", offset: -10, fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        label={{ value: ar ? `الحمل (${stdSpec.loadUnit})` : `Load (${stdSpec.loadUnit})`, angle: -90, position: "insideLeft", fontSize: 10 }}
                      />
                      <Tooltip formatter={(v: number) => v.toFixed(2)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                      <ReferenceLine x={stdSpec.keyDepthPrimary} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: `${stdSpec.keyDepthPrimary}${stdSpec.penetrationUnit}`, position: "top", fontSize: 9, fill: "#3b82f6" }} />
                      <ReferenceLine x={stdSpec.keyDepthSecondary} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: `${stdSpec.keyDepthSecondary}${stdSpec.penetrationUnit}`, position: "top", fontSize: 9, fill: "#8b5cf6" }} />
                      <Line type="monotone" dataKey="top" name={ar ? "العلوي" : "Top"} stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                      <Line type="monotone" dataKey="bottom" name={ar ? "السفلي" : "Bottom"} stroke="#e11d48" strokeWidth={2} dot={{ r: 2 }} connectNulls />
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

        {/* Initial Density / Moisture Content (as-moulded sample, before soaking) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {ar ? "الكثافة الأولية / المحتوى الرطوبي" : "Initial Density / Moisture Content"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Moisture Content Details */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                  {ar ? "تفاصيل المحتوى الرطوبي" : "Moisture Content Details"}
                </p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "وزن التربة الرطبة + الوعاء (g)" : "Mass of wet soil + container, g"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 w-32">
                        <Input value={massWetSoilCont} onChange={e => setMassWetSoilCont(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "وزن التربة الجافة + الوعاء (g)" : "Mass of dry soil + container, g"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={massDrySoilCont} onChange={e => setMassDrySoilCont(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "وزن الوعاء (g)" : "Mass of container, g"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={massContainer} onChange={e => setMassContainer(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr className="bg-blue-50/60">
                      <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        {ar ? "المحتوى الرطوبي %" : "Moisture Content, %"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-center font-mono font-bold text-blue-700">
                        {initialDensity.moisture !== undefined ? initialDensity.moisture.toFixed(1) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Initial Density Calculation */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                  {ar ? "حساب الكثافة الأولية" : "Initial Density Calculation"}
                </p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "القالب + القاعدة (g)" : "Mould + Base, g"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 w-32">
                        <Input value={mouldBase} onChange={e => setMouldBase(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "القالب + القاعدة + التربة (g)" : "Mould + Base + Soil, g"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={mouldBaseSoil} onChange={e => setMouldBaseSoil(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "حجم القالب (cc)" : "Volume of Mould, cc"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={volumeMould} onChange={e => setVolumeMould(e.target.value)} disabled={submitted} className="h-8 text-xs font-mono text-center" placeholder="—" />
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/60">
                      <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        {ar ? "الكثافة الأولية (Mg/m³)" : "Initial Sample Density, Mg/m³"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-center font-mono font-bold text-emerald-700">
                        {initialDensity.bulkDensity !== undefined ? initialDensity.bulkDensity.toFixed(3) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "أقصى كثافة جافة MDD (Mg/m³)" : "Max. Dry Density MDD, Mg/m³"}
                        <span className="block text-[10px] font-normal text-slate-400">{ar ? "من اختبار بروكتور" : "from Proctor test"}</span>
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={mddStr}
                          onChange={e => { mddTouched.current = true; setMddStr(e.target.value); }}
                          disabled={submitted}
                          className="h-8 text-xs font-mono text-center"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                        {ar ? "نسبة الرطوبة المثلى OMC (%)" : "Optimum Moisture Content OMC (%)"}
                        <span className="block text-[10px] font-normal text-slate-400">{ar ? "من اختبار بروكتور" : "from Proctor test"}</span>
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={omcStr}
                          onChange={e => { omcTouched.current = true; setOmcStr(e.target.value); }}
                          disabled={submitted}
                          className="h-8 text-xs font-mono text-center"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/60">
                      <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                        {ar ? "درجة الدمك %" : "Degree of Compaction, %"}
                        <span className="block text-[10px] font-normal text-slate-400">= {ar ? "الكثافة الجافة ÷ MDD × 100" : "Dry Density ÷ MDD × 100"}</span>
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-center font-mono font-bold text-emerald-700">
                        {dryDensityPct !== undefined ? `${dryDensityPct}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {proctorMdd !== undefined && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    {ar ? "تم جلب MDD من اختبار بروكتور لنفس العينة" : "MDD auto-filled from the Proctor test of the same sample"}
                  </p>
                )}
              </div>
            </div>

            {/* Result summary (Excel reference block) */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">{ar ? "الكثافة الأولية" : "Initial Density"}</p>
                <p className="font-mono font-bold text-slate-800">{initialDensity.bulkDensity !== undefined ? initialDensity.bulkDensity.toFixed(3) : "—"}<span className="text-[10px] font-normal text-slate-400"> Mg/m³</span></p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">{ar ? "المحتوى الرطوبي" : "Moisture Content"}</p>
                <p className="font-mono font-bold text-slate-800">{initialDensity.moisture !== undefined ? initialDensity.moisture.toFixed(1) : "—"}<span className="text-[10px] font-normal text-slate-400"> %</span></p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">{ar ? "الكثافة الجافة" : "Dry Density"}</p>
                <p className="font-mono font-bold text-emerald-800">{initialDensity.dryDensity !== undefined ? initialDensity.dryDensity.toFixed(3) : "—"}<span className="text-[10px] font-normal text-slate-400"> Mg/m³</span></p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">{ar ? "درجة الدمك" : "Degree of Compaction"}</p>
                <p className="font-mono font-bold text-emerald-800">{dryDensityPct !== undefined ? dryDensityPct : "—"}<span className="text-[10px] font-normal text-slate-400"> %</span></p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-[11px] text-slate-500 mb-0.5">{ar ? "حجم القالب" : "Volume of Mould"}</p>
                <p className="font-mono font-bold text-slate-800">{initialDensity.volume !== undefined ? initialDensity.volume : "—"}<span className="text-[10px] font-normal text-slate-400"> cm³</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {validFaces.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {computedFaces.map(f => {
                  if (f.cbrValue === undefined) return null;
                  const facePass = (f.cbrValue ?? 0) >= layerSpec.cbrMin;
                  return (
                    <div key={f.id} className={`rounded-xl p-4 text-center border ${facePass ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs text-slate-500 mb-1">{ar ? (f.faceLabel === "Top" ? "CBR الوجه العلوي" : "CBR الوجه السفلي") : f.faceLabel + " Face CBR"}</p>
                      <p className={`text-3xl font-bold ${facePass ? "text-emerald-800" : "text-red-800"}`}>{f.cbrValue}%</p>
                      <p className="text-[11px] text-slate-400">{ar ? "الحد الأدنى:" : "Min:"} ≥ {layerSpec.cbrMin}% · {facePass ? (ar ? "مقبول" : "Pass") : (ar ? "مرفوض" : "Fail")}</p>
                    </div>
                  );
                })}
                {avgApplicable && finalCBR !== undefined ? (
                  <div className={`rounded-xl p-4 text-center border ${overallResult === "pass" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-xs text-slate-500 mb-1">{ar ? "CBR النهائي (المتوسط)" : "Final CBR (Average)"}</p>
                    <p className={`text-3xl font-bold ${overallResult === "pass" ? "text-emerald-800" : "text-red-800"}`}>{finalCBR}%</p>
                    <p className="text-xs text-slate-400">{ar ? "الحد الأدنى المطلوب:" : "Min. required:"} {layerSpec.cbrMin}%</p>
                  </div>
                ) : (
                  <div className="rounded-xl p-4 text-center border bg-amber-50 border-amber-200">
                    <p className="text-xs text-slate-500 mb-1">{ar ? "CBR النهائي (المتوسط)" : "Final CBR (Average)"}</p>
                    <p className="text-base font-bold text-amber-800">{ar ? "لا يُحتسب المتوسط" : "Average not reported"}</p>
                    <p className="text-[11px] text-amber-700 mt-1">
                      {ar ? `الفرق بين الوجهين ${cbrDiff}% > 10 — أعد الاختبار` : `Faces differ by ${cbrDiff}% > 10 — repeat test`}
                    </p>
                  </div>
                )}
              </div>
              <ResultBanner
                result={overallResult}
                testName={`CBR Test — ${layerSpec.label}`}
                standard={stdSpec.label}
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
