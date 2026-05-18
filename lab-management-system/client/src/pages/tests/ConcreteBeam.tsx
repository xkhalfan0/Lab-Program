/**
 * ConcreteBeam — Flexural Strength (Modulus of Rupture) Test
 * Standards: ASTM C78 (Third-Point Loading)
 * Sizes:
 *   SMALL: 100×100×500mm  → span = 300mm
 *   LARGE: 150×150×750mm  → span = 450mm
 *
 * Formula (Third-Point Loading, ASTM C78):
 *   If fracture occurs within middle third:
 *     MOR = P × L / (b × d²)
 *   If fracture occurs outside middle third (within 5% of span):
 *     MOR = 3 × P × a / (b × d²)
 *   where:
 *     P = max load (N)
 *     L = span length (mm)
 *     b = width (mm)
 *     d = depth (mm)
 *     a = distance from fracture to nearest support (mm)
 */
import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Info, Printer, UserCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Beam size presets (keys match saved formData + Select values) ───────────
const BEAM_SIZES = {
  "100x100x500": { label: "100×100×500 mm (Span = 300 mm)", width: 100, depth: 100, length: 500, span: 300 },
  "150x150x750": { label: "150×150×750 mm (Span = 450 mm)", width: 150, depth: 150, length: 750, span: 450 },
} as const;

type BeamSizeKey = keyof typeof BEAM_SIZES;

function beamSizeKeyFromTestCode(code: string | undefined): BeamSizeKey {
  if (code === "CONC_BEAM_LARGE") return "150x150x750";
  if (code === "CONC_BEAM_SMALL") return "100x100x500";
  return "100x100x500";
}
/** Per-row value synced from Test Parameters (same for all beams). */
type BeamFractureZone = "middle_third" | "outside_middle_third";

/** Legacy persisted row zones (reports / old saves). */
type LegacyFractureZone = "outside_5pct" | "outside_discard";

interface BeamRow {
  id: string;
  beamNo: string;
  width: string;
  depth: string;
  /** Max load in Newtons (legacy saves used `maxLoad` in kN). */
  maxLoadN: string;
  fractureZone: BeamFractureZone | LegacyFractureZone;
  // computed
  mor?: number;
  result?: "pass" | "fail" | "pending";
  discarded?: boolean;
}

function newRow(index: number, key: BeamSizeKey, zone: BeamFractureZone): BeamRow {
  return {
    id: `row_${Date.now()}_${index}`,
    beamNo: `B${index + 1}`,
    width: String(BEAM_SIZES[key].width),
    depth: String(BEAM_SIZES[key].depth),
    maxLoadN: "",
    fractureZone: zone,
  };
}

function readLoadN(row: BeamRow): number | undefined {
  const n = parseFloat(row.maxLoadN);
  if (Number.isFinite(n) && n > 0) return n;
  const legacyKn = parseFloat((row as BeamRow & { maxLoad?: string }).maxLoad ?? "");
  if (Number.isFinite(legacyKn) && legacyKn > 0) return legacyKn * 1000;
  return undefined;
}

/** MOR (MPa) = N/mm² = (P×L)/(b×d²) with P in N, L,b,d in mm (middle third, ASTM C78). */
function morMiddleThird(loadN: number, spanMm: number, widthMm: number, depthMm: number): number | null {
  if (!loadN || !spanMm || !widthMm || !depthMm) return null;
  return (loadN * spanMm) / (widthMm * depthMm * depthMm);
}

function morOutsideThird(loadN: number, aMm: number, widthMm: number, depthMm: number): number | null {
  if (!loadN || !aMm || !widthMm || !depthMm) return null;
  return (3 * loadN * aMm) / (widthMm * depthMm * depthMm);
}

function computeRow(row: BeamRow, span: number, minMOR: number): BeamRow {
  const b = parseFloat(row.width);
  const d = parseFloat(row.depth);
  const P = readLoadN(row);
  const L = span;

  if (row.fractureZone === "outside_middle_third" || row.fractureZone === "outside_discard") {
    return { ...row, mor: undefined, result: "pending", discarded: true };
  }

  if (!b || !d || !P) return { ...row, mor: undefined, result: "pending", discarded: false };

  let mor: number | null = null;
  let discarded = false;

  if (row.fractureZone === "middle_third") {
    mor = morMiddleThird(P, L, b, d);
  } else if (row.fractureZone === "outside_5pct") {
    const a = parseFloat(String((row as BeamRow & { fractureDistance?: string }).fractureDistance ?? ""));
    if (!a) return { ...row, mor: undefined, result: "pending", discarded: false };
    const limit = L * 0.05;
    if (a > L / 3 + limit) {
      return { ...row, mor: undefined, result: "pending", discarded: true };
    }
    mor = morOutsideThird(P, a, b, d);
  } else {
    return { ...row, mor: undefined, result: "pending", discarded: true };
  }

  if (mor === null) return { ...row, mor: undefined, result: "pending", discarded: false };
  const morRounded = parseFloat(mor.toFixed(3));
  return {
    ...row,
    mor: morRounded,
    result: morRounded >= minMOR ? "pass" : "fail",
    discarded,
  };
}

export default function ConcreteBeam() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  // Default geometry until distribution loads; legacy CONC_BEAM_* maps to preset.
  const beamKeyFromDist = beamSizeKeyFromTestCode(dist?.testType);

  const [beamSize, setBeamSize] = useState<BeamSizeKey>(beamKeyFromDist);
  const [fractureZone, setFractureZone] = useState<BeamFractureZone>("middle_third");
  const fractureZoneRef = useRef(fractureZone);
  fractureZoneRef.current = fractureZone;

  const [rows, setRows] = useState<BeamRow[]>(() => [newRow(0, beamKeyFromDist, "middle_third")]);
  const [minMOR, setMinMOR] = useState(4.48); // MPa — ASTM C 78 @ 90 days
  const [specifiedStrength, setSpecifiedStrength] = useState(4.48); // MPa — Specified Flexural Strength
  const [requiredAge, setRequiredAge] = useState(90); // days — per ASTM C 78
  const [castDate, setCastDate] = useState("");
  const [allowCastDateOverride, setAllowCastDateOverride] = useState(false);
  const [testDate, setTestDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [age, setAge] = useState<number | null>(null);
  const [sampleLocation, setSampleLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (castDate && testDate) {
      const t0 = new Date(castDate).getTime();
      const t1 = new Date(testDate).getTime();
      if (Number.isNaN(t0) || Number.isNaN(t1)) {
        setAge(null);
        return;
      }
      const diffDays = Math.ceil((t1 - t0) / (1000 * 60 * 60 * 24));
      setAge(diffDays >= 0 ? diffDays : null);
    } else {
      setAge(null);
    }
  }, [castDate, testDate]);

  useEffect(() => {
    setRows(prev => prev.map(row => ({ ...row, fractureZone })));
  }, [fractureZone]);

  // When distribution loads (or legacy beam code), sync preset size and reset rows once per code.
  useEffect(() => {
    if (!dist?.testType) return;
    const key = beamSizeKeyFromTestCode(dist.testType);
    setBeamSize(key);
    setRows([newRow(0, key, fractureZoneRef.current)]);
  }, [dist?.testType]);

  useEffect(() => {
    if (!dist) return;
    if (dist.castingDate) {
      const iso = new Date(dist.castingDate).toISOString().split("T")[0];
      setCastDate(prev => (prev ? prev : iso));
    }
    const loc = (dist as { sampleLocation?: string | null }).sampleLocation;
    if (loc) setSampleLocation(prev => (prev ? prev : loc));
  }, [dist]);

  const preset = BEAM_SIZES[beamSize];
  const span = preset.span;

  // Recompute all rows when minMOR or span changes
  const computedRows = rows.map(r => computeRow(r, span, minMOR));

  const validRows = computedRows.filter(r => !r.discarded && r.mor !== undefined);
  const avgMOR = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.mor ?? 0), 0) / validRows.length).toFixed(3))
    : null;
  const overallPass = validRows.length > 0 && validRows.every(r => r.result === "pass");
  const overallFail = validRows.some(r => r.result === "fail");
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending" : overallFail ? "fail" : overallPass ? "pass" : "pending";

  const [saving, setSaving] = useState(false);

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال نتائج اختبار الكمرات بنجاح" : "Beam test results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "أدخل نتيجة كمرة صحيحة واحدة على الأقل" : "Enter at least one valid beam result");
      return;
    }
    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: dist?.testType ?? "CONC_BEAM",
        formTemplate: "concrete_beam",
        formData: {
          beamSize,
          span,
          specifiedStrength,
          minMOR,
          requiredAge,
          fractureZone,
          castDate,
          testDate,
          age,
          ageDays: age,
          sampleLocation,
          rows: computedRows,
          avgMOR,
          standard: "ASTM C 78",
        },
        overallResult,
        summaryValues: {
          avgMOR: avgMOR?.toFixed(3) ?? "—",
          minMOR: minMOR.toFixed(1),
          beamCount: validRows.length,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (id: string, field: keyof BeamRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, newRow(prev.length, beamSize, fractureZone)]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));
  const beamLabel = (k: BeamSizeKey) => {
    const v = BEAM_SIZES[k];
    if (!ar) return v.label;
    return k === "100x100x500" ? "100×100×500 مم (البحر = 300 مم)" : "150×150×750 مم (البحر = 450 مم)";
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
      <div dir={ar ? "rtl" : "ltr"} className="max-w-5xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="text-blue-600" size={22} />
              <h1 className="text-xl font-bold text-slate-800">
                {ar ? "اختبار مقاومة الانعطاف — كمرات الخرسانة" : "Flexural Strength Test — Concrete Beam"}
              </h1>
            </div>
            <p className="text-sm text-slate-500">
              ASTM C78 — {ar ? "تحميل عند الثلثين" : "Third-Point Loading"} &nbsp;|&nbsp; {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `#${distId}`}
            </p>
          </div>
          {submitted && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer size={14} className="mr-1" /> {ar ? "طباعة التقرير" : "Print Report"}
              </Button>
            </div>
          )}
        </div>

        {/* Standard Info */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2 text-sm text-blue-800">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">{ar ? "ASTM C78 — معادلة التحميل عند الثلثين" : "ASTM C78 — Third-Point Loading Formula"}</p>
                <p className="font-mono text-xs bg-blue-100 rounded px-2 py-1 inline-block mb-1">
                  MOR = P × L / (b × d²) &nbsp;{ar ? "[الكسر في الثلث الأوسط]" : "[fracture in middle third]"}
                </p>
                <br />
                <p className="font-mono text-xs bg-blue-100 rounded px-2 py-1 inline-block">
                  MOR = 3 × P × a / (b × d²) &nbsp;{ar ? "[الكسر خارج الثلث الأوسط ضمن 5% من البحر]" : "[fracture within 5% of span outside middle third]"}
                </p>
                <p className="mt-1 text-xs">
                  {ar
                    ? "P = الحمل (نيوتن)، L = البحر (مم)، b = العرض (مم)، d = العمق (مم)، a = المسافة لأقرب مسند (مم)"
                    : "P = Load (N), L = Span (mm), b = Width (mm), d = Depth (mm), a = Distance to nearest support (mm)"}
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
            <div className="space-y-1.5 mb-4">
              <Label className="text-base font-medium">{ar ? "مقاس الكمرة" : "Beam Size"}</Label>
              <Select
                value={beamSize}
                onValueChange={(v) => {
                  const key = v as BeamSizeKey;
                  setBeamSize(key);
                  const p = BEAM_SIZES[key];
                  setRows(prev =>
                    prev.map(r => ({
                      ...r,
                      width: String(p.width),
                      depth: String(p.depth),
                    })),
                  );
                }}
              >
                <SelectTrigger className="max-w-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BEAM_SIZES) as BeamSizeKey[]).map(k => (
                    <SelectItem key={k} value={k}>
                      {beamLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "تاريخ الصب" : "Cast Date"}</Label>
                <Input type="date" value={castDate} readOnly={!allowCastDateOverride} onChange={e => setCastDate(e.target.value)} />
                <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-xs"
                  onClick={() => setAllowCastDateOverride(v => !v)}>
                  {allowCastDateOverride ? (ar ? "إلغاء التعديل اليدوي" : "Use auto-filled date") : (ar ? "تعديل يدوي" : "Override")}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "تاريخ الاختبار" : "Date Tested"}</Label>
                <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "العمر (يوم)" : "Age (days)"}</Label>
                <Input
                  readOnly
                  value={age !== null ? String(age) : ""}
                  placeholder="—"
                  className="bg-slate-50"
                />
                <p className="text-xs text-slate-500">
                  {ar ? "محسوب من تاريخ الصب إلى تاريخ الفحص" : "Calculated from Cast Date to Date Tested"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "مقاومة الانعطاف المحددة (MPa)" : "Specified Flexural Strength (MPa)"}</Label>
                <Input type="number" step="0.01" value={specifiedStrength}
                  onChange={e => setSpecifiedStrength(parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-slate-400">{ar ? "القيمة الافتراضية ASTM C78: ‏4.48 MPa" : "ASTM C 78 default: 4.48 MPa"}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "الحد الأدنى المقبول لـ MOR (MPa)" : "Min. MOR Acceptance (MPa)"}</Label>
                <Input type="number" step="0.01" value={minMOR}
                  onChange={e => setMinMOR(parseFloat(e.target.value) || 0)} />
                <p className="text-xs text-slate-400">{ar ? "الافتراضي = المقاومة المحددة" : "Default = Specified Strength"}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "العمر المطلوب (يوم)" : "Required Age (days)"}</Label>
                <Input type="number" value={requiredAge}
                  onChange={e => setRequiredAge(parseInt(e.target.value) || 90)} />
                <p className="text-xs text-slate-400">{ar ? "القيمة الافتراضية ASTM C78: ‏90 يوم" : "ASTM C 78 default: 90 days"}</p>
              </div>
              <div className="space-y-1.5 col-span-2 md:col-span-4">
                <Label>{ar ? "موقع العينة" : "Sample Location"}</Label>
                <Input
                  value={sampleLocation}
                  onChange={e => setSampleLocation(e.target.value)}
                  placeholder={ar ? "مثال: البحر 3، الحافة الشمالية (من الاستقبال إن وُجد)" : "e.g. Span 3, north edge (from reception if available)"}
                />
              </div>
            </div>
            {/* Beam dimensions summary */}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="bg-slate-100 rounded px-2 py-1">{ar ? "العرض (b)" : "Width (b)"} = <strong>{preset.width} mm</strong></span>
              <span className="bg-slate-100 rounded px-2 py-1">{ar ? "العمق (d)" : "Depth (d)"} = <strong>{preset.depth} mm</strong></span>
              <span className="bg-slate-100 rounded px-2 py-1">{ar ? "الطول" : "Length"} = <strong>{preset.length} mm</strong></span>
              <span className="bg-slate-100 rounded px-2 py-1">{ar ? "البحر (L)" : "Span (L)"} = <strong>{preset.span} mm</strong></span>
              <span className="bg-slate-100 rounded px-2 py-1">{ar ? "الثلث الأوسط" : "Middle Third"} = <strong>{preset.span / 3}–{(preset.span * 2) / 3} mm</strong> {ar ? "من المسند" : "from support"}</span>
            </div>

            <div className="space-y-1.5 mt-5 max-w-xl">
              <Label className="text-base font-medium">{ar ? "منطقة الكسر" : "Fracture Zone"}</Label>
              <Select value={fractureZone} onValueChange={v => setFractureZone(v as BeamFractureZone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="middle_third">{ar ? "الثلث الأوسط ✓" : "Middle Third ✓"}</SelectItem>
                  <SelectItem value="outside_middle_third">{ar ? "خارج الثلث الأوسط" : "Outside Middle Third"}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {ar
                  ? "نفس المنطقة لجميع الكمرات. يتطلب ASTM C78 أن يحدث الكسر في الثلث الأوسط لنتيجة الاعتماد القياسية."
                  : "Same for all beams. ASTM C78 requires fracture in the middle third for the standard acceptance result."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">{ar ? "نتائج الكمرات" : "Beam Results"}</CardTitle>
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus size={14} className="mr-1" /> {ar ? "إضافة كمرة" : "Add Beam"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">{ar ? "رقم الكمرة" : "Beam No."}</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">{ar ? "العرض (مم)" : "Width (mm)"}</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">{ar ? "العمق (مم)" : "Depth (mm)"}</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">{ar ? "الحمل الأقصى (ن)" : "Max Load (N)"}</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-700">MOR (MPa)</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center font-medium text-slate-700">{ar ? "النتيجة" : "Result"}</th>
                    <th className="border border-slate-300 px-1 py-1.5 w-10" aria-label={ar ? "حذف" : "Delete"} />
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map(row => (
                    <tr key={row.id} className={row.discarded ? "opacity-50 bg-slate-50/80" : ""}>
                      <td className="border border-slate-300 px-1 py-1 align-middle">
                        <Input value={row.beamNo} onChange={e => updateRow(row.id, "beamNo", e.target.value)}
                          className="h-8 text-xs w-16" />
                      </td>
                      <td className="border border-slate-300 px-1 py-1 align-middle">
                        <Input type="number" value={row.width} onChange={e => updateRow(row.id, "width", e.target.value)}
                          className="h-8 text-xs w-20" />
                      </td>
                      <td className="border border-slate-300 px-1 py-1 align-middle">
                        <Input type="number" value={row.depth} onChange={e => updateRow(row.id, "depth", e.target.value)}
                          className="h-8 text-xs w-20" />
                      </td>
                      <td className="border border-slate-300 px-1 py-1 align-middle">
                        <Input type="number" value={row.maxLoadN} onChange={e => updateRow(row.id, "maxLoadN", e.target.value)}
                          className="h-8 text-xs w-24" placeholder="N" />
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono font-semibold text-slate-800 align-middle">
                        {row.discarded ? (
                          <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">{ar ? "مستبعدة" : "Discarded"}</Badge>
                        ) : row.mor !== undefined ? row.mor.toFixed(3) : "—"}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center align-middle">
                        {row.discarded ? (
                          <span className="text-xs font-semibold text-orange-600">{ar ? "مهمل" : "Discarded"}</span>
                        ) : row.result === "pass" ? (
                          <PassFailBadge result="pass" />
                        ) : row.result === "fail" ? (
                          <PassFailBadge result="fail" />
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="border border-slate-300 px-1 py-1 text-center align-middle">
                        {rows.length > 1 ? (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => removeRow(row.id)} aria-label={ar ? "حذف الكمرة" : "Remove beam"}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length > 0 && (
              <div className="mb-4 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                <span className="font-medium text-slate-800">{ar ? "منطقة الكسر (جميع الكمرات):" : "Fracture Zone (all beams):"}</span>
                <span className="ms-2 text-slate-700">
                  {fractureZone === "middle_third"
                    ? (ar ? "الثلث الأوسط ✓" : "Middle Third ✓")
                    : (ar ? "خارج الثلث الأوسط" : "Outside Middle Third")}
                </span>
              </div>
            )}

            {/* Summary */}
            {validRows.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "الكمرات الصالحة" : "Valid Beams"}</p>
                  <p className="text-lg font-bold text-slate-800">{validRows.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "متوسط MOR" : "Average MOR"}</p>
                  <p className="text-lg font-bold text-slate-800">{avgMOR?.toFixed(3) ?? "—"} <span className="text-xs font-normal">MPa</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "الحد الأدنى المطلوب" : "Min. Required"}</p>
                  <p className="text-lg font-bold text-slate-800">{minMOR.toFixed(1)} <span className="text-xs font-normal">MPa</span></p>
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

        {/* Acceptance Criteria */}
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">{ar ? "معايير القبول — ASTM C78" : "Acceptance Criteria — ASTM C78"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-left py-1.5 pr-4">{ar ? "رتبة الخرسانة" : "Concrete Grade"}</th>
                  <th className="text-left py-1.5 pr-4">f'c (MPa)</th>
                  <th className="text-left py-1.5 pr-4">{ar ? "MOR النموذجي (MPa)" : "Typical MOR (MPa)"}</th>
                  <th className="text-left py-1.5">{ar ? "تقريبًا MOR = 0.62√f'c" : "Approx. MOR = 0.62√f'c"}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {[
                  { grade: "C20", fc: 20, mor: 2.77 },
                  { grade: "C25", fc: 25, mor: 3.10 },
                  { grade: "C30", fc: 30, mor: 3.40 },
                  { grade: "C35", fc: 35, mor: 3.67 },
                  { grade: "C40", fc: 40, mor: 3.92 },
                ].map(row => (
                  <tr key={row.grade} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4 font-semibold">{row.grade}</td>
                    <td className="py-1.5 pr-4">{row.fc}</td>
                    <td className="py-1.5 pr-4">{row.mor.toFixed(2)}</td>
                    <td className="py-1.5">0.62 × √{row.fc} = {(0.62 * Math.sqrt(row.fc)).toFixed(2)} MPa</td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
            <p className="text-xs text-slate-500 mt-2">
              {ar
                ? "* MOR (معامل الانعطاف) = مقاومة الانعطاف. يجب أن تفي كل كمرة على حدة بالحد الأدنى المطلوب لـ MOR. يتم استبعاد الكمرات التي يحدث فيها الكسر خارج حدود 5% من البحر."
                : "* MOR (Modulus of Rupture) = Flexural Strength. Individual beam result must meet the specified minimum MOR. Discarded beams (fracture outside 5% of span) are excluded from evaluation."}
            </p>
          </CardContent>
        </Card>

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
                placeholder={ar ? "أنماط الكسر، حالة السطح، ملاحظات المعالجة..." : "Fracture patterns, surface condition, curing notes..."} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1.5">
                  <UserCheck size={13} />
                  <span>{ar ? "الفني:" : "Technician:"} <strong>{user.name}</strong></span>
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving || submitted}>
                  {saving ? (ar ? "جارٍ الحفظ..." : "Saving...") : submitted ? (ar ? "تم الحفظ ✓" : "Saved ✓") : (
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
