/**
 * AsphaltHotBin — Hot Bin Gradation Test for Asphalt Mix
 * Standard: JKR/SPJ/2008-S4 (Malaysia) / BS EN 13108-1 / ASTM D3515
 *
 * Purpose: Verify that the combined aggregate gradation from hot bins
 * matches the job mix formula (JMF) and falls within specification limits.
 *
 * Sieve sizes for ACWC (Wearing Course):
 *   26.5, 19.0, 13.2, 9.5, 6.3, 4.75, 2.36, 1.18, 0.600, 0.300, 0.150, 0.075 mm
 *
 * For each sieve: % Passing = (cumulative mass retained / total mass) × 100
 * The combined gradation is plotted against JMF ± tolerance limits.
 */
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer, UserCheck, BarChart2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Sieve Series ─────────────────────────────────────────────────────────────
const SIEVES_ACWC = [26.5, 19.0, 13.2, 9.5, 6.3, 4.75, 2.36, 1.18, 0.600, 0.300, 0.150, 0.075];
const SIEVES_ACBC = [37.5, 26.5, 19.0, 13.2, 9.5, 6.3, 4.75, 2.36, 1.18, 0.600, 0.300, 0.150, 0.075];

// ─── JMF Specification Limits (% Passing) ────────────────────────────────────
// Tolerances: ±7% for coarse sieves (>4.75mm), ±5% for fine sieves (≤4.75mm), ±2% for 0.075mm
const JMF_LIMITS: Record<string, { acwc: { lower: number; upper: number }; acbc: { lower: number; upper: number } }> = {
  "26.5": { acwc: { lower: 100, upper: 100 }, acbc: { lower: 90, upper: 100 } },
  "19.0": { acwc: { lower: 90, upper: 100 }, acbc: { lower: 71, upper: 95 } },
  "13.2": { acwc: { lower: 68, upper: 88 }, acbc: { lower: 56, upper: 80 } },
  "9.5":  { acwc: { lower: 53, upper: 73 }, acbc: { lower: 44, upper: 68 } },
  "6.3":  { acwc: { lower: 40, upper: 60 }, acbc: { lower: 33, upper: 57 } },
  "4.75": { acwc: { lower: 33, upper: 53 }, acbc: { lower: 26, upper: 50 } },
  "2.36": { acwc: { lower: 23, upper: 43 }, acbc: { lower: 18, upper: 38 } },
  "1.18": { acwc: { lower: 15, upper: 33 }, acbc: { lower: 12, upper: 28 } },
  "0.600":{ acwc: { lower: 10, upper: 24 }, acbc: { lower: 8,  upper: 20 } },
  "0.300":{ acwc: { lower: 6,  upper: 16 }, acbc: { lower: 5,  upper: 14 } },
  "0.150":{ acwc: { lower: 4,  upper: 10 }, acbc: { lower: 3,  upper: 9  } },
  "0.075":{ acwc: { lower: 3,  upper: 7  }, acbc: { lower: 2,  upper: 6  } },
};

type MixType = "ACWC" | "ACBC";

interface SieveRow {
  sieve: number;
  massRetained: string; // grams
  // computed
  cumRetained?: number;
  percentPassing?: number;
  jmfLower?: number;
  jmfUpper?: number;
  withinSpec?: boolean;
}

function computeGradation(rows: SieveRow[], mixType: MixType): SieveRow[] {
  const totalMass = rows.reduce((s, r) => s + (parseFloat(r.massRetained) || 0), 0);
  if (totalMass === 0) return rows;

  let cumRetained = 0;
  return rows.map(r => {
    const mass = parseFloat(r.massRetained) || 0;
    cumRetained += mass;
    const percentPassing = parseFloat(((1 - cumRetained / totalMass) * 100).toFixed(1));
    const key = r.sieve.toString();
    const limits = JMF_LIMITS[key]?.[mixType === "ACWC" ? "acwc" : "acbc"];
    return {
      ...r,
      cumRetained: parseFloat(cumRetained.toFixed(1)),
      percentPassing,
      jmfLower: limits?.lower,
      jmfUpper: limits?.upper,
      withinSpec: limits ? (percentPassing >= limits.lower && percentPassing <= limits.upper) : undefined,
    };
  });
}

export default function AsphaltHotBin() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { lang } = useLanguage(); const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [mixType, setMixType] = useState<MixType>("ACWC");
  const [sampleMass, setSampleMass] = useState("1000"); // total sample mass in grams
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const sieves = mixType === "ACWC" ? SIEVES_ACWC : SIEVES_ACBC;

  const [rows, setRows] = useState<SieveRow[]>(() =>
    sieves.map(s => ({ sieve: s, massRetained: "" }))
  );

  // Reset rows when mix type changes
  const handleMixTypeChange = (v: MixType) => {
    setMixType(v);
    const newSieves = v === "ACWC" ? SIEVES_ACWC : SIEVES_ACBC;
    setRows(newSieves.map(s => ({ sieve: s, massRetained: "" })));
  };

  const computedRows = computeGradation(rows, mixType);

  // Overall pass/fail: all sieves with limits must be within spec
  const checkedRows = computedRows.filter(r => r.withinSpec !== undefined);
  const failedSieves = checkedRows.filter(r => r.withinSpec === false);
  const overallResult: "pass" | "fail" | "pending" =
    checkedRows.length === 0 ? "pending"
    : failedSieves.length === 0 ? "pass" : "fail";

  // Chart data
  const chartData = computedRows
    .filter(r => r.percentPassing !== undefined)
    .map(r => ({
      sieve: r.sieve.toString(),
      "% Passing": r.percentPassing,
      "Lower Limit": r.jmfLower,
      "Upper Limit": r.jmfUpper,
    }));

  const updateRow = (sieve: number, value: string) => {
    setRows(prev => prev.map(r => r.sieve === sieve ? { ...r, massRetained: value } : r));
  };

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال نتائج تدرج الصندوق الساخن" : "Hot Bin gradation results submitted");
        setSubmitted(true);
      } else {
        toast.success(ar ? "تم حفظ المسودة" : "Draft saved");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && checkedRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال كتل المناخل أولاً" : "Enter sieve masses first");
      return;
    }
    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: "ASPH_HOTBIN",
        formTemplate: "asphalt_hotbin",
        formData: {
          mixType,
          sampleMass: parseFloat(sampleMass) || 1000,
          rows: computedRows,
          failedSieves: failedSieves.map(r => r.sieve),
        },
        overallResult,
        summaryValues: {
          mixType,
          failedSieves: failedSieves.length,
          totalSieves: checkedRows.length,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "رقم البن", value: dist?.testSubType },
          ]}
        />

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت" : "Asphalt Tests"}</span>
              <span>/</span>
              <span className="font-medium text-slate-700">{ar ? "تدرج الصندوق الساخن" : "Hot Bin Gradation"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "اختبار تدرج الصندوق الساخن" : "Hot Bin Gradation Test"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS EN 13108-1 / ASTM D3515 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `#${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "رجوع" : "Back"}
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}>

                  <Printer size={14} /> {ar ? "طباعة التقرير" : "Print Report"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button size="sm" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Standard Info */}
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2 text-sm text-purple-800">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">{ar ? "تدرج الصندوق الساخن — تدرج الركام الكلي" : "Hot Bin Gradation — Combined Aggregate Gradation"}</p>
                <p className="text-xs">
                  {ar ? "أدخل الكتلة المحتجزة على كل منخل. يقوم النظام بحساب النسبة المئوية للمار ومقارنتها بحدود مواصفات JMF. التفاوتات: ±7% للركام الخشن (>4.75 مم)، ±5% للركام الناعم (≤4.75 مم)، ±2% للمادة المالئة 0.075 مم." : "Enter the mass retained on each sieve. The system calculates % Passing and compares against\n                  JMF specification limits. Tolerances: ±7% for coarse (>4.75mm), ±5% for fine (≤4.75mm), ±2% for 0.075mm filler."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلمات الاختبار" : "Test Parameters"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "نوع الخلطة" : "Mix Type"}</Label>
                <Select value={mixType} onValueChange={v => handleMixTypeChange(v as MixType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACWC">ACWC — {ar ? "طبقة سطحية" : "Wearing Course"}</SelectItem>
                    <SelectItem value="ACBC">ACBC — {ar ? "طبقة رابطة" : "Binder Course"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "الكتلة الكلية للعينة (جم)" : "Total Sample Mass (g)"}</Label>
                <Input type="number" value={sampleMass}
                  onChange={e => setSampleMass(e.target.value)} placeholder={ar ? "مثال: 1000" : "e.g. 1000"} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sieve Data Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "بيانات تحليل المناخل" : "Sieve Analysis Data"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500 bg-slate-50">
                    <th className="text-left py-2 px-3 w-24">{ar ? "المنخل (مم)" : "Sieve (mm)"}</th>
                    <th className="text-left py-2 px-3 w-32">{ar ? "الكتلة المحتجزة (جم)" : "Mass Retained (g)"}</th>
                    <th className="text-left py-2 px-3 w-32">{ar ? "المحتجز التراكمي (جم)" : "Cum. Retained (g)"}</th>
                    <th className="text-left py-2 px-3 w-28">{ar ? "% المار" : "% Passing"}</th>
                    <th className="text-left py-2 px-3 w-24">{ar ? "الحد الأدنى" : "Lower Limit"}</th>
                    <th className="text-left py-2 px-3 w-24">{ar ? "الحد الأعلى" : "Upper Limit"}</th>
                    <th className="text-left py-2 px-3 w-24">{ar ? "الحالة" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row) => (
                    <tr key={row.sieve}
                      className={`border-b ${row.withinSpec === false ? "bg-red-50" : row.withinSpec === true ? "bg-green-50/40" : ""}`}>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">{row.sieve}</td>
                      <td className="py-2 px-3">
                        <Input type="number" value={row.massRetained}
                          onChange={e => updateRow(row.sieve, e.target.value)}
                          className="h-8 text-xs w-28" placeholder={ar ? "جم" : "g"} />
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">
                        {row.cumRetained !== undefined ? row.cumRetained.toFixed(1) : "—"}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">
                        {row.percentPassing !== undefined ? `${row.percentPassing.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-xs">
                        {row.jmfLower !== undefined ? `${row.jmfLower}%` : "—"}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-xs">
                        {row.jmfUpper !== undefined ? `${row.jmfUpper}%` : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {row.withinSpec === true && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">{ar ? "ناجح" : "Pass"}</Badge>
                        )}
                        {row.withinSpec === false && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">{ar ? "راسب" : "Fail"}</Badge>
                        )}
                        {row.withinSpec === undefined && (
                          <span className="text-slate-400 text-xs">{"—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            {checkedRows.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "إجمالي المناخل المفحوصة" : "Total Sieves Checked"}</p>
                  <p className="text-lg font-bold text-slate-800">{checkedRows.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "المناخل خارج المواصفات" : "Sieves Out of Spec"}</p>
                  <p className={`text-lg font-bold ${failedSieves.length > 0 ? "text-red-600" : "text-green-600"}`}>
                    {failedSieves.length}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "النتيجة الإجمالية" : "Overall Result"}</p>
                  {overallResult !== "pending" ? (
                    <PassFailBadge result={overallResult} size="lg" />
                  ) : <span className="text-slate-400 text-sm">{ar ? "قيد الانتظار" : "Pending"}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gradation Curve Chart */}
        {chartData.length > 0 && chartData.some(d => d["% Passing"] !== undefined) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 size={16} className="text-purple-600" />
                {ar ? `منحنى التدرج — ${mixType}` : `Gradation Curve — ${mixType}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="sieve"
                    label={{ value: ar ? "حجم المنخل (مم)" : "Sieve Size (mm)", position: "insideBottom", offset: -10, fontSize: 11 }}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    label={{ value: ar ? "% المار" : "% Passing", angle: -90, position: "insideLeft", fontSize: 11 }}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(v: number) => `${v?.toFixed(1)}%`} />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="% Passing"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#7c3aed" }}
                    name={ar ? "التدرج" : "Gradation"}
                  />
                  <Line
                    type="monotone"
                    dataKey="Upper Limit"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    name={ar ? "الحد الأعلى" : "Upper Limit"}
                  />
                  <Line
                    type="monotone"
                    dataKey="Lower Limit"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    name={ar ? "الحد الأدنى" : "Lower Limit"}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-500 mt-2 text-center">
                {ar ? `الخطوط المتقطعة = حدود مواصفات JMF (${mixType}). يجب أن يقع التدرج بين الحدود.` : `Dashed lines = JMF specification limits (${mixType}). Gradation must fall between limits.`}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Overall Result Banner */}
        {overallResult !== "pending" && (
          <ResultBanner result={overallResult} />
        )}

        {/* Notes & Submit */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>{ar ? "ملاحظات / مشاهدات" : "Notes / Observations"}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder={ar ? "مرجع تصميم الخلطة، موقع أخذ العينات، رقم الدفعة..." : "Mix design reference, sampling location, batch number..."} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1.5">
                  <UserCheck size={13} />
                  <span>{ar ? `الفاحص: <strong>${user.name}</strong>` : `Technician: <strong>${user.name}</strong>`}</span>
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button onClick={() => handleSave("submitted")} disabled={saving || submitted}>
                  {saving ? (ar ? "جاري الحفظ..." : "Saving...") : submitted ? (ar ? "تم الحفظ ✓" : "Saved ✓") : (
                    <><Send size={14} className="mr-1.5" /> {ar ? "إرسال النتائج" : "Submit Results"}</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
