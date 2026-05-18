import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { Plus, Trash2, Send, FlaskConical, Info, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";

type InterlockBlockType = "6cm" | "8cm" | "10cm";

// ─── Block type specs (BS EN 1338) — strengths unchanged from prior form ─────
const BLOCK_TYPE_SPECS: Record<
  InterlockBlockType,
  { label: string; labelAr: string; defaultThickness: number; requiredStrength: number; minIndividual: number; standard: string }
> = {
  "6cm": {
    label: "Interlock 6cm",
    labelAr: "إنترلوكينج 6سم",
    defaultThickness: 60,
    requiredStrength: 49.0,
    minIndividual: 44.0,
    standard: "BS EN 1338",
  },
  "8cm": {
    label: "Interlock 8cm",
    labelAr: "إنترلوكينج 8سم",
    defaultThickness: 80,
    requiredStrength: 49.0,
    minIndividual: 44.0,
    standard: "BS EN 1338",
  },
  "10cm": {
    label: "Interlock 10cm",
    labelAr: "إنترلوكينج 10سم",
    defaultThickness: 100,
    requiredStrength: 49.0,
    minIndividual: 44.0,
    standard: "BS EN 1338",
  },
};

function getCF(type: string): number {
  switch (type) {
    case "6cm":
      return 1.06;
    case "8cm":
      return 1.18;
    case "10cm":
      return 1.24;
    default:
      return 1.0;
  }
}

function calculateCorrectedStrength(strength: number, blockType: string): number | null {
  if (!strength || !Number.isFinite(strength)) return null;
  const cf = getCF(blockType);
  return strength * cf;
}

interface InterlockRow {
  id: string;
  blockRef: string;
  maxLoadKN: string;
  strengthMpa?: number;
  correctedStrengthMpa?: number;
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): InterlockRow {
  return {
    id: `row_${Date.now()}_${index}`,
    blockRef: `I${index + 1}`,
    maxLoadKN: "",
  };
}

function computeRow(
  row: InterlockRow,
  areaMm2: number | null,
  blockType: InterlockBlockType,
  minIndividual: number,
): InterlockRow {
  const load = parseFloat(row.maxLoadKN);
  if (!load || !Number.isFinite(load)) {
    return { ...row, strengthMpa: undefined, correctedStrengthMpa: undefined, result: "pending" };
  }
  if (!areaMm2 || areaMm2 <= 0 || !Number.isFinite(areaMm2)) {
    return { ...row, strengthMpa: undefined, correctedStrengthMpa: undefined, result: "pending" };
  }
  const strength = (load * 1000) / areaMm2;
  const corrected = calculateCorrectedStrength(strength, blockType);
  if (corrected == null) {
    return { ...row, strengthMpa: undefined, correctedStrengthMpa: undefined, result: "pending" };
  }
  const strengthRounded = Math.round(strength * 10) / 10;
  const correctedRounded = Math.round(corrected * 10) / 10;
  return {
    ...row,
    strengthMpa: strengthRounded,
    correctedStrengthMpa: correctedRounded,
    result: correctedRounded >= minIndividual ? "pass" : "fail",
  };
}

function parseBlockTypeFromForm(fd: any, testSubType?: string | null): InterlockBlockType {
  const bt = fd?.blockType as string | undefined;
  if (bt === "6cm" || bt === "8cm" || bt === "10cm") return bt;
  const legacy = fd?.interlockType as string | undefined;
  if (legacy === "6CM") return "6cm";
  if (legacy === "8CM") return "8cm";
  if (legacy === "10CM") return "10cm";
  if (testSubType === "interlock_6cm") return "6cm";
  if (testSubType === "interlock_8cm") return "8cm";
  if (testSubType === "interlock_10cm") return "10cm";
  return "6cm";
}

export default function Interlock() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing, isFetched: existingFetched } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [blockType, setBlockType] = useState<InterlockBlockType>("6cm");
  const [commonThickness, setCommonThickness] = useState(String(BLOCK_TYPE_SPECS["6cm"].defaultThickness));
  const [commonArea, setCommonArea] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [mtsReference, setMtsReference] = useState("");
  const [blockShape, setBlockShape] = useState("");
  const [blockColor, setBlockColor] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<InterlockRow[]>(() => [newRow(0)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const initFromDistRef = useRef(false);

  useEffect(() => {
    initFromDistRef.current = false;
  }, [distId]);

  const spec = BLOCK_TYPE_SPECS[blockType];
  const cf = getCF(blockType);

  const areaMm2Num = useMemo(() => {
    const a = parseFloat(commonArea.trim());
    return Number.isFinite(a) && a > 0 ? a : null;
  }, [commonArea]);

  // Load draft / submitted formData
  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as any;
    const bt = parseBlockTypeFromForm(fd, dist?.testSubType);
    setBlockType(bt);
    if (fd.commonThickness != null && fd.commonThickness !== "") {
      setCommonThickness(String(fd.commonThickness));
    } else {
      setCommonThickness(String(BLOCK_TYPE_SPECS[bt].defaultThickness));
    }
    if (fd.commonAreaMm2 != null && fd.commonAreaMm2 !== "") {
      setCommonArea(String(fd.commonAreaMm2));
    } else if (Array.isArray(fd.blocks) && fd.blocks[0]) {
      const b0 = fd.blocks[0];
      if (b0.areaMm2 != null && b0.areaMm2 !== "") setCommonArea(String(b0.areaMm2));
      else if (b0.area != null) setCommonArea(String(b0.area));
    }
    if (fd.manufacturer) setManufacturer(String(fd.manufacturer));
    if (fd.mtsReference) setMtsReference(String(fd.mtsReference));
    if (fd.blockShape) setBlockShape(String(fd.blockShape));
    if (fd.blockColor) setBlockColor(String(fd.blockColor));
    if (fd.notes) setNotes(String(fd.notes));
    if (Array.isArray(fd.blocks) && fd.blocks.length > 0) {
      setRows(
        fd.blocks.map((b: any, i: number) => ({
          id: String(b.id || `row_${Date.now()}_${i}`),
          blockRef: String(b.blockRef ?? `I${i + 1}`),
          maxLoadKN: b.maxLoadKN != null && b.maxLoadKN !== "" ? String(b.maxLoadKN) : "",
        })),
      );
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing, dist?.testSubType]);

  // Initial row count from distribution quantity when there is no saved blocks array
  useEffect(() => {
    if (!dist || !existingFetched) return;
    const fd = existing?.formData as any;
    if (Array.isArray(fd?.blocks) && fd.blocks.length > 0) return;
    if (initFromDistRef.current) return;
    const n = Math.max(1, Math.min(999, Number(dist.quantity) || 1));
    setRows(Array.from({ length: n }, (_, i) => newRow(i)));
    initFromDistRef.current = true;
  }, [dist, existingFetched, existing?.formData]);

  const computedRows = useMemo(
    () => rows.map(r => computeRow(r, areaMm2Num, blockType, spec.minIndividual)),
    [rows, areaMm2Num, blockType, spec.minIndividual],
  );

  const validRows = computedRows.filter(r => r.strengthMpa != null && r.strengthMpa > 0);
  const avgStrength =
    validRows.length > 0
      ? validRows.reduce((s, r) => s + (r.correctedStrengthMpa ?? 0), 0) / validRows.length
      : 0;
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0
      ? "pending"
      : avgStrength >= spec.requiredStrength && validRows.every(r => r.result === "pass")
        ? "pass"
        : "fail";

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

  const updateRow = useCallback((id: string, field: keyof InterlockRow, value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    const hasLoad = computedRows.some(r => parseFloat(r.maxLoadKN) > 0);
    if (hasLoad && areaMm2Num == null) {
      toast.error(
        ar ? "أدخل المساحة (مم²) أعلاه لحساب المقاومة" : "Enter common Area (mm²) above to calculate strength",
      );
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة قياس واحدة على الأقل" : "Please enter at least one valid test result");
      return;
    }
    const testTypeCode = dist.testType ?? "CONC_INTERLOCK";
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode,
        formTemplate: "interlock",
        formData: {
          blockType,
          commonThickness,
          commonAreaMm2: commonArea.trim() || undefined,
          cf,
          spec: {
            label: spec.label,
            labelAr: spec.labelAr,
            requiredStrength: spec.requiredStrength,
            minIndividual: spec.minIndividual,
            standard: spec.standard,
            defaultThickness: spec.defaultThickness,
          },
          interlockType: blockType,
          manufacturer,
          mtsReference,
          blockShape,
          blockColor,
          blocks: computedRows,
          avgStrength,
          overallResult,
        },
        overallResult,
        summaryValues: {
          type: spec.label,
          blockType,
          cf,
          avgStrength: avgStrength.toFixed(2),
          required: spec.requiredStrength,
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

  const tableHeaders = ar
    ? ["مرجع البلاطة", "الحمل الأقصى (كن)", "المقاومة (N/mm²)", "المقاومة المصححة (N/mm²)", "النتيجة", ""]
    : ["Block Ref.", "Max Load (kN)", "Str. (N/mm²)", "Corr. (N/mm²)", "Result", ""];

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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Test Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع البلاطة" : "Block Type"}</Label>
                <Select
                  value={blockType}
                  onValueChange={v => {
                    const next = v as InterlockBlockType;
                    setBlockType(next);
                    setCommonThickness(String(BLOCK_TYPE_SPECS[next].defaultThickness));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BLOCK_TYPE_SPECS) as InterlockBlockType[]).map(k => (
                      <SelectItem key={k} value={k}>
                        {ar ? BLOCK_TYPE_SPECS[k].labelAr : BLOCK_TYPE_SPECS[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {ar ? "عامل التصحيح CF = " : "CF = "}
                  <span className="font-mono font-semibold text-slate-700">{cf.toFixed(2)}</span>
                </p>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "السماكة (مم)" : "Thickness (mm)"}</Label>
                <Input
                  value={commonThickness}
                  onChange={e => setCommonThickness(e.target.value)}
                  className="font-mono"
                  disabled={submitted}
                />
                <p className="text-xs text-slate-500 mt-1">{ar ? "نفس القيمة لجميع البلاطات" : "Same for all blocks"}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "المساحة (مم²)" : "Area (mm²)"}{" "}
                  <span className="text-slate-400 font-normal">({ar ? "اختياري" : "Optional"})</span>
                </Label>
                <Input
                  value={commonArea}
                  onChange={e => setCommonArea(e.target.value)}
                  className="font-mono"
                  placeholder={ar ? "مثال: 20000" : "e.g. 20000"}
                  disabled={submitted}
                />
                <p className="text-xs text-slate-500 mt-1">{ar ? "نفس القيمة لجميع البلاطات" : "Same for all blocks"}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Manufacturer / Source</Label>
                <Input value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="Manufacturer name" disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">MTS Reference</Label>
                <Input value={mtsReference} onChange={e => setMtsReference(e.target.value)} placeholder="Material submittal ref." disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Shape</Label>
                <Input value={blockShape} onChange={e => setBlockShape(e.target.value)} placeholder="e.g. Rectangular, Zigzag" disabled={submitted} />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Color</Label>
                <Input value={blockColor} onChange={e => setBlockColor(e.target.value)} placeholder="e.g. Grey, Red" disabled={submitted} />
              </div>
              <div className="flex items-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 w-full">
                  <Info size={12} className="inline mr-1" />
                  {ar ? "مميزة:" : "Characteristic:"} <strong>{spec.requiredStrength} N/mm²</strong>
                  <br />
                  {ar ? "الحد الأدنى للفردية:" : "Min. individual:"} <strong>{spec.minIndividual} N/mm²</strong>
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
              {!submitted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRows(p => [...p, newRow(p.length)])}
                >
                  <Plus size={14} className="mr-1" /> {ar ? "إضافة بلاطة" : "Add Block"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {tableHeaders.map(h => (
                      <th
                        key={h}
                        className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.blockRef}
                          onChange={e => updateRow(row.id, "blockRef", e.target.value)}
                          className="h-7 text-xs w-14"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.maxLoadKN}
                          onChange={e => updateRow(row.id, "maxLoadKN", e.target.value)}
                          className="h-7 text-xs w-20 text-center font-mono"
                          placeholder="—"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs">{row.strengthMpa ?? "—"}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold">
                        {row.correctedStrengthMpa ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {row.result && row.result !== "pending" ? <PassFailBadge result={row.result} size="sm" /> : "—"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        {!submitted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                            disabled={rows.length <= 1}
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold">
                      <td colSpan={3} className="border border-slate-200 px-3 py-2 text-right text-xs text-slate-600">
                        {ar ? "متوسط المقاومة المصححة:" : "Average Corrected Compressive Strength:"}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm font-bold">
                        {(validRows.reduce((s, r) => s + (r.correctedStrengthMpa ?? 0), 0) / validRows.length).toFixed(1)}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center">
                        <PassFailBadge result={overallResult} size="sm" />
                      </td>
                      <td className="border border-slate-200" />
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
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
