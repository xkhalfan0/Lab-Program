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
import { Send, FlaskConical, Plus, Trash2 , UserCheck , Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Cement Setting Time (BS EN 196-3 / ASTM C191) ───────────────────────────
const CEMENT_TYPES = {
  "CEM_I_42_5": {
    label: "CEM I 42.5 (OPC)",
    initialSetMin: 60,  // minutes
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_I_52_5": {
    label: "CEM I 52.5 (RHPC)",
    initialSetMin: 45,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_II_32_5": {
    label: "CEM II 32.5 (PLC)",
    initialSetMin: 75,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_II": {
    label: "CEM II",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_III": {
    label: "CEM III",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_IV": {
    label: "CEM IV",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "CEM_V": {
    label: "CEM V",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  "ASTM_TYPE_I": {
    label: "ASTM Type I/II",
    initialSetMin: 45,
    finalSetMax: 375,
    standard: "ASTM C191",
    code: "CEM_SETTING_TIME",
  },
};

type CementType = keyof typeof CEMENT_TYPES;

interface PenetrationReading {
  id: string;
  time: string;    // minutes from water addition
  penetration: string; // mm
}

export default function CementSettingTime() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage(); const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [cementType, setCementType] = useState<CementType>("CEM_I_42_5");
  const [waterContent, setWaterContent] = useState("");
  const [testTemp, setTestTemp] = useState("20");
  const [cementBatch, setCementBatch] = useState("");
  const [notes, setNotes] = useState("");
  const [readings, setReadings] = useState<PenetrationReading[]>([
    { id: "r1", time: "0", penetration: "40" },
    { id: "r2", time: "30", penetration: "" },
    { id: "r3", time: "60", penetration: "" },
    { id: "r4", time: "90", penetration: "" },
    { id: "r5", time: "120", penetration: "" },
    { id: "r6", time: "150", penetration: "" },
    { id: "r7", time: "180", penetration: "" },
    { id: "r8", time: "210", penetration: "" },
    { id: "r9", time: "240", penetration: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = CEMENT_TYPES[cementType];

  // Parse valid readings
  const validReadings = readings
    .map(r => ({ time: parseFloat(r.time), pen: parseFloat(r.penetration) }))
    .filter(r => !isNaN(r.time) && !isNaN(r.pen));

  // Interpolate setting times from penetration readings
  function interpolateTime(targetPen: number): number | undefined {
    for (let i = 0; i < validReadings.length - 1; i++) {
      const a = validReadings[i];
      const b = validReadings[i + 1];
      if ((a.pen >= targetPen && b.pen <= targetPen) || (a.pen <= targetPen && b.pen >= targetPen)) {
        const denom = b.pen - a.pen;
        if (denom === 0) continue;
        const t = a.time + (targetPen - a.pen) / denom * (b.time - a.time);
        if (isNaN(t) || !isFinite(t)) continue;
        return parseFloat(t.toFixed(0));
      }
    }
    return undefined;
  }

  const initialSet = interpolateTime(25);
  // Final set: interpolate at 0mm (BS EN 196-3)
  // Fallback: if no interpolation is possible, use the last reading where penetration ≤ 0mm
  let finalSet = interpolateTime(0);
  if (finalSet === undefined && validReadings.length > 0) {
    const lastAtOrBelowZero = [...validReadings].reverse().find(r => r.pen <= 0);
    if (lastAtOrBelowZero) {
      finalSet = lastAtOrBelowZero.time;
    }
  }

  const initialSetResult: "pass" | "fail" | "pending" =
    initialSet !== undefined ? initialSet >= spec.initialSetMin ? "pass" : "fail" : "pending";
  const finalSetResult: "pass" | "fail" | "pending" =
    finalSet !== undefined ? finalSet <= spec.finalSetMax ? "pass" : "fail" : "pending";

  const overallResult: "pass" | "fail" | "pending" =
    initialSetResult === "pending" && finalSetResult === "pending" ? "pending"
    : initialSetResult === "pass" && finalSetResult === "pass" ? "pass" : "fail";

  // Chart data
  const chartData = validReadings.sort((a, b) => a.time - b.time);

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

  const updateReading = (id: string, field: keyof PenetrationReading, value: string) => {
    setReadings(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validReadings.length < 3) {
      toast.error(ar ? "الرجاء إدخال 3 قراءات اختراق على الأقل" : "Please enter at least 3 penetration readings");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "cement_setting_time",
        formData: {
          cementType,
          spec,
          waterContent,
          testTemp,
          cementBatch,
          readings,
          initialSet,
          finalSet,
          initialSettingTime: initialSet,
          finalSettingTime: finalSet,
          overallResult,
        },
        overallResult,
        summaryValues: { cementType: spec.label, initialSet, finalSet, overallResult },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
              <span>{ar ? "اختبارات الأسمنت / زمن الشك" : "Cement Tests / Setting Time"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "زمن شك الأسمنت (إبرة فيكات)" : "Cement Setting Time (Vicat Needle)"}</h1>
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
          <CardHeader>
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الأسمنت" : "Cement Type"}</Label>
                <Select value={cementType} onValueChange={v => setCementType(v as CementType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CEMENT_TYPES).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "محتوى الماء (%)" : "Water Content (%)"}</Label>
                <Input value={waterContent} onChange={e => setWaterContent(e.target.value)} className="font-mono" placeholder={ar ? "مثال: 27.5" : "e.g. 27.5"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "درجة حرارة الاختبار (°م)" : "Test Temperature (°C)"}</Label>
                <Input value={testTemp} onChange={e => setTestTemp(e.target.value)} className="font-mono" placeholder="20" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "رقم الدفعة" : "Batch / Lot No."}</Label>
                <Input value={cementBatch} onChange={e => setCementBatch(e.target.value)} placeholder={ar ? "رقم الدفعة" : "Batch number"} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-600">
                <span className="font-semibold">{ar ? "زمن الشك الابتدائي:" : "Initial Set:"}</span> ≥ {spec.initialSetMin} min ({formatTime(spec.initialSetMin)})
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-600">
                <span className="font-semibold">{ar ? "زمن الشك النهائي:" : "Final Set:"}</span> ≤ {spec.finalSetMax} min ({formatTime(spec.finalSetMax)})
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Readings Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ar ? "قراءات الاختراق" : "Penetration Readings"}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setReadings(p => [...p, { id: `r${Date.now()}`, time: "", penetration: "" }])}>
                  <Plus size={14} className="mr-1" /> {ar ? "إضافة عينة" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الوقت (دقيقة)" : "Time (min)"}</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الاختراق (مم)" : "Penetration (mm)"}</th>
                    <th className="border border-slate-200 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={r.time} onChange={e => updateReading(r.id, "time", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={r.penetration} onChange={e => updateReading(r.id, "penetration", e.target.value)} className="h-7 text-xs w-24 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setReadings(p => p.filter(x => x.id !== r.id))} disabled={readings.length <= 2}>
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
</div>
            </CardContent>
          </Card>

          {/* Setting Time Chart */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "منحنى زمن الشك" : "Setting Time Chart"}</CardTitle></CardHeader>
            <CardContent>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "الوقت (دقائق)" : "Time (minutes)", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="pen"
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "الاختراق (مم)" : "Penetration (mm)", angle: -90, position: "insideLeft", fontSize: 10 }}
                      domain={[0, 45]}
                    />
                    <Tooltip formatter={(v: number) => `${v} mm`} labelFormatter={v => `${v} min`} />
                    <ReferenceLine y={25} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: ar ? "الشك الابتدائي (25 مم)" : "Initial Set (25mm)", position: "right", fontSize: 9, fill: "#f59e0b" }} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" label={{ value: ar ? "الشك النهائي (0 مم)" : "Final Set (0mm)", position: "right", fontSize: 9, fill: "#ef4444" }} />
                    {initialSet !== undefined && <ReferenceLine x={initialSet} stroke="#f59e0b" strokeDasharray="4 4" />}
                    {finalSet !== undefined && <ReferenceLine x={finalSet} stroke="#ef4444" strokeDasharray="4 4" />}
                    <Line type="monotone" dataKey="pen" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm text-center">
                  <p>{ar ? "أدخل قراءتين على الأقل" : "Enter at least 2 readings"}<br />{ar ? "لعرض منحنى زمن الشك" : "to display the setting time curve"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Summary */}
        {(initialSet !== undefined || finalSet !== undefined) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`rounded-xl p-4 text-center border ${initialSetResult === "pass" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <p className={`text-xs font-semibold mb-1 ${initialSetResult === "pass" ? "text-emerald-600" : "text-red-600"}`}>{ar ? "زمن الشك الابتدائي" : "Initial Setting Time"}</p>
              <p className={`text-2xl font-bold ${initialSetResult === "pass" ? "text-emerald-800" : "text-red-800"}`}>
                {initialSet !== undefined ? `${initialSet} min (${formatTime(initialSet)})` : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-1">{ar ? "الحد الأدنى:" : "Min:"} {spec.initialSetMin} min</p>
              {initialSetResult !== "pending" && <div className="mt-2"><PassFailBadge result={initialSetResult} size="sm" /></div>}
            </div>
            <div className={`rounded-xl p-4 text-center border ${finalSetResult === "pass" ? "bg-emerald-50 border-emerald-200" : finalSetResult === "fail" ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-xs font-semibold mb-1 ${finalSetResult === "pass" ? "text-emerald-600" : finalSetResult === "fail" ? "text-red-600" : "text-slate-500"}`}>{ar ? "زمن الشك النهائي" : "Final Setting Time"}</p>
              <p className={`text-2xl font-bold ${finalSetResult === "pass" ? "text-emerald-800" : finalSetResult === "fail" ? "text-red-800" : "text-slate-700"}`}>
                {finalSet !== undefined ? `${finalSet} min (${formatTime(finalSet)})` : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-1">{ar ? "الحد الأقصى:" : "Max:"} {spec.finalSetMax} min</p>
              {finalSetResult !== "pending" && <div className="mt-2"><PassFailBadge result={finalSetResult} size="sm" /></div>}
            </div>
            <div className="rounded-xl p-4 text-center border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold mb-1 text-slate-500">{ar ? "محتوى الماء" : "Water Content"}</p>
              <p className="text-2xl font-bold text-slate-700">{waterContent || "—"}%</p>
              <p className="text-xs text-slate-400 mt-1">{ar ? "القوام القياسي" : "Normal consistency"}</p>
            </div>
            <div className="rounded-xl p-4 text-center border border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold mb-1 text-slate-500">{ar ? "درجة حرارة الاختبار" : "Test Temperature"}</p>
              <p className="text-2xl font-bold text-slate-700">{testTemp}°C</p>
              <p className="text-xs text-slate-400 mt-1">{ar ? "المعيار:" : "Standard:"} 20±1°C</p>
            </div>
          </div>
        )}

        {overallResult !== "pending" && (
          <ResultBanner
            result={overallResult}
            testName={ar ? `زمن شك الأسمنت — ${spec.label}` : `Cement Setting Time — ${spec.label}`}
            standard={spec.standard}
          />
        )}

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
