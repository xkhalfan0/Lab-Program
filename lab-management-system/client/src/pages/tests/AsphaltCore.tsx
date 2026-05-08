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

// ─── Asphalt Core Specs ─────────────────────────────────────────────
// NOTE (CMW Practice): Degree of Compaction = (Core Bulk Density ÷ Marshall Density) × 100
// Reference density = Marshall Density (NOT Gmm/Maximum Theoretical Density)
// Acceptance: Degree of Compaction ≥ 97% (wearing course), ≥ 96% (binder/base)──────────
const CORE_SPECS = {
  "ACWC": {
    label: "ACWC (Wearing Course)",
    thicknessMin: 40, // mm
    thicknessMax: 60,
    compactionMin: 97.0, // % of Marshall Density
    code: "ASPH_CORE",
  },
  "ACBC": {
    label: "ACBC (Binder Course)",
    thicknessMin: 50,
    thicknessMax: 80,
    compactionMin: 96.0,
    code: "ASPH_CORE",
  },
  "BASE": {
    label: "Asphalt Base Course",
    thicknessMin: 80,
    thicknessMax: 120,
    compactionMin: 96.0,
    code: "ASPH_CORE",
  },
};

type CoreType = keyof typeof CORE_SPECS;

interface CoreRow {
  id: string;
  coreNo: string;
  location: string;
  diameter: string;
  thickness1: string;
  thickness2: string;
  thickness3: string;
  weightInAir: string;
  weightInWater: string;
  weightSSD: string;
  // computed
  avgThickness?: number;
  bulkDensity?: number;
  degreeOfCompaction?: number;  // (Gmb / Marshall Density) × 100
  thicknessResult?: "pass" | "fail" | "pending";
  compactionResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

// marshallDensity: reference density from Marshall test (g/cm³)
// Degree of Compaction = (Gmb / marshallDensity) × 100
function computeCore(row: CoreRow, spec: typeof CORE_SPECS[CoreType], marshallDensity: number): CoreRow {
  const t1 = parseFloat(row.thickness1);
  const t2 = parseFloat(row.thickness2);
  const t3 = parseFloat(row.thickness3);
  const wair = parseFloat(row.weightInAir);
  const wwater = parseFloat(row.weightInWater);
  const wssd = parseFloat(row.weightSSD);

  const thicknesses = [t1, t2, t3].filter(t => !isNaN(t) && t > 0);
  const avgThickness = thicknesses.length > 0
    ? parseFloat((thicknesses.reduce((s, t) => s + t, 0) / thicknesses.length).toFixed(1))
    : undefined;

  let bulkDensity: number | undefined;
  let degreeOfCompaction: number | undefined;
  if (wair && wwater && wssd) {
    // Bulk density (Gmb) = W_air / (W_SSD - W_water)
    bulkDensity = parseFloat((wair / (wssd - wwater)).toFixed(3));
    // Degree of Compaction = (Core Bulk Density ÷ Marshall Density) × 100
    if (marshallDensity > 0) {
      degreeOfCompaction = parseFloat(((bulkDensity / marshallDensity) * 100).toFixed(1));
    }
  }

  const thicknessResult: "pass" | "fail" | "pending" =
    avgThickness !== undefined
      ? avgThickness >= spec.thicknessMin && avgThickness <= spec.thicknessMax ? "pass" : "fail"
      : "pending";
  const compactionResult: "pass" | "fail" | "pending" =
    degreeOfCompaction !== undefined
      ? degreeOfCompaction >= spec.compactionMin ? "pass" : "fail"
      : "pending";

  const results = [thicknessResult, compactionResult].filter(r => r !== "pending");
  const overall: "pass" | "fail" | "pending" =
    results.length === 0 ? "pending" : results.every(r => r === "pass") ? "pass" : "fail";

  return { ...row, avgThickness, bulkDensity, degreeOfCompaction, thicknessResult, compactionResult, overallResult: overall };
}

function newRow(index: number): CoreRow {
  return {
    id: `row_${Date.now()}_${index}`,
    coreNo: `AC${index + 1}`,
    location: "",
    diameter: "100",
    thickness1: "",
    thickness2: "",
    thickness3: "",
    weightInAir: "",
    weightInWater: "",
    weightSSD: "",
  };
}

export default function AsphaltCore() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [coreType, setCoreType] = useState<CoreType>("ACWC");
  const [marshallDensityStr, setMarshallDensityStr] = useState("2.350"); // Marshall Density (g/cm³)
  const [roadName, setRoadName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<CoreRow[]>(Array.from({ length: 3 }, (_, i) => newRow(i)));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = CORE_SPECS[coreType];
  const marshallDensity = parseFloat(marshallDensityStr) || 2.35;

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة" : "Draft saved");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const computedRows = rows.map(r => computeCore(r, spec, marshallDensity));
  const validRows = computedRows.filter(r => r.avgThickness !== undefined);
  const avgThickness = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.avgThickness ?? 0), 0) / validRows.length).toFixed(1))
    : undefined;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.overallResult === "pass") ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof CoreRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة لب واحدة على الأقل" : "Please enter at least one core result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: spec.code,
        formTemplate: "asphalt_core",
        formData: { coreType, spec, marshallDensity, roadName, cores: computedRows, avgThickness, overallResult },
        overallResult,
        summaryValues: { coreType: spec.label, avgThickness, marshallDensity, overallResult },
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
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "الطبقة", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / استخلاص اللب" : "Asphalt Tests / Core Extraction"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "كثافة وسمك اللب الأسفلتي" : "Asphalt Core Thickness & Density"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM D5361 / BS EN 12697-36 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button size="sm" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الطبقة" : "Layer Type"}</Label>
                <Select value={coreType} onValueChange={v => setCoreType(v as CoreType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CORE_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "كثافة مارشال (جم/سم³)" : "Marshall Density (g/cm³)"}</Label>
                <Input value={marshallDensityStr} onChange={e => setMarshallDensityStr(e.target.value)} className="font-mono" placeholder="2.350" />
                <p className="text-xs text-blue-600 mt-0.5">{ar ? "المرجع: نتيجة اختبار مارشال" : "Reference: Marshall test result"}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الطريق / الموقع" : "Road / Location"}</Label>
                <Input value={roadName} onChange={e => setRoadName(e.target.value)} placeholder={ar ? "اسم الطريق أو الكيلومترية" : "Road name or chainage"} />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">{ar ? "السمك:" : "Thickness:"}</span> {spec.thicknessMin}–{spec.thicknessMax} mm</div>
                  <div><span className="font-semibold">{ar ? "الدمك:" : "Compaction:"}</span> ≥ {spec.compactionMin}% of Marshall Density</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cores Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج اللب" : "Core Results"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                <Plus size={14} className="mr-1" /> {ar ? "إضافة عينة" : "Add Core"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "رقم اللب" : "Core No."}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الموقع" : "Location"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "القطر (مم)" : "Dia. (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "س₁ (مم)" : "T₁ (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "س₂ (مم)" : "T₂ (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "س₃ (مم)" : "T₃ (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "متوسط س (مم)" : "Avg T (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "وزن الهواء (جم)" : "W Air (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "وزن الماء (جم)" : "W Water (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "وزن SSD (جم)" : "W SSD (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الدمك (%)" : "Compaction (%)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "نتيجة س" : "T Result"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "النتيجة" : "Overall"}</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.coreNo} onChange={e => updateRow(row.id, "coreNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.location} onChange={e => updateRow(row.id, "location", e.target.value)} className="h-7 text-xs w-24" placeholder={ar ? "ك + 000" : "Ch.+000"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.diameter} onChange={e => updateRow(row.id, "diameter", e.target.value)} className="h-7 text-xs w-14 text-center font-mono" />
                    </td>
                    {["thickness1", "thickness2", "thickness3"].map(f => (
                      <td key={f} className="border border-slate-200 px-1 py-1">
                        <Input value={(row as any)[f]} onChange={e => updateRow(row.id, f as keyof CoreRow, e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="—" />
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.avgThickness !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.thicknessResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.avgThickness}
                        </span>
                      ) : "—"}
                    </td>
                    {["weightInAir", "weightInWater", "weightSSD"].map(f => (
                      <td key={f} className="border border-slate-200 px-1 py-1">
                        <Input value={(row as any)[f]} onChange={e => updateRow(row.id, f as keyof CoreRow, e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600">{row.bulkDensity ?? "—"}</td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.degreeOfCompaction !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.compactionResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.degreeOfCompaction}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.thicknessResult && row.thicknessResult !== "pending" ? <PassFailBadge result={row.thicknessResult} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.overallResult && row.overallResult !== "pending" ? <PassFailBadge result={row.overallResult} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => setRows(p => p.filter(r => r.id !== row.id))} disabled={rows.length <= 1}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={6} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">{ar ? "متوسط السمك:" : "Average Thickness:"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgThickness} mm</td>
                    <td colSpan={5} className="border border-slate-200"></td>
                    <td colSpan={2} className="border border-slate-200 px-2 py-2 text-center"><PassFailBadge result={overallResult} size="sm" /></td>
                    <td className="border border-slate-200"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={`Asphalt Core — ${spec.label}`}
            standard="ASTM D5361"
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
