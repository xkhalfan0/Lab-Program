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

// ─── Aggregate Crushing Value (ACV) & Impact Value (AIV) ─────────────────────
// ACV (BS 812-110): ACV = (M2 / M1) × 100
//   M1 = mass of oven-dry sample (g)
//   M2 = mass passing 2.36mm sieve after crushing (g)
//   Acceptance: ACV ≤ 30% (wearing course), ≤ 45% (other uses)
//
// AIV (BS 812-112): AIV = (M2 / M1) × 100
//   M1 = mass of oven-dry sample (g)
//   M2 = mass passing 2.36mm sieve after 15 blows (g)
//   Acceptance: AIV ≤ 30% (wearing course), ≤ 45% (other uses)

type TestType = "ACV" | "AIV";

const TEST_SPECS = {
  "ACV": {
    label: "Aggregate Crushing Value (ACV)",
    standard: "BS 812-110",
    code: "AGG_CRUSHING",
    sieveMm: 2.36,
    limitWearing: 30,
    limitOther: 45,
    description: "ACV = (M₂ / M₁) × 100",
  },
  "AIV": {
    label: "Aggregate Impact Value (AIV)",
    standard: "BS 812-112",
    code: "AGG_IMPACT",
    sieveMm: 2.36,
    limitWearing: 30,
    limitOther: 45,
    description: "AIV = (M₂ / M₁) × 100 — 15 blows of 13.5 kg hammer",
  },
};

const USAGE_TYPES = [
  { value: "WEARING", label: "Wearing Course (طبقة الرابطة)", limit: 30 },
  { value: "BINDER", label: "Binder / Base Course (طبقة الأساس)", limit: 45 },
  { value: "SUBBASE", label: "Sub-base (طبقة الأساس الإنشائي)", limit: 45 },
];

interface TestRow {
  id: string;
  sampleNo: string;
  m1: string;   // mass of oven-dry sample (g)
  m2: string;   // mass passing sieve after test (g)
  // computed
  value?: number;  // ACV or AIV (%)
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): TestRow {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNo: `S${index + 1}`,
    m1: "",
    m2: "",
  };
}

function computeRow(row: TestRow, limit: number): TestRow {
  const m1 = parseFloat(row.m1);
  const m2 = parseFloat(row.m2);
  if (!m1 || !m2 || m1 <= 0) return row;
  const value = parseFloat(((m2 / m1) * 100).toFixed(1));
  const result: "pass" | "fail" = value <= limit ? "pass" : "fail";
  return { ...row, value, result };
}

export default function AggCrushingImpact() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [testType, setTestType] = useState<TestType>("ACV");
  const [usageType, setUsageType] = useState("WEARING");
  const [aggregateSource, setAggregateSource] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<TestRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = TEST_SPECS[testType];
  const usageSpec = USAGE_TYPES.find(u => u.value === usageType) ?? USAGE_TYPES[0];
  const limit = usageSpec.limit;

  const computedRows = rows.map(r => computeRow(r, limit));
  const validRows = computedRows.filter(r => r.value !== undefined);
  const avgValue = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.value ?? 0), 0) / validRows.length).toFixed(1))
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
    onError: (e) => toast.error(ar ? "حدث خطأ: " + e.message : e.message),
  });

  const updateRow = (id: string, field: keyof TestRow, value: string) => {
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
        testTypeCode: spec.code,
        formTemplate: testType === "ACV" ? "agg_crushing" : "agg_impact",
        formData: { testType, spec, usageType, aggregateSource, samples: computedRows, avgValue, limit, overallResult },
        overallResult,
        summaryValues: {
          testType: spec.label,
          avgValue,
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
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "Test subtype / نوع الاختبار", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الركام / الخصائص الميكانيكية" : "Aggregate Tests / Mechanical Properties"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? (testType === "ACV" ? "قيمة التكسير للركام (ACV)" : "قيمة الصدم للركام (AIV)") : (testType === "ACV" ? "Aggregate Crushing Value (ACV)" : "Aggregate Impact Value (AIV)")}
            </h1>
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

        {/* Formula Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <Info size={12} className="inline mr-1" />
          <strong>{ar ? "الصيغة" : "Formula"} ({spec.standard}):</strong> {spec.description}<br />
          M₁ = {ar ? "كتلة العينة الجافة بالفرن (جم)" : "mass of oven-dry sample (g)"}, M₂ = {ar ? "الكتلة المارة من منخل" : "mass passing"} {spec.sieveMm}mm {ar ? "بعد الاختبار (جم)" : "sieve after test (g)"}.
          {ar ? "حد القبول:" : "Acceptance limit:"} ≤ {limit}% {ar ? "لـ" : "for"} {usageSpec.label}.
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الاختبار" : "Test Type"}</Label>
                <Select value={testType} onValueChange={v => setTestType(v as TestType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACV">ACV — {ar ? "قيمة التكسير" : "Crushing Value"}</SelectItem>
                    <SelectItem value="AIV">AIV — {ar ? "قيمة الصدم" : "Impact Value"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  <div><span className="font-semibold">{ar ? "المعيار:" : "Standard:"}</span> {spec.standard}</div>
                  <div><span className="font-semibold">{ar ? "حجم المنخل:" : "Sieve size:"}</span> {spec.sieveMm}mm</div>
                  <div><span className="font-semibold">{ar ? "الحد الأقصى:" : "Max limit:"}</span> ≤ {limit}%</div>
                  {avgValue !== undefined && (
                    <div className={`font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                      {ar ? "المتوسط:" : "Average:"} {avgValue}%
                    </div>
                  )}
                </div>
              </div>
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
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "M₁ — قبل الاختبار (جم)" : "M₁ — Before Test (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? `M₂ — المار من ${spec.sieveMm} مم (جم)` : `M₂ — Passing ${spec.sieveMm}mm (g)`}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{testType} (%)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? `النتيجة (≤${limit}%)` : `Result (≤${limit}%)`}</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.sampleNo} onChange={e => updateRow(row.id, "sampleNo", e.target.value)} className="h-7 text-xs w-14" placeholder={ar ? "رقم العينة" : "Sample No."} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.m1} onChange={e => updateRow(row.id, "m1", e.target.value)} className="h-7 text-xs w-24 text-center font-mono" placeholder={ar ? "الكتلة (جم)" : "Mass (g)"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.m2} onChange={e => updateRow(row.id, "m2", e.target.value)} className="h-7 text-xs w-24 text-center font-mono" placeholder={ar ? "الكتلة (جم)" : "Mass (g)"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.value !== undefined ? (
                        <span className={`font-mono text-sm font-bold ${row.result === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.value}%
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
                    <td colSpan={3} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">{ar ? `متوسط ${testType}:` : `Average ${testType}:`}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgValue}%</td>
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
                testName={`${spec.label} — ${usageSpec.label}`}
                standard={spec.standard}
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
