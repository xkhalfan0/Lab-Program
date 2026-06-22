import DashboardLayout from "@/components/DashboardLayout";
import { RetestBadge } from "@/components/RetestBadge";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListFilterBar } from "@/components/ListFilterBar";
import { applyClearanceFilters, applySampleFilters, hasActiveListFilters } from "@/lib/listFilters";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import {
  ShieldCheck, CheckCircle, XCircle, RotateCcw, ClipboardCheck,
  BadgeCheck, FlaskConical, DollarSign, CheckCircle2, Clock,
  ChevronRight, ExternalLink,
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

function isQcReviewComplete(
  sample: { status?: string } | null | undefined,
  qcReview: { decision?: string } | null | undefined,
  legacyResult: { qcReviewedAt?: Date | string | null } | null | undefined,
  specializedResult: { qcReviewedAt?: Date | string | null } | null | undefined,
): boolean {
  if (sample?.status && QC_DONE_SAMPLE_STATUSES.has(sample.status)) return true;
  if (qcReview) return true;
  if (legacyResult?.qcReviewedAt) return true;
  if (specializedResult?.qcReviewedAt) return true;
  return false;
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
        <div className="space-y-1 min-w-0">
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
          <p className="text-xs text-muted-foreground">
            {sample.contractorName} — {sample.contractNumber ?? "—"}
          </p>
          <p className="text-xs">{SAMPLE_TYPE_LABELS[sample.sampleType]}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {wrapDisabledWithTooltip(
            hasPendingDeletion,
            DisabledWarning,
            <Button size="sm" variant="outline" className="gap-1.5" disabled={hasPendingDeletion}
              onClick={() => tryOpen()}>
              <ClipboardCheck className="w-3.5 h-3.5" />
              {lang === "ar" ? "مراجعة جودة" : "QC Review"}
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
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <p className="font-mono text-xs font-bold text-primary">{sample.sampleCode}</p>
          <StatusBadge status={sample.status} />
          {PendingDeletionBadge}
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-green-600" />
              {lang === "ar" ? "مراجعة QC لطلب شهادة براءة الذمة" : "QC Review — Clearance Request"}
              {selectedReq && <span className="text-sm font-mono text-muted-foreground">{selectedReq.requestCode}</span>}
            </DialogTitle>
          </DialogHeader>

          {selectedReq ? (
            <div className="space-y-4 mt-2">
              {/* Contractor Info */}
              <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28">{lang === "ar" ? "المقاول:" : "Contractor:"}</span>
                  <span className="font-semibold">{selectedReq.contractorName}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28">{lang === "ar" ? "رقم العقد:" : "Contract No:"}</span>
                  <span className="font-mono">{selectedReq.contractNumber}</span>
                </div>
                {selectedReq.contractName && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28">{lang === "ar" ? "المشروع:" : "Project:"}</span>
                    <span>{selectedReq.contractName}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: lang === "ar" ? "إجمالي الاختبارات" : "Total Tests", value: selectedReq.totalTests, color: "text-slate-700" },
                  { label: lang === "ar" ? "مطابق" : "Pass", value: selectedReq.passedTests, color: "text-green-700" },
                  { label: lang === "ar" ? "غير مطابق" : "Fail", value: selectedReq.failedTests, color: "text-red-700" },
                  { label: lang === "ar" ? "الإجمالي (AED)" : "Total (AED)", value: Number(selectedReq.totalAmount).toFixed(0), color: "text-blue-700" },
                ].map(s => (
                  <div key={s.label} className="bg-muted/40 rounded-lg p-2.5 text-center">
                    <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

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
                  <div className="space-y-3">
                    <p className="text-xs font-semibold">{lang === "ar" ? "قائمة الاختبارات" : "Test Inventory"}</p>
                    {Object.entries(grouped).map(([cat, items]) => {
                      const catLabel = CATEGORY_LABELS[cat] ?? { en: cat, ar: cat, badgeClass: "bg-slate-100 text-slate-800 border-slate-200" };
                      const rows = countByType(items);
                      return (
                        <div key={cat} className="border rounded-lg overflow-hidden">
                          <div className={`px-3 py-1.5 text-xs font-semibold border-b ${catLabel.badgeClass}`}>
                            {lang === "ar" ? catLabel.ar : catLabel.en}
                          </div>
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-start px-3 py-1.5">{lang === "ar" ? "نوع الاختبار" : "Test Type"}</th>
                                <th className="text-center px-2 py-1.5">{lang === "ar" ? "العدد" : "Count"}</th>
                                <th className="text-center px-2 py-1.5">{lang === "ar" ? "ناجح" : "Pass"}</th>
                                <th className="text-center px-2 py-1.5">{lang === "ar" ? "راسب" : "Fail"}</th>
                                <th className="text-end px-3 py-1.5">{lang === "ar" ? "المبلغ" : "Amount"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-3 py-1.5">{lang === "ar" ? r.nameAr : r.name}</td>
                                  <td className="text-center px-2 py-1.5">{r.count}</td>
                                  <td className="text-center px-2 py-1.5 text-green-700 font-medium">{r.pass}</td>
                                  <td className="text-center px-2 py-1.5 text-red-700 font-medium">{r.fail || "—"}</td>
                                  <td className="text-end px-3 py-1.5 font-mono">{r.amount.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Decision */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold">{lang === "ar" ? "قرار ضبط الجودة" : "QC Final Decision"}</Label>
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "ملاحظات الجودة" : "QC Notes"}</Label>
                  <Textarea
                    rows={3}
                    placeholder={lang === "ar" ? "أضف ملاحظات ونتائج الفحص..." : "Add QC notes and findings..."}
                    value={qcNotes}
                    onChange={(e) => setQcNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5" disabled={qcReview.isPending}
                    onClick={() => qcReview.mutate({ id: selectedReq.id, approved: true, notes: qcNotes || undefined })}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    {qcReview.isPending ? (lang === "ar" ? "جاري..." : "Submitting...") : (lang === "ar" ? "اعتماد QC" : "QC Approve")}
                  </Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 gap-1.5" disabled={qcReview.isPending}
                    onClick={() => qcReview.mutate({ id: selectedReq.id, approved: false, notes: qcNotes || undefined })}>
                    <XCircle className="w-3.5 h-3.5" />
                    {lang === "ar" ? "رفض" : "Reject"}
                  </Button>
                  <Button variant="outline" onClick={() => { setReviewOpen(false); setSelectedReqId(null); }}>
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "جاري التحميل..." : "Loading..."}
            </div>
          )}
        </DialogContent>
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
  const result = results?.[0];
  const specializedResult = specializedResults?.[0];
  const hasAnyResult = !!result || !!specializedResult;

  // Compute report URL — use dist or fall back to result.distributionId
  const reportUrl = (() => {
    const batchId = (selectedSample as { batchId?: string } | null)?.batchId;
    if (batchId) return `/batch-report/${encodeURIComponent(batchId)}`;

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
  const qcExistingReview = reviews?.find((r) => r.reviewType === "qc_review");
  const isQcAlreadyDone = isQcReviewComplete(selectedSample, qcExistingReview, result, specializedResult);

  const overallCompliance = specializedResult
    ? (specializedResult.overallResult ?? "pending")
    : (result?.complianceStatus ?? "pending");
  const isPass = overallCompliance === "pass";
  const isFail = overallCompliance === "fail";

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

  const testTypeDisplay =
    lang === "ar"
      ? ((dist as { testNameAr?: string } | undefined)?.testNameAr ?? dist?.testName ?? specializedResult?.testTypeCode ?? "—")
      : ((dist as { testNameEn?: string } | undefined)?.testNameEn ?? dist?.testName ?? specializedResult?.testTypeCode ?? "—");
  const contractorDisplay =
    selectedSample?.contractorName ?? specializedResult?.contractorName ?? (dist as { contractorName?: string } | undefined)?.contractorName ?? "—";
  const contractNameDisplay =
    selectedSample?.contractName ?? specializedResult?.projectName ?? "—";
  const contractNumberDisplay =
    selectedSample?.contractNumber ?? specializedResult?.contractNo ?? "—";


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
    if (!result && !specializedResult) {
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-5 h-5" />
              {lang === "ar" ? `ضبط الجودة — ${selectedSample?.sampleCode}` : `QC Review — ${selectedSample?.sampleCode}`}
              {dialogSamplePendingBadge}
            </DialogTitle>
          </DialogHeader>

          {isModalDataLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {loadTimedOut ? (
                <div className="space-y-3">
                  <p>{lang === "ar" ? "تعذر تحميل النتائج" : "Could not load results"}</p>
                  {wrapDisabledWithTooltip(
                    dialogSamplePending,
                    dialogSampleDisabledWarning,
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={dialogSamplePending}
                      onClick={handleRetryLoad}
                    >
                      {lang === "ar" ? "إعادة المحاولة" : "Retry"}
                    </Button>
                  )}
                </div>
              ) : (
                <p>{lang === "ar" ? "جاري تحميل النتائج..." : "Loading results..."}</p>
              )}
            </div>
          ) : hasAnyResult ? (
            <div className="space-y-5 mt-2">
              {/* Sample / test context */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {[
                    { label: lang === "ar" ? "نوع الاختبار" : "Test Type", value: testTypeDisplay },
                    { label: lang === "ar" ? "المقاول" : "Contractor", value: contractorDisplay },
                    { label: lang === "ar" ? "اسم العقد" : "Contract Name", value: contractNameDisplay },
                    { label: lang === "ar" ? "رقم العقد" : "Contract Number", value: contractNumberDisplay },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Report Button */}
              {reportUrl && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
                  onClick={() => window.open(reportUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4" />
                  {lang === "ar" ? "فتح تقرير الاختبار" : "Open Test Report"}
                </Button>
              )}

              {/* Supervisor Review Summary */}
              {managerReview && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold text-teal-800">{lang === "ar" ? "مراجعة المشرف" : "Supervisor Review"}</p>
                  <p><span className="text-muted-foreground">{lang === "ar" ? "القرار:" : "Decision:"}</span> <span className="font-medium capitalize">{managerReview.decision.replace(/_/g, " ")}</span></p>
                  {managerReview.comments && <p><span className="text-muted-foreground">{lang === "ar" ? "التعليقات:" : "Comments:"}</span> {managerReview.comments}</p>}
                  {(managerReview.signature || lastApprovalSignature) && (
                    <p className="pt-1 border-t border-teal-200 mt-1">
                      <span className="text-muted-foreground">{lang === "ar" ? "موقع من:" : "Signed by:"}</span>{" "}
                      <span className="font-semibold text-teal-900">{managerReview.signature || lastApprovalSignature}</span>
                      {lastApprovalDate && (
                        <span className="text-muted-foreground ms-2">
                          · {new Date(lastApprovalDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* QC review record (read-only when already completed) */}
              {isQcAlreadyDone && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold text-emerald-800">
                    {lang === "ar" ? "تمت مراجعة ضبط الجودة" : "QC Review Completed"}
                  </p>
                  {qcExistingReview ? (
                    <>
                      <p>
                        <span className="text-muted-foreground">{lang === "ar" ? "القرار:" : "Decision:"}</span>{" "}
                        <span className="font-medium capitalize">{qcExistingReview.decision.replace(/_/g, " ")}</span>
                      </p>
                      {qcExistingReview.comments && (
                        <p>
                          <span className="text-muted-foreground">{lang === "ar" ? "الملاحظات:" : "Notes:"}</span>{" "}
                          {qcExistingReview.comments}
                        </p>
                      )}
                      {(qcExistingReview.signature || specializedResult?.qcReviewedByName || result?.qcReviewedByName) && (
                        <p>
                          <span className="text-muted-foreground">{lang === "ar" ? "موقع من:" : "Signed by:"}</span>{" "}
                          <span className="font-semibold">
                            {qcExistingReview.signature || specializedResult?.qcReviewedByName || result?.qcReviewedByName}
                          </span>
                          {(qcExistingReview.createdAt || specializedResult?.qcReviewedAt || result?.qcReviewedAt) && (
                            <span className="text-muted-foreground ms-2">
                              · {new Date(qcExistingReview.createdAt || specializedResult?.qcReviewedAt || result?.qcReviewedAt!).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-emerald-900/80">
                      {lang === "ar"
                        ? "تم اعتماد هذه العينة مسبقاً. لا يلزم إجراء إضافي."
                        : "This sample has already been QC approved. No further action is required."}
                    </p>
                  )}
                </div>
              )}

              {!isQcAlreadyDone && (
              <>
              {/* QC attestation */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-blue-900">
                  {lang === "ar" ? "إقرار ضبط الجودة" : "QC Inspector Attestation"}
                </p>
                <p className="text-xs leading-relaxed text-blue-950/90">
                  {lang === "ar"
                    ? "بالضغط على «اعتماد الجودة»، أُقرّ بصفتي مسؤول ضبط الجودة أنني راجعت نتائج هذا الاختبار وفق مؤهلات وصلاحيات ضبط الجودة المعتمدة في المختبر، وأن الاختبار نُفّذ وفق المعايير المعتمدة، والحسابات والنتائج دقيقة ومتوافقة مع متطلبات المشروع، والتوثيق مكتمل، والإجراءات اتُبعت بشكل صحيح."
                    : "By selecting QC Approved, I confirm—as the authorized QC inspector—that I have reviewed this test result in accordance with the laboratory’s QC qualifications and procedures; that the test was performed per applicable standards; that calculations, results, charts, and documentation are accurate, complete, and consistent with project requirements; and that all QC requirements for release have been satisfied."}
                </p>
              </div>

              {/* Decision */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold">{lang === "ar" ? "قرار ضبط الجودة" : "QC Final Decision"}</Label>
                <div className="flex gap-2">
                  {wrapDisabledWithTooltip(
                    dialogSamplePending,
                    dialogSampleDisabledWarning,
                    <Button
                      type="button"
                      size="sm"
                      variant={decision === "approved" ? "default" : "outline"}
                      className={`gap-1.5 flex-1 ${decision === "approved" ? "bg-green-600 hover:bg-green-700" : ""} ${dialogSamplePending ? "opacity-60" : ""}`}
                      disabled={dialogSamplePending}
                      onClick={() => setDecision("approved")}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {lang === "ar" ? "اعتماد الجودة" : "QC Approved"}
                    </Button>
                  )}
                  {wrapDisabledWithTooltip(
                    dialogSamplePending,
                    dialogSampleDisabledWarning,
                    <Button
                      type="button"
                      size="sm"
                      variant={decision === "needs_revision" ? "default" : "outline"}
                      className={`gap-1.5 flex-1 ${decision === "needs_revision" ? "bg-amber-600 hover:bg-amber-700" : ""} ${dialogSamplePending ? "opacity-60" : ""}`}
                      disabled={dialogSamplePending}
                      onClick={() => setDecision("needs_revision")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {lang === "ar" ? "طلب مراجعة" : "Request Revision"}
                    </Button>
                  )}
                  {wrapDisabledWithTooltip(
                    dialogSamplePending,
                    dialogSampleDisabledWarning,
                    <Button
                      type="button"
                      size="sm"
                      variant={decision === "rejected" ? "default" : "outline"}
                      className={`gap-1.5 flex-1 ${decision === "rejected" ? "bg-red-600 hover:bg-red-700" : ""} ${dialogSamplePending ? "opacity-60" : ""}`}
                      disabled={dialogSamplePending}
                      onClick={() => setDecision("rejected")}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {lang === "ar" ? "رفض" : "Reject"}
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    {lang === "ar" ? "ملاحظات الجودة" : "QC Notes"}
                    {(decision === "rejected" || decision === "needs_revision") && (
                      <span className="text-red-500 text-xs">{lang === "ar" ? " (إلزامي)" : " (required)"}</span>
                    )}
                  </Label>
                  <Textarea
                    rows={3}
                    placeholder={
                      decision === "rejected"
                        ? (lang === "ar" ? "اكتب سبب الرفض بوضوح..." : "Clearly state the reason for rejection...")
                        : decision === "needs_revision"
                        ? (lang === "ar" ? "اكتب ما يجب تعديله أو إعادة فحصه..." : "Describe what needs to be revised...")
                        : (lang === "ar" ? "أضف ملاحظات ونتائج الفحص..." : "Add QC notes and findings...")
                    }
                    value={comments}
                    disabled={dialogSamplePending}
                    onChange={(e) => setComments(e.target.value)}
                    className={(decision === "rejected" || decision === "needs_revision") && !comments.trim() ? "border-amber-400 focus:border-amber-500" : ""}
                  />
                  {(decision === "rejected" || decision === "needs_revision") && !comments.trim() && (
                    <p className="text-xs text-amber-600">
                      {lang === "ar" ? "⚠ يجب كتابة سبب القرار عند الرفض أو طلب المراجعة" : "⚠ A reason is required when rejecting or requesting revision"}
                    </p>
                  )}
                </div>

                {/* Digital Signature — auto-filled from logged-in user */}
                <div className="space-y-1.5">
                  <Label>
                    {lang === "ar" ? "التوقيع الرقمي — ضبط الجودة" : "Digital Signature — QC"}
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
                  {lastApprovalSignature && (
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "آخر اعتماد:" : "Last approval:"}{" "}
                      <span className="font-medium text-foreground">{lastApprovalSignature}</span>
                      {lastApprovalDate && (
                        <span> · {new Date(lastApprovalDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
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
                        qcReview.isPending ||
                        ((decision === "rejected" || decision === "needs_revision") && !comments.trim())
                      }
                      onClick={handleReview}
                    >
                      {qcReview.isPending
                        ? (lang === "ar" ? "جاري الإرسال..." : "Submitting...")
                        : (lang === "ar" ? "إرسال ضبط الجودة" : "Submit QC Review")}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedSample(null)}>
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </div>
              </>
              )}

              {isQcAlreadyDone && (
                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setSelectedSample(null)}>
                    {lang === "ar" ? "إغلاق" : "Close"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد نتائج اختبار مُدخلة لهذه العينة" : "No test results submitted yet for this sample"}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
