import DashboardLayout from "@/components/DashboardLayout";
import { RetestBadge } from "@/components/RetestBadge";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ReviewAttestation,
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
  ReviewTimeline,
} from "@/components/ReviewDialogParts";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListFilterBar } from "@/components/ListFilterBar";
import { applyClearanceFilters, applySampleFilters, hasActiveListFilters } from "@/lib/listFilters";
import { ReviewSampleListBody } from "@/components/TestDisplay";
import {
  ShieldCheck, CheckCircle, XCircle, ClipboardCheck,
  BadgeCheck, FlaskConical, DollarSign, CheckCircle2, Clock,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useMemo, type ReactElement } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Task state helpers ───────────────────────────────────────────────────────
type QcListTab = "pending" | "done";

/** Primary workspace sections — full-width segment control */
const mainTabListClass =
  "w-full h-auto p-1.5 bg-white border border-slate-200 rounded-xl shadow-sm flex gap-1.5";

const mainTabTriggerClass =
  "group flex-1 min-w-0 rounded-lg px-4 py-3.5 text-base font-bold transition-all " +
  "text-slate-600 hover:text-slate-900 hover:bg-slate-50 " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md " +
  "data-[state=active]:hover:bg-primary/90 data-[state=active]:[&_svg]:text-primary-foreground";

const mainTabBadgeClass =
  "ms-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold " +
  "bg-red-500 text-white ring-2 ring-white group-data-[state=active]:ring-primary/40";

/** Sub-filters within a section — compact underline tabs */
const innerTabListClass =
  "w-full h-auto p-0 bg-transparent border-0 border-b border-slate-200 rounded-none flex gap-1";

const innerTabTriggerClass =
  "group relative flex-1 min-w-0 rounded-none border-0 bg-transparent px-3 pb-2.5 pt-1 text-sm font-medium shadow-none " +
  "text-muted-foreground hover:text-foreground " +
  "data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none " +
  "data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold " +
  "data-[state=active]:[&_svg]:text-primary";

const innerTabBadgeClass =
  "ms-1.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold " +
  "bg-slate-100 text-slate-600 group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary";

function getClearanceTaskState(req: any): "new" | "incomplete" | "completed" {
  if (req.status !== "pending") return "completed";
  if (req.qcReadAt) return "incomplete";
  return "new";
}

const QC_DONE_SAMPLE_STATUSES = new Set(["qc_passed", "qc_failed", "clearance_issued"]);

function getSampleTaskState(sample: any): "new" | "incomplete" | "completed" {
  if (QC_DONE_SAMPLE_STATUSES.has(sample.status)) return "completed";
  if (sample.status === "approved") return "new";
  if (sample.status === "revision_requested") return "incomplete";
  return "completed";
}

/** QC can act only when the manager has approved and the sample awaits QC (including re-review after revision). */
function canTakeQcAction(sample: { status?: string } | null | undefined): boolean {
  return sample?.status === "approved";
}

function pickPrimaryResult<T extends { qcReviewedAt?: Date | string | null }>(rows: T[] | undefined): T | undefined {
  if (!rows?.length) return undefined;
  return rows.find((r) => !r.qcReviewedAt) ?? rows[0];
}

function ClearanceStatusBadge({ status, lang }: { status: string; lang: string }) {
  const labels: Record<string, { en: string; ar: string; className: string }> = {
    pending: { en: "Pending QC", ar: "بانتظار QC", className: "bg-amber-100 text-amber-800 border-amber-200" },
    inventory_ready: { en: "QC Approved", ar: "معتمد QC", className: "bg-blue-100 text-blue-800 border-blue-200" },
    payment_ordered: { en: "Payment Ordered", ar: "أمر دفع", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    docs_uploaded: { en: "Docs Uploaded", ar: "مستندات مرفوعة", className: "bg-purple-100 text-purple-800 border-purple-200" },
    certificate_issued: { en: "Certificate Issued", ar: "شهادة صادرة", className: "bg-green-100 text-green-800 border-green-200" },
    rejected: { en: "Rejected", ar: "مرفوض", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const cfg = labels[status] ?? {
    en: status.replace(/_/g, " "),
    ar: status,
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {lang === "ar" ? cfg.ar : cfg.en}
    </span>
  );
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

function QCReviewActiveSampleCard({
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
              ? "border-l-red-400 bg-red-50/20"
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

function QCReviewArchiveSampleCard({
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
      className={`border-l-4 border-l-green-400 hover:shadow-sm transition-shadow ${
        hasPendingDeletion ? "cursor-not-allowed opacity-90" : "cursor-pointer"
      }`}
      onClick={tryOpen}
    >
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-bold text-primary">{sample.sampleCode}</p>
            <StatusBadge status={sample.status} />
            {PendingDeletionBadge}
          </div>
          <ReviewSampleListBody sample={sample} lang={lang} />
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

// ─── Clearance QC Section ──────────────────────────────────────────────────────
function ClearanceQCSection() {
  const { lang } = useLanguage();
  const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
  const [qcNotes, setQcNotes] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listTab, setListTab] = useState<QcListTab>("pending");

  const { data: requests = [], refetch } = trpc.clearance.list.useQuery();
  const { data: selectedReq } = trpc.clearance.getById.useQuery(
    { id: selectedReqId! },
    { enabled: selectedReqId !== null }
  );

  const qcReview = trpc.clearance.qcReview.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.status === "inventory_ready"
          ? "تمت موافقة QC على الاختبارات — الطلب جاهز لإصدار أمر الدفع"
          : "تم رفض الطلب"
      );
      setReviewOpen(false);
      setSelectedReqId(null);
      setQcNotes("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const markQcRead = trpc.clearance.markQcRead.useMutation();

  const clearanceListFilters = useMemo(() => ({ search: listSearch }), [listSearch]);

  const filteredRequests = useMemo(() => {
    const sorted = [...requests].sort((a, b) => {
      const aDone = getClearanceTaskState(a) === "completed" ? 1 : 0;
      const bDone = getClearanceTaskState(b) === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
    return applyClearanceFilters(sorted, clearanceListFilters);
  }, [requests, clearanceListFilters]);

  const pendingRequests = useMemo(
    () => filteredRequests.filter(r => getClearanceTaskState(r) !== "completed"),
    [filteredRequests],
  );
  const doneRequests = useMemo(
    () => filteredRequests.filter(r => getClearanceTaskState(r) === "completed"),
    [filteredRequests],
  );
  const tabRequests = listTab === "pending" ? pendingRequests : doneRequests;

  const inventory = (selectedReq?.inventoryData ?? []) as any[];

  const handleOpenReq = (req: any) => {
    setSelectedReqId(req.id);
    setQcNotes("");
    setReviewOpen(true);
    // Mark as read
    if (!req.qcReadAt && req.status === "pending") {
      markQcRead.mutate({ id: req.id }, { onSuccess: () => refetch() });
    }
  };

  return (
    <div className="space-y-4">
      <ListFilterBar
        lang={lang}
        search={listSearch}
        onSearchChange={setListSearch}
        searchPlaceholder={
          lang === "ar"
            ? "بحث برقم الطلب، العقد، المقاول، أو المشروع..."
            : "Search by request, contract, contractor, or project..."
        }
        showClear={hasActiveListFilters(clearanceListFilters)}
        onClear={() => setListSearch("")}
        resultCount={tabRequests.length}
      />

      <Tabs value={listTab} onValueChange={(v) => setListTab(v as QcListTab)} className="w-full">
        <TabsList className={innerTabListClass}>
          <TabsTrigger value="pending" className={innerTabTriggerClass}>
            <Clock className="w-4 h-4 me-2 shrink-0" />
            <span className="truncate">{lang === "ar" ? "قيد المراجعة" : "In Review"}</span>
            <span className={innerTabBadgeClass}>{pendingRequests.length}</span>
          </TabsTrigger>
          <TabsTrigger value="done" className={innerTabTriggerClass}>
            <CheckCircle2 className="w-4 h-4 me-2 shrink-0" />
            <span className="truncate">{lang === "ar" ? "معتمد QC" : "QC Approved"}</span>
            <span className={innerTabBadgeClass}>{doneRequests.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-3 space-y-3">
      {pendingRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BadgeCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات بانتظار مراجعة QC" : "No clearance requests awaiting QC review"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {pendingRequests.map(req => {
            const state = getClearanceTaskState(req);
            return (
              <Card
                key={req.id}
                className={`border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                  state === "new"
                    ? "border-l-red-400 bg-red-50/20"
                    : "border-l-amber-400 bg-amber-50/20"
                }`}
                onClick={() => handleOpenReq(req)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">{req.requestCode}</span>
                        <ClearanceStatusBadge status={req.status} lang={lang} />
                        {state === "new" && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                            {lang === "ar" ? "جديدة" : "New"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{req.contractorName}</p>
                      <p className="text-xs text-muted-foreground">
                        {lang === "ar" ? "رقم العقد:" : "Contract:"} {req.contractNumber}
                        {req.contractName && ` — ${req.contractName}`}
                      </p>
                      <div className="flex items-center gap-4 text-xs mt-1">
                        <span className="flex items-center gap-1 text-slate-600">
                          <FlaskConical className="w-3 h-3" />
                          {req.totalTests} {lang === "ar" ? "اختبار" : "tests"}
                        </span>
                        <span className="flex items-center gap-1 text-green-700 font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          {req.passedTests} {lang === "ar" ? "مطابق" : "pass"}
                        </span>
                        {req.failedTests > 0 && (
                          <span className="flex items-center gap-1 text-red-700 font-semibold">
                            <XCircle className="w-3 h-3" />
                            {req.failedTests} {lang === "ar" ? "غير مطابق" : "fail"}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-blue-700 font-semibold">
                          <DollarSign className="w-3 h-3" />
                          {Number(req.totalAmount).toFixed(2)} AED
                        </span>
                      </div>
                    </div>
                    <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 shrink-0" onClick={(e) => { e.stopPropagation(); handleOpenReq(req); }}>
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      {lang === "ar" ? "مراجعة QC" : "QC Review"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="done" className="mt-3 space-y-3">
          {doneRequests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {lang === "ar" ? "لا توجد طلبات معتمدة بعد" : "No QC-approved clearance requests yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {doneRequests.map(req => (
                <Card
                  key={req.id}
                  className="border-l-4 border-l-green-400 cursor-pointer hover:shadow-md transition-shadow opacity-80 hover:opacity-100"
                  onClick={() => handleOpenReq(req)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-primary">{req.requestCode}</span>
                          <ClearanceStatusBadge status={req.status} lang={lang} />
                        </div>
                        <p className="text-sm font-medium">{req.contractorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {lang === "ar" ? "رقم العقد:" : "Contract:"} {req.contractNumber}
                          {req.contractName && ` — ${req.contractName}`}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 ${lang === "ar" ? "rotate-180" : ""}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* QC Clearance Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={o => { if (!o) { setReviewOpen(false); setSelectedReqId(null); } }}>
        <ReviewDialogShell
          lang={lang}
          icon={BadgeCheck}
          title={lang === "ar" ? "مراجعة شهادة براءة الذمة" : "Clearance QC Review"}
          code={selectedReq?.requestCode}
        >
          {selectedReq ? (
            <>
              <ReviewDialogBody>
                <ReviewSection
                  title={lang === "ar" ? "ملخص الطلب" : "Request Summary"}
                  description={lang === "ar" ? "إحصائيات الاختبارات والمبالغ" : "Test counts and amounts"}
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: lang === "ar" ? "الاختبارات" : "Tests", value: selectedReq.totalTests, color: "text-slate-800" },
                      { label: lang === "ar" ? "مطابق" : "Pass", value: selectedReq.passedTests, color: "text-green-700" },
                      { label: lang === "ar" ? "غير مطابق" : "Fail", value: selectedReq.failedTests, color: "text-red-700" },
                      { label: lang === "ar" ? "AED" : "AED", value: Number(selectedReq.totalAmount).toFixed(0), color: "text-blue-700" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border bg-slate-50/80 px-4 py-3 text-center">
                        <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </ReviewSection>

              {/* Inventory Table */}
              {inventory.length > 0 && (() => {
                const CATEGORY_LABELS: Record<string, { en: string; ar: string; badgeClass: string }> = {
                  concrete:   { en: "Concrete",   ar: "خرسانة",  badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
                  soil:       { en: "Soil",        ar: "تربة",    badgeClass: "bg-amber-100 text-amber-800 border-amber-200" },
                  steel:      { en: "Steel",       ar: "حديد",    badgeClass: "bg-gray-100 text-gray-800 border-gray-200" },
                  asphalt:    { en: "Asphalt",     ar: "أسفلت",   badgeClass: "bg-purple-100 text-purple-800 border-purple-200" },
                  aggregates: { en: "Aggregates",  ar: "ركام",    badgeClass: "bg-green-100 text-green-800 border-green-200" },
                  other:      { en: "Other",       ar: "أخرى",    badgeClass: "bg-slate-100 text-slate-800 border-slate-200" },
                };
                const grouped: Record<string, any[]> = {};
                for (const item of inventory) {
                  const cat = item.category || "other";
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(item);
                }
                const countByType = (items: any[]) => {
                  const m: Record<string, { name: string; nameAr: string; count: number; pass: number; fail: number; amount: number }> = {};
                  for (const it of items) {
                    const k = it.testName || "Unknown";
                    if (!m[k]) m[k] = { name: it.testName, nameAr: it.testNameAr || it.testName, count: 0, pass: 0, fail: 0, amount: 0 };
                    m[k].count++;
                    if (it.result === "pass") m[k].pass++;
                    else if (it.result === "fail") m[k].fail++;
                    m[k].amount += Number(it.price);
                  }
                  return Object.values(m);
                };
                return (
                  <ReviewSection
                    title={lang === "ar" ? "قائمة الاختبارات" : "Test Inventory"}
                    description={lang === "ar" ? "تفاصيل الاختبارات حسب الفئة" : "Breakdown by test category"}
                  >
                    <div className="space-y-3">
                    {Object.entries(grouped).map(([cat, items]) => {
                      const catLabel = CATEGORY_LABELS[cat] ?? { en: cat, ar: cat, badgeClass: "bg-slate-100 text-slate-800 border-slate-200" };
                      const rows = countByType(items);
                      return (
                        <div key={cat} className="overflow-hidden rounded-xl border">
                          <div className={`border-b px-4 py-2 text-sm font-bold ${catLabel.badgeClass}`}>
                            {lang === "ar" ? catLabel.ar : catLabel.en}
                          </div>
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "نوع الاختبار" : "Test Type"}</th>
                                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "العدد" : "Count"}</th>
                                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "ناجح" : "Pass"}</th>
                                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "راسب" : "Fail"}</th>
                                <th className="px-4 py-2.5 text-end text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lang === "ar" ? "المبلغ" : "Amount"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-4 py-2.5 font-medium">{lang === "ar" ? r.nameAr : r.name}</td>
                                  <td className="px-3 py-2.5 text-center tabular-nums">{r.count}</td>
                                  <td className="px-3 py-2.5 text-center font-semibold text-green-700 tabular-nums">{r.pass}</td>
                                  <td className="px-3 py-2.5 text-center font-semibold text-red-700 tabular-nums">{r.fail || "—"}</td>
                                  <td className="px-4 py-2.5 text-end font-mono tabular-nums">{r.amount.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                    </div>
                  </ReviewSection>
                );
              })()}

              {/* Decision */}
              {selectedReq.status === "pending" ? (
                <ReviewSection
                  title={lang === "ar" ? "قرار ضبط الجودة" : "QC Decision"}
                  description={lang === "ar" ? "اعتماد أو رفض طلب شهادة براءة الذمة" : "Approve or reject the clearance request"}
                >
                  <ReviewNotesField
                    lang={lang}
                    decision={null}
                    value={qcNotes}
                    onChange={setQcNotes}
                  />
                </ReviewSection>
              ) : (
                <ReviewStatusNotice variant="success">
                  {lang === "ar" ? "تمت مراجعة هذا الطلب." : "This request has already been reviewed."}
                </ReviewStatusNotice>
              )}
              </ReviewDialogBody>
              {selectedReq.status === "pending" && (
                <div className="sticky bottom-0 flex gap-3 border-t bg-white/95 px-6 py-4 backdrop-blur-sm">
                  <Button
                    size="lg"
                    className="flex-1 bg-green-600 text-base hover:bg-green-700"
                    disabled={qcReview.isPending}
                    onClick={() => qcReview.mutate({ id: selectedReq.id, approved: true, notes: qcNotes || undefined })}
                  >
                    {qcReview.isPending ? (lang === "ar" ? "جاري..." : "Submitting...") : (lang === "ar" ? "اعتماد QC" : "QC Approve")}
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 bg-red-600 text-base hover:bg-red-700"
                    disabled={qcReview.isPending}
                    onClick={() => qcReview.mutate({ id: selectedReq.id, approved: false, notes: qcNotes || undefined })}
                  >
                    {lang === "ar" ? "رفض" : "Reject"}
                  </Button>
                  <Button size="lg" variant="outline" className="text-base" onClick={() => { setReviewOpen(false); setSelectedReqId(null); }}>
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              )}
              {selectedReq.status !== "pending" && (
                <ReviewDialogFooter
                  lang={lang}
                  readOnly
                  onClose={() => { setReviewOpen(false); setSelectedReqId(null); }}
                />
              )}
            </>
          ) : (
            <ReviewDialogLoading lang={lang} />
          )}
        </ReviewDialogShell>
      </Dialog>
    </div>
  );
}

// ─── Main QC Review Page ───────────────────────────────────────────────────────
export default function QCReview() {
  const { lang } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [selectedSample, setSelectedSample] = useState<any>(null);
  const [comments, setComments] = useState("");
  const [decision, setDecision] = useState<"approved" | "needs_revision" | "rejected" | null>(null);

  const currentUserSignature = user?.name || user?.username || "";
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [sampleListTab, setSampleListTab] = useState<QcListTab>("pending");
  const [listSearch, setListSearch] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [sampleTypeFilter, setSampleTypeFilter] = useState("all");

  const selectedSampleId = Number(selectedSample?.id ?? 0);

  const { data: samples, refetch } = trpc.samples.list.useQuery();
  const { data: clearanceRequests = [] } = trpc.clearance.list.useQuery();
  const { data: results, isLoading: isLegacyResultsLoading, refetch: refetchLegacyResults } = trpc.testResults.bySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );
  const { data: specializedResults, isLoading: isSpecializedResultsLoading, refetch: refetchSpecializedResults } = trpc.specializedTests.getBySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );
  const { data: distributions, isLoading: isDistributionsLoading, refetch: refetchDistributions } = trpc.distributions.bySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );
  const { data: reviews, isLoading: isReviewsLoading, refetch: refetchReviews } = trpc.reviews.bySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );
  const { data: sampleOrders } = trpc.orders.bySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );

  const qcReview = trpc.reviews.qcReview.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تقديم ضبط الجودة بنجاح" : "QC review submitted successfully");
      setSelectedSample(null);
      setComments("");
      setDecision(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const {
    hasPendingDeletion: dialogSamplePending,
    PendingDeletionBadge: dialogSamplePendingBadge,
    DisabledWarning: dialogSampleDisabledWarning,
  } = useDeletionStatus("samples", selectedSample?.id ?? 0);

  // All samples that have been approved (ready for QC) or already QC'd
  const qcSamples = samples?.filter((s) =>
    ["approved", "revision_requested", "qc_passed", "qc_failed", "clearance_issued", "rejected"].includes(s.status)
  ) ?? [];

  const newCount = qcSamples.filter(s => getSampleTaskState(s) === "new").length;
  const clearanceNewCount = clearanceRequests.filter(r => getClearanceTaskState(r) === "new").length;

  const sampleListFilters = useMemo(
    () => ({ search: listSearch, sector: sectorFilter, sampleType: sampleTypeFilter, refSearch }),
    [listSearch, sectorFilter, sampleTypeFilter, refSearch],
  );

  const filteredSamples = useMemo(() => {
    const sorted = [...qcSamples].sort((a, b) => {
      const aDone = getSampleTaskState(a) === "completed" ? 1 : 0;
      const bDone = getSampleTaskState(b) === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(b.updatedAt ?? b.receivedAt ?? b.createdAt ?? 0).getTime() -
        new Date(a.updatedAt ?? a.receivedAt ?? a.createdAt ?? 0).getTime();
    });
    return applySampleFilters(sorted, sampleListFilters);
  }, [qcSamples, sampleListFilters]);

  const pendingSamples = useMemo(
    () => filteredSamples.filter(s => getSampleTaskState(s) !== "completed"),
    [filteredSamples],
  );
  const doneSamples = useMemo(
    () => filteredSamples.filter(s => getSampleTaskState(s) === "completed"),
    [filteredSamples],
  );
  const tabSamples = sampleListTab === "pending" ? pendingSamples : doneSamples;

  const openSample = (s: any) => {
    setSelectedSample(s);
    setComments("");
    setDecision(null);
    setLoadTimedOut(false);
  };

  const dist = distributions?.[0];
  const result = pickPrimaryResult(results);
  const specializedResult = pickPrimaryResult(specializedResults);
  const hasAnyResult =
    (results?.length ?? 0) > 0 ||
    (specializedResults?.length ?? 0) > 0 ||
    (distributions?.some((d) => d.status === "completed") ?? false);

  // Compute report URL — prefer batch report when an order exists
  const reportUrl = (() => {
    const orderId = sampleOrders?.[0]?.id;
    const sampleId = selectedSample?.id;
    // If there's an order, always open the batch report (shows all tests together)
    if (orderId != null && sampleId != null) return `/batch-report/${sampleId}/${orderId}`;

    // Resolve the best distribution ID available
    const distId = dist?.id ?? (result as { distributionId?: number } | undefined)?.distributionId ?? null;
    if (!distId) return null;

    // Detect concrete-cube test by code OR by chartsData.source (legacy results)
    const tt = (dist?.testType ?? "").toLowerCase();
    const chartsSource = (result?.chartsData as { source?: string } | undefined)?.source;
    const isConcreteCube =
      tt === "conc_cube" || tt.includes("conc_cube") || tt === "concrete_compression" || tt === "concrete" ||
      chartsSource === "concrete_cubes";

    if (isConcreteCube) return `/concrete-report/${distId}`;
    if (specializedResult?.distributionId === distId) return `/test-report/${distId}`;
    if (result) return `/test-report/${distId}`;
    return null;
  })();
  const isModalDataLoading = !!selectedSample && (
    isLegacyResultsLoading ||
    isSpecializedResultsLoading ||
    isDistributionsLoading ||
    isReviewsLoading
  );
  const managerReview = reviews?.find((r) => r.reviewType === "manager_review");
  const priorQcReviews = reviews?.filter((r) => r.reviewType === "qc_review") ?? [];
  const canAct = canTakeQcAction(selectedSample);
  const isQcAlreadyDone = !canAct;

  const lastApprovalSignature =
    managerReview?.signature ||
    specializedResult?.managerReviewedByName ||
    result?.managerReviewedByName ||
    null;
  const lastApprovalDate =
    managerReview?.createdAt ||
    specializedResult?.managerReviewedAt ||
    result?.managerReviewedAt ||
    null;

  const timelineItems = useMemo(() => {
    const items: Array<{
      id: string | number;
      kind: "supervisor" | "qc" | "neutral";
      title: string;
      decision?: string;
      comments?: string | null;
      signature?: string | null;
      date?: Date | string | null;
      lang: string;
    }> = [];
    if (managerReview) {
      items.push({
        id: `mgr-${managerReview.id}`,
        kind: "supervisor",
        title: lang === "ar" ? "مراجعة المشرف" : "Supervisor Review",
        decision: managerReview.decision,
        comments: managerReview.comments,
        signature: managerReview.signature || lastApprovalSignature,
        date: managerReview.createdAt || lastApprovalDate,
        lang,
      });
    }
    for (const review of priorQcReviews) {
      items.push({
        id: review.id,
        kind: canAct ? "neutral" : "qc",
        title: canAct
          ? lang === "ar"
            ? "مراجعة ضبط الجودة السابقة"
            : "Previous QC Review"
          : lang === "ar"
            ? "مراجعة ضبط الجودة"
            : "QC Review",
        decision: review.decision,
        comments: review.comments,
        signature: review.signature,
        date: review.createdAt,
        lang,
      });
    }
    return items;
  }, [managerReview, priorQcReviews, canAct, lang, lastApprovalSignature, lastApprovalDate]);


  useEffect(() => {
    if (selectedSampleId > 0) {
      console.debug("[QCReview] fetching modal results for sampleId:", selectedSampleId);
    }
  }, [selectedSampleId]);

  useEffect(() => {
    if (!selectedSample || !isModalDataLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [selectedSample, isModalDataLoading]);

  const handleRetryLoad = () => {
    setLoadTimedOut(false);
    refetchLegacyResults();
    refetchSpecializedResults();
    refetchDistributions();
    refetchReviews();
  };

  const handleReview = () => {
    if (isQcAlreadyDone) {
      toast.info(
        lang === "ar"
          ? "تمت مراجعة ضبط الجودة لهذه العينة مسبقاً."
          : "This sample has already completed QC review."
      );
      return;
    }
    if (dialogSamplePending) {
      toast.warning(
        lang === "ar"
          ? "طلب حذف قيد الانتظار لهذه العينة."
          : "A deletion request is pending for this sample."
      );
      return;
    }
    if (!decision) { toast.error(lang === "ar" ? "يرجى اختيار قرار" : "Please select a decision"); return; }
    if (!hasAnyResult) {
      toast.error(lang === "ar" ? "لم يتم العثور على نتيجة" : "No test result found");
      return;
    }
    // Enforce mandatory notes on reject/revision
    if ((decision === "rejected" || decision === "needs_revision") && !comments.trim()) {
      toast.error(lang === "ar" ? "يجب كتابة ملاحظات عند الرفض أو طلب المراجعة" : "Notes are required when rejecting or requesting revision");
      return;
    }
    const autoSignature = currentUserSignature || `QC — ${new Date().toISOString()}`;
    qcReview.mutate({
      testResultId: result?.id,
      specializedTestResultId: specializedResult?.id,
      sampleId: selectedSample.id,
      decision,
      comments: comments || undefined,
      signature: autoSignature,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">{lang === "ar" ? "ضبط الجودة" : "Quality Control"}</h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "الفحص النهائي للجودة — مراجعة العينات وطلبات شهادة براءة الذمة" : "Final quality check — sample reviews and clearance requests"}
          </p>
        </div>

        <Tabs defaultValue="samples" className="w-full">
          <TabsList className={mainTabListClass}>
            <TabsTrigger value="samples" className={mainTabTriggerClass}>
              <ShieldCheck className="w-5 h-5 me-2 shrink-0" />
              <span className="truncate">
                {lang === "ar" ? "فحص جودة نتائج العينات" : "Sample Results Quality Check"}
              </span>
              {newCount > 0 && (
                <span className={mainTabBadgeClass}>
                  {newCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="clearance" className={mainTabTriggerClass}>
              <BadgeCheck className="w-5 h-5 me-2 shrink-0" />
              <span className="truncate">
                {lang === "ar" ? "طلبات شهادة براءة الذمة — مراجعة QC" : "Clearance Requests — QC Review"}
              </span>
              {clearanceNewCount > 0 && (
                <span className={mainTabBadgeClass}>
                  {clearanceNewCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="samples" className="mt-4 space-y-4">
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
            showClear={hasActiveListFilters(sampleListFilters)}
            onClear={() => {
              setListSearch("");
              setRefSearch("");
              setSectorFilter("all");
              setSampleTypeFilter("all");
            }}
            resultCount={tabSamples.length}
          />

          <Tabs value={sampleListTab} onValueChange={(v) => setSampleListTab(v as QcListTab)} className="w-full">
            <TabsList className={innerTabListClass}>
              <TabsTrigger value="pending" className={innerTabTriggerClass}>
                <Clock className="w-3.5 h-3.5 me-1.5 shrink-0" />
                <span className="truncate">{lang === "ar" ? "قيد المراجعة" : "In Review"}</span>
                <span className={innerTabBadgeClass}>{pendingSamples.length}</span>
              </TabsTrigger>
              <TabsTrigger value="done" className={innerTabTriggerClass}>
                <CheckCircle2 className="w-3.5 h-3.5 me-1.5 shrink-0" />
                <span className="truncate">{lang === "ar" ? "معتمد QC" : "QC Approved"}</span>
                <span className={innerTabBadgeClass}>{doneSamples.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-3 space-y-3">
              {pendingSamples.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">
                      {lang === "ar" ? "لا توجد عينات بانتظار ضبط الجودة" : "No samples awaiting QC review"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {pendingSamples.map((sample) => (
                    <QCReviewActiveSampleCard
                      key={sample.id}
                      sample={sample}
                      lang={lang}
                      onOpen={openSample}
                      onRefetch={() => refetch()}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="done" className="mt-3 space-y-3">
              {doneSamples.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">
                      {lang === "ar" ? "لا توجد عينات معتمدة بعد" : "No QC-approved samples yet"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {doneSamples.map((sample) => (
                    <QCReviewArchiveSampleCard
                      key={sample.id}
                      sample={sample}
                      lang={lang}
                      onOpen={openSample}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          </TabsContent>

          <TabsContent value="clearance" className="mt-4">
            <ClearanceQCSection />
          </TabsContent>
        </Tabs>
      </div>

      {/* QC Review Dialog */}
      <Dialog open={!!selectedSample} onOpenChange={(o) => !o && setSelectedSample(null)}>
        <ReviewDialogShell
          lang={lang}
          icon={ShieldCheck}
          title={lang === "ar" ? "ضبط الجودة" : "Quality Control"}
          code={selectedSample?.sampleCode}
          badge={selectedSample ? (
            <span className="flex items-center gap-2">
              {dialogSamplePendingBadge}
              <StatusBadge status={selectedSample.status} />
            </span>
          ) : undefined}
        >
          {isModalDataLoading ? (
            loadTimedOut ? (
              <ReviewDialogBody>
                <ReviewStatusNotice variant="warning">
                  {lang === "ar" ? "تعذر تحميل النتائج." : "Could not load results."}
                </ReviewStatusNotice>
                {wrapDisabledWithTooltip(
                  dialogSamplePending,
                  dialogSampleDisabledWarning,
                  <Button variant="outline" size="sm" disabled={dialogSamplePending} onClick={handleRetryLoad}>
                    {lang === "ar" ? "إعادة المحاولة" : "Retry"}
                  </Button>,
                )}
              </ReviewDialogBody>
            ) : (
              <ReviewDialogLoading lang={lang} />
            )
          ) : hasAnyResult ? (
            <>
              <ReviewDialogBody>
                {reportUrl && (
                  <ReviewReportAction lang={lang} onClick={() => window.open(reportUrl, "_blank")} />
                )}

                <ReviewTimeline
                  title={lang === "ar" ? "سجل المراجعات" : "Review History"}
                  items={timelineItems}
                />

                {selectedSample?.status === "revision_requested" && (
                  <ReviewStatusNotice variant="warning">
                    {lang === "ar"
                      ? "في انتظار إعادة الفني للاختبار واعتماد المشرف قبل مراجعة ضبط الجودة مرة أخرى."
                      : "Waiting for the technician to revise and the supervisor to re-approve before QC can review again."}
                  </ReviewStatusNotice>
                )}

                {!isQcAlreadyDone && (
                  <>
                    <ReviewAttestation
                      lang={lang}
                      title={lang === "ar" ? "إقرار ضبط الجودة" : "QC Inspector Attestation"}
                      body={
                        lang === "ar"
                          ? "بالضغط على «اعتماد الجودة»، أُقرّ بصفتي مسؤول ضبط الجودة أنني راجعت نتائج هذا الاختبار وفق مؤهلات وصلاحيات ضبط الجودة المعتمدة في المختبر، وأن الاختبار نُفّذ وفق المعايير المعتمدة، والحسابات والنتائج دقيقة ومتوافقة مع متطلبات المشروع."
                          : "By selecting QC Approved, I confirm—as the authorized QC inspector—that I have reviewed this test result per laboratory QC procedures; that the test was performed per applicable standards; and that calculations, results, and documentation are accurate and complete."
                      }
                    />

                    <ReviewSection
                      title={lang === "ar" ? "قرار ضبط الجودة" : "Your Decision"}
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
                readOnly={isQcAlreadyDone}
                onClose={() => setSelectedSample(null)}
                onSubmit={handleReview}
                submitLabel={
                  decision === "approved"
                    ? lang === "ar"
                      ? "اعتماد الجودة"
                      : "QC Approved"
                    : decision === "needs_revision"
                      ? lang === "ar"
                        ? "طلب مراجعة"
                        : "Request Revision"
                      : decision === "rejected"
                        ? lang === "ar"
                          ? "تأكيد الرفض"
                          : "Confirm Rejection"
                        : lang === "ar"
                          ? "إرسال ضبط الجودة"
                          : "Submit QC Review"
                }
                submitting={qcReview.isPending}
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
              <ReviewStatusNotice variant="info">
                {lang === "ar"
                  ? "لا توجد نتائج اختبار مُدخلة لهذه العينة بعد."
                  : "No test results have been submitted for this sample yet."}
              </ReviewStatusNotice>
            </ReviewDialogBody>
          )}
        </ReviewDialogShell>
      </Dialog>
    </DashboardLayout>
  );
}
