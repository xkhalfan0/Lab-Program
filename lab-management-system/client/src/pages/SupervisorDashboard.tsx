/**
 * Supervisor desk — find any order and see which page actually holds it.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Search, RefreshCw, ClipboardList, FlaskConical, CheckSquare,
  ShieldCheck, ArrowUpRight, AlertTriangle, UserRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";

type DeskFilter = "open" | "assign" | "lab" | "review" | "qc" | "done" | "rejected";

type BoardOrder = {
  id: number;
  orderCode: string;
  sampleId: number;
  sampleCode: string | null;
  referenceNo: string | null;
  sampleStatus: string | null;
  contractNumber: string | null;
  contractorName: string | null;
  status: string;
  priority: string;
  technician: string | null;
  tests: string;
  updatedAt: string | null;
};

const SAMPLE_EXPECTS_ORDER: Record<string, string> = {
  received: "pending",
  distributed: "distributed",
  testing_in_progress: "in_progress",
  awaiting_review: "completed",
  under_review: "completed",
  processed: "completed",
  tested: "completed",
  reviewed: "reviewed",
  approved: "reviewed",
  qc_passed: "qc_passed",
  clearance_requested: "qc_passed",
  clearance_issued: "qc_passed",
  qc_failed: "rejected",
  rejected: "rejected",
  revision_requested: "in_progress",
};

function bucketOf(status: string): Exclude<DeskFilter, "open"> {
  if (status === "pending") return "assign";
  if (status === "distributed" || status === "in_progress") return "lab";
  if (status === "completed") return "review";
  if (status === "reviewed") return "qc";
  if (status === "rejected") return "rejected";
  return "done";
}

function ageDays(iso: string | null) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export default function SupervisorDashboard() {
  const [, navigate] = useLocation();
  const { lang, dir } = useLanguage();
  const isAr = lang === "ar";
  const [filter, setFilter] = useState<DeskFilter>("open");
  const [query, setQuery] = useState("");
  const [techFocus, setTechFocus] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = trpc.dashboard.supervisorBoard.useQuery();
  const orders = (data ?? []) as BoardOrder[];

  const counts = useMemo(() => {
    const c = { open: 0, assign: 0, lab: 0, review: 0, qc: 0, done: 0, rejected: 0 };
    for (const order of orders) {
      const bucket = bucketOf(order.status);
      c[bucket] += 1;
      if (bucket !== "done" && bucket !== "rejected") c.open += 1;
    }
    return c;
  }, [orders]);

  const technicians = useMemo(() => {
    const map = new Map<string, { name: string; count: number; oldest: string }>();
    for (const order of orders) {
      if (bucketOf(order.status) !== "lab") continue;
      const name = order.technician?.trim() || (isAr ? "بدون فني" : "No technician");
      const current = map.get(name) ?? { name, count: 0, oldest: order.orderCode };
      current.count += 1;
      map.set(name, current);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [orders, isAr]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (techFocus && (order.technician?.trim() || (isAr ? "بدون فني" : "No technician")) !== techFocus) {
        return false;
      }
      if (!q && filter !== "open" && bucketOf(order.status) !== filter) return false;
      if (!q && filter === "open" && (bucketOf(order.status) === "done" || bucketOf(order.status) === "rejected")) {
        return false;
      }
      if (!q) return true;
      return [
        order.orderCode,
        order.sampleCode,
        order.referenceNo,
        order.contractNumber,
        order.contractorName,
        order.technician,
        order.tests,
      ].some((value) => (value ?? "").toLowerCase().includes(q));
    });
  }, [orders, filter, query, techFocus, isAr]);

  const chips: { id: DeskFilter; en: string; ar: string }[] = [
    { id: "open", en: "Still open", ar: "ما زال مفتوحاً" },
    { id: "assign", en: "Not assigned", ar: "لم يوزَّع" },
    { id: "lab", en: "In lab", ar: "في المختبر" },
    { id: "review", en: "Your review", ar: "مراجعتك" },
    { id: "qc", en: "QC", ar: "ضبط الجودة" },
    { id: "done", en: "QC done", ar: "معتمد" },
    { id: "rejected", en: "Rejected", ar: "مرفوض" },
  ];

  function place(order: BoardOrder) {
    const bucket = bucketOf(order.status);
    if (bucket === "assign") {
      return {
        stage: isAr ? "لم يوزَّع" : "Not assigned",
        where: isAr ? "لا يظهر عند الفني ولا في المراجعة" : "Not on the technician list or in review",
        page: isAr ? "التوزيع" : "Distribution",
        href: "/distribution",
        tone: "bg-slate-100 text-slate-700",
      };
    }
    if (bucket === "lab") {
      const who = order.technician?.trim();
      return {
        stage: isAr ? "في المختبر" : "In lab",
        where: who
          ? (isAr ? `عند الفني ${who}` : `With ${who}`)
          : (isAr ? "موزّع بدون اسم فني" : "Assigned, but no technician name"),
        page: isAr ? "العينة" : "Sample",
        href: `/sample/${order.sampleId}`,
        tone: "bg-blue-50 text-blue-700",
      };
    }
    if (bucket === "review") {
      return {
        stage: isAr ? "مراجعة المشرف" : "Supervisor review",
        where: isAr ? "الفني أنهى الفحص" : "Technician has finished",
        page: isAr ? "مراجعة المشرف" : "Supervisor review",
        href: "/manager-review",
        tone: "bg-amber-50 text-amber-800",
      };
    }
    if (bucket === "qc") {
      return {
        stage: isAr ? "ضبط الجودة" : "QC",
        where: isAr ? "بانتظار اعتماد الجودة" : "Waiting for QC approval",
        page: isAr ? "مراجعة الجودة" : "QC review",
        href: "/qc-review",
        tone: "bg-violet-50 text-violet-700",
      };
    }
    if (bucket === "rejected") {
      return {
        stage: isAr ? "مرفوض" : "Rejected",
        where: isAr ? "أُغلق كمرفوض" : "Closed as rejected",
        page: isAr ? "العينة" : "Sample",
        href: `/sample/${order.sampleId}`,
        tone: "bg-red-50 text-red-700",
      };
    }
    return {
      stage: isAr ? "معتمد" : "QC done",
      where: isAr ? "انتهى مسار الطلب" : "Order is finished",
      page: isAr ? "التقرير" : "Report",
      href: `/order/${order.id}`,
      tone: "bg-emerald-50 text-emerald-700",
    };
  }

  function gap(order: BoardOrder) {
    if (!order.sampleStatus) return null;
    const expected = SAMPLE_EXPECTS_ORDER[order.sampleStatus];
    if (!expected || expected === order.status) return null;
    return isAr
      ? `العينة حالتها ${order.sampleStatus} بينما الطلب ${order.status}، لذلك قد لا يظهر في الصفحة المتوقعة.`
      : `Sample is ${order.sampleStatus.replaceAll("_", " ")} while the order is ${order.status.replaceAll("_", " ")}, so it can be missing from the page you expect.`;
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4" dir={dir}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isAr ? "متابعة المشرف" : "Supervisor desk"}
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              {isAr
                ? "ابحث برقم الطلب أو العينة أو العقد. كل صف يقول من يمسك الطلب الآن وأي صفحة تفتحها."
                : "Search by order, sample, or contract. Each row says who holds it and which page to open."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 w-fit">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "مثال: ORD-2026-0220 أو رمز العينة أو العقد أو اسم الفني" : "Try ORD-2026-0220, a sample code, contract, or technician"}
            className="ps-9 h-11 bg-white"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {chips.map((chip) => {
            const active = !query && filter === chip.id && !techFocus;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setFilter(chip.id);
                  setQuery("");
                  setTechFocus(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {isAr ? chip.ar : chip.en}
                <span className={`ms-1.5 tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{counts[chip.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : visible.length === 0 ? (
              <p className="text-sm text-slate-400 py-12 text-center">
                {query
                  ? (isAr ? "لا يوجد طلب بهذا البحث" : "No order matches that search")
                  : (isAr ? "لا توجد طلبات في هذه المرحلة" : "Nothing in this stage")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-500 text-xs">
                      <th className="text-start px-3 py-2.5 font-medium">{isAr ? "الطلب" : "Order"}</th>
                      <th className="text-start px-3 py-2.5 font-medium">{isAr ? "الفحص" : "Test"}</th>
                      <th className="text-start px-3 py-2.5 font-medium">{isAr ? "العقد" : "Contract"}</th>
                      <th className="text-start px-3 py-2.5 font-medium">{isAr ? "أين هو" : "Where it is"}</th>
                      <th className="text-end px-3 py-2.5 font-medium">{isAr ? "منذ" : "Age"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 80).map((order) => {
                      const spot = place(order);
                      const mismatch = gap(order);
                      const days = ageDays(order.updatedAt);
                      return (
                        <tr
                          key={order.id}
                          className="border-b last:border-0 hover:bg-slate-50 cursor-pointer align-top"
                          onClick={() => navigate(spot.href)}
                        >
                          <td className="px-3 py-3">
                            <div className="font-mono text-xs font-semibold text-slate-900">{order.orderCode}</div>
                            <div className="font-mono text-[11px] text-blue-700">{order.sampleCode ?? "—"}</div>
                            {order.referenceNo && (
                              <div className="text-[11px] text-slate-400">{order.referenceNo}</div>
                            )}
                            {order.priority === "urgent" || order.priority === "high" ? (
                              <span className="inline-block mt-1 text-[10px] font-semibold uppercase text-red-600">{order.priority}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-700 max-w-[220px]">
                            {order.tests}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <div>{order.contractorName ?? "—"}</div>
                            <div className="font-mono text-[11px] text-slate-400">{order.contractNumber ?? "—"}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${spot.tone}`}>
                              {spot.stage}
                            </span>
                            <p className="text-xs text-slate-600 mt-1">{spot.where}</p>
                            {mismatch && (
                              <p className="text-[11px] text-amber-700 mt-1 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                {mismatch}
                              </p>
                            )}
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                              {spot.page}
                              <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </td>
                          <td className="px-3 py-3 text-end text-xs tabular-nums text-slate-500">
                            {days}{isAr ? " ي" : "d"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visible.length > 80 && (
                  <p className="text-xs text-slate-400 px-3 py-2">
                    {isAr ? `يُعرض 80 من ${visible.length}. ضيّق البحث لرؤية الباقي.` : `Showing 80 of ${visible.length}. Narrow the search to see the rest.`}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-blue-600" />
                {isAr ? "من يمسك العمل الآن" : "Who has the lab work"}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 mb-3">
                {isAr ? "فقط الطلبات التي ما زالت عند الفني." : "Orders still with a technician."}
              </p>
              {technicians.length === 0 ? (
                <p className="text-xs text-slate-400">{isAr ? "لا يوجد شيء في المختبر" : "Nothing in the lab"}</p>
              ) : (
                <div className="space-y-1.5">
                  {technicians.map((tech) => (
                    <button
                      key={tech.name}
                      type="button"
                      onClick={() => {
                        setTechFocus(tech.name);
                        setFilter("lab");
                        setQuery("");
                      }}
                      className={`w-full flex items-center justify-between rounded-lg border px-2.5 py-2 text-start ${
                        techFocus === tech.name ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-xs font-medium truncate">{tech.name}</span>
                      <span className="text-xs tabular-nums">{tech.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold">{isAr ? "أين يظهر الطلب" : "Where an order shows"}</p>
              <ul className="text-[11px] text-slate-300 space-y-1.5">
                <li className="flex gap-2"><ClipboardList className="w-3.5 h-3.5 mt-0.5 shrink-0" />{isAr ? "لم يوزَّع: صفحة التوزيع فقط" : "Not assigned: Distribution only"}</li>
                <li className="flex gap-2"><FlaskConical className="w-3.5 h-3.5 mt-0.5 shrink-0" />{isAr ? "في المختبر: قائمة ذلك الفني" : "In lab: that technician’s list"}</li>
                <li className="flex gap-2"><CheckSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />{isAr ? "مراجعتك: بعد ما يرسل الفني النتيجة" : "Your review: after the technician submits"}</li>
                <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />{isAr ? "الجودة: بعد موافقتك" : "QC: after you approve"}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
