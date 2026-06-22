import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardReportPreviewDialog, {
  type ReportPreviewPayload,
} from "@/components/DashboardReportPreviewDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLanguage, formatDateForLang } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  computeContractReadinessRows,
  computeContractorScores,
  computeContractorBreakdown,
  computeQualityAlerts,
  type QualityAlert,
  type ContractorBreakdown,
} from "@shared/dashboardInsights";
import {
  FlaskConical, AlertTriangle, CheckCircle, Activity, Target,
  Calendar, FileText, Users, Award, TrendingUp, TrendingDown,
  Loader2, BarChart2, Eye, ChevronDown, ChevronUp, ShieldAlert,
  Building2, MapPin, Zap, AlertOctagon, XCircle, ThumbsUp,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, { ar: string; en: string }> = {
  concrete:   { ar: "خرسانة",  en: "Concrete" },
  soil:       { ar: "تربة",    en: "Soil" },
  steel:      { ar: "حديد",    en: "Steel" },
  asphalt:    { ar: "أسفلت",   en: "Asphalt" },
  aggregates: { ar: "ركام",    en: "Aggregates" },
};

const COLORS = { pass: "#22c55e", fail: "#ef4444", pending: "#f59e0b" };

const REPORT_SECTIONS = [
  { value: "overview",   en: "Overview KPIs",            ar: "المؤشرات العامة" },
  { value: "status",     en: "Samples by status",        ar: "العينات حسب الحالة" },
  { value: "type",       en: "Samples by type",          ar: "العينات حسب النوع" },
  { value: "trend",      en: "Monthly trend",            ar: "الاتجاه الشهري" },
  { value: "passfail",   en: "Pass/fail by category",    ar: "النجاح/الرسوب حسب الفئة" },
  { value: "readiness",  en: "Contract readiness",       ar: "جاهزية العقود" },
  { value: "scorecard",  en: "Contractor scorecard",     ar: "بطاقة جودة المقاولين" },
  { value: "toptests",   en: "Most frequent tests",      ar: "أكثر الاختبارات تكراراً" },
  { value: "techperf",   en: "Technician performance",   ar: "أداء الفنيين" },
] as const;

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-foreground",
  borderColor = "border-l-slate-300",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  borderColor?: string;
}) {
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className={`w-7 h-7 ${color} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Alert card for each smart indicator ──────────────────────────────────────
function AlertIndicatorCard({
  alert,
  lang,
  onGenerateReport,
}: {
  alert: QualityAlert;
  lang: "ar" | "en";
  onGenerateReport: (alert: QualityAlert) => void;
}) {
  const isAr = lang === "ar";
  const icon =
    alert.type === "contractor_systemic" ? ShieldAlert :
    alert.type === "project_anomaly" ? MapPin :
    alert.type === "closure_risk" ? AlertOctagon :
    Zap;

  const Icon = icon;

  const severityConfig = {
    critical: {
      bg: "bg-red-50 border-red-200",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      badge: "bg-red-100 text-red-700",
      badgeLabel: isAr ? "حرجة" : "Critical",
      dot: "bg-red-500",
    },
    high: {
      bg: "bg-orange-50 border-orange-200",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
      badge: "bg-orange-100 text-orange-700",
      badgeLabel: isAr ? "عالية" : "High",
      dot: "bg-orange-500",
    },
    medium: {
      bg: "bg-amber-50 border-amber-200",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      badge: "bg-amber-100 text-amber-700",
      badgeLabel: isAr ? "متوسطة" : "Medium",
      dot: "bg-amber-500",
    },
  }[alert.severity];

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${severityConfig.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${severityConfig.iconBg}`}>
            <Icon className={`w-4 h-4 ${severityConfig.iconColor}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {isAr ? alert.titleAr : alert.titleEn}
            </p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${severityConfig.badge}`}>
              {severityConfig.badgeLabel}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-slate-500 shrink-0 mt-1">{alert.metric}</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        {isAr ? alert.bodyAr : alert.bodyEn}
      </p>

      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs self-start gap-1.5 border-slate-300 bg-white/70 hover:bg-white"
        onClick={() => onGenerateReport(alert)}
      >
        <FileText className="w-3 h-3" />
        {isAr ? "إنشاء تقرير" : "Generate Report"}
      </Button>
    </div>
  );
}

// ── Contractor card with project drill-down ───────────────────────────────────
function ContractorCard({
  c,
  lang,
}: {
  c: ContractorBreakdown;
  lang: "ar" | "en";
}) {
  const [expanded, setExpanded] = useState(false);
  const isAr = lang === "ar";

  const riskConfig = {
    low: { cls: "bg-green-100 text-green-700", label: isAr ? "منخفض" : "Low Risk", bar: "bg-green-500" },
    medium: { cls: "bg-amber-100 text-amber-700", label: isAr ? "متوسط" : "Medium", bar: "bg-amber-500" },
    high: { cls: "bg-orange-100 text-orange-700", label: isAr ? "عالٍ" : "High Risk", bar: "bg-orange-500" },
    critical: { cls: "bg-red-100 text-red-700 animate-pulse", label: isAr ? "حرجة" : "Critical", bar: "bg-red-500" },
  }[c.riskLevel];

  return (
    <div className="border rounded-xl p-3 space-y-2 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate">{c.contractor}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {c.contractCount} {isAr ? "عقد" : "contract(s)"} · {c.decided} {isAr ? "محدد النتيجة" : "decided"}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${riskConfig.cls}`}>
          {riskConfig.label}
        </span>
      </div>

      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${riskConfig.bar} transition-all`} style={{ width: `${c.passRate}%` }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {c.passRate >= 60 ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
          <span className={c.passRate >= 60 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
            {c.passRate}% {isAr ? "نجاح" : "pass"}
          </span>
        </span>
        <button
          className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 font-medium"
          onClick={() => setExpanded(v => !v)}
        >
          {isAr ? "المشاريع" : "Projects"}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 pt-2 border-t border-dashed border-slate-200">
          {c.projects.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-1">—</p>
          ) : (
            c.projects.map(p => {
              const anomaly = c.passRate >= 65 && p.passRate < 40 && p.decided >= 3;
              return (
                <div
                  key={p.contractNo}
                  className={`rounded-lg px-2 py-1.5 text-[10px] flex items-center justify-between gap-2 ${
                    anomaly ? "bg-red-50 border border-red-200" : "bg-slate-50"
                  }`}
                >
                  <span className="font-mono font-semibold truncate">
                    {p.contractNo}
                    {anomaly && (
                      <span className="ms-1 text-red-600">⚠</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-green-700">{p.passed}✓</span>
                    <span className="text-red-700">{p.failed}✗</span>
                    <span className={`font-bold ${p.passRate >= 60 ? "text-green-700" : "text-red-700"}`}>
                      {p.passRate}%
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const { lang, t, dir } = useLanguage();
  const isAr = lang === "ar";
  const now = new Date();

  const [dateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [reportSections, setReportSections] = useState<string[]>([
    "overview", "status", "type", "trend", "passfail",
  ]);
  const [reportRange, setReportRange] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportFormat, setReportFormat] = useState<"pdf" | "excel">("pdf");
  const [reportLang, setReportLang] = useState<"ar" | "en" | "both">("both");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<ReportPreviewPayload | null>(null);

  const queryInput = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);

  const { data: stats } = trpc.analytics.testStats.useQuery(queryInput);
  const { data: sampleStats } = trpc.samples.stats.useQuery();
  const { data: rawOrdersData = [] } = trpc.orders.list.useQuery();
  const { data: techStats } = trpc.dashboard.technicianStats.useQuery();
  const { data: clearanceStats } = trpc.dashboard.clearanceStats.useQuery();

  const generateReport = trpc.reports.generate.useMutation({
    onSuccess: (res) => {
      setPreviewPayload(res);
      setPreviewOpen(true);
      toast.success(isAr ? "تم إنشاء التقرير" : "Report ready", {
        description: isAr ? "يمكنك المعاينة والطباعة أو التنزيل" : "You can preview, print, or download",
      });
    },
    onError: (err) => {
      toast.error(isAr ? "فشل إنشاء التقرير" : "Report generation failed", {
        description: err.message,
      });
    },
  });

  const orders = (rawOrdersData as Array<Record<string, unknown>>).map((o) => ({
    ...o,
    contractNumber: o.contractNumber != null ? String(o.contractNumber) : null,
    contractorName: o.contractorName != null ? String(o.contractorName) : null,
    status: o.status != null ? String(o.status) : null,
  }));

  const total = sampleStats?.total ?? 0;
  const active = sampleStats?.active ?? 0;
  const completed = sampleStats?.completed ?? 0;
  const needsAction = sampleStats?.needsAction ?? 0;

  const contractReadinessRows = useMemo(() => computeContractReadinessRows(orders), [orders]);
  const contractorScores = useMemo(() => computeContractorScores(orders), [orders]);
  const contractorBreakdown = useMemo(() => computeContractorBreakdown(orders), [orders]);
  const qualityAlerts = useMemo(() => computeQualityAlerts(orders), [orders]);
  const topTests = useMemo(() => (stats?.byTestType ?? []).slice(0, 6), [stats?.byTestType]);

  const criticalAlerts = qualityAlerts.filter(a => a.severity === "critical");
  const highAlerts = qualityAlerts.filter(a => a.severity === "high");

  const toggleSection = (value: string) => {
    setReportSections((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const handleGenerate = () => {
    if (reportSections.length === 0) return;
    generateReport.mutate({
      sections: reportSections as Array<
        "overview" | "status" | "type" | "trend" | "passfail" |
        "readiness" | "scorecard" | "toptests" | "techperf"
      >,
      range: reportRange,
      dateFrom: reportRange === "custom" ? reportFrom : undefined,
      dateTo: reportRange === "custom" ? reportTo : undefined,
      format: reportFormat,
      lang: reportLang,
    });
  };

  const handleAlertReport = (alert: QualityAlert) => {
    const sectionsForAlert: typeof reportSections = ["overview", "scorecard", "readiness"];
    if (!sectionsForAlert.every(s => reportSections.includes(s))) {
      setReportSections(sectionsForAlert);
    }
    toast.info(
      isAr ? "تم تحديد أقسام التقرير" : "Report sections updated",
      { description: isAr ? "اضغط 'معاينة التقرير' لإنشاء التقرير" : "Click 'Preview report' below to generate" }
    );
    // Scroll down to report generator
    setTimeout(() => document.getElementById("report-generator")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir={dir}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" />
              {isAr ? "ذكاء الجودة" : "Quality Intelligence"}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">{t("app.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-5 py-3 shadow-sm">
            <Calendar className="w-6 h-6 text-primary shrink-0" />
            <div className={dir === "rtl" ? "text-right" : "text-left"}>
              <p className="text-lg font-bold text-foreground leading-tight">
                {formatDateForLang(now, lang)}
              </p>
              <p className="text-3xl font-extrabold text-primary tabular-nums mt-1 tracking-tight">
                {now.toLocaleTimeString(isAr ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.uaeTime")}</p>
            </div>
          </div>
        </div>

        {/* Smart Quality Alerts Banner */}
        {qualityAlerts.length > 0 && (
          <div className={`rounded-2xl border-2 p-4 space-y-4 ${criticalAlerts.length > 0 ? "bg-red-50/60 border-red-200" : "bg-orange-50/60 border-orange-200"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${criticalAlerts.length > 0 ? "bg-red-100" : "bg-orange-100"}`}>
                  <ShieldAlert className={`w-5 h-5 ${criticalAlerts.length > 0 ? "text-red-600" : "text-orange-600"}`} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    {isAr ? "تنبيهات ذكاء الجودة" : "Quality Intelligence Alerts"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {qualityAlerts.length} {isAr ? "مؤشر نشط" : "active indicator(s)"}
                    {criticalAlerts.length > 0 && ` · ${criticalAlerts.length} ${isAr ? "حرجة" : "critical"}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {criticalAlerts.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {criticalAlerts.length} {isAr ? "حرجة" : "Critical"}
                  </span>
                )}
                {highAlerts.length > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {highAlerts.length} {isAr ? "عالية" : "High"}
                  </span>
                )}
              </div>
            </div>

            {/* Alert type legend */}
            <div className="flex flex-wrap gap-2">
              {[
                { type: "contractor_systemic", icon: ShieldAlert, labelEn: "Contractor Quality", labelAr: "جودة المقاول", color: "text-red-600 bg-red-50 border-red-200" },
                { type: "project_anomaly", icon: MapPin, labelEn: "Site / Supplier Issue", labelAr: "مشكلة موقع / مورد", color: "text-orange-600 bg-orange-50 border-orange-200" },
                { type: "closure_risk", icon: AlertOctagon, labelEn: "Closure Risk", labelAr: "خطر الإغلاق", color: "text-amber-600 bg-amber-50 border-amber-200" },
              ].map(({ type, icon: LegendIcon, labelEn, labelAr, color }) => {
                const count = qualityAlerts.filter(a => a.type === type).length;
                if (count === 0) return null;
                return (
                  <span key={type} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium ${color}`}>
                    <LegendIcon className="w-3 h-3" />
                    {isAr ? labelAr : labelEn}
                    <span className="font-bold ms-0.5">({count})</span>
                  </span>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {qualityAlerts.map(alert => (
                <AlertIndicatorCard
                  key={alert.id}
                  alert={alert}
                  lang={lang as "ar" | "en"}
                  onGenerateReport={handleAlertReport}
                />
              ))}
            </div>
          </div>
        )}

        {/* All-clear when no alerts */}
        {qualityAlerts.length === 0 && orders.length > 0 && (
          <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-green-100">
              <ThumbsUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">
                {isAr ? "لا توجد مؤشرات مقلقة" : "No Quality Issues Detected"}
              </p>
              <p className="text-xs text-green-600">
                {isAr ? "جميع المقاولين والمشاريع ضمن الحدود المقبولة." : "All contractors and projects are within acceptable quality thresholds."}
              </p>
            </div>
          </div>
        )}

        {/* Overview KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label={t("dashboard.totalSamples")} value={total} icon={FlaskConical} color="text-blue-500" borderColor="border-l-blue-500" />
          <KpiCard label={t("dashboard.active")} value={active} icon={Activity} color="text-orange-500" borderColor="border-l-orange-500" />
          <KpiCard label={t("dashboard.completed")} value={completed} icon={CheckCircle} color="text-green-500" borderColor="border-l-green-500" />
          <KpiCard label={t("dashboard.needsAction")} value={needsAction} icon={AlertTriangle} color="text-amber-500" borderColor="border-l-amber-500" />
        </div>

        {/* Technicians & Clearances KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={isAr ? "الفنيون النشطون" : "Active technicians"}
            value={techStats?.activeCount ?? 0}
            sub={isAr ? "في الوردية" : "on shift"}
            icon={Users}
            color="text-indigo-600"
            borderColor="border-l-indigo-400"
          />
          <KpiCard
            label={isAr ? "اختبارات / فني" : "Tests / technician"}
            value={techStats?.avgTestsPerTech ?? 0}
            sub={isAr ? "متوسط هذا الأسبوع" : "avg this week"}
            icon={BarChart2}
            color="text-violet-600"
            borderColor="border-l-violet-400"
          />
          <KpiCard
            label={isAr ? "طلبات براءة الذمة" : "Clearance requests"}
            value={clearanceStats?.totalRequests ?? 0}
            sub={`${clearanceStats?.inProgress ?? 0} ${isAr ? "قيد الإجراء" : "in progress"}`}
            icon={FileText}
            color="text-amber-600"
            borderColor="border-l-amber-400"
          />
          <KpiCard
            label={isAr ? "براءات صادرة" : "Clearances done"}
            value={clearanceStats?.issued ?? 0}
            sub={isAr ? "شهادات صادرة" : "certificates issued"}
            icon={Award}
            color="text-emerald-600"
            borderColor="border-l-emerald-400"
          />
        </div>

        {/* Contractor Quality — enhanced scorecard with drill-down */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-rose-600" />
                {isAr ? "بطاقة جودة المقاولين" : "Contractor Quality Scorecard"}
              </CardTitle>
              {contractorBreakdown.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {isAr ? "منخفض" : "Low Risk"}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                    {isAr ? "عالٍ" : "High"}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                    {isAr ? "حرجة" : "Critical"}
                  </span>
                  <span className="ms-1 text-slate-400">
                    · {isAr ? "انقر على 'المشاريع' لعرض تفاصيل العقود" : "Click 'Projects' to see per-contract breakdown"}
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {contractorBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">{isAr ? "لا توجد بيانات" : "No data"}</div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {contractorBreakdown.slice(0, 8).map(c => (
                  <ContractorCard key={c.contractor} c={c} lang={lang as "ar" | "en"} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract Closure Readiness */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              {isAr ? "جاهزية إغلاق العقود" : "Contract Closure Readiness"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contractReadinessRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">{isAr ? "لا توجد عقود نشطة" : "No active contracts"}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-start px-3 py-2">{isAr ? "رقم العقد" : "Contract No."}</th>
                      <th className="text-start px-3 py-2">{isAr ? "المقاول" : "Contractor"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "إجمالي" : "Total"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "مكتمل" : "Completed"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "قيد التنفيذ" : "In Progress"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "معلق" : "Pending"}</th>
                      <th className="text-end px-3 py-2">{isAr ? "الجاهزية %" : "Readiness %"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractReadinessRows.slice(0, 10).map((r) => (
                      <tr key={`${r.contractNo}-${r.contractor}`} className={`border-b last:border-0 ${r.readiness < 30 && r.total >= 5 ? "bg-red-50/40" : ""}`}>
                        <td className="px-3 py-2 font-mono">
                          {r.contractNo}
                          {r.readiness < 30 && r.total >= 5 && <span className="ms-1 text-red-500 text-[10px]">⚠</span>}
                        </td>
                        <td className="px-3 py-2">{r.contractor}</td>
                        <td className="px-3 py-2 text-center font-semibold">{r.total}</td>
                        <td className="px-3 py-2 text-center text-green-700 font-semibold">{r.completed}</td>
                        <td className="px-3 py-2 text-center text-amber-700 font-semibold">{r.inProgress}</td>
                        <td className="px-3 py-2 text-center text-slate-700 font-semibold">{r.pending}</td>
                        <td className="px-3 py-2 text-end">
                          <span className={`px-2 py-1 rounded font-bold ${
                            r.readiness >= 80 ? "bg-green-100 text-green-700" :
                            r.readiness >= 50 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {r.readiness}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Frequent Tests */}
        {topTests.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {isAr ? "أكثر الاختبارات تكراراً" : "Most Frequent Tests"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start py-2 px-3 text-muted-foreground font-medium">{isAr ? "نوع الاختبار" : "Test Type"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "الفئة" : "Category"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "العدد" : "Count"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "ناجح" : "Pass"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "راسب" : "Fail"}</th>
                      <th className="text-end py-2 px-3 text-muted-foreground font-medium">{isAr ? "نسبة النجاح" : "Pass Rate"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTests.map((t2, i) => {
                      const pr = t2.count > 0 ? Math.round((t2.passed / t2.count) * 100) : 0;
                      const catLabel = CATEGORY_LABELS[t2.category];
                      return (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium">{isAr ? t2.nameAr || t2.nameEn : t2.nameEn}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline" className="text-[10px]">
                              {isAr ? catLabel?.ar ?? t2.category : catLabel?.en ?? t2.category}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center font-bold">{t2.count}</td>
                          <td className="py-2 px-3 text-center text-green-700 font-medium">{t2.passed}</td>
                          <td className="py-2 px-3 text-center text-red-700 font-medium">{t2.failed || "—"}</td>
                          <td className="py-2 px-3 text-end">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pr}%`, backgroundColor: pr >= 80 ? COLORS.pass : pr >= 60 ? COLORS.pending : COLORS.fail }} />
                              </div>
                              <span className={`font-bold ${pr >= 80 ? "text-green-600" : pr >= 60 ? "text-amber-600" : "text-red-600"}`}>{pr}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report Generator */}
        <Card id="report-generator">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {isAr ? "إنشاء تقرير" : "Generate Report"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {REPORT_SECTIONS.map((sec) => (
                <label key={sec.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={reportSections.includes(sec.value)}
                    onCheckedChange={() => toggleSection(sec.value)}
                  />
                  <span>{isAr ? sec.ar : sec.en}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{isAr ? "الفترة" : "Range"}</span>
                <select
                  className="h-8 text-xs border rounded-md px-2 bg-background"
                  value={reportRange}
                  onChange={(e) => setReportRange(e.target.value as typeof reportRange)}
                >
                  <option value="month">{isAr ? "هذا الشهر" : "This month"}</option>
                  <option value="quarter">{isAr ? "هذا الربع" : "This quarter"}</option>
                  <option value="year">{isAr ? "هذا العام" : "This year"}</option>
                  <option value="custom">{isAr ? "نطاق مخصص" : "Custom range"}</option>
                </select>
              </div>

              {reportRange === "custom" && (
                <>
                  <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="h-8 text-xs w-36" />
                  <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="h-8 text-xs w-36" />
                </>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{isAr ? "الصيغة" : "Format"}</span>
                <select
                  className="h-8 text-xs border rounded-md px-2 bg-background"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value as "pdf" | "excel")}
                >
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{isAr ? "لغة التقرير" : "Report language"}</span>
                <div className="flex items-center gap-0.5 border rounded-md overflow-hidden text-xs h-8">
                  {([
                    { value: "ar" as const, label: "AR" },
                    { value: "en" as const, label: "EN" },
                    { value: "both" as const, label: isAr ? "ثنائي" : "Both" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReportLang(opt.value)}
                      className={`px-2.5 h-full font-medium transition-colors ${
                        reportLang === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button size="sm" onClick={handleGenerate} disabled={generateReport.isPending || reportSections.length === 0}>
                {generateReport.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin me-1" />{isAr ? "جاري الإنشاء..." : "Generating..."}</>
                ) : (
                  <><Eye className="w-4 h-4 me-1" />{isAr ? "معاينة التقرير" : "Preview report"}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <DashboardReportPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          payload={previewPayload}
          uiLang={lang as "ar" | "en"}
        />
      </div>
    </DashboardLayout>
  );
}
