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
} from "@shared/dashboardInsights";
import {
  FlaskConical, AlertTriangle, CheckCircle, Activity, Target,
  Calendar, FileText, Users, Award, TrendingUp, TrendingDown,
  Loader2, BarChart2, Eye,
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

export default function ManagerDashboard() {
  const { lang, t, dir } = useLanguage();
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
      toast.success(lang === "ar" ? "تم إنشاء التقرير" : "Report ready", {
        description:
          lang === "ar"
            ? "يمكنك المعاينة والطباعة أو التنزيل"
            : "You can preview, print, or download",
      });
    },
    onError: (err) => {
      toast.error(lang === "ar" ? "فشل إنشاء التقرير" : "Report generation failed", {
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

  const contractReadinessRows = useMemo(
    () => computeContractReadinessRows(orders),
    [orders]
  );
  const contractorScores = useMemo(
    () => computeContractorScores(orders),
    [orders]
  );
  const topTests = useMemo(() => (stats?.byTestType ?? []).slice(0, 6), [stats?.byTestType]);

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

  return (
    <DashboardLayout>
      <div className="space-y-6" dir={dir}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" />
              {lang === "ar" ? "لوحة التحكم" : "Dashboard"}
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
                {now.toLocaleTimeString(lang === "ar" ? "ar-AE" : "en-AE", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.uaeTime")}</p>
            </div>
          </div>
        </div>

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
            label={lang === "ar" ? "الفنيون النشطون" : "Active technicians"}
            value={techStats?.activeCount ?? 0}
            sub={lang === "ar" ? "في الوردية" : "on shift"}
            icon={Users}
            color="text-indigo-600"
            borderColor="border-l-indigo-400"
          />
          <KpiCard
            label={lang === "ar" ? "اختبارات / فني" : "Tests / technician"}
            value={techStats?.avgTestsPerTech ?? 0}
            sub={lang === "ar" ? "متوسط هذا الأسبوع" : "avg this week"}
            icon={BarChart2}
            color="text-violet-600"
            borderColor="border-l-violet-400"
          />
          <KpiCard
            label={lang === "ar" ? "طلبات براءة الذمة" : "Clearance requests"}
            value={clearanceStats?.totalRequests ?? 0}
            sub={`${clearanceStats?.inProgress ?? 0} ${lang === "ar" ? "قيد الإجراء" : "in progress"}`}
            icon={FileText}
            color="text-amber-600"
            borderColor="border-l-amber-400"
          />
          <KpiCard
            label={lang === "ar" ? "براءات صادرة" : "Clearances done"}
            value={clearanceStats?.issued ?? 0}
            sub={lang === "ar" ? "شهادات صادرة" : "certificates issued"}
            icon={Award}
            color="text-emerald-600"
            borderColor="border-l-emerald-400"
          />
        </div>

        {/* Contract Closure Readiness */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              {lang === "ar" ? "جاهزية إغلاق العقود" : "Contract Closure Readiness"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contractReadinessRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد عقود نشطة" : "No active contracts"}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-start px-3 py-2">{lang === "ar" ? "رقم العقد" : "Contract No."}</th>
                      <th className="text-start px-3 py-2">{lang === "ar" ? "المقاول" : "Contractor"}</th>
                      <th className="text-center px-3 py-2">{lang === "ar" ? "إجمالي" : "Total"}</th>
                      <th className="text-center px-3 py-2">{lang === "ar" ? "مكتمل" : "Completed"}</th>
                      <th className="text-center px-3 py-2">{lang === "ar" ? "قيد التنفيذ" : "In Progress"}</th>
                      <th className="text-center px-3 py-2">{lang === "ar" ? "معلق" : "Pending"}</th>
                      <th className="text-end px-3 py-2">{lang === "ar" ? "الجاهزية %" : "Readiness %"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractReadinessRows.slice(0, 8).map((r) => (
                      <tr key={`${r.contractNo}-${r.contractor}`} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono">{r.contractNo}</td>
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

        {/* Contractor Quality Scorecard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="w-4 h-4 text-rose-600" />
              {lang === "ar" ? "بطاقة جودة المقاولين" : "Contractor Quality Scorecard"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contractorScores.length === 0 ? (
              <div className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد بيانات" : "No data"}</div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {contractorScores.slice(0, 8).map((c) => {
                  const riskCls =
                    c.riskLevel === "low" ? "bg-green-100 text-green-700" :
                    c.riskLevel === "medium" ? "bg-amber-100 text-amber-700" :
                    c.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                    "bg-red-100 text-red-700 animate-pulse";
                  const riskLabel =
                    c.riskLevel === "low" ? (lang === "ar" ? "مخاطر منخفضة" : "Low Risk") :
                    c.riskLevel === "medium" ? (lang === "ar" ? "مخاطر متوسطة" : "Medium Risk") :
                    c.riskLevel === "high" ? (lang === "ar" ? "مخاطر عالية" : "High Risk") :
                    (lang === "ar" ? "حرجة" : "Critical");
                  return (
                    <div key={c.contractor} className="border rounded-lg p-3 space-y-2 bg-card">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate">{c.contractor}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${riskCls}`}>{riskLabel}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${c.passRate}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{lang === "ar" ? "النجاح" : "Pass"}: {c.passRate}%</span>
                        <span>{lang === "ar" ? "الطلبات" : "Orders"}: {c.totalOrders}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {c.passRate >= 60 ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
                        <span className={c.passRate >= 60 ? "text-green-600" : "text-red-600"}>
                          {c.passRate >= 60 ? (lang === "ar" ? "اتجاه جيد" : "Positive trend") : (lang === "ar" ? "اتجاه مقلق" : "Risk trend")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Frequent Tests */}
        {topTests.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {lang === "ar" ? "أكثر الاختبارات تكراراً" : "Most Frequent Tests"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "نوع الاختبار" : "Test Type"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "الفئة" : "Category"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "العدد" : "Count"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "ناجح" : "Pass"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "راسب" : "Fail"}</th>
                      <th className="text-end py-2 px-3 text-muted-foreground font-medium">{lang === "ar" ? "نسبة النجاح" : "Pass Rate"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTests.map((t2, i) => {
                      const pr = t2.count > 0 ? Math.round((t2.passed / t2.count) * 100) : 0;
                      const catLabel = CATEGORY_LABELS[t2.category];
                      return (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium">{lang === "ar" ? t2.nameAr || t2.nameEn : t2.nameEn}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline" className="text-[10px]">
                              {lang === "ar" ? catLabel?.ar ?? t2.category : catLabel?.en ?? t2.category}
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {lang === "ar" ? "إنشاء تقرير" : "Generate report"}
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
                  <span>{lang === "ar" ? sec.ar : sec.en}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{lang === "ar" ? "الفترة" : "Range"}</span>
                <select
                  className="h-8 text-xs border rounded-md px-2 bg-background"
                  value={reportRange}
                  onChange={(e) => setReportRange(e.target.value as typeof reportRange)}
                >
                  <option value="month">{lang === "ar" ? "هذا الشهر" : "This month"}</option>
                  <option value="quarter">{lang === "ar" ? "هذا الربع" : "This quarter"}</option>
                  <option value="year">{lang === "ar" ? "هذا العام" : "This year"}</option>
                  <option value="custom">{lang === "ar" ? "نطاق مخصص" : "Custom range"}</option>
                </select>
              </div>

              {reportRange === "custom" && (
                <>
                  <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="h-8 text-xs w-36" />
                  <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="h-8 text-xs w-36" />
                </>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{lang === "ar" ? "الصيغة" : "Format"}</span>
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
                <span className="text-xs text-muted-foreground">{lang === "ar" ? "لغة التقرير" : "Report language"}</span>
                <div className="flex items-center gap-0.5 border rounded-md overflow-hidden text-xs h-8">
                  {([
                    { value: "ar" as const, label: "AR" },
                    { value: "en" as const, label: "EN" },
                    { value: "both" as const, label: lang === "ar" ? "ثنائي" : "Both" },
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
                  <><Loader2 className="w-4 h-4 animate-spin me-1" />{lang === "ar" ? "جاري الإنشاء..." : "Generating..."}</>
                ) : (
                  <><Eye className="w-4 h-4 me-1" />{lang === "ar" ? "معاينة التقرير" : "Preview report"}</>
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
