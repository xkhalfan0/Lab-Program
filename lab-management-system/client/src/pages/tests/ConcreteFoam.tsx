/**
 * ConcreteFoam — Foamed Concrete Compressive Strength OR Density Test
 * Standards: BS 1881-116 (Compressive Strength), BS 1881-114 (Density)
 *
 * Reception uses separate test codes (CONC_FOAM / CONC_FOAM_DENSITY). This form shows one mode per distribution.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Printer, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  FOAM_STRENGTH_TEST_CODE,
  MIN_CONC_FOAM_DENSITY_COUNT,
  resolveFoamTestMode,
} from "@shared/foamConcreteTests";
import { prepPayload, prepValuesFromFormData } from "@shared/concreteSpecimenPrepFields";
import {
  ConcreteSpecimenPrepFields,
  EMPTY_CONCRETE_SPECIMEN_PREP,
  type ConcreteSpecimenPrepValues,
} from "@/components/ConcreteSpecimenPrepFields";

/** N/mm² (MPa) → kg/cm² */
const N_PER_MM2_TO_KG_CM2 = 10.197;

interface CubeRow {
  id: string;
  cubeNo: string;
  age: string;
  sideA: string;
  sideB: string;
  height: string;
  mass: string;
  maxLoad: string;
  area?: number;
  /** Compressive strength in kg/cm² (for display & pass/fail) */
  strength?: number;
  /** Raw strength N/mm² (optional, for audit) */
  strengthNmm2?: number;
  density?: number;
  result?: "pass" | "fail" | "pending";
}

interface DensityRow {
  id: string;
  specimenNo: string;
  length: number | null;
  width: number | null;
  height: number | null;
  volume: number | null;
  initialWeight: number | null;
  weight72hrs: number | null;
  diff72Pct: number | null;
  weight96hrs: number | null;
  diff96Pct: number | null;
  ovenDryDensity: number | null;
  result: string | null;
}

function newCubeRow(index: number, defaultAge: string): CubeRow {
  return {
    id: `cube_${Date.now()}_${index}`,
    cubeNo: `FC${index + 1}`,
    age: defaultAge,
    sideA: "100",
    sideB: "100",
    height: "100",
    mass: "",
    maxLoad: "",
  };
}

function newDensityRow(index: number): DensityRow {
  return {
    id: `den_${Date.now()}_${index}`,
    specimenNo: `D${index + 1}`,
    length: 100,
    width: 100,
    height: 100,
    volume: null,
    initialWeight: null,
    weight72hrs: null,
    diff72Pct: null,
    weight96hrs: null,
    diff96Pct: null,
    ovenDryDensity: null,
    result: null,
  };
}

function calculateVolumeM3(lengthMm: number, widthMm: number, heightMm: number): number | null {
  if (!lengthMm || !widthMm || !heightMm) return null;
  const volumeMm3 = lengthMm * widthMm * heightMm;
  return volumeMm3 / 1_000_000_000;
}

function calculateDiffPercent(previous: number, current: number): number | null {
  if (!previous || !current) return null;
  return ((previous - current) / previous) * 100;
}

function calculateOvenDryDensityKgM3(weight96grams: number, volumeM3: number): number | null {
  if (!weight96grams || !volumeM3) return null;
  const weightKg = weight96grams / 1000;
  return weightKg / volumeM3;
}

function computeCubeRow(row: CubeRow, minStrengthKgCm2: number): CubeRow {
  const a = parseFloat(row.sideA);
  const b = parseFloat(row.sideB);
  const h = parseFloat(row.height);
  const m = parseFloat(row.mass);
  const P = parseFloat(row.maxLoad);
  if (!a || !b || !P) return { ...row, result: "pending" };
  const area = a * b;
  const strengthNmm2 = (P * 1000) / area;
  const strength = parseFloat((strengthNmm2 * N_PER_MM2_TO_KG_CM2).toFixed(2));
  const volume = a * b * h * 1e-9;
  const density = m && h ? parseFloat((m / volume).toFixed(0)) : undefined;
  const result =
    minStrengthKgCm2 > 0 ? (strength >= minStrengthKgCm2 ? "pass" : "fail") : "pending";
  return { ...row, area, strength, strengthNmm2, density, result };
}

function computeDensityRow(row: DensityRow, requiredMaxDensity: number | null): DensityRow {
  const L = row.length;
  const W = row.width;
  const H = row.height;
  const iw = row.initialWeight;
  const w72 = row.weight72hrs;
  const w96 = row.weight96hrs;

  const volume =
    L != null && W != null && H != null && L > 0 && W > 0 && H > 0 ? calculateVolumeM3(L, W, H) : null;
  const diff72Pct =
    iw != null && w72 != null && iw > 0 && w72 > 0 ? calculateDiffPercent(iw, w72) : null;
  const diff96Pct =
    w72 != null && w96 != null && w72 > 0 && w96 > 0 ? calculateDiffPercent(w72, w96) : null;
  const ovenDryDensity =
    w96 != null && volume != null && w96 > 0 && volume > 0 ? calculateOvenDryDensityKgM3(w96, volume) : null;

  let result: string | null = null;
  if (ovenDryDensity != null && requiredMaxDensity != null && requiredMaxDensity > 0) {
    result = ovenDryDensity <= requiredMaxDensity ? "PASS" : "FAIL";
  }

  return { ...row, volume, diff72Pct, diff96Pct, ovenDryDensity, result };
}

function parseConcreteAgeFromTestSubType(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as { concreteAge?: string | number };
    if (o?.concreteAge != null && String(o.concreteAge).trim() !== "") return String(o.concreteAge).trim();
  } catch {
    return null;
  }
  return null;
}

export default function ConcreteFoam() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId || "0", 10);
  const rowsInitialized = useRef(false);

  const [gradeLabel, setGradeLabel] = useState("");
  const [requiredStrengthKgCm2, setRequiredStrengthKgCm2] = useState("51.0");
  const [requiredMaxDryDensity, setRequiredMaxDryDensity] = useState("1400");
  const [testAge, setTestAge] = useState(28);
  const [cubeRows, setCubeRows] = useState<CubeRow[]>([newCubeRow(0, "28"), newCubeRow(1, "28"), newCubeRow(2, "28")]);
  const [densityRows, setDensityRows] = useState<DensityRow[]>([newDensityRow(0), newDensityRow(1)]);
  const [prepValues, setPrepValues] = useState<ConcreteSpecimenPrepValues>({
    ...EMPTY_CONCRETE_SPECIMEN_PREP,
    nominalSizeOfCube: "100 mm",
  });
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId },
  );
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );

  const testMode = useMemo(() => resolveFoamTestMode(distribution?.testType), [distribution?.testType]);
  const isDensityMode = testMode === "density";
  const testTypeCode = distribution?.testType ?? FOAM_STRENGTH_TEST_CODE;
  const pageTitle = isDensityMode
    ? ar
      ? "فحص الخرسانة الرغوية: الكثافة"
      : "Foamed Concrete Test: Density"
    : ar
      ? "فحص الخرسانة الرغوية: مقاومة الضغط"
      : "Foamed Concrete Test: Compressive Strength";
  const standardSubtitle = isDensityMode ? "BS 1881-114 (Density)" : "BS 1881-116 (Compressive Strength)";

  /** Age from reception: metadata (if ever exposed) or JSON in testSubType. */
  const registeredAge = useMemo(() => {
    const meta = (distribution as { metadata?: { concreteAge?: string | number } } | undefined)?.metadata?.concreteAge;
    if (meta != null && String(meta).trim() !== "") return String(meta).trim();
    return parseConcreteAgeFromTestSubType(distribution?.testSubType);
  }, [distribution]);

  const registeredAgeNum = useMemo(() => {
    if (registeredAge == null) return null;
    const n = parseInt(registeredAge, 10);
    return Number.isFinite(n) && n >= 1 && n <= 9999 ? n : null;
  }, [registeredAge]);

  useEffect(() => {
    rowsInitialized.current = false;
  }, [distId]);

  useEffect(() => {
    if (registeredAgeNum != null) setTestAge(registeredAgeNum);
  }, [registeredAgeNum]);

  useEffect(() => {
    setCubeRows(prev => prev.map(r => ({ ...r, age: String(testAge) })));
  }, [testAge]);

  useEffect(() => {
    if (existing?.formData) {
      const fd = existing.formData as Record<string, unknown>;
      if (fd.gradeLabel != null) setGradeLabel(String(fd.gradeLabel));
      if (fd.minStrengthKgCm2 != null) setRequiredStrengthKgCm2(String(fd.minStrengthKgCm2));
      else if (fd.minStrength != null) setRequiredStrengthKgCm2(String(fd.minStrength));
      if (fd.requiredMaxDryDensityKgM3 != null) setRequiredMaxDryDensity(String(fd.requiredMaxDryDensityKgM3));
      else if (fd.maxDensity != null) setRequiredMaxDryDensity(String(fd.maxDensity));
      if (fd.testAgeDays != null && Number.isFinite(Number(fd.testAgeDays))) {
        setTestAge(Number(fd.testAgeDays));
      }
      if (fd.notes != null) setNotes(String(fd.notes));
      setPrepValues(prev => ({ ...prev, ...prepValuesFromFormData(fd) }));
      if (Array.isArray(fd.cubes) && fd.cubes.length > 0) {
        setCubeRows(
          (fd.cubes as CubeRow[]).map((c, i) => ({
            id: c.id || `cube_${Date.now()}_${i}`,
            cubeNo: c.cubeNo || `FC${i + 1}`,
            age: c.age != null ? String(c.age) : String(testAge),
            sideA: c.sideA != null ? String(c.sideA) : "100",
            sideB: c.sideB != null ? String(c.sideB) : "100",
            height: c.height != null ? String(c.height) : "100",
            mass: c.mass != null ? String(c.mass) : "",
            maxLoad: c.maxLoad != null ? String(c.maxLoad) : "",
          })),
        );
      }
      if (Array.isArray(fd.densitySpecimens) && fd.densitySpecimens.length > 0) {
        setDensityRows(fd.densitySpecimens as DensityRow[]);
      }
      if (existing.status === "submitted") setSubmitted(true);
      rowsInitialized.current = true;
      return;
    }

    if (!distribution || rowsInitialized.current) return;

    const qty = distribution.quantity ?? (isDensityMode ? MIN_CONC_FOAM_DENSITY_COUNT : 3);
    const count = isDensityMode ? Math.max(MIN_CONC_FOAM_DENSITY_COUNT, qty) : Math.max(1, qty);
    const ageStr = String(testAge);

    if (isDensityMode) {
      setDensityRows(Array.from({ length: count }, (_, i) => newDensityRow(i)));
    } else {
      setCubeRows(Array.from({ length: count }, (_, i) => newCubeRow(i, ageStr)));
    }
    rowsInitialized.current = true;
  }, [existing, distribution, isDensityMode, testAge]);

  const ageLockedFromRegistration = registeredAgeNum != null;

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حفظ نتائج الخرسانة الرغوية بنجاح" : "Foamed concrete results saved successfully");
      setSubmitted(true);
      redirectAfterTestSave(navigate, distribution);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const minStrengthKgCm2 = parseFloat(requiredStrengthKgCm2) || 0;
  const maxDryDensityKgM3 = parseFloat(requiredMaxDryDensity) || 0;
  const densityRequiredMax = maxDryDensityKgM3 > 0 ? maxDryDensityKgM3 : null;

  useEffect(() => {
    setDensityRows(prev => prev.map(r => computeDensityRow(r, densityRequiredMax)));
  }, [densityRequiredMax]);

  const computedCubes = cubeRows.map(r => computeCubeRow(r, minStrengthKgCm2));
  const computedDensity = densityRows.map(r => computeDensityRow(r, densityRequiredMax));

  const validCubes = computedCubes.filter(r => r.strength !== undefined);
  const avgStrength =
    validCubes.length > 0
      ? parseFloat((validCubes.reduce((s, r) => s + (r.strength || 0), 0) / validCubes.length).toFixed(2))
      : undefined;
  const passCount = validCubes.filter(r => r.result === "pass").length;
  const overallStrengthPass = validCubes.length > 0 && passCount === validCubes.length;
  const overallStrengthBadge: "pass" | "fail" | "pending" =
    validCubes.length === 0 ? "pending" : overallStrengthPass ? "pass" : "fail";

  const validOvenDensity = computedDensity.filter(
    r => r.ovenDryDensity != null && Number.isFinite(r.ovenDryDensity),
  );
  const avgOvenDryDensity =
    validOvenDensity.length > 0
      ? Math.round(
          validOvenDensity.reduce((s, r) => s + (r.ovenDryDensity as number), 0) / validOvenDensity.length,
        )
      : null;

  const densityRowsWithVerdict = computedDensity.filter(r => r.result === "PASS" || r.result === "FAIL");
  const overallDensityResult: "PASS" | "FAIL" | null =
    densityRowsWithVerdict.length === 0
      ? null
      : densityRowsWithVerdict.every(r => r.result === "PASS")
        ? "PASS"
        : "FAIL";

  const overallDensityBadge: "pass" | "fail" | "pending" =
    overallDensityResult === "PASS" ? "pass" : overallDensityResult === "FAIL" ? "fail" : "pending";

  const updateCube = useCallback((id: string, field: keyof CubeRow, value: string) => {
    setCubeRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const updateDensityRow = useCallback((id: string, field: keyof DensityRow, value: unknown) => {
    const maxAllowed = parseFloat(requiredMaxDryDensity) || 0;
    const reqMax = maxAllowed > 0 ? maxAllowed : null;
    setDensityRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        let patch: Partial<DensityRow> = {};
        if (field === "specimenNo") {
          patch = { specimenNo: String(value ?? "") };
        } else if (
          field === "id" ||
          field === "volume" ||
          field === "diff72Pct" ||
          field === "diff96Pct" ||
          field === "ovenDryDensity" ||
          field === "result"
        ) {
          return row;
        } else {
          const n =
            value === "" || value === null || value === undefined
              ? null
              : typeof value === "number"
                ? Number.isFinite(value)
                  ? value
                  : null
                : parseFloat(String(value));
          const num = n != null && Number.isFinite(n) ? n : null;
          patch = { [field]: num } as Partial<DensityRow>;
        }
        const updated = { ...row, ...patch } as DensityRow;
        return computeDensityRow(updated, reqMax);
      }),
    );
  }, [requiredMaxDryDensity]);

  const removeDensityRow = useCallback(
    (id: string) => {
      setDensityRows(prev => {
        if (prev.length <= MIN_CONC_FOAM_DENSITY_COUNT) {
          toast.error(
            ar
              ? `الحد الأدنى ${MIN_CONC_FOAM_DENSITY_COUNT} عينات لاختبار الكثافة`
              : `Minimum ${MIN_CONC_FOAM_DENSITY_COUNT} specimens required for density test`,
          );
          return prev;
        }
        return prev.filter(r => r.id !== id);
      });
    },
    [ar],
  );

  const handleSubmit = () => {
    if (!distribution?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (!distributionId) return;

    const overallResult: "pass" | "fail" | "pending" = isDensityMode ? overallDensityBadge : overallStrengthBadge;

    const resultData = {
      testType: testTypeCode,
      testMode,
      strengthUnit: "kg/cm2" as const,
      gradeLabel,
      minStrength: minStrengthKgCm2,
      minStrengthKgCm2,
      maxDensity: maxDryDensityKgM3,
      requiredMaxDryDensityKgM3: maxDryDensityKgM3,
      testAgeDays: testAge,
      densitySpecimenAgeDays: testAge,
      cubes: computedCubes,
      densitySpecimens: computedDensity,
      avgStrength,
      avgOvenDryDensity,
      avgDryDensity: avgOvenDryDensity ?? undefined,
      overallStrengthPass,
      overallDensityPass: overallDensityResult === "PASS",
      notes,
      submittedBy: user?.name,
      submittedAt: new Date().toISOString(),
      ...prepPayload(prepValues),
    };

    saveMut.mutate({
      distributionId: distId,
      sampleId: distribution.sampleId,
      testTypeCode: testTypeCode,
      formTemplate: "concrete_foam",
      formData: resultData,
      overallResult,
      notes,
      status: "submitted",
    });
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
      <div className="container max-w-5xl py-6 space-y-6">
        <SampleInfoCard dist={distribution} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-500" />
              {pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{standardSubtitle}</p>
          </div>
          {distribution && (
            <Badge variant="outline" className="text-sm">
              {distribution.distributionCode} — {distribution.testName}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "إعدادات الفحص" : "Test Settings"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>{ar ? "التدرج / الدرجة (نص)" : "Grade (text)"}</Label>
              <Input
                value={gradeLabel}
                onChange={e => setGradeLabel(e.target.value)}
                placeholder={ar ? "مثال: FC مخصص، مواصفات المشروع…" : "e.g. Project spec, mix ID…"}
              />
            </div>
            {!isDensityMode && (
              <div>
                <Label>{ar ? "المقاومة المطلوبة (كجم/سم²)" : "Required Strength (kg/cm²)"}</Label>
                <Input
                  value={requiredStrengthKgCm2}
                  onChange={e => setRequiredStrengthKgCm2(e.target.value)}
                  type="number"
                  step="0.1"
                  min="0"
                />
              </div>
            )}
            {isDensityMode && (
              <div>
                <Label>{ar ? "أقصى كثافة جافة مسموحة (كجم/م³)" : "Required max dry density (kg/m³)"}</Label>
                <Input
                  value={requiredMaxDryDensity}
                  onChange={e => setRequiredMaxDryDensity(e.target.value)}
                  type="number"
                  step="10"
                  min="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {ar ? "العينة تكون مطابقة إذا كانت الكثافة الجافة ≤ هذا الحد" : "Pass when dry density ≤ this limit"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{ar ? "أمر التوزيع" : "Distribution"}</Label>
              <Input value={distribution?.distributionCode || "N/A"} disabled />
            </div>
            <div>
              <Label>{ar ? "اسم الاختبار" : "Test Name"}</Label>
              <Input value={distribution?.testName || "N/A"} disabled />
            </div>
            <div>
              <Label className="flex items-center gap-1">
                {ar ? "عمر العينة (أيام)" : "Sample Age (days)"}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                max={9999}
                inputMode="numeric"
                value={testAge}
                readOnly={ageLockedFromRegistration}
                className={ageLockedFromRegistration ? "bg-muted" : undefined}
                onChange={(e) => {
                  if (ageLockedFromRegistration) return;
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n)) return;
                  setTestAge(Math.min(9999, Math.max(1, n)));
                }}
              />
              {ageLockedFromRegistration ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {ar ? "من التسجيل في الاستقبال (من الصب إلى الفحص)" : "From registration (casting to testing)"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  {ar ? "المدة من الصب حتى الفحص (يُعدّل إن لم يُسجَّل عمر في الاستقبال)" : "Casting to testing (editable if no age was set at reception)"}
                </p>
              )}
            </div>
            <div>
              <Label>{ar ? "الفاحص" : "Tested By"}</Label>
              <Input value={user?.name || "N/A"} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "تفاصيل العينة" : "Sample Details"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConcreteSpecimenPrepFields
              variant="foam"
              lang={lang}
              values={prepValues}
              onChange={patch => setPrepValues(prev => ({ ...prev, ...patch }))}
              disabled={submitted}
            />
          </CardContent>
        </Card>

        {!isDensityMode && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ar ? "اختبار مقاومة الضغط" : "Compressive Strength Test"}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCubeRows(prev => [...prev, newCubeRow(prev.length, String(testAge))])}>
                <Plus className="mr-2 h-4 w-4" /> {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">{ar ? "رقم المكعب" : "Cube No."}</th>
                      <th className="p-2 text-left">{ar ? "العمر (يوم)" : "Age (days)"}</th>
                      <th className="p-2 text-left">{ar ? "الجانب أ (مم)" : "Side A (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الجانب ب (مم)" : "Side B (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الارتفاع (مم)" : "Height (mm)"}</th>
                      <th className="p-2 text-left">{ar ? "الكتلة (كجم)" : "Mass (kg)"}</th>
                      <th className="p-2 text-left">{ar ? "الحمل الأقصى (كن)" : "Max Load (kN)"}</th>
                      <th className="p-2 text-left">{ar ? "المساحة (مم²)" : "Area (mm²)"}</th>
                      <th className="p-2 text-left">{ar ? "المقاومة (كجم/سم²)" : "Strength (kg/cm²)"}</th>
                      <th className="p-2 text-left">{ar ? "الكثافة (كجم/م³)" : "Density (kg/m³)"}</th>
                      <th className="p-2 text-left">{ar ? "النتيجة" : "Result"}</th>
                      <th className="p-2 text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {computedCubes.map(row => (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="p-2">
                          <Input value={row.cubeNo} onChange={e => updateCube(row.id, "cubeNo", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <Input
                            value={row.age}
                            onChange={e => updateCube(row.id, "age", e.target.value)}
                            type="number"
                            readOnly={ageLockedFromRegistration}
                            className={ageLockedFromRegistration ? "bg-muted" : undefined}
                          />
                        </td>
                        <td className="p-2">
                          <Input value={row.sideA} onChange={e => updateCube(row.id, "sideA", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.sideB} onChange={e => updateCube(row.id, "sideB", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.height} onChange={e => updateCube(row.id, "height", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.mass} onChange={e => updateCube(row.id, "mass", e.target.value)} type="number" />
                        </td>
                        <td className="p-2">
                          <Input value={row.maxLoad} onChange={e => updateCube(row.id, "maxLoad", e.target.value)} type="number" />
                        </td>
                        <td className="p-2 font-medium">{row.area?.toFixed(0) || "-"}</td>
                        <td className="p-2 font-medium">{row.strength ?? "-"}</td>
                        <td className="p-2 font-medium">{row.density ?? "-"}</td>
                        <td className="p-2">
                          <PassFailBadge result={row.result ?? "pending"} />
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setCubeRows(prev => prev.filter(r => r.id !== row.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap justify-end items-center gap-4">
                <div className="font-medium">
                  {ar ? `متوسط المقاومة: ${avgStrength ?? "-"} كجم/سم²` : `Average Strength: ${avgStrength ?? "-"} kg/cm²`}
                </div>
                <div className="font-medium flex items-center gap-2">
                  {ar ? "النتيجة الكلية:" : "Overall:"}{" "}
                  <PassFailBadge result={overallStrengthBadge} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isDensityMode && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ar ? "اختبار الكثافة" : "Density Test"}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const maxAllowed = parseFloat(requiredMaxDryDensity) || 0;
                  const reqMax = maxAllowed > 0 ? maxAllowed : null;
                  setDensityRows(prev => [...prev, computeDensityRow(newDensityRow(prev.length), reqMax)]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> {ar ? "إضافة عينة" : "Add Specimen"}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {ar ? "عمر العينة عند الفحص: " : "Sample age at test: "}
                <span className="font-semibold text-foreground">{testAge}</span>
                {ar ? " يوم" : " days"}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1 text-left">{ar ? "رقم العينة" : "Specimen No."}</th>
                      <th className="border border-slate-300 px-2 py-1 text-center">{ar ? "العمر (يوم)" : "Age (days)"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "الطول (مم)" : "Length (mm)"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "العرض (مم)" : "Width (mm)"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "الارتفاع (مم)" : "Height (mm)"}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{ar ? "الحجم (م³)" : "Volume (m³)"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "الوزن الأولي غ (0-1)" : "Initial Wt g (0-1)"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "72 س غ (1)" : "Wt 72 Hrs g (1)"}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{ar ? "فرق %" : "Diff %"}</th>
                      <th className="border border-slate-300 px-2 py-1">{ar ? "96 س غ (2)" : "Wt 96 Hrs g (2)"}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{ar ? "فرق %" : "Diff %"}</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">{ar ? "كثافة جافة فرن (كجم/م³)" : "Oven dry density (kg/m³)"}</th>
                      <th className="border border-slate-300 px-2 py-1 text-center">{ar ? "النتيجة" : "Result"}</th>
                      <th className="border border-slate-300 px-1 py-1 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {computedDensity.map(row => (
                      <tr key={row.id}>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            className="h-8 min-w-[4rem]"
                            value={row.specimenNo}
                            onChange={e => updateDensityRow(row.id, "specimenNo", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center font-medium text-muted-foreground">{testAge}</td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-16"
                            value={row.length ?? ""}
                            onChange={e => updateDensityRow(row.id, "length", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-16"
                            value={row.width ?? ""}
                            onChange={e => updateDensityRow(row.id, "width", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-16"
                            value={row.height ?? ""}
                            onChange={e => updateDensityRow(row.id, "height", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[11px]">
                          {row.volume !== null ? row.volume.toFixed(6) : "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-20"
                            value={row.initialWeight ?? ""}
                            onChange={e => updateDensityRow(row.id, "initialWeight", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-20"
                            value={row.weight72hrs ?? ""}
                            onChange={e => updateDensityRow(row.id, "weight72hrs", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[11px] text-orange-600">
                          {row.diff72Pct !== null ? `${row.diff72Pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Input
                            type="number"
                            className="h-8 w-20"
                            value={row.weight96hrs ?? ""}
                            onChange={e => updateDensityRow(row.id, "weight96hrs", e.target.value)}
                          />
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[11px] text-orange-600">
                          {row.diff96Pct !== null ? `${row.diff96Pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[11px]">
                          {row.ovenDryDensity !== null ? Math.round(row.ovenDryDensity) : "—"}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 text-center">
                          {row.result === "PASS" && <span className="text-green-600 font-bold">✓</span>}
                          {row.result === "FAIL" && <span className="text-red-600 font-bold">✗</span>}
                          {!row.result && "—"}
                        </td>
                        <td className="border border-slate-300 px-1 py-1">
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeDensityRow(row.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-sm text-muted-foreground">
                    {ar ? "متوسط الكثافة الجافة في الفرن:" : "Average oven dry density:"}
                  </span>
                  <span className="ms-2 font-bold text-lg">{avgOvenDryDensity !== null ? `${avgOvenDryDensity} kg/m³` : "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{ar ? "الإجمالي:" : "Overall:"}</span>
                  {overallDensityResult === "PASS" && <span className="text-green-600 font-bold text-lg">PASS ✓</span>}
                  {overallDensityResult === "FAIL" && <span className="text-red-600 font-bold text-lg">FAIL ✗</span>}
                  {!overallDensityResult && <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "ملاحظات" : "Notes"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={ar ? "ملاحظات إضافية حول الاختبار…" : "Additional notes about the test…"}
              rows={5}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {submitted ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/technician")}>
                {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 gap-1.5 text-white"
                onClick={() => window.open(`/test-report/${distributionId}`, "_blank")}
              >
                <Printer size={14} />
                {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
              onClick={handleSubmit}
              disabled={submitted || saveMut.isPending}
            >
              {saveMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {ar ? "جاري الإرسال…" : "Submitting…"}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {ar ? "إرسال النتائج" : "Submit Results"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
