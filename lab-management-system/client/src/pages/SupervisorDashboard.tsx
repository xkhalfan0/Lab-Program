/**
 * Supervisor + QC operational dashboard
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  FlaskConical, Clock, AlertTriangle, CheckCircle2,
  Activity, RefreshCw, ChevronRight, CalendarDays,
  PackageOpen, ArrowRight, Beaker, ShieldCheck, Building2, Search, Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";

type Period = "today" | "week" | "month";

const SECTORS = [
  { value: "sector_1", ar: "قطاع/1", en: "Sector 1" },
  { value: "sector_2", ar: "قطاع/2", en: "Sector 2" },
  { value: "sector_3", ar: "قطاع/3", en: "Sector 3" },
  { value: "sector_4", ar: "قطاع/4", en: "Sector 4" },
  { value: "sector_5", ar: "قطاع/5", en: "Sector 5" },
];

const REASON_LABELS: Record<string, { en: string; ar: string }> = {
  "in testing": { en: "In testing", ar: "قيد الفحص" },
  "review wait": { en: "Review wait", ar: "بانتظار المراجعة" },
  "no technician assigned": { en: "No technician assigned", ar: "لم يُعيَّن فني" },
  "past expected date": { en: "Past expected date", ar: "تجاوز التاريخ المتوقع" },
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function SupervisorDashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [, navigate] = useLocation();
  const { lang, t, dir } = useLanguage();
  const isAr = lang === "ar";

  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedFrom, setAppliedFrom] = useState(todayStr);
  const [appliedTo, setAppliedTo] = useState(todayStr);
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  const { data: kpis, isLoading: kpisLoading, refetch } = trpc.dashboard.kpis.useQuery({ period });
  const { data: alerts, isLoading: alertsLoading } = trpc.dashboard.alerts.useQuery();
  const { data: activity, isLoading: activityLoading } = trpc.dashboard.labActivity.useQuery({ limit: 15 });
  const { data: reviewQueue, isLoading: queueLoading } = trpc.dashboard.reviewQueue.useQuery();
  const { data: stuckOrders, isLoading: stuckLoading } = trpc.dashboard.stuckOrders.useQuery();
  const { data: techDaily, isLoading: techDailyLoading } = trpc.dashboard.technicianDailyWork.useQuery();
  const { data: dailyData, isLoading: dailyLoading } = trpc.samples.dailyWork.useQuery({
    fromDate: appliedFrom,
    toDate: appliedTo,
  });

  const criticalCount = alerts?.filter(a => a.severity === "critical").length ?? 0;

  function sectorLabel(val: string | null | undefined) {
    if (!val) return "—";
    const s = SECTORS.find(x => x.value === val);
    return s ? (isAr ? s.ar : s.en) : val;
  }

  const dailySamples = (sectorFilter === "all"
    ? dailyData?.samples
    : dailyData?.samples?.filter(s => (s as { sector?: string }).sector === sectorFilter)) ?? [];
  const dailySummary = dailyData?.summary;
  const isSingleDay = appliedFrom === appliedTo;

  const periodLabel = isSingleDay && appliedFrom === todayStr()
    ? t("dashboard.todayWork")
    : isSingleDay
    ? `${t("dashboard.workOn")} ${new Date(appliedFrom).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" })}`
    : `${t("dashboard.workFrom")} ${new Date(appliedFrom).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "short" })} ${isAr ? "إلى" : "to"} ${new Date(appliedTo).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" })}`;

  const handleApplyFilter = () => { setAppliedFrom(fromDate); setAppliedTo(toDate); };
  const handleTodayFilter = () => {
    const td = todayStr();
    setFromDate(td); setToDate(td); setAppliedFrom(td); setAppliedTo(td);
  };

  const maxAssigned = Math.max(1, ...(techDaily ?? []).map(t => t.assigned));

  const priorityColor = (p: string) =>
    p === "urgent" ? "bg-red-100 text-red-700" :
    p === "high" ? "bg-orange-100 text-orange-700" :
    p === "low" ? "bg-slate-100 text-slate-600" :
    "bg-blue-100 text-blue-700";

  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 space-y-5" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {isAr ? "لوحة العمليات" : "Supervisor Dashboard"}
          </h1>
          <p className="text-sm text-slate-500">
            {isAr ? "متابعة العمليات اليومية" : "Daily operations monitoring"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
            {(["today", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
              >
                {p === "today" ? (isAr ? "اليوم" : "Today") : p === "week" ? (isAr ? "الأسبوع" : "Week") : (isAr ? "الشهر" : "Month")}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Critical alert banner */}
      {!alertsLoading && criticalCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-sm font-medium text-red-700">
            {criticalCount} {isAr ? "تنبيه حرج" : "critical alert(s)"}
          </span>
        </div>
      )}

      {/* Live KPIs — 5 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { title: isAr ? "قيد التنفيذ" : "In progress", value: kpis?.inProgress.value ?? 0, icon: Activity, color: "text-amber-600", bg: "bg-amber-50" },
          { title: isAr ? "مراجعة المدير" : "Manager review", value: kpis?.pendingManagerReview?.value ?? 0, icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
          { title: isAr ? "مراجعة الجودة" : "QC review", value: kpis?.pendingQcReview?.value ?? 0, icon: ShieldCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
          { title: isAr ? "متأخرة" : "Overdue", value: kpis?.overdue.value ?? 0, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", critical: true },
          { title: isAr ? "متوسط وقت التسليم" : "Avg TAT", value: `${kpis?.avgTAT.value ?? 0}h`, icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((card, i) => (
          <Card key={i} className={`border-0 shadow-sm ${card.critical && Number(card.value) > 0 ? "ring-2 ring-red-300" : ""}`}>
            <CardContent className="p-4">
              {kpisLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-12" /></div>
              ) : (
                <>
                  <div className={`p-2 rounded-lg ${card.bg} w-fit mb-2`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <div className={`text-2xl font-bold ${card.critical && String(card.value) !== "0h" ? "text-red-600" : "text-slate-800"}`}>
                    {card.value}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">{card.title}</div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Review queue + Stuck/Overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold text-slate-700">
              {isAr ? "طابور المراجعة" : "Review queue"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {queueLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !reviewQueue?.length ? (
              <p className="text-sm text-slate-400 py-4 text-center">{isAr ? "لا توجد عناصر" : "Queue empty"}</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {reviewQueue.slice(0, 10).map((row) => (
                  <div key={row.orderCode} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono font-semibold text-blue-600">{row.orderCode}</span>
                      <p className="text-xs text-slate-600 truncate">{row.testName}</p>
                    </div>
                    <span className="text-xs text-slate-500">{row.waitHours}h</span>
                    <Badge className={`text-[10px] ${priorityColor(row.priority)}`}>{row.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold text-slate-700">
              {isAr ? "عالق / متأخر" : "Stuck / overdue"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stuckLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !stuckOrders?.length ? (
              <p className="text-sm text-slate-400 py-4 text-center">{isAr ? "لا توجد مشاكل" : "Nothing stuck"}</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {stuckOrders.slice(0, 10).map((row, i) => (
                  <div key={`${row.code}-${i}`} className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50/50 border border-red-100">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono font-semibold">{row.code}</span>
                      <p className="text-xs text-slate-600">
                        {isAr ? (REASON_LABELS[row.reason]?.ar ?? row.reasonAr) : (REASON_LABELS[row.reason]?.en ?? row.reason)}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-red-600">{row.ageDays}d</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's Work */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {periodLabel}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleTodayFilter} className="text-xs h-8 px-3">
                {t("dashboard.today")}
              </Button>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-xs w-36" />
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-xs w-36" />
              <Button size="sm" onClick={handleApplyFilter} className="h-8 px-3 text-xs gap-1">
                <Search className="w-3.5 h-3.5" />
                {t("dashboard.apply")}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <button onClick={() => setSectorFilter("all")} className={`px-3 py-1 rounded-full text-xs border ${sectorFilter === "all" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {isAr ? "الكل" : "All"}
            </button>
            {SECTORS.map(sec => (
              <button key={sec.value} onClick={() => setSectorFilter(sec.value)} className={`px-3 py-1 rounded-full text-xs border ${sectorFilter === sec.value ? "bg-blue-600 text-white" : "bg-background"}`}>
                {isAr ? sec.ar : sec.en}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: isAr ? "وارد" : "Received", value: dailySummary?.received ?? 0, icon: PackageOpen, color: "text-blue-600", bg: "bg-blue-50" },
              { label: isAr ? "موزّع" : "Distributed", value: dailySummary?.distributed ?? 0, icon: ArrowRight, color: "text-purple-600", bg: "bg-purple-50" },
              { label: isAr ? "مُختبر" : "Tested", value: dailySummary?.processed ?? 0, icon: Beaker, color: "text-orange-600", bg: "bg-orange-50" },
              { label: isAr ? "صادر" : "Issued", value: dailySummary?.approved ?? 0, icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-lg p-3 ${bg} flex items-center gap-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {dailyLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : dailySamples.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t("dashboard.noPeriodSamples")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {[t("table.num"), t("table.sampleId"), t("table.contractNo"), t("table.contractor"), t("table.type"), isAr ? "القطاع" : "Sector", t("table.qty"), t("table.status"), t("table.receivedAt")].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailySamples.map((sample, idx) => (
                    <tr key={sample.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/sample/${sample.id}`)}>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{sample.sampleCode}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{sample.contractNumber ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs">{sample.contractorName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs capitalize">{SAMPLE_TYPE_LABELS[sample.sampleType]}</td>
                      <td className="px-4 py-2.5 text-xs">{sectorLabel((sample as { sector?: string }).sector)}</td>
                      <td className="px-4 py-2.5 text-xs">{sample.quantity}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={sample.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(sample.receivedAt).toLocaleString(isAr ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily work per technician */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" />
            {isAr ? "العمل اليومي لكل فني" : "Daily work per technician"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {techDailyLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !techDaily?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">{isAr ? "لا يوجد فنيون نشطون" : "No active technicians"}</p>
          ) : (
            techDaily.map((tech) => {
              const total = tech.assigned + tech.doneToday;
              const donePct = total > 0 ? (tech.doneToday / maxAssigned) * 100 : 0;
              const openPct = total > 0 ? (tech.assigned / maxAssigned) * 100 : 0;
              return (
                <div key={tech.id} className="p-3 rounded-lg border bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div>
                      <span className="text-sm font-semibold">{tech.name}</span>
                      {tech.specialty && <span className="text-xs text-slate-500 ms-2">{tech.specialty}</span>}
                    </div>
                    <span className="text-xs text-slate-600">
                      {tech.assigned} {isAr ? "مُعيَّن" : "assigned"} · {tech.doneToday} {isAr ? "منجز اليوم" : "done today"}
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-200">
                    <div className="bg-emerald-500 transition-all" style={{ width: `${donePct}%` }} />
                    <div className="bg-blue-500 transition-all" style={{ width: `${openPct}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Alerts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              {isAr ? "يحتاج انتباهاً" : "Attention Required"}
              {alerts && alerts.length > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">{alerts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {alertsLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !alerts?.length ? (
              <div className="flex flex-col items-center py-6 text-slate-400">
                <CheckCircle2 className="w-7 h-7 mb-2 text-emerald-400" />
                <p className="text-sm">{isAr ? "لا توجد تنبيهات" : "All clear!"}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {alerts.slice(0, 8).map((alert) => (
                  <div
                    key={`${alert.sampleId}-${alert.issueType}`}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer ${
                      alert.severity === "critical" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"
                    }`}
                    onClick={() => navigate(`/sample/${alert.sampleId}`)}
                  >
                    <span className={`w-2 h-2 rounded-full ${alert.severity === "critical" ? "bg-red-500" : "bg-amber-400"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold">{alert.sampleCode}</span>
                      <p className="text-xs text-slate-500">{isAr ? alert.issueLabelAr : alert.issueLabel}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-slate-500" />
              {isAr ? "النشاط الأخير" : "Recent Activity"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {activityLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !activity?.length ? (
              <p className="text-sm text-slate-400 py-4 text-center">{isAr ? "لا يوجد نشاط" : "No recent activity"}</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
                {activity.map((item) => {
                  const dot = item.severity === "success" ? "bg-emerald-400" : item.severity === "error" ? "bg-red-400" : item.severity === "warning" ? "bg-amber-400" : "bg-blue-400";
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{isAr ? item.typeAr : item.typeEn}</span>
                        <span className="text-xs font-mono text-blue-600 ms-1">{item.sampleCode}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(item.timestamp).toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </DashboardLayout>
  );
}
