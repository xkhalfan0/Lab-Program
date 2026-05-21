/**
 * HMA Pavement Thickness, Bulk Specific Gravity and Compaction Test
 * ASTM D3549, ASTM D2726, BS EN 12697-36
 */
import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import {
  CORE_COMPACTION_MIN,
  CORE_COMPACTION_MAX,
  computeCoreSpecimen,
  createCoreSpecimen,
  buildCoreBatchTableLayout,
  type CoreLayerType,
  type CoreOffset,
  type CoreSpecimenInput,
} from "@/lib/asphaltCoreCompaction";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

interface TestParams {
  layerType: CoreLayerType | "";
  roadLocation: string;
}

const TEST_TITLE_EN =
  "HMA Pavement Thickness, Bulk Specific Gravity and Compaction Test (ASTM D 3549, D 2726)";
const TEST_TITLE_AR =
  "اختبار سماكة الرصف HMA والثقل النوعي الظاهري ونسبة الدمك (ASTM D 3549, D 2726)";

function renumberCores(list: CoreSpecimenInput[]): CoreSpecimenInput[] {
  return list.map((c, i) => ({ ...c, specimenNumber: i + 1 }));
}

export default function AsphaltCoreThickness() {
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

  const [params, setParams] = useState<TestParams>({ layerType: "", roadLocation: "" });
  const [cores, setCores] = useState<CoreSpecimenInput[]>([createCoreSpecimen("1", 1)]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const computedCores = useMemo(() => cores.map(computeCoreSpecimen), [cores]);
  const { sortedCores, batches, coreIdToBatch } = useMemo(
    () => buildCoreBatchTableLayout(computedCores),
    [computedCores],
  );

  const coresWithCompaction = computedCores.filter(
    (c) => parseFloat(c.refMarshallBulkSG) > 0 && c.specimenVolume > 0 && parseFloat(c.massInAir) > 0,
  );

  const overallAvgCompaction =
    coresWithCompaction.length > 0
      ? parseFloat(
          (
            coresWithCompaction.reduce((sum, c) => sum + c.compactionPercent, 0) /
            coresWithCompaction.length
          ).toFixed(1),
        )
      : 0;

  const avgHeight =
    computedCores.length > 0
      ? computedCores.reduce((sum, c) => sum + (parseFloat(c.heightMm) || 0), 0) / computedCores.length
      : 0;

  const hasCompactionData = coresWithCompaction.length > 0;
  const compactionPass =
    hasCompactionData &&
    overallAvgCompaction >= CORE_COMPACTION_MIN &&
    overallAvgCompaction <= CORE_COMPACTION_MAX;

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

    const layer = (fd.layerType ?? fd.coreType) as string | undefined;
    if (layer === "wearing_course" || layer === "base_course") {
      setParams((p) => ({ ...p, layerType: layer }));
    } else if (layer === "ACWC") {
      setParams((p) => ({ ...p, layerType: "wearing_course" }));
    } else if (layer === "ACBC" || layer === "BASE") {
      setParams((p) => ({ ...p, layerType: "base_course" }));
    }

    const road = fd.roadLocation ?? fd.roadName;
    if (road != null) setParams((p) => ({ ...p, roadLocation: String(road) }));

    const savedCores = fd.cores as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(savedCores) && savedCores.length > 0) {
      setCores(
        savedCores.map((c, i) => ({
          id: String(c.id ?? i + 1),
          specimenNumber: Number(c.specimenNumber ?? i + 1),
          heightMm: String(c.heightMm ?? c.avgThickness ?? ""),
          spotLocation: String(c.spotLocation ?? c.location ?? ""),
          offset: (c.offset as CoreOffset) ?? "",
          massInAir: String(c.massInAir ?? c.weightInAir ?? ""),
          massAtSSD: String(c.massAtSSD ?? c.weightSSD ?? ""),
          massInWater: String(c.massInWater ?? c.weightInWater ?? ""),
          refMarshallBulkSG: String(
            c.refMarshallBulkSG ?? fd.marshallDensity ?? fd.marshallDensityStr ?? "",
          ),
        })),
      );
    }

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  useEffect(() => {
    if (!dist?.testSubType || params.layerType) return;
    if (dist.testSubType === "wearing_course" || dist.testSubType === "base_course") {
      setParams((p) => ({ ...p, layerType: dist.testSubType as CoreLayerType }));
    }
  }, [dist?.testSubType, params.layerType]);

  const addCore = useCallback(() => {
    setCores((prev) => {
      const next = createCoreSpecimen(String(prev.length + 1), prev.length + 1);
      return renumberCores([...prev, next]);
    });
  }, []);

  const removeCore = useCallback((id: string) => {
    setCores((prev) => renumberCores(prev.filter((c) => c.id !== id)));
  }, []);

  const updateCore = useCallback((index: number, patch: Partial<CoreSpecimenInput>) => {
    setCores((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (!params.layerType) {
      toast.error(ar ? "الرجاء اختيار نوع الطبقة" : "Please select layer type");
      return;
    }
    if (status === "submitted" && !hasCompactionData) {
      toast.error(
        ar
          ? "الرجاء إدخال كتل العينة والثقل النوعي المرجعي لعينة واحدة على الأقل"
          : "Enter specimen masses and ref. Marshall bulk SG for at least one core",
      );
      return;
    }

    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_CORE",
        formTemplate: "asphalt_core",
        formData: {
          layerType: params.layerType,
          roadLocation: params.roadLocation,
          cores: computedCores,
          batches: batches.map((b) => ({
            refMarshallBulkSG: b.refMarshallBulkSG,
            specimenCount: b.specimens.length,
            averageCompaction: b.averageCompaction,
          })),
          averages: {
            thickness: parseFloat(avgHeight.toFixed(0)),
            compaction: parseFloat(overallAvgCompaction.toFixed(1)),
          },
          compactionPass,
          specLimits: { min: CORE_COMPACTION_MIN, max: CORE_COMPACTION_MAX },
        },
        overallResult: !hasCompactionData ? "pending" : compactionPass ? "pass" : "fail",
        summaryValues: {
          avgThickness: parseFloat(avgHeight.toFixed(0)),
          avgCompaction: parseFloat(overallAvgCompaction.toFixed(1)),
          overallResult: compactionPass ? "pass" : "fail",
          layerType: params.layerType,
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
              <span>{ar ? "اختبارات الأسفلت / عينات قلبية" : "Asphalt / Core Specimens"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? TEST_TITLE_AR : TEST_TITLE_EN}
            </h1>
            <p className="text-slate-500 text-sm mt-1">ASTM D3549 · ASTM D2726 · BS EN 12697-36</p>
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
            ? "الحجم = SSD − الماء. الثقل النوعي = في الهواء ÷ الحجم. نسبة الدمك = (ثقل اللب ÷ ثقل مارشال المرجعي) × 100. المطابقة: متوسط الدمك 97.0%–100.5%."
            : "Volume = SSD − Water. Bulk SG = In Air ÷ Volume. % Compaction = (Core SG ÷ Ref Marshall SG) × 100. Pass: overall avg 97.0%–100.5%."}
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "معلومات الاختبار" : "Test Information"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">{ar ? "نوع الطبقة *" : "Layer Type *"}</Label>
                <Select
                  value={params.layerType || undefined}
                  onValueChange={(value) =>
                    setParams({ ...params, layerType: value as CoreLayerType })
                  }
                  disabled={submitted}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={ar ? "اختر النوع..." : "Select type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wearing_course">
                      {ar ? "ACWC (طبقة التآكل)" : "ACWC (Wearing Course)"}
                    </SelectItem>
                    <SelectItem value="base_course">
                      {ar ? "طبقة الأساس الإسفلتية" : "Asphalt Base Course"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{ar ? "الطريق / الموقع" : "Road / Location"}</Label>
                <Input
                  value={params.roadLocation}
                  onChange={(e) => setParams({ ...params, roadLocation: e.target.value })}
                  className="h-9"
                  placeholder={ar ? "اسم الطريق أو السلسلة" : "Road name or chainage"}
                  disabled={submitted}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "نتائج العينات الأساسية" : "Core Results"}
            </CardTitle>
            {!submitted && (
              <Button size="sm" variant="outline" onClick={addCore}>
                <Plus className="w-4 h-4 mr-1" />
                {ar ? "إضافة عينة" : "Add Core"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "رقم العينة" : "Specimen #"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "الارتفاع (mm)" : "Height (mm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "موقع النقطة" : "Spot Location"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "الإزاحة" : "Offset"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-yellow-50" colSpan={3}>
                    {ar ? "كتلة العينة" : "Mass of Specimen"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-blue-50" colSpan={2}>
                    {ar ? "النتائج" : "Results"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "الثقل النوعي المرجعي" : "Ref. Marshall Bulk SG"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-green-50" rowSpan={2}>
                    {ar ? "نسبة الدمك %" : "% Compaction"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-purple-50" rowSpan={2}>
                    {ar ? "متوسط المجموعة %" : "Batch Avg %"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2" rowSpan={2}>
                    {ar ? "الإجراء" : "Action"}
                  </th>
                </tr>
                <tr>
                  <th className="border border-slate-300 px-2 py-1 text-xs bg-yellow-50">
                    {ar ? "في الهواء (gm)" : "In Air (gm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-xs bg-yellow-50">
                    {ar ? "في SSD (gm)" : "at SSD (gm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-xs bg-yellow-50">
                    {ar ? "في الماء (gm)" : "In Water (gm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-xs bg-blue-50">
                    {ar ? "الحجم (cm³)" : "Volume (cm³)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-xs bg-blue-50">
                    {ar ? "الثقل النوعي" : "Core Bulk SG"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedCores.map((core, rowIdx) => {
                  const coreIdx = cores.findIndex((c) => c.id === core.id);
                  const batch = coreIdToBatch.get(core.id);
                  const isFirstInBatch = batch?.specimens[0]?.id === core.id;
                  const isLastInBatch =
                    batch?.specimens[batch.specimens.length - 1]?.id === core.id;
                  const batchHasAvg = batch && batch.rowCount > 0 && batch.averageCompaction > 0;

                  return (
                    <Fragment key={core.id}>
                      {isFirstInBatch && rowIdx > 0 && (
                        <tr className="bg-slate-200">
                          <td
                            colSpan={13}
                            className="border border-slate-400 px-2 py-0.5 h-1"
                          />
                        </tr>
                      )}
                      <tr
                        className={
                          batch
                            ? isFirstInBatch
                              ? "border-t-2 border-t-purple-300"
                              : isLastInBatch
                                ? "border-b-2 border-b-purple-300"
                                : ""
                            : ""
                        }
                      >
                        <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                          {core.specimenNumber}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="1"
                            value={cores[coreIdx]?.heightMm ?? ""}
                            onChange={(e) => updateCore(coreIdx, { heightMm: e.target.value })}
                            className="h-7 text-xs w-16"
                            placeholder="60"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="text"
                            value={cores[coreIdx]?.spotLocation ?? ""}
                            onChange={(e) =>
                              updateCore(coreIdx, { spotLocation: e.target.value })
                            }
                            className="h-7 text-xs w-20"
                            placeholder="N/G"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Select
                            value={cores[coreIdx]?.offset || undefined}
                            onValueChange={(value) =>
                              updateCore(coreIdx, { offset: value as CoreOffset })
                            }
                            disabled={submitted}
                          >
                            <SelectTrigger className="h-7 text-xs w-20">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LHS">LHS</SelectItem>
                              <SelectItem value="CA">CA</SelectItem>
                              <SelectItem value="RHS">RHS</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={cores[coreIdx]?.massInAir ?? ""}
                            onChange={(e) => updateCore(coreIdx, { massInAir: e.target.value })}
                            className={LAB_NUMERIC_INPUT_SM}
                            placeholder="1688.4"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={cores[coreIdx]?.massAtSSD ?? ""}
                            onChange={(e) => updateCore(coreIdx, { massAtSSD: e.target.value })}
                            className={LAB_NUMERIC_INPUT_SM}
                            placeholder="1690"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={cores[coreIdx]?.massInWater ?? ""}
                            onChange={(e) =>
                              updateCore(coreIdx, { massInWater: e.target.value })
                            }
                            className={LAB_NUMERIC_INPUT_SM}
                            placeholder="1038.4"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {core.specimenVolume > 0 ? core.specimenVolume.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                          {core.coreBulkSG > 0 ? core.coreBulkSG.toFixed(3) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-2">
                          <Input
                            type="number"
                            step="0.001"
                            value={cores[coreIdx]?.refMarshallBulkSG ?? ""}
                            onChange={(e) =>
                              updateCore(coreIdx, { refMarshallBulkSG: e.target.value })
                            }
                            className={`${LAB_NUMERIC_INPUT_SM} min-w-[72px]`}
                            placeholder="2.551"
                            disabled={submitted}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-2 text-center bg-green-50 font-bold">
                          {core.compactionPercent > 0
                            ? `${core.compactionPercent.toFixed(1)}%`
                            : "—"}
                        </td>
                        {isFirstInBatch && batch ? (
                          <td
                            rowSpan={batch.rowCount}
                            className="border border-slate-300 px-2 py-2 text-center bg-purple-50 font-bold align-middle"
                          >
                            <div className="flex flex-col items-center justify-center gap-1 min-h-[48px]">
                              <span className="text-base">
                                {batchHasAvg
                                  ? `${batch.averageCompaction.toFixed(1)}%`
                                  : "—"}
                              </span>
                              <span className="text-[10px] text-purple-700 font-normal">
                                ({batch.rowCount}{" "}
                                {ar ? "عينات" : batch.rowCount === 1 ? "core" : "cores"})
                              </span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                SG {batch.refMarshallBulkSG.toFixed(3)}
                              </span>
                            </div>
                          </td>
                        ) : !batch ? (
                          <td className="border border-slate-300 px-2 py-2 text-center bg-purple-50 text-slate-400">
                            —
                          </td>
                        ) : null}
                        <td className="border border-slate-300 px-2 py-2 text-center">
                          {cores.length > 1 && !submitted && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeCore(core.id)}
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-semibold">
                <tr>
                  <td className="border border-slate-300 px-2 py-2" colSpan={2}>
                    {ar ? "المتوسط الكلي" : "Overall Average"}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-center" colSpan={2}>
                    {ar ? "السُمك:" : "Thickness:"}{" "}
                    {avgHeight > 0 ? `${avgHeight.toFixed(0)} mm` : "—"}
                  </td>
                  <td colSpan={6} />
                  <td className="border border-slate-300 px-2 py-2 text-center bg-green-100 font-bold text-base">
                    {hasCompactionData ? `${overallAvgCompaction.toFixed(1)}%` : "—"}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-center bg-purple-100 text-xs">
                    {batches.length > 0
                      ? `${batches.length} ${ar ? "مجموعات" : batches.length === 1 ? "batch" : "batches"}`
                      : "—"}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td className="border border-slate-300 px-2 py-2 text-xs" colSpan={10}>
                    {ar ? "حدود المواصفات:" : "Specification Limits:"}
                  </td>
                  <td
                    className={`border border-slate-300 px-2 py-2 text-center text-xs ${
                      !hasCompactionData
                        ? ""
                        : compactionPass
                          ? "bg-green-200 text-green-900"
                          : "bg-red-200 text-red-900"
                    }`}
                    colSpan={3}
                  >
                    {CORE_COMPACTION_MIN.toFixed(1)}% Min – {CORE_COMPACTION_MAX.toFixed(1)}% Max
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {hasCompactionData && (
          <Card>
            <CardContent className="pt-6">
              <div
                className={`p-6 rounded-lg border-2 text-center ${
                  compactionPass
                    ? "bg-green-50 border-green-500 text-green-900"
                    : "bg-red-50 border-red-500 text-red-900"
                }`}
              >
                <div className="text-3xl font-bold mb-2">
                  {compactionPass
                    ? ar
                      ? "✓ مطابق"
                      : "✓ PASS"
                    : ar
                      ? "✗ غير مطابق"
                      : "✗ FAIL"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">
                      {ar ? "متوسط الارتفاع:" : "Average Thickness:"}
                    </div>
                    <div className="text-lg font-bold">
                      {avgHeight > 0 ? `${avgHeight.toFixed(0)} mm` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {ar ? "متوسط نسبة الدمك:" : "Average Compaction:"}
                    </div>
                    <div className="text-lg font-bold">{overallAvgCompaction.toFixed(1)}%</div>
                  </div>
                </div>
                {!compactionPass && (
                  <div className="text-sm mt-3">
                    {ar
                      ? `متوسط نسبة الدمك خارج الحد (${CORE_COMPACTION_MIN.toFixed(1)}% - ${CORE_COMPACTION_MAX.toFixed(1)}%)`
                      : `Average compaction out of spec (${CORE_COMPACTION_MIN.toFixed(1)}% - ${CORE_COMPACTION_MAX.toFixed(1)}%)`}
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
