import { useState, useCallback } from "react";
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
import { Plus, Trash2, Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Bend / Rebend Test Specs (BS 4449) ──────────────────────────────────────
// Bend Test: 180° bend around mandrel diameter = 4d (B500B/C)
// Rebend Test: Straighten + rebend 90° after 1h at 100°C
// Result is VISUAL inspection only — no cracks or fractures = PASS
const BEND_STANDARDS = {
  "BS4449_B500B": {
    label: "BS 4449 Grade B500B",
    bendAngle: 180,
    mandrelDiameter: "4d",
    rebendAngle: 90,
    rebendCondition: "1h at 100°C then straighten + rebend",
    standard: "BS 4449",
    code: "STEEL_BEND_BS4449",
  },
  "BS4449_B500C": {
    label: "BS 4449 Grade B500C",
    bendAngle: 180,
    mandrelDiameter: "4d",
    rebendAngle: 90,
    rebendCondition: "1h at 100°C then straighten + rebend",
    standard: "BS 4449",
    code: "STEEL_BEND_BS4449",
  },
  "ASTM_A615_60": {
    label: "ASTM A615 Grade 60",
    bendAngle: 180,
    mandrelDiameter: "6d",
    rebendAngle: 90,
    rebendCondition: "N/A",
    standard: "ASTM A615",
    code: "STEEL_BEND_ASTM",
  },
};

type BendStandardKey = keyof typeof BEND_STANDARDS;

// Test type: Bend only, Rebend only, or Both
type TestMode = "BEND_ONLY" | "REBEND_ONLY" | "BOTH";

interface BendRow {
  id: string;
  specimenNo: string;
  barSize: string;
  heatNo: string;
  bendResult: "Pass" | "Fail" | "";
  rebendResult: "Pass" | "Fail" | "";
  observations: string;
  overallResult?: "pass" | "fail" | "pending";
}

function newRow(index: number): BendRow {
  return {
    id: `row_${Date.now()}_${index}`,
    specimenNo: `S${index + 1}`,
    barSize: "T12",
    heatNo: "",
    bendResult: "",
    rebendResult: "",
    observations: "",
  };
}

function computeRow(row: BendRow, testMode: TestMode): BendRow {
  const bendRes: "pass" | "fail" | "pending" =
    row.bendResult === "Pass" ? "pass" : row.bendResult === "Fail" ? "fail" : "pending";
  const rebendRes: "pass" | "fail" | "pending" =
    row.rebendResult === "Pass" ? "pass" : row.rebendResult === "Fail" ? "fail" : "pending";

  let overall: "pass" | "fail" | "pending" = "pending";
  if (testMode === "BEND_ONLY") {
    overall = bendRes;
  } else if (testMode === "REBEND_ONLY") {
    overall = rebendRes;
  } else {
    // BOTH
    if (bendRes === "pending" || rebendRes === "pending") {
      overall = "pending";
    } else {
      overall = bendRes === "pass" && rebendRes === "pass" ? "pass" : "fail";
    }
  }

  return { ...row, overallResult: overall };
}

const BAR_SIZES = ["T8", "T10", "T12", "T16", "T20", "T25", "T32", "T40",
  "#3", "#4", "#5", "#6", "#7", "#8", "#9", "#10"];

export default function SteelBendRebend() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [standard, setStandard] = useState<BendStandardKey>("BS4449_B500B");
  const [testMode, setTestMode] = useState<TestMode>("BOTH");
  const [heatNo, setHeatNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<BendRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = BEND_STANDARDS[standard];
  const computedRows = rows.map(r => computeRow(r, testMode));
  const validRows = computedRows.filter(r => r.overallResult !== "pending");
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

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

  const updateRow = useCallback((id: string, field: keyof BendRow, value: string) => {
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
        formTemplate: "steel_bend_rebend",
        formData: { standard, spec, testMode, heatNo, supplier, specimens: computedRows, overallResult },
        overallResult,
        summaryValues: {
          standard: spec.label,
          testMode,
          specimensTested: validRows.length,
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
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "Diameter / القطر", value: dist?.testSubType ? `${dist.testSubType} mm` : null },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>Steel Tests / Bend & Rebend</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Bend & Rebend Test of Reinforcement Bars</h1>
            <p className="text-slate-500 text-sm mt-1">
              {spec.standard} | Distribution: {dist?.distributionCode ?? `DIST-${distId}`}
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
              <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
            </Button>
              </>
            )}
              </>
            )}
          </div>
        </div>

        {/* Visual Inspection Note */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <Info size={12} className="inline mr-1" />
          <strong>Visual Inspection Only:</strong> No cracks, fractures, or surface defects visible after bending = PASS.
          Bend Test: {spec.bendAngle}° around mandrel diameter {spec.mandrelDiameter}.
          {spec.rebendCondition !== "N/A" && (
            <> Rebend Test: {spec.rebendCondition}.</>
          )}
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Test Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Standard / Grade</Label>
                <Select value={standard} onValueChange={v => setStandard(v as BendStandardKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BEND_STANDARDS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Test Type</Label>
                <Select value={testMode} onValueChange={v => setTestMode(v as TestMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BEND_ONLY">Bend Test Only</SelectItem>
                    <SelectItem value="REBEND_ONLY">Rebend Test Only</SelectItem>
                    <SelectItem value="BOTH">Bend + Rebend (Both)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Heat / Cast No.</Label>
                <Input value={heatNo} onChange={e => setHeatNo(e.target.value)} placeholder="Heat number" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Supplier / Mill</Label>
                <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Steel supplier" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Tested By / الفاحص</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">Bend:</span> {spec.bendAngle}° around {spec.mandrelDiameter}</div>
                  {spec.rebendCondition !== "N/A" && (
                    <div><span className="font-semibold">Rebend:</span> {spec.rebendAngle}° ({spec.rebendCondition})</div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specimens Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Specimens — Visual Inspection Results</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length)])}>
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
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Bar Size</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Heat No.</th>
                  {(testMode === "BEND_ONLY" || testMode === "BOTH") && (
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      Bend ({spec.bendAngle}° / {spec.mandrelDiameter})
                    </th>
                  )}
                  {(testMode === "REBEND_ONLY" || testMode === "BOTH") && (
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
                      Rebend ({spec.rebendAngle}°)
                    </th>
                  )}
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">Observations</th>
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
                      <Select value={row.barSize} onValueChange={v => updateRow(row.id, "barSize", v)}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BAR_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.heatNo} onChange={e => updateRow(row.id, "heatNo", e.target.value)} className="h-7 text-xs w-20" placeholder="—" />
                    </td>
                    {(testMode === "BEND_ONLY" || testMode === "BOTH") && (
                      <td className="border border-slate-200 px-1 py-1">
                        <Select value={row.bendResult} onValueChange={v => updateRow(row.id, "bendResult", v)}>
                          <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pass">Pass ✓</SelectItem>
                            <SelectItem value="Fail">Fail ✗</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    {(testMode === "REBEND_ONLY" || testMode === "BOTH") && (
                      <td className="border border-slate-200 px-1 py-1">
                        <Select value={row.rebendResult} onValueChange={v => updateRow(row.id, "rebendResult", v)}>
                          <SelectTrigger className="h-7 text-xs w-20"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pass">Pass ✓</SelectItem>
                            <SelectItem value="Fail">Fail ✗</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.observations} onChange={e => updateRow(row.id, "observations", e.target.value)} className="h-7 text-xs w-40" placeholder="e.g. No cracks" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.overallResult && row.overallResult !== "pending"
                        ? <PassFailBadge result={row.overallResult} size="sm" />
                        : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                        disabled={rows.length <= 1}>
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

        {/* Summary */}
        {validRows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <ResultBanner
                result={overallResult}
                testName={`Bend & Rebend Test — ${spec.label} (${testMode === "BEND_ONLY" ? "Bend" : testMode === "REBEND_ONLY" ? "Rebend" : "Bend + Rebend"})`}
                standard={spec.standard}
              />
            </CardContent>
          </Card>
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
