/**
 * SteelAnchorBolt — Anchor Bolt Tensile Strength Test (BS EN ISO 898-1)
 * Layout aligned with lab Excel worksheet.
 */
import { useCallback, useEffect, useState } from "react";
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

/** Excel uses 22/7 for circular area */
const PI_EXCEL = 22 / 7;

export function circleAreaFromDiameterMm(diameterMm: number): number {
  if (diameterMm <= 0) return 0;
  return (PI_EXCEL * diameterMm * diameterMm) / 4;
}

/** Elongation % = (size increment / GL) × 100 */
export function computeElongationPercent(
  glMm: string,
  sizeIncrementMm: string,
): number | undefined {
  const gl = parseFloat(glMm);
  const inc = parseFloat(sizeIncrementMm);
  if (!gl || gl <= 0 || !Number.isFinite(inc)) return undefined;
  return parseFloat(((inc / gl) * 100).toFixed(1));
}

const BOLT_TYPES = {
  M12: { label: "M12 Anchor Bolt", nominalMm: 12 },
  M16: { label: "M16 Anchor Bolt", nominalMm: 16 },
  M20: { label: "M20 Anchor Bolt", nominalMm: 20 },
  M24: { label: "M24 Anchor Bolt", nominalMm: 24 },
  M30: { label: "M30 Anchor Bolt", nominalMm: 30 },
} as const;

type BoltType = keyof typeof BOLT_TYPES;

/** BS EN ISO 898-1 Grade 8.8 minimum requirements */
function getGrade88Spec(nominalSizeMm: number) {
  const d = nominalSizeMm;
  return {
    minRm: d > 0 && d <= 16 ? 800 : 830,
    minElongation: 12,
    minRa: 52,
    grade: "8.8",
  };
}

interface TestInfo {
  boltType: BoltType;
  embedmentDepth: string;
  concreteGrade: string;
}

interface AnchorBoltSpecimen {
  id: string;
  specimenNumber: number;
  nominalSize: string;
  cutSectionDiameter: string;
  trials: string;
  loadKN: string;
  glMm: string;
  sizeIncrementMm: string;
  raPercent: string;
  grade: string;
  notes: string;
  cutSectionArea?: number;
  tensileStrengthMPa?: number;
  elongation?: number;
  reductionOfArea?: number;
  rmResult?: "pass" | "fail" | "pending";
  elongationResult?: "pass" | "fail" | "pending";
  raResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function newSpecimen(n: number): AnchorBoltSpecimen {
  return {
    id: `ab_${Date.now()}_${n}`,
    specimenNumber: n,
    nominalSize: "",
    cutSectionDiameter: "",
    trials: "",
    loadKN: "",
    glMm: "",
    sizeIncrementMm: "",
    raPercent: "",
    grade: "8.8",
    notes: "",
  };
}

function renumber(rows: AnchorBoltSpecimen[]): AnchorBoltSpecimen[] {
  return rows.map((r, i) => ({ ...r, specimenNumber: i + 1 }));
}

export function computeAnchorBoltSpecimen(row: AnchorBoltSpecimen): AnchorBoltSpecimen {
  const cutDiameter = parseFloat(row.cutSectionDiameter) || 0;
  const load = parseFloat(row.loadKN) || 0;
  const nominalSize = parseFloat(row.nominalSize) || 0;

  const cutSectionArea =
    cutDiameter > 0 ? parseFloat(circleAreaFromDiameterMm(cutDiameter).toFixed(3)) : undefined;

  const tensileStrengthMPa =
    cutSectionArea && cutSectionArea > 0 && load > 0
      ? parseFloat(((load * 1000) / cutSectionArea).toFixed(1))
      : undefined;

  const elongation = computeElongationPercent(row.glMm, row.sizeIncrementMm);

  const raParsed = parseFloat(row.raPercent);
  const reductionOfArea = Number.isFinite(raParsed)
    ? parseFloat(raParsed.toFixed(1))
    : undefined;

  const spec = getGrade88Spec(nominalSize || cutDiameter);
  const rmResult: "pass" | "fail" | "pending" =
    tensileStrengthMPa !== undefined
      ? tensileStrengthMPa >= spec.minRm
        ? "pass"
        : "fail"
      : "pending";
  const elongationResult: "pass" | "fail" | "pending" =
    elongation !== undefined
      ? elongation >= spec.minElongation
        ? "pass"
        : "fail"
      : "pending";
  const raResult: "pass" | "fail" | "pending" =
    reductionOfArea !== undefined
      ? reductionOfArea >= spec.minRa
        ? "pass"
        : "fail"
      : "pending";

  const checks = [rmResult, elongationResult, raResult].filter((r) => r !== "pending");
  const overallResult: "pass" | "fail" | "pending" =
    checks.length === 0 ? "pending" : checks.every((r) => r === "pass") ? "pass" : "fail";

  return {
    ...row,
    cutSectionArea,
    tensileStrengthMPa,
    elongation,
    reductionOfArea,
    rmResult,
    elongationResult,
    raResult,
    overallResult,
  };
}

function parseSpecimenFromSaved(raw: Record<string, unknown>, index: number): AnchorBoltSpecimen {
  return {
    id: String(raw.id ?? `ab_${index}`),
    specimenNumber: Number.isFinite(Number(raw.specimenNumber))
      ? Number(raw.specimenNumber)
      : index + 1,
    nominalSize: String(raw.nominalSize ?? ""),
    cutSectionDiameter: String(raw.cutSectionDiameter ?? ""),
    trials: String(raw.trials ?? ""),
    loadKN: String(raw.loadKN ?? raw.maxLoad ?? raw.load ?? ""),
    glMm: String(raw.glMm ?? raw.gaugeLength ?? ""),
    sizeIncrementMm: String(raw.sizeIncrementMm ?? ""),
    raPercent: String(
      raw.raPercent != null && String(raw.raPercent) !== ""
        ? raw.raPercent
        : raw.reductionOfArea != null && String(raw.reductionOfArea) !== ""
          ? String(raw.reductionOfArea)
          : "",
    ),
    grade: String(raw.grade ?? "8.8"),
    notes: String(raw.notes ?? raw.location ?? ""),
  };
}

export default function SteelAnchorBolt() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0", 10);

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const [testInfo, setTestInfo] = useState<TestInfo>({
    boltType: "M20",
    embedmentDepth: "",
    concreteGrade: "C25",
  });
  const [specimens, setSpecimens] = useState<AnchorBoltSpecimen[]>([newSpecimen(1)]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const computedSpecimens = specimens.map(computeAnchorBoltSpecimen);
  const validRows = computedSpecimens.filter((r) => r.tensileStrengthMPa !== undefined);
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

    const ti = fd.testInfo as TestInfo | undefined;
    if (ti?.boltType && ti.boltType in BOLT_TYPES) {
      setTestInfo({
        boltType: ti.boltType,
        embedmentDepth: String(ti.embedmentDepth ?? fd.embedmentDepth ?? ""),
        concreteGrade: String(ti.concreteGrade ?? fd.concreteGrade ?? "C25"),
      });
    } else {
      const legacyType = fd.anchorType as string | undefined;
      if (legacyType && legacyType in BOLT_TYPES) {
        setTestInfo((p) => ({ ...p, boltType: legacyType as BoltType }));
      }
      if (fd.concreteGrade) {
        setTestInfo((p) => ({ ...p, concreteGrade: String(fd.concreteGrade) }));
      }
    }

    const list =
      (fd.specimens as Array<Record<string, unknown>> | undefined) ??
      (fd.anchors as Array<Record<string, unknown>> | undefined);
    if (Array.isArray(list) && list.length > 0) {
      setSpecimens(renumber(list.map(parseSpecimenFromSaved)));
    }

    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const updateSpecimen = useCallback(
    (id: string, field: keyof AnchorBoltSpecimen, value: string) => {
      setSpecimens((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    },
    [],
  );

  const addSpecimen = useCallback(() => {
    setSpecimens((prev) => [...prev, newSpecimen(prev.length + 1)]);
  }, []);

  const deleteSpecimen = useCallback((id: string) => {
    setSpecimens((prev) => {
      if (prev.length <= 1) return prev;
      return renumber(prev.filter((r) => r.id !== id));
    });
  }, []);

  const handleBoltTypeChange = (boltType: BoltType) => {
    const nominal = String(BOLT_TYPES[boltType].nominalMm);
    setTestInfo((p) => ({ ...p, boltType }));
    setSpecimens((prev) =>
      prev.map((r) => (r.nominalSize.trim() === "" ? { ...r, nominalSize: nominal } : r)),
    );
  };

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
        testTypeCode: "STEEL_ANCHOR",
        formTemplate: "steel_anchor_bolt",
        formData: {
          testInfo,
          boltType: testInfo.boltType,
          concreteGrade: testInfo.concreteGrade,
          embedmentDepth: testInfo.embedmentDepth,
          specimens: computedSpecimens,
          overallResult,
        },
        overallResult,
        summaryValues: {
          boltType: BOLT_TYPES[testInfo.boltType].label,
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
            {ar ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const th = "border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700";
  const tdIn = "border border-slate-300 px-1 py-1";
  const tdCalc = "border border-slate-300 px-2 py-2 text-center font-semibold text-xs";

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الحديد" : "Steel Tests"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "اختبار شد برغي التثبيت" : "Tensile Strength of Anchor Bolts"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">BS EN ISO 898-1</p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "العودة" : "Back"}
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
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  size="sm"
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
            <div>
              {ar
                ? "مساحة المقطع = (22/7) × قطر² / 4"
                : "Cut Section area = (22/7) × (Cut Section Diameter)² / 4"}
            </div>
            <div>Rm (MPa) = (Load × 1000) / Cut Section area</div>
            <div className="font-bold">
              {ar
                ? "الاستطالة % = (زيادة الحجم / GL) × 100"
                : "Elongation % = (size increment / GL) × 100"}
            </div>
            <div className="text-xs">
              {ar ? "%RA — إدخال يدوي" : "%RA — entered manually"}
            </div>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "إعدادات الاختبار" : "Test Setup"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">{ar ? "نوع الأنكر بولت" : "Anchor Bolt Type"}</Label>
                <Select
                  value={testInfo.boltType}
                  onValueChange={(v) => handleBoltTypeChange(v as BoltType)}
                  disabled={submitted}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={ar ? "اختر النوع..." : "Select type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(BOLT_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  {ar ? "عمق التثبيت (mm)" : "Embedment Depth (mm)"}
                </Label>
                <Input
                  type="number"
                  value={testInfo.embedmentDepth}
                  onChange={(e) =>
                    setTestInfo((p) => ({ ...p, embedmentDepth: e.target.value }))
                  }
                  className="h-9"
                  placeholder="20"
                  disabled={submitted}
                />
              </div>
              <div>
                <Label className="text-xs">
                  {ar ? "درجة الخرسانة المضيفة" : "Host Concrete Grade"}
                </Label>
                <Select
                  value={testInfo.concreteGrade}
                  onValueChange={(v) => setTestInfo((p) => ({ ...p, concreteGrade: v }))}
                  disabled={submitted}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="C25" />
                  </SelectTrigger>
                  <SelectContent>
                    {["C20", "C25", "C30", "C35", "C40", "C45", "C50"].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "جدول نتائج السحب" : "Pull-out Test Results"}
            </CardTitle>
            {!submitted && (
              <Button size="sm" variant="outline" onClick={addSpecimen}>
                <Plus className="w-4 h-4 mr-1" />
                {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th} rowSpan={2}>
                    {ar ? "رقم العينة" : "Sample No."}
                  </th>
                  <th className={`${th} bg-yellow-50`} rowSpan={2}>
                    <div className="flex flex-col gap-0.5">
                      <span>{ar ? "الحجم الاسمي" : "Nominal"}</span>
                      <span>{ar ? "(mm)" : "Size (mm)"}</span>
                    </div>
                  </th>
                  <th className={`${th} bg-yellow-50`} rowSpan={2}>
                    <div className="flex flex-col gap-0.5">
                      <span>{ar ? "قطر المقطع" : "Cut Section"}</span>
                      <span>{ar ? "(mm)" : "Diameter (mm)"}</span>
                    </div>
                  </th>
                  <th className={`${th} bg-blue-50`} rowSpan={2}>
                    <div className="flex flex-col gap-0.5">
                      <span>{ar ? "مساحة المقطع" : "Cut Section"}</span>
                      <span>(mm²)</span>
                    </div>
                  </th>
                  <th className={th} rowSpan={2}>
                    {ar ? "التجارب" : "Trials"}
                  </th>
                  <th className={`${th} bg-green-50`} colSpan={2}>
                    {ar ? "إجهاد الشد" : "Tensile Strength"}
                  </th>
                  <th className={th} rowSpan={2}>
                    GL (mm)
                  </th>
                  <th className={`${th} bg-purple-50`} colSpan={2}>
                    {ar ? "الاستطالة" : "Elongation, A"}
                  </th>
                  <th className={`${th} bg-yellow-50`} rowSpan={2}>
                    %RA
                  </th>
                  <th className={th} rowSpan={2}>
                    {ar ? "الدرجة" : "Grade"}
                  </th>
                  <th className={th} rowSpan={2}>
                    {ar ? "ملاحظات" : "Notes"}
                  </th>
                  <th className={th} rowSpan={2}>
                    {ar ? "النتيجة" : "Result"}
                  </th>
                  <th className={th} rowSpan={2}>
                    {ar ? "الإجراء" : "Action"}
                  </th>
                </tr>
                <tr>
                  <th className={`${th} bg-yellow-50`}>
                    {ar ? "الحمل (kN)" : "Load (kN)"}
                  </th>
                  <th className={`${th} bg-green-100`}>Rm (MPa)</th>
                  <th className={`${th} bg-yellow-50`}>
                    {ar ? "زيادة الحجم (mm)" : "size increment (mm)"}
                  </th>
                  <th className={`${th} bg-purple-100`}>
                    {ar ? "الاستطالة %" : "Elongation (%)"} *
                  </th>
                </tr>
              </thead>
              <tbody>
                {computedSpecimens.map((row) => {
                  const input = specimens.find((s) => s.id === row.id);
                  if (!input) return null;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className={`${tdCalc} font-bold`}>{row.specimenNumber}</td>
                      <td className={`${tdIn} bg-yellow-50`}>
                        <Input
                          type="number"
                          step="1"
                          value={input.nominalSize}
                          onChange={(e) => updateSpecimen(row.id, "nominalSize", e.target.value)}
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="20"
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdIn} bg-yellow-50`}>
                        <Input
                          type="number"
                          step="0.1"
                          value={input.cutSectionDiameter}
                          onChange={(e) =>
                            updateSpecimen(row.id, "cutSectionDiameter", e.target.value)
                          }
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="16.3"
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdCalc} bg-blue-100`}>
                        {row.cutSectionArea != null && row.cutSectionArea > 0
                          ? row.cutSectionArea.toFixed(3)
                          : "—"}
                      </td>
                      <td className={tdIn}>
                        <Input
                          type="text"
                          value={input.trials}
                          onChange={(e) => updateSpecimen(row.id, "trials", e.target.value)}
                          className="h-8 text-xs text-center bg-white border border-slate-300"
                          placeholder={ar ? "التجربة الأولى" : "first trial"}
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdIn} bg-yellow-50`}>
                        <Input
                          type="number"
                          step="0.1"
                          value={input.loadKN}
                          onChange={(e) => updateSpecimen(row.id, "loadKN", e.target.value)}
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="203.7"
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdCalc} bg-green-100`}>
                        {row.tensileStrengthMPa != null ? (
                          <span
                            className={
                              row.rmResult === "pass"
                                ? "text-emerald-800"
                                : row.rmResult === "fail"
                                  ? "text-red-700"
                                  : ""
                            }
                          >
                            {row.tensileStrengthMPa.toFixed(1)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={tdIn}>
                        <Input
                          type="number"
                          step="1"
                          value={input.glMm}
                          onChange={(e) => updateSpecimen(row.id, "glMm", e.target.value)}
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="82"
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdIn} bg-yellow-50`}>
                        <Input
                          type="number"
                          step="0.1"
                          value={input.sizeIncrementMm}
                          onChange={(e) =>
                            updateSpecimen(row.id, "sizeIncrementMm", e.target.value)
                          }
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="14"
                          disabled={submitted}
                        />
                      </td>
                      <td className={`${tdCalc} bg-purple-100 font-semibold`}>
                        {row.elongation != null ? (
                          <span
                            className={
                              row.elongationResult === "pass"
                                ? "text-emerald-800"
                                : row.elongationResult === "fail"
                                  ? "text-red-700"
                                  : ""
                            }
                          >
                            {row.elongation.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdIn} bg-yellow-50`}>
                        <Input
                          type="number"
                          step="0.1"
                          value={input.raPercent}
                          onChange={(e) => updateSpecimen(row.id, "raPercent", e.target.value)}
                          className={LAB_NUMERIC_INPUT_SM}
                          placeholder="52"
                          disabled={submitted}
                        />
                      </td>
                      <td className={tdIn}>
                        <Input
                          type="text"
                          value={input.grade}
                          onChange={(e) => updateSpecimen(row.id, "grade", e.target.value)}
                          className="h-8 text-xs text-center bg-white border border-slate-300 w-14"
                          placeholder="8.8"
                          disabled={submitted}
                        />
                      </td>
                      <td className={tdIn}>
                        <Input
                          type="text"
                          value={input.notes}
                          onChange={(e) => updateSpecimen(row.id, "notes", e.target.value)}
                          className="h-8 text-xs bg-white border border-slate-300 min-w-[80px]"
                          placeholder="—"
                          disabled={submitted}
                        />
                      </td>
                      <td className={tdCalc}>
                        {row.overallResult && row.overallResult !== "pending" ? (
                          <PassFailBadge result={row.overallResult} size="sm" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdCalc}`}>
                        {!submitted && specimens.length > 1 && (
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
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {ar ? "المواصفات (BS EN ISO 898-1)" : "SPECIFICATIONS (BS EN ISO 898-1)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>{ar ? "حجم البرغي (mm)" : "Bolt Size (mm)"}</th>
                  <th className={th}>{ar ? "الحد الأدنى Rm" : "Min. Rm"}</th>
                  <th className={th}>{ar ? "الحد الأدنى للاستطالة" : "Min. Elongation"}</th>
                  <th className={th}>{ar ? "الحد الأدنى %RA" : "Min. %RA"}</th>
                  <th className={th}>{ar ? "الدرجة" : "Grade"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdCalc} font-normal`}>d ≤ 16</td>
                  <td className={`${tdCalc} font-bold`}>800 N/mm²</td>
                  <td className={`${tdCalc} font-bold`}>12%</td>
                  <td className={`${tdCalc} font-bold`}>52%</td>
                  <td className={`${tdCalc} font-normal`}>8.8</td>
                </tr>
                <tr>
                  <td className={`${tdCalc} font-normal`}>d &gt; 16</td>
                  <td className={`${tdCalc} font-bold`}>830 N/mm²</td>
                  <td className={`${tdCalc} font-bold`}>12%</td>
                  <td className={`${tdCalc} font-bold`}>52%</td>
                  <td className={`${tdCalc} font-normal`}>8.8</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {validRows.length > 0 && (
          <ResultBanner
            result={overallResult === "pass" ? "pass" : "fail"}
            testName={`${ar ? "شد برغي التثبيت" : "Anchor Bolt Tensile"} — ${BOLT_TYPES[testInfo.boltType].label}`}
            standard="BS EN ISO 898-1"
          />
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">
              {ar ? "ملاحظات / مشاهدات" : "Notes / Observations"}
            </Label>
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
