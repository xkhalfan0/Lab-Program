import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, UserCheck, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";
import {
  LA_GRADING_GROUPS,
  LA_STANDARD,
  LA_REQUIRED_MASS_G,
  computeLAResults,
  parseAcceptanceLimit,
  type LAGradingGroup,
  type LAASampleInput,
} from "@/lib/aggLAAbrasion";

const CELL_IN = "bg-yellow-50";
const CELL_CALC = "bg-emerald-50";

function newSample(index: number): LAASampleInput {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNumber: `S${index + 1}`,
    gradingGroup: "B",
    m1BeforeTest: "",
    m2RetainedOn1_7mm: "",
  };
}

export default function AggLAAbrasion() {
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
  const [acceptanceLimit, setAcceptanceLimit] = useState("30");
  const [notes, setNotes] = useState("");
  const [samples, setSamples] = useState<LAASampleInput[]>([newSample(0), newSample(1), newSample(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const limit = parseAcceptanceLimit(acceptanceLimit);
  const { computedSamples, validSamples, avgLA, avgResult, overallResult } = computeLAResults(
    samples,
    acceptanceLimit,
  );

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
          gradingGroup: (["A", "B", "C", "D"].includes(String(s.gradingGroup))
            ? String(s.gradingGroup)
            : "B") as LAGradingGroup,
          m1BeforeTest: String(s.m1BeforeTest ?? s.m1 ?? ""),
          m2RetainedOn1_7mm: String(s.m2RetainedOn1_7mm ?? s.m2 ?? ""),
        })),
      );
    }
    setHydrated(true);
  }, [existing, hydrated]);

  const saveResult = trpc.specializedTests.save.useMutation({
    onError: e => toast.error(e.message),
  });

  const updateSample = (index: number, field: keyof LAASampleInput, value: string) => {
    setSamples(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const deleteSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
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

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist.testType ?? "AGG_LA",
        formTemplate: "agg_la_abrasion",
        formData: {
          aggregateSource,
          description,
          acceptanceLimit: limit,
          samples: computedSamples,
          avgLA: avgLA > 0 ? avgLA : undefined,
          overallResult,
        },
        overallResult,
        summaryValues: {
          avgLA: avgLA > 0 ? avgLA : undefined,
          acceptanceLimit: limit,
          overallResult,
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
              <span>{ar ? "اختبارات الركام / التآكل" : "Aggregate Tests / Abrasion"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار التآكل بجهاز لوس أنجلوس (LA)" : "Los Angeles Abrasion Test"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {LA_STANDARD} | {ar ? "التوزيع:" : "Distribution:"}{" "}
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
          <AlertDescription className="text-blue-800 text-sm space-y-1">
            <div className="font-semibold">
              {ar ? "المعادلة (ASTM C131):" : "Formula (ASTM C131):"}
            </div>
            <div>LA Value = [(M₁ - M₂) / M₁] × 100</div>
            <div className="text-xs text-blue-600">
              M₁ = {ar ? "الكتلة قبل الاختبار ≈ 5000g" : "Mass before test ≈ 5000g"} | M₂ ={" "}
              {ar
                ? "الكتلة المحتجزة على منخل 1.7mm بعد 500 دورة"
                : "Mass retained on 1.7mm sieve after 500 revolutions"}
            </div>
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
                  placeholder={ar ? "وصف العينة" : "e.g. Aggregate Road Base"}
                  className="h-9 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ar ? "حد القبول (%) *" : "Acceptance Limit (%) *"}</Label>
                <Input
                  type="number"
                  step="1"
                  disabled={submitted}
                  value={acceptanceLimit}
                  onChange={e => setAcceptanceLimit(e.target.value)}
                  placeholder="30"
                  className="h-9 bg-white"
                />
                <p className="text-[10px] text-muted-foreground">
                  {ar
                    ? "نموذجي: طبقة تآكل ≤30% | أساس ≤40% | أساس فرعي ≤50%"
                    : "Typical: Wearing ≤30% | Base ≤40% | Sub-base ≤50%"}
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-blue-600 font-semibold">
                    {ar ? "حد القبول:" : "Acceptance Limit:"}
                  </span>
                  <span className="ml-2 font-bold text-blue-800">≤ {acceptanceLimit || 30}%</span>
                </div>
                <div>
                  <span className="text-blue-600 font-semibold">
                    {ar ? "المنخل بعد الاختبار:" : "Sieve after test:"}
                  </span>
                  <span className="ml-2 font-bold text-blue-800">1.7 mm</span>
                </div>
                <div>
                  <span className="text-blue-600 font-semibold">
                    {ar ? "عدد الدورات:" : "Revolutions:"}
                  </span>
                  <span className="ml-2 font-bold text-blue-800">500</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
              <UserCheck size={14} className="text-green-600 shrink-0" />
              <span className="text-xs text-slate-500">{ar ? "الفاحص:" : "Tested By:"}</span>
              <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">
            {ar ? "مجموعات التدرج (ASTM C131-89)" : "Grading Groups (ASTM C131-89)"}
          </p>
          <p className="text-[10px] text-muted-foreground mb-3">
            {ar ? "الكتلة الأولية M₁ = 5000g ± 10g" : "Initial Sample Mass M₁ = 5000 g ± 10 g"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.entries(LA_GRADING_GROUPS) as [LAGradingGroup, (typeof LA_GRADING_GROUPS)[LAGradingGroup]][]).map(
              ([key, group]) => (
                <div key={key} className="border-2 border-border rounded-xl p-4 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-foreground">{group.label}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {group.balls} {ar ? "كرات" : "balls"}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-blue-600 mb-1">{group.sizeRange}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {ar ? group.descriptionAr : group.descriptionEn}
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {group.fractions.map((f, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          {f.qty ? `${f.qty}× ` : ""}
                          {f.size}:
                        </span>
                        <span className="font-medium shrink-0">{f.mass}g</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1 border-t border-border">
                      <span className="font-semibold">{ar ? "إجمالي M₁:" : "Total M₁:"}</span>
                      <span className="font-bold text-blue-600">{group.requiredMass}g</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {group.revolutions} {ar ? "دورة" : "rev."}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج الاختبار" : "Test Results"}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={submitted}
                onClick={() => setSamples(p => [...p, newSample(p.length)])}
              >
                {ar ? "+ إضافة عينة" : "+ Add Sample"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-3 py-2">{ar ? "رقم العينة" : "Sample No."}</th>
                    <th className="border border-slate-300 px-3 py-2">{ar ? "مجموعة التدرج" : "Grading Group"}</th>
                    <th className={`border border-slate-300 px-3 py-2 ${CELL_IN}`}>
                      <div>M₁</div>
                      <div className="text-[10px] font-normal">
                        {ar ? "وزن قبل الاختبار (g)" : "Before Test (g)"}
                      </div>
                      <div className="text-[10px] text-blue-600 font-normal">
                        {ar ? `يجب ≈ ${LA_REQUIRED_MASS_G}g` : `Should be ≈ ${LA_REQUIRED_MASS_G}g`}
                      </div>
                    </th>
                    <th className={`border border-slate-300 px-3 py-2 ${CELL_IN}`}>
                      <div>M₂</div>
                      <div className="text-[10px] font-normal">
                        {ar ? "محتجز على منخل 1.7mm (g)" : "Retained on 1.7mm (g)"}
                      </div>
                    </th>
                    <th className={`border border-slate-300 px-3 py-2 ${CELL_CALC}`}>
                      <div>{ar ? "قيمة LA (%)" : "LA Value (%)"}</div>
                      <div className="text-[10px] font-normal">(M₁ - M₂) / M₁ × 100</div>
                    </th>
                    <th className="border border-slate-300 px-3 py-2">
                      {ar ? `النتيجة (≤${acceptanceLimit || 30}%)` : `Result (≤${acceptanceLimit || 30}%)`}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">{ar ? "حذف" : "Delete"}</th>
                  </tr>
                </thead>
                <tbody>
                  {computedSamples.map((sample, idx) => {
                    const group = LA_GRADING_GROUPS[sample.gradingGroup];
                    return (
                      <tr key={sample.id} className="hover:bg-slate-50">
                        <td className="border border-slate-300 px-2 py-2 text-center font-bold">
                          <Input
                            value={sample.sampleNumber}
                            disabled={submitted}
                            onChange={e => updateSample(idx, "sampleNumber", e.target.value)}
                            className="h-8 text-xs w-14 mx-auto text-center"
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Select
                            value={sample.gradingGroup}
                            disabled={submitted}
                            onValueChange={val => updateSample(idx, "gradingGroup", val)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.entries(LA_GRADING_GROUPS) as [LAGradingGroup, typeof group][]).map(
                                ([k, g]) => (
                                  <SelectItem key={k} value={k}>
                                    {g.label} ({g.sizeRange})
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          {group && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {group.balls} {ar ? "كرات" : "balls"}, M₁ = {group.requiredMass}g
                            </p>
                          )}
                        </td>
                        <td className={`border border-slate-300 px-2 py-2 ${CELL_IN}`}>
                          <Input
                            type="number"
                            step="1"
                            disabled={submitted}
                            value={sample.m1BeforeTest}
                            onChange={e => updateSample(idx, "m1BeforeTest", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} h-8 text-xs text-center bg-white`}
                            placeholder="5000"
                          />
                          {sample.m1Warning && (
                            <p className="text-[10px] text-amber-600 mt-1">
                              ⚠️ {ar ? `يجب أن يكون ≈ ${LA_REQUIRED_MASS_G}g` : `Should be ≈ ${LA_REQUIRED_MASS_G}g`}
                            </p>
                          )}
                        </td>
                        <td className={`border border-slate-300 px-2 py-2 ${CELL_IN}`}>
                          <Input
                            type="number"
                            step="1"
                            disabled={submitted}
                            value={sample.m2RetainedOn1_7mm}
                            onChange={e => updateSample(idx, "m2RetainedOn1_7mm", e.target.value)}
                            className={`${LAB_NUMERIC_INPUT_SM} h-8 text-xs text-center bg-white`}
                            placeholder="e.g. 4350"
                          />
                        </td>
                        <td className={`border border-slate-300 px-3 py-2 text-center font-bold text-sm ${CELL_CALC}`}>
                          {sample.laValue > 0 ? `${sample.laValue.toFixed(1)}%` : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {sample.result ? (
                            <Badge
                              className={`font-bold ${sample.result === "pass" ? "bg-green-500" : "bg-red-500"}`}
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
                    );
                  })}
                </tbody>
                {validSamples.length > 0 && (
                  <tfoot className="bg-slate-100">
                    <tr>
                      <td colSpan={4} className="border border-slate-300 px-3 py-2 text-end font-bold text-sm">
                        {ar ? "متوسط قيمة LA:" : "Average LA Value:"}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center bg-blue-100 font-bold text-base">
                        {avgLA > 0 ? `${avgLA.toFixed(1)}%` : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {avgResult ? (
                          <Badge className={`font-bold ${avgResult === "pass" ? "bg-green-500" : "bg-red-500"}`}>
                            {avgResult === "pass"
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div
              className={`p-6 rounded-lg border-2 text-center ${
                avgResult === "pass"
                  ? "bg-green-50 border-green-500"
                  : avgResult === "fail"
                    ? "bg-red-50 border-red-500"
                    : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="text-2xl font-bold mb-3">
                {avgResult === "pass"
                  ? ar
                    ? "✓ مطابق — يستوفي متطلبات المواصفة"
                    : "✓ PASS — Meets specification"
                  : avgResult === "fail"
                    ? ar
                      ? "✗ غير مطابق — لا يستوفي المواصفة"
                      : "✗ FAIL — Does not meet specification"
                    : ar
                      ? "أدخل البيانات للحصول على النتيجة"
                      : "Enter data to see result"}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "متوسط قيمة LA" : "Average LA Value"}
                  </div>
                  <div className="text-xl font-bold text-blue-600">
                    {avgLA > 0 ? `${avgLA.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "حد القبول" : "Acceptance Limit"}
                  </div>
                  <div className="text-xl font-bold">≤ {acceptanceLimit || 30}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "عدد العينات" : "Samples Tested"}
                  </div>
                  <div className="text-xl font-bold">{validSamples.length}</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                {ar ? `المرجع: ${LA_STANDARD}` : `Reference: ${LA_STANDARD}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
