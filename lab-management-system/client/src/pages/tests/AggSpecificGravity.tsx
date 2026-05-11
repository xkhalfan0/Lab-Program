import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
import { Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Specific Gravity & Water Absorption (BS 812-2 / ASTM C127/C128) ─────────
const AGG_SPECS = {
  "COARSE": {
    label: "Coarse Aggregate",
    sgMin: 2.5,
    sgMax: 2.9,
    absorptionMax: 2.0, // %
    standard: "BS 812-2 / ASTM C127",
    code: "AGG_SG_COARSE",
  },
  "FINE": {
    label: "Fine Aggregate (Sand)",
    sgMin: 2.5,
    sgMax: 2.9,
    absorptionMax: 3.0,
    standard: "BS 812-2 / ASTM C128",
    code: "AGG_SG_FINE",
  },
};

type AggType = keyof typeof AGG_SPECS;

interface SgRow {
  id: string;
  sampleNo: string;
  massDryAir: string;
  massSSD: string;
  massInWater: string;
  // computed
  bulkSgOD?: number;
  bulkSgSSD?: number;
  apparentSg?: number;
  absorption?: number;
  sgResult?: "pass" | "fail" | "pending";
  absorptionResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function computeSgRow(row: SgRow, spec: typeof AGG_SPECS[AggType]): SgRow {
  const a = parseFloat(row.massDryAir); // Dry mass in air
  const b = parseFloat(row.massSSD);   // SSD mass in air
  const c = parseFloat(row.massInWater); // Mass in water

  if (!a || !b || !c) return row;

  const bulkSgOD = a / (b - c);
  const bulkSgSSD = b / (b - c);
  const apparentSg = a / (a - c);
  const absorption = ((b - a) / a) * 100;

  const sgResult: "pass" | "fail" = bulkSgOD >= spec.sgMin && bulkSgOD <= spec.sgMax ? "pass" : "fail";
  const absorptionResult: "pass" | "fail" = absorption <= spec.absorptionMax ? "pass" : "fail";
  const overall: "pass" | "fail" = sgResult === "pass" && absorptionResult === "pass" ? "pass" : "fail";

  return {
    ...row,
    bulkSgOD: parseFloat(bulkSgOD.toFixed(3)),
    bulkSgSSD: parseFloat(bulkSgSSD.toFixed(3)),
    apparentSg: parseFloat(apparentSg.toFixed(3)),
    absorption: parseFloat(absorption.toFixed(2)),
    sgResult,
    absorptionResult,
    overallResult: overall,
  };
}

function newRow(index: number): SgRow {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNo: `S${index + 1}`,
    massDryAir: "",
    massSSD: "",
    massInWater: "",
  };
}

export default function AggSpecificGravity() {
  const { user } = useAuth();
  const { lang } = useLanguage(); const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [aggType, setAggType] = useState<AggType>("COARSE");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<SgRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = AGG_SPECS[aggType];
  const computedRows = rows.map(r => computeSgRow(r, spec));
  const validRows = computedRows.filter(r => r.bulkSgOD !== undefined);

  const avgSg = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.bulkSgOD ?? 0), 0) / validRows.length).toFixed(3))
    : undefined;
  const avgAbsorption = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.absorption ?? 0), 0) / validRows.length).toFixed(2))
    : undefined;

  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

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

  const updateRow = (id: string, field: keyof SgRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة واحدة على الأقل" : "Please enter at least one result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "agg_specific_gravity",
        formData: { aggType, spec, source, rows: computedRows, avgSg, avgAbsorption, overallResult },
        overallResult,
        summaryValues: { aggType: spec.label, avgSg, avgAbsorption, overallResult },
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
          extraFields={[
            { label: "نوع الركام", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / الكثافة النوعية وامتصاص الماء" : "Aggregates / Specific Gravity & Water Absorption"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "الكثافة النوعية وامتصاص الماء" : "Specific Gravity & Water Absorption"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {spec.standard} | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>{ar ? "حفظ مسودة" : "Save Draft"}</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الركام" : "Aggregate Type"}</Label>
                <Select value={aggType} onValueChange={v => setAggType(v as AggType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AGG_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{ar ? (k === "COARSE" ? "ركام خشن" : "ركام ناعم (رمل)") : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder={ar ? "مصدر الركام" : "Aggregate source"} />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">Bulk SG (OD):</span> {spec.sgMin} – {spec.sgMax}</div>
                  <div><span className="font-semibold">Water Absorption:</span> ≤ {spec.absorptionMax}%</div>
                </div>
              </div>
            
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              </div>
          </CardContent>
        </Card>

        {/* Method Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <Info size={12} className="inline mr-1" />
          <strong>Method:</strong> A = Dry mass in air (g) | B = SSD mass in air (g) | C = Mass in water (g)<br />
          Bulk SG (OD) = A/(B-C) | Bulk SG (SSD) = B/(B-C) | Apparent SG = A/(A-C) | Absorption = (B-A)/A × 100%
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "بيانات الاختبار" : "Test Data"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                {ar ? "+ إضافة عينة" : "+ Add Sample"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "رقم العينة" : "Sample No."}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "A: جاف (جم)" : "A: Dry (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "B: مشبع جاف السطح (جم)" : "B: SSD (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "C: في الماء (جم)" : "C: In Water (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الكثافة الظاهرية (جاف)" : "Bulk SG (OD)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الكثافة الظاهرية (مشبع جاف السطح)" : "Bulk SG (SSD)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الكثافة النوعية الظاهرية" : "Apparent SG"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الامتصاص (%)" : "Absorption (%)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "النتيجة" : "Result"}</th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.sampleNo} onChange={e => updateRow(row.id, "sampleNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.massDryAir} onChange={e => updateRow(row.id, "massDryAir", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder={ar ? "—" : "—"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.massSSD} onChange={e => updateRow(row.id, "massSSD", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder={ar ? "—" : "—"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.massInWater} onChange={e => updateRow(row.id, "massInWater", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder={ar ? "—" : "—"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.bulkSgOD !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.sgResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.bulkSgOD}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.bulkSgSSD ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.apparentSg ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.absorption !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.absorptionResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.absorption}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.overallResult && row.overallResult !== "pending" ? <PassFailBadge result={row.overallResult} size="sm" /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={4} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">{ar ? "المتوسط:" : "Average:"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgSg}</td>
                    <td colSpan={2} className="border border-slate-200"></td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgAbsorption}%</td>
                    <td className="border border-slate-200 px-2 py-2 text-center"><PassFailBadge result={overallResult} size="sm" /></td>
                  </tr>
                </tfoot>
              )}
            </table>
</div>
          </CardContent>
        </Card>

        {/* Result Banner */}
        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={ar ? `الكثافة النوعية وامتصاص الماء — ${aggType === 'COARSE' ? 'ركام خشن' : 'ركام ناعم (رمل)'}` : `Specific Gravity & Water Absorption — ${spec.label}`}
            standard={spec.standard}
          />
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
