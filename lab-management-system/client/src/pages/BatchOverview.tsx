/**
 * BatchOverview — Progress dashboard for all tests in a lab-order batch (same sample + order)
 * URL: /batch/:sampleId/:orderId
 */
import { useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getOfficialTestDisplayName } from "@/lib/officialTestCatalog";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CheckCircle2,
  Clock,
  Play,
  FileText,
  Package,
  Loader2,
  ArrowLeft,
  Lock,
} from "lucide-react";

type BatchSibling = {
  id: number;
  testType: string;
  testName: string;
  status: string;
  distributionCode?: string | null;
  testSubType?: string | null;
};

const BATCH_SORT_CODES = [
  "ASPH_BITUMEN_EXTRACT",
  "ASPH_EXTRACTED_SIEVE",
  "ASPH_MARSHALL_DENSITY",
  "ASPH_MARSHALL",
] as const;

function sortBatchSiblings(siblings: BatchSibling[]): BatchSibling[] {
  const rank = (testType: string) => {
    const idx = BATCH_SORT_CODES.findIndex(
      code => testType === code || (code === "ASPH_EXTRACTED_SIEVE" && testType.startsWith("ASPH_EXTRACTED_SIEVE")),
    );
    return idx >= 0 ? idx : 999;
  };
  return [...siblings].sort((a, b) => rank(a.testType) - rank(b.testType) || a.id - b.id);
}

function testFormPath(dist: BatchSibling): string {
  const testType = dist.testType ?? "";
  if (testType === "CONC_CUBE" || testType === "concrete" || testType === "concrete_compression") {
    return `/concrete-test/${dist.id}`;
  }
  return `/test/${dist.id}`;
}

function isCompleted(status: string): boolean {
  return status === "completed";
}

export default function BatchOverview() {
  const params = useParams<{ sampleId: string; orderId: string }>();
  const [, navigate] = useLocation();
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  const sampleId = parseInt(params.sampleId ?? "0", 10);
  const orderId = parseInt(params.orderId ?? "0", 10);

  const { data: sample, isLoading: sampleLoading } = trpc.samples.get.useQuery(
    { id: sampleId },
    { enabled: sampleId > 0 },
  );

  const { data: siblings = [], isLoading: siblingsLoading, refetch } = trpc.distributions.getBatchSiblings.useQuery(
    { sampleId, orderId },
    { enabled: sampleId > 0 && orderId > 0 },
  );

  const sorted = useMemo(() => sortBatchSiblings(siblings as BatchSibling[]), [siblings]);

  // Enforce test prerequisites (e.g. CBR requires Proctor) regardless of batch size.
  const depQueries = trpc.useQueries((t) =>
    sorted.map((dist) =>
      t.testDependencies.check(
        { sampleId, testCode: dist.testType ?? "" },
        { enabled: sampleId > 0 && !!dist.testType && !isCompleted(dist.status) },
      ),
    ),
  );
  const depByDistId = useMemo(() => {
    const m = new Map<number, { isAllowed: boolean; missingTests: Array<{ code: string; nameEn: string; nameAr: string }> }>();
    sorted.forEach((dist, i) => {
      const data = depQueries[i]?.data;
      if (data) m.set(dist.id, { isAllowed: data.isAllowed, missingTests: (data.missingTests ?? []) as Array<{ code: string; nameEn: string; nameAr: string }> });
    });
    return m;
  }, [sorted, depQueries]);

  // Single-test orders are not a "batch": skip this overview and go straight to
  // the one report (when complete) or its test form (when still pending).
  useEffect(() => {
    if (siblingsLoading) return;
    if (sampleId <= 0 || orderId <= 0) return;
    if (sorted.length !== 1) return;
    const only = sorted[0];
    if (isCompleted(only.status)) {
      navigate(`/test-report/${only.id}`, { replace: true });
    } else {
      navigate(testFormPath(only), { replace: true });
    }
  }, [siblingsLoading, sorted, sampleId, orderId, navigate]);

  const total = sorted.length;
  const completedCount = sorted.filter(s => isCompleted(s.status)).length;
  const allComplete = total > 0 && completedCount === total;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const testLabel = (dist: BatchSibling) => {
    const fromCatalog = getOfficialTestDisplayName(dist.testType, isAr ? "ar" : "en");
    if (fromCatalog) return fromCatalog;
    return dist.testName;
  };

  const statusLabel = (status: string) => {
    if (status === "completed") return isAr ? "\u0645\u0643\u062a\u0645\u0644" : "Completed";
    if (status === "in_progress") return isAr ? "\u0642\u064a\u062f \u0627\u0644\u062a\u0646\u0641\u064a\u0630" : "In progress";
    if (status === "cancelled") return isAr ? "\u0645\u0644\u063a\u0649" : "Cancelled";
    return isAr ? "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631" : "Pending";
  };

  const isLoading = sampleLoading || siblingsLoading;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate("/technician")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                {isAr ? "\u062d\u0632\u0645\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a" : "Test Batch"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {isAr ? "\u062a\u062a\u0628\u0639 \u062c\u0645\u064a\u0639 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0644\u0646\u0641\u0633 \u0627\u0644\u0639\u064a\u0646\u0629 \u0641\u064a \u0627\u0644\u0637\u0644\u0628" : "Track all tests for this sample on the same order"}
              </p>
            </div>
          </div>
          {allComplete && sampleId > 0 && orderId > 0 && (
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 shrink-0"
              onClick={() => window.open(`/batch-report/${sampleId}/${orderId}`, "_blank")}
            >
              <FileText className="w-4 h-4" />
              {isAr ? "\u0639\u0631\u0636 \u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062d\u0632\u0645\u0629" : "View Batch Report"}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : total === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-slate-600">
              {isAr ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0641\u064a \u0647\u0630\u0647 \u0627\u0644\u062d\u0632\u0645\u0629." : "No tests found in this batch."}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-blue-100 bg-gradient-to-br from-blue-50/80 to-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-slate-800">
                  {isAr ? "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u064a\u0646\u0629" : "Sample summary"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 block text-xs">{isAr ? "\u0631\u0642\u0645 \u0627\u0644\u0639\u064a\u0646\u0629" : "Sample No."}</span>
                    <span className="font-mono font-semibold">{sample?.sampleCode ?? "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs">{isAr ? "\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628" : "Order ID"}</span>
                    <span className="font-mono font-semibold">{orderId}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-slate-500 block text-xs">{isAr ? "\u0627\u0644\u0645\u0642\u0627\u0648\u0644" : "Contractor"}</span>
                    <span className="font-medium truncate block">{sample?.contractorName ?? "\u2014"}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700">
                      {isAr ? "\u062a\u0642\u062f\u0645 \u0627\u0644\u062d\u0632\u0645\u0629" : "Batch progress"}
                    </span>
                    <span className="text-slate-600">
                      {completedCount}/{total} {isAr ? "\u0645\u0643\u062a\u0645\u0644" : "completed"} ({progressPct}%)
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {allComplete && (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {isAr
                      ? "\u062a\u0645 \u0625\u0643\u0645\u0627\u0644 \u062c\u0645\u064a\u0639 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a"
                      : "All tests in this batch are complete"}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                {isAr ? "\u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a" : "Tests"} ({total})
              </h2>
              <div className="grid gap-3 sm:grid-cols-1">
                {sorted.map((dist, index) => {
                  const done = isCompleted(dist.status);
                  const dep = depByDistId.get(dist.id);
                  const locked = !done && dep?.isAllowed === false;
                  const missingNames = (dep?.missingTests ?? []).map(t => (isAr ? t.nameAr : t.nameEn));
                  return (
                    <Card
                      key={dist.id}
                      className={`transition-shadow hover:shadow-md ${done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}
                    >
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                              done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {done ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {dist.distributionCode ?? `DIST-${dist.id}`}
                              </Badge>
                              <Badge
                                className={
                                  done
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    : dist.status === "in_progress"
                                      ? "bg-blue-100 text-blue-800 border-blue-200"
                                      : "bg-amber-100 text-amber-800 border-amber-200"
                                }
                              >
                                {statusLabel(dist.status)}
                              </Badge>
                            </div>
                            <p className="font-semibold text-slate-900 leading-snug">{testLabel(dist)}</p>
                            {dist.testSubType ? (
                              <p className="text-xs text-slate-500 mt-0.5">{dist.testSubType}</p>
                            ) : null}
                            {locked && (
                              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                                <Lock className="w-3 h-3 shrink-0" />
                                {isAr
                                  ? `أكمل أولاً: ${missingNames.join("، ")}`
                                  : `Complete first: ${missingNames.join(", ")}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 sm:flex-col sm:w-auto w-full">
                          {done ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 flex-1 sm:flex-none"
                              onClick={() => window.open(`/test-report/${dist.id}`, "_blank")}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {isAr ? "\u0627\u0644\u062a\u0642\u0631\u064a\u0631" : "Report"}
                            </Button>
                          ) : locked ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="gap-1.5 flex-1 sm:flex-none text-slate-400 border-slate-200 cursor-not-allowed"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              {isAr ? "\u0645\u0642\u0641\u0644" : "Locked"}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5 flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                              onClick={() => navigate(testFormPath(dist))}
                            >
                              <Play className="w-3.5 h-3.5" />
                              {isAr ? "\u0628\u062f\u0621 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631" : "Start Test"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {allComplete && sampleId > 0 && orderId > 0 && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-slate-700 text-center sm:text-start">
                    {isAr
                      ? "\u062a\u0645 \u0625\u0643\u0645\u0627\u0644 \u062c\u0645\u064a\u0639 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a. \u064a\u0645\u0643\u0646\u0643 \u0641\u062a\u062d \u0627\u0644\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0645\u062c\u0645\u0639."
                      : "All batch tests are complete. Open the combined batch report."}
                  </p>
                  <Button className="gap-2 shrink-0" onClick={() => window.open(`/batch-report/${sampleId}/${orderId}`, "_blank")}>
                    <FileText className="w-4 h-4" />
                    {isAr ? "\u0639\u0631\u0636 \u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u062d\u0632\u0645\u0629" : "View Batch Report"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                {isAr ? "\u062a\u062d\u062f\u064a\u062b" : "Refresh"}
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
