/**
 * Hot Bin Gradation — Combined aggregate gradation vs JMF and specification limits
 * BS EN 13108-1 / ASTM D3515
 */
import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import {
  HOT_BIN_SIEVE_SIZES,
  emptyHotBinGradations,
  getHotBinSpecLimits,
  type HotBinMixCourse,
} from "@/lib/hotBinGradationLimits";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer, Plus, X, ArrowLeftRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { GradationCurveChart } from "@/components/GradationCurveChart";
import { hotBinGradationLegendItems } from "@/components/GradationChartLegend";
import { LAB_NUMERIC_INPUT_LG, LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

interface TestParams {
  mixType: HotBinMixCourse | "";
  totalSampleMass: string;
}

interface AggregateSample {
  id: string;
  percentage: string;
  label: string;
  originalGradations: Record<string, string>;
}

interface AggregateSampleComputed extends AggregateSample {
  requiredGradations: Record<string, number>;
}

interface JMFLimits {
  lower: Record<string, string>;
  upper: Record<string, string>;
}

function createSample(id: string): AggregateSample {
  return {
    id,
    percentage: "",
    label: `Sample ${id}`,
    originalGradations: emptyHotBinGradations(),
  };
}

function computeSamples(samples: AggregateSample[]): AggregateSampleComputed[] {
  return samples.map((sample) => {
    const percentage = parseFloat(sample.percentage) || 0;
    const requiredGradations: Record<string, number> = {};
    HOT_BIN_SIEVE_SIZES.forEach((sieve) => {
      const origGrad = parseFloat(sample.originalGradations[sieve.size]) || 0;
      requiredGradations[sieve.size] = parseFloat(((percentage / 100) * origGrad).toFixed(1));
    });
    return { ...sample, requiredGradations };
  });
}

export default function AsphaltHotBin() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0", 10);

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [params, setParams] = useState<TestParams>({
    mixType: "",
    totalSampleMass: "",
  });
  const [aggregateSamples, setAggregateSamples] = useState<AggregateSample[]>([createSample("1")]);
  const [jmfLimits, setJmfLimits] = useState<JMFLimits>({ lower: {}, upper: {} });
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const computedSamples = useMemo(() => computeSamples(aggregateSamples), [aggregateSamples]);

  const combinedGrading = useMemo(() => {
    const combined: Record<string, number> = {};
    HOT_BIN_SIEVE_SIZES.forEach((sieve) => {
      combined[sieve.size] = parseFloat(
        computedSamples
          .reduce((sum, sample) => sum + (sample.requiredGradations[sieve.size] || 0), 0)
          .toFixed(1),
      );
    });
    return combined;
  }, [computedSamples]);

  const specLimits = useMemo(() => getHotBinSpecLimits(params.mixType), [params.mixType]);

  const sieveResults = useMemo(() => {
    if (!specLimits) return [];
    return HOT_BIN_SIEVE_SIZES.map((sieve) => {
      const combined = combinedGrading[sieve.size] || 0;
      const jmfLower = parseFloat(jmfLimits.lower[sieve.size] ?? "") || 0;
      const jmfUpper = parseFloat(jmfLimits.upper[sieve.size] ?? "") || 0;
      const specLower = specLimits[sieve.size]?.lower ?? 0;
      const specUpper = specLimits[sieve.size]?.upper ?? 0;
      const jmfFilled =
        (jmfLimits.lower[sieve.size] ?? "") !== "" || (jmfLimits.upper[sieve.size] ?? "") !== "";
      const passJMF = !jmfFilled || (combined >= jmfLower && combined <= jmfUpper);
      const passSpec = combined >= specLower && combined <= specUpper;
      return {
        size: sieve.size,
        combined,
        pass: passJMF && passSpec,
        pending: false,
      };
    });
  }, [combinedGrading, jmfLimits, specLimits]);

  const hasGradationInput = computedSamples.some((s) => parseFloat(s.percentage) > 0);
  const evaluatedSieves = params.mixType && hasGradationInput ? sieveResults : [];
  const failedSieves = evaluatedSieves.filter((s) => !s.pass).length;
  const overallPass = evaluatedSieves.length > 0 && failedSieves === 0;

  const chartData = useMemo(
    () =>
      [...HOT_BIN_SIEVE_SIZES].reverse().map((sieve) => {
        const jmfLower = parseFloat(jmfLimits.lower[sieve.size] ?? "") || 0;
        const jmfUpper = parseFloat(jmfLimits.upper[sieve.size] ?? "") || 0;
        const specLower = specLimits?.[sieve.size]?.lower ?? 0;
        const specUpper = specLimits?.[sieve.size]?.upper ?? 0;
        return {
          sieve: sieve.label,
          combined: combinedGrading[sieve.size] || 0,
          jmfLower,
          jmfUpper,
          specLower,
          specUpper,
        };
      }),
    [combinedGrading, jmfLimits, specLimits],
  );

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.notes) setNotes(String(fd.notes));

    const mix = fd.mixType as string | undefined;
    if (mix === "base_course" || mix === "wearing_course") {
      setParams((p) => ({ ...p, mixType: mix }));
    } else if (mix === "ACWC") {
      setParams((p) => ({ ...p, mixType: "wearing_course" }));
    } else if (mix === "ACBC") {
      setParams((p) => ({ ...p, mixType: "base_course" }));
    }

    const mass = fd.totalSampleMass ?? fd.sampleMass;
    if (mass != null && mass !== "") setParams((p) => ({ ...p, totalSampleMass: String(mass) }));

    const savedJmf = fd.jmfLimits as JMFLimits | undefined;
    if (savedJmf?.lower || savedJmf?.upper) {
      setJmfLimits({
        lower: (savedJmf.lower ?? {}) as Record<string, string>,
        upper: (savedJmf.upper ?? {}) as Record<string, string>,
      });
    }

    const savedSamples = fd.aggregateSamples as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(savedSamples) && savedSamples.length > 0) {
      setAggregateSamples(
        savedSamples.map((s, i) => ({
          id: String(s.id ?? i + 1),
          percentage: String(s.percentage ?? ""),
          label: String(s.label ?? `Sample ${i + 1}`),
          originalGradations: (s.originalGradations as Record<string, string>) ?? emptyHotBinGradations(),
        })),
      );
      return;
    }

    const legacyRows = fd.rows as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(legacyRows) && legacyRows.length > 0) {
      setAggregateSamples([
        {
          id: "1",
          percentage: "100",
          label: "100%",
          originalGradations: Object.fromEntries(
            legacyRows.map((r) => [String(r.sieve ?? ""), String(r.percentPassing ?? r.percentPassing ?? "")]),
          ),
        },
      ]);
    }

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  useEffect(() => {
    if (!dist?.testSubType || params.mixType) return;
    if (dist.testSubType === "wearing_course" || dist.testSubType === "base_course") {
      setParams((p) => ({ ...p, mixType: dist.testSubType as HotBinMixCourse }));
    }
  }, [dist?.testSubType, params.mixType]);

  const addSample = useCallback(() => {
    const newId = String(aggregateSamples.length + 1);
    setAggregateSamples((prev) => [...prev, createSample(newId)]);
  }, [aggregateSamples.length]);

  const removeSample = useCallback((id: string) => {
    setAggregateSamples((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSamplePercentage = useCallback((index: number, value: string) => {
    setAggregateSamples((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        percentage: value,
        label: value ? `${value}%` : `Sample ${index + 1}`,
      };
      return updated;
    });
  }, []);

  const updateOrigGrad = useCallback((sampleIdx: number, sieveSize: string, value: string) => {
    setAggregateSamples((prev) => {
      const updated = [...prev];
      updated[sampleIdx] = {
        ...updated[sampleIdx],
        originalGradations: { ...updated[sampleIdx].originalGradations, [sieveSize]: value },
      };
      return updated;
    });
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (!params.mixType) {
      toast.error(ar ? "الرجاء اختيار نوع الخلطة" : "Please select mix type");
      return;
    }
    if (!params.totalSampleMass || parseFloat(params.totalSampleMass) <= 0) {
      toast.error(ar ? "الرجاء إدخال إجمالي كتلة العينة" : "Please enter total sample mass");
      return;
    }
    if (status === "submitted" && !hasGradationInput) {
      toast.error(ar ? "الرجاء إدخال نسبة وتدرج لعينة ركام واحدة على الأقل" : "Enter % and gradation for at least one aggregate");
      return;
    }

    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_HOTBIN",
        formTemplate: "asphalt_hotbin",
        formData: {
          mixType: params.mixType,
          totalSampleMass: parseFloat(params.totalSampleMass),
          aggregateSamples: computedSamples.map((s) => ({
            id: s.id,
            percentage: parseFloat(s.percentage) || 0,
            label: s.label,
            originalGradations: s.originalGradations,
            requiredGradations: s.requiredGradations,
          })),
          combinedGrading,
          jmfLimits,
          specLimitsKey: params.mixType,
          failedSieves,
          overallPass,
        },
        overallResult: evaluatedSieves.length === 0 ? "pending" : overallPass ? "pass" : "fail",
        summaryValues: {
          overallResult: overallPass ? "pass" : "fail",
          failedCount: failedSieves,
          mixType: params.mixType,
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

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / تدرج الصندوق الساخن" : "Asphalt / Hot Bin Gradation"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار تدرج الصندوق الساخن" : "Hot Bin Gradation Test"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">BS EN 13108-1 / ASTM D3515</p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "رجوع" : "Back"}
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
                  {saving ? (ar ? "جاري..." : "Saving...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <Info className="inline w-4 h-4 mr-1 align-text-bottom" />
          {ar
            ? "مطلوب = (نسبة الركام ÷ 100) × التدرج الأصلي. الدرجة المجمعة = مجموع الأعمدة المطلوبة. المطابقة عندما تكون ضمن حدود JMF وحدود المواصفات."
            : "Required = (% aggregate ÷ 100) × original gradation. Combined = sum of required columns. Pass when within JMF and specification limits."}
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "معاملات الاختبار" : "Test Parameters"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">{ar ? "نوع الخلطة *" : "Mix Type *"}</Label>
                <Select
                  value={params.mixType || undefined}
                  onValueChange={(value) =>
                    setParams({ ...params, mixType: value as HotBinMixCourse })
                  }
                  disabled={submitted}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={ar ? "اختر النوع..." : "Select type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_course">
                      {ar ? "طبقة الأساس (Base Course)" : "Base Course"}
                    </SelectItem>
                    <SelectItem value="wearing_course">
                      {ar ? "طبقة التآكل (Wearing Course)" : "Wearing Course"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  {ar ? "إجمالي كتلة العينة (جم) *" : "Total Sample Mass (g) *"}
                </Label>
                <Input
                  type="number"
                  step="1"
                  value={params.totalSampleMass}
                  onChange={(e) => setParams({ ...params, totalSampleMass: e.target.value })}
                  className="h-9"
                  placeholder="1000"
                  disabled={submitted}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "بيانات تحليل المنخل" : "Sieve Analysis Data"}
            </CardTitle>
            {!submitted && (
              <Button size="sm" variant="outline" onClick={addSample}>
                <Plus className="w-4 h-4 mr-1" />
                {ar ? "إضافة عينة ركام" : "Add Aggregate Sample"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="overflow-x-auto shadow-inner rounded-lg border border-slate-200">
                <table className="w-full text-xs border-collapse min-w-[1400px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th
                        className="border border-slate-300 px-3 py-2 font-semibold sticky left-0 bg-slate-100 z-10"
                        rowSpan={2}
                        style={{ minWidth: "70px" }}
                      >
                        {ar ? "المنخل (mm)" : "Sieve (mm)"}
                      </th>
                      {computedSamples.map((sample) => {
                        const sampleIdx = aggregateSamples.findIndex((s) => s.id === sample.id);
                        return (
                          <th
                            key={sample.id}
                            className="border border-slate-300 px-2 py-2 bg-yellow-50"
                            colSpan={2}
                            style={{ minWidth: "140px" }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Input
                                type="number"
                                step="0.1"
                                value={aggregateSamples[sampleIdx]?.percentage ?? ""}
                                onChange={(e) =>
                                  updateSamplePercentage(sampleIdx, e.target.value)
                                }
                                className={`${LAB_NUMERIC_INPUT_SM} w-16 font-bold`}
                                placeholder="%"
                                disabled={submitted}
                              />
                              {aggregateSamples.length > 1 && !submitted && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeSample(sample.id)}
                                  className="h-6 w-6 p-0 hover:bg-red-100"
                                >
                                  <X className="w-3 h-3 text-red-600" />
                                </Button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th
                        className="border border-slate-300 px-3 py-2 bg-green-100 font-bold text-green-900"
                        rowSpan={2}
                        style={{ minWidth: "90px" }}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs">{ar ? "الدرجة" : "Combined"}</span>
                          <span className="text-xs">{ar ? "المجمعة" : "Grading"}</span>
                        </div>
                      </th>
                      <th
                        className="border border-slate-300 px-2 py-2 bg-blue-100"
                        colSpan={2}
                        style={{ minWidth: "120px" }}
                      >
                        {ar ? "حدود JMF" : "JMF Limit"}
                      </th>
                      <th
                        className="border border-slate-300 px-2 py-2 bg-purple-100"
                        colSpan={2}
                        style={{ minWidth: "120px" }}
                      >
                        {ar ? "حد المواصفات" : "Specification Limit"}
                      </th>
                      <th
                        className="border border-slate-300 px-2 py-2"
                        rowSpan={2}
                        style={{ minWidth: "80px" }}
                      >
                        {ar ? "الحالة" : "Status"}
                      </th>
                    </tr>
                    <tr>
                      {computedSamples.map((sample) => (
                        <Fragment key={`sub-${sample.id}`}>
                          <th className="border border-slate-300 px-2 py-1 text-xs bg-yellow-50 font-medium">
                            {ar ? "التدرج الأصلي" : "Orig. Grad."}
                          </th>
                          <th className="border border-slate-300 px-2 py-1 text-xs bg-yellow-100 font-medium">
                            {ar ? "مطلوب" : "Required"}
                          </th>
                        </Fragment>
                      ))}
                      <th className="border border-slate-300 px-2 py-1 text-xs bg-blue-100 font-medium">
                        {ar ? "أدنى" : "Lower"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1 text-xs bg-blue-100 font-medium">
                        {ar ? "أعلى" : "Upper"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1 text-xs bg-purple-100 font-medium">
                        {ar ? "أدنى" : "Lower"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1 text-xs bg-purple-100 font-medium">
                        {ar ? "أعلى" : "Upper"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {HOT_BIN_SIEVE_SIZES.map((sieve) => {
                      const combined = combinedGrading[sieve.size] || 0;
                      const specLower = specLimits?.[sieve.size]?.lower ?? 0;
                      const specUpper = specLimits?.[sieve.size]?.upper ?? 0;
                      const result = sieveResults.find((r) => r.size === sieve.size);
                      const pass = result?.pass;
                      const showStatus = params.mixType && hasGradationInput;

                      return (
                        <tr key={sieve.size} className="hover:bg-slate-50">
                          <td
                            className="border border-slate-300 px-3 py-2 font-bold text-center sticky left-0 bg-white z-10"
                            style={{ minWidth: "70px" }}
                          >
                            {sieve.label}
                          </td>
                          {computedSamples.map((sample, idx) => (
                            <Fragment key={`data-${sample.id}-${sieve.size}`}>
                              <td className="border border-slate-300 px-1 py-1">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={
                                    aggregateSamples[idx]?.originalGradations[sieve.size] ?? ""
                                  }
                                  onChange={(e) => updateOrigGrad(idx, sieve.size, e.target.value)}
                                  className={`${LAB_NUMERIC_INPUT_SM} min-w-[52px]`}
                                  placeholder="0"
                                  disabled={submitted}
                                />
                              </td>
                              <td className="border border-slate-300 px-2 py-2 text-center bg-yellow-100 font-semibold text-xs">
                                {(sample.requiredGradations[sieve.size] ?? 0).toFixed(1)}
                              </td>
                            </Fragment>
                          ))}
                          <td className="border border-slate-300 px-3 py-2 text-center bg-green-100 font-bold text-sm text-green-900">
                            {hasGradationInput ? combined.toFixed(1) : "—"}
                          </td>
                          <td className="border border-slate-300 px-1 py-1">
                            <Input
                              type="number"
                              step="1"
                              value={jmfLimits.lower[sieve.size] ?? ""}
                              onChange={(e) =>
                                setJmfLimits((prev) => ({
                                  ...prev,
                                  lower: { ...prev.lower, [sieve.size]: e.target.value },
                                }))
                              }
                              className={`${LAB_NUMERIC_INPUT_SM} min-w-[44px]`}
                              placeholder="0"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-1 py-1">
                            <Input
                              type="number"
                              step="1"
                              value={jmfLimits.upper[sieve.size] ?? ""}
                              onChange={(e) =>
                                setJmfLimits((prev) => ({
                                  ...prev,
                                  upper: { ...prev.upper, [sieve.size]: e.target.value },
                                }))
                              }
                              className={`${LAB_NUMERIC_INPUT_SM} min-w-[44px]`}
                              placeholder="0"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-purple-50 text-xs font-medium">
                            {params.mixType ? specLower : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-purple-50 text-xs font-medium">
                            {params.mixType ? specUpper : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            {!showStatus ? (
                              "—"
                            ) : (
                              <Badge
                                variant={pass ? "default" : "destructive"}
                                className={`text-xs font-bold ${pass ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}
                              >
                                {pass ? (ar ? "مطابق" : "Pass") : ar ? "غير مطابق" : "Fail"}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex md:hidden items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
                <ArrowLeftRight className="w-3 h-3" />
                <span>{ar ? "مرر لليمين لرؤية المزيد" : "Scroll to see more"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {params.mixType && hasGradationInput && chartData.length > 0 && (
          <GradationCurveChart
            title={ar ? "منحنى التدرج" : "Gradation Curve"}
            data={chartData}
            legendItems={hotBinGradationLegendItems(ar)}
            xDataKey="sieve"
            ar={ar}
            tooltipLabels={{
              combined: ar ? "الدرجة المجمعة" : "Combined",
              jmfUpper: ar ? "JMF أعلى" : "JMF Upper",
              jmfLower: ar ? "JMF أدنى" : "JMF Lower",
              specUpper: ar ? "مواصفات أعلى" : "Spec Upper",
              specLower: ar ? "مواصفات أدنى" : "Spec Lower",
            }}
            lines={[
              { dataKey: "combined", variant: "primary" },
              { dataKey: "jmfUpper", variant: "jmf" },
              { dataKey: "jmfLower", variant: "jmf" },
              { dataKey: "specUpper", variant: "spec" },
              { dataKey: "specLower", variant: "spec" },
            ]}
            footer={
              ar
                ? "الخط الأخضر يمثل التدرج الفعلي، ويجب أن يقع بين الحدود الزرقاء (JMF) والحمراء (المواصفات)"
                : "Green line shows actual gradation; it must fall within blue (JMF) and red (Spec) limits."
            }
          />
        )}

        {evaluatedSieves.length > 0 && (
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
                  {overallPass
                    ? ar
                      ? "✓ مطابق"
                      : "✓ PASS"
                    : ar
                      ? "✗ غير مطابق"
                      : "✗ FAIL"}
                </div>
                {!overallPass && (
                  <div className="text-base mt-2">
                    {ar
                      ? `${failedSieves} منخل خارج الحدود`
                      : `${failedSieves} sieves out of limits`}
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
