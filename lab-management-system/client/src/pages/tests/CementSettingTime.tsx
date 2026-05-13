import { useMemo, useState } from "react";
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
import { Send, FlaskConical, Plus, Trash2, Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Cement Setting Time (BS EN 196-3 / ASTM C191) ───────────────────────────
const CEMENT_TYPES = {
  "CEM_I_42_5": {
    label: "CEM I 42.5 (OPC)",
    initialSetMin: 60,
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
} as const;

type CementType = keyof typeof CEMENT_TYPES;

/** Vicat needle reading (0–10 scale or mm index). First row meeting threshold → setting time. */
const INITIAL_SET_NEEDLE = 5;
const FINAL_SET_NEEDLE = 10;

interface PenetrationReading {
  id: string;
  needleReading: string;
  elapsedHours: string;
  elapsedMinutes: string;
  /** Legacy (minutes from water addition) */
  time?: string;
  /** Legacy penetration (mm) */
  penetration?: string;
}

function newReading(id: string): PenetrationReading {
  return { id, needleReading: "", elapsedHours: "", elapsedMinutes: "" };
}

function rowElapsedMinutes(r: PenetrationReading): number | null {
  const hasElapsed =
    (r.elapsedHours != null && r.elapsedHours !== "") ||
    (r.elapsedMinutes != null && r.elapsedMinutes !== "");
  if (hasElapsed) {
    const h = parseInt(r.elapsedHours, 10);
    const m = parseInt(r.elapsedMinutes, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }
  if (r.time !== undefined && r.time !== "") {
    const t = parseFloat(r.time);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function rowNeedleValue(r: PenetrationReading): number | null {
  if (r.needleReading !== undefined && r.needleReading !== "") {
    const n = parseFloat(r.needleReading);
    return Number.isFinite(n) ? n : null;
  }
  if (r.penetration !== undefined && r.penetration !== "") {
    const p = parseFloat(r.penetration);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

/** Clock time from start (HH:mm) + elapsed H:M. */
function calculateActualTime(startTime: string, elapsedHoursStr: string, elapsedMinutesStr: string): string {
  if (!startTime?.includes(":")) return "—";
  const [shRaw, smRaw] = startTime.split(":");
  const sh = parseInt(shRaw, 10);
  const sm = parseInt(smRaw, 10);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return "—";
  const eh = parseInt(elapsedHoursStr, 10);
  const em = parseInt(elapsedMinutesStr, 10);
  if (!Number.isFinite(eh) || !Number.isFinite(em)) return "—";
  let total = sh * 60 + sm + eh * 60 + em;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatElapsedHhMm(readings: PenetrationReading[], pred: (needle: number) => boolean): string {
  const row = readings.find(r => {
    const n = rowNeedleValue(r);
    return n != null && pred(n);
  });
  if (!row) return "—";
  const em = rowElapsedMinutes(row);
  if (em == null) return "—";
  const h = Math.floor(em / 60);
  const m = em % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function firstRowElapsedMinutes(readings: PenetrationReading[], pred: (needle: number) => boolean): number | null {
  const row = readings.find(r => {
    const n = rowNeedleValue(r);
    return n != null && pred(n);
  });
  if (!row) return null;
  return rowElapsedMinutes(row);
}

export default function CementSettingTime() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [cementType, setCementType] = useState<CementType>("CEM_I_42_5");
  const [cementWeight, setCementWeight] = useState("500");
  const [waterVolume, setWaterVolume] = useState("");
  const [standardConsistency, setStandardConsistency] = useState("");
  const [startingTime, setStartingTime] = useState("09:00");
  const [endingTime, setEndingTime] = useState("");
  const [testTemp, setTestTemp] = useState("20");
  const [cementBatch, setCementBatch] = useState("");
  const [notes, setNotes] = useState("");
  const [readings, setReadings] = useState<PenetrationReading[]>(() =>
    ["r1", "r2", "r3", "r4", "r5", "r6"].map(id => newReading(id)),
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = CEMENT_TYPES[cementType];

  const computedConsistencyPct = useMemo(() => {
    const cw = parseFloat(cementWeight);
    const wv = parseFloat(waterVolume);
    if (!cw || !wv || cw <= 0) return null;
    return (wv / cw) * 100;
  }, [cementWeight, waterVolume]);

  const chartRows = useMemo(() => {
    return readings
      .map(r => {
        const t = rowElapsedMinutes(r);
        const needle = rowNeedleValue(r);
        if (t == null || needle == null) return null;
        return { timeMin: t, needle, label: `${t}` };
      })
      .filter((x): x is { timeMin: number; needle: number; label: string } => x != null)
      .sort((a, b) => a.timeMin - b.timeMin);
  }, [readings]);

  const needleMax = useMemo(() => {
    if (!chartRows.length) return 10;
    const m = Math.max(10, ...chartRows.map(r => r.needle));
    return Number.isFinite(m) ? m : 10;
  }, [chartRows]);

  const initialSetMin = firstRowElapsedMinutes(readings, n => n >= INITIAL_SET_NEEDLE);
  const finalSetMin = firstRowElapsedMinutes(readings, n => n >= FINAL_SET_NEEDLE);

  const initialSetDisplay = formatElapsedHhMm(readings, n => n >= INITIAL_SET_NEEDLE);
  const finalSetDisplay = formatElapsedHhMm(readings, n => n >= FINAL_SET_NEEDLE);

  const initialSetResult: "pass" | "fail" | "pending" =
    initialSetMin != null ? (initialSetMin >= spec.initialSetMin ? "pass" : "fail") : "pending";
  const finalSetResult: "pass" | "fail" | "pending" =
    finalSetMin != null ? (finalSetMin <= spec.finalSetMax ? "pass" : "fail") : "pending";

  const overallResult: "pass" | "fail" | "pending" =
    initialSetResult === "pending" && finalSetResult === "pending"
      ? "pending"
      : initialSetResult === "pass" && finalSetResult === "pass"
        ? "pass"
        : "fail";

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const updateReading = (id: string, field: keyof PenetrationReading, value: string) => {
    setReadings(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const formatTimeMin = (min: number) => {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && chartRows.length < 2) {
      toast.error(ar ? "الرجاء إدخال قراءتين صالحتين على الأقل" : "Please enter at least 2 valid readings");
      return;
    }
    setSaving(true);
    try {
      const waterContentOut = standardConsistency.trim() || (computedConsistencyPct != null ? String(computedConsistencyPct.toFixed(1)) : "");
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "cement_setting_time",
        formData: {
          cementType,
          spec,
          cementWeight,
          waterVolume,
          standardConsistency,
          computedConsistencyPct,
          startingTime,
          endingTime,
          testTemp,
          cementBatch,
          readings,
          initialSet: initialSetMin ?? null,
          finalSet: finalSetMin ?? null,
          initialSettingTime: initialSetMin,
          finalSettingTime: finalSetMin,
          initialSetDisplay,
          finalSetDisplay,
          overallResult,
          waterContent: waterContentOut,
        },
        overallResult,
        summaryValues: {
          cementType: spec.label,
          initialSet: initialSetMin,
          finalSet: finalSetMin,
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

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسمنت / زمن الشك" : "Cement Tests / Setting Time"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "زمن شك الأسمنت (إبرة فيكات)" : "Cement Setting Time (Vicat Needle)"}
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
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving || submitted}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {/* Cement sample preparation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">
                Cement Sample Preparation / إعداد العينة الخاصة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Weight of Cement (g) / وزن الأسمنت (جم)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={cementWeight}
                    onChange={e => setCementWeight(e.target.value)}
                    placeholder="500"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Volume of Water (ml) / حجم الماء المضاف (مل)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={waterVolume}
                    onChange={e => setWaterVolume(e.target.value)}
                    placeholder="138"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Standard Consistency (%) / نسبة الماء للتطبيع القياسي (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={standardConsistency}
                    onChange={e => setStandardConsistency(e.target.value)}
                    className="font-bold font-mono"
                    placeholder={computedConsistencyPct != null ? computedConsistencyPct.toFixed(1) : ""}
                  />
                  <p className="text-xs text-slate-500">
                    {ar ? "محسوب من الماء/أسمنت:" : "Calculated (w/c × 100):"}{" "}
                    {computedConsistencyPct != null ? `${computedConsistencyPct.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الأسمنت" : "Cement Type"}</Label>
                <Select value={cementType} onValueChange={v => setCementType(v as CementType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CEMENT_TYPES).map(([k, s]) => (
                      <SelectItem key={k} value={k}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Starting Time / وقت البدء</Label>
                <Input type="time" value={startingTime} onChange={e => setStartingTime(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Ending Time / وقت الانتهاء</Label>
                <Input type="time" value={endingTime} onChange={e => setEndingTime(e.target.value)} className="font-mono bg-slate-50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <span className="font-semibold">{ar ? "زمن الشك الابتدائي:" : "Initial set requirement:"}</span> ≥ {spec.initialSetMin}{" "}
                min ({formatTimeMin(spec.initialSetMin)})
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <span className="font-semibold">{ar ? "زمن الشك النهائي:" : "Final set requirement:"}</span> ≤ {spec.finalSetMax}{" "}
                min ({formatTimeMin(spec.finalSetMax)})
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">
                  {ar ? "قراءات الإبرة" : "Penetration / Needle Readings"}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setReadings(p => [...p, newReading(`r_${Date.now()}`)])}>
                  <Plus size={14} className="mr-1" /> {ar ? "إضافة صف" : "Add row"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">
                        Needle Reading
                        <br />
                        <span className="font-normal text-xs text-slate-500">قراءة الإبرة (0–10)</span>
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">
                        Time Elapsed
                        <br />
                        <span className="font-normal text-xs text-slate-500">HOUR : MIN — الوقت المنقضي</span>
                      </th>
                      <th className="border border-slate-300 px-2 py-1.5 text-center font-medium text-slate-700">
                        Time
                        <br />
                        <span className="font-normal text-xs text-slate-500">HOUR : MIN — الوقت الفعلي</span>
                      </th>
                      <th className="border border-slate-300 w-12" aria-label="delete" />
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map(r => (
                      <tr key={r.id}>
                        <td className="border border-slate-300 px-1 py-1 align-middle">
                          <Input
                            type="number"
                            min={0}
                            max={15}
                            value={r.needleReading}
                            onChange={e => updateReading(r.id, "needleReading", e.target.value)}
                            placeholder="0–10"
                            className="h-8 text-xs w-20 font-mono"
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1 align-middle">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              value={r.elapsedHours}
                              onChange={e => updateReading(r.id, "elapsedHours", e.target.value)}
                              placeholder="H"
                              className="h-8 text-xs w-14 font-mono text-center"
                            />
                            <span className="text-slate-500">:</span>
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              value={r.elapsedMinutes}
                              onChange={e => updateReading(r.id, "elapsedMinutes", e.target.value)}
                              placeholder="MM"
                              className="h-8 text-xs w-14 font-mono text-center"
                            />
                          </div>
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-mono text-sm text-emerald-700 align-middle">
                          {calculateActualTime(startingTime, r.elapsedHours, r.elapsedMinutes)}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => setReadings(p => p.filter(x => x.id !== r.id))}
                            disabled={readings.length <= 1}
                            aria-label={ar ? "حذف" : "Delete"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {ar
                  ? `الشك الابتدائي: أول قراءة بإبرة ≥ ${INITIAL_SET_NEEDLE}. الشك النهائي: أول قراءة ≥ ${FINAL_SET_NEEDLE}.`
                  : `Initial set: first reading with needle ≥ ${INITIAL_SET_NEEDLE}. Final set: first reading with needle ≥ ${FINAL_SET_NEEDLE}.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "منحنى القراءة مقابل الزمن" : "Needle reading vs. elapsed time"}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartRows.length >= 2 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartRows} margin={{ top: 10, right: 10, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="timeMin"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tick={{ fontSize: 10 }}
                      label={{
                        value: ar ? "الوقت المنقضي (دقيقة)" : "Time elapsed (min)",
                        position: "insideBottom",
                        offset: -14,
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      dataKey="needle"
                      tick={{ fontSize: 10 }}
                      label={{
                        value: ar ? "قراءة الإبرة" : "Needle reading",
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 10,
                      }}
                      domain={[0, needleMax]}
                    />
                    <Tooltip
                      formatter={(v: number) => [String(v), ar ? "إبرة" : "Needle"]}
                      labelFormatter={v => `${ar ? "دقيقة" : "min"}: ${v}`}
                    />
                    <ReferenceLine
                      y={INITIAL_SET_NEEDLE}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{
                        value: ar ? `ابتدائي (≥${INITIAL_SET_NEEDLE})` : `Initial (≥${INITIAL_SET_NEEDLE})`,
                        position: "right",
                        fontSize: 9,
                        fill: "#f59e0b",
                      }}
                    />
                    <ReferenceLine
                      y={FINAL_SET_NEEDLE}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: ar ? `نهائي (≥${FINAL_SET_NEEDLE})` : `Final (≥${FINAL_SET_NEEDLE})`,
                        position: "right",
                        fontSize: 9,
                        fill: "#ef4444",
                      }}
                    />
                    <Line type="monotone" dataKey="needle" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-56 flex items-center justify-center text-slate-400 text-sm text-center border border-dashed rounded-lg">
                  <p>
                    {ar ? "أدخل قراءتين صالحتين (زمن + إبرة)" : "Enter at least 2 valid rows (elapsed time + needle)"}
                    <br />
                    {ar ? "لعرض الرسم البياني" : "to plot the chart"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-300 rounded-lg">
          <div className="text-center md:border-e md:border-slate-300 md:pe-4">
            <p className="text-sm text-slate-600 mb-1">
              Initial Setting Time / زمن الشك الابتدائي
            </p>
            <p className="text-2xl font-bold text-emerald-700 font-mono">{initialSetDisplay}</p>
            <p className="text-xs text-slate-500 mt-1">
              {initialSetMin != null ? `${formatTimeMin(initialSetMin)} total` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Requirement: ≥ {spec.initialSetMin} min ({spec.standard})
            </p>
            {initialSetResult !== "pending" && (
              <div className="mt-2 flex justify-center">
                <PassFailBadge result={initialSetResult} />
              </div>
            )}
          </div>
          <div className="text-center md:ps-4">
            <p className="text-sm text-slate-600 mb-1">
              Final Setting Time / زمن الشك النهائي
            </p>
            <p className="text-2xl font-bold text-red-700 font-mono">{finalSetDisplay}</p>
            <p className="text-xs text-slate-500 mt-1">
              {finalSetMin != null ? `${formatTimeMin(finalSetMin)} total` : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Requirement: ≤ {spec.finalSetMax} min ({formatTimeMin(spec.finalSetMax)} max)
            </p>
            {finalSetResult !== "pending" && (
              <div className="mt-2 flex justify-center">
                <PassFailBadge result={finalSetResult} />
              </div>
            )}
          </div>
        </div>

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
