import { useState, useCallback, useEffect, useMemo } from "react";
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
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { extractBitumenContentFromExtractionResult } from "@/lib/asphaltBitumen";

// Bulk Specific Gravity of Compacted HMA — ASTM D 2726

interface TestParameters {
  pb: string;
  gsb: string;
  gse: string;
  gb: string;
}

interface SpecimenInput {
  id: string;
  massAir: string;
  massWater: string;
  ssdMass: string;
}

interface SpecimenComputed extends SpecimenInput {
  volume: number;
  gmb: number;
}

interface VolumetricRow {
  gsb: string;
  airVoids: number;
  vma: number;
  vfb: number;
}

function newSpecimen(index: number): SpecimenInput {
  return {
    id: `spec_${Date.now()}_${index}`,
    massAir: "",
    massWater: "",
    ssdMass: "",
  };
}

function computeSpecimen(spec: SpecimenInput): SpecimenComputed {
  const air = parseFloat(spec.massAir) || 0;
  const water = parseFloat(spec.massWater) || 0;
  const ssd = parseFloat(spec.ssdMass) || 0;
  const volume = ssd > water ? parseFloat((ssd - water).toFixed(1)) : 0;
  const gmb = volume > 0 ? parseFloat((air / volume).toFixed(3)) : 0;
  return { ...spec, volume, gmb };
}

function calculateGmm(pb: number, gse: number, gb: number): number {
  if (pb <= 0 || gse <= 0 || gb <= 0) return 0;
  const gmm = 100 / ((100 - pb) / gse + pb / gb);
  return parseFloat(gmm.toFixed(3));
}

function computeVolumetric(
  gmb: number,
  gmm: number,
  pb: number,
  gsb: number,
  gsbDisplay: string,
): VolumetricRow {
  const airVoids = gmm > 0 ? parseFloat((100 * ((gmm - gmb) / gmm)).toFixed(1)) : 0;
  const vma = gsb > 0 ? parseFloat((100 - ((100 - pb) * gmb) / gsb).toFixed(1)) : 0;
  const vfb = vma > 0 ? parseFloat((((vma - airVoids) / vma) * 100).toFixed(0)) : 0;
  return { gsb: gsbDisplay, airVoids, vma, vfb };
}

function mapLegacySpecimen(s: Record<string, unknown>, index: number): SpecimenInput {
  return {
    id: String(s.id ?? `spec_${index}`),
    massAir: String(s.massAir ?? s.weightInAir ?? ""),
    massWater: String(s.massWater ?? s.weightInWater ?? ""),
    ssdMass: String(s.ssdMass ?? s.weightSSD ?? ""),
  };
}

export default function AsphaltMarshallDensity() {
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
  const { data: bitumenExtractionResults = [] } = trpc.specializedTests.getBySampleAndTestType.useQuery(
    {
      sampleId: dist?.sampleId ?? 0,
      testTypeCode: "ASPH_BITUMEN_EXTRACT",
      status: "submitted",
    },
    { enabled: !!dist?.sampleId },
  );

  const bitumenExtraction = bitumenExtractionResults[0];
  const bitumenFromExtraction = useMemo(
    () => extractBitumenContentFromExtractionResult(bitumenExtraction),
    [bitumenExtraction],
  );

  const [parameters, setParameters] = useState<TestParameters>({
    pb: "",
    gsb: "",
    gse: "",
    gb: "",
  });
  const [specimens, setSpecimens] = useState<SpecimenInput[]>([
    newSpecimen(0),
    newSpecimen(1),
    newSpecimen(2),
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (bitumenFromExtraction == null) return;
    setParameters((prev) =>
      prev.pb === "" || prev.pb === String(bitumenFromExtraction)
        ? { ...prev, pb: String(bitumenFromExtraction) }
        : prev,
    );
  }, [bitumenFromExtraction]);

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
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;

    if (fd.notes) setNotes(String(fd.notes));

    const params = fd.parameters as TestParameters | undefined;
    if (params) {
      setParameters({
        pb: String(params.pb ?? ""),
        gsb: String(params.gsb ?? ""),
        gse: String(params.gse ?? ""),
        gb: String(params.gb ?? ""),
      });
    } else {
      const legacyGso = fd.theoreticalGso != null ? String(fd.theoreticalGso) : "";
      const legacyBitumen = fd.bitumenContent != null ? String(fd.bitumenContent) : "";
      setParameters((prev) => ({
        pb: legacyBitumen || prev.pb,
        gsb: prev.gsb,
        gse: legacyGso || prev.gse,
        gb: prev.gb || "1.030",
      }));
    }

    const rawSpecimens = (fd.specimens ?? fd.computedSpecimens) as Record<string, unknown>[] | undefined;
    if (Array.isArray(rawSpecimens) && rawSpecimens.length > 0) {
      setSpecimens(rawSpecimens.map(mapLegacySpecimen));
    }

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const pbNum = parseFloat(parameters.pb) || 0;
  const gsbNum = parseFloat(parameters.gsb) || 0;
  const gseNum = parseFloat(parameters.gse) || 0;
  const gbNum = parseFloat(parameters.gb) || 0;
  const gmm = calculateGmm(pbNum, gseNum, gbNum);

  const computedSpecimens = useMemo(() => specimens.map(computeSpecimen), [specimens]);
  const validSpecimens = computedSpecimens.filter((s) => s.gmb > 0);

  const avgGmb =
    validSpecimens.length > 0
      ? validSpecimens.reduce((sum, s) => sum + s.gmb, 0) / validSpecimens.length
      : 0;

  const volumetricData = useMemo(
    () =>
      computedSpecimens.map((spec) =>
        computeVolumetric(spec.gmb, gmm, pbNum, gsbNum, parameters.gsb),
      ),
    [computedSpecimens, gmm, pbNum, gsbNum, parameters.gsb],
  );

  const validVolumetric = volumetricData.filter((_, i) => computedSpecimens[i].gmb > 0);
  const avgAirVoids =
    validVolumetric.length > 0
      ? validVolumetric.reduce((sum, v) => sum + v.airVoids, 0) / validVolumetric.length
      : 0;
  const avgVMA =
    validVolumetric.length > 0
      ? validVolumetric.reduce((sum, v) => sum + v.vma, 0) / validVolumetric.length
      : 0;
  const avgVFB =
    validVolumetric.length > 0
      ? validVolumetric.reduce((sum, v) => sum + v.vfb, 0) / validVolumetric.length
      : 0;

  const airVoidsPass = validVolumetric.length > 0 && avgAirVoids >= 3 && avgAirVoids <= 5;
  const vmaPass = validVolumetric.length > 0 && avgVMA >= 13;
  const overallPass = validVolumetric.length > 0 && gmm > 0 && airVoidsPass && vmaPass;
  const overallResult = overallPass ? "pass" : "fail";

  const updateSpecimen = useCallback((index: number, field: keyof SpecimenInput, value: string) => {
    setSpecimens((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validSpecimens.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one specimen result");
      return;
    }
    if (status === "submitted" && gmm <= 0) {
      toast.error(
        ar
          ? "الرجاء إدخال Pb و Gse و Gb لحساب Gmm"
          : "Please enter Pb, Gse, and Gb to calculate Gmm",
      );
      return;
    }
    if (status === "submitted" && gsbNum <= 0) {
      toast.error(ar ? "الرجاء إدخال Gsb لحساب VMA" : "Please enter Gsb for VMA calculations");
      return;
    }

    const formData = {
      parameters: { ...parameters, gmm },
      specimens: computedSpecimens,
      volumetricData,
      averages: {
        avgGmb: parseFloat(avgGmb.toFixed(3)),
        avgAirVoids: parseFloat(avgAirVoids.toFixed(1)),
        avgVMA: parseFloat(avgVMA.toFixed(1)),
        avgVFB: parseFloat(avgVFB.toFixed(0)),
      },
      bitumenContent: bitumenFromExtraction,
      notes,
      // Legacy fields for older report paths
      avgGmb: parseFloat(avgGmb.toFixed(3)),
      avgAirVoids: avgAirVoids.toFixed(1),
      avgVMA: avgVMA.toFixed(1),
      avgVFB: avgVFB.toFixed(0),
    };

    const summaryValues = {
      gmm,
      bitumenContent: parameters.pb || bitumenFromExtraction,
      avgGmb: parseFloat(avgGmb.toFixed(3)),
      avgAirVoids: parseFloat(avgAirVoids.toFixed(1)),
      avgVMA: parseFloat(avgVMA.toFixed(1)),
      avgVFB: parseFloat(avgVFB.toFixed(0)),
    };

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_MARSHALL_DENSITY",
        formTemplate: "asphalt_marshall_density",
        formData,
        overallResult,
        summaryValues,
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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: ar ? "نوع الخلطة" : "Mix type", value: dist?.testSubType }]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / الثقل النوعي الظاهري" : "Asphalt Tests / Bulk Specific Gravity"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar
                ? "الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)"
                : "Bulk Specific Gravity of Compacted HMA (ASTM D 2726)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM D 2726 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                  {saving ? (ar ? "جاري..." : "Submitting...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">{ar ? "الفاحص" : "Tested By"}</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <UserCheck size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 1: Test Parameters */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {ar ? "معاملات الاختبار" : "Test Parameters"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">
                  {ar ? "محتوى الرابط (Pb) %" : "Binder Content (Pb) %"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={parameters.pb}
                  readOnly
                  className="h-8 text-sm bg-blue-50 font-semibold mt-1"
                />
                <p className="text-xs text-blue-600 mt-1">
                  {bitumenFromExtraction != null
                    ? ar
                      ? "من نتائج استخلاص البيتومين"
                      : "From Bitumen Extraction"
                    : ar
                      ? "أكمل استخلاص البيتومين لملء Pb تلقائياً"
                      : "Complete Bitumen Extraction to auto-fill Pb"}
                </p>
              </div>

              <div>
                <Label className="text-xs">
                  {ar ? "الثقل النوعي الظاهري للركام (Gsb)" : "Bulk SG of Aggregate (Gsb)"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  value={parameters.gsb}
                  onChange={(e) => setParameters({ ...parameters, gsb: e.target.value })}
                  className="h-8 text-sm mt-1"
                  placeholder="2.650"
                  disabled={submitted}
                />
              </div>

              <div>
                <Label className="text-xs">
                  {ar ? "الثقل النوعي الفعال للركام (Gse)" : "Effective SG of Aggregate (Gse)"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  value={parameters.gse}
                  onChange={(e) => setParameters({ ...parameters, gse: e.target.value })}
                  className="h-8 text-sm mt-1"
                  placeholder="2.700"
                  disabled={submitted}
                />
              </div>

              <div>
                <Label className="text-xs">
                  {ar ? "الثقل النوعي للرابط (Gb)" : "SG of Binder (Gb)"}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  value={parameters.gb}
                  onChange={(e) => setParameters({ ...parameters, gb: e.target.value })}
                  className="h-8 text-sm mt-1"
                  placeholder="1.030"
                  disabled={submitted}
                />
              </div>
            </div>

            {gmm > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-green-900">
                    {ar ? "الثقل النوعي النظري الأقصى (Gmm):" : "Theoretical Maximum SG (Gmm):"}
                  </span>
                  <span className="text-lg font-bold text-green-700">{gmm.toFixed(3)}</span>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  {ar ? "محسوب تلقائياً" : "Auto-calculated"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Table 1 — Gmb */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {ar ? "الثقل النوعي الظاهري (Gmb)" : "Bulk Specific Gravity (Gmb)"}
              </CardTitle>
              {!submitted && (
                <Button size="sm" variant="outline" onClick={() => setSpecimens((p) => [...p, newSpecimen(p.length)])}>
                  <Plus size={14} className="mr-1" />
                  {ar ? "إضافة عينة" : "Add Specimen"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "رقم العينة" : "Specimen #"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "الكتلة في الهواء (جم)" : "Mass in Air (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "الكتلة في الماء (جم)" : "Mass in Water (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "كتلة SSD (جم)" : "SSD Mass (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                      {ar ? "الحجم (سم³)" : "Volume (cm³)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50">Gmb</th>
                    {!submitted && <th className="border border-slate-300 px-2 py-2 w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {specimens.map((spec, idx) => {
                    const computed = computedSpecimens[idx];
                    return (
                      <tr key={spec.id}>
                        <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={spec.massAir}
                            onChange={(e) => updateSpecimen(idx, "massAir", e.target.value)}
                            className="h-7 text-xs"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={spec.massWater}
                            onChange={(e) => updateSpecimen(idx, "massWater", e.target.value)}
                            className="h-7 text-xs"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={spec.ssdMass}
                            onChange={(e) => updateSpecimen(idx, "ssdMass", e.target.value)}
                            className="h-7 text-xs"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {computed.volume > 0 ? computed.volume.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {computed.gmb > 0 ? computed.gmb.toFixed(3) : "—"}
                        </td>
                        {!submitted && (
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600"
                              onClick={() => setSpecimens((p) => p.filter((_, i) => i !== idx))}
                              disabled={specimens.length <= 1}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {validSpecimens.length > 0 && (
                  <tfoot className="bg-green-50 font-semibold">
                    <tr>
                      <td colSpan={submitted ? 5 : 5} className="border border-slate-300 px-2 py-2 text-right">
                        {ar ? "متوسط الثقل النوعي الظاهري (Gmb):" : "Average Bulk Specific Gravity (Gmb):"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center text-base">
                        {avgGmb.toFixed(3)}
                      </td>
                      {!submitted && <td className="border border-slate-300" />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Table 2 — Volumetric Analysis */}
        {gmm > 0 && validSpecimens.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                {ar ? "التحليل الحجمي" : "Volumetric Analysis"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border border-slate-300 px-2 py-2">
                        {ar ? "رقم العينة" : "Specimen #"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2">Gsb</th>
                      <th className="border border-slate-300 px-2 py-2">
                        {ar ? "الفراغات الهوائية %" : "% Air Voids"}
                      </th>
                      <th className="border border-slate-300 px-2 py-2">VMA</th>
                      <th className="border border-slate-300 px-2 py-2">VFB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volumetricData.map((data, idx) => {
                      if (computedSpecimens[idx].gmb <= 0) return null;
                      return (
                        <tr key={specimens[idx]?.id ?? idx}>
                          <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-slate-50">
                            {data.gsb || "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {data.airVoids.toFixed(1)}%
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {data.vma.toFixed(1)}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {data.vfb}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-green-50 font-semibold">
                    <tr>
                      <td colSpan={2} className="border border-slate-300 px-2 py-2 text-right">
                        {ar ? "المتوسط:" : "Average:"}
                      </td>
                      <td
                        className={`border border-slate-300 px-2 py-2 text-center ${
                          airVoidsPass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {avgAirVoids.toFixed(1)}%
                      </td>
                      <td
                        className={`border border-slate-300 px-2 py-2 text-center ${
                          vmaPass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {avgVMA.toFixed(1)}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {avgVFB.toFixed(0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  className={`p-2 rounded border ${
                    airVoidsPass
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="text-xs font-semibold">
                    {ar ? "حد الفراغات الهوائية:" : "Air Voids Spec:"}
                  </div>
                  <div className="text-sm">3 - 5% {airVoidsPass ? "✓" : "✗"}</div>
                </div>
                <div
                  className={`p-2 rounded border ${
                    vmaPass ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="text-xs font-semibold">{ar ? "حد VMA الأدنى:" : "VMA Minimum:"}</div>
                  <div className="text-sm">≥ 13 {vmaPass ? "✓" : "✗"}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 4: Overall Result */}
        {validSpecimens.length > 0 && gmm > 0 && (
          <div
            className={`mb-4 p-4 rounded-lg border-2 text-center ${
              overallPass
                ? "bg-green-50 border-green-500 text-green-900"
                : "bg-red-50 border-red-500 text-red-900"
            }`}
          >
            <div className="text-2xl font-bold">
              {overallPass ? (ar ? "مقبول ✓" : "PASS ✓") : ar ? "مرفوض ✗" : "FAIL ✗"}
            </div>
            {!overallPass && (
              <div className="text-sm mt-2 space-y-1">
                {!airVoidsPass && (
                  <p>{ar ? "الفراغات الهوائية خارج الحد (3–5%)" : "Air Voids out of spec (3–5%)"}</p>
                )}
                {!vmaPass && <p>{ar ? "VMA أقل من الحد الأدنى (13)" : "VMA below minimum (13)"}</p>}
              </div>
            )}
          </div>
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
