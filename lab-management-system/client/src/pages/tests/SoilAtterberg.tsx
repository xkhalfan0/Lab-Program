import { useState } from "react";
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
import { Send, FlaskConical, Printer, Plus, Trash2 } from "lucide-react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Atterberg Limits (BS 1377-2 / ASTM D4318) ───────────────────────────────
// Tech enters (yellow): container no., number of blows (LL), and the three
// weights. Computed (green): weight of moisture, weight of dry sample, moisture
// content, Plastic Limit average, Liquid Limit @ 25 blows, Plasticity Index.

interface LiquidLimitPoint {
  id: string;
  containerNo: string;
  range: string;
  blows: string;
  wetMass: string; // weight of container + wet sample
  dryMass: string; // weight of container + dry sample
  tinMass: string; // weight of container
}

interface PlasticLimitRow {
  id: string;
  containerNo: string;
  wetMass: string;
  dryMass: string;
  tinMass: string;
}

interface ComputedRow {
  wtMoisture?: number; // wet − dry
  wtDry?: number;      // dry − container
  waterContent?: number;
}

function computeRow(wet: string, dry: string, tin: string): ComputedRow {
  const w = parseFloat(wet);
  const d = parseFloat(dry);
  const t = parseFloat(tin);
  const wtMoisture = Number.isFinite(w) && Number.isFinite(d) ? parseFloat((w - d).toFixed(2)) : undefined;
  const wtDry = Number.isFinite(d) && Number.isFinite(t) ? parseFloat((d - t).toFixed(2)) : undefined;
  const waterContent =
    wtMoisture != null && wtDry != null && wtDry > 0
      ? parseFloat(((wtMoisture / wtDry) * 100).toFixed(2))
      : undefined;
  return { wtMoisture, wtDry, waterContent };
}

// Fit flow curve (log-linear) to find LL at 25 blows
function fitFlowCurve(points: { blows: number; wc: number }[]): { ll: number; flowIndex: number } | null {
  if (points.length < 2) return null;
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
    { id: "ll1", containerNo: "L", range: "25-35", blows: "", wetMass: "", dryMass: "", tinMass: "" },
    { id: "ll2", containerNo: "M", range: "20-30", blows: "", wetMass: "", dryMass: "", tinMass: "" },
    { id: "ll3", containerNo: "N", range: "15-25", blows: "", wetMass: "", dryMass: "", tinMass: "" },
  ]);
  const [plRows, setPlRows] = useState<PlasticLimitRow[]>([
    { id: "pl1", containerNo: "C", wetMass: "", dryMass: "", tinMass: "" },
    { id: "pl2", containerNo: "Z", wetMass: "", dryMass: "", tinMass: "" },
  ]);
  const [soilDescription, setSoilDescription] = useState("");
  const [passing0425, setPassing0425] = useState("");
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

  // Compute LL points
  const computedLlPoints = llPoints.map(p => ({ ...p, ...computeRow(p.wetMass, p.dryMass, p.tinMass) }));
  const validLlPoints = computedLlPoints
    .filter(p => p.waterContent !== undefined && parseFloat(p.blows) > 0)
    .map(p => ({ blows: parseFloat(p.blows), wc: p.waterContent! }));

  const flowCurve = fitFlowCurve(validLlPoints);
  const ll = flowCurve?.ll;

  // Compute PL
  const computedPlRows = plRows.map(r => ({ ...r, ...computeRow(r.wetMass, r.dryMass, r.tinMass) }));
  const validPl = computedPlRows.filter(r => r.waterContent !== undefined);
  const pl = validPl.length > 0
    ? parseFloat((validPl.reduce((s, r) => s + (r.waterContent ?? 0), 0) / validPl.length).toFixed(1))
    : undefined;

  // PI = LL − PL. Atterberg limits are reported to the nearest whole number.
  const llReported = ll !== undefined ? Math.round(ll) : undefined;
  const plReported = pl !== undefined ? Math.round(pl) : undefined;
  const piReported = llReported !== undefined && plReported !== undefined ? llReported - plReported : undefined;

  // Flow-curve fitted line (for a clean trend line through the scatter)
  const chartData = [...validLlPoints].sort((a, b) => a.blows - b.blows);

  const updateLl = (id: string, field: keyof LiquidLimitPoint, value: string) => {
    setLlPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const updatePl = (id: string, field: keyof PlasticLimitRow, value: string) => {
    setPlRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const removeLl = (id: string) => setLlPoints(prev => (prev.length > 1 ? prev.filter(p => p.id !== id) : prev));
  const removePl = (id: string) => setPlRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validLlPoints.length < 2) {
      toast.error(ar ? "الرجاء إدخال نقطتين على الأقل لحد السيولة" : "Please enter at least 2 Liquid Limit data points");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "SOIL_ATTERBERG",
        formTemplate: "soil_atterberg",
        formData: {
          soilDescription,
          passing0425: parseFloat(passing0425) || null,
          llPoints: computedLlPoints,
          plRows: computedPlRows,
          ll,
          pl,
          pi: piReported,
          liquidLimit: llReported ?? null,
          plasticLimit: plReported ?? null,
          plasticityIndex: piReported ?? null,
          flowIndex: flowCurve?.flowIndex ?? null,
          classification,
        },
        overallResult: "pending",
        summaryValues: {
          passing0425: parseFloat(passing0425) || null,
          plasticLimit: plReported ?? null,
          liquidLimit: llReported ?? null,
          plasticityIndex: piReported ?? null,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  // Soil classification hint (based on PI)
  const classification = piReported !== undefined
    ? piReported < 7 ? "Low Plasticity (CL/ML)"
    : piReported < 17 ? "Medium Plasticity (CI/MI)"
    : piReported < 35 ? "High Plasticity (CH/MH)"
    : "Very High Plasticity (CV/MV)"
    : undefined;

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

  const inputCls = "h-7 text-xs text-center font-mono bg-amber-50/70 border-amber-200";
  const greenCell = "border border-slate-200 px-1 py-1 text-center font-mono text-xs font-semibold bg-green-50 text-green-800";
  const thCls = "border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-600";

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات التربة / حدود أتربرج" : "Soil Tests / Atterberg Limits"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "حدود أتربرج (LL, PL, PI)" : "Atterberg Limits (LL, PL, PI)"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-2 / ASTM D4318 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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

        {/* Soil Info + % passing 0.425 */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label className="text-xs text-slate-500 mb-1 block">{ar ? "وصف التربة" : "Soil Description"}</Label>
              <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} placeholder={ar ? "مثال: طين غريني بني" : "e.g. Brown silty clay, Fill material from borehole BH-3"} disabled={submitted} />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">{ar ? "النسبة المارة من منخل 0.425 مم %" : "% Passing 0.425 mm sieve"}</Label>
              <Input value={passing0425} onChange={e => setPassing0425(e.target.value)} className="font-mono bg-amber-50/70 border-amber-200" placeholder={ar ? "مثال: 95" : "e.g. 95"} disabled={submitted} />
            </div>
          </CardContent>
        </Card>

        {/* Liquid Limit table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "حد السيولة (طريقة كاساغراندي)" : "Liquid Limit (Casagrande Method)"}</CardTitle>
              <Button variant="outline" size="sm" className="gap-1" disabled={submitted}
                onClick={() => setLlPoints(p => [...p, { id: `ll${Date.now()}`, containerNo: "", range: "", blows: "", wetMass: "", dryMass: "", tinMass: "" }])}>
                <Plus size={14} /> {ar ? "إضافة" : "Add"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={thCls}>{ar ? "رقم الوعاء" : "Container No."}</th>
                    <th className={thCls}>{ar ? "مدى الضربات" : "Range of blows"}</th>
                    <th className={thCls}>{ar ? "عدد الضربات" : "No. of blows"}</th>
                    <th className={thCls}>{ar ? "وعاء + عينة رطبة (g)" : "Cont.+wet (g)"}</th>
                    <th className={thCls}>{ar ? "وعاء + عينة جافة (g)" : "Cont.+dry (g)"}</th>
                    <th className={thCls}>{ar ? "وزن الوعاء (g)" : "Container (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "وزن الرطوبة (g)" : "Wt. moisture (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "وزن العينة الجافة (g)" : "Wt. dry (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "المحتوى الرطوبي %" : "Moisture %"}</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {computedLlPoints.map((p, idx) => (
                    <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.containerNo} onChange={e => updateLl(p.id, "containerNo", e.target.value)} className={`${inputCls} w-14`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.range} onChange={e => updateLl(p.id, "range", e.target.value)} className={`${inputCls} w-16`} placeholder="25-35" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.blows} onChange={e => updateLl(p.id, "blows", e.target.value)} className={`${inputCls} w-16`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.wetMass} onChange={e => updateLl(p.id, "wetMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.dryMass} onChange={e => updateLl(p.id, "dryMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={p.tinMass} onChange={e => updateLl(p.id, "tinMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className={greenCell}>{p.wtMoisture != null ? p.wtMoisture.toFixed(2) : "—"}</td>
                      <td className={greenCell}>{p.wtDry != null ? p.wtDry.toFixed(2) : "—"}</td>
                      <td className={greenCell}>{p.waterContent != null ? p.waterContent.toFixed(2) : "—"}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <button type="button" onClick={() => removeLl(p.id)} disabled={submitted} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ll !== undefined && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-center inline-block">
                <p className="text-xs text-blue-600 font-semibold">{ar ? "حد السيولة (LL) عند 25 ضربة" : "Liquid Limit (LL) at 25 blows"}</p>
                <p className="text-2xl font-bold text-blue-800">{llReported}%</p>
                {flowCurve && <p className="text-[11px] text-blue-500">{ar ? "معامل السيولة:" : "Flow Index:"} {flowCurve.flowIndex}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Flow Curve Chart */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "منحنى السيولة (كاساغراندي)" : "Flow Curve (Casagrande)"}</CardTitle></CardHeader>
          <CardContent>
            {chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="blows"
                    type="number"
                    scale="log"
                    domain={[10, 50]}
                    ticks={[10, 15, 20, 25, 30, 40, 50]}
                    tick={{ fontSize: 10 }}
                    label={{ value: ar ? "عدد الضربات (N)" : "Number of Blows (N)", position: "insideBottom", offset: -12, fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="wc"
                    type="number"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10 }}
                    label={{ value: ar ? "المحتوى الرطوبي (%)" : "Water Content (%)", angle: -90, position: "insideLeft", fontSize: 10 }}
                  />
                  <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                  <Scatter name="Test Points" data={chartData} dataKey="wc" fill="#2563eb" line={{ stroke: "#2563eb", strokeWidth: 2 }} />
                  <ReferenceLine x={25} stroke="#10b981" strokeDasharray="4 4" label={{ value: "25 blows", position: "top", fontSize: 10, fill: "#10b981" }} />
                  {ll !== undefined && (
                    <ReferenceLine y={ll} stroke="#10b981" strokeDasharray="4 4" label={{ value: `LL = ${llReported}%`, position: "insideTopRight", fontSize: 10, fontWeight: 700, fill: "#059669" }} />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm text-center">
                <p>{ar ? "أدخل نقطتين على الأقل لعرض المنحنى" : "Enter at least 2 LL data points to display flow curve"}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plastic Limit */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "حد اللدونة (طريقة فتل الخيط)" : "Plastic Limit (Thread Rolling Method)"}</CardTitle>
              <Button variant="outline" size="sm" className="gap-1" disabled={submitted}
                onClick={() => setPlRows(p => [...p, { id: `pl${Date.now()}`, containerNo: "", wetMass: "", dryMass: "", tinMass: "" }])}>
                <Plus size={14} /> {ar ? "إضافة" : "Add"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={thCls}>{ar ? "رقم الوعاء" : "Container No."}</th>
                    <th className={thCls}>{ar ? "وعاء + عينة رطبة (g)" : "Cont.+wet (g)"}</th>
                    <th className={thCls}>{ar ? "وعاء + عينة جافة (g)" : "Cont.+dry (g)"}</th>
                    <th className={thCls}>{ar ? "وزن الوعاء (g)" : "Container (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "وزن الرطوبة (g)" : "Wt. moisture (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "وزن العينة الجافة (g)" : "Wt. dry (g)"}</th>
                    <th className={`${thCls} bg-green-50`}>{ar ? "المحتوى الرطوبي %" : "Moisture %"}</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {computedPlRows.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1"><Input value={r.containerNo} onChange={e => updatePl(r.id, "containerNo", e.target.value)} className={`${inputCls} w-14`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={r.wetMass} onChange={e => updatePl(r.id, "wetMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={r.dryMass} onChange={e => updatePl(r.id, "dryMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className="border border-slate-200 px-1 py-1"><Input value={r.tinMass} onChange={e => updatePl(r.id, "tinMass", e.target.value)} className={`${inputCls} w-20`} placeholder="—" disabled={submitted} /></td>
                      <td className={greenCell}>{r.wtMoisture != null ? r.wtMoisture.toFixed(2) : "—"}</td>
                      <td className={greenCell}>{r.wtDry != null ? r.wtDry.toFixed(2) : "—"}</td>
                      <td className={greenCell}>{r.waterContent != null ? r.waterContent.toFixed(2) : "—"}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <button type="button" onClick={() => removePl(r.id)} disabled={submitted} className="text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pl !== undefined && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center inline-block">
                <p className="text-xs text-amber-600 font-semibold">{ar ? "حد اللدونة (PL) = متوسط المحتوى الرطوبي" : "Plastic Limit (PL) = average moisture content"}</p>
                <p className="text-2xl font-bold text-amber-800">{plReported}%</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results summary */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "النتائج" : "Results"}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={thCls}>{ar ? "النسبة المارة 0.425 مم" : "% Passing 0.425 mm"}</th>
                    <th className={thCls}>{ar ? "حد اللدونة (PL)" : "Plastic Limit (PL)"}</th>
                    <th className={thCls}>{ar ? "حد السيولة (LL)" : "Liquid Limit (LL)"}</th>
                    <th className={thCls}>{ar ? "مؤشر اللدونة (PI)" : "Plasticity Index (PI)"}</th>
                    <th className={thCls}>{ar ? "التصنيف" : "Classification"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono font-bold">{passing0425 !== "" ? `${passing0425}%` : "—"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono font-bold text-amber-800">{plReported ?? "—"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono font-bold text-blue-800">{llReported ?? "—"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono font-bold text-purple-800">{piReported ?? "—"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center text-xs">{classification ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {ar
                ? "PI = LL − PL. تُقرّب الحدود لأقرب رقم صحيح (ASTM D4318)."
                : "PI = LL − PL. Limits are reported to the nearest whole number (ASTM D4318)."}
            </p>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
