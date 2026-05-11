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
import { Send, FlaskConical, Info, UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Bitumen Extraction Test (BS EN 12697-1 / ASTM D2172) ────────────────────
// Formula (CMW Practice):
//   Bitumen Content (%) = [(W_sample - W_aggregate - CF - TF) / W_sample] × 100
// Where:
//   W_sample = mass of asphalt sample (g)
//   W_aggregate = mass of dry aggregate after extraction (g)
//   CF = Correction Factor for fines lost in solvent (g) — from calibration
//   TF = Tare Factor / moisture correction (g)
// Acceptance: Bitumen content within ±0.3% of design bitumen content

const EXTRACTION_METHODS = {
  "CENTRIFUGE": {
    label: "Centrifuge (BS EN 12697-1)",
    standard: "BS EN 12697-1",
    code: "ASPH_BITUMEN_EXTRACT",
  },
  "ROTARY": {
    label: "Rotary Evaporator",
    standard: "BS EN 12697-1",
    code: "ASPH_BITUMEN_EXTRACT",
  },
  "IGNITION": {
    label: "Ignition Furnace (ASTM D6307)",
    standard: "ASTM D6307",
    code: "ASPH_BITUMEN_EXTRACT",
  },
};

type MethodKey = keyof typeof EXTRACTION_METHODS;

interface ExtractionRow {
  id: string;
  sampleNo: string;
  location: string;
  wSample: string;        // Mass of asphalt sample (g)
  wAggregate: string;     // Mass of dry aggregate after extraction (g)
  cf: string;             // Correction Factor (g)
  tf: string;             // Tare Factor (g)
  // computed
  bitumenContent?: number; // %
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): ExtractionRow {
  return {
    id: `row_${Date.now()}_${index}`,
    sampleNo: `S${index + 1}`,
    location: "",
    wSample: "",
    wAggregate: "",
    cf: "0",
    tf: "0",
  };
}

function computeRow(row: ExtractionRow, designBitumen: number, tolerance: number): ExtractionRow {
  const wSample = parseFloat(row.wSample);
  const wAgg = parseFloat(row.wAggregate);
  const cf = parseFloat(row.cf) || 0;
  const tf = parseFloat(row.tf) || 0;

  if (!wSample || !wAgg || wSample <= 0) return row;

  // Bitumen Content = [(W_sample - W_aggregate - CF - TF) / W_sample] × 100
  const bitumenMass = wSample - wAgg - cf - tf;
  const bitumenContent = parseFloat(((bitumenMass / wSample) * 100).toFixed(2));

  const lowerLimit = designBitumen - tolerance;
  const upperLimit = designBitumen + tolerance;
  const result: "pass" | "fail" = bitumenContent >= lowerLimit && bitumenContent <= upperLimit ? "pass" : "fail";

  return { ...row, bitumenContent, result };
}

export default function AsphaltBitumenExtraction() {
  const { user } = useAuth();
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [method, setMethod] = useState<MethodKey>("CENTRIFUGE");
  const [designBitumenStr, setDesignBitumenStr] = useState("5.0"); // % design bitumen content
  const [toleranceStr, setToleranceStr] = useState("0.3");         // ±% tolerance
  const [roadName, setRoadName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ExtractionRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = EXTRACTION_METHODS[method];
  const designBitumen = parseFloat(designBitumenStr) || 5.0;
  const tolerance = parseFloat(toleranceStr) || 0.3;

  const computedRows = rows.map(r => computeRow(r, designBitumen, tolerance));
  const validRows = computedRows.filter(r => r.bitumenContent !== undefined);
  const avgBitumen = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.bitumenContent ?? 0), 0) / validRows.length).toFixed(2))
    : undefined;

  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : validRows.every(r => r.result === "pass") ? "pass" : "fail";

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

  const updateRow = (id: string, field: keyof ExtractionRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one sample result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "asphalt_bitumen_extraction",
        formData: {
          method,
          designBitumen,
          tolerance,
          roadName,
          samples: computedRows,
          avgBitumen,
          overallResult,
        },
        overallResult,
        summaryValues: {
          method: spec.label,
          designBitumen,
          avgBitumen,
          tolerance,
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
            { label: "نوع الخلطة", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / استخلاص البيتومين" : "Asphalt Tests / Bitumen Extraction"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "محتوى البيتومين بالاستخلاص" : "Bitumen Content by Extraction"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              BS EN 12697-1 | {ar ? "أمر التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Formula Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <Info size={12} className="inline mr-1" />
          <strong>{ar ? "الصيغة (ممارسة CMW):" : "Formula (CMW Practice):"}</strong>{" "}
          Bitumen Content (%) = [(W_sample − W_aggregate − CF − TF) ÷ W_sample] × 100<br />
          {ar ? "حيث CF = عامل التصحيح (الجسيمات الدقيقة المفقودة في المذيب)، TF = عامل الوزن الفارغ (تصحيح الرطوبة)." : "Where CF = Correction Factor (fines lost in solvent), TF = Tare Factor (moisture correction)."}
          {ar ? `القبول: بيتومين التصميم ± ${tolerance}%` : `Acceptance: Design Bitumen ± ${tolerance}%`}
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "طريقة الاستخلاص" : "Extraction Method"}</Label>
                <Select value={method} onValueChange={v => setMethod(v as MethodKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXTRACTION_METHODS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "محتوى البيتومين التصميمي (%)" : "Design Bitumen Content (%)"}</Label>
                <Input value={designBitumenStr} onChange={e => setDesignBitumenStr(e.target.value)} className="font-mono" placeholder="5.0" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "التفاوت (±%)" : "Tolerance (±%)"}</Label>
                <Input value={toleranceStr} onChange={e => setToleranceStr(e.target.value)} className="font-mono" placeholder="0.3" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الطريق / الموقع" : "Road / Location"}</Label>
                <Input value={roadName} onChange={e => setRoadName(e.target.value)} placeholder={ar ? "اسم الطريق أو الكيلومترية" : "Road name or chainage"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full space-y-0.5">
                  <div><span className="font-semibold">{ar ? "التصميم:" : "Design:"}</span> {designBitumen}%</div>
                  <div><span className="font-semibold">{ar ? "القبول:" : "Acceptance:"}</span> {(designBitumen - tolerance).toFixed(2)}% – {(designBitumen + tolerance).toFixed(2)}%</div>
                  {avgBitumen !== undefined && (
                    <div className={`font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                      {ar ? "المتوسط:" : "Average:"} {avgBitumen}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Samples Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج الاستخلاص" : "Extraction Results"}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                {ar ? "+ إضافة عينة" : "+ Add Sample"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "رقم العينة" : "Sample No."}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "الموقع" : "Location"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "وزن العينة (جم)" : "W_sample (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "وزن الركام (جم)" : "W_aggregate (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "عامل التصحيح (جم)" : "CF (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "عامل الوزن الفارغ (جم)" : "TF (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "البيتومين (%)" : "Bitumen (%)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">{ar ? "النتيجة" : "Result"}</th>
                  <th className="border border-slate-200 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.sampleNo} onChange={e => updateRow(row.id, "sampleNo", e.target.value)} className="h-7 text-xs w-14" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.location} onChange={e => updateRow(row.id, "location", e.target.value)} className="h-7 text-xs w-24" placeholder={ar ? "ك+000" : "Ch.+000"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.wSample} onChange={e => updateRow(row.id, "wSample", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.wAggregate} onChange={e => updateRow(row.id, "wAggregate", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder="—" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.cf} onChange={e => updateRow(row.id, "cf", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="0" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.tf} onChange={e => updateRow(row.id, "tf", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="0" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.bitumenContent !== undefined ? (
                        <span className={`font-mono text-xs font-bold ${row.result === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                          {row.bitumenContent}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? <PassFailBadge result={row.result} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                        disabled={rows.length <= 1}>
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={6} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">{ar ? "متوسط محتوى البيتومين:" : "Average Bitumen Content:"}</td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">{avgBitumen}%</td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <PassFailBadge result={overallResult} size="sm" />
                    </td>
                    <td className="border border-slate-200"></td>
                  </tr>
                </tfoot>
              )}
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
                testName={ar ? `محتوى البيتومين بالاستخلاص — ${spec.label}` : `Bitumen Content by Extraction — ${spec.label}`}
                standard={spec.standard}
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
