import { useState, useCallback, useEffect } from "react";
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
import { Plus, Trash2, Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Interlock Specs (BS EN 1338) ─────────────────────────────────────────────
const INTERLOCK_SPECS = {
  "6CM": {
    label: "Interlock 6cm",
    labelAr: "إنترلوكينج 6سم",
    thickness: 60,
    requiredStrength: 49.0, // N/mm² (characteristic)
    minIndividual: 44.0, // N/mm²
    standard: "BS EN 1338",
    code: "CONC_INTERLOCK_6CM",
  },
  "8CM": {
    label: "Interlock 8cm",
    labelAr: "إنترلوكينج 8سم",
    thickness: 80,
    requiredStrength: 49.0,
    minIndividual: 44.0,
    standard: "BS EN 1338",
    code: "CONC_INTERLOCK_8CM",
  },
};

type InterlockTypeKey = keyof typeof INTERLOCK_SPECS;

interface InterlockRow {
  id: string;
  blockRef: string;
  length: string;
  width: string;
  thickness: string;
  /** Editable bearing area (mm²); auto-filled from L×W */
  areaMm2: string;
  maxLoadKN: string;
  // computed
  area?: number;
  strengthMpa?: number;
  correctedStrengthMpa?: number;
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number, defaultThickness: number, length = "200", width = "100"): InterlockRow {
  const l = parseFloat(length) || 200;
  const w = parseFloat(width) || 100;
  return {
    id: `row_${Date.now()}_${index}`,
    blockRef: `I${index + 1}`,
    length,
    width,
    thickness: String(defaultThickness),
    areaMm2: String(Math.round(l * w)),
    maxLoadKN: "",
  };
}

const THICKNESS_FACTOR: Record<number, number> = { 60: 0.80, 80: 1.00, 100: 1.20 };

function computeRow(row: InterlockRow, spec: typeof INTERLOCK_SPECS[InterlockTypeKey]): InterlockRow {
  const l = parseFloat(row.length);
  const w = parseFloat(row.width);
  const load = parseFloat(row.maxLoadKN);
  const areaFromField = parseFloat(row.areaMm2);
  if (!load) return row;
  const area = areaFromField > 0 ? areaFromField : (l > 0 && w > 0 ? l * w : 0);
  if (!area) return row;
  const strength = (load * 1000) / area;
  const th = parseInt(row.thickness, 10) || spec.thickness;
  const tf = THICKNESS_FACTOR[th] ?? THICKNESS_FACTOR[spec.thickness] ?? 1.0;
  const corrected = strength * tf;
  return {
    ...row,
    area: Math.round(area),
    strengthMpa: Math.round(strength * 10) / 10,
    correctedStrengthMpa: Math.round(corrected * 10) / 10,
    result: corrected >= spec.minIndividual ? "pass" : "fail",
  };
}

export default function Interlock() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [interlockType, setInterlockType] = useState<InterlockTypeKey>("6CM");
  const [manufacturer, setManufacturer] = useState("");
  const [mtsReference, setMtsReference] = useState("");
  const [blockShape, setBlockShape] = useState("");
  const [blockColor, setBlockColor] = useState("");
  const [notes, setNotes] = useState("");
  const spec = INTERLOCK_SPECS[interlockType];
  const [rows, setRows] = useState<InterlockRow[]>(
    Array.from({ length: 10 }, (_, i) => newRow(i, spec.thickness))
  );

  useEffect(() => {
    const sp = INTERLOCK_SPECS[interlockType];
    setRows(prev =>
      prev.map(r => {
        const l = parseFloat(r.length) || 200;
        const w = parseFloat(r.width) || 100;
        return {
          ...r,
          thickness: String(sp.thickness),
          areaMm2: String(Math.round(l * w)),
        };
      }),
    );
  }, [interlockType]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const computedRows = rows.map(r => computeRow(r, spec));
  const validRows = computedRows.filter(r => r.strengthMpa && r.strengthMpa > 0);
  const avgStrength = validRows.length > 0
    ? validRows.reduce((s, r) => s + (r.correctedStrengthMpa ?? r.strengthMpa ?? 0), 0) / validRows.length
    : 0;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : avgStrength >= spec.requiredStrength && validRows.every(r => r.result === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof InterlockRow, value: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value };
        if (field === "length" || field === "width") {
          const l = parseFloat(field === "length" ? value : next.length) || 0;
          const w = parseFloat(field === "width" ? value : next.width) || 0;
          if (l && w) next.areaMm2 = String(Math.round(l * w));
        }
        return next;
      }),
    );
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error("Please enter at least one result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "interlock",
        formData: { interlockType, spec, manufacturer, mtsReference, blockShape, blockColor, blocks: computedRows, avgStrength, overallResult },
        overallResult,
        summaryValues: { type: spec.label, avgStrength: avgStrength.toFixed(2), required: spec.requiredStrength, count: validRows.length },
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
              <span>Concrete Tests / Interlock Paving Blocks</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Compressive Strength of Interlock Paving Blocks</h1>
            <p className="text-slate-500 text-sm mt-1">BS EN 1338 | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}</p>
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

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Test Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Block Type</Label>
                <Select
                  value={interlockType}
                  onValueChange={v => setInterlockType(v as InterlockTypeKey)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTERLOCK_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Manufacturer / Source</Label>
                <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="Manufacturer name" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">MTS Reference</Label>
                <Input value={mtsReference} onChange={e => setMtsReference(e.target.value)} placeholder="Material submittal ref." />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Shape</Label>
                <Input value={blockShape} onChange={e => setBlockShape(e.target.value)} placeholder="e.g. Rectangular, L-shape, Zigzag" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Color</Label>
                <Input value={blockColor} onChange={e => setBlockColor(e.target.value)} placeholder="e.g. Grey, Red, Yellow" />
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  Characteristic: <strong>{spec.requiredStrength} N/mm²</strong><br />
                  Min. individual: <strong>{spec.minIndividual} N/mm²</strong>
                </div>
              </div>
            
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Tested By / الفاحص</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Block Test Results</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setRows(p => [...p, newRow(p.length, spec.thickness, "200", "100")])}>
                <Plus size={14} className="mr-1" /> Add Block
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["Block Ref.", "Thickness (mm)", "Max Load (kN)", "Area (mm²)", "Str. (N/mm²)", "CF", "Corr. (N/mm²)", "Result", ""].map(h => (
                    <th key={h} className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.blockRef} onChange={e => updateRow(row.id, "blockRef", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.thickness} onChange={e => updateRow(row.id, "thickness", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.maxLoadKN} onChange={e => updateRow(row.id, "maxLoadKN", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input
                        value={row.areaMm2}
                        onChange={e => updateRow(row.id, "areaMm2", e.target.value)}
                        className="h-7 text-xs w-24 text-center font-mono"
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs">{row.strengthMpa ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-blue-700">
                      {THICKNESS_FACTOR[parseInt(row.thickness, 10) || spec.thickness] ?? 1.0}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold">{row.correctedStrengthMpa ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? <PassFailBadge result={row.result} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setRows(p => p.filter(r => r.id !== row.id))} disabled={rows.length <= 1}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={7} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">Average Corrected Compressive Strength:</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{(validRows.reduce((s, r) => s + (r.correctedStrengthMpa ?? 0), 0) / validRows.length).toFixed(1)}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center"><PassFailBadge result={overallResult} size="sm" /></td>
                    <td className="border border-slate-200"></td>
                  </tr>
                </tfoot>
              )}
            </table>
</div>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <ResultBanner result={overallResult} testName={`Compressive Strength of ${spec.label}`} standard="BS EN 1338" />
        )}

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
