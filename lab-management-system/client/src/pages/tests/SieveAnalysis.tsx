import { useState, useEffect } from "react";
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Grading Limits (BS 882 / BS EN 12620) ───────────────────────────────────
const GRADING_LIMITS: Record<string, { sieves: string[]; lower: number[]; upper: number[] }> = {
  // Coarse aggregate 40mm — BS 882 / BS EN 12620
  "COARSE_40": {
    sieves: ["50", "37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,   90,    35,   20,   10,   0,    0,    0,      0,     0,    0,    0],
    upper:  [100,   100,   70,   55,   40,   15,   5,    5,      5,     5,    5,    5],
  },
  // Coarse aggregate 20mm — BS 882 / BS EN 12620 (includes 6.3mm sieve)
  "COARSE_20": {
    sieves: ["37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,    90,   50,   15,   0,    0,    0,      0,      0,    0,    0],
    upper:  [100,    100,  90,   55,   20,   10,   5,      5,      5,    5,    5],
  },
  // Fine aggregate (sand) — BS 882 (includes 5.0mm sieve)
  "FINE_SAND": {
    sieves: ["9.5", "5.0", "4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,    95,    90,     80,     50,     25,    10,    2],
    upper:  [100,    100,   100,    100,    85,     60,    30,    10],
  },
  "MORTAR_SAND": {
    sieves: ["4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,     95,     70,     40,    10,    2],
    upper:  [100,     100,    100,    85,    60,    20],
  },
  // Plaster Sand — BS 1199 Table 1 (Type A & B combined envelope)
  // BS sieve sizes: 6.30, 5.00, 2.36, 1.18mm + 600, 300, 150, 75µm
  // Type A: 100 | 95-100 | 60-100 | 30-100 | 15-80 | 5-40 | 0-20 | 0-5
  // Type B: 100 | 95-100 | 80-100 | 70-100 | 55-100 | 5-75 | 0-20 | not>5
  // Using Type A limits (more restrictive, standard for plastering)
  "PLASTER_SAND": {
    sieves: ["6.30", "5.00", "2.36", "1.18", "0.600", "0.300", "0.150", "0.075"],
    lower:  [100,    95,     60,     30,     15,      5,       0,       0],
    upper:  [100,    100,    100,    100,    80,      40,      20,      5],
  },
  // Masonry Sand — ASTM C144 Table 1
  // Sieve sizes: 9.5mm, 4.75mm, 2.36mm, 1.18mm, 600µm, 300µm, 150µm
  "MASONRY_SAND": {
    sieves: ["9.5", "4.75", "2.36", "1.18", "0.600", "0.300", "0.150"],
    lower:  [100,    95,     70,     40,     10,      2,       0],
    upper:  [100,    100,    100,    85,     60,      30,      10],
  },
  // ASTM C33 / C136 style stacks (simplified envelope limits for lab QA — verify against project spec)
  "ASTM_COARSE_NO57": {
    sieves: ["37.5", "25", "19", "12.5", "9.5", "4.75", "2.36"],
    lower:  [100,   95,  35,  10,   0,    0,    0],
    upper:  [100,   100, 100, 90,   60,   25,   5],
  },
  "ASTM_FINE_CONCRETE": {
    sieves: ["9.5", "4.75", "2.36", "1.18", "0.6", "0.3", "0.15"],
    lower:  [100,  95,   80,   50,   25,   10,   2],
    upper:  [100,  100,  100,  85,   60,   30,   10],
  },
};

type GradingType = keyof typeof GRADING_LIMITS;

const BS_GRADING_KEYS = [
  "COARSE_40",
  "COARSE_20",
  "FINE_SAND",
  "PLASTER_SAND",
] as const satisfies readonly GradingType[];

const ASTM_GRADING_KEYS = [
  "ASTM_COARSE_NO57",
  "ASTM_FINE_CONCRETE",
  "MASONRY_SAND",
  "MORTAR_SAND",
] as const satisfies readonly GradingType[];

// ─── Blended sand (White + Black) — ASTM C144 vs BS 1199:76 Type A ───────────
type BlendStandardKey = "ASTM_C144" | "BS_1199_A";

/** Spec limits per row: [upper %, lower %] passing per sieve. */
const BLEND_SIEVE_STACK: Record<BlendStandardKey, { sieveMm: string; upperLimit: number; lowerLimit: number }[]> = {
  ASTM_C144: [
    { sieveMm: "9.5", upperLimit: 100, lowerLimit: 100 },
    { sieveMm: "4.75", upperLimit: 100, lowerLimit: 95 },
    { sieveMm: "2.36", upperLimit: 100, lowerLimit: 70 },
    { sieveMm: "1.18", upperLimit: 75, lowerLimit: 40 },
    { sieveMm: "0.6", upperLimit: 40, lowerLimit: 20 },
    { sieveMm: "0.3", upperLimit: 25, lowerLimit: 10 },
    { sieveMm: "0.15", upperLimit: 10, lowerLimit: 0 },
  ],
  BS_1199_A: [
    { sieveMm: "5", upperLimit: 100, lowerLimit: 100 },
    { sieveMm: "2.36", upperLimit: 88, lowerLimit: 80 },
    { sieveMm: "1.18", upperLimit: 86, lowerLimit: 70 },
    { sieveMm: "0.6", upperLimit: 90, lowerLimit: 55 },
    { sieveMm: "0.3", upperLimit: 62, lowerLimit: 5 },
    { sieveMm: "0.15", upperLimit: 17, lowerLimit: 0 },
    { sieveMm: "0.075", upperLimit: 3.8, lowerLimit: 0 },
  ],
};

interface BlendSieveRow {
  sieveMm: string;
  upperLimit: number;
  lowerLimit: number;
  whiteSandUsed: string;
  whiteSandOriginalPass: string;
  blackSandUsed: string;
  blackSandOriginalPass: string;
}

function emptyBlendRows(standard: BlendStandardKey): BlendSieveRow[] {
  return BLEND_SIEVE_STACK[standard].map(r => ({
    sieveMm: r.sieveMm,
    upperLimit: r.upperLimit,
    lowerLimit: r.lowerLimit,
    whiteSandUsed: "",
    whiteSandOriginalPass: "",
    blackSandUsed: "",
    blackSandOriginalPass: "",
  }));
}

/**
 * The Blend = White Used % + Black Used % (Excel-style).
 */
function calculateBlend(whiteUsedStr: string, blackUsedStr: string): number {
  const white = parseFloat(whiteUsedStr) || 0;
  const black = parseFloat(blackUsedStr) || 0;
  return white + black;
}

function mergeBlendRowsFromSaved(
  standard: BlendStandardKey,
  saved: Array<Record<string, unknown>>,
): BlendSieveRow[] {
  const template = emptyBlendRows(standard);
  const bySieve = new Map(saved.map(r => [String(r.sieveMm ?? r.sieve), r]));
  return template.map(row => {
    const s = bySieve.get(row.sieveMm);
    if (!s) return row;
    return {
      ...row,
      whiteSandUsed: s.whiteSandUsed != null && s.whiteSandUsed !== "" ? String(s.whiteSandUsed) : "",
      whiteSandOriginalPass:
        s.whiteSandOriginalPass != null && s.whiteSandOriginalPass !== ""
          ? String(s.whiteSandOriginalPass)
          : s.whiteSandOriginal != null && s.whiteSandOriginal !== ""
            ? String(s.whiteSandOriginal)
            : "",
      blackSandUsed: s.blackSandUsed != null && s.blackSandUsed !== "" ? String(s.blackSandUsed) : "",
      blackSandOriginalPass:
        s.blackSandOriginalPass != null && s.blackSandOriginalPass !== ""
          ? String(s.blackSandOriginalPass)
          : s.blackSandOriginal != null && s.blackSandOriginal !== ""
            ? String(s.blackSandOriginal)
            : "",
    };
  });
}

interface SieveRow {
  sieve: string;
  massRetained: string;
  // computed
  pctRetained?: number;      // % محتجز جزئي
  cumRetained?: number;      // % محتجز تراكمي
  cumPassing?: number;       // % مار تراكمي
  lower?: number;
  upper?: number;
  withinLimits?: boolean;
}

function computeSieveData(rows: SieveRow[], totalMass: number, limits: typeof GRADING_LIMITS[GradingType]): SieveRow[] {
  let cumRetainedG = 0;
  return rows.map((row, idx) => {
    const mass = parseFloat(row.massRetained) || 0;
    cumRetainedG += mass;
    const pctRetained = totalMass > 0 ? (mass / totalMass) * 100 : undefined;
    const cumPassing = totalMass > 0 ? ((totalMass - cumRetainedG) / totalMass) * 100 : undefined;
    const lower = limits.lower[idx];
    const upper = limits.upper[idx];
    const withinLimits = cumPassing !== undefined ? cumPassing >= lower && cumPassing <= upper : undefined;
    return {
      ...row,
      pctRetained: pctRetained !== undefined ? parseFloat(pctRetained.toFixed(1)) : undefined,
      cumRetained: totalMass > 0 ? parseFloat(((cumRetainedG / totalMass) * 100).toFixed(1)) : undefined,
      cumPassing: cumPassing !== undefined ? parseFloat(cumPassing.toFixed(1)) : undefined,
      lower,
      upper,
      withinLimits,
    };
  });
}

function gradingKeysForStandard(std: "BS" | "ASTM"): GradingType[] {
  return std === "BS" ? [...BS_GRADING_KEYS] : [...ASTM_GRADING_KEYS];
}

export default function SieveAnalysis() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const isMortarSandDist = dist?.testType === "CONC_MORTAR_SAND";
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  const [sieveStandard, setSieveStandard] = useState<"BS" | "ASTM">("BS");
  const [gradingType, setGradingType] = useState<GradingType>("COARSE_20");
  const [totalMassStr, setTotalMassStr] = useState("1000");
  const [panMass, setPanMass] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [testMode, setTestMode] = useState<"single" | "blend">("single");
  const [blendStandard, setBlendStandard] = useState<BlendStandardKey>("ASTM_C144");
  const [blendRows, setBlendRows] = useState<BlendSieveRow[]>(() => emptyBlendRows("ASTM_C144"));

  const updateBlendRow = (
    sieveMm: string,
    field: "whiteSandUsed" | "whiteSandOriginalPass" | "blackSandUsed" | "blackSandOriginalPass",
    value: string,
  ) => {
    setBlendRows(prev =>
      prev.map(row => (row.sieveMm === sieveMm ? { ...row, [field]: value } : row)),
    );
  };

  // Keep grading type consistent with BS/ASTM list (avoids Radix Select crash if value ∉ items)
  useEffect(() => {
    if (isMortarSandDist) return;
    const keys = gradingKeysForStandard(sieveStandard);
    if (keys.includes(gradingType)) return;
    const next = keys[0];
    setGradingType(next);
    setMassRetained(Object.fromEntries(GRADING_LIMITS[next].sieves.map(s => [s, ""])));
  }, [sieveStandard, gradingType, isMortarSandDist]);

  useEffect(() => {
    if (!isMortarSandDist || !dist?.testSubType || existing?.formData) return;
    if (dist.testSubType === "masonry_sand") {
      setSieveStandard("ASTM");
      setGradingType("MASONRY_SAND");
      setMassRetained(Object.fromEntries(GRADING_LIMITS.MASONRY_SAND.sieves.map(s => [s, ""])));
    } else {
      setSieveStandard("BS");
      setGradingType("PLASTER_SAND");
      setMassRetained(Object.fromEntries(GRADING_LIMITS.PLASTER_SAND.sieves.map(s => [s, ""])));
    }
  }, [isMortarSandDist, dist?.testSubType, dist?.id, existing?.formData]);

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    if (fd.testMode === "blend") {
      setTestMode("blend");
      const std = fd.blendStandard === "BS_1199_A" ? "BS_1199_A" : "ASTM_C144";
      setBlendStandard(std);
      const saved = Array.isArray(fd.sieveData) ? (fd.sieveData as Array<Record<string, unknown>>) : [];
      setBlendRows(mergeBlendRowsFromSaved(std, saved));
    } else {
      setTestMode("single");
    }
    let std: "BS" | "ASTM" | null =
      fd.sieveStandard === "BS" || fd.sieveStandard === "ASTM" ? fd.sieveStandard : null;
    const gt0 = fd.gradingType as GradingType | undefined;
    if (!std && gt0) {
      if ((BS_GRADING_KEYS as readonly string[]).includes(gt0)) std = "BS";
      else if ((ASTM_GRADING_KEYS as readonly string[]).includes(gt0)) std = "ASTM";
    }
    if (std) setSieveStandard(std);
    const ms = fd.mortarSandSubtype as string | undefined;
    if (ms === "MASONRY_SAND") {
      setSieveStandard("ASTM");
      setGradingType("MASONRY_SAND");
    } else if (ms === "PLASTER_SAND") {
      setSieveStandard("BS");
      setGradingType("PLASTER_SAND");
    }
    const gt = fd.gradingType as GradingType | undefined;
    if (gt && GRADING_LIMITS[gt]) {
      setGradingType(gt);
      const lim = GRADING_LIMITS[gt];
      const map: Record<string, string> = {};
      if (Array.isArray(fd.rows)) {
        for (const r of fd.rows as Array<{ sieve?: string; massRetained?: string | number }>) {
          if (r.sieve != null) {
            map[String(r.sieve)] =
              r.massRetained != null && r.massRetained !== "" ? String(r.massRetained) : "";
          }
        }
      }
      setMassRetained(Object.fromEntries(lim.sieves.map(s => [s, map[s] ?? ""])));
    }
    if (fd.totalMass != null && fd.totalMass !== "") setTotalMassStr(String(fd.totalMass));
    if (fd.panMass != null && fd.panMass !== "") setPanMass(String(fd.panMass));
    if (typeof fd.source === "string") setSource(fd.source);
    if (typeof existing.notes === "string" && existing.notes) setNotes(existing.notes);
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const limits = GRADING_LIMITS[gradingType];
  const [massRetained, setMassRetained] = useState<Record<string, string>>(
    Object.fromEntries(limits.sieves.map(s => [s, ""]))
  );

  const totalMass = parseFloat(totalMassStr) || 0;
  const rows: SieveRow[] = limits.sieves.map(s => ({
    sieve: s,
    massRetained: massRetained[s] ?? "",
  }));
  const computedRows = computeSieveData(rows, totalMass, limits);

  const blendAllUsedFilled =
    testMode === "blend" &&
    blendRows.every(r => r.whiteSandUsed.trim() !== "" && r.blackSandUsed.trim() !== "");
  const blendAnyUsed =
    testMode === "blend" &&
    blendRows.some(
      r =>
        r.whiteSandUsed.trim() !== "" ||
        r.blackSandUsed.trim() !== "" ||
        r.whiteSandOriginalPass.trim() !== "" ||
        r.blackSandOriginalPass.trim() !== "",
    );
  const blendWithinSpec =
    testMode === "blend" &&
    blendRows.every(row => {
      const blend = calculateBlend(row.whiteSandUsed, row.blackSandUsed);
      return blend >= row.lowerLimit && blend <= row.upperLimit;
    });
  const passesBlendSpec = blendAllUsedFilled && blendWithinSpec;

  const blendChartData =
    testMode === "blend"
      ? blendRows.map(row => ({
          sieveLabel: row.sieveMm,
          whiteUsed: parseFloat(row.whiteSandUsed) || 0,
          blackUsed: parseFloat(row.blackSandUsed) || 0,
          blend: calculateBlend(row.whiteSandUsed, row.blackSandUsed),
          specUpper: row.upperLimit,
          specLower: row.lowerLimit,
        }))
      : [];

  // Fineness Modulus (for sand)
  const fmSieves = ["4.75", "2.36", "1.18", "0.6", "0.3", "0.15"];
  const fm = computedRows
    .filter(r => fmSieves.includes(r.sieve) && r.cumRetained !== undefined)
    .reduce((s, r) => s + (r.cumRetained ?? 0), 0) / 100;

  const allWithinLimits = computedRows.every(r => r.withinLimits !== false);
  const anyComputed = computedRows.some(r => r.cumPassing !== undefined);
  const singleOverallResult: "pass" | "fail" | "pending" =
    !anyComputed ? "pending" : allWithinLimits ? "pass" : "fail";

  const blendOverallResult: "pass" | "fail" | "pending" =
    !blendAnyUsed ? "pending" : !blendAllUsedFilled ? "pending" : passesBlendSpec ? "pass" : "fail";

  const overallResult = testMode === "blend" ? blendOverallResult : singleOverallResult;

  // Chart data
  const chartData = computedRows.map(r => ({
    sieve: r.sieve,
    [ar ? "% المار" : "% Passing"]: r.cumPassing,
    [ar ? "الحد الأدنى" : "Lower Limit"]: r.lower,
    [ar ? "الحد الأعلى" : "Upper Limit"]: r.upper,
  }));

  const blendPassingKey = ar ? "الخليط % مار" : "Blend %";
  const blendWhiteKey = ar ? "رمل أبيض (مستخدم %)" : "White sand (Used %)";
  const blendBlackKey = ar ? "رمل أسود (مستخدم %)" : "Black sand (Used %)";
  const blendUpperKey = ar ? "حد أعلى المواصفة" : "Spec upper";
  const blendLowerKey = ar ? "حد أدنى المواصفة" : "Spec lower";

  const blendChartDataLocalized =
    testMode === "blend"
      ? blendChartData.map(d => ({
          ...d,
          [blendPassingKey]: d.blend,
          [blendWhiteKey]: d.whiteUsed,
          [blendBlackKey]: d.blackUsed,
          [blendUpperKey]: d.specUpper,
          [blendLowerKey]: d.specLower,
          sieve: d.sieveLabel,
        }))
      : [];

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

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (testMode === "single") {
      if (status === "submitted" && !anyComputed) {
        toast.error(ar ? "يرجى إدخال كتل المناخل" : "Please enter sieve masses");
        return;
      }
    } else {
      if (status === "submitted" && !blendAllUsedFilled) {
        toast.error(
          ar ? "أدخل نسب الاستخدام للرمل الأبيض والأسود في كل منخل" : "Enter White and Black Used % for every sieve row",
        );
        return;
      }
      if (status === "submitted" && !passesBlendSpec) {
        toast.error(ar ? "الخليط خارج حدود المواصفة" : "Blend is outside specification limits");
        return;
      }
    }
    setSaving(true);
    try {
      const isFineGrading =
        testMode === "blend" ||
        gradingType.startsWith("FINE") ||
        gradingType.includes("FINE") ||
        gradingType.includes("SAND") ||
        gradingType.includes("MORTAR") ||
        gradingType.includes("PLASTER") ||
        gradingType.includes("MASONRY");
      const testTypeCode = isFineGrading ? "AGG_SIEVE_FINE" : "AGG_SIEVE_COARSE";

      const sieveDataBlend = blendRows.map(row => ({
        sieveMm: row.sieveMm,
        upperLimit: row.upperLimit,
        lowerLimit: row.lowerLimit,
        whiteSandUsed: row.whiteSandUsed,
        whiteSandOriginalPass: row.whiteSandOriginalPass,
        blackSandUsed: row.blackSandUsed,
        blackSandOriginalPass: row.blackSandOriginalPass,
        blend: calculateBlend(row.whiteSandUsed, row.blackSandUsed),
      }));

      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode,
        formTemplate: "sieve_analysis",
        formData:
          testMode === "blend"
            ? {
                testMode: "blend" as const,
                blendStandard,
                sieveData: sieveDataBlend,
                passesSpec: passesBlendSpec,
                overallResult: blendOverallResult,
                source,
                totalMass,
                panMass,
              }
            : {
                sieveStandard,
                gradingType,
                mortarSandSubtype:
                  gradingType === "PLASTER_SAND"
                    ? "PLASTER_SAND"
                    : gradingType === "MASONRY_SAND"
                      ? "MASONRY_SAND"
                      : undefined,
                totalMass,
                panMass,
                source,
                rows: computedRows,
                finesModulus: isFineGrading ? fm : undefined,
                overallResult,
                testMode: "single" as const,
              },
        overallResult,
        summaryValues:
          testMode === "blend"
            ? {
                testMode: "blend",
                blendStandard,
                passesSpec: passesBlendSpec,
                overallResult: blendOverallResult,
              }
            : {
                sieveStandard,
                gradingType,
                totalMass,
                finesModulus: fm.toFixed(2),
                overallResult,
              },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const GRADING_LABELS: Record<GradingType, { ar: string; en: string }> = {
    "COARSE_40": { ar: "ركام خشن 40مم", en: "Coarse Aggregate 40mm" },
    "COARSE_20": { ar: "ركام خشن 20مم", en: "Coarse Aggregate 20mm" },
    "FINE_SAND": { ar: "ركام ناعم (رمل)", en: "Fine Aggregate (Sand)" },
    "MORTAR_SAND": { ar: "رمل ملاط (ASTM C144)", en: "Mortar Sand (ASTM C144)" },
    "PLASTER_SAND": { ar: "رمل جص (BS 1199)", en: "Plaster Sand (BS 1199)" },
    "MASONRY_SAND": { ar: "رمل بناء (ASTM C144)", en: "Masonry Sand (ASTM C144)" },
    "ASTM_COARSE_NO57": { ar: "ركام خشن ASTM (تدرج 57)", en: "ASTM Coarse (No. 57–style)" },
    "ASTM_FINE_CONCRETE": { ar: "رمل ناعم خرسانة ASTM C33", en: "ASTM Fine (concrete sand, C33)" },
  };

  const gradingLabel = (k: GradingType) => ar ? GRADING_LABELS[k].ar : GRADING_LABELS[k].en;

  const gradingOptions = gradingKeysForStandard(sieveStandard);
  const showFinenessModulus =
    gradingType.includes("SAND") ||
    gradingType.includes("MORTAR") ||
    gradingType.includes("PLASTER") ||
    gradingType.includes("MASONRY") ||
    gradingType === "ASTM_FINE_CONCRETE";

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
      <div className="max-w-6xl mx-auto p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "Aggregate type / نوع الركام", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / تحليل المناخل" : "Aggregates / Sieve Analysis"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar ? "تحليل المناخل (توزيع الأحجام)" : "Sieve Analysis (Particle Size Distribution)"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              BS 882 / ASTM C136 | {ar ? "التوزيع:" : "Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
                  <Send size={14} className={ar ? "ml-1.5" : "mr-1.5"} />
                  {saving ? (ar ? "جاري الإرسال..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Test Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{ar ? "معلومات الاختبار" : "Test Information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 pb-4 border-b border-slate-200">
              <Label className="text-sm font-medium text-slate-800">
                {ar ? "إعدادات الاختبار" : "Test configuration"}
              </Label>
              <div className="flex flex-wrap gap-6 mt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="sieveTestMode"
                    value="single"
                    checked={testMode === "single"}
                    disabled={submitted}
                    onChange={() => setTestMode("single")}
                    className="h-4 w-4"
                  />
                  {ar ? "ركام واحد (كتل مناخل)" : "Single aggregate (mass retained)"}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="sieveTestMode"
                    value="blend"
                    checked={testMode === "blend"}
                    disabled={submitted}
                    onChange={() => {
                      setTestMode("blend");
                      setBlendRows(emptyBlendRows(blendStandard));
                    }}
                    className="h-4 w-4"
                  />
                  {ar ? "خليط رملين (أبيض + أسود)" : "Two-sand blend (White + Black)"}
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {ar
                  ? "الخلايا الخضراء = إدخال الفني. عمود «الخليط» = مجموع نسب الاستخدام (تلقائي)."
                  : "Green cells = technician inputs. “The Blend” column = sum of Used % (automatic)."}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {testMode === "single" && isMortarSandDist && (
                <div className="col-span-2 md:col-span-4">
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {ar ? "رمل الملاط — المعيار" : "Mortar sand — standard"}
                  </Label>
                  <Select
                    value={gradingType === "MASONRY_SAND" ? "masonry_sand" : "plaster_sand"}
                    disabled={submitted}
                    onValueChange={v => {
                      if (v === "masonry_sand") {
                        setSieveStandard("ASTM");
                        setGradingType("MASONRY_SAND");
                        setMassRetained(Object.fromEntries(GRADING_LIMITS.MASONRY_SAND.sieves.map(s => [s, ""])));
                      } else {
                        setSieveStandard("BS");
                        setGradingType("PLASTER_SAND");
                        setMassRetained(Object.fromEntries(GRADING_LIMITS.PLASTER_SAND.sieves.map(s => [s, ""])));
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plaster_sand">{ar ? "رمل لياسة (BS 1199)" : "Plaster Sand (BS 1199)"}</SelectItem>
                      <SelectItem value="masonry_sand">{ar ? "رمل بناء (ASTM C144)" : "Masonry Sand (ASTM C144)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {testMode === "single" && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "المواصفة" : "Sieve standard"}
                </Label>
                <Select
                  value={sieveStandard}
                  disabled={submitted || isMortarSandDist}
                  onValueChange={v => {
                    const std = v as "BS" | "ASTM";
                    setSieveStandard(std);
                    const keys = gradingKeysForStandard(std);
                    const next = keys.includes(gradingType) ? gradingType : keys[0];
                    setGradingType(next);
                    setMassRetained(Object.fromEntries(GRADING_LIMITS[next].sieves.map(s => [s, ""])));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BS">BS 882 / BS EN 12620</SelectItem>
                    <SelectItem value="ASTM">ASTM C33 / C136</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}
              {testMode === "single" && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "نوع الركام / التدرج" : "Aggregate Type / Grading"}
                </Label>
                <Select
                  value={gradingType}
                  disabled={submitted || isMortarSandDist}
                  onValueChange={v => {
                    setGradingType(v as GradingType);
                    setMassRetained(Object.fromEntries(GRADING_LIMITS[v as GradingType].sieves.map(s => [s, ""])));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gradingOptions.map(k => (
                      <SelectItem key={k} value={k}>{gradingLabel(k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}
              {testMode === "blend" && (
                <div className="col-span-2 md:col-span-4">
                  <Label className="text-xs text-slate-500 mb-1 block">
                    {ar ? "جدول حدود المواصفة" : "Specification limits table"}
                  </Label>
                  <Select
                    value={blendStandard}
                    disabled={submitted}
                    onValueChange={v => {
                      const std = v as BlendStandardKey;
                      setBlendStandard(std);
                      setBlendRows(emptyBlendRows(std));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASTM_C144">ASTM C 144 — Masonry Sand</SelectItem>
                      <SelectItem value="BS_1199_A">BS 1199:76 Type A — Plaster Sand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {testMode === "single" && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "كتلة العينة الكلية (جم)" : "Total Sample Mass (g)"}
                </Label>
                <Input value={totalMassStr} onChange={e => setTotalMassStr(e.target.value)} className="font-mono" placeholder="1000" />
              </div>
              )}
              {testMode === "single" && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "كتلة الصينية (جم)" : "Pan Mass (g)"}
                </Label>
                <Input value={panMass} onChange={e => setPanMass(e.target.value)} className="font-mono" placeholder="—" />
              </div>
              )}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  {ar ? "المصدر / المحجر" : "Source / Quarry"}
                </Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder={ar ? "مصدر الركام" : "Aggregate source"} />
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

        {testMode === "blend" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {ar ? "خليط الرمل — جدول المناخل" : "Sand blend — sieve worksheet"}
                </CardTitle>
                <p className="text-xs text-slate-500">
                  {blendStandard === "ASTM_C144" ? "ASTM C 144 — Masonry Sand" : "BS 1199:76 Type A — Plaster Sand"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-xs min-w-[720px]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle bg-slate-50">
                          {ar ? "حد أعلى المواصفة" : "Spec upper limit"}
                        </th>
                        <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle bg-slate-50">
                          {ar ? "حد أدنى المواصفة" : "Spec lower limit"}
                        </th>
                        <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle bg-yellow-100">
                          {ar ? "الخليط (محسوب)" : "The Blend (calculated)"}
                        </th>
                        <th colSpan={2} className="border border-slate-300 px-2 py-1 bg-blue-50 text-center">
                          {ar ? "رمل أبيض" : "White sand"}
                        </th>
                        <th colSpan={2} className="border border-slate-300 px-2 py-1 bg-slate-200 text-center">
                          {ar ? "رمل أسود" : "Black sand"}
                        </th>
                        <th rowSpan={2} className="border border-slate-300 px-2 py-1 align-middle">
                          {ar ? "حجم المنخل (مم)" : "Test sieve (mm)"}
                        </th>
                        <th rowSpan={2} className="border border-slate-300 px-1 py-1 align-middle w-10">
                          ✓
                        </th>
                      </tr>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-300 px-1 py-1 bg-green-100">{ar ? "مستخدم %" : "Used %"}</th>
                        <th className="border border-slate-300 px-1 py-1 bg-green-100">
                          {ar ? "أصلي % مار" : "Original grad pass %"}
                        </th>
                        <th className="border border-slate-300 px-1 py-1 bg-green-100">{ar ? "مستخدم %" : "Used %"}</th>
                        <th className="border border-slate-300 px-1 py-1 bg-green-100">
                          {ar ? "أصلي % مار" : "Original grad pass %"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {blendRows.map(row => {
                        const blendVal = calculateBlend(row.whiteSandUsed, row.blackSandUsed);
                        const bothUsed =
                          row.whiteSandUsed.trim() !== "" && row.blackSandUsed.trim() !== "";
                        const blendOk =
                          bothUsed && blendVal >= row.lowerLimit && blendVal <= row.upperLimit;
                        const blendDisplay =
                          row.whiteSandUsed.trim() === "" && row.blackSandUsed.trim() === ""
                            ? "—"
                            : blendVal.toFixed(1);
                        return (
                          <tr key={row.sieveMm}>
                            <td className="border border-slate-300 px-2 py-1 text-center bg-slate-50 font-mono">
                              {row.upperLimit}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center bg-slate-50 font-mono">
                              {row.lowerLimit}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-bold bg-yellow-50 font-mono">
                              {blendDisplay}
                            </td>
                            <td className="border border-slate-300 px-1 py-1 bg-green-50">
                              <Input
                                type="number"
                                value={row.whiteSandUsed}
                                onChange={e => updateBlendRow(row.sieveMm, "whiteSandUsed", e.target.value)}
                                placeholder={ar ? "مستخدم" : "Used"}
                                className="h-8 w-20 bg-white text-xs font-mono"
                                disabled={submitted}
                              />
                            </td>
                            <td className="border border-slate-300 px-1 py-1 bg-green-50">
                              <Input
                                type="number"
                                value={row.whiteSandOriginalPass}
                                onChange={e => updateBlendRow(row.sieveMm, "whiteSandOriginalPass", e.target.value)}
                                placeholder="%"
                                className="h-8 w-20 bg-white text-xs font-mono"
                                disabled={submitted}
                              />
                            </td>
                            <td className="border border-slate-300 px-1 py-1 bg-green-50">
                              <Input
                                type="number"
                                value={row.blackSandUsed}
                                onChange={e => updateBlendRow(row.sieveMm, "blackSandUsed", e.target.value)}
                                placeholder={ar ? "مستخدم" : "Used"}
                                className="h-8 w-20 bg-white text-xs font-mono"
                                disabled={submitted}
                              />
                            </td>
                            <td className="border border-slate-300 px-1 py-1 bg-green-50">
                              <Input
                                type="number"
                                value={row.blackSandOriginalPass}
                                onChange={e => updateBlendRow(row.sieveMm, "blackSandOriginalPass", e.target.value)}
                                placeholder="%"
                                className="h-8 w-20 bg-white text-xs font-mono"
                                disabled={submitted}
                              />
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-mono font-semibold">
                              {row.sieveMm}
                            </td>
                            <td className="border border-slate-300 px-1 py-1 text-center">
                              {!bothUsed ? (
                                "—"
                              ) : blendOk ? (
                                <span className="text-emerald-600 font-bold">✓</span>
                              ) : (
                                <span className="text-red-600 font-bold">✗</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {blendAllUsedFilled && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <PassFailBadge result={passesBlendSpec ? "pass" : "fail"} lang={lang} />
                    <span className="text-slate-600">
                      {passesBlendSpec
                        ? ar
                          ? "جميع قيم الخليط ضمن حدود المواصفة."
                          : "All blend values are within specification limits."
                        : ar
                          ? "قيمة خليط واحدة على الأقل خارج الحدود."
                          : "At least one blend value is outside the limits."}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{ar ? "منحنى التدرج" : "Grading curve"}</CardTitle>
              </CardHeader>
              <CardContent>
                {blendAnyUsed ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={blendChartDataLocalized} margin={{ top: 8, right: 20, left: 8, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="sieve"
                        tick={{ fontSize: 10 }}
                        label={{
                          value: ar ? "حجم المنخل (مم)" : "Sieve size (mm)",
                          position: "insideBottom",
                          offset: -14,
                          fontSize: 11,
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10 }}
                        label={{
                          value: ar ? "% مار" : "% passing",
                          angle: -90,
                          position: "insideLeft",
                          fontSize: 11,
                        }}
                      />
                      <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey={blendLowerKey}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                        dot={false}
                        strokeWidth={1.5}
                        name={blendLowerKey}
                      />
                      <Line
                        type="monotone"
                        dataKey={blendUpperKey}
                        stroke="#94a3b8"
                        strokeDasharray="5 5"
                        dot={false}
                        strokeWidth={1.5}
                        name={blendUpperKey}
                      />
                      <Line
                        type="monotone"
                        dataKey={blendWhiteKey}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={blendWhiteKey}
                      />
                      <Line
                        type="monotone"
                        dataKey={blendBlackKey}
                        stroke="#374151"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={blendBlackKey}
                      />
                      <Line
                        type="monotone"
                        dataKey={blendPassingKey}
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        name={blendPassingKey}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                    <div className="text-center">
                      <FlaskConical size={32} className="mx-auto mb-2 opacity-30" />
                      <p>{ar ? "أدخل نسب الاستخدام لرسم المنحنى" : "Enter Used % values to plot the curve"}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sieve Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "بيانات المناخل" : "Sieve Data"}</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "فتحة المنخل (مم)" : "Sieve (mm)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "الكتلة المحتجزة (جم)" : "Mass Retained (g)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% محتجز" : "% Retained"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% محتجز تراكمي" : "Cum. % Ret."}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "% مار تراكمي" : "% Passing"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                      {ar ? "الحدود" : "Limits"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.sieve} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-2 py-1 font-mono text-xs font-semibold text-slate-700 text-center">{row.sieve}</td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <Input
                          value={massRetained[row.sieve] ?? ""}
                          onChange={e => setMassRetained(prev => ({ ...prev, [row.sieve]: e.target.value }))}
                          className="h-7 text-xs w-20 text-center font-mono mx-auto"
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-600">
                        {row.pctRetained?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs text-slate-600">
                        {row.cumRetained?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs font-bold text-slate-800">
                        {row.cumPassing?.toFixed(1) ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center text-xs text-slate-500">
                        {row.lower}–{row.upper}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center">
                        {row.withinLimits !== undefined ? (
                          row.withinLimits
                            ? <span className="text-emerald-600 font-bold text-base">✓</span>
                            : <span className="text-red-600 font-bold text-base">✗</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                  {panMass && (
                    <tr className="bg-slate-100">
                      <td className="border border-slate-200 px-2 py-1 font-mono text-xs font-semibold text-center">
                        {ar ? "الصينية" : "Pan"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono text-xs">{panMass}</td>
                      <td colSpan={5} className="border border-slate-200"></td>
                    </tr>
                  )}
                </tbody>
              </table>
</div>

              {/* Fineness Modulus */}
              {showFinenessModulus && anyComputed && (
                <div className="mt-3 bg-blue-50 rounded-lg p-3 text-xs border border-blue-100">
                  <span className="font-semibold text-blue-700">
                    {ar ? "معامل النعومة (FM):" : "Fineness Modulus (FM):"}
                  </span>
                  <span className="font-mono font-bold text-blue-900 mx-2">{fm.toFixed(2)}</span>
                  <span className="text-slate-400">
                    {ar ? "(المقبول: 2.3 – 3.1)" : "(acceptable: 2.3 – 3.1)"}
                  </span>
                </div>
              )}

              {/* Mass balance check */}
              {anyComputed && totalMass > 0 && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded p-2">
                  {ar ? "مجموع الكتل المحتجزة:" : "Sum of retained masses:"}
                  <span className="font-mono font-bold mx-1">
                    {computedRows.reduce((s, r) => s + (parseFloat(r.massRetained) || 0), 0).toFixed(1)} جم
                  </span>
                  {" / "}
                  {ar ? "الكتلة الكلية:" : "Total:"}
                  <span className="font-mono font-bold mx-1">{totalMass} {ar ? "جم" : "g"}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Grading Curve Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ar ? "منحنى التدرج" : "Grading Curve"}</CardTitle>
            </CardHeader>
            <CardContent>
              {anyComputed ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="sieve"
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "فتحة المنخل (مم)" : "Sieve Size (mm)", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      label={{ value: ar ? "% المار" : "% Passing", angle: -90, position: "insideLeft", fontSize: 10 }}
                    />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={ar ? "الحد الأدنى" : "Lower Limit"}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      dot={false}
                      strokeWidth={1.5}
                    />
                    <Line
                      type="monotone"
                      dataKey={ar ? "الحد الأعلى" : "Upper Limit"}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      dot={false}
                      strokeWidth={1.5}
                    />
                    <Line
                      type="monotone"
                      dataKey={ar ? "% المار" : "% Passing"}
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  <div className="text-center">
                    <FlaskConical size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium">
                      {ar ? "أدخل كتل المناخل لرؤية منحنى التدرج" : "Enter sieve masses to see grading curve"}
                    </p>
                    <p className="text-xs mt-1">
                      {ar ? "يتحدث الرسم تلقائياً" : "Chart will update automatically"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {/* Spec Reference */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600 space-y-1">
                {testMode === "blend" ? (
                  <>
                    <p className="font-semibold text-slate-700">
                      {ar ? "المواصفة المرجعية:" : "Reference standard:"}{" "}
                      {blendStandard === "ASTM_C144"
                        ? "ASTM C 144 — Masonry Sand"
                        : "BS 1199:76 Type A — Plaster Sand"}
                    </p>
                    <p>
                      {ar
                        ? "يُحسب «الخليط» تلقائياً كمجموع نسب الاستخدام للرمل الأبيض والأسود. تُقارن القيم بحدود المواصفة في كل منخل."
                        : "“The Blend” is the sum of White and Black Used %. Values are compared to the specification upper and lower limits at each sieve."}
                    </p>
                  </>
                ) : (
                  <>
                <p className="font-semibold text-slate-700">
                  {ar ? "المواصفة المرجعية:" : "Reference Standard:"}{" "}
                  {sieveStandard === "ASTM" ? "ASTM C33 / C136" : "BS 882 / BS EN 12620"} — {gradingLabel(gradingType)}
                </p>
                <p>
                  {sieveStandard === "ASTM"
                    ? (ar
                        ? "حدود مبسّطة لأغراض المختبر — تأكد من مطابقة المشروع لجدول ASTM الفعلي."
                        : "Simplified envelope for lab QA — verify against your project’s ASTM gradation table.")
                    : (ar
                        ? "الحدود المعتمدة من BS 882 / BS EN 12620. يُعتبر الركام مطابقاً إذا مرّت جميع نقاط % المار ضمن الحدود."
                        : "Limits per BS 882 / BS EN 12620. Aggregate passes if all % passing values fall within the specified limits.")}
                </p>
                {(gradingType === "COARSE_20" || gradingType === "COARSE_40") && (
                  <p className="text-blue-700">
                    {ar ? "✓ يشمل منخل 6.3مم للركام الخشن" : "✓ Includes 6.3mm sieve for coarse aggregate"}
                  </p>
                )}
                {gradingType === "FINE_SAND" && (
                  <p className="text-blue-700">
                    {ar ? "✓ يشمل منخل 5.0مم للركام الناعم" : "✓ Includes 5.0mm sieve for fine aggregate"}
                  </p>
                )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overall Result */}
        {((testMode === "single" && anyComputed) || (testMode === "blend" && blendAnyUsed)) && (
          <ResultBanner
            result={overallResult}
            testName={
              testMode === "blend"
                ? ar
                  ? `تحليل المناخل — خليط رمل (أبيض + أسود)`
                  : `Sieve Analysis — sand blend (white + black)`
                : ar
                  ? `تحليل المناخل — ${gradingLabel(gradingType)}`
                  : `Sieve Analysis — ${gradingLabel(gradingType)}`
            }
            standard={
              testMode === "blend"
                ? blendStandard === "ASTM_C144"
                  ? "ASTM C 144"
                  : "BS 1199:76 Type A"
                : "BS 882 / ASTM C136"
            }
          />
        )}

        {/* Notes */}
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
