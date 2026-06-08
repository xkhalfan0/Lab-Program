import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, UserCheck, Printer, Trash2, Plus, AlertTriangle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";
import {
  computeMechanicalResults,
  newMechanicalSample,
  type MechanicalSampleInput,
  type MechanicalTestConfig,
} from "@/lib/aggAcvAiv";

const CELL_IN = "bg-yellow-50";
const CELL_CALC = "bg-emerald-50";

interface AggAcvAivFormProps {
  config: MechanicalTestConfig;
  titleEn: string;
  titleAr: string;
}

export default function AggAcvAivForm({ config, titleEn, titleAr }: AggAcvAivFormProps) {
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

  const [aggregateSource, setAggregateSource] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceLimit, setAcceptanceLimit] = useState(config.defaultLimit);
  const [notes, setNotes] = useState("");
  const [samples, setSamples] = useState<MechanicalSampleInput[]>([
    newMechanicalSample(0),
    newMechanicalSample(1),
  ]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { computedSamples, validSamples, avgValue, overallResult, overallStatus, twoResultsDiffer } =
    computeMechanicalResults(
      samples,
      acceptanceLimit,
      config.defaultLimit,
      config.repeatabilityThreshold,
    );

  const valueLabel = config.variant;

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (typeof fd.aggregateSource === "string") setAggregateSource(fd.aggregateSource);
    if (typeof fd.description === "string") setDescription(fd.description);
    if (fd.acceptanceLimit != null) setAcceptanceLimit(String(fd.acceptanceLimit));
    else if (fd.limit != null) setAcceptanceLimit(String(fd.limit));
    if (typeof existing.notes === "string") setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);

    const rawSamples = fd.samples ?? fd.rows;
    if (Array.isArray(rawSamples)) {
      setSamples(
        (rawSamples as Array<Record<string, unknown>>).map((s, i) => ({
          id: String(s.id ?? `row_${i}`),
          sampleNumber: String(s.sampleNumber ?? s.sampleNo ?? `S${i + 1}`),
          cylinderNo: String(s.cylinderNo ?? ""),
          condition: s.condition === "Soaked" ? "Soaked" : "Dry",
          m1MassBeforeTest: String(s.m1MassBeforeTest ?? s.m1 ?? ""),
          m2MassPassingSieve: String(s.m2MassPassingSieve ?? s.m2 ?? ""),
        })),
      );
    }
    setHydrated(true);
  }, [existing, hydrated]);

  const saveResult = trpc.specializedTests.save.useMutation({
    onError: e => toast.error(e.message),
  });

  const updateSample = (index: number, field: keyof MechanicalSampleInput, value: string) => {
    setSamples(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addSample = () => {
    setSamples(prev => [...prev, newMechanicalSample(prev.length)]);
  };

  const deleteSample = (id: string) => {
    if (samples.length <= 1) return;
    setSamples(prev =>
      prev
        .filter(s => s.id !== id)
        .map((s, i) => ({ ...s, sampleNumber: `S${i + 1}` })),
    );
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validSamples.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one sample result");
      return;
    }

    const limit = parseFloat(acceptanceLimit) || parseFloat(config.defaultLimit);

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist.testType ?? config.testTypeCode,
        formTemplate: config.formTemplate,
        formData: {
          testVariant: config.variant,
          aggregateSource,
          description,
          acceptanceLimit: limit,
          samples: computedSamples,
          avgValue: avgValue > 0 ? avgValue : undefined,
          overallResult: overallStatus,
          twoResultsDiffer,
        },
        overallResult: overallStatus,
        summaryValues: {
          testType: config.variant,
          avgValue: avgValue > 0 ? avgValue : undefined,
          acceptanceLimit: limit,
          overallResult: overallStatus,
        },
        notes,
        status,
      });
      if (status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
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
      <div className="max-w-5xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard dist={dist} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الركام / الخصائص الميكانيكية" : "Aggregate Tests / Mechanical Properties"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? titleAr : titleEn}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {config.standard} | {ar ? "التوزيع:" : "Distribution:"}{" "}
              {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (ar ? "جاري..." : "Submitting...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            <span className="font-bold">
              {ar ? `المعادلة (${config.standard.split(":")[0].trim()}):` : `Formula (${config.standard.split(":")[0].trim()}):`}
            </span>{" "}
            {valueLabel} = (M₂ / M₁) × 100
            <span className="mx-2">|</span>
            M₁ = {ar ? "كتلة العينة الجافة (g)" : "Oven-dry mass before test (g)"}
            <span className="mx-2">|</span>
            M₂ = {ar ? config.m2LabelAr : config.m2LabelEn}
            <span className="mx-2">|</span>
            {ar ? config.formulaExtraAr : config.formulaExtraEn}
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "معلومات الاختبار" : "Test Information"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "مصدر الركام" : "Aggregate Source"}</Label>
                <Input
                  value={aggregateSource}
                  disabled={submitted}
                  onChange={e => setAggregateSource(e.target.value)}
                  placeholder={ar ? "المحجر / المصدر" : "Quarry / source name"}
                  className="h-9 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "الوصف" : "Description"}</Label>
                <Input
                  value={description}
                  disabled={submitted}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={ar ? "وصف الركام" : "e.g. Road Base Aggregate"}
                  className="h-9 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "حد القبول (%)" : "Acceptance Limit (%)"}</Label>
                <Input
                  type="number"
                  step="1"
                  disabled={submitted}
                  value={acceptanceLimit}
                  onChange={e => setAcceptanceLimit(e.target.value)}
                  className="h-9 bg-white font-bold text-center"
                />
                <p className="text-[10px] text-muted-foreground">
                  {ar ? config.limitHintAr : config.limitHintEn}
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg border grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {config.specRows.map(row => (
                <div key={row.labelEn} className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{ar ? row.labelAr : row.labelEn}</span>
                  <span className="font-bold text-slate-800">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
              <UserCheck size={14} className="text-green-600 shrink-0" />
              <span className="text-xs text-slate-500">{ar ? "الفاحص:" : "Tested By:"}</span>
              <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "نتائج الاختبار" : "Test Results"}
            </CardTitle>
            <Button size="sm" disabled={submitted} onClick={addSample}>
              <Plus className="w-4 h-4 mr-1" />
              {ar ? "إضافة عينة" : "Add Sample"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-3 py-3 font-semibold">
                      {ar ? "رقم العينة" : "Sample No."}
                    </th>
                    <th className="border border-slate-300 px-3 py-3 font-semibold">
                      {ar ? "رقم الأسطوانة" : "Cylinder No."}
                    </th>
                    <th className="border border-slate-300 px-3 py-3 font-semibold">
                      {ar ? "الحالة" : "Condition"}
                    </th>
                    <th className={`border border-slate-300 px-3 py-3 font-semibold ${CELL_IN}`}>
                      <div className="text-sm">M₁ (g)</div>
                      <div className="text-[10px] font-normal text-muted-foreground mt-1">
                        {ar ? "الكتلة الجافة قبل الاختبار" : "Oven-dry mass before test"}
                      </div>
                    </th>
                    <th className={`border border-slate-300 px-3 py-3 font-semibold ${CELL_IN}`}>
                      <div className="text-sm">M₂ (g)</div>
                      <div className="text-[10px] font-normal text-muted-foreground mt-1">
                        {ar ? config.m2LabelAr : config.m2LabelEn}
                      </div>
                    </th>
                    <th className={`border border-slate-300 px-3 py-3 font-semibold ${CELL_CALC}`}>
                      <div className="text-sm">{valueLabel} (%)</div>
                      <div className="text-[10px] font-normal text-muted-foreground mt-1">
                        M₂ / M₁ × 100
                      </div>
                    </th>
                    <th className="border border-slate-300 px-3 py-3 font-semibold">
                      {ar ? `النتيجة (≤${acceptanceLimit || config.defaultLimit}%)` : `Result (≤${acceptanceLimit || config.defaultLimit}%)`}
                    </th>
                    <th className="border border-slate-300 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {computedSamples.map((sample, idx) => (
                    <tr key={sample.id} className="hover:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-2 text-center font-bold">
                        <Input
                          value={sample.sampleNumber}
                          disabled={submitted}
                          onChange={e => updateSample(idx, "sampleNumber", e.target.value)}
                          className="h-8 text-xs w-14 mx-auto text-center"
                        />
                      </td>
                      <td className="border border-slate-300 px-1 py-1">
                        <Input
                          value={sample.cylinderNo}
                          disabled={submitted}
                          onChange={e => updateSample(idx, "cylinderNo", e.target.value)}
                          className="h-8 text-xs text-center bg-white"
                          placeholder="1"
                        />
                      </td>
                      <td className="border border-slate-300 px-1 py-1">
                        <Select
                          value={sample.condition}
                          disabled={submitted}
                          onValueChange={v => updateSample(idx, "condition", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Dry">{ar ? "جاف" : "Dry"}</SelectItem>
                            <SelectItem value="Soaked">{ar ? "منقوع" : "Soaked"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`border border-slate-300 px-1 py-1 ${CELL_IN}`}>
                        <Input
                          type="number"
                          step="0.1"
                          disabled={submitted}
                          value={sample.m1MassBeforeTest}
                          onChange={e => updateSample(idx, "m1MassBeforeTest", e.target.value)}
                          className={`${LAB_NUMERIC_INPUT_SM} h-8 text-xs text-center bg-white`}
                          placeholder="0.0"
                        />
                      </td>
                      <td className={`border border-slate-300 px-1 py-1 ${CELL_IN}`}>
                        <Input
                          type="number"
                          step="0.1"
                          disabled={submitted}
                          value={sample.m2MassPassingSieve}
                          onChange={e => updateSample(idx, "m2MassPassingSieve", e.target.value)}
                          className={`${LAB_NUMERIC_INPUT_SM} h-8 text-xs text-center bg-white`}
                          placeholder="0.0"
                        />
                      </td>
                      <td className={`border border-slate-300 px-3 py-2 text-center font-bold text-base ${CELL_CALC}`}>
                        {sample.testValue > 0 ? `${sample.testValue.toFixed(1)}%` : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {sample.result ? (
                          <Badge
                            className={`font-bold ${sample.result === "pass" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
                          >
                            {sample.result === "pass"
                              ? ar
                                ? "✓ مطابق"
                                : "✓ Pass"
                              : ar
                                ? "✗ غير مطابق"
                                : "✗ Fail"}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {samples.length > 1 && !submitted && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSample(sample.id)}
                            className="h-6 w-6 p-0"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validSamples.length > 0 && (
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td colSpan={5} className="border border-slate-300 px-3 py-2 text-end text-sm">
                        {ar ? `متوسط قيمة ${valueLabel}:` : `Average ${valueLabel} Value:`}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center bg-blue-100 font-bold text-lg text-blue-800">
                        {avgValue > 0 ? `${avgValue.toFixed(1)}%` : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {overallResult ? (
                          <Badge
                            className={`font-bold ${overallResult === "pass" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
                          >
                            {overallResult === "pass"
                              ? ar
                                ? "✓ مطابق"
                                : "✓ Pass"
                              : ar
                                ? "✗ غير مطابق"
                                : "✗ Fail"}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-slate-300" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {twoResultsDiffer && (
              <Alert className="mt-4 bg-amber-50 border-amber-300">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  {ar
                    ? "⚠️ الفرق بين النتيجتين أكبر من 3 وحدات — يجب إجراء اختبار ثالث (BS 812-112)"
                    : "⚠️ Results differ by more than 3 AIV units — a third test is required (BS 812-112)"}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div
              className={`p-6 rounded-xl border-2 text-center ${
                overallResult === "pass"
                  ? "bg-green-50 border-green-500 text-green-900"
                  : overallResult === "fail"
                    ? "bg-red-50 border-red-500 text-red-900"
                    : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
            >
              <div className="text-3xl font-bold mb-4">
                {overallResult === "pass"
                  ? ar
                    ? "✓ مطابق — يستوفي متطلبات المواصفة"
                    : "✓ PASS — Meets specification"
                  : overallResult === "fail"
                    ? ar
                      ? "✗ غير مطابق — لا يستوفي المواصفة"
                      : "✗ FAIL — Does not meet specification"
                    : ar
                      ? "أدخل البيانات لعرض النتيجة"
                      : "Enter data to see result"}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {ar ? `متوسط ${valueLabel}` : `Average ${valueLabel}`}
                  </span>
                  <span className="text-2xl font-bold">
                    {avgValue > 0 ? `${avgValue.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {ar ? "حد القبول" : "Acceptance Limit"}
                  </span>
                  <span className="text-2xl font-bold">≤ {acceptanceLimit || config.defaultLimit}%</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {ar ? "عدد العينات" : "Samples Tested"}
                  </span>
                  <span className="text-2xl font-bold">{validSamples.length}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-4">
                {ar ? `المرجع: ${config.referenceAr}` : `Reference: ${config.referenceEn}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "ملاحظات / مشاهدات" : "Notes / Observations"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              disabled={submitted}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[80px] resize-none bg-white"
              placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional observations..."}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
