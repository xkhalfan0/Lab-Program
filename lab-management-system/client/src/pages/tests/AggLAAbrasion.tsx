import { useState } from "react";
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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Los Angeles Abrasion Test (ASTM C131 / BS EN 1097-2) ────────────────────
// LA Abrasion Value = [(M1 - M2) / M1] × 100
//   M1 = mass of sample before test (g)
//   M2 = mass of sample retained on 1.7mm sieve after test (g)
// Acceptance limits:
//   Wearing course: LA ≤ 30%
//   Binder/Base course: LA ≤ 40%
//   Sub-base: LA ≤ 50%

// Grading groups for LA test (ASTM C131)
const GRADING_GROUPS = {
  "A": { label: "Grading A (37.5–25.0mm)", ballCount: 12, revolutions: 500 },
  "B": { label: "Grading B (25.0–19.0mm)", ballCount: 11, revolutions: 500 },
  "C": { label: "Grading C (19.0–12.5mm)", ballCount: 8, revolutions: 500 },
  "D": { label: "Grading D (12.5–9.5mm)", ballCount: 6, revolutions: 500 },
};

const USAGE_TYPES = [
  { value: "WEARING", label: "Wearing Course (طبقة الرابطة)", limit: 30 },
  { value: "BINDER", label: "Binder / Base Course (طبقة الأساس)", limit: 40 },
  { value: "SUBBASE", label: "Sub-base (طبقة الأساس الإنشائي)", limit: 50 },
];

interface LARow {
  id: string;
  sampleNo: string;
  gradingGroup: string;
  m1: string;  // mass before test (g)
  m2: string;  // mass retained on 1.7mm after test (g)
  // computed
  laValue?: number;
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): LARow {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNo: `S${index + 1}`,
    gradingGroup: "B",
    m1: "",
    m2: "",
  };
}

function computeRow(row: LARow, limit: number): LARow {
  const m1 = parseFloat(row.m1);
  const m2 = parseFloat(row.m2);
  if (!m1 || !m2 || m1 <= 0) return row;
  const laValue = parseFloat((((m1 - m2) / m1) * 100).toFixed(1));
  const result: "pass" | "fail" = laValue <= limit ? "pass" : "fail";
  return { ...row, laValue, result };
}

export default function AggLAAbrasion() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [usageType, setUsageType] = useState("WEARING");
  const [aggregateSource, setAggregateSource] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LARow[]>([newRow(0), newRow(1), newRow(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const usageSpec = USAGE_TYPES.find(u => u.value === usageType) ?? USAGE_TYPES[0];
  const limit = usageSpec.limit;

  const computedRows = rows.map(r => computeRow(r, limit));
  const validRows = computedRows.filter(r => r.laValue !== undefined);
  const avgLA = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.laValue ?? 0), 0) / validRows.length).toFixed(1))
    : undefined;

  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.result === "pass") ? "pass" : "fail";

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

  const updateRow = (id: string, field: keyof LARow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one sample result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "AGG_LA_ABRASION",
        formTemplate: "agg_la_abrasion",
        formData: { usageType, aggregateSource, samples: computedRows, avgLA, limit, overallResult },
        overallResult,
        summaryValues: {
          avgLA,
          limit,
          usageType: usageSpec.label,
          overallResult,
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
        <SampleInfoCard dist={dist} />
        {/* Header */}
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
              ASTM C131 / BS EN 1097-2 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Formula Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <Info size={12} className="inline mr-1" />
          {ar ? (
            <><strong>الصيغة (ASTM C131):</strong> قيمة LA = [(M₁ - M₂) / M₁] x 100<br />
            M₁ = كتلة العينة قبل الاختبار (جم)، M₂ = الكتلة المتبقية على منخل 1.7mm بعد 500 دورة (جم).
            حد القبول: ≤ {limit}% لـ {usageSpec.label}.</>
          ) : (
            <><strong>Formula (ASTM C131):</strong> LA Value = [(M₁ - M₂) / M₁] x 100<br />
            M₁ = mass before test (g), M₂ = mass retained on 1.7mm sieve after 500 revolutions (g).
            Acceptance limit: ≤ {limit}% for {usageSpec.label}.</>
          )}
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الاستخدام المقصود" : "Intended Use"}</Label>
                <Select value={usageType} onValueChange={setUsageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USAGE_TYPES.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مصدر الركام" : "Aggregate Source"}</Label>
                <Input value={aggregateSource} onChange={e => setAggregateSource(e.target.value)} placeholder={ar ? "اسم المحجر / المصدر" : "Quarry / source name"} />
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
                  <div><span className="font-semibold">{ar ? "الحد الأقصى:" : "Max LA Value:"}</span> ≤ {limit}%</div>
                  <div><span className="font-semibold">{ar ? "منخل بعد الاختبار:" : "Sieve after test:"}</span> 1.7mm</div>
                  {avgLA !== undefined && (
                    <div className={`font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                      {ar ? "المتوسط:" : "Average LA:"} {avgLA}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grading Groups Reference */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">{ar ? "مجموعات التدرج (ASTM C131)" : "Grading Groups (ASTM C131)"}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(GRADING_GROUPS).map(([k, g]) => (
                <div key={k} className="bg-white border border-slate-200 rounded-lg p-2 text-xs">
                  <div className="font-bold text-slate-700">{ar ? "مجموعة" : "Group"} {k}</div>
                  <div className="text-slate-500">{g.label}</div>
                  <div className="text-slate-500">{g.ballCount} {ar ? "كرة،" : "balls,"} {g.revolutions} {ar ? "دورة" : "rev."}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Samples Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج الاختبار" : "Test Results"}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length)])}>
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
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "مجموعة التدرج" : "Grading Group"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "M₁ — قبل الاختبار (جم)" : "M₁ — Before Test (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "M₂ — متبقي على 1.7mm (جم)" : "M₂ — Retained on 1.7mm (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "قيمة LA (%)" : "LA Value (%)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? `النتيجة (≤${limit}%)` : `Result (≤${limit}%)`}</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.sampleNo} onChange={e => updateRow(row.id, "sampleNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Select value={row.gradingGroup} onValueChange={v => updateRow(row.id, "gradingGroup", v)}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(GRADING_GROUPS).map(([k]) => (
                            <SelectItem key={k} value={k}>{ar ? "مجموعة" : "Group"} {k}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.m1} onChange={e => updateRow(row.id, "m1", e.target.value)} className="h-7 text-xs w-24 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.m2} onChange={e => updateRow(row.id, "m2", e.target.value)} className="h-7 text-xs w-24 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.laValue !== undefined ? (
                        <span className={`font-mono text-sm font-bold ${row.result === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.laValue}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? <PassFailBadge result={row.result} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                        disabled={rows.length <= 1}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={4} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">{ar ? "متوسط قيمة LA:" : "Average LA Value:"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgLA}%</td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <PassFailBadge result={overallResult} size="sm" />
                    </td>
                    <td className="border border-slate-200"></td>
                  </tr>
                </tfoot>
              )}
            </table>
</div>
          </CardContent>
        </Card>

        {/* Summary */}
        {validRows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <ResultBanner
                result={overallResult}
                testName={`Los Angeles Abrasion Test — ${usageSpec.label}`}
                standard="ASTM C131"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
