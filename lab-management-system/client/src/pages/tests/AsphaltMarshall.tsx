import { useState, useCallback } from "react";
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

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Marshall Test Specs ──────────────────────────────────────────────────────
const ASPHALT_SPECS = {
  "ACWC": {
    label: "ACWC (Wearing Course)",
    stabilityMin: 8.0, // kN
    flowMin: 2.0, // mm
    flowMax: 4.0, // mm
    vmaMin: 14.0, // %
    vfaMin: 65.0, // %
    vfaMax: 75.0, // %
    airVoidsMin: 3.0, // %
    airVoidsMax: 5.0, // %
    code: "ASPH_ACWC",
  },
  "ACBC": {
    label: "ACBC (Binder Course)",
    stabilityMin: 7.5,
    flowMin: 2.0,
    flowMax: 4.5,
    vmaMin: 13.0,
    vfaMin: 60.0,
    vfaMax: 75.0,
    airVoidsMin: 3.0,
    airVoidsMax: 5.0,
    code: "ASPH_ACBC",
  },
  "DBM": {
    label: "Dense Bitumen Macadam (DBM)",
    stabilityMin: 6.0,
    flowMin: 2.0,
    flowMax: 5.0,
    vmaMin: 12.0,
    vfaMin: 55.0,
    vfaMax: 75.0,
    airVoidsMin: 3.0,
    airVoidsMax: 6.0,
    code: "ASPH_DBM",
  },
};

type AsphaltType = keyof typeof ASPHALT_SPECS;

interface MarshallRow {
  id: string;
  specimenNo: string;
  bitumenContent: string;
  weightInAir: string;
  weightInWater: string;
  weightSSD: string;
  maxLoad: string; // kN
  flow: string; // mm
  specimenHeight: string; // mm — for stability correction factor
  // computed
  bulkDensity?: number;
  correctionFactor?: number;   // BS EN 12697-34 Table 1
  correctedStability?: number; // stability × correctionFactor
  vma?: number;
  vfa?: number;
  airVoids?: number;
  stability?: number;
  stabilityResult?: "pass" | "fail" | "pending";
  flowResult?: "pass" | "fail" | "pending";
  airVoidsResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

// Gmb (bulk specific gravity) = Wair / (Wssd - Wwater)
// Air voids = (1 - Gmb/Gmm) * 100
// VMA = 100 - (Gmb * (100-Pb)) / Gsa
// VFA = (VMA - Va) / VMA * 100

// BS EN 12697-34 Table 1 — Marshall stability correction factors
// Applied when specimen height ≠ 63.5mm standard height
const MARSHALL_CORRECTION_TABLE = [
  { h: 50.0, cf: 1.47 }, { h: 51.5, cf: 1.39 }, { h: 53.0, cf: 1.32 },
  { h: 54.0, cf: 1.27 }, { h: 55.0, cf: 1.22 }, { h: 56.5, cf: 1.17 },
  { h: 58.0, cf: 1.11 }, { h: 59.0, cf: 1.07 }, { h: 60.0, cf: 1.04 },
  { h: 61.0, cf: 1.01 }, { h: 63.5, cf: 1.00 },
  { h: 65.0, cf: 0.97 }, { h: 66.5, cf: 0.94 }, { h: 67.5, cf: 0.91 },
  { h: 69.0, cf: 0.89 }, { h: 70.5, cf: 0.86 }, { h: 71.5, cf: 0.84 },
  { h: 73.0, cf: 0.81 }, { h: 74.5, cf: 0.79 }, { h: 76.0, cf: 0.77 },
];

function getMarshallCorrectionFactor(heightMm: number): number {
  if (!heightMm || isNaN(heightMm)) return 1.00;
  if (Math.abs(heightMm - 63.5) < 0.1) return 1.00;
  for (let i = 0; i < MARSHALL_CORRECTION_TABLE.length - 1; i++) {
    const lo = MARSHALL_CORRECTION_TABLE[i];
    const hi = MARSHALL_CORRECTION_TABLE[i + 1];
    if (heightMm >= lo.h && heightMm <= hi.h) {
      const t = (heightMm - lo.h) / (hi.h - lo.h);
      return parseFloat((lo.cf + t * (hi.cf - lo.cf)).toFixed(3));
    }
  }
  return 1.00; // outside table range — no correction
}

function computeRow(row: MarshallRow, spec: typeof ASPHALT_SPECS[AsphaltType], gmm: number): MarshallRow {
  const wair = parseFloat(row.weightInAir);
  const wwater = parseFloat(row.weightInWater);
  const wssd = parseFloat(row.weightSSD);
  const load = parseFloat(row.maxLoad);
  const flow = parseFloat(row.flow);

  if (!wair || !wwater || !wssd || !load) return row;

  const gmb = wair / (wssd - wwater);
  const airVoids = gmm > 0 ? (1 - gmb / gmm) * 100 : undefined;
  const height = parseFloat(row.specimenHeight) || 63.5;
  const correctionFactor = getMarshallCorrectionFactor(height);
  const stability = parseFloat((load * correctionFactor).toFixed(2));
  const flowVal = flow;

  const stabilityResult: "pass" | "fail" = stability >= spec.stabilityMin ? "pass" : "fail";
  const flowResult: "pass" | "fail" = flowVal >= spec.flowMin && flowVal <= spec.flowMax ? "pass" : "fail";
  const airVoidsResult: "pass" | "fail" | "pending" =
    airVoids !== undefined
      ? airVoids >= spec.airVoidsMin && airVoids <= spec.airVoidsMax ? "pass" : "fail"
      : "pending";

  const results = [stabilityResult, flowResult, airVoidsResult].filter(r => r !== "pending");
  const overall: "pass" | "fail" | "pending" =
    results.length === 0 ? "pending" : results.every(r => r === "pass") ? "pass" : "fail";

  return {
    ...row,
    bulkDensity: parseFloat(gmb.toFixed(3)),
    correctionFactor: parseFloat(correctionFactor.toFixed(3)),
    correctedStability: parseFloat(stability.toFixed(2)),
    airVoids: airVoids !== undefined ? parseFloat(airVoids.toFixed(2)) : undefined,
    stability: parseFloat(stability.toFixed(2)),
    stabilityResult,
    flowResult,
    airVoidsResult,
    overallResult: overall,
  };
}

function newRow(index: number): MarshallRow {
  return {
    id: `row_${Date.now()}_${index}`,
    specimenNo: `M${index + 1}`,
    bitumenContent: "",
    weightInAir: "",
    weightInWater: "",
    weightSSD: "",
    maxLoad: "",
    flow: "",
    specimenHeight: "63.5",
  };
}

export default function AsphaltMarshall() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [asphaltType, setAsphaltType] = useState<AsphaltType>("ACWC");
  const [gmmStr, setGmmStr] = useState("2.480"); // Maximum Specific Gravity
  const [bitumenGrade, setBitumenGrade] = useState("60/70");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<MarshallRow[]>(
    Array.from({ length: 3 }, (_, i) => newRow(i))
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = ASPHALT_SPECS[asphaltType];
  const gmm = parseFloat(gmmStr) || 2.48;

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

  const computedRows = rows.map(r => computeRow(r, spec, gmm));
  const validRows = computedRows.filter(r => r.stability && r.stability > 0);
  const avgStability = validRows.length > 0
    ? validRows.reduce((s, r) => s + (r.stability ?? 0), 0) / validRows.length
    : 0;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof MarshallRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error("Please enter at least one specimen result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "asphalt_marshall",
        formData: {
          asphaltType,
          spec,
          gmm,
          bitumenGrade,
          source,
          specimens: computedRows,
          avgStability,
          overallResult,
        },
        overallResult,
        summaryValues: {
          asphaltType: spec.label,
          avgStability: avgStability.toFixed(2),
          required: spec.stabilityMin,
          count: validRows.length,
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
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "نوع الخلطة", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Asphalt Tests / Marshall</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Marshall Stability and Flow Test</h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM D6927 / BS EN 12697-34 | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
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

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Mix Design Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Mix Type</Label>
                <Select value={asphaltType} onValueChange={v => setAsphaltType(v as AsphaltType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ASPHALT_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Bitumen Grade</Label>
                <Select value={bitumenGrade} onValueChange={setBitumenGrade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60/70">60/70 Pen</SelectItem>
                    <SelectItem value="80/100">80/100 Pen</SelectItem>
                    <SelectItem value="40/50">40/50 Pen</SelectItem>
                    <SelectItem value="PMB">PMB (Modified)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Gmm (Max Sp. Gravity)</Label>
                <Input value={gmmStr} onChange={e => setGmmStr(e.target.value)} className="font-mono" placeholder="2.480" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Source / Plant</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Asphalt plant" />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">Stability:</span> ≥ {spec.stabilityMin} kN</div>
                  <div><span className="font-semibold">Flow:</span> {spec.flowMin}–{spec.flowMax} mm</div>
                  <div><span className="font-semibold">Air Voids:</span> {spec.airVoidsMin}–{spec.airVoidsMax}%</div>
                  <div><span className="font-semibold">VFA:</span> {spec.vfaMin}–{spec.vfaMax}%</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specimens Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Marshall Specimens</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                <Plus size={14} className="mr-1" /> Add Specimen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Spec. No.</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Bitumen % (Pb)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W. in Air (g)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W. in Water (g)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W. SSD (g)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Gmb</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Air Voids (%)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Height (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">CF</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Max Load (kN)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Flow (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Stability</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Flow</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Overall</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.specimenNo} onChange={e => updateRow(row.id, "specimenNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.bitumenContent} onChange={e => updateRow(row.id, "bitumenContent", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="5.0" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.weightInAir} onChange={e => updateRow(row.id, "weightInAir", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.weightInWater} onChange={e => updateRow(row.id, "weightInWater", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.weightSSD} onChange={e => updateRow(row.id, "weightSSD", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.bulkDensity ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.airVoids !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.airVoidsResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.airVoids}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.specimenHeight} onChange={e => updateRow(row.id, "specimenHeight", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="63.5" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">
                      {row.correctionFactor !== undefined && row.correctionFactor !== 1.00
                        ? <span className="text-amber-600 font-bold">{row.correctionFactor}</span>
                        : <span className="text-slate-400">{row.correctionFactor ?? "—"}</span>}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.maxLoad} onChange={e => updateRow(row.id, "maxLoad", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.flow} onChange={e => updateRow(row.id, "flow", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.stabilityResult && row.stabilityResult !== "pending" ? (
                        <PassFailBadge result={row.stabilityResult} size="sm" value={row.stability} unit="kN" />
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.flowResult && row.flowResult !== "pending" ? (
                        <PassFailBadge result={row.flowResult} size="sm" value={row.flow} unit="mm" />
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.overallResult && row.overallResult !== "pending" ? <PassFailBadge result={row.overallResult} size="sm" /> : "—"}
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
                    <td colSpan={9} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">Average Stability:</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgStability.toFixed(2)} kN</td>
                    <td colSpan={3} className="border border-slate-200"></td>
                    <td className="border border-slate-200 px-2 py-2 text-center"><PassFailBadge result={overallResult} size="sm" /></td>
                    <td className="border border-slate-200"></td>
                  </tr>
                </tfoot>
              )}
            </table>
</div>
          </CardContent>
        </Card>

        {/* Overall Result */}
        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={`Marshall Stability and Flow — ${spec.label}`}
            standard="ASTM D6927"
          />
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">Notes / Observations</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
