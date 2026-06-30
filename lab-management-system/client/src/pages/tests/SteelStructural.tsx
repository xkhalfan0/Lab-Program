import { useEffect, useState, useCallback } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Info, Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LAB_NUMERIC_INPUT_SM } from "@/lib/labInputStyles";

// ─── Structural Steel Specs (BS EN 10025 / ASTM A36 / A572) ──────────────────
const STEEL_GRADES = {
  S275: {
    label: "S275 (BS EN 10025)",
    yieldMin: 275,
    tensileMin: 430,
    tensileMax: 580,
    elongationMin: 23,
    code: "STEEL_STRUCT_S275",
  },
  S355: {
    label: "S355 (BS EN 10025)",
    yieldMin: 355,
    tensileMin: 470,
    tensileMax: 630,
    elongationMin: 22,
    code: "STEEL_STRUCT_S355",
  },
  A36: {
    label: "A36 (ASTM A36)",
    yieldMin: 250,
    tensileMin: 400,
    tensileMax: 550,
    elongationMin: 23,
    code: "STEEL_STRUCT_A36",
  },
  A572_GR50: {
    label: "A572 Gr.50 (ASTM A572)",
    yieldMin: 345,
    tensileMin: 450,
    tensileMax: 620,
    elongationMin: 21,
    code: "STEEL_STRUCT_A572",
  },
} as const;

type SteelGrade = keyof typeof STEEL_GRADES;
type GradeSpec = (typeof STEEL_GRADES)[SteelGrade];

/** Section types — selected on technician form (not at reception). */
const SECTION_TYPES: { value: string; labelEn: string; labelAr: string }[] = [
  { value: "flat_bar", labelEn: "Flat Bar", labelAr: "شريط مسطح" },
  { value: "angle_L50x50x5", labelEn: "Angle 50×50×5", labelAr: "زاوية 50×50×5" },
  { value: "angle_L63x63x6", labelEn: "Angle 63×63×6", labelAr: "زاوية 63×63×6" },
  { value: "angle_L75x75x8", labelEn: "Angle 75×75×8", labelAr: "زاوية 75×75×8" },
  { value: "angle_L100x100x10", labelEn: "Angle 100×100×10", labelAr: "زاوية 100×100×10" },
  { value: "angle_L120x120x12", labelEn: "Angle 120×120×12", labelAr: "زاوية 120×120×12" },
  { value: "angle_L150x150x15", labelEn: "Angle 150×150×15", labelAr: "زاوية 150×150×15" },
  { value: "rhs_40x20x2", labelEn: "Rect. Tube 40×20×2", labelAr: "أنبوب مستطيل 40×20×2" },
  { value: "rhs_50x25x2", labelEn: "Rect. Tube 50×25×2", labelAr: "أنبوب مستطيل 50×25×2" },
  { value: "rhs_60x40x3", labelEn: "Rect. Tube 60×40×3", labelAr: "أنبوب مستطيل 60×40×3" },
  { value: "rhs_80x40x3", labelEn: "Rect. Tube 80×40×3", labelAr: "أنبوب مستطيل 80×40×3" },
  { value: "rhs_100x50x3", labelEn: "Rect. Tube 100×50×3", labelAr: "أنبوب مستطيل 100×50×3" },
  { value: "rhs_120x60x4", labelEn: "Rect. Tube 120×60×4", labelAr: "أنبوب مستطيل 120×60×4" },
  { value: "hea_100", labelEn: "HEA 100", labelAr: "HEA 100" },
  { value: "hea_120", labelEn: "HEA 120", labelAr: "HEA 120" },
  { value: "hea_160", labelEn: "HEA 160", labelAr: "HEA 160" },
  { value: "heb_100", labelEn: "HEB 100", labelAr: "HEB 100" },
  { value: "ipe_100", labelEn: "IPE 100", labelAr: "IPE 100" },
  { value: "ipe_160", labelEn: "IPE 160", labelAr: "IPE 160" },
  { value: "hollow_section", labelEn: "Hollow Section", labelAr: "قطاع مجوف" },
  { value: "other", labelEn: "Other", labelAr: "أخرى" },
];

function calcAreaMm2(width: string, thickness: string): number | undefined {
  const w = parseFloat(width);
  const t = parseFloat(thickness);
  if (!w || !t || w <= 0 || t <= 0) return undefined;
  return parseFloat((w * t).toFixed(2));
}

interface SpecimenRow {
  id: string;
  specimenNumber: number;
  sectionType: string;
  section: string;
  width: string;
  thickness: string;
  scale: string;
  yieldLoad: string;
  maxLoad: string;
  measuredBy: string;
  yieldStrength?: number;
  tensileStrength?: number;
  elongation?: number;
  area?: number;
  yieldResult?: "pass" | "fail" | "pending";
  tensileResult?: "pass" | "fail" | "pending";
  elongationResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function computeSpecimen(row: SpecimenRow, spec: GradeSpec): SpecimenRow {
  const area = calcAreaMm2(row.width, row.thickness) ?? 0;
  const scale = parseFloat(row.scale) || 0;
  const measuredBy = parseFloat(row.measuredBy) || 0;
  const yl = parseFloat(row.yieldLoad) || 0;
  const ml = parseFloat(row.maxLoad) || 0;

  if (!area || !yl || !ml) return row;

  const ys = (yl * 1000) / area;
  const ts = (ml * 1000) / area;
  const elong = scale > 0 ? (measuredBy / scale) * 100 : undefined;

  const yieldResult: "pass" | "fail" = ys >= spec.yieldMin ? "pass" : "fail";
  const tensileResult: "pass" | "fail" =
    ts >= spec.tensileMin && ts <= spec.tensileMax ? "pass" : "fail";
  const elongationResult: "pass" | "fail" | "pending" =
    elong !== undefined ? (elong >= spec.elongationMin ? "pass" : "fail") : "pending";

  const results = [yieldResult, tensileResult, elongationResult].filter(
    (r) => r !== "pending",
  );
  const overall: "pass" | "fail" | "pending" =
    results.length === 0 ? "pending" : results.every((r) => r === "pass") ? "pass" : "fail";

  return {
    ...row,
    area: area > 0 ? area : undefined,
    yieldStrength: parseFloat(ys.toFixed(1)),
    tensileStrength: parseFloat(ts.toFixed(1)),
    elongation: elong !== undefined ? parseFloat(elong.toFixed(1)) : undefined,
    yieldResult,
    tensileResult,
    elongationResult,
    overallResult: overall,
  };
}

function newRow(specimenNumber: number): SpecimenRow {
  return {
    id: `sp_${Date.now()}_${specimenNumber}`,
    specimenNumber,
    sectionType: "flat_bar",
    section: "",
    width: "",
    thickness: "",
    scale: "",
    yieldLoad: "",
    maxLoad: "",
    measuredBy: "",
  };
}

function renumberSpecimens(rows: SpecimenRow[]): SpecimenRow[] {
  return rows.map((r, idx) => ({ ...r, specimenNumber: idx + 1 }));
}

function parseSpecimenFromSaved(raw: Record<string, unknown>, index: number): SpecimenRow {
  const legacyGl = raw.gaugeLength ?? raw.gaugeLength0;
  const legacyFl = raw.finalLength ?? raw.gaugeLength1 ?? raw.gl1;
  const scale =
    raw.scale != null && String(raw.scale) !== ""
      ? String(raw.scale)
      : legacyGl != null && String(legacyGl) !== ""
        ? String(parseFloat(String(legacyGl)) / 10)
        : "";
  const measuredBy =
    raw.measuredBy != null && String(raw.measuredBy) !== ""
      ? String(raw.measuredBy)
      : legacyFl != null && String(legacyFl) !== ""
        ? String(parseFloat(String(legacyFl)) / 10)
        : "";

  const legacySection = String(raw.section ?? "");
  let sectionType = String(raw.sectionType ?? "");
  if (!sectionType && legacySection) {
    const match = SECTION_TYPES.find(
      (t) =>
        t.value === legacySection ||
        t.labelEn.toLowerCase() === legacySection.toLowerCase() ||
        legacySection.toLowerCase().includes(t.value.replace(/_/g, " ")),
    );
    sectionType = match?.value ?? (legacySection ? "other" : "flat_bar");
  }
  if (!sectionType) sectionType = "flat_bar";

  return {
    id: String(raw.id ?? `sp_${index}`),
    specimenNumber: Number(raw.specimenNumber ?? index + 1),
    sectionType,
    section: legacySection && sectionType === "other" ? legacySection : "",
    width: String(raw.width ?? ""),
    thickness: String(raw.thickness ?? ""),
    scale,
    yieldLoad: String(raw.yieldLoad ?? ""),
    maxLoad: String(raw.maxLoad ?? ""),
    measuredBy,
  };
}

export default function SteelStructural() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0", 10);
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [grade, setGrade] = useState<SteelGrade>("S355");
  const [heatNo, setHeatNo] = useState("");
  const [gaugeLength, setGaugeLength] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<SpecimenRow[]>([newRow(1)]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = STEEL_GRADES[grade];
  const computedRows = rows.map((r) => computeSpecimen(r, spec));
  const validRows = computedRows.filter((r) => r.yieldStrength !== undefined);
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0
      ? "pending"
      : validRows.every((r) => r.overallResult === "pass")
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

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.notes) setNotes(String(fd.notes));
    if (fd.heatNo) setHeatNo(String(fd.heatNo));

    const savedGrade = fd.grade as string | undefined;
    if (savedGrade && savedGrade in STEEL_GRADES) {
      setGrade(savedGrade as SteelGrade);
    }

    const specimens = fd.specimens as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(specimens) && specimens.length > 0) {
      setRows(renumberSpecimens(specimens.map(parseSpecimenFromSaved)));
    }

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const updateRow = useCallback((id: string, field: keyof SpecimenRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value };
        if (field === "sectionType" && value !== "other") {
          next.section = "";
        }
        return next;
      }),
    );
  }, []);

  const addSpecimen = useCallback(() => {
    setRows((prev) => [...prev, newRow(prev.length + 1)]);
  }, []);

  const deleteSpecimen = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return renumberSpecimens(prev.filter((r) => r.id !== id));
    });
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(ar ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(
        ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one specimen result",
      );
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "steel_structural",
        formData: { grade, spec, heatNo, gaugeLength, specimens: computedRows, overallResult },
        overallResult,
        summaryValues: { grade: spec.label, specimensTested: validRows.length, overallResult },
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
            {ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>
                {ar ? "اختبارات الحديد / حديد إنشائي" : "Steel Tests / Structural Steel"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار الشد والانحناء للحديد الإنشائي" : "Structural Steel Tensile Test"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS EN 10025 / ASTM A36 / A572 | {dist?.distributionCode ?? `DIST-${distId}`}
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
                  {ar ? "طباعة التقرير" : "Print Report"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                >
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleSave("submitted")}
                  disabled={saving}
                >
                  <Send size={14} className="mr-1.5" />
                  {saving
                    ? ar
                      ? "جاري الإرسال..."
                      : "Submitting..."
                    : ar
                      ? "إرسال النتائج"
                      : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 font-semibold">
            {ar ? "المعادلات" : "Formulas"}
          </AlertTitle>
          <AlertDescription className="text-blue-800 text-sm space-y-1">
            <div className="font-bold">{ar ? "المساحة (mm²) = العرض × السمك" : "Area (mm²) = W × T"}</div>
            <div>YS = (Yield × 1000) / Area</div>
            <div>TS = (Max × 1000) / Area</div>
            <div className="font-bold">Elongation % = (Measured by / Scale) × 100</div>
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "درجة الحديد" : "Steel Grade"}
                </Label>
                <Select
                  value={grade}
                  onValueChange={(v) => setGrade(v as SteelGrade)}
                  disabled={submitted}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STEEL_GRADES).map(([k, s]) => (
                      <SelectItem key={k} value={k}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "رقم الصهر / الدفعة" : "Heat / Batch No."}
                </Label>
                <Input
                  value={heatNo}
                  onChange={(e) => setHeatNo(e.target.value)}
                  placeholder={ar ? "رقم الصهر" : "Heat number"}
                  disabled={submitted}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "طول القياس (مم)" : "Gauge Length (mm)"}
                </Label>
                <Input
                  value={gaugeLength}
                  onChange={(e) => setGaugeLength(e.target.value)}
                  placeholder="e.g. 80"
                  disabled={submitted}
                />
              </div>
              <div className="col-span-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 grid grid-cols-3 gap-2">
                  <div>
                    <span className="font-semibold">{ar ? "الخضوع:" : "Yield:"}</span>
                    <br />≥ {spec.yieldMin} N/mm²
                  </div>
                  <div>
                    <span className="font-semibold">{ar ? "الشد:" : "Tensile:"}</span>
                    <br />
                    {spec.tensileMin}–{spec.tensileMax} N/mm²
                  </div>
                  <div>
                    <span className="font-semibold">{ar ? "الاستطالة:" : "Elongation:"}</span>
                    <br />≥ {spec.elongationMin}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "عينات الاختبار" : "Test Specimens"}
            </CardTitle>
            {!submitted && (
              <Button size="sm" onClick={addSpecimen} className="gap-2">
                <Plus className="w-4 h-4" />
                {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-300 px-2 py-2">
                    {ar ? "رقم العينة" : "Sp. No."}
                  </th>
                  <th className="border border-slate-300 px-2 py-2">
                    {ar ? "النوع" : "Type"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2">
                    {ar ? "العرض W (mm)" : "W (mm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2">
                    {ar ? "السمك T (mm)" : "T (mm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                    {ar ? "المساحة (mm²)" : "Area (mm²)"} *
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                    {ar ? "المقياس (cm)" : "Scale (cm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-yellow-50">
                    {ar ? "حمل الخضوع (kN)" : "Yield (kN)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-yellow-50">
                    {ar ? "الحمل الأقصى (kN)" : "Max (kN)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-blue-50">
                    {ar ? "القياس (cm)" : "Measured by (cm)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-green-50">
                    {ar ? "إجهاد الخضوع" : "YS (N/mm²)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-green-50">
                    {ar ? "إجهاد الشد" : "TS (N/mm²)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2 bg-purple-50">
                    {ar ? "الاستطالة %" : "Elong. (%)"}
                  </th>
                  <th className="border border-slate-300 px-2 py-2">
                    {ar ? "الإجراء" : "Action"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-2 text-center font-bold">
                      {row.specimenNumber}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 min-w-[140px]">
                      <Select
                        value={rows[idx]?.sectionType || "flat_bar"}
                        onValueChange={(v) => updateRow(row.id, "sectionType", v)}
                        disabled={submitted}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder={ar ? "اختر النوع" : "Select type"} />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {ar ? t.labelAr : t.labelEn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {rows[idx]?.sectionType === "other" && (
                        <Input
                          type="text"
                          value={rows[idx]?.section ?? ""}
                          onChange={(e) => updateRow(row.id, "section", e.target.value)}
                          className="h-7 text-xs mt-1 bg-white border border-slate-300"
                          placeholder={ar ? "حدد القطاع" : "Specify section"}
                          disabled={submitted}
                        />
                      )}
                    </td>
                    <td className="border border-slate-300 px-1 py-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.width ?? ""}
                        onChange={(e) => updateRow(row.id, "width", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="15.2"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-1 py-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.thickness ?? ""}
                        onChange={(e) => updateRow(row.id, "thickness", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="9.1"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-blue-100 font-semibold">
                      {row.area != null && row.area > 0 ? row.area.toFixed(2) : "—"}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-blue-50/50">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.scale ?? ""}
                        onChange={(e) => updateRow(row.id, "scale", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="10.0"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-yellow-50/50">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.yieldLoad ?? ""}
                        onChange={(e) => updateRow(row.id, "yieldLoad", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="43.3"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-yellow-50/50">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.maxLoad ?? ""}
                        onChange={(e) => updateRow(row.id, "maxLoad", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="64.9"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-1 py-1 bg-blue-50/50">
                      <Input
                        type="number"
                        step="0.1"
                        value={rows[idx]?.measuredBy ?? ""}
                        onChange={(e) => updateRow(row.id, "measuredBy", e.target.value)}
                        className={`${LAB_NUMERIC_INPUT_SM} w-16`}
                        placeholder="11.5"
                        disabled={submitted}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-green-50 font-semibold">
                      {row.yieldStrength !== undefined ? (
                        <span
                          className={
                            row.yieldResult === "pass" ? "text-emerald-700" : "text-red-700"
                          }
                        >
                          {row.yieldStrength.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-green-50 font-semibold">
                      {row.tensileStrength !== undefined ? (
                        <span
                          className={
                            row.tensileResult === "pass" ? "text-emerald-700" : "text-red-700"
                          }
                        >
                          {row.tensileStrength.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center bg-purple-50 font-bold">
                      {row.elongation !== undefined ? (
                        <span
                          className={
                            row.elongationResult === "pass" ? "text-emerald-700" : "text-red-700"
                          }
                        >
                          {row.elongation.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      {!submitted && rows.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteSpecimen(row.id)}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground italic mt-2">
              {ar
                ? "* المساحة محسوبة تلقائياً: العرض (mm) × السمك (mm)"
                : "* Area calculated automatically: W (mm) × T (mm)"}
            </p>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult}
            testName={`${ar ? "حديد إنشائي" : "Structural Steel"} — ${spec.label}`}
            standard="BS EN 10025"
          />
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={submitted}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
