import DashboardLayout from "@/components/DashboardLayout";
import { ListFilterBar } from "@/components/ListFilterBar";
import { matchesListSearch, hasActiveListFilters } from "@/lib/listFilters";
import { RetestBadge } from "@/components/RetestBadge";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { resolveOfficialTestLabel } from "@/lib/officialTestCatalog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import {
  Microscope,
  Plus,
  Trash2,
  FlaskConical,
  CheckCircle2,
  Clock,
  Building2,
  Calendar,
  FileText,
  Package,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Bilingual labels ─────────────────────────────────────────────────────────
const T = {
  title:       { ar: "مهام الفني",              en: "Technician Tasks" },
  subtitle:    { ar: "قائمة الاختبارات المكلّف بها", en: "Your assigned test queue" },
  enterResults:{ ar: "إدخال النتائج",            en: "Enter Results" },
  measurements:{ ar: "القياسات",                 en: "Measurements" },
  notes:       { ar: "ملاحظات",                  en: "Notes" },
  submit:      { ar: "إرسال النتائج ومعالجتها",  en: "Submit & Process Results" },
  cancel:      { ar: "إلغاء",                    en: "Cancel" },
  addReading:  { ar: "إضافة قراءة",              en: "Add Reading" },
  loading:     { ar: "جارٍ الإرسال...",           en: "Submitting..." },
  noValue:     { ar: "يرجى إدخال قياس واحد على الأقل", en: "Please enter at least one valid measurement" },
  success:     { ar: "تم إرسال النتائج ومعالجتها بنجاح", en: "Results submitted and processed" },
  range:       { ar: "النطاق المقبول",            en: "Acceptable Range" },
  order:       { ar: "أمر التوزيع",               en: "Distribution Order" },
  testType:    { ar: "نوع الاختبار",              en: "Test Type" },
  priority:    { ar: "الأولوية",                  en: "Priority" },
  dueDate:     { ar: "تاريخ الاستحقاق",           en: "Due Date" },
  tabAll:      { ar: "الكل",                      en: "All" },
  tabActive:   { ar: "نشطة",                      en: "Active" },
  tabCompleted:{ ar: "مكتملة",                    en: "Completed" },
  sectionActive: { ar: "تكليفات نشطة",            en: "Active assignments" },
  sectionDone:   { ar: "اختبارات مكتملة",         en: "Completed tests" },
  emptyView:   { ar: "لا توجد اختبارات في هذا العرض", en: "No tests in this view" },
  startTest:   { ar: "بدء الاختبار",              en: "Start test" },
  viewReport:  { ar: "عرض التقرير",               en: "View report" },
  partOf:      { ar: "ضمن الطلب",                 en: "Part of" },
  received:    { ar: "تاريخ الاستلام",            en: "Received" },
  sampleCode:  { ar: "رمز العينة",               en: "Sample code" },
  contractNo:  { ar: "رقم العقد",                 en: "Contract no." },
  distCode:    { ar: "رمز التوزيع",               en: "Distribution" },
  batchTitle:  { ar: "حزمة",                       en: "Batch" },
  batchProgress:{ ar: "اختبارات مكتملة",           en: "tests completed" },
  openBatch:   { ar: "فتح الحزمة",                 en: "Open batch" },
  requiresPrereq: { ar: "يتطلب إكمال الاختبارات التالية أولاً:", en: "Requires completing these tests first:" },
  testLocked:  { ar: "هذا الاختبار مقفل",          en: "This test is locked" },
  unlockHint:  { ar: "أكمل الاختبارات المطلوبة أولاً", en: "Complete prerequisite tests to unlock" },
  requiredTest:{ ar: "اختبار مطلوب",               en: "Required test" },
  prereqNotMet:{ ar: "الشروط المسبقة غير مستوفاة", en: "Prerequisites not met" },
};

type MissingPrerequisiteTest = { code: string; nameEn: string; nameAr: string };

function tx(key: keyof typeof T, lang: string) {
  return lang === "ar" ? T[key].ar : T[key].en;
}

// ─── Specialized test codes that have dedicated pages ─────────────────────────
// --- SubType label map (value -> {ar, en}) ---
const SUBTYPE_LABELS: Record<string, { ar: string; en: string }> = {
  "7_days":          { ar: "7 أيام",                    en: "7 Days" },
  "14_days":         { ar: "14 يوم",                    en: "14 Days" },
  "28_days":         { ar: "28 يوم",                    en: "28 Days" },
  "solid_block":     { ar: "بلوك صلب",                en: "Solid Block" },
  "hollow_block":    { ar: "بلوك مجوف",               en: "Hollow Block" },
  "thermal_block":   { ar: "بلوك حراري",              en: "Thermal Block" },
  "interlock_6cm":   { ar: "إنترلوك 6 سم",              en: "Interlock 6cm" },
  "interlock_8cm":   { ar: "إنترلوك 8 سم",              en: "Interlock 8cm" },
  "beam_small":      { ar: "كمرة صغيرة 10x10x50",        en: "Beam Small 10x10x50" },
  "beam_large":      { ar: "كمرة كبيرة 15x15x75",        en: "Beam Large 15x15x75" },
  "core":            { ar: "كور خرساني",              en: "Concrete Core" },
  "mortar":          { ar: "ملاط",                     en: "Mortar" },
  "proctor_standard":{ ar: "بروكتور قياسي",            en: "Standard Proctor" },
  "proctor_modified":{ ar: "بروكتور محسن",            en: "Modified Proctor" },
  "cbr":             { ar: "CBR نسبة تحمل كاليفورنيا",  en: "CBR" },
  "atterberg":       { ar: "حدود أتربرج",              en: "Atterberg Limits" },
  "sieve":           { ar: "تحليل منخلي",               en: "Sieve Analysis" },
  "field_density":   { ar: "كثافة حقلية",               en: "Field Density" },
  "rebar_T8":        { ar: "حديد تسليح T8",            en: "Rebar T8" },
  "rebar_T10":       { ar: "حديد تسليح T10",           en: "Rebar T10" },
  "rebar_T12":       { ar: "حديد تسليح T12",           en: "Rebar T12" },
  "rebar_T16":       { ar: "حديد تسليح T16",           en: "Rebar T16" },
  "rebar_T20":       { ar: "حديد تسليح T20",           en: "Rebar T20" },
  "rebar_T25":       { ar: "حديد تسليح T25",           en: "Rebar T25" },
  "rebar_T32":       { ar: "حديد تسليح T32",           en: "Rebar T32" },
  "bend_rebend":     { ar: "اختبار الثني وإعادة الثني",   en: "Bend & Re-bend" },
  "anchor_bolt":     { ar: "مسمار إرساء",               en: "Anchor Bolt" },
  "structural":      { ar: "حديد هيكلي",               en: "Structural Steel" },
  "marshall":        { ar: "مارشال",                   en: "Marshall" },
  "bitumen_extract": { ar: "استخلاص البيتومين",         en: "Bitumen Extraction" },
  "extracted_sieve": { ar: "منخلي بعد الاستخلاص",       en: "Extracted Sieve" },
  "spray_rate":      { ar: "معدل الرش",                en: "Spray Rate" },
  "hot_bin":         { ar: "تحليل منخلي حار",           en: "Hot Bin Sieve" },
  "sieve_coarse":    { ar: "تحليل منخلي خشن",          en: "Coarse Sieve Analysis" },
  "sieve_fine":      { ar: "تحليل منخلي ناعم",          en: "Fine Sieve Analysis" },
  "specific_gravity":{ ar: "الكثافة النوعية",            en: "Specific Gravity" },
  "la_abrasion":     { ar: "تآكل لوس أنجلوس",          en: "LA Abrasion" },
  "flakiness":       { ar: "مؤشر الشكل",               en: "Flakiness & Elongation" },
  "crushing":        { ar: "قيمة السحق",                en: "Crushing Value" },
  "impact":          { ar: "قيمة الصدمة",               en: "Impact Value" },
};

function getSubTypeLabel(subType: string | null | undefined, lang: string): string | undefined {
  if (!subType) return undefined;
  const entry = SUBTYPE_LABELS[subType];
  return entry ? (lang === "ar" ? entry.ar : entry.en) : subType;
}

const SPECIALIZED_CODES = [
  "CONC_CUBE", "CONC_CORE", "CONC_BLOCK", "CONC_INTERLOCK", "CONC_MORTAR",
  "STEEL_REBAR", "STEEL_ANCHOR", "STEEL_PLATE", "STEEL_TUBE", "STEEL_WIRE",
  "AGG_SIEVE_COARSE", "AGG_SIEVE_FINE", "AGG_LOS_ANGELES", "AGG_FLAKINESS",
  "SOIL_PROCTOR", "SOIL_CBR", "SOIL_ATTERBERG", "SOIL_COMPACTION",
  "ASPH_ACWC", "ASPH_ACBC", "ASPH_DBM", "ASPH_MARSHALL",
  "CONC_BLOCK_SOLID", "CONC_BLOCK_HOLLOW", "CONC_BLOCK_THERMAL",
  "CONC_INTERLOCK_6CM", "CONC_INTERLOCK_8CM",
  "STEEL_REBAR_BS4449", "STEEL_REBAR_ASTM",
  "CONC_MORTAR_SAND",
];

function isSpecializedTestType(testType: string): boolean {
  return (
    SPECIALIZED_CODES.includes(testType) ||
    testType.startsWith("STEEL_") ||
    testType.startsWith("AGG_") ||
    testType.startsWith("SOIL_") ||
    testType.startsWith("ASPH_") ||
    testType.startsWith("CONC_") ||
    testType.startsWith("CEM_")
  );
}

/** Prefer FK on order-item rows; otherwise use distribution primary key (assignments). */
function resolveDistributionId(dist: any | null | undefined): number {
  if (!dist) return 0;
  const fromFk = Number(dist.distributionId);
  if (fromFk > 0) return fromFk;
  return Number(dist.id) || 0;
}

/** Received timestamp for sort (oldest first). Missing dates sort last. */
function getReceivedSortKey(dist: any): number {
  const raw = dist.sampleReceivedAt || dist.createdAt;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function groupDistributionsByBatch(distributions: any[]) {
  const batches = new Map<string, any[]>();
  const individuals: any[] = [];

  for (const dist of distributions) {
    if (!dist.orderId) {
      individuals.push(dist);
      continue;
    }
    const key = `${dist.sampleId}-${dist.orderId}`;
    if (!batches.has(key)) {
      batches.set(key, []);
    }
    batches.get(key)!.push(dist);
  }

  const batchGroups = Array.from(batches.values()).filter(g => g.length > 1);
  const singleTests = [
    ...Array.from(batches.values())
      .filter(g => g.length === 1)
      .flat(),
    ...individuals,
  ];

  return { batchGroups, singleTests };
}

/** Preserve sort order from a flat list: batches first (by first appearance), then singles. */
function orderGroupedTaskList(
  sortedList: any[],
  grouped: { batchGroups: any[][]; singleTests: any[] },
) {
  const batchMap = new Map<string, any[]>();
  for (const g of grouped.batchGroups) {
    if (g.length > 0 && g[0].orderId) {
      batchMap.set(`${g[0].sampleId}-${g[0].orderId}`, g);
    }
  }

  const batchKeysInOrder: string[] = [];
  for (const dist of sortedList) {
    if (!dist.orderId) continue;
    const key = `${dist.sampleId}-${dist.orderId}`;
    if (batchMap.has(key) && !batchKeysInOrder.includes(key)) {
      batchKeysInOrder.push(key);
    }
  }

  const orderedBatchGroups = batchKeysInOrder
    .map(key => batchMap.get(key)!)
    .filter(g => g.length > 1);

  const singleIds = new Set(grouped.singleTests.map(d => d.id));
  const orderedSingles = sortedList.filter(d => singleIds.has(d.id));

  return { batchGroups: orderedBatchGroups, singleTests: orderedSingles };
}

function priorityRank(p: string | null | undefined): number {
  switch (p) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "normal":
      return 2;
    case "low":
      return 3;
    default:
      return 2;
  }
}

function reportUrlForDistribution(dist: any): string {
  const id = dist.id;
  const testType = dist.testType ?? "";
  if (testType === "CONC_CUBE" || testType === "concrete" || testType === "concrete_compression") {
    return `/concrete-report/${id}`;
  }
  if (isSpecializedTestType(testType)) {
    return `/test-report/${id}`;
  }
  return `/test-report/${id}`;
}

function wrapDisabledWithTooltip(
  hasPendingDeletion: boolean,
  DisabledWarning: React.ReactNode,
  node: ReactElement
) {
  return hasPendingDeletion ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed">{node}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {DisabledWarning}
      </TooltipContent>
    </Tooltip>
  ) : (
    node
  );
}

function TechnicianAssignmentCard({
  dist,
  lang,
  sample,
  isCompleted,
  pendingDeletion,
  prerequisitesLocked,
  missingTests,
  onStartTest,
  onViewReport,
  onDeletionSuccess,
}: {
  dist: any;
  lang: string;
  sample: any | undefined;
  isCompleted: boolean;
  pendingDeletion: boolean;
  prerequisitesLocked: boolean;
  missingTests: MissingPrerequisiteTest[];
  onStartTest: () => void;
  onViewReport: () => void;
  onDeletionSuccess: () => void;
}) {
  const distId = resolveDistributionId(dist);
  const { hasPendingDeletion, PendingDeletionBadge, DisabledWarning } = useDeletionStatus(
    "distributions",
    distId
  );
  const combinedPending = pendingDeletion || hasPendingDeletion;
  const startDisabled = combinedPending || prerequisitesLocked;

  const testTitle = resolveOfficialTestLabel(dist.testType, lang === "ar" ? "ar" : "en", {
    nameEn: dist.testNameEn || dist.testName,
    nameAr: dist.testNameAr,
  });
  const subLabel = getSubTypeLabel(dist.sampleSubType, lang);
  const contractor = sample?.contractorName ?? "—";
  const contractNo = sample?.contractNumber ?? "—";
  const sampleCode = dist.sampleCode ?? sample?.sampleCode ?? "—";

  const receivedDate = dist.sampleReceivedAt || dist.createdAt;

  const statusBadge = isCompleted ? (
    <Badge className="shrink-0 border border-green-200 bg-green-100 text-xs text-green-800">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {lang === "ar" ? "مكتمل" : "Completed"}
    </Badge>
  ) : (
    <Badge className="shrink-0 border border-amber-200 bg-amber-100 text-xs text-amber-900">
      <Clock className="mr-1 h-3 w-3" />
      {lang === "ar" ? "نشط" : "Active"}
    </Badge>
  );

  return (
    <div
      className={`rounded-lg border px-5 py-4 transition-shadow hover:shadow-md ${
        isCompleted ? "border-green-200/80 bg-green-50/20" : "border-amber-200/40 bg-amber-50/10"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <FlaskConical className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold leading-tight text-foreground">{testTitle}</h2>
              {statusBadge}
              {PendingDeletionBadge}
            </div>
            {subLabel && <p className="text-xs text-muted-foreground">{subLabel}</p>}
            {dist.orderCode && dist.isMultiTest && (
              <Badge variant="secondary" className="text-xs font-normal">
                {tx("partOf", lang)} {dist.orderCode}
              </Badge>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">{tx("sampleCode", lang)}</p>
                <p className="font-mono text-sm font-medium">{sampleCode}</p>
                <RetestBadge
                  retestNumber={(dist as { retestNumber?: number }).retestNumber}
                  originalSampleId={(dist as { originalSampleId?: number }).originalSampleId}
                  compact
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tx("contractNo", lang)}</p>
                <p className="font-mono text-sm font-medium">{contractNo}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tx("distCode", lang)}</p>
                <p className="font-mono text-sm font-medium">{dist.distributionCode ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tx("received", lang)}</p>
                <p className="font-mono text-sm font-medium">
                  {receivedDate
                    ? new Date(receivedDate).toLocaleDateString(
                        lang === "ar" ? "ar-AE" : "en-GB",
                        { year: "numeric", month: "2-digit", day: "2-digit" }
                      )
                    : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{contractor}</span>
            </div>
            {dist.expectedCompletionDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>
                  {tx("dueDate", lang)}:{" "}
                  {new Date(dist.expectedCompletionDate).toLocaleDateString(lang === "ar" ? "ar" : "en")}
                </span>
              </div>
            )}
            {prerequisitesLocked && missingTests.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{tx("requiresPrereq", lang)}</span>
                </div>
                <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                  {missingTests.map((test) => (
                    <li key={test.code}>{lang === "ar" ? test.nameAr : test.nameEn}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-600">{tx("unlockHint", lang)}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {isCompleted ? (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onViewReport}>
              <FileText className="h-4 w-4" />
              {tx("viewReport", lang)}
            </Button>
          ) : (
            wrapDisabledWithTooltip(
              startDisabled,
              prerequisitesLocked ? (
                <span className="text-xs text-amber-800">{tx("prereqNotMet", lang)}</span>
              ) : (
                DisabledWarning
              ),
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={startDisabled}
                onClick={onStartTest}
              >
                {tx("startTest", lang)}
              </Button>
            )
          )}
          {distId > 0 &&
            (combinedPending ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-not-allowed opacity-60">
                    <span className="pointer-events-none inline-flex">
                      <DeletionRequestButton
                        targetTable="distributions"
                        targetId={distId}
                        targetLabel={`${dist.distributionCode ?? distId} · ${dist.testType ?? ""}`}
                        variant="icon"
                        onSuccess={onDeletionSuccess}
                      />
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {DisabledWarning}
                </TooltipContent>
              </Tooltip>
            ) : (
              <DeletionRequestButton
                targetTable="distributions"
                targetId={distId}
                targetLabel={`${dist.distributionCode ?? distId} · ${dist.testType ?? ""}`}
                variant="icon"
                onSuccess={onDeletionSuccess}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ lang }: { lang: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center text-muted-foreground">
      <FlaskConical className="mb-2 h-10 w-10 opacity-40" />
      <p className="text-sm">{tx("emptyView", lang)}</p>
    </div>
  );
}

function TechnicianBatchCard({
  group,
  lang,
  allSamples,
  onOpenBatch,
}: {
  group: any[];
  lang: string;
  allSamples: any[];
  onOpenBatch: () => void;
}) {
  const sample = allSamples.find((s: any) => s.id === group[0]?.sampleId);
  const sampleCode = group[0]?.sampleCode ?? sample?.sampleCode ?? "—";
  const completed = group.filter(d => d.status === "completed").length;
  const total = group.length;
  const allDone = completed === total;
  const contractor = sample?.contractorName ?? "—";

  return (
    <button
      type="button"
      onClick={onOpenBatch}
      className={`w-full rounded-lg border px-5 py-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        allDone ? "border-blue-200/80 bg-blue-50/40" : "border-blue-300/60 bg-blue-50/20"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Package className="h-6 w-6 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold leading-tight text-foreground">
                {tx("batchTitle", lang)}: <span className="font-mono">{sampleCode}</span>
              </h2>
              {allDone ? (
                <Badge className="border border-green-200 bg-green-100 text-xs text-green-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {lang === "ar" ? "مكتمل" : "Complete"}
                </Badge>
              ) : (
                <Badge className="border border-blue-200 bg-blue-100 text-xs text-blue-900">
                  <Clock className="mr-1 h-3 w-3" />
                  {lang === "ar" ? "قيد التنفيذ" : "In progress"}
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-blue-800">
              {completed}/{total} {tx("batchProgress", lang)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              <Building2 className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
              {contractor}
              {group[0]?.orderCode ? ` · ${group[0].orderCode}` : ""}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-blue-700">{tx("openBatch", lang)} →</span>
      </div>
    </button>
  );
}

export default function Technician() {
  const { lang } = useLanguage();
  const [, navigate] = useLocation();
  const [selectedDist, setSelectedDist] = useState<any>(null);
  const [rawValues, setRawValues] = useState<string[]>(["", "", ""]);
  const [unit, setUnit] = useState("MPa");
  const [testNotes, setTestNotes] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "completed">("all");
  const [listSearch, setListSearch] = useState("");
  const [sampleTypeFilter, setSampleTypeFilter] = useState("all");

  const utils = trpc.useUtils();
  const { data: assignments = [], refetch } = trpc.distributions.myAssignments.useQuery();
  const { data: myOrders = [], refetch: refetchOrders } = trpc.orders.myOrders.useQuery();
  const { data: allSamples = [] } = trpc.samples.list.useQuery();
  const markRead = trpc.distributions.markRead.useMutation();

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refetch();
      void refetchOrders();
      void utils.testDependencies.check.invalidate();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [refetch, refetchOrders, utils.testDependencies.check]);

  const assignmentDistIds = useMemo(() => assignments.map((d) => d.id), [assignments]);
  const assignmentPendingQueries = trpc.useQueries((t) =>
    assignmentDistIds.map((targetId) =>
      t.deletion.getPendingForTarget({ targetTable: "distributions", targetId })
    )
  );

  const pendingByDistId = useMemo(() => {
    const m = new Map<number, boolean>();
    assignments.forEach((d, i) => {
      m.set(d.id, Boolean(assignmentPendingQueries[i]?.data?.pending));
    });
    return m;
  }, [assignments, assignmentPendingQueries]);

  const tasksForDependencyCheck = useMemo(
    () => assignments.filter((d) => d.status !== "completed"),
    [assignments],
  );

  const dependencyQueries = trpc.useQueries((t) =>
    tasksForDependencyCheck.map((dist) =>
      t.testDependencies.check(
        { sampleId: dist.sampleId, testCode: dist.testType ?? "" },
        { enabled: Boolean(dist.sampleId && dist.testType) },
      ),
    ),
  );

  const dependencyByDistId = useMemo(() => {
    const m = new Map<number, { isAllowed: boolean; missingTests: MissingPrerequisiteTest[] }>();
    tasksForDependencyCheck.forEach((dist, i) => {
      const data = dependencyQueries[i]?.data;
      if (data) {
        m.set(dist.id, {
          isAllowed: data.isAllowed,
          missingTests: data.missingTests ?? [],
        });
      }
    });
    return m;
  }, [tasksForDependencyCheck, dependencyQueries]);

  const enrichedTasks = useMemo(() => {
    return assignments.map((dist) => {
      const parentOrder = myOrders.find((ord: any) =>
        ord.items?.some((item: any) => Number(item.distributionId) === dist.id),
      );
      return {
        ...dist,
        orderId: parentOrder?.id as number | undefined,
        orderCode: parentOrder?.orderCode,
        isMultiTest: (parentOrder?.items?.length || 1) > 1,
        pendingDeletion: pendingByDistId.get(dist.id) ?? false,
      };
    });
  }, [assignments, myOrders, pendingByDistId]);

  const sortedTasks = useMemo(() => {
    const list = [...enrichedTasks];
    list.sort((a, b) => {
      if (a.pendingDeletion !== b.pendingDeletion) {
        return a.pendingDeletion ? 1 : -1;
      }
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      const timeA = getReceivedSortKey(a);
      const timeB = getReceivedSortKey(b);
      if (timeA !== timeB) return timeA - timeB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return list;
  }, [enrichedTasks]);

  const filteredTasks = useMemo(() => {
    return sortedTasks.filter((dist) => {
      const sample = allSamples.find((s: any) => s.id === dist.sampleId);
      if (sampleTypeFilter !== "all" && sample?.sampleType !== sampleTypeFilter) return false;
      return matchesListSearch(listSearch, [
        dist.sampleCode,
        sample?.sampleCode,
        sample?.contractorName,
        sample?.contractNumber,
        dist.orderCode,
        dist.testName,
        dist.testNameEn,
        dist.testNameAr,
        dist.testType,
      ]);
    });
  }, [sortedTasks, allSamples, listSearch, sampleTypeFilter]);

  const counts = useMemo(() => {
    const active = filteredTasks.filter((d) => d.status !== "completed").length;
    const completed = filteredTasks.filter((d) => d.status === "completed").length;
    return { all: filteredTasks.length, active, completed };
  }, [filteredTasks]);

  const activeList = useMemo(
    () => filteredTasks.filter((d) => d.status !== "completed"),
    [filteredTasks]
  );
  const completedList = useMemo(
    () => filteredTasks.filter((d) => d.status === "completed"),
    [filteredTasks]
  );

  const submitResults = trpc.testResults.submit.useMutation({
    onSuccess: () => {
      toast.success(tx("success", lang));
      setSelectedDist(null);
      setRawValues(["", "", ""]);
      setTestNotes("");
      refetch();
      refetchOrders();
      void utils.testDependencies.check.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const {
    hasPendingDeletion: dialogDeletionPending,
    PendingDeletionBadge: dialogPendingBadge,
    DisabledWarning: dialogDisabledWarning,
  } = useDeletionStatus("distributions", resolveDistributionId(selectedDist));

  const openTestFlow = (dist: any) => {
    const pid = dist.id;
    if (pendingByDistId.get(pid)) {
      toast.warning(
        lang === "ar"
          ? "طلب حذف قيد الانتظار لهذا التوزيع."
          : "A deletion request is pending for this assignment."
      );
      return;
    }
    const dep = dependencyByDistId.get(pid);
    if (dep && !dep.isAllowed) {
      toast.warning(
        lang === "ar"
          ? `${tx("prereqNotMet", lang)}: ${dep.missingTests.map((t) => t.nameAr).join("، ")}`
          : `${tx("prereqNotMet", lang)}: ${dep.missingTests.map((t) => t.nameEn).join(", ")}`,
      );
      return;
    }
    if (dist.status !== "completed" && !dist.taskReadAt) {
      markRead.mutate({ id: dist.id });
    }
    const testType = dist.testType ?? "";
    const isSpecialized = isSpecializedTestType(testType);
    if (testType === "CONC_CUBE" || testType === "concrete" || testType === "concrete_compression") {
      navigate(`/concrete-test/${dist.distributionId ?? dist.id}`);
    } else if (isSpecialized) {
      navigate(`/test/${dist.distributionId ?? dist.id}`);
    } else {
      setSelectedDist(dist);
      setUnit(dist.unit ?? "MPa");
      const qty = dist.sampleQuantity && dist.sampleQuantity > 0 ? dist.sampleQuantity : 3;
      setRawValues(Array(qty).fill(""));
      setTestNotes("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialogDeletionPending) return;
    const values = rawValues.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    if (values.length === 0) {
      toast.error(tx("noValue", lang));
      return;
    }
    const resolvedSampleId =
      selectedDist?.sampleId ??
      (selectedDist?.sampleCode
        ? allSamples.find((s: any) => s.sampleCode === selectedDist.sampleCode)?.id
        : undefined);
    if (resolvedSampleId == null) {
      toast.error("Sample record not found");
      return;
    }
    submitResults.mutate({
      distributionId: resolveDistributionId(selectedDist),
      sampleId: resolvedSampleId,
      rawValues: values,
      unit,
      testNotes: testNotes || undefined,
    });
  };

  const addRow = () => setRawValues([...rawValues, ""]);
  const removeRow = (i: number) => setRawValues(rawValues.filter((_, idx) => idx !== i));
  const updateRow = (i: number, val: string) => {
    const updated = [...rawValues];
    updated[i] = val;
    setRawValues(updated);
  };

  const renderCard = (dist: any) => {
    const sample = allSamples.find((s: any) => s.id === dist.sampleId);
    const isCompleted = dist.status === "completed";
    const pend = pendingByDistId.get(dist.id) ?? false;
    const dep = dependencyByDistId.get(dist.id);
    const prerequisitesLocked = !isCompleted && dep?.isAllowed === false;
    const missingTests = dep?.missingTests ?? [];
    return (
      <TechnicianAssignmentCard
        key={dist.id}
        dist={dist}
        lang={lang}
        sample={sample}
        isCompleted={isCompleted}
        pendingDeletion={pend}
        prerequisitesLocked={prerequisitesLocked}
        missingTests={missingTests}
        onStartTest={() => openTestFlow(dist)}
        onViewReport={() => window.open(reportUrlForDistribution(dist), "_blank")}
        onDeletionSuccess={() => {
          refetch();
          refetchOrders();
        }}
      />
    );
  };

  const renderBatchCard = (group: any[]) => {
    const sampleId = group[0]?.sampleId;
    const orderId = group[0]?.orderId;
    return (
      <TechnicianBatchCard
        key={`batch-${sampleId}-${orderId}`}
        group={group}
        lang={lang}
        allSamples={allSamples}
        onOpenBatch={() => navigate(`/batch/${sampleId}/${orderId}`)}
      />
    );
  };

  const renderTaskList = (list: any[]) => {
    if (list.length === 0) return <EmptyState lang={lang} />;
    const grouped = orderGroupedTaskList(list, groupDistributionsByBatch(list));
    return (
      <>
        {grouped.batchGroups.map(renderBatchCard)}
        {grouped.singleTests.map(renderCard)}
      </>
    );
  };

  const tabBtn = (key: "all" | "active" | "completed", labelKey: keyof typeof T, count: number) => {
    const active = filterTab === key;
    return (
      <button
        type="button"
        onClick={() => setFilterTab(key)}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
          active
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-background text-muted-foreground hover:border-primary/40"
        }`}
      >
        {tx(labelKey, lang)}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{tx("title", lang)}</h1>
          <p className="text-sm text-muted-foreground">{tx("subtitle", lang)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabBtn("all", "tabAll", counts.all)}
          {tabBtn("active", "tabActive", counts.active)}
          {tabBtn("completed", "tabCompleted", counts.completed)}
        </div>

        <ListFilterBar
          lang={lang}
          search={listSearch}
          onSearchChange={setListSearch}
          searchPlaceholder={
            lang === "ar"
              ? "بحث برمز العينة، العقد، المقاول، أو نوع الاختبار..."
              : "Search by sample code, contract, contractor, or test..."
          }
          sampleType={sampleTypeFilter}
          onSampleTypeChange={setSampleTypeFilter}
          showClear={hasActiveListFilters({ search: listSearch, sampleType: sampleTypeFilter })}
          onClear={() => {
            setListSearch("");
            setSampleTypeFilter("all");
          }}
          resultCount={filteredTasks.length}
        />

        {filterTab === "all" && (
          <div className="space-y-8">
            <section className="space-y-3 border-l-4 border-amber-400 pl-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
                {tx("sectionActive", lang)}
              </h2>
              <div className="space-y-3">
                {renderTaskList(activeList)}
              </div>
            </section>
            <section className="space-y-3 border-l-4 border-green-500 pl-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-green-800">
                {tx("sectionDone", lang)}
              </h2>
              <div className="space-y-3">
                {renderTaskList(completedList)}
              </div>
            </section>
          </div>
        )}

        {filterTab === "active" && (
          <div className="space-y-3 border-l-4 border-amber-400 pl-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
              {tx("sectionActive", lang)}
            </h2>
            {renderTaskList(activeList)}
          </div>
        )}

        {filterTab === "completed" && (
          <div className="space-y-3 border-l-4 border-green-500 pl-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-green-800">
              {tx("sectionDone", lang)}
            </h2>
            {renderTaskList(completedList)}
          </div>
        )}
      </div>

      <Dialog open={!!selectedDist} onOpenChange={(o) => !o && setSelectedDist(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Microscope className="h-5 w-5" />
              {lang === "ar" ? "إدخال نتائج الاختبار" : "Enter Test Results"}
              {dialogPendingBadge}
            </DialogTitle>
          </DialogHeader>
          {selectedDist && (
            <form onSubmit={handleSubmit} className="mt-2 space-y-4">
              <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">{tx("order", lang)}:</span>{" "}
                  <span className="font-mono font-bold">{selectedDist.distributionCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tx("testType", lang)}:</span>{" "}
                  <span className="font-medium">
                    {resolveOfficialTestLabel(selectedDist.testType, lang === "ar" ? "ar" : "en", {
                      nameEn: selectedDist.testNameEn || selectedDist.testName,
                      nameAr: selectedDist.testNameAr,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tx("range", lang)}:</span>{" "}
                  <span className="font-medium">
                    {selectedDist.minAcceptable ?? "—"} – {selectedDist.maxAcceptable ?? "—"}{" "}
                    {selectedDist.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {lang === "ar" ? `${tx("measurements", lang)} (${unit})` : `${tx("measurements", lang)} (${unit})`}
                  </Label>
                  <Input
                    className="h-7 w-20 text-xs"
                    placeholder="Unit"
                    value={unit}
                    disabled={dialogDeletionPending}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  {rawValues.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-20 text-xs text-muted-foreground">
                        {lang === "ar" ? `قراءة ${i + 1}` : `Reading ${i + 1}`}
                      </span>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder={`Value in ${unit}`}
                        value={val}
                        disabled={dialogDeletionPending}
                        onChange={(e) => updateRow(i, e.target.value)}
                        className="flex-1"
                      />
                      {rawValues.length > 1 &&
                        wrapDisabledWithTooltip(
                          dialogDeletionPending,
                          dialogDisabledWarning,
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            disabled={dialogDeletionPending}
                            onClick={() => removeRow(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
                {wrapDisabledWithTooltip(
                  dialogDeletionPending,
                  dialogDisabledWarning,
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    disabled={dialogDeletionPending}
                    onClick={addRow}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tx("addReading", lang)}
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="testNotes">{tx("notes", lang)}</Label>
                <Textarea
                  id="testNotes"
                  rows={2}
                  placeholder={lang === "ar" ? "الملاحظات والظروف..." : "Observations, conditions, notes..."}
                  value={testNotes}
                  disabled={dialogDeletionPending}
                  onChange={(e) => setTestNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                {wrapDisabledWithTooltip(
                  dialogDeletionPending,
                  dialogDisabledWarning,
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={submitResults.isPending || dialogDeletionPending}
                  >
                    {submitResults.isPending ? tx("loading", lang) : tx("submit", lang)}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setSelectedDist(null)}>
                  {tx("cancel", lang)}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
