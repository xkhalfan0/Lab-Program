import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

// Bitumen Extraction — Ignition Furnace (ASTM D6307)

const EXTRACTION_METHODS = {
  IGNITION: {
    label: "Ignition Furnace (ASTM D6307)",
    standard: "ASTM D6307",
    code: "ASPH_BITUMEN_EXTRACT",
  },
  CENTRIFUGE: {
    label: "Centrifuge (BS EN 12697-1)",
    standard: "BS EN 12697-1",
    code: "ASPH_BITUMEN_EXTRACT",
  },
  ROTARY: {
    label: "Rotary Evaporator",
    standard: "BS EN 12697-1",
    code: "ASPH_BITUMEN_EXTRACT",
  },
} as const;

type MethodKey = keyof typeof EXTRACTION_METHODS;

interface SampleInputs {
  sampleNo: string;
  massBeforeIgnition: string;
  lossOfIgnition: string;
  tempComp: string;
  ignitionFactor: string;
}

interface SampleComputed extends SampleInputs {
  massAfterIgnition: number;
  percentLoss: number;
  pgBinder: number;
  result: "pass" | "fail" | "pending";
}

const EMPTY_INPUTS: SampleInputs = {
  sampleNo: "S1",
  massBeforeIgnition: "",
  lossOfIgnition: "",
  tempComp: "",
  ignitionFactor: "",
};

function computeSample(
  sample: SampleInputs,
  designBitumen: number,
  tolerance: number,
): SampleComputed {
  const before = parseFloat(sample.massBeforeIgnition) || 0;
  const loss = parseFloat(sample.lossOfIgnition) || 0;
  const tempComp = parseFloat(sample.tempComp) || 0;
  const ignFactor = parseFloat(sample.ignitionFactor) || 0;

  if (before <= 0 || loss <= 0) {
    return {
      sampleNo: sample.sampleNo,
      massBeforeIgnition: sample.massBeforeIgnition,
      lossOfIgnition: sample.lossOfIgnition,
      tempComp: sample.tempComp,
      ignitionFactor: sample.ignitionFactor,
      massAfterIgnition: 0,
      percentLoss: 0,
      pgBinder: 0,
      result: "pending",
    };
  }

  const massAfter = before - loss;
  const percentLoss = (loss / before) * 100;
  const pgBinder = percentLoss - tempComp - ignFactor;

  const minAcceptable = designBitumen - tolerance;
  const maxAcceptable = designBitumen + tolerance;
  const result: "pass" | "fail" =
    pgBinder >= minAcceptable && pgBinder <= maxAcceptable ? "pass" : "fail";

  return {
    sampleNo: sample.sampleNo,
    massBeforeIgnition: sample.massBeforeIgnition,
    lossOfIgnition: sample.lossOfIgnition,
    tempComp: sample.tempComp,
    ignitionFactor: sample.ignitionFactor,
    massAfterIgnition: parseFloat(massAfter.toFixed(1)),
    percentLoss: parseFloat(percentLoss.toFixed(2)),
    pgBinder: parseFloat(pgBinder.toFixed(2)),
    result,
  };
}

function mapLegacyToInputs(row: Record<string, unknown>): SampleInputs {
  if (row.massBeforeIgnition != null || row.lossOfIgnition != null) {
    return {
      sampleNo: String(row.sampleNo ?? "S1"),
      massBeforeIgnition: String(row.massBeforeIgnition ?? ""),
      lossOfIgnition: String(row.lossOfIgnition ?? ""),
      tempComp: String(row.tempComp ?? ""),
      ignitionFactor: String(row.ignitionFactor ?? ""),
    };
  }
  return {
    sampleNo: String(row.sampleNo ?? "S1"),
    massBeforeIgnition: String(row.wSample ?? ""),
    lossOfIgnition: "",
    tempComp: "0",
    ignitionFactor: "0",
  };
}

export default function AsphaltBitumenExtraction() {
  const { user } = useAuth();
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [method, setMethod] = useState<MethodKey>("IGNITION");
  const [ignitionTemperature, setIgnitionTemperature] = useState("538");
  const [designBitumenStr, setDesignBitumenStr] = useState("5.0");
  const [toleranceStr, setToleranceStr] = useState("0.3");
  const [notes, setNotes] = useState("");
  const [sample, setSample] = useState<SampleInputs>(EMPTY_INPUTS);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = EXTRACTION_METHODS[method];
  const designBitumen = parseFloat(designBitumenStr) || 5.0;
  const tolerance = parseFloat(toleranceStr) || 0.3;

  const computedSample = useMemo(
    () => computeSample(sample, designBitumen, tolerance),
    [sample, designBitumen, tolerance],
  );

  const hasResult = computedSample.pgBinder > 0 || (parseFloat(sample.massBeforeIgnition) > 0 && parseFloat(sample.lossOfIgnition) > 0);
  const overallResult: "pass" | "fail" | "pending" =
    computedSample.result === "pending" ? "pending" : computedSample.result;

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.method && fd.method in EXTRACTION_METHODS) {
      setMethod(fd.method as MethodKey);
    } else if (fd.extractionMethod === "ignition_furnace") {
      setMethod("IGNITION");
    }
    if (fd.designBitumen != null) setDesignBitumenStr(String(fd.designBitumen));
    if (fd.tolerance != null) setToleranceStr(String(fd.tolerance));
    if (fd.ignitionTemperature != null) setIgnitionTemperature(String(fd.ignitionTemperature));
    if (fd.notes) setNotes(String(fd.notes));

    const savedSample = fd.sample as Record<string, unknown> | undefined;
    if (savedSample) {
      setSample({
        sampleNo: String(savedSample.sampleNo ?? "S1"),
        massBeforeIgnition: String(savedSample.massBeforeIgnition ?? ""),
        lossOfIgnition: String(savedSample.lossOfIgnition ?? ""),
        tempComp: String(savedSample.tempComp ?? ""),
        ignitionFactor: String(savedSample.ignitionFactor ?? ""),
      });
    } else if (Array.isArray(fd.samples) && fd.samples.length > 0) {
      setSample(mapLegacyToInputs(fd.samples[0] as Record<string, unknown>));
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

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

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && computedSample.result === "pending") {
      toast.error(ar ? "الرجاء إدخال بيانات العينة" : "Please enter sample data");
      return;
    }

    const pgBinder = computedSample.pgBinder;

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "asphalt_bitumen_extraction",
        formData: {
          extractionMethod: spec.code === "ASPH_BITUMEN_EXTRACTION_CENTRIFUGE" ? "centrifuge" : "ignition_furnace",
          method,
          ignitionTemperature: method === "IGNITION" ? parseFloat(ignitionTemperature) || 538 : null,
          designBitumen,
          tolerance,
          sample: computedSample,
          calculations: {
            massAfterIgnition: computedSample.massAfterIgnition,
            percentLoss: computedSample.percentLoss,
            pgBinder,
          },
          avgBitumen: pgBinder,
          bitumenContent: pgBinder,
          overallResult: overallResult === "pending" ? undefined : overallResult,
        },
        overallResult: overallResult === "pending" ? "pending" : overallResult,
        summaryValues: {
          method: spec.label,
          designBitumen,
          avgBitumen: pgBinder,
          bitumenContent: pgBinder,
          tolerance,
          overallResult: overallResult === "pending" ? undefined : overallResult,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const resultBadge = (result: "pass" | "fail" | "pending") => {
    if (result === "pending") return <span className="text-muted-foreground">—</span>;
    return (
      <Badge variant={result === "pass" ? "default" : "destructive"}>
        {result === "pass" ? (ar ? "مطابق" : "Specified") : ar ? "غير مطابق" : "Not Specified"}
      </Badge>
    );
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
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: ar ? "نوع الخلطة" : "Mix type", value: dist?.testSubType }]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / استخلاص البيتومين" : "Asphalt Tests / Bitumen Extraction"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "محتوى البيتومين بالاستخلاص" : "Bitumen Content by Extraction"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {spec.standard} | {ar ? "أمر التوزيع:" : "Distribution:"}{" "}
              {dist?.distributionCode ?? `DIST-${distId}`}
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

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-blue-900 text-sm">
            <Info className="w-4 h-4 shrink-0" />
            <span className="font-semibold">
              {ar ? "معادلة الاشتعال:" : "Formula (Ignition Furnace):"}
            </span>
          </div>
          <div className="mt-2 text-xs text-blue-700 font-mono">
            %PG Binder (Pb) = % Loss − Temp. Comp. % − Ignition Factor of Mix %
          </div>
          <div className="mt-1 text-xs text-blue-600">
            {ar
              ? "حيث: % الفقد = (فقدان الاشتعال / الكتلة قبل الاشتعال) × 100"
              : "Where: % Loss = (Loss of Ignition / Mass Before Ignition) × 100"}
          </div>
          <div className="mt-1 text-xs text-blue-600">
            {ar
              ? `القبول: محتوى التصميم ± ${tolerance}%`
              : `Acceptance: Design Bitumen ± ${tolerance}%`}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "طريقة الاستخلاص" : "Extraction Method"}
                </Label>
                <Select value={method} onValueChange={(v) => setMethod(v as MethodKey)} disabled={submitted}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXTRACTION_METHODS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "محتوى البيتومين التصميمي (%)" : "Design Bitumen Content (%)"}
                </Label>
                <Input
                  value={designBitumenStr}
                  onChange={(e) => setDesignBitumenStr(e.target.value)}
                  className="font-mono"
                  placeholder="3.9"
                  disabled={submitted}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "التفاوت (±%)" : "Tolerance (±%)"}</Label>
                <Input
                  value={toleranceStr}
                  onChange={(e) => setToleranceStr(e.target.value)}
                  className="font-mono"
                  placeholder="0.3"
                  disabled={submitted}
                />
              </div>
              {method === "IGNITION" && (
                <div>
                  <Label className="text-xs text-slate-500 mb-1 block">{ar ? "درجة حرارة الفرن (°C)" : "Ignition Temperature (°C)"}</Label>
                  <Input
                    value={ignitionTemperature}
                    onChange={(e) => setIgnitionTemperature(e.target.value)}
                    className="font-mono"
                    placeholder="538"
                    disabled={submitted}
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-0.5 h-full flex flex-col justify-center">
                  <div>
                    <span className="font-semibold">{ar ? "التصميم:" : "Design:"}</span> {designBitumen}%
                  </div>
                  <div>
                    <span className="font-semibold">{ar ? "القبول:" : "Acceptance:"}</span>{" "}
                    {(designBitumen - tolerance).toFixed(2)}% – {(designBitumen + tolerance).toFixed(2)}%
                  </div>
                  {hasResult && (
                    <div
                      className={`font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {ar ? "محتوى الرابط PG:" : "PG Binder:"} {computedSample.pgBinder.toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "نتائج الاستخلاص" : "Extraction Results"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-2 py-2">{ar ? "رقم العينة" : "Sample No."}</th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "الكتلة قبل الاشتعال (جم)" : "Mass Before Ignition (gm)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "فقدان الاشتعال (جم)" : "Loss of Ignition (gms)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                      {ar ? "الكتلة بعد الاشتعال (جم)" : "Mass After Ignition (gm)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                      {ar ? "نسبة الفقد %" : "% Loss"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "تعويض الحرارة %" : "Temp. Comp. %"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">
                      {ar ? "عامل الاشتعال للخليط %" : "Ignition Factor of Mix %"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                      {ar ? "محتوى الرابط PG (%)" : "%PG Binder (Pb)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">{ar ? "النتيجة" : "Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-2 py-2 text-center font-semibold">S1</td>
                    <td className="border border-slate-300 px-2 py-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={sample.massBeforeIgnition}
                        onChange={(e) => setSample({ ...sample, massBeforeIgnition: e.target.value })}
                        className={LAB_NUMERIC_INPUT_SM}
                        placeholder="3050"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <Input
                        type="number"
                        step="0.1"
                        value={sample.lossOfIgnition}
                        onChange={(e) => setSample({ ...sample, lossOfIgnition: e.target.value })}
                        className={LAB_NUMERIC_INPUT_SM}
                        placeholder="166.5"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                      {computedSample.massAfterIgnition > 0
                        ? computedSample.massAfterIgnition.toFixed(1)
                        : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                      {computedSample.percentLoss > 0 ? `${computedSample.percentLoss.toFixed(2)}%` : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={sample.tempComp}
                        onChange={(e) => setSample({ ...sample, tempComp: e.target.value })}
                        className={LAB_NUMERIC_INPUT_SM}
                        placeholder="0.00"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={sample.ignitionFactor}
                        onChange={(e) => setSample({ ...sample, ignitionFactor: e.target.value })}
                        className={LAB_NUMERIC_INPUT_SM}
                        placeholder="0.00"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-bold text-base">
                      {computedSample.result !== "pending"
                        ? `${computedSample.pgBinder.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      {resultBadge(computedSample.result)}
                    </td>
                  </tr>
                </tbody>
                {computedSample.result !== "pending" && (
                  <tfoot className="bg-green-50">
                    <tr>
                      <td
                        colSpan={7}
                        className="border border-slate-300 px-2 py-2 text-right font-semibold"
                      >
                        {ar ? "محتوى الرابط PG:" : "PG Binder Content:"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center font-bold text-lg">
                        {computedSample.pgBinder.toFixed(2)}%
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        <Badge
                          variant={computedSample.result === "pass" ? "default" : "destructive"}
                          className="text-sm"
                        >
                          {computedSample.result === "pass"
                            ? ar
                              ? "مطابق ✓"
                              : "Specified ✓"
                            : ar
                              ? "غير مطابق ✗"
                              : "Not Specified ✗"}
                        </Badge>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {hasResult && overallResult !== "pending" && (
          <Card>
            <CardContent className="pt-4">
              <ResultBanner
                result={overallResult}
                testName={
                  ar
                    ? `محتوى البيتومين — ${spec.label}`
                    : `Bitumen Content — ${spec.label}`
                }
                standard={spec.standard}
              />
            </CardContent>
          </Card>
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
