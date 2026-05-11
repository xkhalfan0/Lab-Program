import DashboardLayout from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { SAMPLE_TYPE_LABELS, STATUS_LABELS, SampleStatus } from "@/lib/labTypes";
import { useLanguage, formatDateForLang } from "@/contexts/LanguageContext";
import {
  FlaskConical,
  ClipboardList,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
  Calendar,
  CalendarDays,
  Search,
  ArrowRight,
  PackageOpen,
  Beaker,
  ShieldCheck,
  Building2,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  received: "#3b82f6",
  distributed: "#8b5cf6",
  tested: "#f59e0b",
  processed: "#f97316",
  reviewed: "#6366f1",
  approved: "#14b8a6",
  qc_passed: "#22c55e",
  qc_failed: "#ef4444",
  clearance_issued: "#10b981",
  rejected: "#dc2626",
  revision_requested: "#d97706",
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Home() {
  const { user } = useAuth();
  const canViewDeleted = user?.role === "admin" || user?.role === "lab_manager";
  const [showDeleted, setShowDeleted] = useState(false);
  const { data: samples, isLoading: samplesLoading, refetch: refetchSamples } = trpc.samples.list.useQuery({
    includeDeleted: canViewDeleted ? showDeleted : false,
  });
  const { data: stats, refetch: refetchStats } = trpc.samples.stats.useQuery();
  const [, setLocation] = useLocation();
  const { lang, t, dir } = useLanguage();
  const [sampleToDelete, setSampleToDelete] = useState<{ id: number; sampleCode: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [appliedFrom, setAppliedFrom] = useState(todayStr);
  const [appliedTo, setAppliedTo] = useState(todayStr);
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  const SECTORS = [
    { value: "sector_1", ar: "قطاع/1", en: "Sector 1" },
    { value: "sector_2", ar: "قطاع/2", en: "Sector 2" },
    { value: "sector_3", ar: "قطاع/3", en: "Sector 3" },
    { value: "sector_4", ar: "قطاع/4", en: "Sector 4" },
    { value: "sector_5", ar: "قطاع/5", en: "Sector 5" },
  ];

  function sectorLabel(val: string | null | undefined) {
    if (!val) return "—";
    const s = SECTORS.find(x => x.value === val);
    return s ? (lang === "ar" ? s.ar : s.en) : val;
  }

  const { data: dailyData, isLoading: dailyLoading } = trpc.samples.dailyWork.useQuery({
    fromDate: appliedFrom,
    toDate: appliedTo,
  });

  const now = new Date();

  const total = stats?.total ?? 0;
  const active = samples?.filter(
    (s) => !["clearance_issued", "rejected", "qc_failed"].includes(s.status)
  ).length ?? 0;
  const completed = samples?.filter((s) => s.status === "clearance_issued").length ?? 0;
  const needsAction = samples?.filter(
    (s) => ["received", "processed", "approved", "revision_requested"].includes(s.status)
  ).length ?? 0;

  const statusChartData =
    stats?.byStatus?.map((s) => ({
      name: t(`status.${s.status}`) !== `status.${s.status}` ? t(`status.${s.status}`) : (STATUS_LABELS[s.status as SampleStatus] ?? s.status),
      value: Number(s.count),
      fill: STATUS_COLORS[s.status] ?? "#94a3b8",
    })) ?? [];

  const typeChartData =
    stats?.byType?.map((t2) => ({
      name: SAMPLE_TYPE_LABELS[t2.sampleType] ?? t2.sampleType,
      count: Number(t2.count),
    })) ?? [];

  const recentSamples = (sectorFilter === "all"
    ? samples?.slice(0, 8)
    : samples?.filter(s => (s as any).sector === sectorFilter).slice(0, 8)) ?? [];
  const dailySamples = (sectorFilter === "all"
    ? dailyData?.samples
    : dailyData?.samples?.filter(s => (s as any).sector === sectorFilter)) ?? [];
  const dailySummary = dailyData?.summary;
  const isSingleDay = appliedFrom === appliedTo;

  const handleApplyFilter = () => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  };

  const handleTodayFilter = () => {
    const td = todayStr();
    setFromDate(td); setToDate(td);
    setAppliedFrom(td); setAppliedTo(td);
  };

  const handleDeleteSample = async () => {
    if (!sampleToDelete) return;
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/samples/${sampleToDelete.id}/delete`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete sample");
      }
      toast.success(lang === "ar" ? "تم حذف العينة بنجاح" : "Sample deleted successfully");
      setSampleToDelete(null);
      await Promise.all([refetchSamples(), refetchStats()]);
    } catch (error: any) {
      toast.error(error?.message ?? (lang === "ar" ? "فشل حذف العينة" : "Failed to delete sample"));
    } finally {
      setIsDeleting(false);
    }
  };

  const periodLabel = isSingleDay && appliedFrom === todayStr()
    ? t("dashboard.todayWork")
    : isSingleDay
    ? `${t("dashboard.workOn")} ${new Date(appliedFrom).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" })}`
    : `${t("dashboard.workFrom")} ${new Date(appliedFrom).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "short" })} ${lang === "ar" ? "إلى" : "to"} ${new Date(appliedTo).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir={dir}>

        {/* ── Date & Day Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{t("app.subtitle")}</p>
          </div>

          {/* Date/Time Card — bigger clock */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-5 py-3 shadow-sm">
              <Calendar className="w-6 h-6 text-primary shrink-0" />
              <div className={dir === "rtl" ? "text-right" : "text-left"}>
                <p className="text-lg font-bold text-foreground leading-tight">
                  {formatDateForLang(now, lang)}
                </p>
                {/* BIG TIME */}
                <p className="text-3xl font-extrabold text-primary tabular-nums mt-1 tracking-tight">
                  {now.toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.uaeTime")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t("dashboard.totalSamples"), value: total, icon: FlaskConical, color: "border-l-blue-500", iconColor: "text-blue-500" },
            { label: t("dashboard.active"), value: active, icon: Activity, color: "border-l-orange-500", iconColor: "text-orange-500" },
            { label: t("dashboard.completed"), value: completed, icon: CheckCircle, color: "border-l-green-500", iconColor: "text-green-500" },
            { label: t("dashboard.needsAction"), value: needsAction, icon: AlertTriangle, color: "border-l-amber-500", iconColor: "text-amber-500" },
          ].map(({ label, value, icon: Icon, color, iconColor }) => (
            <Card key={label} className={`border-l-4 ${color}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${iconColor} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Sector Filter ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building2 className="w-4 h-4" />
            <span className="font-medium">{lang === "ar" ? "فلتر القطاع:" : "Filter by Sector:"}</span>
          </span>
          <button
            onClick={() => setSectorFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              sectorFilter === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {lang === "ar" ? "الكل" : "All Sectors"}
          </button>
          {SECTORS.map(sec => (
            <button
              key={sec.value}
              onClick={() => setSectorFilter(sec.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                sectorFilter === sec.value
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:border-blue-400"
              }`}
            >
              {lang === "ar" ? sec.ar : sec.en}
            </button>
          ))}
        </div>

        {/* ── Daily Work Section ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                {periodLabel}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleTodayFilter} className="text-xs h-8 px-3">
                  {t("dashboard.today")}
                </Button>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("dashboard.from")}</span>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-xs w-36" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("dashboard.to")}</span>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-xs w-36" />
                </div>
                <Button size="sm" onClick={handleApplyFilter} className="h-8 px-3 text-xs gap-1">
                  <Search className="w-3.5 h-3.5" />
                  {t("dashboard.apply")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("dashboard.received"), value: dailySummary?.received ?? 0, icon: PackageOpen, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
                { label: t("dashboard.distributed"), value: dailySummary?.distributed ?? 0, icon: ArrowRight, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
                { label: t("dashboard.processed"), value: dailySummary?.processed ?? 0, icon: Beaker, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
                { label: t("dashboard.approvedIssued"), value: dailySummary?.approved ?? 0, icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`rounded-lg p-3 ${bg} flex items-center gap-3`}>
                  <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20">
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {dailyLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.loading")}</div>
            ) : dailySamples.length === 0 ? (
              <div className="py-10 text-center">
                <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">{t("dashboard.noPeriodSamples")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {[t("table.num"), t("table.sampleId"), t("table.contractNo"), t("table.contractor"), t("table.type"), lang === "ar" ? "القطاع" : "Sector", t("table.qty"), t("table.status"), t("table.receivedAt")].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailySamples.map((sample, idx) => (
                      <tr key={sample.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setLocation(`/sample/${sample.id}`)}>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{sample.sampleCode}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{sample.contractNumber ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs">{sample.contractorName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs capitalize">{SAMPLE_TYPE_LABELS[sample.sampleType]}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {(sample as any).sector ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <Building2 className="w-3 h-3" />
                              {sectorLabel((sample as any).sector)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{sample.quantity}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={sample.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {new Date(sample.receivedAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Charts Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Donut Chart - Samples by Status */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {t("dashboard.samplesByStatus")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {statusChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <defs>
                      {statusChartData.map((entry: any, index: number) => (
                        <linearGradient key={index} id={`statusGrad-${index}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                          <stop offset="100%" stopColor={entry.fill} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="46%"
                      innerRadius={72}
                      outerRadius={108}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusChartData.map((_: any, index: number) => (
                        <Cell key={index} fill={`url(#statusGrad-${index})`} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                      formatter={(value: any, name: any) => [value, name]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={48}
                      iconType="circle"
                      iconSize={9}
                      formatter={(value: any) => <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">{t("dashboard.noData")}</div>
              )}
            </CardContent>
          </Card>

          {/* Bar Chart - Samples by Type */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" />
                {t("dashboard.samplesByType")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {typeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={typeChartData}
                    margin={{ top: 24, right: 20, left: -10, bottom: 8 }}
                    barCategoryGap="35%"
                  >
                    <defs>
                      {["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"].map((color: string, i: number) => (
                        <linearGradient key={i} id={`barGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                      cursor={{ fill: "rgba(59,130,246,0.06)" }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                      {typeChartData.map((_: any, index: number) => (
                        <Cell key={index} fill={`url(#barGrad-${index % 6})`} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{ fontSize: 12, fontWeight: 600, fill: "#475569" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">{t("dashboard.noData")}</div>
              )}
            </CardContent>
          </Card>
        </div>

                {/* ── Recent Samples Table ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold">{t("dashboard.recentSamples")}</CardTitle>
            <div className="flex items-center gap-4 flex-wrap">
              {canViewDeleted && (
                <div className="flex items-center gap-2">
                  <Switch id="show-deleted-samples" checked={showDeleted} onCheckedChange={setShowDeleted} />
                  <Label htmlFor="show-deleted-samples" className="text-xs cursor-pointer whitespace-nowrap">
                    {lang === "ar" ? "إظهار المحذوفة" : "Show deleted"}
                  </Label>
                </div>
              )}
              <button onClick={() => setLocation("/reception")} className="text-xs text-primary hover:underline">
                {t("dashboard.viewAll")}
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {samplesLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t("dashboard.loading")}</div>
            ) : recentSamples.length === 0 ? (
              <div className="p-8 text-center">
                <FlaskConical className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">{t("dashboard.noSamples")}</p>
                <button onClick={() => setLocation("/reception")} className="mt-3 text-xs text-primary hover:underline">
                  {t("dashboard.registerFirst")}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {[t("table.sampleId"), t("table.contractor"), t("table.type"), lang === "ar" ? "القطاع" : "Sector", t("table.contractNo"), t("table.status"), t("table.date")].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                      {user?.role === "admin" && (
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("table.actions")}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {recentSamples.map((sample) => (
                      <tr
                        key={sample.id}
                        className={
                          "border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors " +
                          ((sample as { deletedAt?: unknown }).deletedAt ? "opacity-80" : "")
                        }
                        onClick={() => setLocation(`/sample/${sample.id}`)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            {sample.sampleCode}
                            {Boolean((sample as { deletedAt?: Date | string | null }).deletedAt) && (
                              <Badge variant="outline" className="border-red-600 text-red-700 bg-red-50 font-normal">
                                <Trash2 className="h-3 w-3 me-1" />
                                {lang === "ar" ? "محذوف" : "Deleted"}
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{sample.contractorName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs capitalize">{SAMPLE_TYPE_LABELS[sample.sampleType]}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {(sample as any).sector ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <Building2 className="w-3 h-3" />
                              {sectorLabel((sample as any).sector)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{sample.contractNumber ?? "—"}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={sample.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(sample.receivedAt).toLocaleDateString()}</td>
                        {user?.role === "admin" && (
                          <td className="px-4 py-2.5">
                            {(sample as { deletedAt?: unknown }).deletedAt ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-600 hover:text-red-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSampleToDelete({ id: sample.id, sampleCode: sample.sampleCode });
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={!!sampleToDelete} onOpenChange={(open) => !open && !isDeleting && setSampleToDelete(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "تأكيد حذف العينة" : "Confirm Sample Deletion"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this sample? This action will mark it as deleted and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDeleteSample}>
              {isDeleting ? (lang === "ar" ? "جارٍ الحذف..." : "Deleting...") : (lang === "ar" ? "حذف" : "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
