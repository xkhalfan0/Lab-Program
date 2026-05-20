/**
 * Sieve Analysis of Extracted Aggregates
 * BS EN 12697-2 / ASTM D5444 — gradation vs JMF (CC) and mix-type specification limits
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import { extractBitumenContentFromExtractionResult } from "@/lib/asphaltBitumen";
import {
  EXTRACTED_SIEVE_SIZES,
  EXTRACTED_SIEVE_INPUT_SIZES,
  JMF_LIMITS,
  getExtractedSieveSpecLimits,
} from "@/lib/extractedSieveLimits";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer, AlertCircle, Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

interface SieveInputs {
  sieveSize: string;
  massRetained: string;
}

interface SieveComputed extends SieveInputs {
  percentRetained: number;
  percentPassing: number;
  ccLower: number;
  ccUpper: number;
  specLower: number;
  specUpper: number;
  result: "pass" | "fail" | "pending";
}

function createEmptySieves(): SieveInputs[] {
  return EXTRACTED_SIEVE_INPUT_SIZES.map((s) => ({
    sieveSize: s.size,
    massRetained: "",
  }));
}

function computeNormalSieves(
  sieves: SieveInputs[],
  massAfterIgnition: number,
  specLimits: Record<string, { lower: number; upper: number }>,
): SieveComputed[] {
  let cumulativePercentRetained = 0;

  return sieves.map((sieve) => {
    const massRet = parseFloat(sieve.massRetained) || 0;
    const percentRetained =
      massAfterIgnition > 0 ? parseFloat(((massRet / massAfterIgnition) * 100).toFixed(1)) : 0;
    cumulativePercentRetained += percentRetained;
    const percentPassing = parseFloat((100 - cumulativePercentRetained).toFixed(1));

    const jmf = JMF_LIMITS[sieve.sieveSize] ?? { lower: 0, upper: 100 };
    const spec = specLimits[sieve.sieveSize] ?? { lower: 0, upper: 100 };

    const hasData = massAfterIgnition > 0 && sieve.massRetained !== "";
    const result: SieveComputed["result"] = !hasData
      ? "pending"
      : percentPassing >= spec.lower && percentPassing <= spec.upper
        ? "pass"
        : "fail";

    return {
      ...sieve,
      percentRetained,
      percentPassing,
      ccLower: jmf.lower,
      ccUpper: jmf.upper,
      specLower: spec.lower,
      specUpper: spec.upper,
      result,
    };
  });
}

export default function AsphaltExtractedSieve() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0", 10);

  const { data: dist, isLoading: distLoading } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId },
  );
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );
  const { data: bitumenResults = [], isLoading: bitumenLoading } =
    trpc.specializedTests.getBySampleAndTestType.useQuery(
      {
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: "ASPH_BITUMEN_EXTRACT",
        status: "submitted",
      },
      { enabled: !!dist?.sampleId },
    );

  const bitumenData = bitumenResults[0];
  const bitumenCompleted = bitumenData?.status === "submitted";
  const bitumenForm = (bitumenData?.formData ?? {}) as Record<string, unknown>;
  const bitumenSample = (bitumenForm.sample ?? {}) as Record<string, unknown>;

  const massBeforeIgnition = parseFloat(String(bitumenSample.massBeforeIgnition ?? "")) || 0;
  const massAfterIgnition =
    parseFloat(String(bitumenSample.massAfterIgnition ?? "")) ||
    (parseFloat(String(bitumenSample.massBeforeIgnition ?? "")) || 0) -
      (parseFloat(String(bitumenSample.lossOfIgnition ?? "")) || 0);
  const pgBinder =
    extractBitumenContentFromExtractionResult(bitumenData) ??
    (parseFloat(String(bitumenSample.pgBinder ?? bitumenForm.avgBitumen ?? "")) || 0);

  const mixType = dist?.testSubType ?? "base_course";
  const isWearingCourse = mixType === "wearing_course";
  const specLimits = useMemo(() => getExtractedSieveSpecLimits(mixType), [mixType]);

  const [sieves, setSieves] = useState<SieveInputs[]>(createEmptySieves);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const computedNormal = useMemo(
    () => computeNormalSieves(sieves, massAfterIgnition, specLimits),
    [sieves, massAfterIgnition, specLimits],
  );

  const sumOfRetained = useMemo(
    () => sieves.reduce((sum, s) => sum + (parseFloat(s.massRetained) || 0), 0),
    [sieves],
  );

  const passing75um = massAfterIgnition > 0 ? massAfterIgnition - sumOfRetained : 0;
  const passing75umPercent =
    massAfterIgnition > 0
      ? parseFloat(((passing75um / massAfterIgnition) * 100).toFixed(1))
      : 0;
  const hasPassingCalc = massAfterIgnition > 0 && sieves.some((s) => s.massRetained !== "");

  const sieve200 = computedNormal.find((s) => s.sieveSize === "0.075");
  const percentPassing200 = sieve200?.percentPassing ?? 0;
  const rawFillerBitumenRatio = pgBinder > 0 ? percentPassing200 / pgBinder : 0;
  // Round to nearest 0.1 (e.g. 1.04→1.0, 1.05→1.1, 1.06→1.1)
  const fillerBitumenRatio = Math.round(rawFillerBitumenRatio * 10) / 10;

  const computedSievesForSave = useMemo(
    (): SieveComputed[] => [
      ...computedNormal,
      {
        sieveSize: "passing",
        massRetained: hasPassingCalc ? passing75um.toFixed(1) : "",
        percentRetained: passing75umPercent,
        percentPassing: 0,
        ccLower: 0,
        ccUpper: 0,
        specLower: 0,
        specUpper: 0,
        result: "pending",
      },
    ],
    [computedNormal, hasPassingCalc, passing75um, passing75umPercent],
  );

  const evaluatedSieves = computedNormal.filter((s) => s.result !== "pending");
  const failedSieves = evaluatedSieves.filter((s) => s.result === "fail").length;
  const overallPass = evaluatedSieves.length > 0 && failedSieves === 0;

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

    const saved = (fd.sieves ?? fd.rows) as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(saved) && saved.length > 0) {
      setSieves(
        EXTRACTED_SIEVE_INPUT_SIZES.map((info) => {
          const row = saved.find(
            (r) =>
              String(r.sieveSize ?? r.sieve) === info.size ||
              String(r.sieve) === info.size,
          );
          return {
            sieveSize: info.size,
            massRetained: String(row?.massRetained ?? ""),
          };
        }),
      );
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const updateMass = useCallback((index: number, value: string) => {
    setSieves((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], massRetained: value };
      return updated;
    });
  }, []);

  const chartData = useMemo(
    () =>
      [...EXTRACTED_SIEVE_INPUT_SIZES].reverse().map((sieveInfo) => {
        const sieve = computedNormal.find((s) => s.sieveSize === sieveInfo.size);
        const specs = specLimits[sieveInfo.size] ?? { lower: 0, upper: 100 };
        return {
          sieveSize: ar ? sieveInfo.labelAr : sieveInfo.label,
          percentPassing: Math.round(sieve?.percentPassing ?? 0),
          specLower: specs.lower,
          specUpper: specs.upper,
        };
      }),
    [computedNormal, specLimits, ar],
  );

  const showChart = massAfterIgnition > 0 && sieves.some((s) => s.massRetained !== "");

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && evaluatedSieves.length === 0) {
      toast.error(ar ? "الرجاء إدخال كتلة محجوزة لمنخل واحد على الأقل" : "Enter mass retained for at least one sieve");
      return;
    }
    if (status === "submitted" && massAfterIgnition <= 0) {
      toast.error(
        ar
          ? "يجب إكمال اختبار استخلاص البيتومين أولاً"
          : "Complete Bitumen Extraction test first",
      );
      return;
    }

    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_EXTRACTED_SIEVE",
        formTemplate: "asphalt_extracted_sieve",
        formData: {
          massBeforeIgnition,
          massAfterIgnition,
          pgBinder,
          mixType,
          sieves: computedSievesForSave,
          passing75um: {
            mass: passing75um,
            percent: passing75umPercent,
          },
          fillerBitumenRatio: parseFloat(fillerBitumenRatio.toFixed(1)),
          failedCount: failedSieves,
          overallPass,
        },
        overallResult: evaluatedSieves.length === 0 ? "pending" : overallPass ? "pass" : "fail",
        summaryValues: {
          failedSieves,
          fillerBitumenRatio: parseFloat(fillerBitumenRatio.toFixed(1)),
          overallResult: overallPass ? "pass" : "fail",
          massAfterIgnition,
          pgBinder,
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

  if (distLoading || (dist?.sampleId && bitumenLoading)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center p-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          {ar ? "جاري التحميل..." : "Loading..."}
        </div>
      </DashboardLayout>
    );
  }

  if (dist?.sampleId && !bitumenCompleted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">{ar ? "اختبار مقفل" : "Test Locked"}</h3>
          <p className="text-muted-foreground mb-4">
            {ar
              ? "يجب إكمال اختبار استخلاص البيتومين أولاً"
              : "Bitumen Extraction test must be completed first"}
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
          extraFields={[
            {
              label: ar ? "نوع الخلطة" : "Mix type",
              value: isWearingCourse
                ? ar
                  ? "طبقة التآكل"
                  : "Wearing Course"
                : ar
                  ? "طبقة الأساس"
                  : "Base Course",
            },
          ]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>
                {ar ? "اختبارات الأسفلت / منخل الركام المستخلص" : "Asphalt / Extracted Aggregate Sieve"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل منخل الركام المستخلص" : "Sieve Analysis of Extracted Aggregates"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">BS EN 12697-2 / ASTM D5444</p>
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
                  {saving ? (ar ? "جاري..." : "Saving...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Info className="w-4 h-4" />
              {ar ? "بيانات من اختبار استخلاص البيتومين" : "Data from Bitumen Extraction Test"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {massAfterIgnition <= 0 ? (
              <p className="text-sm text-amber-800">
                {ar
                  ? "لا توجد نتائج مُرسلة لاستخلاص البيتومين على هذه العينة. أكمل ذلك الاختبار أولاً."
                  : "No submitted Bitumen Extraction results for this sample. Complete that test first."}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {ar ? "الكتلة قبل الاشتعال (جم)" : "Mass Before Ignition (gm)"}
                  </Label>
                  <div className="font-semibold mt-1 text-blue-700">
                    {massBeforeIgnition.toFixed(1)} gm
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {ar ? "الكتلة بعد الاشتعال (جم)" : "Mass After Ignition (gm)"}
                  </Label>
                  <div className="font-semibold mt-1 text-blue-700">
                    {massAfterIgnition.toFixed(1)} gm
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {ar ? "محتوى الرابط PG (%)" : "%PG Binder (Pb)"}
                  </Label>
                  <div className="font-semibold mt-1 text-blue-700">{pgBinder.toFixed(2)}%</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-amber-900 text-sm">
            <Info className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{ar ? "المعادلات:" : "Formulas:"}</span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-amber-700">
            <div>
              <span className="font-semibold">% Retained:</span>{" "}
              {ar
                ? "(الكتلة المحجوزة / الكتلة بعد الاشتعال) × 100"
                : "(Mass Retained / Mass After Ignition) × 100"}
            </div>
            <div>
              <span className="font-semibold">% Passing:</span>{" "}
              {ar ? "100 − مجموع نسب المحجوز المتراكم" : "100 − cumulative % retained"}
            </div>
            <div>
              <span className="font-semibold">Passing 75 μm:</span>{" "}
              {ar
                ? "الكتلة بعد الاشتعال − مجموع الكتل المحجوزة"
                : "Mass After Ignition − Σ(all masses retained)"}
            </div>
            <div>
              <span className="font-semibold">Filler/Bitumen Ratio:</span>{" "}
              {ar ? "% مار #200 / محتوى الرابط PG (Pb)%" : "% Passing #200 / PG Binder (Pb)%"}
            </div>
            <p className="mt-2 text-xs italic">
              {ar
                ? "يتم مقارنة نسبة المار بحدود المواصفات حسب نوع الخليط"
                : "Compared to specification limits by mix course."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "جدول تحليل المنخل" : "Sieve Analysis Table"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                      {ar ? "حجم المنخل (mm)" : "Sieve Size (mm)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                      {ar ? "الكتلة المحجوزة (gm)" : "Mass Retained (gm)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                      {ar ? "نسبة المحجوز %" : "% Retained"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                      {ar ? "نسبة المار %" : "% Passing"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-amber-50" colSpan={2}>
                      {ar ? "حدود JMF" : "JMF Limit"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50" colSpan={2}>
                      {ar ? "حد المواصفات" : "Specification Limit"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                      {ar ? "النتيجة" : "Result"}
                    </th>
                  </tr>
                  <tr>
                    <th className="border border-slate-300 px-2 py-2 bg-amber-50 text-xs">
                      {ar ? "أدنى" : "Lower"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-amber-50 text-xs">
                      {ar ? "أعلى" : "Upper"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50 text-xs">
                      {ar ? "أدنى" : "Lower"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50 text-xs">
                      {ar ? "أعلى" : "Upper"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXTRACTED_SIEVE_SIZES.map((sieveInfo) => {
                    if (sieveInfo.size === "passing") {
                      return (
                        <tr key="passing">
                          <td className="border border-slate-300 px-2 py-2 font-semibold whitespace-nowrap">
                            {ar ? sieveInfo.labelAr : sieveInfo.label}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {hasPassingCalc ? passing75um.toFixed(1) : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {hasPassingCalc ? passing75umPercent.toFixed(1) : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-slate-100">—</td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-amber-50">—</td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-amber-50">—</td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50">—</td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50">—</td>
                          <td className="border border-slate-300 px-2 py-2 text-center">—</td>
                        </tr>
                      );
                    }

                    const inputIdx = EXTRACTED_SIEVE_INPUT_SIZES.findIndex(
                      (s) => s.size === sieveInfo.size,
                    );
                    const sieve = computedNormal[inputIdx];
                    const inputRow = sieves[inputIdx];

                    return (
                      <tr key={sieveInfo.size}>
                        <td className="border border-slate-300 px-2 py-2 font-semibold whitespace-nowrap">
                          {ar ? sieveInfo.labelAr : sieveInfo.label}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={inputRow?.massRetained ?? ""}
                            onChange={(e) => updateMass(inputIdx, e.target.value)}
                            className="h-7 text-xs min-w-[72px]"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {sieve.percentRetained > 0 || inputRow?.massRetained
                            ? sieve.percentRetained.toFixed(1)
                            : "—"}
                        </td>
                        <td
                          className={`border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold ${
                            sieve.result === "fail" ? "text-red-700" : ""
                          }`}
                        >
                          {sieve.result !== "pending" ? sieve.percentPassing.toFixed(0) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-amber-50">
                          {sieve.ccLower}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-amber-50">
                          {sieve.ccUpper}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50">
                          {sieve.specLower}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50">
                          {sieve.specUpper}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {sieve.result === "pending" ? (
                            "—"
                          ) : (
                            <Badge
                              variant={sieve.result === "pass" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {sieve.result === "pass"
                                ? ar
                                  ? "مطابق"
                                  : "Pass"
                                : ar
                                  ? "غير مطابق"
                                  : "Fail"}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-green-50">
                    <td className="border border-slate-300 px-2 py-2 font-semibold" colSpan={3}>
                      {ar
                        ? "نسبة الحشو/البيتومين (Filler/Bitumen Ratio)"
                        : "Filler/Bitumen Ratio"}
                    </td>
                    <td
                      className="border border-slate-300 px-2 py-2 text-center font-bold text-base"
                      colSpan={5}
                    >
                      {pgBinder > 0 && sieve200?.result !== "pending"
                        ? fillerBitumenRatio.toFixed(1)
                        : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center text-xs text-muted-foreground">
                      {pgBinder > 0 && sieve200?.result !== "pending"
                        ? `= ${percentPassing200.toFixed(1)}% ÷ ${pgBinder.toFixed(2)}%`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {showChart && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {ar ? "منحنى التدرج الحبيبي" : "Gradation Curve"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="sieveSize"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    label={{
                      value: ar ? "% المار" : "% Passing",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="percentPassing"
                    stroke="#f97316"
                    strokeWidth={2}
                    name={ar ? "% المار" : "% Passing"}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="specUpper"
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    name={ar ? "الحد الأعلى" : "Spec Upper"}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="specLower"
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    name={ar ? "الحد الأدنى" : "Spec Lower"}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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
                  {overallPass ? (ar ? "✓ مطابق" : "✓ PASS") : ar ? "✗ غير مطابق" : "✗ FAIL"}
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
