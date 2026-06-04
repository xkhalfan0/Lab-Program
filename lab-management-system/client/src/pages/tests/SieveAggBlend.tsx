/**
 * SieveAggBlend — Combined "mix-design blend" sieve analysis for concrete aggregates.
 *
 * Each aggregate size (20mm, 10mm, 0-5mm, Dune Sand, …) is registered by Reception
 * as its own distribution/sample (for pricing), but they cannot be evaluated apart:
 * the final grading is the BLEND of all sizes. So this page shows ONE shared
 * worksheet with a column per size, and a single Submit writes the same combined
 * result to every sibling size-distribution — completing the whole batch at once.
 *
 *   %ge used (per size) = mix-design qty / Σ(mix-design qty) × 100
 *   Required (size, sieve) = %ge used × Original Grad / 100
 *   Blend (sieve) = Σ Required across all sizes
 *   Pass = Lower ≤ Blend ≤ Upper
 */
import { Fragment, useEffect, useMemo, useState } from "react";
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
import { Send, FlaskConical, Info, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { GradationCurveChart } from "@/components/GradationCurveChart";
import { extractedSieveLegendItems } from "@/components/GradationChartLegend";
import { formatDisplaySieveMm } from "./SieveAnalysis";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

const LIMIT_EPS = 0.05;

type AggSpecRow = { mm: number; lower: number | null; upper: number | null };

/**
 * Concrete-aggregate blend specifications.
 * MSRC limits are from the lab's "ALL IN SPECIFICATION" table. OPC uses a
 * different sieve series; its limits are entered manually until provided.
 */
export const AGG_BLEND_SPECS: Record<string, { label: string; rows: AggSpecRow[] }> = {
  MSRC: {
    label: "MSRC",
    rows: [
      { mm: 37.5, lower: 100, upper: 100 },
      { mm: 20, lower: 95, upper: 100 },
      { mm: 5, lower: 35, upper: 55 },
      { mm: 0.6, lower: 10, upper: 35 },
      { mm: 0.15, lower: 0, upper: 10 },
      { mm: 0.075, lower: 0, upper: 3 },
    ],
  },
  OPC: {
    label: "OPC",
    rows: [
      { mm: 10, lower: null, upper: null },
      { mm: 5, lower: null, upper: null },
      { mm: 2.36, lower: null, upper: null },
      { mm: 1.18, lower: null, upper: null },
      { mm: 0.6, lower: null, upper: null },
      { mm: 0.3, lower: null, upper: null },
      { mm: 0.15, lower: null, upper: null },
      { mm: 0.075, lower: null, upper: null },
    ],
  },
};

type AggSpecKey = keyof typeof AGG_BLEND_SPECS;

const AGG_SUBTYPE_LABELS: Record<string, { en: string; ar: string }> = {
  agg_32mm: { en: "32mm Aggregate", ar: "ركام 32مم" },
  agg_20mm: { en: "20mm Aggregate", ar: "ركام 20مم" },
  agg_10mm: { en: "10mm Aggregate", ar: "ركام 10مم" },
  agg_0_5mm: { en: "0-5mm Aggregate", ar: "ركام 0-5مم" },
  dune_sand: { en: "Dune Sand", ar: "رمل كثبان" },
  others: { en: "Other", ar: "أخرى" },
};

function sieveKey(mm: number): string {
  return String(Math.round(mm * 1000) / 1000);
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export default function SieveAggBlend() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: siblings = [] } = trpc.distributions.getBatchSiblings.useQuery(
    { sampleId: dist?.sampleId ?? 0, orderId: dist?.orderId ?? 0 },
    { enabled: !!dist?.sampleId && !!dist?.orderId },
  );
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [specType, setSpecType] = useState<AggSpecKey>("MSRC");
  const [mixQty, setMixQty] = useState<Record<string, string>>({});
  const [origGrad, setOrigGrad] = useState<Record<string, Record<string, string>>>({});
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Aggregate-size columns = the AGG_SIEVE siblings of this batch.
  const aggSizes = useMemo(() => {
    const list = (siblings as any[]).filter(s => s.testType === "AGG_SIEVE");
    const arr = list.length ? list : dist ? [dist] : [];
    return arr.map((s: any) => {
      const sub = String(s.testSubType ?? "");
      const lbl = AGG_SUBTYPE_LABELS[sub];
      return {
        distId: s.id as number,
        sampleId: s.sampleId as number,
        key: String(s.id),
        subType: sub,
        label: lbl ? (ar ? lbl.ar : lbl.en) : sub || `#${s.id}`,
      };
    });
  }, [siblings, dist, ar]);
  const sizeKeys = aggSizes.map(s => s.key);

  const specRows = AGG_BLEND_SPECS[specType].rows;

  const changeSpec = (v: AggSpecKey) => setSpecType(v);

  const setQty = (key: string, raw: string) => setMixQty(prev => ({ ...prev, [key]: raw }));
  const setOrig = (key: string, sk: string, raw: string) =>
    setOrigGrad(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [sk]: raw } }));

  // ── Calculations ──
  const totalQty = sizeKeys.reduce((sum, k) => sum + (parseNum(mixQty[k]) ?? 0), 0);
  const usedPct: Record<string, number | null> = {};
  for (const k of sizeKeys) {
    const q = parseNum(mixQty[k]);
    usedPct[k] = q != null && totalQty > 0 ? (q / totalQty) * 100 : null;
  }

  const computedRows = specRows.map(spec => {
    const sk = sieveKey(spec.mm);
    const lower = spec.lower; // fixed spec limit
    const upper = spec.upper; // fixed spec limit
    const required: Record<string, number | null> = {};
    let blendSum = 0;
    let complete = sizeKeys.length > 0;
    for (const k of sizeKeys) {
      const orig = parseNum(origGrad[k]?.[sk]);
      const u = usedPct[k];
      if (orig != null && u != null) {
        const req = (u * orig) / 100;
        required[k] = req;
        blendSum += req;
      } else {
        required[k] = null;
        complete = false;
      }
    }
    const blend = complete ? blendSum : null;
    const withinLimits =
      blend != null && lower != null && upper != null
        ? blend >= lower - LIMIT_EPS && blend <= upper + LIMIT_EPS
        : null;
    return { sieveMm: spec.mm, sieveKey: sk, lower, upper, required, blend, withinLimits };
  });

  const allQtySet = sizeKeys.length > 0 && sizeKeys.every(k => (parseNum(mixQty[k]) ?? 0) > 0);
  const allOrigSet = computedRows.every(r => sizeKeys.every(k => r.required[k] != null));
  const specRowsWithLimits = computedRows.filter(r => r.lower != null && r.upper != null);
  const withinSpec = specRowsWithLimits.length > 0 && specRowsWithLimits.every(r => r.withinLimits === true);
  const anyData =
    sizeKeys.some(k => (mixQty[k] ?? "").trim() !== "") ||
    computedRows.some(r => sizeKeys.some(k => (origGrad[k]?.[r.sieveKey] ?? "").trim() !== ""));
  const submitReady = allQtySet && allOrigSet;
  const passesSpec = submitReady && withinSpec;
  const overallResult: "pass" | "fail" | "pending" = !anyData
    ? "pending"
    : !submitReady || specRowsWithLimits.length === 0
      ? "pending"
      : withinSpec
        ? "pass"
        : "fail";

  // ── Hydration from a previously saved combined worksheet ──
  useEffect(() => {
    if (hydrated || !existing?.formData) return;
    const fd = existing.formData as any;
    if (fd.testMode !== "agg_blend") {
      setHydrated(true);
      return;
    }
    if (fd.specType === "MSRC" || fd.specType === "OPC") setSpecType(fd.specType);
    const qtyInit: Record<string, string> = {};
    const origInit: Record<string, Record<string, string>> = {};
    if (Array.isArray(fd.sizes)) {
      for (const s of fd.sizes) if (s?.key != null && s.mixQty != null) qtyInit[String(s.key)] = String(s.mixQty);
    }
    if (Array.isArray(fd.rows)) {
      for (const r of fd.rows) {
        const sk = sieveKey(Number(r.sieveMm));
        if (r.origGrad) {
          for (const [k, v] of Object.entries(r.origGrad)) {
            if (v != null) (origInit[k] ??= {})[sk] = String(v);
          }
        }
      }
    }
    setMixQty(qtyInit);
    setOrigGrad(origInit);
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
    setHydrated(true);
  }, [existing, hydrated]);

  const saveResult = trpc.specializedTests.save.useMutation({ onError: e => toast.error(e.message) });

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && !submitReady) {
      toast.error(
        ar
          ? "أدخل كمية التصميم لكل مقاس وكل قيم التدرج الأصلي"
          : "Enter the mix-design quantity for every size and all original gradation values",
      );
      return;
    }

    const sizesPayload = aggSizes.map(s => ({
      distId: s.distId,
      key: s.key,
      subType: s.subType,
      label: s.label,
      mixQty: parseNum(mixQty[s.key]),
      usedPct: usedPct[s.key] != null ? Number((usedPct[s.key] as number).toFixed(2)) : null,
    }));
    const rowsPayload = computedRows.map(r => ({
      sieveMm: r.sieveMm,
      sieve: formatDisplaySieveMm(r.sieveMm),
      lower: r.lower,
      upper: r.upper,
      origGrad: Object.fromEntries(sizeKeys.map(k => [k, parseNum(origGrad[k]?.[r.sieveKey])])),
      required: Object.fromEntries(sizeKeys.map(k => [k, r.required[k] != null ? Number((r.required[k] as number).toFixed(2)) : null])),
      blend: r.blend != null ? Number(r.blend.toFixed(1)) : null,
      withinLimits: r.withinLimits,
    }));
    const overall = passesSpec ? "pass" : status === "submitted" ? "fail" : "pending";
    const formData = {
      testMode: "agg_blend" as const,
      specType,
      totalQty: Number(totalQty.toFixed(1)),
      sizes: sizesPayload,
      rows: rowsPayload,
      passesSpec,
      overallResult: overall,
      source,
      testedBy: user?.name ?? undefined,
    };

    setSaving(true);
    try {
      // One submit completes every aggregate-size sibling (same shared worksheet).
      for (const s of aggSizes) {
        await saveResult.mutateAsync({
          distributionId: s.distId,
          sampleId: s.sampleId,
          testTypeCode: "AGG_SIEVE",
          formTemplate: "sieve_analysis",
          formData,
          overallResult: overall,
          summaryValues: { specType, passesSpec, overallResult: overall },
          notes,
          status,
        });
      }
      if (status === "submitted") {
        toast.success(
          passesSpec
            ? ar
              ? "تم الإرسال — مطابق للمواصفة"
              : "Submitted — PASSED specification"
            : ar
              ? "تم الإرسال — تم تسجيل النتيجة لمراجعة المقاول"
              : "Submitted — recorded for contractor review",
        );
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Grading curve (Blend vs limits) ──
  const chartKeys = useMemo(() => {
    return {
      kBlend: ar ? "الخليط %" : "Blend / الخليط %",
      kUp: ar ? "الحد الأعلى" : "Upper Limit / الحد الأعلى",
      kLo: ar ? "الحد الأدنى" : "Lower Limit / الحد الأدنى",
    };
  }, [ar]);
  const chartData = computedRows.map(r => ({
    sieveMm: formatDisplaySieveMm(r.sieveMm),
    sieveLog: Math.max(r.sieveMm, 0.01),
    [chartKeys.kBlend]: r.blend != null ? Number(r.blend.toFixed(1)) : null,
    [chartKeys.kUp]: r.upper,
    [chartKeys.kLo]: r.lower,
  }));

  if (!distId || distId === 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center text-red-600">{ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!dist) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto p-6">
          <div className="text-center text-slate-400 text-sm py-20">{ar ? "جاري التحميل..." : "Loading..."}</div>
        </div>
      </DashboardLayout>
    );
  }

  const sizeNames = aggSizes.map(s => s.label).join(ar ? "، " : ", ");

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard dist={dist} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الركام / تحليل المناخل" : "Aggregate Tests / Sieve Analysis"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل المناخل للركام — تصميم الخلطة" : "Concrete Aggregate Sieve — Blend (Mix Design)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {ar ? "التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleSave("submitted")}
                  disabled={saving || !submitReady}
                >
                  <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* This worksheet covers all the batch's sizes at once */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            {ar
              ? `هذه الورقة الواحدة تغطي ${aggSizes.length} مقاسات (كل مقاس يُحتسب كعينة منفصلة للتسعير): ${sizeNames}. الإرسال مرة واحدة يُكمل جميع المقاسات.`
              : `This single worksheet covers ${aggSizes.length} sizes (each billed as its own sample): ${sizeNames}. Submitting once completes all of them.`}
          </span>
        </div>

        {/* Test information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع المواصفة" : "Specification Type"}</Label>
                <Select value={specType} disabled={submitted} onValueChange={v => changeSpec(v as AggSpecKey)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AGG_BLEND_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} disabled={submitted} placeholder="—" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Mix design quantities → %ge used */}
            <div>
              <p className="text-xs font-semibold text-white mb-2 uppercase tracking-wide bg-emerald-700 rounded px-2 py-1 inline-block">
                {ar ? "تصميم الخلطة" : "Mix Design"}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-300 min-w-[520px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-2 text-start">{ar ? "المقاس" : "Aggregate Size"}</th>
                      {aggSizes.map(s => (
                        <th key={s.key} className="border border-slate-300 px-2 py-2 text-center">{s.label}</th>
                      ))}
                      <th className="border border-slate-300 px-2 py-2 text-center bg-slate-200">{ar ? "المجموع" : "Total"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{ar ? "كمية التصميم" : "Mix Design Qty"}</td>
                      {aggSizes.map(s => (
                        <td key={s.key} className="border border-slate-300 px-1 py-1 bg-yellow-100/70">
                          <Input
                            type="number"
                            value={mixQty[s.key] ?? ""}
                            onChange={e => setQty(s.key, e.target.value)}
                            onFocus={e => e.currentTarget.select()}
                            disabled={submitted}
                            className={`${LAB_NUMERIC_INPUT_SM} w-24 mx-auto font-mono text-center bg-yellow-50`}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold bg-green-100 text-green-800">
                        {totalQty > 0 ? totalQty.toFixed(0) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-2 py-1 font-medium">{ar ? "النسبة المستخدمة %" : "%ge Used"}</td>
                      {aggSizes.map(s => (
                        <td key={s.key} className="border border-slate-300 px-2 py-1 text-center font-mono font-bold bg-green-100 text-green-800">
                          {usedPct[s.key] != null ? `${(usedPct[s.key] as number).toFixed(2)}%` : "—"}
                        </td>
                      ))}
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold bg-green-100 text-green-800">
                        {totalQty > 0 ? "100%" : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {ar ? "النسبة المستخدمة (أخضر) = كمية المقاس (أصفر) ÷ المجموع × 100" : "%ge Used (green) = size quantity (yellow) ÷ total × 100"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Blend worksheet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "ورقة حساب الخلطة" : "Blend Worksheet"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle">{ar ? "المنخل (مم)" : "Sieve No."}</th>
                    {aggSizes.map(s => (
                      <th key={s.key} colSpan={2} className="border border-slate-300 px-2 py-1 text-center">
                        {s.label}
                      </th>
                    ))}
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle bg-emerald-100 text-emerald-800">{ar ? "الخليط %" : "BLEND"}</th>
                    <th colSpan={2} className="border border-slate-300 px-2 py-1 text-center bg-red-200 text-red-900 font-bold">{ar ? "حدود المواصفة (ثابتة)" : "ALL IN SPECIFICATION"}</th>
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 align-middle">{ar ? "النتيجة" : "Result"}</th>
                  </tr>
                  <tr className="bg-slate-50 text-[10px]">
                    {aggSizes.map(s => (
                      <Fragment key={s.key}>
                        <th className="border border-slate-300 px-1 py-1 bg-yellow-100 text-yellow-900">{ar ? "التدرج الأصلي" : "Orig. Grad"}</th>
                        <th className="border border-slate-300 px-1 py-1 bg-emerald-100 text-emerald-800">{ar ? "المطلوب" : "Required"}</th>
                      </Fragment>
                    ))}
                    <th className="border border-slate-300 px-1 py-1 bg-red-100 text-red-900">{ar ? "أدنى" : "Lower"}</th>
                    <th className="border border-slate-300 px-1 py-1 bg-red-100 text-red-900">{ar ? "أعلى" : "Upper"}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* %ge Used row (calculated, green) */}
                  <tr className="bg-emerald-50">
                    <td className="border border-slate-300 px-2 py-1 font-semibold text-emerald-800">{ar ? "النسبة المستخدمة %" : "%ge Used"}</td>
                    {aggSizes.map(s => (
                      <td key={s.key} colSpan={2} className="border border-slate-300 px-2 py-1 text-center font-mono font-bold text-emerald-800">
                        {usedPct[s.key] != null ? `${(usedPct[s.key] as number).toFixed(2)}%` : "—"}
                      </td>
                    ))}
                    <td className="border border-slate-300 bg-slate-50" />
                    <td className="border border-slate-300 bg-slate-50" colSpan={2} />
                    <td className="border border-slate-300 bg-slate-50" />
                  </tr>
                  {computedRows.map((r, idx) => (
                    <tr key={r.sieveKey} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">{formatDisplaySieveMm(r.sieveMm)}</td>
                      {aggSizes.map(s => (
                        <Fragment key={s.key}>
                          <td className="border border-slate-300 px-1 py-1 bg-yellow-50">
                            <Input
                              type="number"
                              value={origGrad[s.key]?.[r.sieveKey] ?? ""}
                              onChange={e => setOrig(s.key, r.sieveKey, e.target.value)}
                              onFocus={e => e.currentTarget.select()}
                              disabled={submitted}
                              className={`${LAB_NUMERIC_INPUT_SM} w-16 mx-auto font-mono text-center bg-yellow-50`}
                              placeholder="—"
                            />
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono bg-emerald-50 text-emerald-800">
                            {r.required[s.key] != null ? (r.required[s.key] as number).toFixed(2) : "—"}
                          </td>
                        </Fragment>
                      ))}
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold bg-emerald-50 text-emerald-800 text-sm">
                        {r.blend != null ? r.blend.toFixed(1) : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold bg-red-50 text-red-900">
                        {r.lower != null ? r.lower : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold bg-red-50 text-red-900">
                        {r.upper != null ? r.upper : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        {r.withinLimits === true ? (
                          <span className="text-emerald-600 font-bold text-lg">✓</span>
                        ) : r.withinLimits === false ? (
                          <span className="text-red-600 font-bold text-lg">✗</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300" /> {ar ? "إدخال الفني" : "Yellow = input"}</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" /> {ar ? "حساب تلقائي" : "Green = calculated"}</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> {ar ? "حدود ثابتة" : "Red = fixed limits"}</span>
            </div>
            <div className="text-xs text-slate-600 mt-2 p-2 bg-slate-50 rounded-md border border-slate-200 space-y-0.5">
              <p><strong>{ar ? "المطلوب" : "Required"}</strong> = {ar ? "النسبة المستخدمة × التدرج الأصلي ÷ 100" : "%ge Used × Original Grad ÷ 100"}</p>
              <p><strong>{ar ? "الخليط" : "Blend"}</strong> = {ar ? "مجموع المطلوب لكل المقاسات" : "sum of Required across all sizes"}</p>
            </div>
          </CardContent>
        </Card>

        <GradationCurveChart
          title={ar ? "منحنى التدرج" : "Grading Curve / منحنى التدرج"}
          data={chartData}
          show={anyData}
          legendItems={extractedSieveLegendItems(ar)}
          xDataKey="sieveLog"
          xAxisOptions={{ logScale: true }}
          xTickFormatter={(v) => formatDisplaySieveMm(Number(v))}
          ar={ar}
          tooltipLabels={{
            [chartKeys.kBlend]: chartKeys.kBlend,
            [chartKeys.kUp]: chartKeys.kUp,
            [chartKeys.kLo]: chartKeys.kLo,
          }}
          lines={[
            { dataKey: chartKeys.kBlend, variant: "primary", connectNulls: true },
            { dataKey: chartKeys.kUp, variant: "custom", stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5 5", connectNulls: true },
            { dataKey: chartKeys.kLo, variant: "custom", stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5 5", connectNulls: true },
          ]}
          emptyContent={
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              <FlaskConical size={32} className="opacity-30" />
              <span className="ms-2">{ar ? "أدخل البيانات لعرض المنحنى" : "Enter data to plot the curve"}</span>
            </div>
          }
        />

        {anyData && (
          <ResultBanner
            result={overallResult}
            testName={ar ? "تحليل المناخل للركام — الخلطة" : "Aggregate Sieve — Blend"}
            standard={AGG_BLEND_SPECS[specType].label}
          />
        )}

        {submitReady && specRowsWithLimits.length > 0 && (
          <div className="flex items-center gap-2">
            <PassFailBadge result={withinSpec ? "pass" : "fail"} lang={lang} />
          </div>
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
