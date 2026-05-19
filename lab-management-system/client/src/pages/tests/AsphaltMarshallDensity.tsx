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
import { BitumenContentFromExtraction } from "@/components/BitumenContentFromExtraction";

// ─── Bulk Specific Gravity of Compacted HMA ─────────────────────────────────
// Standard: ASTM D 2726
// Volume = SSD mass - mass in water; Gmb = mass in air / volume.

interface GmbRow {
  id: string;
  specimenNo: string;
  weightInAir: string;
  weightInWater: string;
  weightSSD: string;
  volume?: number;
  gmb?: number;
  gso?: string;
  airVoids?: number;
  vma?: number;
  vfb?: number;
}

function newRow(index: number): GmbRow {
  return {
    id: `row_${Date.now()}_${index}`,
    specimenNo: `S${index + 1}`,
    weightInAir: "",
    weightInWater: "",
    weightSSD: "",
  };
}

function computeRow(row: GmbRow, theoreticalGso: string, _bitumenPercent?: number): GmbRow {
  const wair = parseFloat(row.weightInAir);
  const wwater = parseFloat(row.weightInWater);
  const wssd = parseFloat(row.weightSSD);
  const gso = parseFloat(theoreticalGso);

  if (!wair || !wwater || !wssd || wssd <= wwater) return row;

  const volume = parseFloat((wssd - wwater).toFixed(1));
  const gmb = parseFloat((wair / volume).toFixed(3));
  const airVoids = gso > 0 ? parseFloat(((1 - gmb / gso) * 100).toFixed(1)) : 0;
  // VMA requires aggregate bulk specific gravity (Gsb); bitumen % is auto-filled from extraction for reporting.
  const vma = 0;
  const vfb = vma > 0 ? parseFloat((((vma - airVoids) / vma) * 100).toFixed(0)) : 0;

  return { ...row, volume, gmb, gso: theoreticalGso, airVoids, vma, vfb };
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
  const bitumenContent = useMemo(
    () => extractBitumenContentFromExtractionResult(bitumenExtraction),
    [bitumenExtraction],
  );

  const [rows, setRows] = useState<GmbRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [theoreticalGso, setTheoreticalGso] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    const fd = existing.formData as { specimens?: GmbRow[]; theoreticalGso?: string; notes?: string };
    if (fd.notes) setNotes(fd.notes);
    if (fd.theoreticalGso != null) {
      setTheoreticalGso(String(fd.theoreticalGso));
    } else if (fd.specimens?.[0]?.gso != null) {
      setTheoreticalGso(String(fd.specimens[0].gso));
    }
    if (Array.isArray(fd.specimens) && fd.specimens.length > 0) {
      setRows(
        fd.specimens.map((s, i) => ({
          id: s.id || `row_${Date.now()}_${i}`,
          specimenNo: s.specimenNo || `S${i + 1}`,
          weightInAir: String(s.weightInAir ?? ""),
          weightInWater: String(s.weightInWater ?? ""),
          weightSSD: String(s.weightSSD ?? ""),
        })),
      );
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const computedRows = rows.map((r) => computeRow(r, theoreticalGso, bitumenContent));
  const validRows = computedRows.filter(r => r.gmb !== undefined);
  const avgGmb =
    validRows.length > 0
      ? parseFloat((validRows.reduce((s, r) => s + (r.gmb ?? 0), 0) / validRows.length).toFixed(3))
      : undefined;
  const avgAirVoids =
    validRows.length > 0
      ? validRows.reduce((sum, r) => sum + (r.airVoids ?? 0), 0) / validRows.length
      : 0;
  const avgVMA =
    validRows.length > 0
      ? validRows.reduce((sum, r) => sum + (r.vma ?? 0), 0) / validRows.length
      : 0;
  const avgVFB =
    validRows.length > 0
      ? validRows.reduce((sum, r) => sum + (r.vfb ?? 0), 0) / validRows.length
      : 0;
  const airVoidsMin = 3;
  const airVoidsMax = 5;
  const vmaMin = 13;
  const airVoidsPass = avgAirVoids >= airVoidsMin && avgAirVoids <= airVoidsMax;
  const vmaPass = avgVMA >= vmaMin;
  const overallResult = validRows.length > 0 && airVoidsPass && vmaPass ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof GmbRow, value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one specimen result");
      return;
    }
    if (status === "submitted" && !parseFloat(theoreticalGso)) {
      toast.error(ar ? "الرجاء إدخال Gso لحساب الفراغات الهوائية" : "Please enter Gso for Air Voids calculations");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_MARSHALL_DENSITY",
        formTemplate: "asphalt_marshall_density",
        formData: {
          specimens: computedRows,
          theoreticalGso,
          bitumenContent,
          avgGmb,
          avgAirVoids: avgAirVoids.toFixed(1),
          avgVMA: avgVMA.toFixed(1),
          avgVFB: avgVFB.toFixed(0),
        },
        overallResult,
        summaryValues: {
          bitumenContent,
          avgGmb: avgGmb?.toFixed(3),
          avgAirVoids: avgAirVoids.toFixed(1),
          avgVMA: avgVMA.toFixed(1),
          avgVFB: avgVFB.toFixed(0),
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
        <div className="p-6">
          <div className="text-center text-red-600">
            {lang === "ar" ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
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
          extraFields={[{ label: "Mix type / نوع الخلطة", value: dist?.testSubType }]}
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

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2 text-sm text-blue-800">
              <FlaskConical size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">
                  {ar ? "الثقل النوعي الظاهري وتحليل الفراغات" : "Bulk Specific Gravity and Air Voids Analysis"}
                </p>
                <p className="text-xs">
                  {ar
                    ? "الصيغ: الحجم = كتلة SSD - الكتلة في الماء، و Gmb = الكتلة في الهواء ÷ الحجم"
                    : "Formulas: Volume = SSD Mass - Mass in Water, and Gmb = Mass in Air ÷ Volume"}
                </p>
                <p className="text-xs mt-1">
                  {ar
                    ? "Gso مطلوب لحساب الفراغات الهوائية. محتوى البيتومين يُملأ تلقائياً من استخلاص البيتومين عند توفره."
                    : "Gso is required for Air Voids. Bitumen content auto-fills from Bitumen Extraction when available."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <BitumenContentFromExtraction
          lang={lang}
          bitumenContent={bitumenContent}
          extractionDistributionCode={bitumenExtraction?.testTypeCode ?? null}
        />

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <UserCheck size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج العينات" : "Specimen Results"}</CardTitle>
              {!submitted && (
                <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                  <Plus size={14} className="mr-1" /> {ar ? "إضافة عينة" : "Add Specimen"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 max-w-sm">
              <Label className="text-xs text-slate-600">
                {ar ? "الثقل النوعي النظري الأقصى (Gso)" : "Theoretical Maximum Specific Gravity (Gso)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                value={theoreticalGso}
                onChange={(e) => setTheoreticalGso(e.target.value)}
                className="h-8 text-sm"
                placeholder={ar ? "مثال: 2.5" : "e.g., 2.5"}
                disabled={submitted}
              />
              <p className="text-xs text-slate-500 mt-1">
                {ar
                  ? "مطلوب لحساب الفراغات الهوائية وVMA"
                  : "Required for Air Voids and VMA calculations"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">
                      {ar ? "رقم العينة" : "Spec."}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">
                      {ar ? "الكتلة في الهواء (جم)" : "Wt. Air (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">
                      {ar ? "الكتلة في الماء (جم)" : "Wt. Water (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600">
                      {ar ? "كتلة SSD (جم)" : "SSD (g)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 bg-blue-50">
                      {ar ? "الحجم (سم³)" : "Volume (cm³)"}
                    </th>
                    <th className="border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 bg-blue-50">
                      Gmb
                    </th>
                    <th className="border border-slate-200 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.specimenNo}
                          onChange={e => updateRow(row.id, "specimenNo", e.target.value)}
                          className="h-7 text-xs w-16"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.weightInAir}
                          onChange={e => updateRow(row.id, "weightInAir", e.target.value)}
                          className="h-7 text-xs w-28 text-center font-mono"
                          placeholder="—"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.weightInWater}
                          onChange={e => updateRow(row.id, "weightInWater", e.target.value)}
                          className="h-7 text-xs w-28 text-center font-mono"
                          placeholder="—"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.weightSSD}
                          onChange={e => updateRow(row.id, "weightSSD", e.target.value)}
                          className="h-7 text-xs w-28 text-center font-mono"
                          placeholder="—"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                        {row.volume !== undefined ? row.volume.toFixed(1) : "—"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {row.gmb !== undefined ? (
                          <span className="font-mono text-xs font-bold text-blue-700">{row.gmb.toFixed(3)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {!submitted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                            disabled={rows.length <= 1}
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold">
                      <td colSpan={5} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">
                        {ar ? "متوسط Gmb:" : "Average Gmb:"}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold text-blue-700">
                        {avgGmb?.toFixed(3) ?? "—"}
                      </td>
                      <td className="border border-slate-200"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {ar ? "تحليل الفراغات الهوائية" : "Air Voids Analysis"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border border-slate-300 px-2 py-1">
                        {ar ? "رقم العينة" : "Specimen #"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1">
                        {ar ? "Gso" : "Gso"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1">
                        {ar ? "الفراغات الهوائية %" : "% Air Voids"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1">
                        {ar ? "الفراغات في الركام المعدني" : "VMA"}
                      </th>
                      <th className="border border-slate-300 px-2 py-1">
                        {ar ? "الفراغات المملوءة بالإسفلت" : "VFB"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row, idx) => (
                      <tr key={row.id}>
                        <td className="border border-slate-300 px-2 py-1 text-center">
                          {row.specimenNo || `S${idx + 1}`}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center bg-slate-50">
                          {row.gso || "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center bg-blue-50">
                          {row.airVoids !== undefined ? `${row.airVoids.toFixed(1)}%` : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center bg-blue-50">
                          {row.vma !== undefined ? row.vma.toFixed(1) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center bg-blue-50">
                          {row.vfb !== undefined ? row.vfb.toFixed(0) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs">
                <div className="flex flex-wrap gap-4">
                  <div className={`px-2 py-1 rounded ${airVoidsPass ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    {ar ? "حد الفراغات الهوائية" : "Air Voids Spec"}: 3 - 5%
                    <span className="font-semibold ml-1">
                      (Avg: {avgAirVoids.toFixed(1)}%)
                    </span>
                    {airVoidsPass ? " ✓" : " ✗"}
                  </div>
                  <div className={`px-2 py-1 rounded ${vmaPass ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                    {ar ? "حد VMA الأدنى" : "VMA Min"}: 13
                    <span className="font-semibold ml-1">
                      (Avg: {avgVMA.toFixed(1)})
                    </span>
                    {vmaPass ? " ✓" : " ✗"}
                  </div>
                </div>
                <p className="text-slate-500 mt-2">
                  {ar
                    ? "ملاحظة: VMA قيمة مؤقتة حتى اعتماد صيغة المختبر ومدخلات الركام والبيتومين."
                    : "Note: VMA is a placeholder until the lab confirms the formula and required aggregate/binder inputs."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {validRows.length > 0 && avgGmb != null && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-blue-600 mb-2">{ar ? "متوسط Gmb" : "Average Gmb"}</p>
                  <p className="text-2xl font-bold text-blue-700">{avgGmb.toFixed(3)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600 mb-2">{ar ? "متوسط الفراغات" : "Average Air Voids"}</p>
                  <p className="text-2xl font-bold text-slate-800">{avgAirVoids.toFixed(1)}%</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600 mb-2">{ar ? "متوسط VMA" : "Average VMA"}</p>
                  <p className="text-2xl font-bold text-slate-800">{avgVMA.toFixed(1)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600 mb-2">{ar ? "متوسط VFB" : "Average VFB"}</p>
                  <p className="text-2xl font-bold text-slate-800">{avgVFB.toFixed(0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

