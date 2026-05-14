import { useEffect, useMemo, useState } from "react";
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

// ─── Cement Setting Time (BS EN 196-3) — OPC / MSRC only ─────────────────────
const CEMENT_TYPES = {
  OPC: {
    label: "OPC",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
  MSRC: {
    label: "MSRC",
    initialSetMin: 60,
    finalSetMax: 600,
    standard: "BS EN 196-3",
    code: "CEM_SETTING_TIME",
  },
} as const;

type CementType = keyof typeof CEMENT_TYPES;

const LEGACY_CEMENT_TO_TYPE: Record<string, CementType> = {
  OPC: "OPC",
  MSRC: "MSRC",
  CEM_I_42_5: "OPC",
  CEM_I_52_5: "OPC",
  CEM_II_32_5: "OPC",
  CEM_II: "OPC",
  CEM_III: "OPC",
  CEM_IV: "OPC",
  CEM_V: "OPC",
  ASTM_TYPE_I: "OPC",
};

interface PenetrationReading {
  id: string;
  needleReading: string;
  /** Wall-clock time (HH:mm), technician input */
  actualTime: string;
}

function newReading(id: string): PenetrationReading {
  return { id, needleReading: "", actualTime: "" };
}

/** Elapsed H:MM from test start to row actual clock time (24h wrap). */
function calculateElapsedTime(startTime: string, actualTime: string): string {
  if (!startTime?.includes(":") || !actualTime?.includes(":")) return "—";
  const [startH, startM] = startTime.split(":").map(Number);
  const [actualH, actualM] = actualTime.split(":").map(Number);
  if (![startH, startM, actualH, actualM].every(n => Number.isFinite(n))) return "—";
  const startMinutes = startH * 60 + startM;
  let actualMinutes = actualH * 60 + actualM;
  if (actualMinutes < startMinutes) actualMinutes += 24 * 60;
  const diffMinutes = actualMinutes - startMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function elapsedRowToActualHHMM(startTime: string, elapsedHoursStr: string, elapsedMinutesStr: string): string {
  if (!startTime?.includes(":")) return "";
  const eh = parseInt(elapsedHoursStr, 10);
  const em = parseInt(elapsedMinutesStr, 10);
  if (!Number.isFinite(eh) || !Number.isFinite(em)) return "";
  const [sh, sm] = startTime.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return "";
  let total = sh * 60 + sm + eh * 60 + em;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function totalMinutesFromParts(hStr: string, mStr: string): number | null {
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function normalizeLoadedReadings(raw: unknown[], startTime: string): PenetrationReading[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ["r1", "r2", "r3", "r4", "r5", "r6"].map(id => newReading(id));
  }
  return raw.map((item: any, i: number) => {
    const id = String(item?.id ?? `r${i + 1}`);
    const needle = item?.needleReading != null ? String(item.needleReading) : "";
    let actual = item?.actualTime != null ? String(item.actualTime) : "";
    if (!actual && (item?.elapsedHours != null || item?.elapsedMinutes != null)) {
      actual = elapsedRowToActualHHMM(
        startTime,
        String(item.elapsedHours ?? ""),
        String(item.elapsedMinutes ?? ""),
      );
    }
    return { id, needleReading: needle, actualTime: actual };
  });
}

export default function CementSettingTime() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [cementType, setCementType] = useState<CementType>("OPC");
  const [cementWeight, setCementWeight] = useState("");
  const [waterVolume, setWaterVolume] = useState("");
  const [startingTime, setStartingTime] = useState("");
  const [endingTime, setEndingTime] = useState("");
  const [testTemp, setTestTemp] = useState("");
  const [cementBatch, setCementBatch] = useState("");
  const [notes, setNotes] = useState("");
  const [readings, setReadings] = useState<PenetrationReading[]>(() =>
    ["r1", "r2", "r3", "r4", "r5", "r6"].map(id => newReading(id)),
  );

  const [initialSetHours, setInitialSetHours] = useState("");
  const [initialSetMinutes, setInitialSetMinutes] = useState("");

  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const spec = CEMENT_TYPES[cementType];

  const standardConsistencyPct = useMemo(() => {
    const cement = parseFloat(cementWeight);
    const water = parseFloat(waterVolume);
    if (!cement || !water || cement <= 0) return null;
    const wc = (water / cement) * 100;
    return Math.round(wc);
  }, [cementWeight, waterVolume]);

  const computedConsistencyPctRaw = useMemo(() => {
    const cement = parseFloat(cementWeight);
    const water = parseFloat(waterVolume);
    if (!cement || !water || cement <= 0) return null;
    return (water / cement) * 100;
  }, [cementWeight, waterVolume]);

  const finalSettingTime = useMemo(() => {
    if (!startingTime?.includes(":") || !endingTime?.includes(":")) return null;
    const [startH, startM] = startingTime.split(":").map(Number);
    const [endH, endM] = endingTime.split(":").map(Number);
    if (![startH, startM, endH, endM].every(n => Number.isFinite(n))) return null;
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes < startMinutes) endMinutes += 24 * 60;
    const diffMinutes = endMinutes - startMinutes;
    return {
      hours: Math.floor(diffMinutes / 60),
      minutes: diffMinutes % 60,
      totalMinutes: diffMinutes,
    };
  }, [startingTime, endingTime]);

  const initialSetTotalMinutes = useMemo(
    () => totalMinutesFromParts(initialSetHours, initialSetMinutes),
    [initialSetHours, initialSetMinutes],
  );

  const finalSetTotalMinutes = finalSettingTime?.totalMinutes ?? null;

  const initialSetPass =
    initialSetTotalMinutes != null ? initialSetTotalMinutes >= spec.initialSetMin : null;
  const finalSetPass =
    finalSetTotalMinutes != null ? finalSetTotalMinutes <= spec.finalSetMax : null;

  const initialSetResult: "pass" | "fail" | "pending" =
    initialSetPass === null ? "pending" : initialSetPass ? "pass" : "fail";
  const finalSetResult: "pass" | "fail" | "pending" =
    finalSetPass === null ? "pending" : finalSetPass ? "pass" : "fail";

  const overallResult: "pass" | "fail" | "pending" =
    initialSetTotalMinutes == null || finalSetTotalMinutes == null
      ? "pending"
      : initialSetPass && finalSetPass
        ? "pass"
        : "fail";

  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    const ct = fd.cementType != null ? String(fd.cementType) : "OPC";
    setCementType(LEGACY_CEMENT_TO_TYPE[ct] ?? "OPC");
    if (fd.cementWeight != null && fd.cementWeight !== "") setCementWeight(String(fd.cementWeight));
    if (fd.waterVolume != null && fd.waterVolume !== "") setWaterVolume(String(fd.waterVolume));
    if (typeof fd.startingTime === "string" && fd.startingTime) setStartingTime(fd.startingTime);
    if (typeof fd.endingTime === "string" && fd.endingTime) setEndingTime(fd.endingTime);
    if (fd.testTemp != null && fd.testTemp !== "") setTestTemp(String(fd.testTemp));
    if (typeof fd.cementBatch === "string") setCementBatch(fd.cementBatch);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (Array.isArray(fd.readings)) {
      setReadings(normalizeLoadedReadings(fd.readings as unknown[], String(fd.startingTime ?? "")));
    }
    if (fd.initialSetHours != null) setInitialSetHours(String(fd.initialSetHours));
    if (fd.initialSetMinutes != null) setInitialSetMinutes(String(fd.initialSetMinutes));
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [existing, hydrated]);

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
    if (status === "submitted") {
      if (!cementWeight.trim() || !waterVolume.trim()) {
        toast.error(ar ? "أدخل وزن الأسمنت وحجم الماء" : "Please enter both cement weight and water volume");
        return;
      }
      if (!cementType) {
        toast.error(ar ? "اختر نوع الأسمنت (MSRC أو OPC)" : "Please select cement type (MSRC or OPC)");
        return;
      }
      if (!startingTime || !endingTime) {
        toast.error(ar ? "أدخل وقت البدء ووقت الانتهاء" : "Please enter both starting and ending time");
        return;
      }
      if (finalSettingTime == null) {
        toast.error(ar ? "أوقات غير صالحة لحساب زمن الشك النهائي" : "Invalid times for final setting calculation");
        return;
      }
      if (initialSetTotalMinutes == null) {
        toast.error(ar ? "أدخل زمن الشك الابتدائي (ساعات ودقائق)" : "Enter initial setting time (hours and minutes)");
        return;
      }
    }
    setSaving(true);
    try {
      const waterContentOut =
        standardConsistencyPct != null ? String(standardConsistencyPct) : "";
      const readingsOut = readings.map(r => ({
        id: r.id,
        needleReading: r.needleReading,
        actualTime: r.actualTime,
        elapsedDisplay: calculateElapsedTime(startingTime, r.actualTime),
      }));
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
          standardConsistency: standardConsistencyPct,
          computedConsistencyPct: computedConsistencyPctRaw,
          startingTime,
          endingTime,
          testTemp,
          cementBatch,
          readings: readingsOut,
          initialSetHours,
          initialSetMinutes,
          initialSetTotalMinutes,
          finalSetHours: finalSettingTime != null ? String(finalSettingTime.hours) : "",
          finalSetMinutes: finalSettingTime != null ? String(finalSettingTime.minutes) : "",
          finalSetTotalMinutes,
          initialSetPass: initialSetTotalMinutes != null ? initialSetTotalMinutes >= spec.initialSetMin : null,
          finalSetPass: finalSetTotalMinutes != null ? finalSetTotalMinutes <= spec.finalSetMax : null,
          initialSet: initialSetTotalMinutes,
          finalSet: finalSetTotalMinutes,
          initialSettingTime: initialSetTotalMinutes,
          finalSettingTime: finalSetTotalMinutes,
          overallResult,
          waterContent: waterContentOut,
          finalSettingCalculatedFromClock: true,
        },
        overallResult,
        summaryValues: {
          cementType: spec.label,
          initialSet: initialSetTotalMinutes,
          finalSet: finalSetTotalMinutes,
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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">
                Cement Sample Preparation / إعداد العينة الخاصة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Weight of Cement (g) / وزن الأسمنت (جم) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={cementWeight}
                    onChange={e => setCementWeight(e.target.value)}
                    placeholder={ar ? "مثال: 500" : "e.g. 500"}
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Volume of Water (ml) / حجم الماء المضاف (مل) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={waterVolume}
                    onChange={e => setWaterVolume(e.target.value)}
                    placeholder={ar ? "مثال: 138" : "e.g. 138"}
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600 leading-snug">
                    Standard Consistency (%) / نسبة الماء للتطبيع القياسي (%)
                  </Label>
                  <Input
                    type="number"
                    value={standardConsistencyPct ?? ""}
                    readOnly
                    className="font-mono bg-slate-100 cursor-not-allowed"
                    placeholder={ar ? "يُحسب تلقائياً" : "Auto-calculated"}
                  />
                  <p className="text-xs text-slate-500">
                    {ar ? "محسوب (ماء/أسمنت × 100)، تقريب لأقرب عدد صحيح:" : "Calculated (w/c × 100), rounded to integer:"}{" "}
                    {standardConsistencyPct != null ? `${standardConsistencyPct}%` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "نوع الأسمنت" : "Cement Type"} <span className="text-red-500">*</span>
                </Label>
                <Select value={cementType} onValueChange={v => setCementType(v as CementType)}>
                  <SelectTrigger>
                    <SelectValue placeholder={ar ? "اختر النوع" : "Select cement type"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MSRC">MSRC</SelectItem>
                    <SelectItem value="OPC">OPC</SelectItem>
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
                <Label className="text-xs text-slate-600">
                  Starting Time / وقت البدء <span className="text-red-500">*</span>
                </Label>
                <Input type="time" value={startingTime} onChange={e => setStartingTime(e.target.value)} className="font-mono" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">
                  Ending Time / وقت الانتهاء <span className="text-red-500">*</span>
                </Label>
                <Input type="time" value={endingTime} onChange={e => setEndingTime(e.target.value)} className="font-mono" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <span className="font-semibold">{ar ? "زمن الشك الابتدائي:" : "Initial set requirement:"}</span> ≥ {spec.initialSetMin}{" "}
                min ({formatTimeMin(spec.initialSetMin)})
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <span className="font-semibold">{ar ? "زمن الشك النهائي:" : "Final set requirement:"}</span> ≤ {spec.finalSetMax}{" "}
                min ({formatTimeMin(spec.finalSetMax)}) — {ar ? "يُحسب من الفرق بين وقت الانتهاء والبدء" : "from end − start time"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">
                {ar ? "قراءات الإبرة (سجل)" : "Penetration / needle readings (record)"}
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
                      Time
                      <br />
                      <span className="font-normal text-xs text-slate-500">الوقت الفعلي — HOUR : MIN</span>
                    </th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center font-medium text-slate-700">
                      Time Elapsed
                      <br />
                      <span className="font-normal text-xs text-slate-500">الوقت المنقضي — HOUR : MIN</span>
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
                          max={10}
                          step={0.1}
                          value={r.needleReading}
                          onChange={e => updateReading(r.id, "needleReading", e.target.value)}
                          placeholder="0–10"
                          className="h-8 text-xs w-20 font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-300 px-1 py-1 align-middle">
                        <Input
                          type="time"
                          value={r.actualTime}
                          onChange={e => updateReading(r.id, "actualTime", e.target.value)}
                          className="h-8 text-xs w-32 font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono text-sm text-blue-600 align-middle">
                        {calculateElapsedTime(startingTime, r.actualTime)}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-center align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() => setReadings(p => p.filter(x => x.id !== r.id))}
                          disabled={readings.length <= 1 || submitted}
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
                ? "أدخل الوقت الفعلي لكل قراءة؛ يُحسب المنقضي من وقت البدء. زمن الشك الابتدائي يُدخل يدوياً؛ النهائي من وقت الانتهاء − البدء."
                : "Enter actual clock time per row; elapsed is from start time. Initial set is manual; final set is Ending − Starting time."}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="border border-slate-300 rounded-lg p-4 bg-white">
            <label className="block text-sm font-medium text-slate-800 mb-2">
              Initial Setting Time / زمن الشك الابتدائي
            </label>
            <div className="flex gap-2 items-center mb-2">
              <Input
                type="number"
                min={0}
                value={initialSetHours}
                onChange={e => setInitialSetHours(e.target.value)}
                placeholder="H"
                className="w-20 font-mono"
                disabled={submitted}
              />
              <span className="text-slate-500">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={initialSetMinutes}
                onChange={e => setInitialSetMinutes(e.target.value)}
                placeholder="MM"
                className="w-20 font-mono"
                disabled={submitted}
              />
            </div>
            <p className="text-xs text-slate-500">
              Requirement: ≥ {spec.initialSetMin} min ({spec.standard})
            </p>
            {initialSetTotalMinutes != null && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {initialSetPass ? (
                  <span className="text-emerald-600 font-bold">✓ PASS</span>
                ) : (
                  <span className="text-red-600 font-bold">✗ FAIL</span>
                )}
                <span className="text-xs text-slate-500">({formatTimeMin(initialSetTotalMinutes)} total)</span>
                <PassFailBadge result={initialSetResult} lang={lang} />
              </div>
            )}
          </div>

          <div className="border border-slate-300 rounded-lg p-4 bg-orange-50">
            <label className="block text-sm font-medium text-slate-800 mb-2">
              Final Setting Time / زمن الشك النهائي
            </label>
            <div className="text-2xl font-bold text-orange-700 font-mono mb-1">
              {finalSettingTime
                ? `${finalSettingTime.hours}:${String(finalSettingTime.minutes).padStart(2, "0")}`
                : "—"}
            </div>
            <p className="text-xs text-slate-600">
              {ar ? "محسوب: وقت الانتهاء − وقت البدء" : "Calculated: Ending time − Starting time"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Requirement: ≤ {spec.finalSetMax} min ({formatTimeMin(spec.finalSetMax)} max)
            </p>
            {finalSettingTime != null && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {finalSetPass ? (
                  <span className="text-emerald-600 font-bold">✓ PASS</span>
                ) : (
                  <span className="text-red-600 font-bold">✗ FAIL</span>
                )}
                <span className="text-xs text-slate-500">({formatTimeMin(finalSettingTime.totalMinutes)} total)</span>
                <PassFailBadge result={finalSetResult} lang={lang} />
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
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
