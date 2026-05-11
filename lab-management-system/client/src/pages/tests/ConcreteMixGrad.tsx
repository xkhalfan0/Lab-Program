/**
 * ConcreteMixGrad — Concrete Mix Aggregate Gradation Test
 * Standards: ASTM C33 / BS EN 12620
 *
 * Test: CONC_MIX_GRAD
 * Sieve analysis of combined aggregate (coarse + fine) for concrete mix design
 * Includes gradation curve chart vs. ASTM C33 limits
 */
import { useState, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── ASTM C33 Grading Limits for Combined Aggregate ─────────────────────────
// Nominal max size 20mm (3/4") — typical for structural concrete
const ASTM_C33_LIMITS: Record<string, { lower: number; upper: number }> = {
  "37.5": { lower: 100, upper: 100 },
  "25.0": { lower: 95, upper: 100 },
  "19.0": { lower: 72, upper: 100 },
  "12.5": { lower: 55, upper: 85 },
  "9.5":  { lower: 40, upper: 75 },
  "4.75": { lower: 25, upper: 55 },
  "2.36": { lower: 15, upper: 40 },
  "1.18": { lower: 10, upper: 30 },
  "0.600":{ lower: 5,  upper: 20 },
  "0.300":{ lower: 0,  upper: 10 },
  "0.150":{ lower: 0,  upper: 5  },
};

const SIEVES = Object.keys(ASTM_C33_LIMITS);

interface SieveRow {
  sieve: string;
  massRetained: string;
  // computed
  cumRetained?: number;
  percentPassing?: number;
  withinLimits?: boolean;
}

function computeGradation(rows: SieveRow[], totalMass: number): SieveRow[] {
  let cumR = 0;
  return rows.map(row => {
    const m = parseFloat(row.massRetained) || 0;
    cumR += m;
    const percentPassing = totalMass > 0 ? parseFloat(((1 - cumR / totalMass) * 100).toFixed(1)) : undefined;
    const limits = ASTM_C33_LIMITS[row.sieve];
    const withinLimits = percentPassing !== undefined && limits
      ? percentPassing >= limits.lower && percentPassing <= limits.upper
      : undefined;
    return { ...row, cumRetained: parseFloat(cumR.toFixed(1)), percentPassing, withinLimits };
  });
}

export default function ConcreteMixGrad() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage(); const ar = lang === "ar";

  const distId = parseInt(distributionId || "0", 10);

  const [sampleMass, setSampleMass] = useState("5000");
  const [panMass, setPanMass] = useState("0");
  const [mixType, setMixType] = useState("C25");
  const [rows, setRows] = useState<SieveRow[]>(SIEVES.map(s => ({ sieve: s, massRetained: "" })));
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId }
  );

  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (typeof fd.mixType === "string") setMixType(fd.mixType);
    if (fd.sampleMass != null) setSampleMass(String(fd.sampleMass));
    if (fd.panMass != null) setPanMass(String(fd.panMass));
    if (Array.isArray(fd.rows)) {
      const bySieve = new Map(
        (fd.rows as { sieve?: string; massRetained?: string | number }[]).map((r) => [
          String(r.sieve ?? ""),
          r.massRetained != null ? String(r.massRetained) : "",
        ])
      );
      setRows(SIEVES.map((s) => ({ sieve: s, massRetained: bySieve.get(s) ?? "" })));
    }
    if (typeof fd.notes === "string") setNotes(fd.notes);
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const totalMass = (parseFloat(sampleMass) || 0) - (parseFloat(panMass) || 0);
  const computed = computeGradation(rows, totalMass);
  const validRows = computed.filter(r => r.percentPassing !== undefined);
  const failCount = validRows.filter(r => r.withinLimits === false).length;
  const overallPass = validRows.length > 0 && failCount === 0;

  const updateRow = useCallback((sieve: string, value: string) => {
    setRows(prev => prev.map(r => r.sieve === sieve ? { ...r, massRetained: value } : r));
  }, []);

  // Chart data
  const chartData = computed
    .filter(r => r.percentPassing !== undefined)
    .map(r => ({
      sieve: r.sieve,
      "% Passing": r.percentPassing,
      "Upper Limit": ASTM_C33_LIMITS[r.sieve]?.upper,
      "Lower Limit": ASTM_C33_LIMITS[r.sieve]?.lower,
    }));

  const handleSave = async (status: "draft" | "submitted") => {
    if (!distId) return;
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "يرجى إدخال بيانات المناخل" : "Please enter sieve data");
      return;
    }
    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: distribution?.sampleId ?? 0,
        testTypeCode: "CONC_MIX_GRAD",
        formTemplate: "concrete_mix_grad",
        formData: { mixType, sampleMass, panMass, totalMass, rows: computed, overallPass },
        overallResult: validRows.length === 0 ? "pending" : overallPass ? "pass" : "fail",
        summaryValues: { mixType, overallPass: overallPass ? "pass" : "fail", sieveRows: validRows.length },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container max-w-5xl py-6 space-y-6">
        <SampleInfoCard dist={distribution} />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-500" />
              {ar ? "تدرج ركام الخلطة الخرسانية" : "Concrete Mix Aggregate Gradation"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">ASTM C33 / BS EN 12620</p>
          </div>
          {distribution && (
            <Badge variant="outline">{ar ? "أمر التوزيع:" : "Distribution:"} {distribution.distributionCode} — {distribution.testName}</Badge>
          )}
        </div>

        {/* Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>{ar ? "درجة الخلطة" : "Mix Grade"}</Label>
              <Select value={mixType} onValueChange={setMixType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["C20","C25","C30","C35","C40","C45","C50"].map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{ar ? "كتلة العينة الكلية (g)" : "Total Sample Mass (g)"}</Label>
              <Input value={sampleMass} onChange={e => setSampleMass(e.target.value)} type="number" />
            </div>
            <div>
              <Label>{ar ? "كتلة الصينية (g)" : "Pan Mass (g)"}</Label>
              <Input value={panMass} onChange={e => setPanMass(e.target.value)} type="number" />
            </div>
            <div className="flex items-end">
              <div className="bg-muted rounded-lg px-4 py-2 text-sm w-full">
                <span className="text-muted-foreground">{ar ? "الكتلة الفعلية:" : "Actual Mass:"} </span>
                <span className="font-mono font-bold">{totalMass.toLocaleString()} g</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-2 text-sm text-blue-700 dark:text-blue-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {ar ? "الحدود المعيارية: ASTM C33 — حجم اسمي أقصى 25مم | % العابر = (الكتلة الكلية − الكتلة المتراكمة) ÷ الكتلة الكلية × 100" : "Standard Limits: ASTM C33 — Nominal max size 25mm | % Passing = (Total Mass − Cumulative Retained) ÷ Total Mass × 100"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sieve Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "جدول تحليل المنخل" : "Sieve Analysis Table"}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted text-center">
                    <th className="border px-3 py-2">{ar ? "حجم المنخل (mm)" : "Sieve Size (mm)"}</th>
                    <th className="border px-3 py-2">{ar ? "الكتلة المحتجزة (g)" : "Mass Retained (g)"}</th>
                    <th className="border px-3 py-2">{ar ? "الكتلة المتراكمة (g)" : "Cumulative Retained (g)"}</th>
                    <th className="border px-3 py-2">{ar ? "% العابر" : "% Passing"}</th>
                    <th className="border px-3 py-2">{ar ? "الحد الأدنى (%)" : "Lower Limit (%)"}</th>
                    <th className="border px-3 py-2">{ar ? "الحد الأقصى (%)" : "Upper Limit (%)"}</th>
                    <th className="border px-3 py-2">{ar ? "النتيجة" : "Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map(row => {
                    const limits = ASTM_C33_LIMITS[row.sieve];
                    return (
                      <tr key={row.sieve} className="text-center hover:bg-muted/30">
                        <td className="border px-3 py-1.5 font-mono font-semibold">{row.sieve}</td>
                        <td className="border px-2 py-1">
                          <Input
                            value={row.massRetained}
                            onChange={e => updateRow(row.sieve, e.target.value)}
                            className="h-7 text-center w-24 mx-auto"
                            type="number"
                            min="0"
                          />
                        </td>
                        <td className="border px-3 py-1.5 font-mono">{row.cumRetained?.toFixed(1) ?? "—"}</td>
                        <td className={`border px-3 py-1.5 font-mono font-bold ${row.withinLimits === false ? "text-red-600" : row.withinLimits === true ? "text-emerald-600" : ""}`}>
                          {row.percentPassing?.toFixed(1) ?? "—"}
                        </td>
                        <td className="border px-3 py-1.5 text-muted-foreground">{limits?.lower ?? "—"}</td>
                        <td className="border px-3 py-1.5 text-muted-foreground">{limits?.upper ?? "—"}</td>
                        <td className="border px-3 py-1.5">
                          {row.withinLimits !== undefined
                            ? <PassFailBadge result={row.withinLimits ? "pass" : "fail"} size="sm" />
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Gradation Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">{ar ? "منحنى التدرج الحبيبي" : "Gradation Curve"}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sieve" label={{ value: ar ? "حجم المنخل (mm)" : "Sieve Size (mm)", position: "insideBottom", offset: -10 }} />
                  <YAxis domain={[0, 100]} label={{ value: ar ? "% العابر" : "% Passing", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend verticalAlign="top" />
                  <Line type="monotone" dataKey="% Passing" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} />
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
              {overallPass ? (ar ? "✓ ناجح — ضمن الحدود المعيارية" : "✓ PASS — Within Standard Limits") : (ar ? `✗ راسب — ${failCount} منخل خارج الحدود` : `✗ FAIL — ${failCount} sieves out of limits`)}
            </span>
          </div>
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "ملاحظات" : "Notes / Observations"}</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional notes..."} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end flex-wrap">
          {submitted && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> {ar ? "طباعة التقرير" : "Print Report"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSave("draft")}
            disabled={saving || saveMut.isPending || submitted}
          >
            {ar ? "حفظ مسودة" : "Save draft"}
          </Button>
          <Button
            type="button"
            className="min-w-32 bg-blue-600 hover:bg-blue-700"
            onClick={() => handleSave("submitted")}
            disabled={saving || saveMut.isPending || submitted}
          >
            <Send className="h-4 w-4 mr-2" />
            {saving || saveMut.isPending
              ? (ar ? "جاري الحفظ..." : "Saving...")
              : submitted
                ? (ar ? "تم الإرسال" : "Submitted")
                : (ar ? "إرسال النتائج" : "Submit results")}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
