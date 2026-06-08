import { useEffect, useState } from "react";
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
import { Send, FlaskConical, Info, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";
import {
  AGG_SG_SPECS,
  SG_TITLES,
  type AggSgType,
  type SgComputedValues,
  computeCoarseSg,
  computeFineSg,
} from "@/lib/aggSpecificGravity";

const CELL_IN = "bg-yellow-50";
const CELL_CALC = "bg-emerald-50 text-emerald-900";

interface CoarseSgRow {
  id: string;
  sampleNo: string;
  massOvenDry: string;
  massSSD: string;
  massInWater: string;
  computed?: SgComputedValues;
}

interface FineSgInput {
  pycnometerH2O: string;
  massSSD: string;
  ssdPycH2O: string;
  massOvenDry: string;
}

function newCoarseRow(index: number): CoarseSgRow {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNo: `S${index + 1}`,
    massOvenDry: "",
    massSSD: "",
    massInWater: "",
  };
}

const EMPTY_FINE: FineSgInput = {
  pycnometerH2O: "",
  massSSD: "",
  ssdPycH2O: "",
  massOvenDry: "",
};

export default function AggSpecificGravity() {
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

  const [aggType, setAggType] = useState<AggSgType>("COARSE");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [coarseRows, setCoarseRows] = useState<CoarseSgRow[]>([
    newCoarseRow(0),
    newCoarseRow(1),
    newCoarseRow(2),
  ]);
  const [fineInput, setFineInput] = useState<FineSgInput>(EMPTY_FINE);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const spec = AGG_SG_SPECS[aggType];
  const title = SG_TITLES[aggType];

  const coarseComputed = coarseRows.map(r => ({
    ...r,
    computed: computeCoarseSg(r.massOvenDry, r.massSSD, r.massInWater, AGG_SG_SPECS.COARSE) ?? undefined,
  }));
  const coarseValid = coarseComputed.filter(r => r.computed);

  const fineComputed = computeFineSg(
    fineInput.pycnometerH2O,
    fineInput.massSSD,
    fineInput.ssdPycH2O,
    fineInput.massOvenDry,
    AGG_SG_SPECS.FINE,
  );

  const validResults =
    aggType === "COARSE"
      ? coarseValid.map(r => r.computed!)
      : fineComputed
        ? [fineComputed]
        : [];

  const avgApparentSg =
    validResults.length > 0
      ? parseFloat(
          (
            validResults.reduce((s, r) => s + r.apparentSg, 0) / validResults.length
          ).toFixed(3),
        )
      : undefined;
  const avgAbsorption =
    validResults.length > 0
      ? parseFloat(
          (
            validResults.reduce((s, r) => s + r.absorption, 0) / validResults.length
          ).toFixed(2),
        )
      : undefined;

  const overallResult: "pass" | "fail" | "pending" =
    validResults.length === 0
      ? "pending"
      : validResults.every(r => r.overallResult === "pass")
        ? "pass"
        : "fail";

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.aggType === "COARSE" || fd.aggType === "FINE") setAggType(fd.aggType);
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string") setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);

    if (fd.aggType === "FINE" && fd.fineInput && typeof fd.fineInput === "object") {
      const fi = fd.fineInput as FineSgInput;
      setFineInput({
        pycnometerH2O: fi.pycnometerH2O ?? "",
        massSSD: fi.massSSD ?? "",
        ssdPycH2O: fi.ssdPycH2O ?? "",
        massOvenDry: fi.massOvenDry ?? "",
      });
    } else if (Array.isArray(fd.rows)) {
      setCoarseRows(
        (fd.rows as Array<Record<string, unknown>>).map((r, i) => ({
          id: String(r.id ?? `row_${i}`),
          sampleNo: String(r.sampleNo ?? `S${i + 1}`),
          massOvenDry: String(r.massOvenDry ?? r.massDryAir ?? ""),
          massSSD: String(r.massSSD ?? ""),
          massInWater: String(r.massInWater ?? ""),
        })),
      );
    }
    setHydrated(true);
  }, [existing, hydrated]);

  const saveResult = trpc.specializedTests.save.useMutation({
    onError: e => toast.error(e.message),
  });

  const updateCoarse = (id: string, field: keyof CoarseSgRow, value: string) => {
    setCoarseRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validResults.length === 0) {
      toast.error(ar ? "الرجاء إدخال بيانات الاختبار" : "Please enter test data");
      return;
    }

    const formData =
      aggType === "COARSE"
        ? {
            aggType,
            spec,
            source,
            testedBy: user?.name,
            rows: coarseComputed.map(r => ({
              id: r.id,
              sampleNo: r.sampleNo,
              massOvenDry: r.massOvenDry,
              massSSD: r.massSSD,
              massInWater: r.massInWater,
              ...r.computed,
            })),
            avgApparentSg,
            avgAbsorption,
            overallResult,
          }
        : {
            aggType,
            spec,
            source,
            testedBy: user?.name,
            fineInput,
            result: fineComputed,
            avgApparentSg: fineComputed?.apparentSg,
            avgAbsorption: fineComputed?.absorption,
            overallResult,
          };

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist.testType ?? "AGG_SG",
        formTemplate: "agg_specific_gravity",
        formData,
        overallResult,
        summaryValues: {
          aggType: spec.label,
          avgApparentSg,
          avgAbsorption,
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
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: ar ? "نوع الركام" : "Aggregate type", value: dist?.testSubType }]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / الكثافة النسبية" : "Aggregates / Relative Density"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? title.ar : title.en}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {spec.standard} | {ar ? "التوزيع:" : "Distribution:"}{" "}
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الركام" : "Aggregate Type"}</Label>
                <Select value={aggType} disabled={submitted} onValueChange={v => setAggType(v as AggSgType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COARSE">{ar ? "ركام خشن" : "Coarse Aggregate"}</SelectItem>
                    <SelectItem value="FINE">{ar ? "ركام ناعم (رمل)" : "Fine Aggregate (Sand)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} disabled={submitted} placeholder="—" />
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
                  <div>
                    <span className="font-semibold">{ar ? "الكثافة الظاهرية:" : "Apparent SG:"}</span> ≥{" "}
                    {spec.apparentSgMin}
                  </div>
                  <div>
                    <span className="font-semibold">{ar ? "امتصاص الماء:" : "Water Absorption:"}</span> ≤{" "}
                    {spec.absorptionMax}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {aggType === "COARSE" ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              <Info size={12} className="inline mr-1" />
              <strong>{ar ? "الطريقة:" : "Method:"}</strong>{" "}
              {ar
                ? "أ = كتلة جافة بالفرن | ب = مشبع وجاف السطح | ج = كتلة في الماء"
                : "A = Oven dry mass | B = Saturated and Surface dried | C = Mass in water"}
              <br />
              Bulk SG (OD) = A/(B−C) | Bulk SG (SSD) = B/(B−C) | Apparent SG = A/(A−C) | Absorption = (B−A)/A × 100%
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{ar ? "بيانات الاختبار" : "Test Data"}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submitted}
                    onClick={() => setCoarseRows(p => [...p, newCoarseRow(p.length)])}
                  >
                    {ar ? "+ إضافة عينة" : "+ Add Sample"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-2 py-2 text-xs">{ar ? "رقم العينة" : "Sample No."}</th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_IN}`}>
                          {ar ? "أ: جاف بالفرن (جم)" : "A: Oven Dry (g)"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_IN}`}>
                          {ar ? "ب: مشبع وجاف السطح (جم)" : "B: Saturated and Surface dried (g)"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_IN}`}>
                          {ar ? "ج: في الماء (جم)" : "C: In Water (g)"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_CALC}`}>
                          {ar ? "الكثافة الظاهرية (جاف)" : "Bulk SG (OD)"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_CALC}`}>
                          {ar ? "الكثافة الظاهرية (مشبع جاف السطح)" : "Bulk SG (SSD)"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_CALC}`}>
                          {ar ? "الكثافة الظاهرية" : "Apparent SG"}
                        </th>
                        <th className={`border border-slate-200 px-2 py-2 text-xs ${CELL_CALC}`}>
                          {ar ? "الامتصاص (%)" : "Absorption (%)"}
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-xs">{ar ? "النتيجة" : "Result"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coarseComputed.map((row, idx) => {
                        const c = row.computed;
                        return (
                          <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="border border-slate-200 px-1 py-1">
                              <Input
                                value={row.sampleNo}
                                disabled={submitted}
                                onChange={e => updateCoarse(row.id, "sampleNo", e.target.value)}
                                className="h-7 text-xs w-14"
                              />
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 ${CELL_IN}`}>
                              <Input
                                value={row.massOvenDry}
                                disabled={submitted}
                                onChange={e => updateCoarse(row.id, "massOvenDry", e.target.value)}
                                className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                                placeholder="—"
                              />
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 ${CELL_IN}`}>
                              <Input
                                value={row.massSSD}
                                disabled={submitted}
                                onChange={e => updateCoarse(row.id, "massSSD", e.target.value)}
                                className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                                placeholder="—"
                              />
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 ${CELL_IN}`}>
                              <Input
                                value={row.massInWater}
                                disabled={submitted}
                                onChange={e => updateCoarse(row.id, "massInWater", e.target.value)}
                                className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                                placeholder="—"
                              />
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 text-center font-mono text-xs ${CELL_CALC}`}>
                              {c?.bulkSgOD ?? "—"}
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 text-center font-mono text-xs ${CELL_CALC}`}>
                              {c?.bulkSgSSD ?? "—"}
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 text-center`}>
                              {c ? (
                                <span
                                  className={`font-mono text-xs font-bold ${c.apparentResult === "pass" ? "text-emerald-700" : "text-red-700"}`}
                                >
                                  {c.apparentSg}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className={`border border-slate-200 px-1 py-1 text-center`}>
                              {c ? (
                                <span
                                  className={`font-mono text-xs font-bold ${c.absorptionResult === "pass" ? "text-emerald-700" : "text-red-700"}`}
                                >
                                  {c.absorption}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="border border-slate-200 px-1 py-1 text-center">
                              {c ? <PassFailBadge result={c.overallResult} size="sm" /> : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {coarseValid.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-semibold">
                          <td colSpan={6} className="border border-slate-200 px-3 py-2 text-end text-xs text-slate-600">
                            {ar ? "المتوسط:" : "Average:"}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">
                            {avgApparentSg}
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">
                            {avgAbsorption}%
                          </td>
                          <td className="border border-slate-200 px-2 py-2 text-center">
                            <PassFailBadge result={overallResult} size="sm" />
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              <Info size={12} className="inline mr-1" />
              <strong>{ar ? "طريقة الكثّاف (ركام ناعم):" : "Pycnometer method (fine aggregate):"}</strong>
              <br />
              OD = od / ((ssd + pyc+h₂o) − (ssd+pyc+h₂o)) | SSD = ssd / ((pyc+h₂o + ssd) − (ssd+pyc+h₂o)) | Apparent = od / ((od + pyc+h₂o) − (ssd+pyc+h₂o)) | Absorption = (ssd − od) / od × 100%
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{ar ? "بيانات الاختبار — ركام ناعم" : "Test Data — Fine Aggregate"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">
                      {ar ? "كثّاف + ماء (جم)" : "Pycnometer + water (g)"}
                    </Label>
                    <Input
                      type="number"
                      disabled={submitted}
                      value={fineInput.pycnometerH2O}
                      onChange={e => setFineInput(p => ({ ...p, pycnometerH2O: e.target.value }))}
                      className={`${LAB_NUMERIC_INPUT_SM} bg-yellow-50`}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">
                      {ar ? "مشبع وجاف السطح (جم)" : "Saturated and Surface dried (g)"}
                    </Label>
                    <Input
                      type="number"
                      disabled={submitted}
                      value={fineInput.massSSD}
                      onChange={e => setFineInput(p => ({ ...p, massSSD: e.target.value }))}
                      className={`${LAB_NUMERIC_INPUT_SM} bg-yellow-50`}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">
                      {ar ? "مشبع + كثّاف + ماء (جم)" : "SSD + pycnometer + water (g)"}
                    </Label>
                    <Input
                      type="number"
                      disabled={submitted}
                      value={fineInput.ssdPycH2O}
                      onChange={e => setFineInput(p => ({ ...p, ssdPycH2O: e.target.value }))}
                      className={`${LAB_NUMERIC_INPUT_SM} bg-yellow-50`}
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">
                      {ar ? "جاف بالفرن (جم)" : "Oven Dry (g)"}
                    </Label>
                    <Input
                      type="number"
                      disabled={submitted}
                      value={fineInput.massOvenDry}
                      onChange={e => setFineInput(p => ({ ...p, massOvenDry: e.target.value }))}
                      className={`${LAB_NUMERIC_INPUT_SM} bg-yellow-50`}
                      placeholder="—"
                    />
                  </div>
                </div>

                <table className="w-full border-collapse text-sm max-w-xl">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-3 py-2 text-start" colSpan={2}>
                        {ar ? "الكثافة الجسيمية Mg/m³" : "Particle Density, Mg/m³"}
                      </th>
                    </tr>
                    <tr className="bg-slate-50 text-xs">
                      <th className={`border border-slate-300 px-2 py-1 ${CELL_CALC}`}>OD</th>
                      <th className={`border border-slate-300 px-2 py-1 ${CELL_CALC}`}>SSD</th>
                      <th className={`border border-slate-300 px-2 py-1 ${CELL_CALC}`}>{ar ? "ظاهرية" : "Apparent"}</th>
                      <th className={`border border-slate-300 px-2 py-1 ${CELL_CALC}`}>{ar ? "امتصاص %" : "Absorption %"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "النتيجة" : "Result"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={`border border-slate-300 px-2 py-2 text-center font-mono ${CELL_CALC}`}>
                        {fineComputed?.bulkSgOD ?? "—"}
                      </td>
                      <td className={`border border-slate-300 px-2 py-2 text-center font-mono ${CELL_CALC}`}>
                        {fineComputed?.bulkSgSSD ?? "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">
                        {fineComputed ? (
                          <span className={fineComputed.apparentResult === "pass" ? "text-emerald-700" : "text-red-700"}>
                            {fineComputed.apparentSg}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">
                        {fineComputed ? (
                          <span className={fineComputed.absorptionResult === "pass" ? "text-emerald-700" : "text-red-700"}>
                            {fineComputed.absorption}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-2 text-center">
                        {fineComputed ? <PassFailBadge result={fineComputed.overallResult} size="sm" /> : "—"}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 text-xs">
                      <td colSpan={2} className="border border-slate-300 px-2 py-1 font-semibold">
                        {ar ? "متطلبات المواصفة" : "CMW Gen. Spec. Requirement"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center">≥ {spec.apparentSgMin}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">≤ {spec.absorptionMax}%</td>
                      <td className="border border-slate-300" />
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {validResults.length > 0 && (
          <ResultBanner result={overallResult} testName={ar ? title.ar : title.en} standard={spec.standard} />
        )}

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
