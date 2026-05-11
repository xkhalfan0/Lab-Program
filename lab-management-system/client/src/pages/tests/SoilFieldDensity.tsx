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
// ─── Field Density Test (BS 1377-9 / ASTM D1556) ─────────────────────────────
const METHODS = {
  "SAND_REPLACEMENT": { label: "Sand Replacement Method (BS 1377-9)", code: "SOIL_FIELD_DENSITY" },
  "CORE_CUTTER": { label: "Core Cutter Method (BS 1377-9)", code: "SOIL_FIELD_DENSITY" },
  "NUCLEAR": { label: "Nuclear Gauge (ASTM D6938)", code: "SOIL_FIELD_DENSITY" },
};

type Method = keyof typeof METHODS;

interface TestPoint {
  id: string;
  pointNo: string;
  location: string;
  depth: string;
  // Sand Replacement
  massHoleSand?: string;
  massConeAndSand?: string;
  massCone?: string;
  massSandCone?: string;
  sandDensity?: string;
  massWetSoil?: string;
  moistureContent?: string;
  // Core Cutter
  coreMass?: string;
  coreVolume?: string;
  // Computed
  wetDensity?: number;
  dryDensity?: number;
  relativeCompaction?: number;
  result?: "pass" | "fail" | "pending";
}

function computePoint(pt: TestPoint, method: Method, mdd: number, requiredRC: number): TestPoint {
  let wetDensity: number | undefined;
  let dryDensity: number | undefined;

  if (method === "SAND_REPLACEMENT") {
    const massSandInHole = parseFloat(pt.massHoleSand ?? "0");
    const sandDens = parseFloat(pt.sandDensity ?? "0");
    const massWetSoil = parseFloat(pt.massWetSoil ?? "0");
    const wc = parseFloat(pt.moistureContent ?? "0");

    if (massSandInHole > 0 && sandDens > 0 && massWetSoil > 0) {
      const holeVolume = massSandInHole / sandDens; // cm³
      wetDensity = massWetSoil / holeVolume;
      dryDensity = wetDensity / (1 + wc / 100);
    }
  } else if (method === "CORE_CUTTER") {
    const coreMass = parseFloat(pt.coreMass ?? "0");
    const coreVol = parseFloat(pt.coreVolume ?? "1000"); // cm³
    const wc = parseFloat(pt.moistureContent ?? "0");
    if (coreMass > 0 && coreVol > 0) {
      wetDensity = coreMass / coreVol;
      dryDensity = wetDensity / (1 + wc / 100);
    }
  } else if (method === "NUCLEAR") {
    const wet = parseFloat(pt.massWetSoil ?? "0"); // direct reading
    const wc = parseFloat(pt.moistureContent ?? "0");
    if (wet > 0) {
      wetDensity = wet;
      dryDensity = wet / (1 + wc / 100);
    }
  }

  const relativeCompaction = mdd > 0 && dryDensity !== undefined
    ? parseFloat(((dryDensity / mdd) * 100).toFixed(1))
    : undefined;

  const result: "pass" | "fail" | "pending" =
    relativeCompaction !== undefined
      ? relativeCompaction >= requiredRC ? "pass" : "fail"
      : "pending";

  return {
    ...pt,
    wetDensity: wetDensity !== undefined ? parseFloat(wetDensity.toFixed(3)) : undefined,
    dryDensity: dryDensity !== undefined ? parseFloat(dryDensity.toFixed(3)) : undefined,
    relativeCompaction,
    result,
  };
}

function newPoint(index: number): TestPoint {
  return {
    id: `pt_${Date.now()}_${index}`,
    pointNo: `P${index + 1}`,
    location: "",
    depth: "0.3",
    massHoleSand: "",
    massConeAndSand: "",
    massCone: "",
    massSandCone: "",
    sandDensity: "1.55",
    massWetSoil: "",
    moistureContent: "",
    coreMass: "",
    coreVolume: "1000",
  };
}

export default function SoilFieldDensity() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [method, setMethod] = useState<Method>("SAND_REPLACEMENT");
  const [mddStr, setMddStr] = useState("");
  const [requiredRCStr, setRequiredRCStr] = useState("95");
  const [location, setLocation2] = useState("");
  const [notes, setNotes] = useState("");
  const [points, setPoints] = useState<TestPoint[]>(Array.from({ length: 3 }, (_, i) => newPoint(i)));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const mdd = parseFloat(mddStr) || 0;
  const requiredRC = parseFloat(requiredRCStr) || 95;

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

  const computedPoints = points.map(p => computePoint(p, method, mdd, requiredRC));
  const validPoints = computedPoints.filter(p => p.dryDensity !== undefined);
  const overallResult: "pass" | "fail" | "pending" =
    validPoints.length === 0 ? "pending"
    : validPoints.every(p => p.result === "pass") ? "pass" : "fail";

  const updatePoint = (id: string, field: keyof TestPoint, value: string) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validPoints.length === 0) {
      toast.error("Please enter at least one test point result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "SOIL_FIELD_DENSITY",
        formTemplate: "soil_field_density",
        formData: { method, mdd, requiredRC, location, points: computedPoints, overallResult },
        overallResult,
        summaryValues: { method, mdd, requiredRC, pointsTested: validPoints.length, overallResult },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const isSandReplacement = method === "SAND_REPLACEMENT";
  const isCoreMethod = method === "CORE_CUTTER";
  const isNuclear = method === "NUCLEAR";

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
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Soil Tests / Field Density</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Field Density Test (Relative Compaction)</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 1377-9 / ASTM D1556 | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Label className="text-xs text-slate-500 mb-1 block">Test Method</Label>
                <Select value={method} onValueChange={v => setMethod(v as Method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHODS).map(([k, m]) => (
                      <SelectItem key={k} value={k}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">MDD from Proctor (g/cm³)</Label>
                <Input value={mddStr} onChange={e => setMddStr(e.target.value)} className="font-mono" placeholder="e.g. 1.85" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Required Relative Compaction (%)</Label>
                <Input value={requiredRCStr} onChange={e => setRequiredRCStr(e.target.value)} className="font-mono" placeholder="95" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Location / Area</Label>
                <Input value={location} onChange={e => setLocation2(e.target.value)} placeholder="e.g. Road base layer, Layer 3" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Points Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Field Test Points</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPoints(p => [...p, newPoint(p.length)])}>
                <Plus size={14} className="mr-1" /> Add Point
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Point No.</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Location</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Depth (m)</th>
                  {isSandReplacement && <>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Sand in Hole (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Sand Density (g/cm³)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Wet Soil (g)</th>
                  </>}
                  {isCoreMethod && <>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Core Mass (g)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Core Volume (cm³)</th>
                  </>}
                  {isNuclear && <>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Wet Density (g/cm³)</th>
                  </>}
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">W.C. (%)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Dry Density (g/cm³)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">RC (%)</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Result</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedPoints.map((pt, idx) => (
                  <tr key={pt.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={pt.pointNo} onChange={e => updatePoint(pt.id, "pointNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={pt.location} onChange={e => updatePoint(pt.id, "location", e.target.value)} className="h-7 text-xs w-24" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={pt.depth} onChange={e => updatePoint(pt.id, "depth", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" />
                    </td>
                    {isSandReplacement && <>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.massHoleSand ?? ""} onChange={e => updatePoint(pt.id, "massHoleSand", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.sandDensity ?? ""} onChange={e => updatePoint(pt.id, "sandDensity", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="1.55" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.massWetSoil ?? ""} onChange={e => updatePoint(pt.id, "massWetSoil", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                    </>}
                    {isCoreMethod && <>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.coreMass ?? ""} onChange={e => updatePoint(pt.id, "coreMass", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.coreVolume ?? ""} onChange={e => updatePoint(pt.id, "coreVolume", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="1000" />
                      </td>
                    </>}
                    {isNuclear && <>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={pt.massWetSoil ?? ""} onChange={e => updatePoint(pt.id, "massWetSoil", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                    </>}
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={pt.moistureContent ?? ""} onChange={e => updatePoint(pt.id, "moistureContent", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                      {pt.dryDensity ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {pt.relativeCompaction !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${pt.result === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {pt.relativeCompaction}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {pt.result && pt.result !== "pending" ? <PassFailBadge result={pt.result} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setPoints(p => p.filter(r => r.id !== pt.id))} disabled={points.length <= 1}>
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

        {validPoints.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={`Field Density — ${METHODS[method].label}`}
            standard="BS 1377-9"
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
