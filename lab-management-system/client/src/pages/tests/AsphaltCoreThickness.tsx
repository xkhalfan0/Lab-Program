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
  computeCoreBatches,
  createCoreBatch,
  createCoreSpecimen,
  flattenBatchesToCores,
  parseBatchesFromFormData,
  renumberBatchSpecimens,
  type CoreBatchInput,
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

const TABLE_COLS = 11;

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
  const [batches, setBatches] = useState<CoreBatchInput[]>([createCoreBatch("1")]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const computedBatches = useMemo(() => computeCoreBatches(batches), [batches]);
  const allSpecimens = useMemo(
    () => computedBatches.flatMap((b) => b.specimens),
    [computedBatches],
  );

  const coresWithCompaction = allSpecimens.filter(
    (s) =>
      parseFloat(s.refMarshallBulkSG) > 0 &&
      s.specimenVolume > 0 &&
      parseFloat(s.massInAir) > 0,
  );

  const overallAvgCompaction =
    coresWithCompaction.length > 0
      ? parseFloat(
          (
            coresWithCompaction.reduce((sum, s) => sum + s.compactionPercent, 0) /
            coresWithCompaction.length
          ).toFixed(1),
        )
      : 0;

  const avgHeight =
    allSpecimens.length > 0
      ? allSpecimens.reduce((sum, s) => sum + (parseFloat(s.heightMm) || 0), 0) /
        allSpecimens.length
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

    setBatches(parseBatchesFromFormData(fd));

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  useEffect(() => {
    if (!dist?.testSubType || params.layerType) return;
    if (dist.testSubType === "wearing_course" || dist.testSubType === "base_course") {
      setParams((p) => ({ ...p, layerType: dist.testSubType as CoreLayerType }));
    }
  }, [dist?.testSubType, params.layerType]);

  const addBatch = useCallback(() => {
    setBatches((prev) => [...prev, createCoreBatch(`batch-${Date.now()}`)]);
  }, []);

  const deleteBatch = useCallback((batchId: string) => {
    setBatches((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((b) => b.id !== batchId);
    });
  }, []);

  const updateBatchRef = useCallback((batchIdx: number, refMarshallBulkSG: string) => {
    setBatches((prev) => {
      const updated = [...prev];
      updated[batchIdx] = { ...updated[batchIdx], refMarshallBulkSG };
      return updated;
    });
  }, []);

  const addSpecimenToBatch = useCallback((batchId: string) => {
    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        const nextNum = batch.specimens.length + 1;
        return {
          ...batch,
          specimens: [
            ...batch.specimens,
            createCoreSpecimen(batch.id, nextNum),
          ],
        };
      }),
    );
  }, []);

  const deleteSpecimen = useCallback((batchId: string, specimenId: string) => {
    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== batchId) return batch;
        return {
          ...batch,
          specimens: renumberBatchSpecimens(
            batch.specimens.filter((s) => s.id !== specimenId),
          ),
        };
      }),
    );
  }, []);

  const updateSpecimen = useCallback(
    (batchIdx: number, specimenIdx: number, patch: Partial<CoreSpecimenInput>) => {
      setBatches((prev) => {
        const updated = [...prev];
        const specimens = [...updated[batchIdx].specimens];
        specimens[specimenIdx] = { ...specimens[specimenIdx], ...patch };
        updated[batchIdx] = { ...updated[batchIdx], specimens };
        return updated;
      });
    },
    [],
  );

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

    const flatCores = flattenBatchesToCores(computedBatches);

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
          batches: computedBatches.map((b) => ({
            id: b.id,
            refMarshallBulkSG: b.refMarshallBulkSG,
            specimens: b.specimens,
            averageCompaction: b.averageCompaction,
          })),
          cores: flatCores,
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
            ? "أضف مجموعة وأدخل ثقل مارشال المرجعي، ثم أضف العينات القلبية. الحجم = SSD − الماء. نسبة الدمك = (ثقل اللب ÷ المرجعي) × 100. المطابقة: متوسط الدمك 97.0%–100.5%."
            : "Add a batch and enter Ref. Marshall bulk SG, then add core specimens. Volume = SSD − Water. % Compaction = (Core SG ÷ Ref SG) × 100. Pass: overall avg 97.0%–100.5%."}
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
              <Button size="sm" variant="outline" onClick={addBatch}>
                <Plus className="w-4 h-4 mr-1" />
                {ar ? "إضافة مجموعة جديدة" : "Add New Batch"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1000px]">
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
                  <th className="border border-slate-300 px-2 py-2 bg-green-50" rowSpan={2}>
                    {ar ? "نسبة الدمك %" : "% Compaction"}
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
                {computedBatches.map((batch, batchIdx) => (
                  <Fragment key={batch.id}>
                    <tr className="bg-purple-50 border-t-2 border-purple-300">
                      <td colSpan={TABLE_COLS} className="border border-slate-300 px-3 py-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-bold text-purple-900">
                              {ar ? `المجموعة ${batchIdx + 1}` : `Batch ${batchIdx + 1}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs font-semibold text-purple-800 whitespace-nowrap">
                                {ar ? "الثقل النوعي المرجعي:" : "Ref. Marshall Bulk SG:"}
                              </Label>
                              <Input
                                type="number"
                                step="0.001"
                                value={batches[batchIdx]?.refMarshallBulkSG ?? ""}
                                onChange={(e) => updateBatchRef(batchIdx, e.target.value)}
                                className="h-8 w-24 text-xs font-bold text-center bg-white border-2 border-purple-300"
                                placeholder="2.551"
                                disabled={submitted}
                              />
                            </div>
                            {!submitted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addSpecimenToBatch(batch.id)}
                                className="h-7"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                {ar ? "إضافة عينة" : "Add Core"}
                              </Button>
                            )}
                          </div>
                          {!submitted && batches.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteBatch(batch.id)}
                              className="h-7 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {batch.specimens.length === 0 ? (
                      <tr key={`${batch.id}-empty`} className="bg-slate-50">
                        <td
                          colSpan={TABLE_COLS}
                          className="border border-slate-300 px-4 py-6 text-center text-slate-500 italic"
                        >
                          {ar
                            ? "لا توجد عينات. انقر على «إضافة عينة» لإضافة عينة أساسية."
                            : "No cores yet. Click \"Add Core\" to add a core specimen."}
                        </td>
                      </tr>
                    ) : (
                      batch.specimens.map((specimen, specimenIdx) => (
                        <tr key={specimen.id} className="hover:bg-slate-50/50">
                          <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                            {specimen.specimenNumber}
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <Input
                              type="number"
                              step="1"
                              value={batches[batchIdx]?.specimens[specimenIdx]?.heightMm ?? ""}
                              onChange={(e) =>
                                updateSpecimen(batchIdx, specimenIdx, { heightMm: e.target.value })
                              }
                              className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                              placeholder="60"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <Input
                              type="text"
                              value={batches[batchIdx]?.specimens[specimenIdx]?.spotLocation ?? ""}
                              onChange={(e) =>
                                updateSpecimen(batchIdx, specimenIdx, {
                                  spotLocation: e.target.value,
                                })
                              }
                              className={`${LAB_NUMERIC_INPUT_SM} w-20`}
                              placeholder="N/G"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <Select
                              value={batches[batchIdx]?.specimens[specimenIdx]?.offset || undefined}
                              onValueChange={(value) =>
                                updateSpecimen(batchIdx, specimenIdx, {
                                  offset: value as CoreOffset,
                                })
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
                              value={batches[batchIdx]?.specimens[specimenIdx]?.massInAir ?? ""}
                              onChange={(e) =>
                                updateSpecimen(batchIdx, specimenIdx, { massInAir: e.target.value })
                              }
                              className={LAB_NUMERIC_INPUT_SM}
                              placeholder="1688.4"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <Input
                              type="number"
                              step="0.1"
                              value={batches[batchIdx]?.specimens[specimenIdx]?.massAtSSD ?? ""}
                              onChange={(e) =>
                                updateSpecimen(batchIdx, specimenIdx, { massAtSSD: e.target.value })
                              }
                              className={LAB_NUMERIC_INPUT_SM}
                              placeholder="1690"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2">
                            <Input
                              type="number"
                              step="0.1"
                              value={batches[batchIdx]?.specimens[specimenIdx]?.massInWater ?? ""}
                              onChange={(e) =>
                                updateSpecimen(batchIdx, specimenIdx, {
                                  massInWater: e.target.value,
                                })
                              }
                              className={LAB_NUMERIC_INPUT_SM}
                              placeholder="1038.4"
                              disabled={submitted}
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {specimen.specimenVolume > 0
                              ? specimen.specimenVolume.toFixed(1)
                              : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-blue-50 font-semibold">
                            {specimen.coreBulkSG > 0 ? specimen.coreBulkSG.toFixed(3) : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center bg-green-50 font-bold">
                            {specimen.compactionPercent > 0
                              ? `${specimen.compactionPercent.toFixed(1)}%`
                              : "—"}
                          </td>
                          <td className="border border-slate-300 px-2 py-2 text-center">
                            {!submitted && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteSpecimen(batch.id, specimen.id)}
                                className="h-6 w-6 p-0"
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}

                    {batch.specimens.length > 0 && (
                      <tr key={`${batch.id}-avg`} className="bg-purple-100 font-semibold">
                        <td
                          colSpan={9}
                          className="border border-slate-300 px-3 py-2 text-right text-purple-900"
                        >
                          {ar
                            ? `متوسط المجموعة ${batchIdx + 1}:`
                            : `Batch ${batchIdx + 1} Average:`}
                        </td>
                        <td
                          colSpan={2}
                          className="border border-slate-300 px-2 py-2 text-center text-purple-900 text-base"
                        >
                          {batch.averageCompaction > 0
                            ? `${batch.averageCompaction.toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    )}

                    {batchIdx < computedBatches.length - 1 && (
                      <tr className="bg-slate-200">
                        <td colSpan={TABLE_COLS} className="border border-slate-400 h-1 p-0" />
                      </tr>
                    )}
                  </Fragment>
                ))}
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
                  <td colSpan={5} />
                  <td className="border border-slate-300 px-2 py-2 text-center bg-green-100 font-bold text-base">
                    {hasCompactionData ? `${overallAvgCompaction.toFixed(1)}%` : "—"}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td className="border border-slate-300 px-2 py-2 text-xs" colSpan={9}>
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
                    colSpan={2}
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
