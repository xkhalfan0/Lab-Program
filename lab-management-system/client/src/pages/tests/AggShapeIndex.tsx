import { useEffect, useMemo, useState } from "react";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";
import {
  ELONGATION_FRACTIONS,
  ELONGATION_GRADING_SIEVES,
  ELONGATION_MAX_LIMIT,
  ELONGATION_STANDARD,
  type ElongAggSize,
  type ElongFractionId,
  type ElongFractionInput,
  computeElongationWorksheet,
  initElongationInputs,
  resolveElongAggSize,
} from "@/lib/aggElongation";
import {
  FLAKINESS_FRACTIONS,
  FLAKINESS_GRADING_SIEVES,
  FLAKINESS_MAX_LIMIT,
  FLAKINESS_STANDARD,
  type FlakFractionId,
  type FlakFractionInput,
  computeFlakinessWorksheet,
  initFlakinessInputs,
} from "@/lib/aggFlakiness";

const SHAPE_SPECS = {
  FLAKINESS: {
    label: "Flakiness Index",
    maxLimit: FLAKINESS_MAX_LIMIT,
    standard: FLAKINESS_STANDARD,
    code: "AGG_FLAKINESS",
  },
  ELONGATION: {
    label: "Elongation Index",
    maxLimit: ELONGATION_MAX_LIMIT,
    standard: ELONGATION_STANDARD,
    code: "AGG_ELONGATION",
  },
} as const;

type ShapeType = keyof typeof SHAPE_SPECS;

const CELL_IN = "bg-yellow-50";
const CELL_CALC = "bg-emerald-50 text-emerald-900";
const CELL_RESULT = "bg-red-50 text-red-900 font-bold";

export default function AggShapeIndex() {
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

  const defaultAggSize = resolveElongAggSize(dist?.testSubType);

  const [shapeType, setShapeType] = useState<ShapeType>("FLAKINESS");
  const [aggSize, setAggSize] = useState<ElongAggSize>(defaultAggSize);
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [flakInputs, setFlakInputs] = useState<FlakFractionInput[]>(initFlakinessInputs);
  const [elongInputs, setElongInputs] = useState<ElongFractionInput[]>(initElongationInputs);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!dist?.testSubType) return;
    setAggSize(resolveElongAggSize(dist.testSubType));
  }, [dist?.testSubType]);

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.shapeType === "ELONGATION" || fd.shapeType === "FLAKINESS") {
      setShapeType(fd.shapeType);
    }
    if (fd.aggSize === "10mm" || fd.aggSize === "20mm") setAggSize(fd.aggSize);
    if (typeof fd.source === "string") setSource(fd.source);
    if (Array.isArray(fd.flakinessInputs)) {
      const byId = Object.fromEntries(
        (fd.flakinessInputs as FlakFractionInput[]).map(r => [r.id, r]),
      );
      setFlakInputs(
        FLAKINESS_FRACTIONS.map(f => ({
          id: f.id,
          actualSampleG: byId[f.id]?.actualSampleG ?? "",
          reducedWtG: byId[f.id]?.reducedWtG ?? "",
          flakyG: byId[f.id]?.flakyG ?? "",
        })),
      );
    } else if (Array.isArray(fd.rows) && fd.shapeType === "FLAKINESS" && fd.rows[0]?.retainedWt != null) {
      const saved = fd.rows as Array<{
        id: string;
        actualSampleG?: number;
        reducedWtG?: number;
        flakyReducedG?: number;
      }>;
      const byId = Object.fromEntries(saved.map(r => [r.id, r]));
      setFlakInputs(
        FLAKINESS_FRACTIONS.map(f => ({
          id: f.id,
          actualSampleG: byId[f.id]?.actualSampleG != null ? String(byId[f.id].actualSampleG) : "",
          reducedWtG: byId[f.id]?.reducedWtG != null ? String(byId[f.id].reducedWtG) : "",
          flakyG: byId[f.id]?.flakyReducedG != null ? String(byId[f.id].flakyReducedG) : "",
        })),
      );
    }
    if (Array.isArray(fd.elongationInputs)) {
      const byId = Object.fromEntries(
        (fd.elongationInputs as ElongFractionInput[]).map(r => [r.id, r]),
      );
      setElongInputs(
        ELONGATION_FRACTIONS.map(f => ({
          id: f.id,
          actualSampleG: byId[f.id]?.actualSampleG ?? "",
          reducedWtG: byId[f.id]?.reducedWtG ?? "",
          elongatedG: byId[f.id]?.elongatedG ?? "",
        })),
      );
    }
    if (existing.status === "submitted") setSubmitted(true);
    if (existing.notes) setNotes(existing.notes);
    setHydrated(true);
  }, [existing, hydrated]);

  const spec = SHAPE_SPECS[shapeType];

  const flakWorksheet = useMemo(
    () => computeFlakinessWorksheet(flakInputs, aggSize),
    [flakInputs, aggSize],
  );

  const elongWorksheet = useMemo(
    () => computeElongationWorksheet(elongInputs, aggSize),
    [elongInputs, aggSize],
  );

  const overallIndex =
    shapeType === "FLAKINESS"
      ? flakWorksheet.flakinessIndex ?? undefined
      : elongWorksheet.elongationIndex ?? undefined;
  const overallResult =
    shapeType === "FLAKINESS" ? flakWorksheet.overallResult : elongWorksheet.overallResult;

  const gradingReport = useMemo(() => {
    if (shapeType === "FLAKINESS") {
      const byId = Object.fromEntries(flakWorksheet.rows.map(r => [r.id, r]));
      return FLAKINESS_GRADING_SIEVES.map(s => ({
        mm: s.mm,
        retainedPct: s.fractionId ? (byId[s.fractionId]?.retainedPct ?? null) : null,
      }));
    }
    const byId = Object.fromEntries(elongWorksheet.rows.map(r => [r.id, r]));
    return ELONGATION_GRADING_SIEVES.map(s => ({
      mm: s.mm,
      retainedPct: s.fractionId ? (byId[s.fractionId]?.retainedPct ?? null) : null,
    }));
  }, [shapeType, flakWorksheet.rows, elongWorksheet.rows]);

  const saveResult = trpc.specializedTests.save.useMutation({
    onError: e => toast.error(e.message),
  });

  const updateFlak = (id: FlakFractionId, field: keyof FlakFractionInput, value: string) => {
    setFlakInputs(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const updateElong = (id: ElongFractionId, field: keyof ElongFractionInput, value: string) => {
    setElongInputs(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && overallIndex === undefined) {
      toast.error(ar ? "الرجاء إدخال بيانات الاختبار" : "Please enter test data");
      return;
    }

    const formData =
      shapeType === "FLAKINESS"
        ? {
            shapeType: "FLAKINESS" as const,
            aggSize,
            standard: FLAKINESS_STANDARD,
            maxLimit: FLAKINESS_MAX_LIMIT,
            spec,
            source,
            flakinessInputs: flakInputs,
            rows: flakWorksheet.rows,
            totalRetainedMass: flakWorksheet.totalRetainedMass,
            totalFlakyMass: flakWorksheet.totalFlakyMass,
            flakinessIndex: flakWorksheet.flakinessIndex,
            overallIndex: flakWorksheet.flakinessIndex,
            overallResult: flakWorksheet.overallResult,
            gradingReport,
          }
        : {
            shapeType: "ELONGATION" as const,
            aggSize,
            standard: ELONGATION_STANDARD,
            maxLimit: ELONGATION_MAX_LIMIT,
            spec,
            source,
            elongationInputs: elongInputs,
            rows: elongWorksheet.rows,
            totalRetainedMass: elongWorksheet.totalRetainedMass,
            totalElongatedMass: elongWorksheet.totalElongatedMass,
            elongationIndex: elongWorksheet.elongationIndex,
            overallIndex: elongWorksheet.elongationIndex,
            overallResult: elongWorksheet.overallResult,
            gradingReport,
          };

    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist.testType ?? "AGG_FLAKINESS_ELONGATION",
        formTemplate: "agg_shape_index",
        formData,
        overallResult,
        summaryValues: {
          shapeType: spec.label,
          aggSize,
          overallIndex,
          maxLimit: spec.maxLimit,
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

  const aggSizeLabel = aggSize === "20mm" ? (ar ? "ركام 20 مم" : "20mm Agg.") : (ar ? "ركام 10 مم" : "10mm Agg.");

  const renderShapeWorksheet = (
    worksheet: typeof flakWorksheet | typeof elongWorksheet,
    inputs: FlakFractionInput[] | ElongFractionInput[],
    update: (id: FlakFractionId | ElongFractionId, field: string, value: string) => void,
    mode: "flakiness" | "elongation",
  ) => {
    const isFlak = mode === "flakiness";
    const indexVal = isFlak
      ? (worksheet as typeof flakWorksheet).flakinessIndex
      : (worksheet as typeof elongWorksheet).elongationIndex;
    const totalRet = worksheet.totalRetainedMass;
    const totalPart = isFlak
      ? (worksheet as typeof flakWorksheet).totalFlakyMass
      : (worksheet as typeof elongWorksheet).totalElongatedMass;
    const rows = worksheet.rows as Array<{
      id: string;
      labelEn: string;
      labelAr: string;
      retainedPct: number | null;
      discarded: boolean;
      retainedWt: number | null;
      reductionFactor: number | null;
      flakyOriginalG?: number | null;
      elongatedOriginalG?: number | null;
    }>;

    return (
      <>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <strong>
            {isFlak
              ? ar
                ? "معامل التقشر للركام الخشن"
                : "FLAKINESS INDEX OF COARSE AGGREGATE"
              : ar
                ? "معامل الاستطالة للركام الخشن"
                : "ELONGATION INDEX OF COARSE AGGREGATE"}
          </strong>
          <span className="mx-2">|</span>
          {aggSizeLabel}
          <span className="block mt-1 text-blue-700">
            {ar
              ? "أصفر = إدخال | أخضر = حساب | أحمر = النتيجة | تجاهل الكسر إذا كانت النسبة المحتجزة < 5%"
              : "Yellow = input | Green = calculated | Red = result | Discard fraction if retained % < 5% of total"}
          </span>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isFlak
                ? ar
                  ? "ورقة العمل — تحليل التقشر"
                  : "Worksheet — Flakiness Analysis"
                : ar
                  ? "ورقة العمل — تحليل الاستطالة"
                  : "Worksheet — Elongation Analysis"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px] border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-2">{ar ? "كسر الحجم (مم)" : "Size fraction (mm)"}</th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_IN}`}>
                      {ar ? "وزن العينة المتدرجة (جم)" : "Actual Graded Sample (g)"}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_CALC}`}>{ar ? "محتجز %" : "Retained %"}</th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_CALC}`}>
                      {aggSize === "20mm"
                        ? ar
                          ? "محتجز M1 (جم)"
                          : "Mass retained M1 (g)"
                        : ar
                          ? "محتجز M2 (جم)"
                          : "Mass retained M2 (g)"}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_IN}`}>
                      {ar ? "الوزن المخفّض M (جم)" : "Reduced wt M (g)"}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_CALC}`}>
                      {aggSize === "20mm"
                        ? ar
                          ? "معامل D/E"
                          : "Factor D/E"
                        : ar
                          ? "معامل A/M"
                          : "Factor A/M"}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_IN}`}>
                      {isFlak
                        ? ar
                          ? "متقشر (جزء مخفّض) (جم)"
                          : "Flaky (reduced) (g)"
                        : ar
                          ? "مستطيل (جزء مخفّض) (جم)"
                          : "Elongated (reduced) (g)"}
                    </th>
                    <th className={`border border-slate-300 px-2 py-2 ${CELL_CALC}`}>
                      {isFlak
                        ? ar
                          ? "متقشر × العامل (جم)"
                          : "Flaky × factor (g)"
                        : ar
                          ? "مستطيل × العامل (جم)"
                          : "Elong. × factor (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-2">{ar ? "ملاحظات" : "Notes"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const orig =
                      isFlak && row.flakyOriginalG != null
                        ? row.flakyOriginalG
                        : !isFlak && row.elongatedOriginalG != null
                          ? row.elongatedOriginalG
                          : null;
                    const inp = inputs.find(i => i.id === row.id);
                    const particleField = isFlak ? "flakyG" : "elongatedG";
                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <td className="border border-slate-300 px-2 py-1 font-mono font-semibold text-center">
                          {ar ? (row as { labelAr: string }).labelAr : row.labelEn}
                        </td>
                        <td className={`border border-slate-300 px-1 py-1 ${CELL_IN}`}>
                          <Input
                            type="number"
                            disabled={submitted}
                            value={inp?.actualSampleG ?? ""}
                            onChange={e => update(row.id, "actualSampleG", e.target.value)}
                            onFocus={e => e.currentTarget.select()}
                            className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                            placeholder="—"
                          />
                        </td>
                        <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                          {row.retainedPct != null ? row.retainedPct.toFixed(1) : "—"}
                        </td>
                        <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                          {row.discarded ? "—" : row.retainedWt != null ? row.retainedWt : "—"}
                        </td>
                        <td className={`border border-slate-300 px-1 py-1 ${CELL_IN}`}>
                          <Input
                            type="number"
                            disabled={submitted || row.discarded}
                            value={inp?.reducedWtG ?? ""}
                            onChange={e => update(row.id, "reducedWtG", e.target.value)}
                            onFocus={e => e.currentTarget.select()}
                            className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                            placeholder={row.discarded ? "—" : row.retainedWt != null ? String(row.retainedWt) : "—"}
                          />
                        </td>
                        <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                          {row.reductionFactor != null ? row.reductionFactor.toFixed(2) : "—"}
                        </td>
                        <td className={`border border-slate-300 px-1 py-1 ${CELL_IN}`}>
                          <Input
                            type="number"
                            disabled={submitted || row.discarded}
                            value={(inp as Record<string, string> | undefined)?.[particleField] ?? ""}
                            onChange={e => update(row.id, particleField, e.target.value)}
                            onFocus={e => e.currentTarget.select()}
                            className={`${LAB_NUMERIC_INPUT_SM} w-20 mx-auto bg-yellow-50`}
                            placeholder="—"
                          />
                        </td>
                        <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                          {orig != null ? orig.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center text-xs text-amber-700 font-medium">
                          {row.discarded ? (ar ? "تجاهل" : "Discard") : ""}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-bold">
                    <td className="border border-slate-300 px-2 py-2">{ar ? "المجموع" : "TOTAL"}</td>
                    <td className="border border-slate-300" colSpan={2} />
                    <td className={`border border-slate-300 px-2 py-2 text-center font-mono ${CELL_CALC}`}>
                      {totalRet != null ? totalRet.toFixed(0) : "—"}
                      <span className="block text-[9px] font-normal text-slate-500">
                        {aggSize === "20mm" ? "M1" : "M2"}
                      </span>
                    </td>
                    <td className="border border-slate-300" colSpan={3} />
                    <td className={`border border-slate-300 px-2 py-2 text-center font-mono ${CELL_CALC}`}>
                      {totalPart != null || indexVal === 0 ? String(Math.round(totalPart ?? 0)) : "—"}
                      <span className="block text-[9px] font-normal text-slate-500">
                        {aggSize === "20mm" ? "M2" : "M3"}
                      </span>
                    </td>
                    <td className="border border-slate-300" />
                  </tr>
                  <tr>
                    <td colSpan={9} className="border border-slate-300 p-3">
                      <div className="flex flex-wrap items-center gap-6 justify-center">
                        <div className={`rounded-lg px-4 py-2 text-center ${CELL_RESULT}`}>
                          <p className="text-[10px] uppercase">
                            {isFlak
                              ? ar
                                ? "معامل التقشر"
                                : "Flakiness Index"
                              : ar
                                ? "معامل الاستطالة"
                                : "Elongation Index"}
                          </p>
                          <p className="text-2xl font-bold">{indexVal != null ? `${indexVal}%` : "—"}</p>
                          <p className="text-[10px]">
                            {aggSize === "20mm" ? "M2 × 100 / M1" : "M3 × 100 / M2"}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">{ar ? "الحد الأقصى %" : "Limit Max %"}</p>
                          <p className="text-xl font-bold">{spec.maxLimit}</p>
                        </div>
                        <PassFailBadge result={overallResult} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {ar ? "تقرير التدرج" : "Grading Report (as per final report format)"}
              </p>
              <table className="w-full border-collapse text-xs border border-slate-300 max-w-md">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1">{ar ? "منخل قياسي (مم)" : "Standard Sieve (mm)"}</th>
                    <th className={`border border-slate-300 px-2 py-1 ${CELL_CALC}`}>{ar ? "تدرج % محتجز" : "Grading % Retained"}</th>
                  </tr>
                </thead>
                <tbody>
                  {gradingReport.map(g => (
                    <tr key={g.mm}>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono">{g.mm}</td>
                      <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                        {g.retainedPct != null ? g.retainedPct.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard
          dist={dist}
          extraFields={[{ label: ar ? "نوع الركام" : "Aggregate Size", value: dist?.testSubType ?? aggSizeLabel }]}
        />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / مؤشر الشكل" : "Aggregates / Shape Index"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "مؤشر التقشر والاستطالة" : "Flakiness & Elongation Index"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {shapeType === "ELONGATION" ? ELONGATION_STANDARD : "BS 812-105"} | {dist?.distributionCode ?? `DIST-${distId}`}
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
                  {saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الاختبار" : "Test Type"}</Label>
                <Select value={shapeType} disabled={submitted} onValueChange={v => setShapeType(v as ShapeType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SHAPE_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مقاس الركام" : "Aggregate Size"}</Label>
                <Select value={aggSize} disabled={submitted} onValueChange={v => setAggSize(v as ElongAggSize)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20mm">{ar ? "20 مم" : "20mm Agg."}</SelectItem>
                    <SelectItem value="10mm">{ar ? "10 مم" : "10mm Agg."}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} disabled={submitted} placeholder="—" />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full">
                  <Info size={12} className="inline mr-1" />
                  <strong>{ar ? "الحد الأقصى:" : "Max:"}</strong> ≤ {spec.maxLimit}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {shapeType === "FLAKINESS"
          ? renderShapeWorksheet(flakWorksheet, flakInputs, updateFlak, "flakiness")
          : renderShapeWorksheet(elongWorksheet, elongInputs, updateElong, "elongation")}

        {overallIndex !== undefined && (
          <ResultBanner
            result={overallResult}
            testName={ar ? `${spec.label} — ${aggSizeLabel}` : `${spec.label} — ${aggSizeLabel}`}
            standard={spec.standard}
          />
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
