import { useState, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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

// ─── Bulk Specific Gravity (Gmb) Test ───────────────────────────────────────
// Standard: ASTM T 166
// Formula: Gmb = W_air / (W_SSD - W_water)

interface GmbRow {
  id: string;
  specimenNo: string;
  weightInAir: string;
  weightInWater: string;
  weightSSD: string;
  volume?: number;
  gmb?: number;
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

function computeRow(row: GmbRow): GmbRow {
  const wair = parseFloat(row.weightInAir);
  const wwater = parseFloat(row.weightInWater);
  const wssd = parseFloat(row.weightSSD);

  if (!wair || !wwater || !wssd || wssd <= wwater) return row;

  const volume = wssd - wwater;
  const gmb = parseFloat((wair / volume).toFixed(3));

  return { ...row, volume: parseFloat(volume.toFixed(1)), gmb };
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

  const [rows, setRows] = useState<GmbRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as { specimens?: GmbRow[]; notes?: string };
    if (fd.notes) setNotes(fd.notes);
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

  const computedRows = rows.map(r => computeRow(r));
  const validRows = computedRows.filter(r => r.gmb !== undefined);
  const avgGmb =
    validRows.length > 0
      ? parseFloat((validRows.reduce((s, r) => s + (r.gmb ?? 0), 0) / validRows.length).toFixed(3))
      : undefined;

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
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_MARSHALL_DENSITY",
        formTemplate: "asphalt_marshall_density",
        formData: {
          specimens: computedRows,
          avgGmb,
        },
        overallResult: "pass",
        summaryValues: { avgGmb },
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
              <span>{ar ? "اختبارات الأسفلت / الكثافة الحجمية" : "Asphalt Tests / Bulk Density"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "الكثافة الحجمية للخلطة المدموكة (Gmb)" : "Bulk Specific Gravity of Compacted HMA (Gmb)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM T 166 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <p className="font-semibold mb-1">{ar ? "الكثافة الحجمية (Gmb)" : "Bulk Specific Gravity (Gmb)"}</p>
                <p className="text-xs">
                  {ar
                    ? "الصيغة: Gmb = الوزن في الهواء ÷ (الوزن SSD - الوزن في الماء)"
                    : "Formula: Gmb = Weight in Air ÷ (SSD Weight - Weight in Water)"}
                </p>
                <p className="text-xs mt-1">
                  {ar
                    ? "هذه القيمة تُستخدم في حساب اختبار مارشال (الاستقرار والتدفق)"
                    : "This value is used in Marshall Stability & Flow test calculations"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {ar ? "رقم العينة" : "Specimen No."}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {ar ? "الوزن في الهواء (جم)" : "Weight in Air (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {ar ? "الوزن في الماء (جم)" : "Weight in Water (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {ar ? "الوزن SSD (جم)" : "SSD Weight (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      {ar ? "الحجم (سم³)" : "Volume (cm³)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
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

        {validRows.length > 0 && avgGmb != null && (
          <Card>
            <CardContent className="pt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-600 mb-2">{ar ? "متوسط الكثافة الحجمية" : "Average Bulk Specific Gravity"}</p>
                <p className="text-3xl font-bold text-blue-700">{avgGmb.toFixed(3)}</p>
                <p className="text-xs text-blue-600 mt-2">
                  {ar
                    ? "استخدم هذه القيمة في اختبار مارشال (الاستقرار والتدفق)"
                    : "Use this value in Marshall Stability & Flow test"}
                </p>
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
