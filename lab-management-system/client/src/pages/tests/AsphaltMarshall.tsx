import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import { getMarshallCorrectionFactor } from "@/lib/marshallCorrectionFactors";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, FlaskConical, UserCheck, Printer, AlertCircle, Info, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

interface SpecimenInput {
  id: string;
  specimenNumber: number;
  readingKN: string;
  volume: number;
  flowMm: string;
}

interface SpecimenComputed extends SpecimenInput {
  corrFactor: number;
  stabilityN: number;
  corrStabilityN: number;
  flowUnits: number;
}

function extractVolumeFromBulkSpecimen(spec: Record<string, unknown>): number {
  if (spec.volume != null && spec.volume !== "") {
    return Number(spec.volume) || 0;
  }
  const ssd = parseFloat(String(spec.ssdMass ?? spec.weightSSD ?? ""));
  const water = parseFloat(String(spec.massWater ?? spec.weightInWater ?? ""));
  if (ssd > water) return parseFloat((ssd - water).toFixed(1));
  return 0;
}

function buildSpecimensFromBulkSG(bulkSpecimens: Record<string, unknown>[]): SpecimenInput[] {
  const withVolume = bulkSpecimens
    .map((s, idx) => ({
      id: String(s.id ?? `spec_${idx + 1}`),
      specimenNumber: idx + 1,
      readingKN: "",
      volume: extractVolumeFromBulkSpecimen(s),
      flowMm: "",
    }))
    .filter((s) => s.volume > 0);

  if (withVolume.length > 0) return withVolume;

  return bulkSpecimens.map((s, idx) => ({
    id: String(s.id ?? `spec_${idx + 1}`),
    specimenNumber: idx + 1,
    readingKN: "",
    volume: extractVolumeFromBulkSpecimen(s),
    flowMm: "",
  }));
}

function computeSpecimen(spec: SpecimenInput): SpecimenComputed {
  const reading = parseFloat(spec.readingKN) || 0;
  const corrFactor = getMarshallCorrectionFactor(spec.volume);
  const stabilityN = reading * 1000;
  const corrStabilityN = stabilityN * corrFactor;
  const flowMm = parseFloat(spec.flowMm) || 0;
  const flowUnits = flowMm / 0.25;

  return {
    ...spec,
    corrFactor: parseFloat(corrFactor.toFixed(2)),
    stabilityN: parseFloat(stabilityN.toFixed(0)),
    corrStabilityN: parseFloat(corrStabilityN.toFixed(0)),
    flowUnits: parseFloat(flowUnits.toFixed(0)),
  };
}

function mapLegacySpecimen(s: Record<string, unknown>, idx: number, volume: number): SpecimenInput {
  return {
    id: String(s.id ?? `spec_${idx + 1}`),
    specimenNumber: Number(s.specimenNumber ?? idx + 1),
    readingKN: String(s.readingKN ?? s.stability ?? ""),
    volume: Number(s.volume ?? volume) || volume,
    flowMm: String(s.flowMm ?? s.flow ?? ""),
  };
}

export default function AsphaltMarshall() {
  const { user } = useAuth();
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );
  const { data: bulkSGResults = [], isLoading: bulkSGLoading } =
    trpc.specializedTests.getBySampleAndTestType.useQuery(
      {
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: "ASPH_MARSHALL_DENSITY",
        status: "submitted",
      },
      { enabled: !!dist?.sampleId },
    );

  const bulkSGResult = bulkSGResults[0];
  const bulkSGCompleted = bulkSGResult?.status === "submitted";
  const bulkSGData = (bulkSGResult?.formData ?? {}) as Record<string, unknown>;
  const bulkSGSpecimens = (bulkSGData.specimens ?? []) as Record<string, unknown>[];
  const bulkSGAverages = (bulkSGData.averages ?? bulkSGData) as Record<string, unknown>;

  const [specimens, setSpecimens] = useState<SpecimenInput[]>([]);
  const [testTemperature, setTestTemperature] = useState("60");
  const [soakingTime, setSoakingTime] = useState("35");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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

  useEffect(() => {
    if (!bulkSGCompleted || hydrated) return;

    if (existing?.formData) {
      const fd = existing.formData as Record<string, unknown>;
      if (fd.notes) setNotes(String(fd.notes));
      if (fd.testTemperature != null) setTestTemperature(String(fd.testTemperature));
      if (fd.soakingTime != null) setSoakingTime(String(fd.soakingTime));
      const saved = fd.specimens as Record<string, unknown>[] | undefined;
      if (Array.isArray(saved) && saved.length > 0) {
        const fromBulk = buildSpecimensFromBulkSG(bulkSGSpecimens);
        setSpecimens(
          saved.map((s, i) =>
            mapLegacySpecimen(s, i, fromBulk[i]?.volume ?? extractVolumeFromBulkSpecimen(s)),
          ),
        );
      } else if (bulkSGSpecimens.length > 0) {
        setSpecimens(buildSpecimensFromBulkSG(bulkSGSpecimens));
      }
      if (existing.status === "submitted") setSubmitted(true);
      setHydrated(true);
      return;
    }

    if (bulkSGSpecimens.length > 0) {
      setSpecimens(buildSpecimensFromBulkSG(bulkSGSpecimens));
      setHydrated(true);
    }
  }, [bulkSGCompleted, bulkSGSpecimens, existing, hydrated]);

  const mixType = dist?.testSubType ?? "base_course";
  const isWearingCourse = mixType === "wearing_course";

  const avgAirVoids = Number(bulkSGAverages.avgAirVoids ?? bulkSGData.avgAirVoids ?? 0);
  const avgVMA = Number(bulkSGAverages.avgVMA ?? bulkSGData.avgVMA ?? 0);
  const avgGmb = Number(bulkSGAverages.avgGmb ?? bulkSGData.avgGmb ?? 0);

  const specs = useMemo(
    () => ({
      airVoids: { min: 3, max: 5 },
      vma: { min: isWearingCourse ? 14 : 13 },
      corrStability: { min: 8000 },
      flow: { min: 8, max: 16 },
    }),
    [isWearingCourse],
  );

  const computedSpecimens = useMemo(() => specimens.map(computeSpecimen), [specimens]);
  const enteredSpecimens = computedSpecimens.filter(
    (s) => parseFloat(s.readingKN) > 0 || parseFloat(s.flowMm) > 0,
  );

  const rawAvgCorrStability =
    enteredSpecimens.length > 0
      ? enteredSpecimens.reduce((sum, s) => sum + s.corrStabilityN, 0) / enteredSpecimens.length
      : 0;
  const avgCorrStability = Math.round(rawAvgCorrStability / 50) * 50;
  const avgFlow =
    enteredSpecimens.length > 0
      ? enteredSpecimens.reduce((sum, s) => sum + s.flowUnits, 0) / enteredSpecimens.length
      : 0;

  const airVoidsPass = bulkSGCompleted && avgAirVoids >= specs.airVoids.min && avgAirVoids <= specs.airVoids.max;
  const vmaPass = bulkSGCompleted && avgVMA >= specs.vma.min;
  const stabilityPass = enteredSpecimens.length > 0 && avgCorrStability >= specs.corrStability.min;
  const flowPass =
    enteredSpecimens.length > 0 && avgFlow >= specs.flow.min && avgFlow <= specs.flow.max;
  const overallPass = airVoidsPass && vmaPass && stabilityPass && flowPass;
  const overallResult = overallPass ? "pass" : "fail";

  const updateSpecimen = (index: number, field: "readingKN" | "flowMm", value: string) => {
    setSpecimens((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && enteredSpecimens.length === 0) {
      toast.error(ar ? "الرجاء إدخال قراءة ثبات وتدفق لعينة واحدة على الأقل" : "Enter stability and flow for at least one specimen");
      return;
    }

    const formData = {
      mixType,
      testTemperature: parseFloat(testTemperature) || 60,
      soakingTime: parseFloat(soakingTime) || 35,
      specimens: computedSpecimens,
      volumetricFromBulkSG: {
        avgAirVoids,
        avgVMA,
        avgGmb,
        bulkSGDistributionId: bulkSGResult?.distributionId,
      },
      averages: {
        avgCorrStability: parseFloat(avgCorrStability.toFixed(0)),
        avgFlow: parseFloat(avgFlow.toFixed(0)),
      },
      specifications: specs,
      passFailChecks: { airVoidsPass, vmaPass, stabilityPass, flowPass },
    };

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_MARSHALL",
        formTemplate: "asphalt_marshall",
        formData,
        overallResult: enteredSpecimens.length === 0 ? "pending" : overallResult,
        summaryValues: {
          avgCorrStability: parseFloat(avgCorrStability.toFixed(0)),
          avgFlow: parseFloat(avgFlow.toFixed(0)),
          mixType,
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
        <div className="p-6 text-center text-red-600">
          {ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
        </div>
      </DashboardLayout>
    );
  }

  if (bulkSGLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          {ar ? "جاري التحميل..." : "Loading..."}
        </div>
      </DashboardLayout>
    );
  }

  if (!bulkSGCompleted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{ar ? "اختبار مقفل" : "Test Locked"}</h3>
          <p className="text-muted-foreground mb-4">
            {ar
              ? "يجب إكمال اختبار الثقل النوعي الظاهري (ASTM D 2726) على نفس العينة أولاً"
              : "Bulk Specific Gravity test (ASTM D 2726) must be completed on this sample first"}
          </p>
          <Button variant="outline" onClick={() => setLocation("/technician")}>
            {ar ? "رجوع" : "Go Back"}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: ar ? "نوع الخلطة" : "Mix type", value: dist?.testSubType }]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / مارشال" : "Asphalt Tests / Marshall"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar
                ? "الثبات والتدفق لخلطة HMA (ASTM D 6927)"
                : "HMA Marshall Stability and Flow (ASTM D 6927)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM D 6927 | {ar ? "أمر التوزيع:" : "Distribution:"}{" "}
              {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "العودة" : "Back"}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                >
                  <Printer size={14} />
                  {ar ? "طباعة التقرير" : "Print Report"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleSave("submitted")}
                  disabled={saving}
                >
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري..." : "Submitting...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "درجة حرارة الاختبار (°C)" : "Test Temperature (°C)"}</Label>
                <Input value={testTemperature} onChange={e => setTestTemperature(e.target.value)}
                  placeholder="60" className="h-9" disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مدة النقع في حمام الماء (دقيقة)" : "Water Bath Soaking Time (min)"}</Label>
                <Input value={soakingTime} onChange={e => setSoakingTime(e.target.value)}
                  placeholder="35" className="h-9" disabled={submitted} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Info className="w-4 h-4" />
              {ar ? "البيانات من اختبار الثقل النوعي الظاهري" : "Data from Bulk Specific Gravity Test"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">{ar ? "النوع" : "Mix Type"}</Label>
                <div className="font-semibold mt-1">
                  {isWearingCourse
                    ? ar
                      ? "طبقة التآكل"
                      : "Wearing Course"
                    : ar
                      ? "طبقة الأساس"
                      : "Base Course"}
                </div>
              </div>
              <div className={airVoidsPass ? "text-green-700" : "text-red-700"}>
                <Label className="text-xs">{ar ? "الفراغات الهوائية" : "Air Voids"}</Label>
                <div className="font-semibold mt-1">
                  {avgAirVoids.toFixed(1)}% {airVoidsPass ? "✓" : "✗"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Spec: {specs.airVoids.min}-{specs.airVoids.max}%
                </div>
              </div>
              <div className={vmaPass ? "text-green-700" : "text-red-700"}>
                <Label className="text-xs">VMA</Label>
                <div className="font-semibold mt-1">
                  {avgVMA.toFixed(1)} {vmaPass ? "✓" : "✗"}
                </div>
                <div className="text-xs text-muted-foreground">Spec: ≥{specs.vma.min}</div>
              </div>
              <div>
                <Label className="text-xs">{ar ? "متوسط Gmb" : "Avg Gmb"}</Label>
                <div className="font-semibold mt-1">{avgGmb > 0 ? avgGmb.toFixed(3) : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {ar ? "قياسات الثبات والتدفق" : "Stability and Flow Measurements"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {specimens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {ar ? "لا توجد عينات في نتائج الثقل النوعي الظاهري" : "No specimens found in Bulk SG results"}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "رقم العينة" : "Specimen #"}</th>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "القراءة (kN)" : "Reading (kN)"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                        {ar ? "الحجم (cm³)" : "Volume (cm³)"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                        {ar ? "معامل التصحيح" : "Corr. Factor"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                        {ar ? "الثبات (N)" : "Stability (N)"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                        {ar ? "الثبات المصحح (N)" : "Corr. Stability (N)"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2">{ar ? "التدفق (mm)" : "Flow (mm)"}</th>
                      <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                        {ar ? "التدفق (وحدات 0.25mm)" : "Flow (0.25mm units)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedSpecimens.map((spec, idx) => (
                      <tr key={spec.id}>
                        <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          {spec.specimenNumber}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={spec.readingKN}
                            onChange={(e) => updateSpecimen(idx, "readingKN", e.target.value)}
                            className={LAB_NUMERIC_INPUT_SM}
                            placeholder="10.5"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {spec.volume.toFixed(1)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {spec.corrFactor.toFixed(2)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {spec.stabilityN.toFixed(0)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {spec.corrStabilityN.toFixed(0)}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={spec.flowMm}
                            onChange={(e) => updateSpecimen(idx, "flowMm", e.target.value)}
                            className={LAB_NUMERIC_INPUT_SM}
                            placeholder="3.5"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {spec.flowUnits.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {enteredSpecimens.length > 0 && (
                    <tfoot className="bg-green-50 font-semibold">
                      <tr>
                        <td colSpan={5} className="border border-slate-300 px-2 py-2 text-right">
                          {ar ? "المتوسط:" : "Average:"}
                        </td>
                        <td
                          className={`border border-slate-300 px-2 py-2 text-center text-base ${
                            stabilityPass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {avgCorrStability.toFixed(0)} {stabilityPass ? "✓" : "✗"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2" />
                        <td
                          className={`border border-slate-300 px-2 py-2 text-center text-base ${
                            flowPass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {avgFlow.toFixed(0)} {flowPass ? "✓" : "✗"}
                        </td>
                      </tr>
                      <tr className="bg-amber-50 text-xs">
                        <td colSpan={5} className="border border-slate-300 px-2 py-2 text-right">
                          {ar ? "المواصفة:" : "Specification:"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center text-red-700 font-semibold">
                          ≥{specs.corrStability.min} N
                        </td>
                        <td className="border border-slate-300 px-2 py-2" />
                        <td className="border border-slate-300 px-2 py-2 text-center text-red-700 font-semibold">
                          {specs.flow.min}-{specs.flow.max}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {ar
                ? "التدفق بالوحدات = مم ÷ 0.25 (المواصفة 8–16 وحدات = 2–4 مم)"
                : "Flow units = mm ÷ 0.25 (spec 8–16 units = 2–4 mm)"}
            </p>
          </CardContent>
        </Card>

        {enteredSpecimens.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div
                className={`p-6 rounded-lg border-2 text-center ${
                  overallPass
                    ? "bg-green-50 border-green-500 text-green-900"
                    : "bg-red-50 border-red-500 text-red-900"
                }`}
              >
                <div className="text-3xl font-bold mb-2">
                  {overallPass ? (ar ? "مقبول ✓" : "PASS ✓") : ar ? "مرفوض ✗" : "FAIL ✗"}
                </div>
                {!overallPass && (
                  <div className="text-sm space-y-1 mt-3">
                    {!airVoidsPass && (
                      <div>{ar ? "❌ الفراغات الهوائية خارج الحد" : "❌ Air Voids out of spec"}</div>
                    )}
                    {!vmaPass && (
                      <div>{ar ? "❌ VMA أقل من الحد الأدنى" : "❌ VMA below minimum"}</div>
                    )}
                    {!stabilityPass && (
                      <div>
                        {ar ? "❌ الثبات المصحح أقل من الحد" : "❌ Corr. Stability below minimum"}
                      </div>
                    )}
                    {!flowPass && <div>{ar ? "❌ التدفق خارج الحد" : "❌ Flow out of range"}</div>}
                  </div>
                )}
                {overallPass && (
                  <div className="text-sm mt-2">
                    {ar ? "جميع المعايير مستوفاة" : "All criteria met"}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
