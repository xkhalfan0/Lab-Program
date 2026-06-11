import { useState, useEffect, useRef, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Plus, Trash2, Save, Send, Printer, ChevronDown, ChevronUp,
  FlaskConical, CheckCircle, AlertTriangle, XCircle, Info, Lock
} from "lucide-react";
import {
  calcActualAgeDays,
  cubeAreaMm2,
  cubeEdgeMmFromNominal,
  daysUntilDue,
  dueDateFromCasting,
  evaluateCubePass,
  evaluateGroupPass,
  FRACTURE_TYPE_OPTIONS,
  resolveBs1881AgeFactor,
} from "@shared/concreteCubeBs1881";
import { parseConcCubePlan, type ConcCubeReceptionPlan } from "@shared/concreteCubeReception";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CubeRow {
  id?: number;
  markNo: number;
  cubeId: string;
  dateTested: string;
  length: string;
  width: string;
  height: string;
  massKg: string;
  maxLoadKN: string;
  fractureType: string;
  withinSpec: boolean | null; // technician manual override
  // computed
  densityKgM3?: string;
  compressiveStrengthMpa?: string;
}

// ─── Calculation helpers (mirror server logic) ────────────────────────────────
// Round to nearest 10 kg/m³ (BS 1881 Part 114)
function calcDensity(massKg: string, L: string, W: string, H: string): string {
  const m = parseFloat(massKg);
  const l = parseFloat(L) || 150;
  const w = parseFloat(W) || 150;
  const h = parseFloat(H) || 150;
  if (!m || m <= 0) return "";
  const vol = (l * w * h) / 1e9; // m³
  const raw = m / vol;
  return (Math.round(raw / 10) * 10).toString();
}

// Round to nearest 0.5 N/mm² (BS 1881 Part 116)
function calcStrength(loadKN: string, L: string, W: string): string {
  const load = parseFloat(loadKN);
  const l = parseFloat(L) || 150;
  const w = parseFloat(W) || 150;
  if (!load || load <= 0) return "";
  const area = l * w; // mm²
  const raw = (load * 1000) / area;
  return (Math.round(raw * 2) / 2).toFixed(1);
}

function calcAvg(cubes: CubeRow[]): number {
  const vals = cubes
    .map(c => parseFloat(c.compressiveStrengthMpa ?? calcStrength(c.maxLoadKN, c.length, c.width)))
    .filter(v => v > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Concrete strength percentage guidelines (approximate):
// 1d=16%, 3d=40-45%, 7d=65-70%, 14d=90%, 28d=99-100%, 56d+=105-120%
// Uses LOWER bound of each range for pass/fail (conservative)
function getRequiredStrength(targetMpa: number, actualAge: number): number {
  if (actualAge <= 1)  return targetMpa * 0.16;
  if (actualAge <= 3)  return targetMpa * 0.40;
  if (actualAge <= 7)  return targetMpa * 0.65;
  if (actualAge <= 14) return targetMpa * 0.90;
  if (actualAge <= 28) return targetMpa * 0.99;
  return targetMpa * 1.05; // 56+ days: expect 105% minimum
}

// Determine effective age band: if actual age exceeds group age, use next band
function getEffectiveAge(actualAge: number, groupAge: number): number {
  if (actualAge <= groupAge) return groupAge; // normal case
  // Cube tested later than planned → use next standard milestone
  const milestones = [1, 3, 7, 14, 28, 56];
  for (const m of milestones) {
    if (actualAge <= m) return m;
  }
  return actualAge;
}

// Calculate cube age in days from casting date and test date
function calcCubeAge(castingDateStr: string, testDateStr: string): number | null {
  if (!castingDateStr || !testDateStr) return null;
  const casting = new Date(castingDateStr);
  const tested = new Date(testDateStr);
  if (isNaN(casting.getTime()) || isNaN(tested.getTime())) return null;
  const diffMs = tested.getTime() - casting.getTime();
  if (diffMs < 0) return null;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function complianceColor(
  avg: number,
  min?: string | null,
  _max?: string | null,
  testAge?: number,
  cubeStrengths?: number[],
): "pass" | "fail" | "none" {
  if (!min) return "none";
  const targetMpa = parseFloat(min);
  if (isNaN(targetMpa) || targetMpa <= 0) return "none";
  const age = testAge ?? 28;
  const strengths = (cubeStrengths ?? []).filter(s => s > 0);
  if (age >= 28 && strengths.length > 0) {
    const avgOk = avg >= targetMpa - 1e-9;
    const minCube = Math.min(...strengths);
    const cubesOk = minCube >= targetMpa - 4 - 1e-9;
    return avgOk && cubesOk ? "pass" : "fail";
  }
  const required = getRequiredStrength(targetMpa, age);
  return avg >= required ? "pass" : "fail";
}

function getAgePct(age: number): number {
  if (age <= 1)  return 16;
  if (age <= 3)  return 40;
  if (age <= 7)  return 65;
  if (age <= 14) return 90;
  if (age <= 28) return 99;
  return 105;
}

function getRequiredLabel(targetMpa: number, testAge: number): string {
  const pct = getAgePct(testAge);
  const required = getRequiredStrength(targetMpa, testAge);
  return `${pct}% of ${targetMpa} N/mm² = ${required.toFixed(1)} N/mm²`;
}

/** Persist cube age UI metadata in group comments (hidden suffix; stripped for display). */
const AGE_META_MARKER = "\n__AGE_META__:";
function stripAgeMetaFromComments(comments: string): string {
  const i = comments.indexOf(AGE_META_MARKER);
  if (i === -1) return comments;
  return comments.slice(0, i).trimEnd();
}
function parseAgeMetaFromComments(comments: string): { testAge?: number; actualAge?: number | null; isLate?: boolean } | null {
  const i = comments.indexOf(AGE_META_MARKER);
  if (i === -1) return null;
  try {
    return JSON.parse(comments.slice(i + AGE_META_MARKER.length)) as { testAge?: number; actualAge?: number | null; isLate?: boolean };
  } catch {
    return null;
  }
}
function mergeAgeMetaIntoComments(
  comments: string,
  meta: { testAge: number; actualAge: number | null; isLate: boolean; cubes: unknown[] }
): string {
  const base = stripAgeMetaFromComments(comments);
  return `${base}${AGE_META_MARKER}${JSON.stringify(meta)}`;
}

// ─── Empty cube factory ───────────────────────────────────────────────────────
function edgeMmFromNominal(nom: string | null | undefined): "100" | "150" {
  if (!nom) return "150";
  const s = String(nom).toLowerCase();
  return s.startsWith("100") ? "100" : "150";
}

function emptyRow(markNo: number, edgeMm: "100" | "150" = "150"): CubeRow {
  return {
    markNo,
    cubeId: "",
    dateTested: new Date().toISOString().split("T")[0],
    length: edgeMm,
    width: edgeMm,
    height: edgeMm,
    massKg: "",
    maxLoadKN: "",
    fractureType: "SF",
    withinSpec: null,
  };
}

function LockedLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <Lock className="w-3 h-3" />
      {children}
    </span>
  );
}

// ─── Single Age Group Panel ───────────────────────────────────────────────────
interface GroupPanelProps {
  group: any;
  distributionId: number;
  onRefresh: () => void;
  castingDate?: Date | string | null;
  /** From sample (reception); default cube face size */
  distributionNominalCube?: string | null;
  receptionPlan?: ConcCubeReceptionPlan | null;
}

function initialSelectedTestAge(g: { comments?: string | null; testAge?: number }): number | null {
  const m = parseAgeMetaFromComments(g.comments ?? "");
  if (m?.testAge != null && [7, 14, 28].includes(m.testAge)) return m.testAge;
  const gt = g.testAge ?? 28;
  return [7, 14, 28].includes(gt) ? gt : null;
}

function GroupPanel({ group, distributionId, onRefresh, castingDate: distCastingDate, distributionNominalCube, receptionPlan }: GroupPanelProps) {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const [open, setOpen] = useState(true);
  const [cubes, setCubes] = useState<CubeRow[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [comments, setComments] = useState(() => stripAgeMetaFromComments(group.comments ?? ""));
  /** Selected design test age (7 / 14 / 28 days) for acceptance band — required before save/submit. */
  const [testAge, setTestAge] = useState<number | null>(() => initialSelectedTestAge(group));
  const [headerExpanded, setHeaderExpanded] = useState(false);

  // Header fields
  const [sourceSupplier, setSourceSupplier] = useState(group.sourceSupplier ?? "");
  const [batchDateTime, setBatchDateTime] = useState(group.batchDateTime ?? "");
  const [slump, setSlump] = useState(group.slump ?? "");
  const [classOfConcrete, setClassOfConcrete] = useState(group.classOfConcrete ?? "");
  const [maxAggSize, setMaxAggSize] = useState(group.maxAggSize ?? "");
  const [region, setRegion] = useState(group.region ?? "");
  const [consultant, setConsultant] = useState(group.consultant ?? "");
  const [cscRef, setCscRef] = useState(group.cscRef ?? "");
  const [placeOfSampling, setPlaceOfSampling] = useState(group.placeOfSampling ?? "");
  const [location, setLocation] = useState(group.location ?? "");

  const saveCube = trpc.concrete.saveCube.useMutation();
  const deleteCubeMut = trpc.concrete.deleteCube.useMutation();
  const updateGroup = trpc.concrete.updateGroup.useMutation();
  const submitGroup = trpc.concrete.submitGroup.useMutation();

  const defaultEdge = edgeMmFromNominal(group.nominalCubeSize ?? distributionNominalCube);
  const planLocked = !!receptionPlan;
  const nominalAge = group.testAge ?? 28;
  const fcMpa = receptionPlan?.designStrength ?? parseFloat(group.minAcceptable ?? "0");
  const edgeMmNum = receptionPlan?.cubeSizeMm ?? cubeEdgeMmFromNominal(group.nominalCubeSize ?? distributionNominalCube);
  const [testDate, setTestDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    setComments(stripAgeMetaFromComments(group.comments ?? ""));
    setTestAge(initialSelectedTestAge(group));
  }, [group.id]);

  const castingIso = distCastingDate
    ? (distCastingDate instanceof Date ? distCastingDate.toISOString().split("T")[0] : String(distCastingDate).split("T")[0])
    : null;
  const castingLocked = !!castingIso;

  // Init cubes from server data
  useEffect(() => {
    if (group.cubes && group.cubes.length > 0) {
      const mapped = group.cubes.map((c: any) => ({
        id: c.id,
        markNo: c.markNo,
        cubeId: c.cubeId ?? "",
        dateTested: c.dateTested ? new Date(c.dateTested).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        length: c.length ?? String(defaultEdge),
        width: c.width ?? String(defaultEdge),
        height: c.height ?? String(defaultEdge),
        massKg: c.massKg ?? "",
        maxLoadKN: c.maxLoadKN && c.maxLoadKN !== "0" ? c.maxLoadKN : "",
        fractureType: c.fractureType ?? "SF",
        withinSpec: c.withinSpec ?? null,
        densityKgM3: c.densityKgM3 ?? "",
        compressiveStrengthMpa: c.compressiveStrengthMpa ?? "",
      }));
      setCubes(mapped);
      const firstDate = mapped.find(c => c.dateTested)?.dateTested;
      if (firstDate) setTestDate(firstDate);
    } else if (!planLocked) {
      setCubes([emptyRow(1, defaultEdge)]);
    } else {
      setCubes([]);
    }
  }, [group.id, defaultEdge, planLocked]);

  // Recompute derived fields on change
  const updateCube = (idx: number, field: keyof CubeRow, value: string) => {
    setCubes(prev => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };
      // Recompute
      row.densityKgM3 = calcDensity(
        field === "massKg" ? value : row.massKg,
        field === "length" ? value : row.length,
        field === "width" ? value : row.width,
        field === "height" ? value : row.height,
      );
      row.compressiveStrengthMpa = calcStrength(
        field === "maxLoadKN" ? value : row.maxLoadKN,
        field === "length" ? value : row.length,
        field === "width" ? value : row.width,
      );
      next[idx] = row;
      return next;
    });
  };

  const addRow = () => {
    if (planLocked) return;
    setCubes(prev => {
      if (prev.length >= 16) {
        toast.error("Maximum 16 cubes per test group");
        return prev;
      }
      return [...prev, emptyRow(prev.length + 1, defaultEdge)];
    });
  };

  const removeRow = async (idx: number) => {
    if (planLocked) return;
    const cube = cubes[idx];
    if (cube.id) {
      await deleteCubeMut.mutateAsync({ id: cube.id });
    }
    setCubes(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, markNo: i + 1 })));
    onRefresh();
  };

  const getCastingDateStr = () =>
    distCastingDate
      ? (distCastingDate instanceof Date ? distCastingDate.toISOString() : String(distCastingDate))
      : (group.batchDateTime ? group.batchDateTime.split(" ")[0] : null);

  const isSubmitted = group.status === "submitted" || group.status === "approved";
  const castingStr = getCastingDateStr();
  const daysUntil = castingStr && planLocked ? daysUntilDue(castingStr, nominalAge) : 0;
  const groupLocked = planLocked && !isSubmitted && daysUntil > 0;
  const dueDate = castingStr && planLocked ? dueDateFromCasting(castingStr, nominalAge) : null;
  const panelActualAgeForFactor =
    castingStr && planLocked ? calcActualAgeDays(castingStr, testDate) : null;
  const ageResult =
    panelActualAgeForFactor != null && fcMpa > 0
      ? resolveBs1881AgeFactor(panelActualAgeForFactor, fcMpa)
      : null;

  const computePanelActualAge = (): number | null => {
    const castingDateStr = getCastingDateStr();
    if (planLocked && castingDateStr) {
      return calcActualAgeDays(castingDateStr, testDate);
    }
    const ages = cubes
      .map(c => calcCubeAge(castingDateStr ?? "", c.dateTested))
      .filter((a): a is number => a !== null);
    return ages.length > 0 ? Math.max(...ages) : null;
  };

  /** Snapshot for hidden JSON suffix on group comments (testAge / ages / cube summary). */
  const buildAgeFormData = (ta: number) => {
    const panelActualAge = computePanelActualAge();
    return {
      testAge: ta,
      actualAge: panelActualAge,
      isLate: panelActualAge != null && panelActualAge > ta + 5,
      cubes: cubes.map(c => ({
        markNo: c.markNo,
        cubeId: c.cubeId,
        dateTested: c.dateTested,
        maxLoadKN: c.maxLoadKN,
        massKg: c.massKg,
        compressiveStrengthMpa: c.compressiveStrengthMpa,
      })),
    };
  };

  const persistAgeMetaToComments = async (ta: number) => {
    const formData = buildAgeFormData(ta);
    await updateGroup.mutateAsync({
      groupId: group.id,
      comments: mergeAgeMetaIntoComments(comments, formData),
    });
  };

  const effectiveTestAge = planLocked ? nominalAge : testAge;

  const saveSingleCube = async (idx: number) => {
    if (!effectiveTestAge) {
      toast.error(lang === "ar" ? "يجب اختيار عمر الاختبار" : "Please select test age");
      return;
    }
    if (planLocked && groupLocked) return;
    const cube = cubes[idx];
    if (!cube.maxLoadKN) {
      toast.error("Max Load (kN) is required");
      return;
    }
    setSaving(idx);
    try {
      const result = await saveCube.mutateAsync({
        id: cube.id,
        groupId: group.id,
        markNo: cube.markNo,
        cubeId: cube.cubeId || undefined,
        dateTested: planLocked ? testDate : undefined,
        length: String(planLocked ? edgeMmNum : defaultEdge),
        width: String(defaultEdge),
        height: String(defaultEdge),
        massKg: cube.massKg || undefined,
        maxLoadKN: cube.maxLoadKN,
        fractureType: cube.fractureType || undefined,
        withinSpec: cube.withinSpec,
      });
      if (result) {
        setCubes(prev => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            id: result.id,
            densityKgM3: result.densityKgM3 ?? "",
            compressiveStrengthMpa: result.compressiveStrengthMpa ?? "",
          };
          return next;
        });
      }
      await persistAgeMetaToComments(effectiveTestAge);
      toast.success(`Cube ${cube.markNo} saved`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveAllCubes = async () => {
    if (!effectiveTestAge) {
      toast.error(lang === "ar" ? "يجب اختيار عمر الاختبار" : "Please select test age");
      return;
    }
    if (planLocked && groupLocked) return;
    for (let i = 0; i < cubes.length; i++) {
      if (cubes[i].maxLoadKN) await saveSingleCube(i);
    }
  };

  const saveHeader = async () => {
    if (!isSubmitted && !effectiveTestAge) {
      toast.error(lang === "ar" ? "يجب اختيار عمر الاختبار" : "Please select test age");
      return;
    }
    try {
      const batchVal = castingLocked ? (castingIso ?? undefined) : (batchDateTime || undefined);
      const commentsPayload =
        !isSubmitted && effectiveTestAge
          ? mergeAgeMetaIntoComments(comments, buildAgeFormData(effectiveTestAge))
          : comments;
      await updateGroup.mutateAsync({
        groupId: group.id,
        comments: commentsPayload,
        sourceSupplier: sourceSupplier || undefined,
        batchDateTime: batchVal,
        dateSampled: batchVal,
        slump: slump || undefined,
        classOfConcrete: classOfConcrete || undefined,
        maxAggSize: maxAggSize || undefined,
        region: region || undefined,
        consultant: consultant || undefined,
        cscRef: cscRef || undefined,
        placeOfSampling: placeOfSampling || undefined,
        location: location || undefined,
      });
      toast.success("Header info saved");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSubmit = async () => {
    if (!effectiveTestAge) {
      toast.error(lang === "ar" ? "يجب اختيار عمر الاختبار" : "Please select test age");
      return;
    }
    if (planLocked && groupLocked) {
      toast.error(ar ? "لم يحن موعد الاختبار بعد" : "This age group is not yet due for testing");
      return;
    }
    if (planLocked && ageResult?.status === "invalid") {
      toast.error(ageResult.message ?? "Too early — result invalid");
      return;
    }
    if (!planLocked) {
      const requiredFields = [
        { label: ar ? "مصدر/مورد الخرسانة" : "Concrete Source/Supplier", value: sourceSupplier },
        { label: ar ? "درجة الخرسانة" : "Class of Concrete", value: classOfConcrete },
        { label: ar ? "أقصى حجم للركام (مم)" : "Maximum Aggregate Size (mm)", value: maxAggSize },
        { label: ar ? "الهطول (مم)" : "Slump (mm)", value: slump },
        { label: ar ? "مكان أخذ العينة" : "Place of Sampling", value: placeOfSampling },
      ];
      const missing = requiredFields.filter((f) => !String(f.value ?? "").trim()).map((f) => f.label);
      if (missing.length > 0) {
        toast.error(
          ar
            ? `الرجاء تعبئة الحقول المطلوبة: ${missing.join("، ")}`
            : `Please fill required fields: ${missing.join(", ")}`
        );
        return;
      }
    }
    await saveHeader();
    await saveAllCubes();
    try {
      await submitGroup.mutateAsync({ groupId: group.id });
      toast.success(`${nominalAge}-day results submitted for review`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const avg = calcAvg(cubes);
  const cubeStrengthVals = cubes
    .map(c => parseFloat(c.compressiveStrengthMpa ?? calcStrength(c.maxLoadKN, c.length, c.width)))
    .filter(v => v > 0);
  const strengthBandMilestone = planLocked ? nominalAge : (testAge ?? group.testAge ?? 28);
  const targetMpa = planLocked ? fcMpa : (group.minAcceptable ? parseFloat(group.minAcceptable) : null);
  const testAgeN = strengthBandMilestone;
  const requiredMpa = planLocked && ageResult
    ? ageResult.minStrengthMpa
    : targetMpa != null && testAgeN >= 28
      ? targetMpa
      : targetMpa != null
        ? getRequiredStrength(targetMpa, testAgeN)
        : null;
  const compliance = planLocked && ageResult && ageResult.status !== "invalid"
    ? (cubeStrengthVals.length > 0 && evaluateGroupPass(cubeStrengthVals, ageResult.minStrengthMpa) ? "pass" : cubeStrengthVals.length > 0 ? "fail" : "none")
    : complianceColor(avg, group.minAcceptable, group.maxAcceptable, strengthBandMilestone, cubeStrengthVals);
  const panelActualAge = computePanelActualAge();
  const inputsDisabled = isSubmitted || groupLocked;

  return (
    <Card className={`border-2 ${groupLocked ? "opacity-60" : ""}`}>
      {/* Group Header */}
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg font-bold">
              {group.testAge}-Day Compressive Strength Test
            </CardTitle>
            {group.testedBy && (
              <span className="text-sm text-gray-600 font-normal">
                Tested By: <strong className="text-gray-800">{group.testedBy}</strong>
              </span>
            )}
            {isSubmitted && (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                {group.status === "approved" ? "Approved" : "Submitted"}
              </Badge>
            )}
            {group.status === "draft" && (
              <Badge variant="outline" className="text-yellow-700 border-yellow-400">Draft</Badge>
            )}
          </div>
          <div className="flex items-center gap-4">
            {avg > 0 && (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-gray-500">Avg:</span>
                <span className={compliance === "fail" ? "text-red-600" : compliance === "pass" ? "text-green-600" : "text-gray-700"}>
                  {avg.toFixed(2)} N/mm²
                </span>
                {compliance === "pass" && <CheckCircle className="w-4 h-4 text-green-500" />}
                {compliance === "fail" && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
            )}
            {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          {planLocked && (
            <div className="mb-4 p-3 rounded-lg border bg-gray-50 space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-gray-500">{ar ? "موعد الاستحقاق" : "Due date"}:</span>{" "}
                  <strong>
                    {dueDate
                      ? dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
                      : "—"}
                  </strong>
                  <span className="text-gray-400 ml-1">({nominalAge}-day)</span>
                </div>
                {groupLocked ? (
                  <div className="text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {ar ? `متبقي ${daysUntil} يوم` : `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs text-gray-500">{ar ? "تاريخ الاختبار الفعلي" : "Actual test date"}</Label>
                    <Input
                      type="date"
                      value={testDate}
                      onChange={e => {
                        setTestDate(e.target.value);
                        setCubes(prev => prev.map(c => ({ ...c, dateTested: e.target.value })));
                      }}
                      className="h-8 text-sm w-40 mt-0.5"
                      disabled={inputsDisabled}
                    />
                  </div>
                )}
              </div>
              {!groupLocked && panelActualAge != null && ageResult && (
                <div className="space-y-1 text-xs border-t pt-2">
                  <div>
                    <span className="text-gray-500">{ar ? "العمر الفعلي" : "Actual age"}:</span>{" "}
                    <strong>{panelActualAge} {ar ? "يوم" : "days"}</strong>
                  </div>
                  {ageResult.rangeLabel && (
                    <div>
                      <span className="text-gray-500">{ar ? "النطاق" : "Range"}:</span> {ageResult.rangeLabel}
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">{ar ? "عامل القوة" : "Strength factor"}:</span>{" "}
                    <strong>{ageResult.factorPct}%</strong>
                    {ageResult.interpolated && (
                      <span className="text-amber-600 ml-1">({ageResult.message})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">{ar ? "الحد الأدنى المطلوب" : "Min required"}:</span>{" "}
                    <strong>{ageResult.minStrengthMpa.toFixed(1)} N/mm²</strong>
                  </div>
                  {ageResult.status === "invalid" && (
                    <div className="text-red-600 font-semibold flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      {ageResult.message}
                    </div>
                  )}
                  {ageResult.status === "beyond90" && (
                    <div className="text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {ageResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Expandable header info — legacy orders only */}
          {!planLocked && <div className="mb-4">
            <button
              className="text-sm text-blue-600 underline flex items-center gap-1"
              onClick={() => setHeaderExpanded(h => !h)}
            >
              <Info className="w-3 h-3" />
              {headerExpanded ? "Hide" : "Show"} additional header info
            </button>
            {headerExpanded && (
              <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border">
                <div>
                  <Label className="text-xs">{ar ? "مصدر/مورد الخرسانة" : "Concrete Source/Supplier"} <span className="text-red-600">*</span></Label>
                  <Input value={sourceSupplier} onChange={e => setSourceSupplier(e.target.value)} className="h-8 text-sm" placeholder={ar ? "مثال: مورد الخرسانة" : "e.g. Gulf Readymix"} disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">
                    Date of Casting
                    {castingLocked && <span className="text-blue-600 font-normal ml-1">(from reception)</span>}
                  </Label>
                  <Input
                    type="date"
                    value={castingLocked ? (castingIso ?? "") : batchDateTime}
                    onChange={e => setBatchDateTime(e.target.value)}
                    className="h-8 text-sm"
                    disabled={isSubmitted || castingLocked}
                  />
                  {castingLocked && (
                    <p className="text-[10px] text-gray-500 mt-0.5">Synced with sample registration. If missing at reception, unlock by clearing casting date on sample.</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">{ar ? "درجة الخرسانة" : "Class of Concrete"} <span className="text-red-600">*</span></Label>
                  <Input value={classOfConcrete} onChange={e => setClassOfConcrete(e.target.value)} className="h-8 text-sm" placeholder="e.g. C30 / C40" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">{ar ? "الهطول (مم)" : "Slump (mm)"} <span className="text-red-600">*</span></Label>
                  <Input value={slump} onChange={e => setSlump(e.target.value)} className="h-8 text-sm" placeholder="e.g. 120" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">{ar ? "أقصى حجم للركام (مم)" : "Maximum Aggregate Size (mm)"} <span className="text-red-600">*</span></Label>
                  <Input value={maxAggSize} onChange={e => setMaxAggSize(e.target.value)} className="h-8 text-sm" placeholder="e.g. 20" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">Region</Label>
                  <Input value={region} onChange={e => setRegion(e.target.value)} className="h-8 text-sm" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">Consultant</Label>
                  <Input value={consultant} onChange={e => setConsultant(e.target.value)} className="h-8 text-sm" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">CSC Ref.</Label>
                  <Input value={cscRef} onChange={e => setCscRef(e.target.value)} className="h-8 text-sm" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">{ar ? "مكان أخذ العينة" : "Place of Sampling"} <span className="text-red-600">*</span></Label>
                  <Input value={placeOfSampling} onChange={e => setPlaceOfSampling(e.target.value)} className="h-8 text-sm" disabled={isSubmitted} />
                </div>
                <div>
                  <Label className="text-xs">Location</Label>
                  <Input value={location} onChange={e => setLocation(e.target.value)} className="h-8 text-sm" disabled={isSubmitted} />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={saveHeader} disabled={isSubmitted}>
                    <Save className="w-3 h-3 mr-1" /> Save Header
                  </Button>
                </div>
              </div>
            )}
          </div>}

          {/* Calculation Details */}
          {!planLocked && group.minAcceptable && (
            <div className="mb-3 text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-blue-800 mb-2">
                <Info className="w-4 h-4 shrink-0" />
                Calculation Details ({group.testAge}-Day Test)
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700">
                <div><span className="text-gray-500">Nominal cube:</span> <strong>{group.nominalCubeSize ?? "150mm"}</strong></div>
                <div><span className="text-gray-500">Target Strength (f_ck):</span> <strong>{group.minAcceptable} N/mm²</strong></div>
                <div><span className="text-gray-500">Gross surface area (L×W):</span> <strong>{(defaultEdge === "100" ? 10000 : 22500).toLocaleString()} mm²</strong></div>
                <div><span className="text-gray-500">Max Load Formula:</span> <span className="font-mono">f × Area / 1000</span></div>
                <div><span className="text-gray-500">Reference max load @ f_ck:</span>{" "}
                  <strong>{(parseFloat(group.minAcceptable) * (defaultEdge === "100" ? 10000 : 22500) / 1000).toFixed(0)} kN</strong></div>
                <div className="col-span-2 border-t pt-1 mt-1">
                  <span className="text-gray-500">Acceptance (BS EN 12390-3 / 206):</span>{" "}
                  <strong className="text-blue-700">
                    {strengthBandMilestone >= 28
                      ? `Average ≥ ${parseFloat(group.minAcceptable).toFixed(1)} N/mm²; each cube ≥ ${(parseFloat(group.minAcceptable) - 4).toFixed(1)} N/mm²`
                      : getRequiredLabel(parseFloat(group.minAcceptable), strengthBandMilestone)}
                  </strong>
                </div>
                {group.testAge && group.testAge < 28 && (
                  <div className="col-span-2 text-orange-600">
                    ⚠ At {group.testAge} days, concrete is expected to reach{" "}
                    {group.testAge <= 7 ? "65–70%" : group.testAge <= 14 ? "~85%" : "~92%"} of 28-day strength.
                  </div>
                )}
              </div>
            </div>
          )}

          {!planLocked && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <label className="block text-sm font-semibold mb-2">
                {lang === "ar" ? "عمر الاختبار *" : "Test Age *"}
                <span className="text-red-600">{lang === "ar" ? " (مطلوب)" : " (required)"}</span>
              </label>
              <div className="flex flex-wrap gap-4 mb-3">
                {[7, 14, 28].map(age => (
                  <label key={age} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`testAge-${group.id}`}
                      value={age}
                      checked={testAge === age}
                      onChange={() => setTestAge(age)}
                      disabled={isSubmitted}
                    />
                    <span>{age}-{lang === "ar" ? "يوم" : "Day"}</span>
                  </label>
                ))}
              </div>
              {testAge != null && (
                <div className={`p-2 rounded text-sm ${panelActualAge != null && panelActualAge > testAge + 5 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                  {lang === "ar" ? "العمر الفعلي:" : "Current Age:"}
                  <strong className="ml-2">{panelActualAge != null ? `${panelActualAge} ${lang === "ar" ? "يوم" : "days"}` : "—"}</strong>
                </div>
              )}
            </div>
          )}

          {planLocked && fcMpa > 0 && (
            <div className="mb-3 text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 font-semibold text-blue-800 mb-1">
                <Info className="w-4 h-4" />
                BS 1881 — {nominalAge}-Day Group
              </div>
              <div className="text-xs text-gray-700 grid grid-cols-2 gap-x-4">
                <div><LockedLabel>{ar ? "مقاومة التصميم" : "Design strength"}</LockedLabel> <strong>{fcMpa} N/mm²</strong></div>
                <div><LockedLabel>{ar ? "حجم المكعب" : "Cube size"}</LockedLabel> <strong>{edgeMmNum} mm</strong></div>
                <div><span className="text-gray-500">{ar ? "مساحة الوجه" : "Face area"}:</span> <strong>{cubeAreaMm2(edgeMmNum).toLocaleString()} mm²</strong></div>
                <div><span className="text-gray-500">{ar ? "عدد المكعبات" : "Cube count"}:</span> <strong>{cubes.length}</strong> <LockedLabel>{ar ? "محدد عند الاستقبال" : "Set at reception"}</LockedLabel></div>
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-center w-8">Mark</th>
                  {!planLocked && <th className="border px-2 py-1 text-center">Cube ID</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center bg-orange-50">Age (days)</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center">L × W × H (mm)</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center">Mass (kg)</th>}
                  <th className="border px-2 py-1 text-center bg-yellow-50">Load (kN) *</th>
                  <th className="border px-2 py-1 text-center bg-blue-50">Strength (N/mm²)</th>
                  <th className="border px-2 py-1 text-center">Fracture</th>
                  {planLocked && <th className="border px-2 py-1 text-center w-16">Pass</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center bg-blue-50">Density (kg/m³)</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center w-20 bg-green-50">Within Spec ✓</th>}
                  {!planLocked && <th className="border px-2 py-1 text-center w-16">Action</th>}
                </tr>
              </thead>
              <tbody>
                {cubes.map((cube, idx) => {
                  const strength = cube.compressiveStrengthMpa || calcStrength(cube.maxLoadKN, cube.length, cube.width);
                  const density = cube.densityKgM3 || calcDensity(cube.massKg, cube.length, cube.width, cube.height);
                  const strengthVal = parseFloat(strength);
                  const minV = planLocked && ageResult ? ageResult.minStrengthMpa : (group.minAcceptable ? parseFloat(group.minAcceptable) : null);
                  const castingDateStr = distCastingDate
                    ? (distCastingDate instanceof Date ? distCastingDate.toISOString() : String(distCastingDate))
                    : (group.batchDateTime ? group.batchDateTime.split(' ')[0] : null);
                  const actualAge = planLocked ? panelActualAge : calcCubeAge(castingDateStr, cube.dateTested);
                  const effectiveAge =
                    actualAge !== null && !planLocked
                      ? getEffectiveAge(actualAge, strengthBandMilestone)
                      : strengthBandMilestone;
                  const requiredV = planLocked && ageResult
                    ? ageResult.minStrengthMpa
                    : minV ? getRequiredStrength(minV, effectiveAge) : null;
                  const rowFail = (() => {
                    if (!strength || (!planLocked && cube.withinSpec === true)) return false;
                    if (planLocked && ageResult) {
                      return !evaluateCubePass(strengthVal, ageResult.minStrengthMpa);
                    }
                    if (strengthBandMilestone >= 28 && minV != null) return strengthVal < minV - 4;
                    if (requiredV != null) return strengthVal < requiredV;
                    return false;
                  })();
                  const rowPass = strengthVal > 0 && requiredV != null && !rowFail;

                  return (
                    <tr key={idx} className={rowFail ? "bg-red-50" : ""}>
                      <td className="border px-1 py-1 text-center font-bold text-gray-600">{cube.markNo}</td>
                      {!planLocked && (
                        <td className="border px-1 py-1">
                          <Input value={cube.cubeId} onChange={e => updateCube(idx, "cubeId", e.target.value)}
                            className="h-7 text-xs w-20" disabled={inputsDisabled} />
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1 bg-orange-50 text-center text-xs font-mono font-semibold text-gray-700">
                          {actualAge !== null ? `${actualAge} ${ar ? "يوم" : "days"}` : "—"}
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1">
                          <div className="h-7 text-xs flex items-center justify-center font-mono text-gray-700 bg-gray-50 border rounded">
                            {defaultEdge} × {defaultEdge} × {defaultEdge}
                          </div>
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1">
                          <Input value={cube.massKg} onChange={e => updateCube(idx, "massKg", e.target.value)}
                            className="h-7 text-xs w-20" placeholder="kg" disabled={inputsDisabled} />
                        </td>
                      )}
                      <td className="border px-1 py-1 bg-yellow-50">
                        <Input value={cube.maxLoadKN} onChange={e => updateCube(idx, "maxLoadKN", e.target.value)}
                          className="h-7 text-xs w-24 font-semibold border-yellow-400" placeholder="kN" disabled={inputsDisabled} />
                      </td>
                      <td className={`border px-1 py-1 bg-blue-50 text-center text-xs font-mono font-bold ${rowFail ? "text-red-600" : strength ? "text-green-700" : ""}`}>
                        {strength || "—"}
                      </td>
                      <td className="border px-1 py-1">
                        <Select value={cube.fractureType} onValueChange={v => updateCube(idx, "fractureType", v)} disabled={inputsDisabled}>
                          <SelectTrigger className="h-7 text-xs w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(planLocked ? FRACTURE_TYPE_OPTIONS : ["SF", "USF"]).map(ft => (
                              <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {planLocked && (
                        <td className="border px-1 py-1 text-center text-xs">
                          {strengthVal > 0 && (
                            rowPass
                              ? <span className="text-green-600 font-bold">✓</span>
                              : <span className="text-red-600 font-bold">✗</span>
                          )}
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1 bg-blue-50 text-center text-xs text-gray-600 font-mono">
                          {density || "—"}
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1 text-center bg-green-50">
                          <button
                            type="button"
                            disabled={inputsDisabled}
                            onClick={() => {
                              const next = cube.withinSpec === true ? null : true;
                              setCubes(prev => {
                                const arr = [...prev];
                                arr[idx] = { ...arr[idx], withinSpec: next };
                                return arr;
                              });
                            }}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                              cube.withinSpec === true
                                ? 'bg-green-500 border-green-600 text-white'
                                : 'bg-white border-gray-300 text-transparent hover:border-green-400'
                            } ${inputsDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            ✓
                          </button>
                        </td>
                      )}
                      {!planLocked && (
                        <td className="border px-1 py-1 text-center">
                          {!isSubmitted && (
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => saveSingleCube(idx)} disabled={saving === idx}>
                                <Save className="w-3 h-3 text-blue-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => removeRow(idx)}>
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {/* Average row */}
              {avg > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={planLocked ? 3 : 10} className="border px-2 py-1 text-right text-sm">Average Compressive Strength:</td>
                    <td className={`border px-2 py-1 text-center text-sm font-mono ${compliance === "fail" ? "text-red-600" : "text-green-700"}`}>
                      {avg.toFixed(2)} N/mm²
                    </td>
                    <td colSpan={planLocked ? 2 : 3} className="border px-2 py-1 text-center">
                      {compliance === "pass" && <span className="text-green-600 text-xs font-bold">✓ PASS</span>}
                      {compliance === "fail" && (
                        <div className="text-red-600 text-xs font-bold">
                          ✗ FAIL
                          {requiredMpa && <div className="font-normal text-gray-500">Required: {requiredMpa.toFixed(1)}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Comments */}
          <div className="mt-4">
            <Label className="text-sm font-medium">Comments / Remarks</Label>
            <Textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              className="mt-1 text-sm"
              rows={2}
              placeholder="Add any observations or remarks..."
              disabled={isSubmitted}
            />
          </div>

          {/* Actions */}
          {!isSubmitted && !groupLocked && (
            <div className="mt-4 flex flex-wrap gap-2 justify-between items-center">
              {!planLocked && (
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="w-4 h-4 mr-1" /> Add Cube
                </Button>
              )}
              <div className={`flex gap-2 ${planLocked ? "ml-auto" : ""}`}>
                <Button variant="outline" size="sm" onClick={saveAllCubes}>
                  <Save className="w-4 h-4 mr-1" /> Save All
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit}
                  disabled={
                    submitGroup.isPending
                    || cubes.filter(c => c.maxLoadKN).length === 0
                    || (planLocked && ageResult?.status === "invalid")
                  }>
                  <Send className="w-4 h-4 mr-1" />
                  {submitGroup.isPending ? "Submitting..." : "Submit for Review"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ConcreteTest() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const distId = parseInt(distributionId ?? "0");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [newAge, setNewAge] = useState("28");
  const [showAddAge, setShowAddAge] = useState(false);
  const [nominalCubeSize, setNominalCubeSize] = useState("150mm");
  const ensuredRef = useRef(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: distId > 0 }
  );

  const receptionPlan = distribution?.testSubType
    ? parseConcCubePlan(distribution.testSubType)
    : null;

  const { data: groups = [], refetch } = trpc.concrete.groupsByDistribution.useQuery(
    { distributionId: distId },
    { enabled: distId > 0 }
  );

  const createGroup = trpc.concrete.createGroup.useMutation();
  const ensureGroups = trpc.concrete.ensureReceptionGroups.useMutation();

  useEffect(() => {
    if (!distId || !receptionPlan || ensuredRef.current) return;
    ensuredRef.current = true;
    ensureGroups.mutateAsync({ distributionId: distId })
      .then(() => refetch())
      .catch(() => { ensuredRef.current = false; });
  }, [distId, receptionPlan]);

  const handleAddAge = async () => {
    const age = parseInt(newAge);
    if (!age || age <= 0) { toast.error("Enter a valid age in days"); return; }
    if (groups.some((g: any) => g.testAge === age)) {
      toast.error(`A ${age}-day group already exists`);
      return;
    }
    try {
      await createGroup.mutateAsync({
        distributionId: distId,
        sampleId: distribution?.sampleId ?? 0,
        testAge: age,
        minAcceptable: distribution?.minAcceptable ?? undefined,
        maxAcceptable: distribution?.maxAcceptable ?? undefined,
        nominalCubeSize: distribution?.nominalCubeSize ?? nominalCubeSize,
      });
      toast.success(`${age}-day test group created`);
      setShowAddAge(false);
      setNewAge("28");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handlePrintReport = () => {
    navigate(`/concrete-report/${distId}`);
  };

  if (!distId) return <DashboardLayout><div className="p-8 text-center text-gray-500">Invalid distribution ID</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Concrete Compression Test
            </h1>
            {distribution && (
              <p className="text-sm text-gray-500 mt-1">
                Distribution: <strong>{distribution.distributionCode}</strong> &nbsp;|&nbsp;
                Sample: <strong>{distribution.sampleId}</strong> &nbsp;|&nbsp;
                Test: <strong>{distribution.testName}</strong>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintReport} disabled={groups.length === 0}>
              <Printer className="w-4 h-4 mr-2" /> View Report
            </Button>
          </div>
        </div>

        {/* Sample Info Card */}
        {distribution && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="pt-4 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-500">Contract No:</span> <strong>{distribution.contractNumber ?? distribution.sampleId}</strong></div>
                <div><span className="text-gray-500">Priority:</span> <strong className="capitalize">{distribution.priority}</strong></div>
                <div>
                  <span className="text-gray-500">Design Strength (f'c):</span>{" "}
                  <strong>{receptionPlan?.designStrength ?? distribution.minAcceptable ?? "—"} N/mm²</strong>
                  {receptionPlan && <LockedLabel>Set at reception</LockedLabel>}
                </div>
                <div>
                  <span className="text-gray-500">Cube Size:</span>{" "}
                  <strong>{receptionPlan ? `${receptionPlan.cubeSizeMm} mm` : (distribution.nominalCubeSize ?? "150mm")}</strong>
                  {receptionPlan && <LockedLabel>Set at reception</LockedLabel>}
                </div>
                {distribution.castingDate && (
                  <div className="col-span-2 md:col-span-4 border-t pt-2 mt-1">
                    <span className="text-gray-500">Date of Casting:</span>{" "}
                    <strong className="text-blue-700">
                      {new Date(distribution.castingDate).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </strong>
                    {receptionPlan && <LockedLabel>Set at reception</LockedLabel>}
                    <span className="text-xs text-gray-400 ml-2">(used for age calculation)</span>
                  </div>
                )}
                {receptionPlan && (
                  <div className="col-span-2 md:col-span-4 text-xs text-gray-600">
                    <span className="text-gray-500">Age groups:</span>{" "}
                    {receptionPlan.ageGroups.map(g => `${g.nominalAge}d × ${g.cubeCount}`).join(", ")}
                    <LockedLabel>Set at reception</LockedLabel>
                  </div>
                )}
              </div>
              {distribution.notes && (
                <p className="text-xs text-gray-500 mt-2 italic">Notes: {distribution.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Age Groups */}
        {groups.length === 0 ? (
          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="py-12 text-center">
              <FlaskConical className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              {receptionPlan ? (
                <p className="text-gray-500">Loading age groups from reception plan…</p>
              ) : (
                <>
                  <p className="text-gray-500 mb-4">No test age groups yet. Add your first age group to start entering results.</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      value={newAge}
                      onChange={e => setNewAge(e.target.value)}
                      className="w-24 text-center"
                      placeholder="Days"
                      min={1}
                    />
                    <span className="text-sm text-gray-500">days</span>
                    <select
                      value={nominalCubeSize}
                      onChange={e => setNominalCubeSize(e.target.value)}
                      className="h-9 text-sm border rounded px-2"
                    >
                      <option value="150mm">150mm cube</option>
                      <option value="100mm">100mm</option>
                    </select>
                    <Button onClick={handleAddAge} disabled={createGroup.isPending}>
                      <Plus className="w-4 h-4 mr-1" />
                      {createGroup.isPending ? "Creating..." : "Add Age Group"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(groups as any[]).map((group: any) => (
              <GroupPanel
                key={group.id}
                group={group}
                distributionId={distId}
                onRefresh={refetch}
                castingDate={distribution?.castingDate}
                distributionNominalCube={distribution?.nominalCubeSize}
                receptionPlan={receptionPlan}
              />
            ))}

            {!receptionPlan && (
              <Card className="border-dashed border-2 border-gray-200">
                <CardContent className="py-4">
                  {showAddAge ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-sm whitespace-nowrap">Add age group:</Label>
                      <Input
                        type="number"
                        value={newAge}
                        onChange={e => setNewAge(e.target.value)}
                        className="w-24 text-center"
                        placeholder="Days"
                        min={1}
                      />
                      <span className="text-sm text-gray-500">days</span>
                      <select
                        value={nominalCubeSize}
                        onChange={e => setNominalCubeSize(e.target.value)}
                        className="h-8 text-sm border rounded px-2"
                      >
                        <option value="150mm">150mm</option>
                        <option value="100mm">100mm</option>
                      </select>
                      <Button size="sm" onClick={handleAddAge} disabled={createGroup.isPending}>
                        <Plus className="w-4 h-4 mr-1" />
                        {createGroup.isPending ? "..." : "Add"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddAge(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      className="w-full text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-2"
                      onClick={() => setShowAddAge(true)}
                    >
                      <Plus className="w-4 h-4" /> Add another age group (e.g. 7-day, 14-day, 28-day)
                    </button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 p-3 bg-gray-50 rounded-lg border text-xs text-gray-500">
          <strong>Legend:</strong> &nbsp;
          <span className="bg-yellow-50 px-1 rounded">Yellow = Input field (required)</span> &nbsp;
          <span className="bg-blue-50 px-1 rounded">Blue = Auto-calculated</span> &nbsp;
          SF = Satisfactory Fracture &nbsp; USF = Unsatisfactory Fracture &nbsp; Type 1–6 = BS fracture types
        </div>
      </div>
    </DashboardLayout>
  );
}
