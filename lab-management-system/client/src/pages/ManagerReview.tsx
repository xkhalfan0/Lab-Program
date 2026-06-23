import DashboardLayout from "@/components/DashboardLayout";
import { RetestBadge } from "@/components/RetestBadge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListFilterBar } from "@/components/ListFilterBar";
import { applySampleFilters, hasActiveListFilters } from "@/lib/listFilters";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import { SampleTestNamesLine } from "@/components/TestDisplay";
import {
  CheckSquare,
  XCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  ClipboardCheck,
  FileText,
  ChevronRight,
  ExternalLink,
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
        <div className="space-y-1.5 min-w-0">
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
          <p className="text-xs text-muted-foreground">
            {sample.contractorName} — {(sample as any).contractNumber ?? "—"}
          </p>
          <SampleTestNamesLine testNames={(sample as { testNames?: string[] }).testNames} />
          <p className="text-[11px] text-muted-foreground/80">
            {SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType}
          </p>
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
          <SampleTestNamesLine testNames={(sample as { testNames?: string[] }).testNames} />
          <p className="text-[11px] text-muted-foreground/80">
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

              {/* Open Report Button — always visible when report exists */}
              {reportUrl && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
                  onClick={handleOpenReport}
                >
                  <ExternalLink className="w-4 h-4" />
                  {lang === "ar" ? "فتح تقرير الاختبار" : "Open Test Report"}
                </Button>
              )}

              {/* Already-decided banner */}
              {alreadyDecided && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">
                      {lang === "ar" ? "تمت المراجعة بالفعل" : "Review already completed"}
                    </p>
                    <p className="text-xs text-green-700">
                      {lang === "ar"
                        ? "تم اتخاذ قرار على هذه العينة. يمكنك مراجعة التقرير أعلاه."
                        : "A decision has already been made for this sample. You can view the report above."}
                    </p>
                  </div>
                  <div className="ms-auto shrink-0">
                    <StatusBadge status={selectedSample?.status} />
                  </div>
                </div>
              )}

              {/* ── Decision Buttons — only shown if not already decided ─── */}
              {!alreadyDecided && <><div className="grid grid-cols-3 gap-3">
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
                  <span className="text-primary font-semibold flex-1">
                    {currentUserSignature || (authLoading ? (lang === "ar" ? "جاري التحميل..." : "Loading...") : "—")}
                  </span>
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
              </>}
              {/* Close button for already-decided samples */}
              {alreadyDecided && (
                <Button variant="outline" className="w-full" onClick={() => setSelectedSample(null)}>
                  {lang === "ar" ? "إغلاق" : "Close"}
                </Button>
              )}
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
