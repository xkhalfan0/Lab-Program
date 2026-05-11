/**
 * AsphaltExtractedSieve — Sieve Analysis of Extracted Aggregate
 * Standard: BS EN 12697-2 / ASTM D5444
 *
 * Performed after bitumen extraction (BS EN 12697-1).
 * Compares gradation of extracted aggregate vs. JMF limits.
 *
 * Mix types: ACWC (20mm), ACBC (28mm), DBM (40mm)
 */
import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, FlaskConical, Info, Printer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── JMF Gradation Limits per Mix Type ───────────────────────────────────────
// Sieves in mm, limits as % passing
const MIX_GRADATIONS: Record<string, { sieves: string[]; lower: number[]; upper: number[] }> = {
  "ACWC": {
    sieves: ["25.0","19.0","12.5","9.5","6.3","4.75","2.36","1.18","0.600","0.300","0.150","0.075"],
    lower:  [100,   90,    62,    47,    35,   28,    20,    13,    9,     6,     4,     3],
    upper:  [100,   100,   80,    65,    52,   44,    34,    24,    18,    13,    9,     7],
  },
  "ACBC": {
    sieves: ["37.5","25.0","19.0","12.5","9.5","6.3","4.75","2.36","1.18","0.600","0.300","0.150","0.075"],
    lower:  [100,   90,    71,    51,    40,   30,   23,    15,    10,    7,     4,     3,     2],
    upper:  [100,   100,   90,    72,    60,   50,   42,    32,    23,    17,    12,    8,     6],
  },
  "DBM": {
    sieves: ["50.0","37.5","25.0","19.0","12.5","9.5","4.75","2.36","0.600","0.075"],
    lower:  [100,   90,    65,    50,    35,    25,   15,    10,    5,     2],
    upper:  [100,   100,   85,    70,    55,    45,   35,    25,    15,    8],
  },
};

interface SieveRow {
  sieve: string;
  massRetained: string;
  cumRetained?: number;
  percentPassing?: number;
  lower?: number;
  upper?: number;
  withinLimits?: boolean;
}

function computeGradation(rows: SieveRow[], totalMass: number, mixType: string): SieveRow[] {
  const limits = MIX_GRADATIONS[mixType];
  let cumR = 0;
  return rows.map((row, i) => {
    const m = parseFloat(row.massRetained) || 0;
    cumR += m;
    const percentPassing = totalMass > 0 ? parseFloat(((1 - cumR / totalMass) * 100).toFixed(1)) : undefined;
    const lower = limits?.lower[i];
    const upper = limits?.upper[i];
    const withinLimits = percentPassing !== undefined && lower !== undefined && upper !== undefined
      ? percentPassing >= lower && percentPassing <= upper
      : undefined;
    return { ...row, cumRetained: parseFloat(cumR.toFixed(1)), percentPassing, lower, upper, withinLimits };
  });
}

export default function AsphaltExtractedSieve() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [mixType, setMixType] = useState("ACWC");
  const [sampleMass, setSampleMass] = useState("1000");
  const [panMass, setPanMass] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: parseInt(distributionId || "0") },
    { enabled: !!distributionId }
  );

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: () => { toast.success("تم حفظ نتائج تحليل المنخل بنجاح"); setSubmitted(true); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const [rows, setRows] = useState<SieveRow[]>(() =>
    (MIX_GRADATIONS[mixType]?.sieves ?? []).map(s => ({ sieve: s, massRetained: "" }))
  );

  const handleMixChange = (m: string) => {
    setMixType(m);
    setRows((MIX_GRADATIONS[m]?.sieves ?? []).map(s => ({ sieve: s, massRetained: "" })));
  };

  const totalMass = (parseFloat(sampleMass) || 0) - (parseFloat(panMass) || 0);
  const computed = computeGradation(rows, totalMass, mixType);
  const validRows = computed.filter(r => r.percentPassing !== undefined);
  const failCount = validRows.filter(r => r.withinLimits === false).length;
  const overallPass = validRows.length > 0 && failCount === 0;

  const updateRow = useCallback((sieve: string, value: string) => {
    setRows(prev => prev.map(r => r.sieve === sieve ? { ...r, massRetained: value } : r));
  }, []);

  const chartData = computed
    .filter(r => r.percentPassing !== undefined)
    .map(r => ({
      sieve: r.sieve,
      "% Passing": r.percentPassing,
      "Upper Limit": r.upper,
      "Lower Limit": r.lower,
    }));

  const handleSubmit = () => {
    if (!distributionId) return;
    saveMut.mutate({
      distributionId: parseInt(distributionId),
      sampleId: distribution?.sampleId ?? 0,
      testTypeCode: `ASPH_EXTRACTED_SIEVE_${mixType}`,
      formTemplate: "asphalt_extracted_sieve",
      formData: { mixType, sampleMass, panMass, totalMass, rows: computed, overallPass },
      overallResult: overallPass ? "pass" : "fail",
      notes,
      status: "submitted",
    });
  };

  return (
    <DashboardLayout>
      <div className="container max-w-5xl py-6 space-y-6">
        <SampleInfoCard
          dist={distribution}
          extraFields={[
            { label: "نوع الخلطة", value: distribution?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-amber-600" />
              تحليل منخل الركام المستخلص — Extracted Aggregate Sieve Analysis
            </h1>
            <p className="text-muted-foreground text-sm mt-1">BS EN 12697-2 / ASTM D5444</p>
          </div>
          {distribution && (
            <Badge variant="outline">{distribution.distributionCode} — {distribution.testName}</Badge>
          )}
        </div>

        {/* Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">إعدادات الفحص</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>نوع الخلطة</Label>
              <Select value={mixType} onValueChange={handleMixChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACWC">ACWC (20mm)</SelectItem>
                  <SelectItem value="ACBC">ACBC (28mm)</SelectItem>
                  <SelectItem value="DBM">DBM (40mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>كتلة العينة الكلية (g)</Label>
              <Input value={sampleMass} onChange={e => setSampleMass(e.target.value)} type="number" />
            </div>
            <div>
              <Label>كتلة الصينية (g)</Label>
              <Input value={panMass} onChange={e => setPanMass(e.target.value)} type="number" />
            </div>
            <div className="flex items-end">
              <div className="bg-muted rounded-lg px-4 py-2 text-sm w-full">
                <span className="text-muted-foreground">الكتلة الفعلية: </span>
                <span className="font-mono font-bold">{totalMass.toLocaleString()} g</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                يُجرى هذا الاختبار على الركام بعد استخلاص البيتومين. الحدود المعيارية مأخوذة من JMF للخلطة المحددة.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sieve Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">جدول تحليل المنخل</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted text-center">
                    <th className="border px-3 py-2">حجم المنخل (mm)</th>
                    <th className="border px-3 py-2">الكتلة المحتجزة (g)</th>
                    <th className="border px-3 py-2">الكتلة المتراكمة (g)</th>
                    <th className="border px-3 py-2">% العابر</th>
                    <th className="border px-3 py-2">الحد الأدنى</th>
                    <th className="border px-3 py-2">الحد الأقصى</th>
                    <th className="border px-3 py-2">النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map(row => (
                    <tr key={row.sieve} className="text-center hover:bg-muted/30">
                      <td className="border px-3 py-1.5 font-mono font-semibold">{row.sieve}</td>
                      <td className="border px-2 py-1">
                        <Input
                          value={row.massRetained}
                          onChange={e => updateRow(row.sieve, e.target.value)}
                          className="h-7 text-center w-24 mx-auto"
                          type="number" min="0"
                        />
                      </td>
                      <td className="border px-3 py-1.5 font-mono">{row.cumRetained?.toFixed(1) ?? "—"}</td>
                      <td className={`border px-3 py-1.5 font-mono font-bold ${row.withinLimits === false ? "text-red-600" : row.withinLimits === true ? "text-emerald-600" : ""}`}>
                        {row.percentPassing?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border px-3 py-1.5 text-muted-foreground">{row.lower ?? "—"}</td>
                      <td className="border px-3 py-1.5 text-muted-foreground">{row.upper ?? "—"}</td>
                      <td className="border px-3 py-1.5">
                        {row.withinLimits !== undefined
                          ? <PassFailBadge result={row.withinLimits ? "pass" : "fail"} size="sm" />
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">منحنى التدرج الحبيبي مقارنةً بحدود JMF</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sieve" label={{ value: "Sieve Size (mm)", position: "insideBottom", offset: -10 }} />
                  <YAxis domain={[0, 100]} label={{ value: "% Passing", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend verticalAlign="top" />
                  <Line type="monotone" dataKey="% Passing" stroke="#d97706" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Upper Limit" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                  <Line type="monotone" dataKey="Lower Limit" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Overall Result */}
        {validRows.length > 0 && (
          <div className={`flex items-center gap-3 rounded-xl p-4 border-2 ${overallPass ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"}`}>
            <span className={`font-bold text-lg ${overallPass ? "text-emerald-800" : "text-red-800"}`}>
              {overallPass ? "✓ PASS — ضمن حدود JMF" : `✗ FAIL — ${failCount} منخل خارج الحدود`}
            </span>
          </div>
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          {submitted && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> طباعة التقرير
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={saveMut.isPending || submitted}
            className="min-w-32 bg-blue-600 hover:bg-blue-700"
          >
            <Send className="h-4 w-4 mr-2" />
            {saveMut.isPending ? "جاري الحفظ..." : submitted ? "تم الحفظ ✓" : "تأكيد النتائج"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
