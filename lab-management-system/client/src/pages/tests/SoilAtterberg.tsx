import { useState } from "react";
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
import { Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart, ReferenceLine,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Atterberg Limits (BS 1377-2 / ASTM D4318) ───────────────────────────────

interface LiquidLimitPoint {
  id: string;
  blows: string;
  wetMass: string;
  dryMass: string;
  tinMass: string;
  // computed
  waterContent?: number;
}

interface PlasticLimitRow {
  id: string;
  wetMass: string;
  dryMass: string;
  tinMass: string;
  waterContent?: number;
}

function computeWC(wet: string, dry: string, tin: string): number | undefined {
  const w = parseFloat(wet);
  const d = parseFloat(dry);
  const t = parseFloat(tin);
  if (!w || !d || !t || d <= t) return undefined;
  return parseFloat(((w - d) / (d - t) * 100).toFixed(2));
}

// Fit flow curve (log-linear) to find LL at 25 blows
function fitFlowCurve(points: { blows: number; wc: number }[]): { ll: number; flowIndex: number } | null {
  if (points.length < 2) return null;
  // log(N) vs WC: WC = a*log(N) + b
  const logPoints = points.map(p => ({ x: Math.log10(p.blows), y: p.wc }));
  const n = logPoints.length;
  const sx = logPoints.reduce((s, p) => s + p.x, 0);
  const sy = logPoints.reduce((s, p) => s + p.y, 0);
  const sxy = logPoints.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = logPoints.reduce((s, p) => s + p.x ** 2, 0);
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx ** 2);
  const intercept = (sy - slope * sx) / n;
  const ll = slope * Math.log10(25) + intercept;
  const flowIndex = Math.abs(slope);
  return { ll: parseFloat(ll.toFixed(1)), flowIndex: parseFloat(flowIndex.toFixed(2)) };
}

export default function SoilAtterberg() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [llPoints, setLlPoints] = useState<LiquidLimitPoint[]>([
    { id: "ll1", blows: "", wetMass: "", dryMass: "", tinMass: "" },
    { id: "ll2", blows: "", wetMass: "", dryMass: "", tinMass: "" },
    { id: "ll3", blows: "", wetMass: "", dryMass: "", tinMass: "" },
    { id: "ll4", blows: "", wetMass: "", dryMass: "", tinMass: "" },
  ]);
  const [plRows, setPlRows] = useState<PlasticLimitRow[]>([
    { id: "pl1", wetMass: "", dryMass: "", tinMass: "" },
    { id: "pl2", wetMass: "", dryMass: "", tinMass: "" },
  ]);
  const [soilDescription, setSoilDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة" : "Draft saved");
      setSubmitted(true);}
    },
    onError: (e) => toast.error(e.message),
  });

  // Compute LL points
  const computedLlPoints = llPoints.map(p => ({
    ...p,
    waterContent: computeWC(p.wetMass, p.dryMass, p.tinMass),
  }));

  const validLlPoints = computedLlPoints
    .filter(p => p.waterContent !== undefined && parseFloat(p.blows) > 0)
    .map(p => ({ blows: parseFloat(p.blows), wc: p.waterContent! }));

  const flowCurve = fitFlowCurve(validLlPoints);
  const ll = flowCurve?.ll;

  // Compute PL
  const computedPlRows = plRows.map(r => ({
    ...r,
    waterContent: computeWC(r.wetMass, r.dryMass, r.tinMass),
  }));
  const validPl = computedPlRows.filter(r => r.waterContent !== undefined);
  const pl = validPl.length > 0
    ? parseFloat((validPl.reduce((s, r) => s + (r.waterContent ?? 0), 0) / validPl.length).toFixed(1))
    : undefined;

  // PI = LL - PL
  const pi = ll !== undefined && pl !== undefined ? parseFloat((ll - pl).toFixed(1)) : undefined;

  // Chart data for flow curve
  const chartData = validLlPoints.sort((a, b) => a.blows - b.blows);

  const updateLl = (id: string, field: keyof LiquidLimitPoint, value: string) => {
    setLlPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const updatePl = (id: string, field: keyof PlasticLimitRow, value: string) => {
    setPlRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && validLlPoints.length < 2) {
      toast.error("Please enter at least 2 Liquid Limit data points");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: "SOIL_ATTERBERG",
        formTemplate: "soil_atterberg",
        formData: {
          soilDescription,
          llPoints: computedLlPoints,
          plRows: computedPlRows,
          ll,
          pl,
          pi,
          flowIndex: flowCurve?.flowIndex,
        },
        overallResult: "pending",
        summaryValues: { ll, pl, pi },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  // Soil classification hint
  const classification = pi !== undefined
    ? pi < 7 ? "Low Plasticity (CL/ML)"
    : pi < 17 ? "Medium Plasticity (CI/MI)"
    : pi < 35 ? "High Plasticity (CH/MH)"
    : "Very High Plasticity (CV/MV)"
    : undefined;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Soil Tests / Atterberg Limits</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Atterberg Limits (LL, PL, PI)</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-2 / ASTM D4318 | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
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
            <Button size="sm" onClick={() => handleSave("submitted")} disabled={saving}>
              <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
            </Button>
              </>
            )}
              </>
            )}
          </div>
        </div>

        {/* Soil Info */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">Soil Description</Label>
            <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder="e.g. Brown silty clay, Fill material from borehole BH-3" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Liquid Limit Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Liquid Limit (Casagrande Method)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setLlPoints(p => [...p, { id: `ll${Date.now()}`, blows: "", wetMass: "", dryMass: "", tinMass: "" }])}>
                  + Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Blows (N)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Wet+Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Dry+Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W.C. (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {computedLlPoints.map((p, idx) => (
                    <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={p.blows} onChange={e => updateLl(p.id, "blows", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={p.wetMass} onChange={e => updateLl(p.id, "wetMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={p.dryMass} onChange={e => updateLl(p.id, "dryMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={p.tinMass} onChange={e => updateLl(p.id, "tinMass", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                        {p.waterContent?.toFixed(2) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ll !== undefined && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600 font-semibold">Liquid Limit (LL) at 25 blows</p>
                  <p className="text-3xl font-bold text-blue-800">{ll}%</p>
                  {flowCurve && <p className="text-xs text-blue-500">Flow Index: {flowCurve.flowIndex}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Flow Curve Chart */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Flow Curve (Casagrande)</CardTitle></CardHeader>
            <CardContent>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="blows"
                      type="number"
                      scale="log"
                      domain={[10, 50]}
                      ticks={[10, 15, 20, 25, 30, 40, 50]}
                      tick={{ fontSize: 10 }}
                      label={{ value: "Number of Blows (N)", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="wc"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 10 }}
                      label={{ value: "Water Content (%)", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Scatter name="Test Points" data={chartData} dataKey="wc" fill="#2563eb" line={{ stroke: "#2563eb", strokeWidth: 2 }} />
                    <ReferenceLine x={25} stroke="#10b981" strokeDasharray="4 4" label={{ value: "25 blows", position: "top", fontSize: 10, fill: "#10b981" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm text-center">
                  <p>Enter at least 2 LL data points<br />to display flow curve</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Plastic Limit */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Plastic Limit (Thread Rolling Method)</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPlRows(p => [...p, { id: `pl${Date.now()}`, wetMass: "", dryMass: "", tinMass: "" }])}>
                + Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Wet+Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Dry+Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Tin (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W.C. (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {computedPlRows.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={r.wetMass} onChange={e => updatePl(r.id, "wetMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={r.dryMass} onChange={e => updatePl(r.id, "dryMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={r.tinMass} onChange={e => updatePl(r.id, "tinMass", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                        {r.waterContent?.toFixed(2) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="space-y-3">
                {pl !== undefined && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-amber-600 font-semibold">Plastic Limit (PL)</p>
                    <p className="text-2xl font-bold text-amber-800">{pl}%</p>
                  </div>
                )}
                {pi !== undefined && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-purple-600 font-semibold">Plasticity Index (PI = LL - PL)</p>
                    <p className="text-2xl font-bold text-purple-800">{pi}%</p>
                    {classification && <p className="text-xs text-purple-500 mt-1">{classification}</p>}
                  </div>
                )}
                {ll !== undefined && pl !== undefined && pi !== undefined && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Liquid Limit (LL):</span><span className="font-bold">{ll}%</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Plastic Limit (PL):</span><span className="font-bold">{pl}%</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Plasticity Index (PI):</span><span className="font-bold">{pi}%</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Classification:</span><span className="font-bold">{classification}</span></div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
