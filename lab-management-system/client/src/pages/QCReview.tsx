import DashboardLayout from "@/components/DashboardLayout";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import {
  ShieldCheck, CheckCircle, XCircle, RotateCcw, ClipboardCheck,
  BadgeCheck, FlaskConical, Clock, DollarSign, CheckCircle2,
  History, ChevronRight, ExternalLink,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell,
} from "recharts";

// ─── Task state helpers ───────────────────────────────────────────────────────
type TaskFilter = "all" | "new" | "incomplete" | "completed";

function getClearanceTaskState(req: any): "new" | "incomplete" | "completed" {
  if (req.status !== "pending") return "completed";
  if (req.qcReadAt) return "incomplete";
  return "new";
}

function getSampleTaskState(sample: any): "new" | "incomplete" | "completed" {
  if (sample.status === "approved") return "new";
  if (sample.status === "revision_requested") return "incomplete";
  return "completed";
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

// ─── Clearance QC Section ──────────────────────────────────────────────────────
function ClearanceQCSection() {
  const { lang } = useLanguage();
  const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
  const [qcNotes, setQcNotes] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("new");
  const [showHistory, setShowHistory] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");

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

  const newCount = requests.filter(r => getClearanceTaskState(r) === "new").length;
  const incompleteCount = requests.filter(r => getClearanceTaskState(r) === "incomplete").length;
  const completedCount = requests.filter(r => getClearanceTaskState(r) === "completed").length;

  const filteredRequests = requests.filter(r => {
    if (taskFilter === "all") return true;
    return getClearanceTaskState(r) === taskFilter;
  });
  const activeRequests = filteredRequests.filter(r => getClearanceTaskState(r) !== "completed");
  const completedRequests = filteredRequests.filter(r => getClearanceTaskState(r) === "completed");

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
      <div className="flex items-center gap-2 mb-1">
        <BadgeCheck className="w-5 h-5 text-green-600" />
        <h2 className="text-base font-semibold">
          {lang === "ar" ? "طلبات شهادة براءة الذمة — مراجعة QC" : "Clearance Requests — QC Review"}
        </h2>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTaskFilter("new")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "new" ? "bg-red-600 text-white border-red-600" : "bg-background text-muted-foreground border-border hover:border-red-400"}`}>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {lang === "ar" ? "جديدة" : "New"}
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "new" ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>{newCount}</span>
        </button>
        <button onClick={() => setTaskFilter("incomplete")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "incomplete" ? "bg-amber-500 text-white border-amber-500" : "bg-background text-muted-foreground border-border hover:border-amber-400"}`}>
          <Clock className="w-3.5 h-3.5" />
          {lang === "ar" ? "غير مكتملة" : "Incomplete"}
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "incomplete" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>{incompleteCount}</span>
        </button>
        <button onClick={() => setTaskFilter("completed")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "completed" ? "bg-green-600 text-white border-green-600" : "bg-background text-muted-foreground border-border hover:border-green-400"}`}>
          <History className="w-3.5 h-3.5" />
          {lang === "ar" ? "الأرشيف" : "Archive"}
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "completed" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>{completedCount}</span>
        </button>
      </div>

      {/* Active Requests */}
      {activeRequests.length === 0 && taskFilter !== "completed" ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BadgeCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات براءة ذمة بانتظار المراجعة" : "No clearance requests awaiting QC review"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {activeRequests.map(req => {
            const state = getClearanceTaskState(req);
            return (
              <Card key={req.id} className={`border-l-4 ${state === "new" ? "border-l-red-400 bg-red-50/20" : state === "incomplete" ? "border-l-amber-400 bg-amber-50/20" : "border-l-green-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">{req.requestCode}</span>
                        <TaskStateBadge state={state} lang={lang} />
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
                    <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 shrink-0" onClick={() => handleOpenReq(req)}>
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

      {/* Archive (Completed) */}
      {taskFilter === "completed" && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={archiveSearch}
              onChange={e => setArchiveSearch(e.target.value)}
              placeholder={lang === "ar" ? "بحث برقم العقد أو اسم المقاول..." : "Search by contract number or contractor..."}
              className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {archiveSearch && (
              <button onClick={() => setArchiveSearch("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            )}
          </div>
          {completedRequests
            .filter(req => {
              if (!archiveSearch.trim()) return true;
              const q = archiveSearch.toLowerCase();
              return (
                req.requestCode?.toLowerCase().includes(q) ||
                req.contractorName?.toLowerCase().includes(q) ||
                req.contractNumber?.toLowerCase().includes(q) ||
                req.contractName?.toLowerCase().includes(q)
              );
            })
            .map(req => (
            <Card key={req.id} className="border-l-4 border-l-green-400 cursor-pointer hover:shadow-sm opacity-80 hover:opacity-100 transition-all" onClick={() => handleOpenReq(req)}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{req.requestCode}</span>
                    <TaskStateBadge state="completed" lang={lang} />
                  </div>
                  <p className="text-xs text-muted-foreground">{req.contractorName} — {req.contractNumber}</p>
                  {req.createdAt && (
                    <p className="text-xs text-muted-foreground/70">
                      {new Date(req.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE")}
                    </p>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground ${lang === "ar" ? "rotate-180" : ""}`} />
              </CardContent>
            </Card>
          ))}
          {completedRequests.filter(req => {
            if (!archiveSearch.trim()) return true;
            const q = archiveSearch.toLowerCase();
            return (
              req.requestCode?.toLowerCase().includes(q) ||
              req.contractorName?.toLowerCase().includes(q) ||
              req.contractNumber?.toLowerCase().includes(q) ||
              req.contractName?.toLowerCase().includes(q)
            );
          }).length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {lang === "ar" ? "لا توجد نتائج للبحث" : "No results found"}
            </div>
          )}
        </div>
      )}

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
  const { user } = useAuth();
  const [selectedSample, setSelectedSample] = useState<any>(null);
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");
  const [decision, setDecision] = useState<"approved" | "needs_revision" | "rejected" | null>(null);

  // Auto-fill signature with current user's name
  useEffect(() => {
    if (user) setSignature(user.name || user.username || "");
  }, [user]);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("new");
  const [showHistory, setShowHistory] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  const selectedSampleId = Number(selectedSample?.id ?? 0);

  const { data: samples, refetch } = trpc.samples.list.useQuery();
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
  const { data: sampleOrders, isLoading: isOrdersLoading, refetch: refetchSampleOrders } = trpc.orders.bySample.useQuery(
    { sampleId: selectedSampleId },
    { enabled: selectedSampleId > 0 }
  );

  const qcReview = trpc.reviews.qcReview.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تقديم ضبط الجودة بنجاح" : "QC review submitted successfully");
      setSelectedSample(null);
      setComments("");
      setSignature("");
      setDecision(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // All samples that have been approved (ready for QC) or already QC'd
  const qcSamples = samples?.filter((s) =>
    ["approved", "revision_requested", "qc_passed", "qc_failed", "clearance_issued", "rejected"].includes(s.status)
  ) ?? [];

  const newCount = qcSamples.filter(s => getSampleTaskState(s) === "new").length;
  const incompleteCount = qcSamples.filter(s => getSampleTaskState(s) === "incomplete").length;
  const completedCount = qcSamples.filter(s => getSampleTaskState(s) === "completed").length;

  const filteredSamples = qcSamples.filter(s => {
    if (taskFilter === "all") return true;
    return getSampleTaskState(s) === taskFilter;
  });
  const activeSamples = filteredSamples.filter(s => getSampleTaskState(s) !== "completed");
  const completedSamples = filteredSamples.filter(s => getSampleTaskState(s) === "completed");

  const dist = distributions?.[0];
  const result = results?.[0];
  const specializedResult = specializedResults?.[0];
  const hasAnyResult = !!result || !!specializedResult;
  const isModalDataLoading = !!selectedSample && (
    isLegacyResultsLoading ||
    isSpecializedResultsLoading ||
    isDistributionsLoading ||
    isReviewsLoading ||
    isOrdersLoading
  );
  const managerReview = reviews?.find((r) => r.reviewType === "manager_review");

  const chartsData = result?.chartsData as any;
  const rawValues: number[] = chartsData?.values ?? [];
  const avg = parseFloat(result?.average ?? "0");
  const minVal = dist?.minAcceptable ? parseFloat(dist.minAcceptable) : null;
  const maxVal = dist?.maxAcceptable ? parseFloat(dist.maxAcceptable) : null;

  const trendData = rawValues.map((v, i) => ({ name: `R${i + 1}`, value: v }));
  const barData = rawValues.map((v, i) => ({
    name: `R${i + 1}`,
    value: v,
    fill: (minVal == null || v >= minVal) && (maxVal == null || v <= maxVal) ? "#22c55e" : "#ef4444",
  }));

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
    refetchSampleOrders();
  };

  const handleReview = () => {
    if (!decision) { toast.error(lang === "ar" ? "يرجى اختيار قرار" : "Please select a decision"); return; }
    if (!result) { toast.error(lang === "ar" ? "لم يتم العثور على نتيجة" : "No test result found"); return; }
    // Enforce mandatory notes on reject/revision
    if ((decision === "rejected" || decision === "needs_revision") && !comments.trim()) {
      toast.error(lang === "ar" ? "يجب كتابة ملاحظات عند الرفض أو طلب المراجعة" : "Notes are required when rejecting or requesting revision");
      return;
    }
    const autoSignature = user?.name || user?.username || signature || `QC — ${new Date().toISOString()}`;
    qcReview.mutate({
      testResultId: result.id,
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

        {/* ── Clearance QC Section ── */}
        <ClearanceQCSection />

        {/* ── Divider ── */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">
              {lang === "ar" ? "تأكيد نتائج العينات" : "Sample Results Confirmation"}
            </h2>
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setTaskFilter("new")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "new" ? "bg-red-600 text-white border-red-600" : "bg-background text-muted-foreground border-border hover:border-red-400"}`}>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {lang === "ar" ? "جديدة" : "New"}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "new" ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>{newCount}</span>
            </button>
            <button onClick={() => setTaskFilter("incomplete")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "incomplete" ? "bg-amber-500 text-white border-amber-500" : "bg-background text-muted-foreground border-border hover:border-amber-400"}`}>
              <Clock className="w-3.5 h-3.5" />
              {lang === "ar" ? "غير مكتملة" : "Incomplete"}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "incomplete" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>{incompleteCount}</span>
            </button>
            <button onClick={() => { setTaskFilter("completed"); setShowHistory(true); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${taskFilter === "completed" ? "bg-green-600 text-white border-green-600" : "bg-background text-muted-foreground border-border hover:border-green-400"}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {lang === "ar" ? "مُنجزة" : "Completed"}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${taskFilter === "completed" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>{completedCount}</span>
            </button>
          </div>

          {/* Active Samples */}
          {activeSamples.length === 0 && taskFilter !== "completed" ? (
            <Card>
              <CardContent className="p-10 text-center">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد عينات بانتظار ضبط الجودة" : "No samples awaiting QC review"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {activeSamples.map((sample) => {
                const state = getSampleTaskState(sample);
                return (
                  <Card key={sample.id} className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${state === "new" ? "border-l-red-400 bg-red-50/20" : state === "incomplete" ? "border-l-amber-400 bg-amber-50/20" : "border-l-green-400"}`}
                    onClick={() => { setSelectedSample(sample); setComments(""); setSignature(""); setDecision(null); setLoadTimedOut(false); }}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-sm font-bold text-primary">{sample.sampleCode}</p>
                          <TaskStateBadge state={state} lang={lang} />
                          <StatusBadge status={sample.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">{sample.contractorName} — {sample.contractNumber ?? "—"}</p>
                        <p className="text-xs">{SAMPLE_TYPE_LABELS[sample.sampleType]}</p>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        {lang === "ar" ? "مراجعة جودة" : "QC Review"}
                      </Button>
                    <DeletionRequestButton
                      targetTable="samples"
                      targetId={sample.id}
                      targetLabel={`Sample ${sample.sampleCode}`}
                      variant="icon"
                      onSuccess={() => refetch()}
                    />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Completed History */}
          {(taskFilter === "completed" || (taskFilter === "all" && completedSamples.length > 0)) && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground gap-2 text-xs border border-dashed" onClick={() => setShowHistory(v => !v)}>
                <History className="w-3.5 h-3.5" />
                {showHistory ? (lang === "ar" ? "إخفاء السجل" : "Hide History") : (lang === "ar" ? "عرض السجل" : "Show History")}
                <span className="text-muted-foreground/60">({completedSamples.length})</span>
              </Button>
              {showHistory && (
                <div className="grid gap-2 mt-2 opacity-70">
                  {completedSamples.map(sample => (
                    <Card key={sample.id} className="border-l-4 border-l-green-400 cursor-pointer hover:shadow-sm"
                      onClick={() => { setSelectedSample(sample); setComments(""); setSignature(""); setDecision(null); setLoadTimedOut(false); }}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-bold text-primary">{sample.sampleCode}</p>
                          <TaskStateBadge state="completed" lang={lang} />
                          <StatusBadge status={sample.status} />
                        </div>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground ${lang === "ar" ? "rotate-180" : ""}`} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* QC Review Dialog */}
      <Dialog open={!!selectedSample} onOpenChange={(o) => !o && setSelectedSample(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              {lang === "ar" ? `ضبط الجودة — ${selectedSample?.sampleCode}` : `QC Review — ${selectedSample?.sampleCode}`}
            </DialogTitle>
          </DialogHeader>

          {isModalDataLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {loadTimedOut ? (
                <div className="space-y-3">
                  <p>{lang === "ar" ? "تعذر تحميل النتائج" : "Could not load results"}</p>
                  <Button variant="outline" size="sm" onClick={handleRetryLoad}>
                    {lang === "ar" ? "إعادة المحاولة" : "Retry"}
                  </Button>
                </div>
              ) : (
                <p>{lang === "ar" ? "جاري تحميل النتائج..." : "Loading results..."}</p>
              )}
            </div>
          ) : hasAnyResult ? (
            <div className="space-y-5 mt-2">
              {/* Specialized result summary (for tests like Marshall, soil proctor, etc.) */}
              {specializedResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold text-blue-800">
                    {lang === "ar" ? "نتيجة الاختبار التخصصي" : "Specialized Test Result"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{lang === "ar" ? "القالب:" : "Template:"}</span>{" "}
                    <span className="font-medium">{specializedResult.formTemplate}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">{lang === "ar" ? "النتيجة:" : "Overall Result:"}</span>{" "}
                    <span className="font-medium capitalize">{specializedResult.overallResult}</span>
                  </p>
                  {specializedResult.testTypeCode && (
                    <p>
                      <span className="text-muted-foreground">{lang === "ar" ? "رمز الاختبار:" : "Test Code:"}</span>{" "}
                      <span className="font-mono">{specializedResult.testTypeCode}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Stats */}
              {result && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: lang === "ar" ? "المتوسط" : "Average", value: `${result.average} ${result.unit}` },
                  { label: lang === "ar" ? "الانحراف المعياري" : "Std Deviation", value: result.stdDeviation ?? "—" },
                  { label: lang === "ar" ? "نسبة الامتثال" : "Compliance %", value: result.percentage ? `${result.percentage}%` : "—" },
                  { label: lang === "ar" ? "الحالة" : "Status", value: result.complianceStatus?.toUpperCase() ?? "—", highlight: result.complianceStatus === "pass" ? "text-green-700" : "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-bold mt-1 ${(s as any).highlight ?? "text-foreground"}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              )}

              {/* Full Report Link */}
              <div className="flex gap-2">
                {(dist?.id || (selectedSample as any)?.batchId) && (
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => {
                    const batchId = (selectedSample as any)?.batchId;
                    if (batchId) {
                      window.open(`/batch-report/${batchId}`, "_blank");
                    } else if (dist?.id) {
                      window.open(`/test-report/${dist.id}`, "_blank");
                    }
                  }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {lang === "ar" ? "تقرير الاختبار" : "Test Report"}
                  </Button>
                )}
                {sampleOrders && sampleOrders.length > 0 && (
                  <Button variant="default" size="sm" className="gap-1.5 flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => window.open(`/order-report/${sampleOrders[0].id}`, "_blank")}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {lang === "ar" ? "التقرير الموحد للطلب" : "Unified Order Report"}
                  </Button>
                )}
              </div>

              {/* Charts */}
              {result && rawValues.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-2">{lang === "ar" ? "خط الاتجاه" : "Trend Line"}</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={trendData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        {minVal != null && <ReferenceLine y={minVal} stroke="#ef4444" strokeDasharray="3 3" />}
                        {maxVal != null && <ReferenceLine y={maxVal} stroke="#f97316" strokeDasharray="3 3" />}
                        <ReferenceLine y={avg} stroke="#3b82f6" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={{ r: 3 }} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2">{lang === "ar" ? "الرسم البياني" : "Bar Chart"}</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={barData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                          {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Supervisor Review Summary */}
              {managerReview && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold text-teal-800">{lang === "ar" ? "مراجعة المشرف" : "Supervisor Review"}</p>
                  <p><span className="text-muted-foreground">{lang === "ar" ? "القرار:" : "Decision:"}</span> <span className="font-medium capitalize">{managerReview.decision.replace(/_/g, " ")}</span></p>
                  {managerReview.comments && <p><span className="text-muted-foreground">{lang === "ar" ? "التعليقات:" : "Comments:"}</span> {managerReview.comments}</p>}
                  {managerReview.signature && <p><span className="text-muted-foreground">{lang === "ar" ? "موقع من:" : "Signed by:"}</span> {managerReview.signature}</p>}
                </div>
              )}

              {/* QC Checklist */}
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold">{lang === "ar" ? "قائمة تحقق الجودة" : "QC Verification Checklist"}</p>
                {(lang === "ar" ? [
                  "تم تنفيذ الاختبار وفق المعايير",
                  "الحسابات دقيقة",
                  "النتائج تتطابق متطلبات المشروع",
                  "الرسوم البيانية صحيحة وذات معنى",
                  "التوثيق مكتمل",
                  "النتائج معقولة ومتسقة",
                  "تم اتباع الإجراءات بشكل صحيح",
                ] : [
                  "Test performed according to standards",
                  "Calculations are accurate",
                  "Results match project requirements",
                  "Charts are correct and meaningful",
                  "Documentation is complete",
                  "Results are reasonable and consistent",
                  "Procedures were followed correctly",
                ]).map((item, i) => (
                  <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" className="rounded" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              {/* Decision */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold">{lang === "ar" ? "قرار ضبط الجودة" : "QC Final Decision"}</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={decision === "approved" ? "default" : "outline"}
                    className={`gap-1.5 flex-1 ${decision === "approved" ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={() => setDecision("approved")}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    {lang === "ar" ? "اعتماد الجودة" : "QC Approved"}
                  </Button>
                  <Button type="button" size="sm" variant={decision === "needs_revision" ? "default" : "outline"}
                    className={`gap-1.5 flex-1 ${decision === "needs_revision" ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                    onClick={() => setDecision("needs_revision")}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    {lang === "ar" ? "طلب مراجعة" : "Request Revision"}
                  </Button>
                  <Button type="button" size="sm" variant={decision === "rejected" ? "default" : "outline"}
                    className={`gap-1.5 flex-1 ${decision === "rejected" ? "bg-red-600 hover:bg-red-700" : ""}`}
                    onClick={() => setDecision("rejected")}>
                    <XCircle className="w-3.5 h-3.5" />
                    {lang === "ar" ? "رفض" : "Reject"}
                  </Button>
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

                <div className="flex gap-2">
                  <Button
                    className={`flex-1 ${
                      decision === "approved" ? "bg-green-600 hover:bg-green-700" :
                      decision === "needs_revision" ? "bg-amber-600 hover:bg-amber-700" :
                      decision === "rejected" ? "bg-red-600 hover:bg-red-700" : ""
                    }`}
                    disabled={!decision || qcReview.isPending || ((decision === "rejected" || decision === "needs_revision") && !comments.trim())}
                    onClick={handleReview}>
                    {qcReview.isPending
                      ? (lang === "ar" ? "جاري الإرسال..." : "Submitting...")
                      : (lang === "ar" ? "إرسال ضبط الجودة" : "Submit QC Review")}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedSample(null)}>
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </div>
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
