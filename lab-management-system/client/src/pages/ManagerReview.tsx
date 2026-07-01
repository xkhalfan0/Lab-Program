import DashboardLayout from "@/components/DashboardLayout";
import { RetestBadge } from "@/components/RetestBadge";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ReviewDecisionTiles,
  ReviewDialogBody,
  ReviewDialogFooter,
  ReviewDialogLoading,
  ReviewDialogShell,
  ReviewNotesField,
  ReviewReportAction,
  ReviewSection,
  ReviewSignatureField,
  ReviewStatusNotice,
} from "@/components/ReviewDialogParts";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListFilterBar } from "@/components/ListFilterBar";
import { applySampleFilters, hasActiveListFilters } from "@/lib/listFilters";
import { ReviewSampleListBody } from "@/components/TestDisplay";
import {
  CheckCircle2,
  AlertCircle,
  Building2,
  CheckSquare,
  ClipboardCheck,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo, type ReactElement } from "react";
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
type ListTab = "pending" | "done";

const FINAL_STATUSES = ["reviewed", "approved", "qc_passed", "qc_failed", "clearance_issued", "rejected"];

function isSampleAlreadyDecided(sample: any): boolean {
  return FINAL_STATUSES.includes(sample?.status ?? "");
}

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
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-bold text-primary">{sample.sampleCode}</p>
            <StatusBadge status={sample.status} />
            {state === "new" && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                {lang === "ar" ? "جديدة" : "New"}
              </Badge>
            )}
            <RetestBadge
              retestNumber={(sample as { retestNumber?: number }).retestNumber}
              originalSampleId={(sample as { originalSampleId?: number }).originalSampleId}
              compact
            />
            {PendingDeletionBadge}
            {(sample as any).sector && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Building2 className="w-3 h-3" />
                {sectorLabel((sample as any).sector, lang)}
              </span>
            )}
          </div>
          <ReviewSampleListBody sample={sample} lang={lang} />
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
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
          <ReviewSampleListBody sample={sample} lang={lang} showReceivedAt />
        </div>
        {wrapDisabledWithTooltip(
          hasPendingDeletion,
          DisabledWarning,
          <span className="inline-flex shrink-0">
            <ChevronRight className={`w-4 h-4 text-muted-foreground ${lang === "ar" ? "rotate-180" : ""}`} />
          </span>,
        )}
      </CardContent>
    </Card>
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
  sampleId?: number;
  distId?: number;
  dist: { testType?: string } | undefined;
  legacyResult: { chartsData?: unknown } | undefined;
  hasSpecializedForDistribution: boolean;
  orderId?: number;
  hasLegacyResult: boolean;
}): string | null {
  const {
    sampleId,
    distId,
    dist,
    legacyResult,
    hasSpecializedForDistribution,
    orderId,
    hasLegacyResult,
  } = opts;
  // If there's an order, always open the batch report (shows all tests together)
  if (orderId != null && sampleId != null) return `/batch-report/${sampleId}/${orderId}`;
  if (!distId) return null;
  if (isConcreteCubeReport(dist, legacyResult)) return `/concrete-report/${distId}`;
  if (hasSpecializedForDistribution) return `/test-report/${distId}`;
  if (hasLegacyResult) return `/test-report/${distId}`;
  return null;
}

export default function ManagerReview() {
  const { lang } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [selectedSample, setSelectedSample] = useState<any>(null);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [comments, setComments] = useState("");
  const [decision, setDecision] = useState<"approved" | "needs_revision" | "rejected" | null>(null);
  const [listTab, setListTab] = useState<ListTab>("pending");
  const [listSearch, setListSearch] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [sampleTypeFilter, setSampleTypeFilter] = useState("all");

  const currentUserSignature = user?.name || user?.username || "";

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
  const pendingCount = reviewSamples.filter(s => getSampleTaskState(s) !== "completed").length;
  const doneCount = reviewSamples.filter(s => getSampleTaskState(s) === "completed").length;

  const listFilters = useMemo(
    () => ({ search: listSearch, sector: sectorFilter, sampleType: sampleTypeFilter, refSearch }),
    [listSearch, sectorFilter, sampleTypeFilter, refSearch],
  );

  const pendingSamples = useMemo(() => {
    const pending = sortedReviewSamples.filter(s => getSampleTaskState(s) !== "completed");
    return applySampleFilters(pending, listFilters);
  }, [sortedReviewSamples, listFilters]);

  const doneSamples = useMemo(() => {
    const done = sortedReviewSamples.filter(s => getSampleTaskState(s) === "completed");
    return applySampleFilters(done, listFilters);
  }, [sortedReviewSamples, listFilters]);

  const tabSamples = listTab === "pending" ? pendingSamples : doneSamples;

  const handleOpenSample = (sample: any) => {
    setSelectedSample(sample);
    setComments("");
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
    const autoSignature = currentUserSignature || `Supervisor — ${new Date().toLocaleDateString()}`;
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
        sampleId: selectedSample?.id,
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

  // Derive overall compliance from result
  const overallCompliance = isSpecialized
    ? (specResult?.overallResult ?? "pending")
    : (result?.complianceStatus ?? "pending");

  const alreadyDecided = isSampleAlreadyDecided(selectedSample);

  const handleOpenReport = () => {
    if (!reportUrl) {
      toast.error(
        lang === "ar" ? "لا يوجد رابط تقرير لهذه العينة" : "No report is available for this sample yet."
      );
      return;
    }
    window.open(reportUrl, "_blank");
  };

  const tabTriggerClass =
    "group flex-1 min-w-0 rounded-lg border border-transparent px-4 py-3 text-sm font-semibold transition-all " +
    "text-muted-foreground hover:text-foreground hover:bg-white/60 " +
    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm " +
    "data-[state=active]:border-slate-200 data-[state=active]:ring-1 data-[state=active]:ring-primary/20 " +
    "data-[state=active]:[&_svg]:text-primary";

  const tabBadgeClass =
    "ms-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold " +
    "bg-slate-200 text-slate-700 group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary";

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

        <Tabs value={listTab} onValueChange={(v) => setListTab(v as ListTab)} className="w-full">
          <TabsList className="w-full h-auto p-1.5 bg-slate-100 border border-slate-200 rounded-xl flex gap-1">
            <TabsTrigger value="pending" className={tabTriggerClass}>
              <ClipboardCheck className="w-4 h-4 me-2 shrink-0" />
              <span className="truncate">{lang === "ar" ? "بانتظار المراجعة" : "To Review"}</span>
              <span className={tabBadgeClass}>{pendingCount}</span>
            </TabsTrigger>
            <TabsTrigger value="done" className={tabTriggerClass}>
              <CheckCircle2 className="w-4 h-4 me-2 shrink-0" />
              <span className="truncate">{lang === "ar" ? "مكتمل" : "Done"}</span>
              <span className={tabBadgeClass}>{doneCount}</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
        <ListFilterBar
          lang={lang}
          search={listSearch}
          onSearchChange={setListSearch}
          searchPlaceholder={
            lang === "ar"
              ? "بحث برمز العينة، العقد، المقاول، أو المشروع..."
              : "Search by sample code, contract, contractor, or project..."
          }
          refSearch={refSearch}
          onRefSearchChange={setRefSearch}
          sector={sectorFilter}
          onSectorChange={setSectorFilter}
          sampleType={sampleTypeFilter}
          onSampleTypeChange={setSampleTypeFilter}
          showClear={hasActiveListFilters(listFilters)}
          onClear={() => {
            setListSearch("");
            setRefSearch("");
            setSectorFilter("all");
            setSampleTypeFilter("all");
          }}
          resultCount={tabSamples.length}
        />

        <TabsContent value="pending" className="mt-0 space-y-3">
          {pendingSamples.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <CheckSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  {lang === "ar" ? "لا توجد عينات بانتظار مراجعة النتائج" : "No samples awaiting results review"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingSamples.map((sample) => (
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
        </TabsContent>

        <TabsContent value="done" className="mt-0 space-y-3">
          {doneSamples.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  {lang === "ar" ? "لا توجد نتائج مكتملة" : "No completed reviews yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {doneSamples.map((sample) => (
                <ManagerReviewArchiveSampleCard
                  key={sample.id}
                  sample={sample}
                  lang={lang}
                  onOpen={handleOpenSample}
                />
              ))}
            </div>
          )}
        </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedSample} onOpenChange={(o) => !o && setSelectedSample(null)}>
        <ReviewDialogShell
          lang={lang}
          icon={ClipboardCheck}
          title={lang === "ar" ? "مراجعة النتائج" : "Supervisor Review"}
          code={selectedSample?.sampleCode}
          badge={selectedSample ? (
            <span className="flex items-center gap-2">
              {dialogSamplePendingBadge}
              <StatusBadge status={selectedSample.status} />
            </span>
          ) : undefined}
        >
          {isLoadingResults ? (
            <ReviewDialogLoading lang={lang} />
          ) : hasResult ? (
            <>
              <ReviewDialogBody>
                {reportUrl && (
                  <ReviewReportAction lang={lang} onClick={handleOpenReport} />
                )}

                {alreadyDecided && (
                  <ReviewStatusNotice variant="success">
                    {lang === "ar"
                      ? "تم اتخاذ قرار على هذه العينة. يمكنك مراجعة التقرير أعلاه."
                      : "A decision has already been made. You can view the report above."}
                  </ReviewStatusNotice>
                )}

                {!alreadyDecided && (
                  <>
                    {isSpecialized && specResult && (
                      <ReviewSection
                        title={lang === "ar" ? "نتيجة الاختبار" : "Test Result"}
                        description={lang === "ar" ? "ملخص الاختبار المتخصص" : "Specialized test summary"}
                      >
                        <div className="flex items-center justify-between gap-4 rounded-xl border bg-slate-50/80 px-5 py-4">
                          <div className="min-w-0">
                            <p className="text-lg font-bold">{specResult.testTypeCode}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {specResult.testedBy ?? "—"}
                              {specResult.testDate &&
                                ` · ${new Date(specResult.testDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}`}
                            </p>
                          </div>
                          <Badge
                            className={`px-3 py-1 text-sm font-bold ${
                              specResult.overallResult === "pass"
                                ? "bg-green-100 text-green-800"
                                : specResult.overallResult === "fail"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {specResult.overallResult === "pass"
                              ? lang === "ar"
                                ? "ناجح"
                                : "PASS"
                              : specResult.overallResult === "fail"
                                ? lang === "ar"
                                  ? "راسب"
                                  : "FAIL"
                                : lang === "ar"
                                  ? "قيد المراجعة"
                                  : "Pending"}
                          </Badge>
                        </div>
                      </ReviewSection>
                    )}

                    <ReviewSection
                      title={lang === "ar" ? "قرار المراجعة" : "Your Decision"}
                      description={lang === "ar" ? "اختر أحد الخيارات ثم أضف ملاحظاتك" : "Select an option, then add your notes"}
                    >
                      {wrapDisabledWithTooltip(
                        dialogSamplePending,
                        dialogSampleDisabledWarning,
                        <ReviewDecisionTiles
                          lang={lang}
                          decision={decision}
                          disabled={dialogSamplePending}
                          onSelect={setDecision}
                        />,
                      )}
                    </ReviewSection>

                    <ReviewSection title={lang === "ar" ? "التفاصيل والتوقيع" : "Details & Signature"}>
                      <div className="space-y-4">
                        <ReviewNotesField
                          lang={lang}
                          decision={decision}
                          value={comments}
                          disabled={dialogSamplePending}
                          onChange={setComments}
                        />

                        <ReviewSignatureField
                          lang={lang}
                          signature={currentUserSignature}
                          loading={authLoading}
                        />
                      </div>
                    </ReviewSection>
                  </>
                )}
              </ReviewDialogBody>

              <ReviewDialogFooter
                lang={lang}
                readOnly={alreadyDecided}
                onClose={() => setSelectedSample(null)}
                onSubmit={() => handleReview()}
                submitLabel={
                  managerReview.isPending
                    ? lang === "ar"
                      ? "جاري الإرسال..."
                      : "Submitting..."
                    : decision === "approved"
                      ? lang === "ar"
                        ? "تأكيد الاعتماد"
                        : "Confirm Approval"
                      : decision === "needs_revision"
                        ? lang === "ar"
                          ? "إرسال طلب المراجعة"
                          : "Send Revision Request"
                        : decision === "rejected"
                          ? lang === "ar"
                            ? "تأكيد الرفض"
                            : "Confirm Rejection"
                          : lang === "ar"
                            ? "تقديم المراجعة"
                            : "Submit Review"
                }
                submitting={managerReview.isPending}
                submitDisabled={
                  dialogSamplePending ||
                  !decision ||
                  ((decision === "rejected" || decision === "needs_revision") && !comments.trim())
                }
                submitVariant={decision}
              />
            </>
          ) : (
            <ReviewDialogBody>
              <div className="flex flex-col items-center py-6 text-center">
                <AlertCircle className="mb-3 h-10 w-10 text-amber-400" />
                <p className="text-sm font-medium">
                  {lang === "ar" ? "لم يتم إدخال نتائج الاختبار بعد" : "No test results submitted yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "ar" ? "يجب على الفني إدخال نتائج الاختبار أولاً" : "The technician must submit test results first"}
                </p>
              </div>
            </ReviewDialogBody>
          )}
        </ReviewDialogShell>
      </Dialog>
    </DashboardLayout>
  );
}
