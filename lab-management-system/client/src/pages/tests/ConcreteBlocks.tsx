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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Block Type Specs (BS EN 772-1) ────────────────────────────────────────────
// Gross area per block size (BS EN 772-1):
// Compressive Strength uses Gross Area = Length × Width (load face).
// For standard blocks: 400 × thickness mm² (the "width" is the thickness).
const BLOCK_SPECS = {
  // ── Solid Blocks ──
  SOLID_10: { label: "Solid Block (10cm)", labelAr: "بلوك صلب 10سم", size: "400×100×200 mm", grossArea: 400 * 100, requiredStrength: 10.5, standard: "BS EN 772-1", code: "CONC_BLOCK_SOLID", blockType: "solid_block", blockSize: "10cm" },
  SOLID_15: { label: "Solid Block (15cm)", labelAr: "بلوك صلب 15سم", size: "400×150×200 mm", grossArea: 400 * 150, requiredStrength: 10.5, standard: "BS EN 772-1", code: "CONC_BLOCK_SOLID", blockType: "solid_block", blockSize: "15cm" },
  SOLID_20: { label: "Solid Block (20cm)", labelAr: "بلوك صلب 20سم", size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 10.5, standard: "BS EN 772-1", code: "CONC_BLOCK_SOLID", blockType: "solid_block", blockSize: "20cm" },
  SOLID_25: { label: "Solid Block (25cm)", labelAr: "بلوك صلب 25سم", size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 10.5, standard: "BS EN 772-1", code: "CONC_BLOCK_SOLID", blockType: "solid_block", blockSize: "25cm" },
  // ── Hollow Blocks ──
  HOLLOW_10: { label: "Hollow Block (10cm)", labelAr: "بلوك مجوف 10سم", size: "400×100×200 mm", grossArea: 400 * 100, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_HOLLOW", blockType: "hollow_block", blockSize: "10cm" },
  HOLLOW_15: { label: "Hollow Block (15cm)", labelAr: "بلوك مجوف 15سم", size: "400×150×200 mm", grossArea: 400 * 150, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_HOLLOW", blockType: "hollow_block", blockSize: "15cm" },
  HOLLOW_20: { label: "Hollow Block (20cm)", labelAr: "بلوك مجوف 20سم", size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_HOLLOW", blockType: "hollow_block", blockSize: "20cm" },
  HOLLOW_25: { label: "Hollow Block (25cm)", labelAr: "بلوك مجوف 25سم", size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_HOLLOW", blockType: "hollow_block", blockSize: "25cm" },
  // ── Thermal Blocks ──
  THERMAL_20: { label: "Thermal Block (20cm)", labelAr: "بلوك حراري 20سم", size: "400×200×200 mm", grossArea: 400 * 200, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_THERMAL", blockType: "thermal_block", blockSize: "20cm" },
  THERMAL_25: { label: "Thermal Block (25cm)", labelAr: "بلوك حراري 25سم", size: "400×250×200 mm", grossArea: 400 * 250, requiredStrength: 7.0, standard: "BS EN 772-1", code: "CONC_BLOCK_THERMAL", blockType: "thermal_block", blockSize: "25cm" },
};

type BlockTypeKey = keyof typeof BLOCK_SPECS;

interface BlockRow {
  id: string;
  blockRef: string;
  lengthMm: string;
  widthMm: string;
  loadKN: string;
  // computed
  grossAreaMm2?: number;
  strengthMpa?: number;
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): BlockRow {
  return {
    id: `row_${Date.now()}_${index}`,
    blockRef: `B${index + 1}`,
    lengthMm: "",
    widthMm: "",
    loadKN: "",
  };
}

function computeRow(row: BlockRow, spec: typeof BLOCK_SPECS[BlockTypeKey]): BlockRow {
  const load = parseFloat(row.loadKN);
  const length = parseFloat(row.lengthMm);
  const width = parseFloat(row.widthMm);
  if (!load) return row;

  // Use measured dimensions if available, otherwise fall back to spec nominal area
  const grossArea = (length > 0 && width > 0) ? length * width : spec.grossArea;
  // Compressive Strength (N/mm²) = Load (kN) × 1000 / Gross Area (mm²)
  // No correction factor for standard dimension blocks (BS EN 772-1).
  const strength = (load * 1000) / grossArea; // N/mm²

  return {
    ...row,
    grossAreaMm2: Math.round(grossArea),
    strengthMpa: Math.round(strength * 10) / 10,
    result: strength >= spec.requiredStrength ? "pass" : "fail",
  };
}

export default function ConcreteBlocks() {
  const { user } = useAuth();
  const { lang } = useLanguage(); const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });

  // Auto-detect block type from distribution testType when data loads
  const [blockType, setBlockType] = useState<BlockTypeKey>("SOLID_10");

  // Auto-detect block type from distribution testSubType (format: "solid_block__10cm" or legacy "HOLLOW")
  useEffect(() => {
    if (!dist) return;
    const tt = (dist.testType ?? "").toLowerCase();
    // New format: "solid_block__10cm", "hollow_block__15cm", "thermal_block__20cm"
    const newFormatMatch = tt.match(/^(solid_block|hollow_block|thermal_block)__(\d+cm)$/);
    if (newFormatMatch) {
      const [, typeStr, sizeStr] = newFormatMatch;
      const typePrefix = typeStr === "solid_block" ? "SOLID" : typeStr === "hollow_block" ? "HOLLOW" : "THERMAL";
      const sizeSuffix = sizeStr.replace("cm", "");
      const key = `${typePrefix}_${sizeSuffix}` as BlockTypeKey;
      if (key in BLOCK_SPECS) { setBlockType(key); return; }
    }
    // Legacy format fallback
    if (tt.includes("hollow")) setBlockType("HOLLOW_20");
    else if (tt.includes("thermal")) setBlockType("THERMAL_25");
    else setBlockType("SOLID_10");
  }, [dist]);
  const [manufacturer, setManufacturer] = useState("");
  const [mtsReference, setMtsReference] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [testDate, setTestDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<BlockRow[]>(
    Array.from({ length: 10 }, (_, i) => newRow(i))
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = BLOCK_SPECS[blockType];
  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Test results submitted successfully");
        setSubmitted(true);
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة" : "Draft saved");
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

  const addRow = () => setRows(prev => [...prev, newRow(prev.length)]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const handleSave = async (status: "draft" | "submitted") => {
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة بلوك واحدة على الأقل" : "Please enter at least one block result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist?.sampleId ?? 0,
        testTypeCode: spec.code,
        formTemplate: "concrete_blocks",
        formData: {
          blockType,
          blockSpec: spec,
          manufacturer,
          mtsReference,
          batchNo,
          testDate,
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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              {ar ? "اختبارات الخرسانة" : "Concrete Tests"}
              <span>/</span>
              <span className="font-medium text-slate-700">{ar ? "مقاومة الضغط للبلوك الخرساني" : "Compressive Strength of Masonry Blocks"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "مقاومة الضغط للبلوك الخرساني" : "Compressive Strength of Masonry Blocks"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {ar ? "BS EN 772-1 | أمر التوزيع:" : "BS EN 772-1 | Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
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
                <Button size="sm" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Block Type Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "نوع البلوك" : "Block Type"} <span className="text-red-500">*</span>
                </Label>
                <Select value={blockType} onValueChange={(v) => setBlockType(v as BlockTypeKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BLOCK_SPECS).map(([key, s]) => (
                      <SelectItem key={key} value={key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصنع / المصدر" : "Manufacturer / Source"}</Label>
                <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder={ar ? "اسم المصنع" : "Manufacturer name"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "مرجع التقديم (MTS)" : "MTS Reference"}</Label>
                <Input value={mtsReference} onChange={e => setMtsReference(e.target.value)} placeholder={ar ? "رقم مرجع التقديم" : "Material submittal ref."} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "رقم الدفعة / التسليم" : "Batch / Delivery No."}</Label>
                <Input value={batchNo} onChange={e => setBatchNo(e.target.value)} placeholder={ar ? "رقم الدفعة" : "Batch number"} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "تاريخ الاختبار" : "Date Tested"} <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={testDate}
                  onChange={e => setTestDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-end">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  {ar ? "المطلوب:" : "Required:"} <strong>{spec.requiredStrength} N/mm²</strong> avg.
                  <br />{ar ? "حجم البلوك:" : "Block size:"} {spec.size}
                  <br />{ar ? "المساحة الكلية:" : "Gross area:"} {spec.grossArea.toLocaleString()} mm²
                </div>
              </div>
            
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "الفاحص" : "Tested By"}</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <UserCheck size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
                </div>
              </div>
              </div>
          </CardContent>
        </Card>

        {/* Blocks Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج اختبار البلوك (10 بلوكات كحد أدنى)" : "Block Test Results (10 blocks minimum)"}</CardTitle>
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus size={14} className="mr-1" /> {ar ? "إضافة بلوك" : "Add Block"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {[
                    ar ? "مرجع البلوك" : "Block Ref.",
                    ar ? "الطول (مم)" : "Length (mm)",
                    ar ? "العرض (مم)" : "Width (mm)",
                    ar ? "الحمل الأقصى (كيلو نيوتن)" : "Max Load (kN)",
                    ar ? "المساحة (مم²)" : "Area (mm²)",
                    ar ? "مقاومة الضغط (نيوتن/مم²)" : "Compressive Strength (N/mm²)",
                    ar ? "النتيجة" : "Result",
                    "",
                  ].map(h => (
                    <th key={h} className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">
                      {h}
                    </th>
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
                      <Input value={row.lengthMm} onChange={e => updateRow(row.id, "lengthMm", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="400" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.widthMm} onChange={e => updateRow(row.id, "widthMm", e.target.value)} className="h-7 text-xs w-16 text-center font-mono" placeholder="100" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.loadKN} onChange={e => updateRow(row.id, "loadKN", e.target.value)} className="h-7 text-xs w-20 text-center font-mono" placeholder={ar ? "الحمل" : "Load"} />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs text-slate-500">
                      {row.grossAreaMm2 ? row.grossAreaMm2.toLocaleString() : spec.grossArea.toLocaleString()}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                      {row.strengthMpa ?? "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      {row.result && row.result !== "pending" ? <PassFailBadge result={row.result} size="sm" /> : "—"}
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => removeRow(row.id)} disabled={rows.length <= 1}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {validRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-semibold">
                    <td colSpan={6} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">
                      {ar ? "متوسط مقاومة الضغط:" : "Average Compressive Strength:"}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold text-slate-900">
                      {avgStrength.toFixed(2)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <PassFailBadge result={overallResult} size="sm" />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>

        {/* Summary */}
        {validRows.length > 0 && (
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-4 gap-4">
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
                <div className="bg-slate-50 rounded-xl p-4 text-center border">
                  <p className="text-xs text-slate-500 mb-1">{ar ? "الهامش" : "Margin"}</p>
                  <p className={`text-3xl font-bold ${avgStrength >= spec.requiredStrength ? "text-emerald-600" : "text-red-600"}`}>
                    {(avgStrength - spec.requiredStrength).toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-400">N/mm²</p>
                </div>
              </div>
              <ResultBanner
                result={overallResult}
                testName={ar ? `مقاومة الضغط لـ ${spec.label}` : `Compressive Strength of ${spec.label}`}
                standard="BS EN 772-1"
              />
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات الاختبار / الملاحظات" : "Test Notes / Observations"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={ar ? "ملاحظات" : "Notes / Observations"} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
