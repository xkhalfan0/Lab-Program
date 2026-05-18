import DashboardLayout from "@/components/DashboardLayout";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import {
  CheckSquare,
  XCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  ClipboardCheck,
  FileText,
  Clock,
  History,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useMemo, type ReactElement } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Sector label helper ──────────────────────────────────────────────────────
const SECTOR_LABELS: Record<string, { ar: string; en: string }> = {
  sector_1: { ar: "قطاع/1", en: "Sector 1" },
  sector_2: { ar: "قطاع/2", en: "Sector 2" },
  sector_3: { ar: "قطاع/3", en: "Sector 3" },
  sector_4: { ar: "قطاع/4", en: "Sector 4" },
  sector_5: { ar: "قطاع/5", en: "Sector 5" },
};
function sectorLabel(val: string | null | undefined, lang: string) {
  if (!val) return "—";
  const s = SECTOR_LABELS[val];
  return s ? (lang === "ar" ? s.ar : s.en) : val;
}

// ─── Task state helpers ───────────────────────────────────────────────────────
type TaskFilter = "all" | "new" | "incomplete" | "completed";

function getSampleTaskState(sample: any): "new" | "incomplete" | "completed" {
  if (sample.status === "reviewed" || sample.status === "approved" || sample.status === "qc_passed" || sample.status === "qc_failed" || sample.status === "clearance_issued" || sample.status === "rejected") {
    return "completed";
  }
  if (sample.managerReadAt) return "incomplete";
  return "new";
}

function sampleReviewPriority(sample: any): number {
  const statusPriority: Record<string, number> = {
    awaiting_review: 1,
    under_review: 2,
    processed: 3,
    revision_requested: 4,
    testing_in_progress: 5,
    distributed: 6,
    approved: 7,
    rejected: 8,
  };
  return statusPriority[sample.status] ?? 99;
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

/** Active-queue sample row: matches DeletionRequestButton targetTable `samples`. */
function ManagerReviewActiveSampleCard({
  sample,
  lang,
  onOpen,
  onRefetch,
}: {
  sample: any;
  lang: string;
  onOpen: (s: any) => void;
  onRefetch: () => void;
}) {
  const state = getSampleTaskState(sample);
  const { hasPendingDeletion, PendingDeletionBadge, DisabledWarning } = useDeletionStatus("samples", sample.id);

  const tryOpen = () => {
    if (hasPendingDeletion) {
      toast.warning(
        lang === "ar"
          ? "طلب حذف قيد الانتظار لهذه العينة."
          : "A deletion request is pending for this sample."
      );
      return;
    }
    onOpen(sample);
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow border-l-4 ${
        hasPendingDeletion
          ? "cursor-not-allowed opacity-90 border-l-muted bg-muted/20"
          : "cursor-pointer " +
            (state === "new"
              ? "border-l-red-400 bg-red-50/30"
              : state === "incomplete"
                ? "border-l-amber-400 bg-amber-50/20"
                : "border-l-green-400")
      }`}
      onClick={tryOpen}
    >
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-bold text-primary">{sample.sampleCode}</p>
            <TaskStateBadge state={state} lang={lang} />
            <StatusBadge status={sample.status} />
            {PendingDeletionBadge}
            {(sample as any).sector && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Building2 className="w-3 h-3" />
                {sectorLabel((sample as any).sector, lang)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {sample.contractorName} — {(sample as any).contractNumber ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {wrapDisabledWithTooltip(
            hasPendingDeletion,
            DisabledWarning,
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={hasPendingDeletion}>
              <ClipboardCheck className="w-3.5 h-3.5" />
              {lang === "ar" ? "مراجعة النتائج" : "Review Results"}
            </Button>
          )}
          {hasPendingDeletion ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed opacity-60">
                  <span className="pointer-events-none inline-flex">
                    <DeletionRequestButton
                      targetTable="samples"
                      targetId={sample.id}
                      targetLabel={`Sample ${sample.sampleCode}`}
                      variant="icon"
                      onSuccess={onRefetch}
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
              targetTable="samples"
              targetId={sample.id}
              targetLabel={`Sample ${sample.sampleCode}`}
              variant="icon"
              onSuccess={onRefetch}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ManagerReviewArchiveSampleCard({
  sample,
  lang,
  onOpen,
}: {
  sample: any;
  lang: string;
  onOpen: (s: any) => void;
}) {
  const { hasPendingDeletion, PendingDeletionBadge, DisabledWarning } = useDeletionStatus("samples", sample.id);

  const tryOpen = () => {
    if (hasPendingDeletion) {
      toast.warning(
        lang === "ar"
          ? "طلب حذف قيد الانتظار لهذه العينة."
          : "A deletion request is pending for this sample."
      );
      return;
    }
    onOpen(sample);
  };

  return (
    <Card
      className={`border-l-4 border-l-green-400 hover:shadow-sm transition-shadow opacity-80 hover:opacity-100 ${
        hasPendingDeletion ? "cursor-not-allowed" : "cursor-pointer"
      }`}
      onClick={tryOpen}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-bold text-primary">{sample.sampleCode}</p>
            <StatusBadge status={sample.status} />
            {PendingDeletionBadge}
            {(sample as any).sector && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Building2 className="w-3 h-3" />
                {sectorLabel((sample as any).sector, lang)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {sample.contractorName} — {(sample as any).contractNumber ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType}
            {(sample as any).receivedAt && (
              <span className="ms-2 text-muted-foreground/70">
                • {new Date((sample as any).receivedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE")}
              </span>
            )}
          </p>
        </div>
        {wrapDisabledWithTooltip(
          hasPendingDeletion,
          DisabledWarning,
          <span className="inline-flex">
            <ChevronRight className={`w-4 h-4 text-muted-foreground ${lang === "ar" ? "rotate-180" : ""}`} />
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function TaskStateBadge({ state, lang }: { state: "new" | "incomplete" | "completed"; lang: string }) {
  if (state === "new")
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
        {lang === "ar" ? "جديدة" : "New"}
      </Badge>
    );
  if (state === "incomplete")
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-xs">
        <Clock className="w-3 h-3" />
        {lang === "ar" ? "غير مكتملة" : "Incomplete"}
      </Badge>
    );
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-xs">
      <CheckCircle2 className="w-3 h-3" />
      {lang === "ar" ? "مُنجزة" : "Completed"}
    </Badge>
  );
}

function isConcreteCubeReport(
  dist: { testType?: string } | undefined,
  legacyResult: { chartsData?: unknown } | undefined
): boolean {
  const src = (legacyResult?.chartsData as { source?: string } | undefined)?.source;
  if (src === "concrete_cubes") return true;
  const tt = (dist?.testType ?? "").toLowerCase();
  return (
    tt === "conc_cube" ||
    tt === "concrete_compression" ||
    tt === "concrete" ||
    tt.includes("conc_cube")
  );
}

/** One URL for “open report” from the manager dialog (matches App.tsx routes). */
function computeManagerReviewReportUrl(opts: {
  batchId?: string | null;
  distId?: number;
  dist: { testType?: string } | undefined;
  legacyResult: { chartsData?: unknown } | undefined;
  hasSpecializedForDistribution: boolean;
  orderId?: number;
  hasLegacyResult: boolean;
}): string | null {
  const {
    batchId,
    distId,
    dist,
    legacyResult,
    hasSpecializedForDistribution,
    orderId,
    hasLegacyResult,
  } = opts;
  if (batchId) return `/batch-report/${encodeURIComponent(batchId)}`;
  if (!distId) return null;
  if (isConcreteCubeReport(dist, legacyResult)) return `/concrete-report/${distId}`;
  if (hasSpecializedForDistribution) return `/test-report/${distId}`;
  if (orderId != null) return `/order-report/${orderId}`;
  if (hasLegacyResult) return `/test-report/${distId}`;
  return null;
}

export default function ManagerReview() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const [selectedSample, setSelectedSample] = useState<any>(null);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");
  const [decision, setDecision] = useState<"approved" | "needs_revision" | "rejected" | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("new");
  const [showHistory, setShowHistory] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");

  // Auto-fill signature with current user's name
  useEffect(() => {
    if (user) {
      setSignature(user.name || user.username || "");
    }
  }, [user]);

  const { data: samples, refetch } = trpc.samples.list.useQuery();
  const { data: results, isLoading: resultsLoading } = trpc.testResults.bySample.useQuery(
    { sampleId: selectedSample?.id ?? 0 },
    { enabled: !!selectedSample }
  );
  const { data: specializedResults, isLoading: specLoading } = trpc.specializedTests.getBySample.useQuery(
    { sampleId: selectedSample?.id ?? 0 },
    { enabled: !!selectedSample }
  );
  const { data: distributions, isLoading: distLoading } = trpc.distributions.bySample.useQuery(
    { sampleId: selectedSample?.id ?? 0 },
    { enabled: !!selectedSample }
  );
  const { data: sampleOrders } = trpc.orders.bySample.useQuery(
    { sampleId: selectedSample?.id ?? 0 },
    { enabled: !!selectedSample }
  );
  const isLoadingResults = resultsLoading || specLoading || distLoading;

  const managerReview = trpc.reviews.managerReview.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تقديم المراجعة بنجاح" : "Review submitted successfully");
      setSelectedSample(null);
      setSelectedResult(null);
      setComments("");
      setSignature("");
      setDecision(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const markManagerRead = trpc.reviews.markManagerRead.useMutation();

  const {
    hasPendingDeletion: dialogSamplePending,
    PendingDeletionBadge: dialogSamplePendingBadge,
    DisabledWarning: dialogSampleDisabledWarning,
  } = useDeletionStatus("samples", selectedSample?.id ?? 0);

  // Samples ready for review, including the new explicit awaiting_review status.
  const reviewSamples = samples?.filter((s) =>
    ["awaiting_review", "under_review", "processed", "reviewed", "approved", "qc_passed", "qc_failed", "clearance_issued", "rejected"].includes(s.status)
  ) ?? [];
  const sortedReviewSamples = [...reviewSamples].sort((a, b) => {
    const priority = sampleReviewPriority(a) - sampleReviewPriority(b);
    if (priority !== 0) return priority;
    return new Date(b.updatedAt ?? b.receivedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.receivedAt ?? a.createdAt ?? 0).getTime();
  });

  // Count by state
  const newCount = reviewSamples.filter(s => getSampleTaskState(s) === "new").length;
  const incompleteCount = reviewSamples.filter(s => getSampleTaskState(s) === "incomplete").length;
  const completedCount = reviewSamples.filter(s => getSampleTaskState(s) === "completed").length;

  // Filtered list
  const filteredSamples = sortedReviewSamples.filter(s => {
    if (taskFilter === "all") return true;
    return getSampleTaskState(s) === taskFilter;
  });

  const activeSamples = filteredSamples.filter(s => getSampleTaskState(s) !== "completed");
  const awaitingReviewSamples = activeSamples.filter(s => s.status === "awaiting_review");
  const otherActiveSamples = activeSamples.filter(s => s.status !== "awaiting_review");
  const completedSamples = filteredSamples.filter(s => getSampleTaskState(s) === "completed");

  const handleOpenSample = (sample: any) => {
    setSelectedSample(sample);
    setComments("");
    setSignature("");
    setDecision(null);
    // Mark as read (new → incomplete)
    if (!sample.managerReadAt && (sample.status === "processed" || sample.status === "awaiting_review")) {
      markManagerRead.mutate({ sampleId: sample.id }, {
        onSuccess: () => refetch(),
      });
    }
  };

  const handleReview = () => {
    if (dialogSamplePending) {
      toast.warning(
        lang === "ar"
          ? "طلب حذف قيد الانتظار لهذه العينة."
          : "A deletion request is pending for this sample."
      );
      return;
    }
    if (!decision) {
      toast.error(lang === "ar" ? "يرجى اختيار قرار" : "Please select a decision");
      return;
    }
    // Require reason only for rejection and revision
    if ((decision === "rejected" || decision === "needs_revision") && !comments.trim()) {
      toast.error(lang === "ar" ? "يرجى كتابة سبب الرفض أو طلب المراجعة" : "Please provide a reason for rejection or revision request");
      return;
    }
    const autoSignature = user?.name || user?.username || signature || `Supervisor — ${new Date().toLocaleDateString()}`;
    // Determine which result type to use
    const legacyResult = results?.[0];
    const specResult = specializedResults?.[0];
    if (!legacyResult && !specResult) {
      toast.error(lang === "ar" ? "لم يتم العثور على نتيجة اختبار" : "No test result found");
      return;
    }
    managerReview.mutate({
      testResultId: legacyResult?.id,
      specializedTestResultId: specResult?.id,
      sampleId: selectedSample.id,
      decision,
      comments: comments || undefined,
      signature: autoSignature,
    });
  };

  const dist = distributions?.[0];
  const result = results?.[0];
  const specResult = specializedResults?.[0];
  const specializedForDist = useMemo(() => {
    if (!dist?.id || !specializedResults?.length) return false;
    return specializedResults.some((r: { distributionId?: number }) => r.distributionId === dist.id);
  }, [dist?.id, specializedResults]);

  const reportUrl = useMemo(
    () =>
      computeManagerReviewReportUrl({
        batchId: (selectedSample as { batchId?: string } | null)?.batchId ?? null,
        distId: dist?.id,
        dist,
        legacyResult: result,
        hasSpecializedForDistribution: specializedForDist,
        orderId: sampleOrders?.[0]?.id,
        hasLegacyResult: !!result,
      }),
    [selectedSample, dist, result, specializedForDist, sampleOrders]
  );

  // Use specialized result if no legacy result
  const hasResult = !!(result || specResult);
  const isSpecialized = !result && !!specResult;

  const chartsData = result?.chartsData as any;
  const rawValues: number[] = chartsData?.values ?? [];
  const avg = parseFloat(result?.average ?? "0");
  const minVal = dist?.minAcceptable ? parseFloat(dist.minAcceptable) : null;
  const maxVal = dist?.maxAcceptable ? parseFloat(dist.maxAcceptable) : null;
  const passing = rawValues.filter(
    (v) => (minVal == null || v >= minVal) && (maxVal == null || v <= maxVal)
  ).length;
  // Derive overall compliance from result
  const overallCompliance = isSpecialized
    ? (specResult?.overallResult ?? "pending")
    : (result?.complianceStatus ?? "pending");
  const isPass = overallCompliance === "pass";
  const isFail = overallCompliance === "fail";

  const handleOpenReport = () => {
    if (!reportUrl) {
      toast.error(
        lang === "ar" ? "لا يوجد رابط تقرير لهذه العينة" : "No report is available for this sample yet."
      );
      return;
    }
    window.open(reportUrl, "_blank");
  };

  const totalActive = newCount + incompleteCount;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{lang === "ar" ? "مراجعة نتائج الاختبارات" : "Test Results Review"}</h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "مراجعة نتائج الاختبارات واعتمادها أو طلب المراجعة"
              : "Review processed test results and approve or request revision"}
          </p>
        </div>

        {/* ── Filter Buttons ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTaskFilter("new")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
              taskFilter === "new"
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-red-400"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {lang === "ar" ? "جديدة" : "New"}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "new" ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>
              {newCount}
            </span>
          </button>
          <button
            onClick={() => setTaskFilter("incomplete")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
              taskFilter === "incomplete"
                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-amber-400"
            }`}
          >
            <Clock className="w-4 h-4" />
            {lang === "ar" ? "غير مكتملة" : "Incomplete"}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "incomplete" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
              {incompleteCount}
            </span>
          </button>
          <button
            onClick={() => { setTaskFilter("completed"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
              taskFilter === "completed"
                ? "bg-green-600 text-white border-green-600 shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-green-400"
            }`}
          >
            <History className="w-4 h-4" />
            {lang === "ar" ? "الأرشيف" : "Archive"}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "completed" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>
              {completedCount}
            </span>
          </button>
        </div>

        {/* ── Active Tasks ──────────────────────────────────────────────── */}
        {activeSamples.length === 0 && taskFilter !== "completed" ? (
          <Card>
            <CardContent className="p-10 text-center">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">
                {lang === "ar" ? "لا توجد عينات بانتظار مراجعة النتائج" : "No samples awaiting results review"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {(taskFilter === "all" || taskFilter === "new") && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm">
                    {lang === "ar" ? "في انتظار المراجعة" : "Awaiting Review"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({awaitingReviewSamples.length})
                  </span>
                </h3>
                {awaitingReviewSamples.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    {lang === "ar" ? "لا توجد عينات في انتظار المراجعة" : "No samples awaiting review"}
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {awaitingReviewSamples.map((sample) => (
                      <ManagerReviewActiveSampleCard
                        key={sample.id}
                        sample={sample}
                        lang={lang}
                        onOpen={handleOpenSample}
                        onRefetch={() => refetch()}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {otherActiveSamples.length > 0 && (
              <div>
                {(taskFilter === "all" || taskFilter === "new") && (
                  <h3 className="text-lg font-semibold mb-3">
                    {lang === "ar" ? "عينات أخرى" : "Other Samples"}
                  </h3>
                )}
                <div className="grid gap-3">
                  {otherActiveSamples.map((sample) => (
                    <ManagerReviewActiveSampleCard
                      key={sample.id}
                      sample={sample}
                      lang={lang}
                      onOpen={handleOpenSample}
                      onRefetch={() => refetch()}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Archive (Completed) ──────────────────────────────────────────── */}
        {taskFilter === "completed" && (
          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={archiveSearch}
                onChange={e => setArchiveSearch(e.target.value)}
                placeholder={lang === "ar" ? "بحث برقم المشروع أو اسم المقاول..." : "Search by project number or contractor..."}
                className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {archiveSearch && (
                <button
                  onClick={() => setArchiveSearch("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg leading-none"
                >×</button>
              )}
            </div>
            {completedSamples
              .filter(s => {
                if (!archiveSearch.trim()) return true;
                const q = archiveSearch.toLowerCase();
                return (
                  s.sampleCode?.toLowerCase().includes(q) ||
                  s.contractorName?.toLowerCase().includes(q) ||
                  (s as any).contractNumber?.toLowerCase().includes(q) ||
                  (s as any).projectName?.toLowerCase().includes(q)
                );
              })
              .map((sample) => (
                <ManagerReviewArchiveSampleCard
                  key={sample.id}
                  sample={sample}
                  lang={lang}
                  onOpen={handleOpenSample}
                />
              ))}
            {completedSamples.filter(s => {
              if (!archiveSearch.trim()) return true;
              const q = archiveSearch.toLowerCase();
              return (
                s.sampleCode?.toLowerCase().includes(q) ||
                s.contractorName?.toLowerCase().includes(q) ||
                (s as any).contractNumber?.toLowerCase().includes(q) ||
                (s as any).projectName?.toLowerCase().includes(q)
              );
            }).length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {lang === "ar" ? "لا توجد نتائج للبحث" : "No results found"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedSample} onOpenChange={(o) => !o && setSelectedSample(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-center text-base font-bold flex flex-wrap items-center justify-center gap-2">
              {lang === "ar"
                ? `مراجعة النتائج — ${selectedSample?.sampleCode}`
                : `Review Results — ${selectedSample?.sampleCode}`}
              {dialogSamplePendingBadge}
            </DialogTitle>
          </DialogHeader>

          {isLoadingResults ? (
            <div className="p-8 text-center">
              <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">{lang === "ar" ? "جاري تحميل النتائج..." : "Loading results..."}</p>
            </div>
          ) : hasResult ? (
            <div className="space-y-5 mt-2">
              {/* Specialized test info banner */}
              {isSpecialized && specResult && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800">
                      {lang === "ar" ? "اختبار متخصص" : "Specialized Test"}: {specResult.testTypeCode}
                    </p>
                    <p className="text-xs text-blue-600">
                      {lang === "ar" ? "أُدخل بواسطة" : "Entered by"}: {specResult.testedBy ?? "—"} · {specResult.testDate ? new Date(specResult.testDate).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                    specResult.overallResult === "pass" ? "bg-green-100 text-green-700" :
                    specResult.overallResult === "fail" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {specResult.overallResult === "pass" ? (lang === "ar" ? "ناجح" : "PASS") :
                     specResult.overallResult === "fail" ? (lang === "ar" ? "راسب" : "FAIL") :
                     (lang === "ar" ? "قيد المراجعة" : "Pending")}
                  </div>
                </div>
              )}

              {/* ── Pass/Fail Banner ─────────────────────────────────────── */}
              {overallCompliance !== "pending" && (
                <div className={`rounded-xl p-4 flex items-center gap-4 border-2 ${
                  isPass
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-red-50 border-red-300 text-red-800"
                }`}>
                  {isPass ? (
                    <CheckCircle2 className="w-10 h-10 text-green-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-10 h-10 text-red-600 shrink-0" />
                  )}
                  <div>
                    <p className="text-lg font-extrabold tracking-wide">
                      {isPass
                        ? (lang === "ar" ? "✓ النتيجة: ناجح" : "✓ Result: PASS")
                        : (lang === "ar" ? "✗ النتيجة: راسب" : "✗ Result: FAIL")}
                    </p>
                    <p className="text-sm mt-0.5 opacity-80">
                      {isPass
                        ? (lang === "ar" ? "العينة مطابقة للمواصفات القياسية" : "Sample meets specification requirements")
                        : (lang === "ar" ? "العينة لا تطابق المواصفات القياسية" : "Sample does not meet specification requirements")}
                    </p>
                  </div>
                  <div className="ms-auto text-right">
                    <p className="text-2xl font-extrabold">{result?.percentage ? `${result.percentage}%` : "—"}</p>
                    <p className="text-xs opacity-70">{lang === "ar" ? "نسبة الامتثال" : "Compliance"}</p>
                  </div>
                </div>
              )}

              {/* ── Stats Summary ─────────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: lang === "ar" ? "المتوسط" : "Average", value: result ? `${result.average} ${result.unit}` : "—", color: "text-blue-700" },
                  { label: lang === "ar" ? "الانحراف المعياري" : "Std Dev", value: result?.stdDeviation ?? "—", color: "text-purple-700" },
                  { label: lang === "ar" ? "ناجح / الكل" : "Pass / Total", value: `${passing} / ${rawValues.length}`, color: "text-teal-700" },
                  {
                    label: lang === "ar" ? "الحالة" : "Status",
                    value: isPass ? (lang === "ar" ? "ناجح" : "PASS") : isFail ? (lang === "ar" ? "راسب" : "FAIL") : "—",
                    color: isPass ? "text-green-700" : isFail ? "text-red-700" : "text-gray-500",
                  },
                ].map(s => (
                  <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* ── Report (single entry: concrete / specialized / order / legacy / batch) ── */}
              <div className="flex gap-2">
                {reportUrl &&
                  wrapDisabledWithTooltip(
                    dialogSamplePending,
                    dialogSampleDisabledWarning,
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-1"
                      disabled={dialogSamplePending}
                      onClick={handleOpenReport}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {lang === "ar" ? "فتح التقرير" : "Open report"}
                    </Button>
                  )}
              </div>

              {/* ── Decision Buttons ──────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {wrapDisabledWithTooltip(
                  dialogSamplePending,
                  dialogSampleDisabledWarning,
                  <button
                    type="button"
                    disabled={dialogSamplePending}
                    onClick={() => setDecision("approved")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                      decision === "approved"
                        ? "border-green-500 bg-green-50 text-green-800 shadow-md"
                        : "border-border bg-background text-muted-foreground hover:border-green-300 hover:bg-green-50/50"
                    } ${dialogSamplePending ? "opacity-60" : ""}`}
                  >
                    <CheckSquare className={`w-7 h-7 ${decision === "approved" ? "text-green-600" : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold">
                      {lang === "ar" ? "اعتماد ✓" : "Approve ✓"}
                    </span>
                    <span className="text-[10px] opacity-70 text-center leading-tight">
                      {lang === "ar" ? "النتيجة مقبولة" : "Result accepted"}
                    </span>
                  </button>
                )}
                {wrapDisabledWithTooltip(
                  dialogSamplePending,
                  dialogSampleDisabledWarning,
                  <button
                    type="button"
                    disabled={dialogSamplePending}
                    onClick={() => setDecision("needs_revision")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                      decision === "needs_revision"
                        ? "border-amber-500 bg-amber-50 text-amber-800 shadow-md"
                        : "border-border bg-background text-muted-foreground hover:border-amber-300 hover:bg-amber-50/50"
                    } ${dialogSamplePending ? "opacity-60" : ""}`}
                  >
                    <RotateCcw className={`w-7 h-7 ${decision === "needs_revision" ? "text-amber-600" : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold">
                      {lang === "ar" ? "طلب مراجعة ↺" : "Revision ↺"}
                    </span>
                    <span className="text-[10px] opacity-70 text-center leading-tight">
                      {lang === "ar" ? "إعادة للفني" : "Return to technician"}
                    </span>
                  </button>
                )}
                {wrapDisabledWithTooltip(
                  dialogSamplePending,
                  dialogSampleDisabledWarning,
                  <button
                    type="button"
                    disabled={dialogSamplePending}
                    onClick={() => setDecision("rejected")}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                      decision === "rejected"
                        ? "border-red-500 bg-red-50 text-red-800 shadow-md"
                        : "border-border bg-background text-muted-foreground hover:border-red-300 hover:bg-red-50/50"
                    } ${dialogSamplePending ? "opacity-60" : ""}`}
                  >
                    <XCircle className={`w-7 h-7 ${decision === "rejected" ? "text-red-600" : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold">
                      {lang === "ar" ? "رفض ✗" : "Reject ✗"}
                    </span>
                    <span className="text-[10px] opacity-70 text-center leading-tight">
                      {lang === "ar" ? "النتيجة مرفوضة" : "Result is rejected"}
                    </span>
                  </button>
                )}
              </div>

              {/* Reason / Comments — required only for rejection/revision */}
              <div className="space-y-1.5">
                <Label htmlFor="comments" className="flex items-center gap-1">
                  {lang === "ar" ? "الملاحظات / سبب القرار" : "Notes / Reason"}
                  {(decision === "rejected" || decision === "needs_revision") && (
                    <span className="text-red-500 text-xs">
                      {lang === "ar" ? " (إلزامي)" : " (required)"}
                    </span>
                  )}
                  {decision === "approved" && (
                    <span className="text-muted-foreground text-xs">
                      {lang === "ar" ? " (اختياري)" : " (optional)"}
                    </span>
                  )}
                </Label>
                <Textarea
                  id="comments"
                  rows={3}
                  placeholder={
                    decision === "rejected"
                      ? (lang === "ar" ? "اكتب سبب الرفض بوضوح..." : "Clearly state the reason for rejection...")
                      : decision === "needs_revision"
                      ? (lang === "ar" ? "اكتب ما يجب تعديله أو إعادة فحصه..." : "Describe what needs to be revised or retested...")
                      : (lang === "ar" ? "ملاحظات إضافية (اختياري)..." : "Additional notes (optional)...")
                  }
                  value={comments}
                  disabled={dialogSamplePending}
                  onChange={(e) => setComments(e.target.value)}
                  className={
                    (decision === "rejected" || decision === "needs_revision") && !comments.trim()
                      ? "border-amber-400 focus:border-amber-500"
                      : ""
                  }
                />
                {(decision === "rejected" || decision === "needs_revision") && !comments.trim() && (
                  <p className="text-xs text-amber-600">
                    {lang === "ar"
                      ? "⚠ يجب كتابة سبب القرار عند الرفض أو طلب المراجعة"
                      : "⚠ A reason is required when rejecting or requesting revision"}
                  </p>
                )}
              </div>

              {/* Digital Signature — auto-filled from logged-in user */}
              <div className="space-y-1.5">
                <Label htmlFor="signature">
                  {lang === "ar" ? "التوقيع الرقمي" : "Digital Signature"}
                  <span className="ms-1.5 text-xs text-muted-foreground font-normal">
                    ({lang === "ar" ? "تلقائي باسم المستخدم الحالي" : "auto-filled from current user"})
                  </span>
                </Label>
                <div className="flex items-center gap-2 border rounded px-3 py-2 text-sm bg-muted/30">
                  <span className="text-primary font-semibold flex-1">{signature || (lang === "ar" ? "جاري التحميل..." : "Loading...")}</span>
                  <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE")}</span>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-1">
                {wrapDisabledWithTooltip(
                  dialogSamplePending,
                  dialogSampleDisabledWarning,
                  <Button
                    className={`flex-1 ${
                      decision === "approved"
                        ? "bg-green-600 hover:bg-green-700"
                        : decision === "needs_revision"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : decision === "rejected"
                        ? "bg-red-600 hover:bg-red-700"
                        : ""
                    }`}
                    disabled={
                      dialogSamplePending ||
                      !decision ||
                      managerReview.isPending ||
                      ((decision === "rejected" || decision === "needs_revision") && !comments.trim())
                    }
                    onClick={() => handleReview()}
                  >
                    {managerReview.isPending
                      ? (lang === "ar" ? "جاري الإرسال..." : "Submitting...")
                      : decision === "approved"
                      ? (lang === "ar" ? "✓ تأكيد الاعتماد" : "✓ Confirm Approval")
                      : decision === "needs_revision"
                      ? (lang === "ar" ? "↺ إرسال طلب المراجعة" : "↺ Send Revision Request")
                      : decision === "rejected"
                      ? (lang === "ar" ? "✗ تأكيد الرفض" : "✗ Confirm Rejection")
                      : (lang === "ar" ? "تقديم المراجعة" : "Submit Review")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedSample(null)}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-sm font-medium">{lang === "ar" ? "لم يتم إدخال نتائج الاختبار بعد" : "No test results submitted yet"}</p>
              <p className="text-xs text-muted-foreground">{lang === "ar" ? "يجب على الفني إدخال نتائج الاختبار أولاً" : "The technician must submit test results first"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
