import { useState, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, FlaskConical, Info, UserCheck, Printer, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Block Type Specs (BS EN 6073) ────────────────────────────────────────────
const BLOCK_SPECS = {
  SOLID_10:   { label: "Solid Block (10cm)",   labelAr: "بلوك صلب 10سم",   size: "400×100×200 mm", grossArea: 400 * 100, requiredStrength: 10.5, standard: "BS EN 6073", code: "CONC_BLOCK_SOLID",   blockType: "solid_block",   blockSize: "10cm" },
  SOLID_15:   { label: "Solid Block (15cm)",   labelAr: "بلوك صلب 15سم",   size: "400×150×200 mm", grossArea: 400 * 150, requiredStrength: 10.5, standard: "BS EN 6073", code: "CONC_BLOCK_SOLID",   blockType: "solid_block",   blockSize: "15cm" },
  SOLID_20:   { label: "Solid Block (20cm)",   labelAr: "بلوك صلب 20سم",   size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 10.5, standard: "BS EN 6073", code: "CONC_BLOCK_SOLID",   blockType: "solid_block",   blockSize: "20cm" },
  SOLID_25:   { label: "Solid Block (25cm)",   labelAr: "بلوك صلب 25سم",   size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 10.5, standard: "BS EN 6073", code: "CONC_BLOCK_SOLID",   blockType: "solid_block",   blockSize: "25cm" },
  HOLLOW_10:  { label: "Hollow Block (10cm)",  labelAr: "بلوك مجوف 10سم",  size: "400×100×200 mm", grossArea: 400 * 100, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_HOLLOW",  blockType: "hollow_block",  blockSize: "10cm" },
  HOLLOW_15:  { label: "Hollow Block (15cm)",  labelAr: "بلوك مجوف 15سم",  size: "400×150×200 mm", grossArea: 400 * 150, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_HOLLOW",  blockType: "hollow_block",  blockSize: "15cm" },
  HOLLOW_20:  { label: "Hollow Block (20cm)",  labelAr: "بلوك مجوف 20سم",  size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_HOLLOW",  blockType: "hollow_block",  blockSize: "20cm" },
  HOLLOW_25:  { label: "Hollow Block (25cm)",  labelAr: "بلوك مجوف 25سم",  size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_HOLLOW",  blockType: "hollow_block",  blockSize: "25cm" },
  THERMAL_20: { label: "Thermal Block (20cm)", labelAr: "بلوك حراري 20سم", size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_THERMAL", blockType: "thermal_block", blockSize: "20cm" },
  THERMAL_25: { label: "Thermal Block (25cm)", labelAr: "بلوك حراري 25سم", size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 7.0,  standard: "BS EN 6073", code: "CONC_BLOCK_THERMAL", blockType: "thermal_block", blockSize: "25cm" },
};

type BlockTypeKey = keyof typeof BLOCK_SPECS;

const MIN_BLOCKS = 10;

interface BlockRow {
  id: string;
  blockRef: string;
  lengthMm: string;
  widthMm: string;
  loadKN: string;
  grossAreaMm2?: number;
  strengthMpa?: number;
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): BlockRow {
  return { id: `row_${Date.now()}_${index}`, blockRef: String(index + 1), lengthMm: "", widthMm: "", loadKN: "" };
}

function computeRow(row: BlockRow, spec: typeof BLOCK_SPECS[BlockTypeKey]): BlockRow {
  const load = parseFloat(row.loadKN);
  if (!load) return row;
  const length = parseFloat(row.lengthMm);
  const width = parseFloat(row.widthMm);
  const grossArea = (length > 0 && width > 0) ? length * width : spec.grossArea;
  const strength = (load * 1000) / grossArea;
  return {
    ...row,
    grossAreaMm2: Math.round(grossArea),
    strengthMpa: Math.round(strength * 10) / 10,
    result: strength >= spec.requiredStrength ? "pass" : "fail",
  };
}

export default function ConcreteBlocks() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  const [blockType, setBlockType] = useState<BlockTypeKey>("SOLID_10");

  // Auto-detect block type from distribution testType
  useEffect(() => {
    if (!dist) return;
    const tt = (dist.testType ?? "").toLowerCase();
    const m = tt.match(/^(solid_block|hollow_block|thermal_block)__(\d+cm)$/);
    if (m) {
      const prefix = m[1] === "solid_block" ? "SOLID" : m[1] === "hollow_block" ? "HOLLOW" : "THERMAL";
      const key = `${prefix}_${m[2].replace("cm", "")}` as BlockTypeKey;
      if (key in BLOCK_SPECS) { setBlockType(key); return; }
    }
    if (tt.includes("hollow")) setBlockType("HOLLOW_20");
    else if (tt.includes("thermal")) setBlockType("THERMAL_25");
    else setBlockType("SOLID_10");
  }, [dist]);

  // Delivery info — set by reception, read-only for tech (stored in dist.notes if available)
  const [manufacturer, setManufacturer] = useState("");
  const [mtsReference, setMtsReference] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [testDate, setTestDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [moistureCondition, setMoistureCondition] = useState("saturated_surface_dry");
  const [cappingMethod, setCappingMethod] = useState("flat_bedded");
  const [loadingRate, setLoadingRate] = useState("0.05");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<BlockRow[]>(
    Array.from({ length: MIN_BLOCKS }, (_, i) => newRow(i))
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = BLOCK_SPECS[blockType];

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Test results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const computedRows = rows.map(r => computeRow(r, spec));
  const validRows = computedRows.filter(r => r.strengthMpa && r.strengthMpa > 0);
  const avgStrength = validRows.length > 0
    ? validRows.reduce((s, r) => s + (r.strengthMpa ?? 0), 0) / validRows.length
    : 0;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0 ? "pending"
    : avgStrength >= spec.requiredStrength ? "pass" : "fail";

  const updateRow = useCallback((id: string, field: keyof BlockRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة بلوك واحدة على الأقل" : "Please enter at least one block result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "concrete_blocks",
        formData: {
          blockType,
          blockSpec: spec,
          manufacturer,
          mtsReference,
          batchNo,
          testDate,
          moistureCondition,
          cappingMethod,
          loadingRate,
          blocks: computedRows.filter(r => r.loadKN && parseFloat(r.loadKN) > 0),
          avgStrength,
          overallResult,
        },
        overallResult,
        summaryValues: {
          blockType: spec.label,
          avgStrength: avgStrength.toFixed(2),
          required: spec.requiredStrength,
          count: validRows.length,
          testDate,
        },
        notes,
        status,
        testDate,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!distId || distId === 0) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-red-600">
          {ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        <SampleInfoCard dist={dist} />

        {/* Header + overall result at top */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              {ar ? "اختبارات الخرسانة" : "Concrete Tests"}
              <span>/</span>
              <span className="font-medium text-slate-700">
                {ar ? "مقاومة الضغط للبلوك الخرساني" : "Compressive Strength of Masonry Blocks"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "مقاومة الضغط للبلوك الخرساني" : "Compressive Strength of Masonry Blocks"}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              BS EN 6073 &nbsp;·&nbsp; {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Live result badge at top */}
            {validRows.length > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 ${
                overallResult === "pass"
                  ? "bg-green-50 border-green-300 text-green-800"
                  : overallResult === "fail"
                  ? "bg-red-50 border-red-300 text-red-800"
                  : "bg-gray-50 border-gray-200 text-gray-600"
              }`}>
                {overallResult === "pass"
                  ? <><CheckCircle2 size={16} /> {ar ? "مطابق — PASS" : "PASS — مطابق"}</>
                  : overallResult === "fail"
                  ? <><XCircle size={16} /> {ar ? "غير مطابق — FAIL" : "FAIL — غير مطابق"}</>
                  : ar ? "قيد الإدخال" : "Pending"}
              </div>
            )}
            <div className="flex gap-2">
              {submitted ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                    {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5"
                    onClick={() => window.open(`/test-report/${distId}`, "_blank")}>
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
                    {saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delivery Info — set by reception, read-only in tech page */}
        <Card className="border-blue-100 bg-blue-50/40">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-blue-800">
              {ar ? "معلومات التسليم (من الاستقبال)" : "Delivery Information (from Reception)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Block Type — read-only, auto-detected */}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع البلوك" : "Block Type"}</Label>
                <div className="h-10 px-3 flex items-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-800">
                  {ar ? spec.labelAr : spec.label}
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصنع / المصدر" : "Manufacturer / Source"}</Label>
                <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)}
                  placeholder={ar ? "اسم المصنع" : "Manufacturer name"} className="bg-white" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مرجع التقديم (MTS)" : "MTS Reference"}</Label>
                <Input value={mtsReference} onChange={e => setMtsReference(e.target.value)}
                  placeholder={ar ? "رقم مرجع التقديم" : "Material submittal ref."} className="bg-white" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "رقم الدفعة / التسليم" : "Batch / Delivery No."}</Label>
                <Input value={batchNo} onChange={e => setBatchNo(e.target.value)}
                  placeholder={ar ? "رقم الدفعة" : "Batch number"} className="bg-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "تاريخ الاختبار" : "Date Tested"} <span className="text-red-500">*</span>
                </Label>
                <Input type="date" value={testDate} onChange={e => setTestDate(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "حالة الرطوبة عند الاختبار" : "Moisture Condition at Test"}</Label>
                <select value={moistureCondition} onChange={e => setMoistureCondition(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="saturated_surface_dry">{ar ? "مشبع سطحياً جاف" : "Saturated Surface Dry (SSD)"}</option>
                  <option value="air_dry">{ar ? "جاف هوائياً" : "Air Dry"}</option>
                  <option value="oven_dry">{ar ? "جاف فرنياً" : "Oven Dry"}</option>
                  <option value="wet">{ar ? "مبلل" : "Wet"}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "طريقة التكييف / التسوية" : "Capping / Bedding Method"}</Label>
                <select value={cappingMethod} onChange={e => setCappingMethod(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                  <option value="flat_bedded">{ar ? "سطح مسطح" : "Flat Bedded (as received)"}</option>
                  <option value="capped_sulfur">{ar ? "تسوية كبريتية" : "Capped — Sulfur Mortar"}</option>
                  <option value="capped_plywood">{ar ? "تسوية خشب رقائقي" : "Capped — Plywood"}</option>
                  <option value="capped_rubber">{ar ? "تسوية مطاطية" : "Capped — Rubber Pad"}</option>
                  <option value="ground">{ar ? "مطحون" : "Ground"}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "معدل التحميل (N/mm²/s)" : "Loading Rate (N/mm²/s)"}</Label>
                <Input value={loadingRate} onChange={e => setLoadingRate(e.target.value)}
                  placeholder="0.05" className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 h-10 px-3 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-end">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  {ar ? "المطلوب:" : "Required:"} <strong>{spec.requiredStrength} N/mm²</strong> avg.
                  <br />{ar ? "الحجم:" : "Size:"} {spec.size}
                  <br />{ar ? "المساحة الكلية:" : "Gross Area:"} {spec.grossArea.toLocaleString()} mm²
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Blocks Table */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">
              {ar ? `نتائج اختبار البلوك — ${rows.length} بلوكة` : `Block Test Results — ${rows.length} blocks`}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    {[
                      ar ? "مرجع البلوك" : "Block Ref.",
                      ar ? "الطول (مم)" : "Length (mm)",
                      ar ? "العرض (مم)" : "Width (mm)",
                      ar ? "الحمل الأقصى (كن)" : "Max Load (kN)",
                      ar ? "المساحة الكلية (مم²)" : "Gross Area (mm²)",
                      ar ? "مقاومة الضغط (N/mm²)" : "Compressive Strength (N/mm²)",
                    ].map(h => (
                      <th key={h} className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-600 w-14">
                        {row.blockRef}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={row.lengthMm} onChange={e => updateRow(row.id, "lengthMm", e.target.value)}
                          className="h-7 text-xs w-16 text-center font-mono" placeholder="400" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={row.widthMm} onChange={e => updateRow(row.id, "widthMm", e.target.value)}
                          className="h-7 text-xs w-16 text-center font-mono" placeholder="100" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input value={row.loadKN} onChange={e => updateRow(row.id, "loadKN", e.target.value)}
                          className="h-7 text-xs w-20 text-center font-mono" placeholder={ar ? "الحمل" : "Load"} />
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-500">
                        {row.grossAreaMm2 ? row.grossAreaMm2.toLocaleString() : spec.grossArea.toLocaleString()}
                      </td>
                      <td className={`border border-slate-200 px-2 py-1 text-center font-mono text-sm font-bold ${
                        row.result === "pass" ? "text-emerald-700" : row.result === "fail" ? "text-red-700" : "text-slate-400"
                      }`}>
                        {row.strengthMpa != null ? row.strengthMpa.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold">
                      <td colSpan={5} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">
                        {ar ? "متوسط مقاومة الضغط:" : "Average Compressive Strength:"}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold text-slate-900">
                        {avgStrength.toFixed(2)} N/mm²
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Summary — 3 cards only (no margin), result at top */}
        {validRows.length > 0 && (
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "عدد البلوكات المختبرة" : "Blocks Tested"}</p>
                  <p className="text-3xl font-bold text-slate-800">{validRows.length}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "متوسط مقاومة الضغط" : "Average Compressive Strength"}</p>
                  <p className="text-3xl font-bold text-slate-800">{avgStrength.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "القوة المطلوبة" : "Required Strength"}</p>
                  <p className="text-3xl font-bold text-slate-800">{spec.requiredStrength}</p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
              </div>
              <ResultBanner
                result={overallResult}
                testName={ar ? `مقاومة الضغط لـ ${spec.label}` : `Compressive Strength of ${spec.label}`}
                standard="BS EN 6073"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات الاختبار" : "Test Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={ar ? "ملاحظات" : "Notes / Observations"} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
