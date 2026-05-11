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
import { Plus, Trash2, Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Structural Steel Specs (BS EN 10025 / ASTM A36 / A572) ──────────────────
const STEEL_GRADES = {
  "S275": {
    label: "S275 (BS EN 10025)",
    yieldMin: 275,  // N/mm²
    tensileMin: 430,
    tensileMax: 580,
    elongationMin: 23, // %
    tsYsRatioMin: 1.10,
    code: "STEEL_STRUCT_S275",
  },
  "S355": {
    label: "S355 (BS EN 10025)",
    yieldMin: 355,
    tensileMin: 470,
    tensileMax: 630,
    elongationMin: 22,
    tsYsRatioMin: 1.10,
    code: "STEEL_STRUCT_S355",
  },
  "A36": {
    label: "A36 (ASTM A36)",
    yieldMin: 250,
    tensileMin: 400,
    tensileMax: 550,
    elongationMin: 23,
    tsYsRatioMin: 1.10,
    code: "STEEL_STRUCT_A36",
  },
  "A572_GR50": {
    label: "A572 Gr.50 (ASTM A572)",
    yieldMin: 345,
    tensileMin: 450,
    tensileMax: 620,
    elongationMin: 21,
    tsYsRatioMin: 1.10,
    code: "STEEL_STRUCT_A572",
  },
};

type SteelGrade = keyof typeof STEEL_GRADES;

interface SpecimenRow {
  id: string;
  specimenNo: string;
  section: string;
  width: string;
  thickness: string;
  gaugeLength: string;
  yieldLoad: string;
  maxLoad: string;
  finalLength: string;
  bendResult: "pass" | "fail" | "pending";
  // computed
  area?: number;
  yieldStrength?: number;
  tensileStrength?: number;
  tsYsRatio?: number;
  elongation?: number;
  yieldResult?: "pass" | "fail" | "pending";
  tensileResult?: "pass" | "fail" | "pending";
  elongationResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function computeSpecimen(row: SpecimenRow, spec: typeof STEEL_GRADES[SteelGrade]): SpecimenRow {
  const w = parseFloat(row.width);
  const t = parseFloat(row.thickness);
  const gl = parseFloat(row.gaugeLength);
  const fl = parseFloat(row.finalLength);
  const yl = parseFloat(row.yieldLoad);
  const ml = parseFloat(row.maxLoad);

  if (!w || !t || !yl || !ml) return row;

  const area = w * t;
  const ys = (yl * 1000) / area;
  const ts = (ml * 1000) / area;
  const ratio = ts / ys;
  const elong = gl && fl ? ((fl - gl) / gl) * 100 : undefined;

  const yieldResult: "pass" | "fail" = ys >= spec.yieldMin ? "pass" : "fail";
  const tensileResult: "pass" | "fail" = ts >= spec.tensileMin && ts <= spec.tensileMax ? "pass" : "fail";
  const elongationResult: "pass" | "fail" | "pending" =
    elong !== undefined ? elong >= spec.elongationMin ? "pass" : "fail" : "pending";

  const results = [yieldResult, tensileResult, elongationResult, row.bendResult].filter(r => r !== "pending");
  const overall: "pass" | "fail" | "pending" =
    results.length === 0 ? "pending" : results.every(r => r === "pass") ? "pass" : "fail";

  return {
    ...row,
    area: parseFloat(area.toFixed(2)),
    yieldStrength: parseFloat(ys.toFixed(1)),
    tensileStrength: parseFloat(ts.toFixed(1)),
    tsYsRatio: parseFloat(ratio.toFixed(3)),
    elongation: elong !== undefined ? parseFloat(elong.toFixed(1)) : undefined,
    yieldResult,
    tensileResult,
    elongationResult,
    overallResult: overall,
  };
}

function newRow(index: number): SpecimenRow {
  return {
    id: `sp_${Date.now()}_${index}`,
    specimenNo: `SP${index + 1}`,
    section: "",
    width: "",
    thickness: "",
    gaugeLength: "200",
    yieldLoad: "",
    maxLoad: "",
    finalLength: "",
    bendResult: "pending",
  };
}

export default function SteelStructural() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [grade, setGrade] = useState<SteelGrade>("S355");
  const [heatNo, setHeatNo] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<SpecimenRow[]>(Array.from({ length: 3 }, (_, i) => newRow(i)));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = STEEL_GRADES[grade];
  const computedRows = rows.map(r => computeSpecimen(r, spec));
  const validRows = computedRows.filter(r => r.yieldStrength !== undefined);
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

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

  const updateRow = (id: string, field: keyof SpecimenRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && validRows.length === 0) {
      toast.error("Please enter at least one specimen result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: spec.code,
        formTemplate: "steel_structural",
        formData: { grade, spec, heatNo, specimens: computedRows, overallResult },
        overallResult,
        summaryValues: { grade: spec.label, specimensTested: validRows.length, overallResult },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Steel Tests / Structural Steel</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Structural Steel Tensile & Bend Test</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS EN 10025 / ASTM A36 / A572 | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
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
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Steel Grade</Label>
                <Select value={grade} onValueChange={v => setGrade(v as SteelGrade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STEEL_GRADES).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Heat / Batch No.</Label>
                <Input value={heatNo} onChange={e => setHeatNo(e.target.value)} placeholder="Heat number" />
              </div>
              <div className="col-span-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 grid grid-cols-4 gap-2">
                  <div><span className="font-semibold">Yield:</span><br />≥ {spec.yieldMin} N/mm²</div>
                  <div><span className="font-semibold">Tensile:</span><br />{spec.tensileMin}–{spec.tensileMax} N/mm²</div>
                  <div><span className="font-semibold">Elongation:</span><br />≥ {spec.elongationMin}%</div>
                  <div><span className="font-semibold">T/Y Ratio:</span><br />≥ {spec.tsYsRatioMin}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specimens Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Test Specimens</CardTitle>
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
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Sp. No.</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Section</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">T (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Area (mm²)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">GL₀ (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Yield (kN)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Max (kN)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">GL₁ (mm)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">YS (N/mm²)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">TS (N/mm²)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">T/Y</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Elong. (%)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Bend</th>
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
                      <Input value={row.section} onChange={e => updateRow(row.id, "section", e.target.value)} className="h-7 text-xs w-20" placeholder="e.g. IPE200" />
                    </td>
                    {["width", "thickness"].map(f => (
                      <td key={f} className="border border-slate-200 px-1 py-1">
                        <Input value={(row as any)[f]} onChange={e => updateRow(row.id, f as keyof SpecimenRow, e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.area ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.gaugeLength} onChange={e => updateRow(row.id, "gaugeLength", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="200" />
                    </td>
                    {["yieldLoad", "maxLoad"].map(f => (
                      <td key={f} className="border border-slate-200 px-1 py-1">
                        <Input value={(row as any)[f]} onChange={e => updateRow(row.id, f as keyof SpecimenRow, e.target.value)} className="h-7 text-xs w-18 text-center font-mono" placeholder="—" />
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.finalLength} onChange={e => updateRow(row.id, "finalLength", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.yieldStrength !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.yieldResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.yieldStrength}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.tensileStrength !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.tensileResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.tensileStrength}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.tsYsRatio ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.elongation !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.elongationResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.elongation}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Select value={row.bendResult} onValueChange={v => updateRow(row.id, "bendResult", v)}>
                        <SelectTrigger className="h-7 text-xs w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">—</SelectItem>
                          <SelectItem value="pass">Pass</SelectItem>
                          <SelectItem value="fail">Fail</SelectItem>
                        </SelectContent>
                      </Select>
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
            </table>
</div>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={`Structural Steel — ${spec.label}`}
            standard="BS EN 10025"
          />
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
