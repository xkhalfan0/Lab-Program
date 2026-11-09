import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardReportPreviewDialog, {
  type ReportPreviewPayload,
} from "@/components/DashboardReportPreviewDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLanguage, formatDateForLang } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  buildContractEndDateMap,
  computeContractReadinessRows,
  computeContractorBreakdown,
  computeQualityAlerts,
  CONTRACT_CLOSURE_ALERT_DAYS,
  type QualityAlert,
  type ContractorBreakdown,
} from "@shared/dashboardInsights";
import {
  FlaskConical, CheckCircle, Activity, Target,
  Calendar, FileText, Users, Award,
  Loader2, Eye, ChevronDown, ChevronUp, ShieldAlert,
  MapPin, Zap, AlertOctagon, XCircle, ThumbsUp, Settings2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { DEFAULT_VAT_RATE, formatVatRatePercent } from "@shared/tax";

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

  const openOrders = Math.max(0, c.totalOrders - c.decided);
  const riskConfig = c.decided === 0
    ? { cls: "bg-slate-100 text-slate-600", label: isAr ? "بانتظار QC" : "Awaiting QC", bar: "bg-slate-300" }
    : c.insufficientData
    ? {
        cls: "bg-slate-100 text-slate-700",
        label: isAr ? "قراءة أولية" : "Early read",
        bar: c.passRate >= 60 ? "bg-green-500" : "bg-red-500",
      }
    : {
        low: { cls: "bg-green-100 text-green-700", label: isAr ? "منخفض" : "Low Risk", bar: "bg-green-500" },
        medium: { cls: "bg-amber-100 text-amber-700", label: isAr ? "متوسط" : "Medium", bar: "bg-amber-500" },
        high: { cls: "bg-orange-100 text-orange-700", label: isAr ? "عالٍ" : "High Risk", bar: "bg-orange-500" },
        critical: { cls: "bg-red-100 text-red-700", label: isAr ? "حرجة" : "Critical", bar: "bg-red-500" },
      }[c.riskLevel];

  return (
    <div className="border rounded-xl p-3 space-y-2 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate">{c.contractor}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {c.totalOrders} {isAr ? "طلب" : "order(s)"} · {c.decided} {isAr ? "نتيجة QC" : "QC result(s)"} · {openOrders} {isAr ? "ما زال مفتوحاً" : "still open"}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${riskConfig.cls}`}>
          {riskConfig.label}
        </span>
      </div>

      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full ${riskConfig.bar} transition-all`}
          style={{ width: c.decided > 0 ? `${c.passRate}%` : "0%" }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1 min-w-0">
          {c.decided === 0 ? (
            <span className="text-slate-600 font-medium">
              {isAr ? "لا توجد نتيجة QC بعد — الطلبات المفتوحة ليست نجاحاً ولا رفضاً" : "No QC result yet — open orders are not a pass or a fail"}
            </span>
          ) : (
            <span className={c.passRate >= 60 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
              {c.passed} {isAr ? "نجاح" : "pass"} · {c.failed} {isAr ? "رفض" : "fail"} · {c.passRate}%
              {c.insufficientData ? (isAr ? " · يحتاج 3 نتائج للتقييم" : " · risk rating needs 3 results") : ""}
            </span>
          )}
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
                  <span className="flex items-center gap-1.5 shrink-0 text-slate-600">
                    <span className="text-green-700">{p.passed} {isAr ? "نجاح" : "pass"}</span>
                    <span className="text-red-700">{p.failed} {isAr ? "رفض" : "fail"}</span>
                    <span>{Math.max(0, p.total - p.decided)} {isAr ? "مفتوح" : "open"}</span>
                    <span className={`font-bold ${p.decided === 0 ? "text-slate-400" : p.passRate >= 60 ? "text-green-700" : "text-red-700"}`}>
                      {p.decided > 0 ? `${p.passRate}%` : "—"}
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

function LabTaxSettingsCard({ lang }: { lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const { user } = useAuth();
  const canEdit = ["admin", "lab_manager"].includes(user?.role ?? "");
  const { data, refetch } = trpc.labSettings.get.useQuery();
  const updateMut = trpc.labSettings.update.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم حفظ إعدادات الضريبة" : "Tax settings saved");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [vatPercent, setVatPercent] = useState("");
  const [labTrn, setLabTrn] = useState("");

  const loadedRate = data?.vatRate ?? DEFAULT_VAT_RATE;
  const displayVat = vatPercent !== "" ? vatPercent : String(formatVatRatePercent(loadedRate));
  const displayTrn = labTrn !== "" ? labTrn : (data?.labTrn ?? "");

  const handleSave = () => {
    const pct = parseFloat(displayVat);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error(isAr ? "نسبة ضريبة غير صالحة" : "Invalid VAT percentage");
      return;
    }
    updateMut.mutate({
      vatRate: pct / 100,
      labTrn: displayTrn.trim() || null,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          {isAr ? "إعدادات ضريبة القيمة المضافة" : "VAT & Tax Settings"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {isAr ? "نسبة ض.ق.م (%)" : "VAT rate (%)"}
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={displayVat}
              onChange={(e) => setVatPercent(e.target.value)}
              disabled={!canEdit}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {isAr ? "الرقم الضريبي للمختبر (TRN)" : "Lab TRN"}
            </label>
            <Input
              value={displayTrn}
              onChange={(e) => setLabTrn(e.target.value.replace(/\D/g, "").slice(0, 15))}
              disabled={!canEdit}
              placeholder="15 digits"
              className="h-9 font-mono"
              maxLength={15}
            />
          </div>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending
              ? (isAr ? "جاري الحفظ..." : "Saving...")
              : (isAr ? "حفظ الإعدادات" : "Save settings")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isAr ? "عرض فقط — التعديل للمدير أو المسؤول" : "Read-only — edit requires admin or lab manager"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManagerDashboard() {
  const { lang, t, dir } = useLanguage();
  const isAr = lang === "ar";
  const now = new Date();

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

  const { data: rawOrdersData = [] } = trpc.orders.list.useQuery();
  const { data: contractsList = [] } = trpc.contracts.list.useQuery();
  const { data: followUp } = trpc.dashboard.qualityFollowUp.useQuery();
  const { data: techWork = [] } = trpc.dashboard.technicianDailyWork.useQuery();
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

  const contractEndByNumber = useMemo(
    () =>
      buildContractEndDateMap(
        contractsList.map((c) => ({
          contractNumber: c.contractNumber,
          endDate: c.endDate,
        })),
      ),
    [contractsList],
  );

  const contractReadinessRows = useMemo(
    () => computeContractReadinessRows(orders, contractEndByNumber),
    [orders, contractEndByNumber],
  );
  const contractorBreakdown = useMemo(() => computeContractorBreakdown(orders), [orders]);
  const qualityAlerts = useMemo(
    () => computeQualityAlerts(orders, contractEndByNumber),
    [orders, contractEndByNumber],
  );
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
            <p className="text-muted-foreground text-sm mt-0.5">
              {isAr
                ? "متابعة اليوم: ما لم يبدأ، ما هو قيد الفحص، وما ينتظر المراجعة أو ضبط الجودة."
                : "Today’s follow-up: not started, in testing, and waiting for review or QC."}
            </p>
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
                    {isAr ? "تنبيهات تحتاج متابعة" : "Alerts that need attention"}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? "جودة المقاول، مشاكل موقع/مورد، أو تأخر المختبر قبل انتهاء العقد (خلال 60 يوماً)."
                      : "Contractor quality, site/supplier issues, or lab backlog within 60 days of contract end."}
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
                { type: "closure_risk", icon: AlertOctagon, labelEn: "Before contract end", labelAr: "قبل انتهاء العقد", color: "text-amber-600 bg-amber-50 border-amber-200" },
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
                {isAr ? "لا توجد تنبيهات حالياً" : "No alerts right now"}
              </p>
              <p className="text-xs text-green-600">
                {isAr
                  ? "لا يوجد مقاول بجودة منخفضة، ولا شذوذ موقع، ولا عقد قريب الانتهاء مع تأخر كبير في المختبر."
                  : "No low-quality contractor, site anomaly, or near-deadline contract with a large lab backlog."}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label={isAr ? "لم يبدأ" : "To start"} value={followUp?.toStart ?? 0} sub={isAr ? "موزّع ولم يُفتح" : "Assigned, not opened"} icon={Activity} color="text-slate-600" borderColor="border-l-slate-400" />
          <KpiCard label={isAr ? "قيد الفحص" : "In testing"} value={followUp?.testing ?? 0} sub={isAr ? "عند الفني الآن" : "With a technician"} icon={FlaskConical} color="text-blue-600" borderColor="border-l-blue-500" />
          <KpiCard label={isAr ? "عند المدير" : "Manager review"} value={followUp?.withManager ?? 0} sub={isAr ? "الفني أنهى الفحص" : "Technician finished"} icon={FileText} color="text-amber-600" borderColor="border-l-amber-500" />
          <KpiCard label={isAr ? "ضبط الجودة" : "QC review"} value={followUp?.withQc ?? 0} sub={isAr ? "بانتظار الاعتماد" : "Waiting for approval"} icon={Award} color="text-violet-600" borderColor="border-l-violet-500" />
          <KpiCard label={isAr ? "ناجح" : "Passed"} value={followUp?.passed ?? 0} sub={isAr ? "نتيجة محفوظة أو معتمد QC" : "Saved result or QC approved"} icon={CheckCircle} color="text-green-600" borderColor="border-l-green-500" />
          <KpiCard label={isAr ? "راسب" : "Failed"} value={followUp?.failed ?? 0} sub={isAr ? "نتيجة راسبة أو طلب مرفوض" : "Failed result or rejected order"} icon={XCircle} color="text-red-600" borderColor="border-l-red-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{isAr ? "يحتاج متابعة" : "Needs follow-up"}</CardTitle>
              <CardDescription className="text-xs">
                {isAr
                  ? `اليوم: ${followUp?.receivedToday ?? 0} عينة مستلمة · ${followUp?.submittedToday ?? 0} فحص أُرسل. نفس تكليفات الفنيين فقط، بدون النسخ المكررة.`
                  : `Today: ${followUp?.receivedToday ?? 0} samples received · ${followUp?.submittedToday ?? 0} tests submitted. Only real technician assignments, with duplicate copies hidden.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(followUp?.followUps.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{isAr ? "لا توجد فحوصات معلقة" : "Nothing waiting"}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-start py-2 px-2 font-medium">{isAr ? "العينة" : "Sample"}</th>
                        <th className="text-start py-2 px-2 font-medium">{isAr ? "الفحص" : "Test"}</th>
                        <th className="text-start py-2 px-2 font-medium">{isAr ? "المقاول" : "Contractor"}</th>
                        <th className="text-start py-2 px-2 font-medium">{isAr ? "الفني" : "Technician"}</th>
                        <th className="text-start py-2 px-2 font-medium">{isAr ? "المرحلة" : "Stage"}</th>
                        <th className="text-end py-2 px-2 font-medium">{isAr ? "منذ" : "Age"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUp?.followUps.map((row) => {
                        const stageLabel = {
                          to_start: isAr ? "لم يبدأ" : "To start",
                          testing: isAr ? "قيد الفحص" : "In testing",
                          manager: isAr ? "عند المدير" : "Manager",
                          qc: isAr ? "ضبط الجودة" : "QC",
                        }[row.stage];
                        return (
                          <tr key={row.distributionId} className="border-b last:border-0">
                            <td className="py-2 px-2 font-mono">{row.sampleCode}</td>
                            <td className="py-2 px-2">{row.testName}</td>
                            <td className="py-2 px-2">
                              <span className="block">{row.contractor}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{row.contractNo}</span>
                            </td>
                            <td className="py-2 px-2">{row.technician}</td>
                            <td className="py-2 px-2">{stageLabel}</td>
                            <td className="py-2 px-2 text-end tabular-nums">{row.ageDays}{isAr ? " ي" : "d"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                {isAr ? "عمل الفنيين اليوم" : "Technicians today"}
              </CardTitle>
              <CardDescription className="text-xs">
                {isAr ? "الفحوصات المفتوحة وما أُنهي اليوم." : "Open tests, and how many were finished today."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {techWork.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{isAr ? "لا يوجد تكليف مفتوح" : "No open assignments"}</p>
              ) : (
                <div className="space-y-2">
                  {techWork.map((tech) => (
                    <div key={tech.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tech.name}</p>
                        {tech.specialty ? <p className="text-[10px] text-muted-foreground truncate">{tech.specialty}</p> : null}
                      </div>
                      <div className="text-end shrink-0 text-xs">
                        <p className="font-semibold text-blue-700">{tech.assigned} {isAr ? "مفتوح" : "open"}</p>
                        <p className="text-green-700">{tech.doneToday} {isAr ? "اليوم" : "today"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(clearanceStats?.totalRequests ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {isAr ? "براءة الذمة" : "Clearance"}: {clearanceStats?.inProgress ?? 0} {isAr ? "قيد الإجراء" : "in progress"} · {clearanceStats?.issued ?? 0} {isAr ? "صادرة" : "issued"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contractor Quality — enhanced scorecard with drill-down */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-rose-600" />
                  {isAr ? "جودة المقاولين" : "Contractor quality"}
                </CardTitle>
                <CardDescription className="mt-1.5 text-xs">
                  {isAr
                    ? "النجاح = اعتماد QC فقط، والرفض = رفض الطلب. الطلبات لدى الفني أو بانتظار المراجعة تبقى مفتوحة ولا تُحسب 0%."
                    : "Pass = QC approved only. Fail = order rejected. Orders still with the technician or waiting for review stay open and are not shown as 0%."}
                </CardDescription>
              </div>
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
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                {isAr ? "تقدم طلبات المختبر حسب العقد" : "Lab order progress by contract"}
              </CardTitle>
              <CardDescription className="mt-1.5 text-xs">
                {isAr
                  ? `«معتمد QC» بعد اعتماد ضبط الجودة فقط. «مراجعة» = أنهى الفني وبانتظار المدير أو QC. التنبيه خلال ${CONTRACT_CLOSURE_ALERT_DAYS} يوماً من نهاية العقد.`
                  : `QC done is approval only. Review means the technician finished and the order is with the manager or QC. The end-date flag applies within ${CONTRACT_CLOSURE_ALERT_DAYS} days.`}
              </CardDescription>
            </div>
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
                      <th className="text-center px-3 py-2">{isAr ? "في المختبر" : "In lab"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "مراجعة" : "Review"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "معتمد QC" : "QC done"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "مرفوض" : "Rejected"}</th>
                      <th className="text-center px-3 py-2">{isAr ? "انتهاء العقد" : "Contract end"}</th>
                      <th className="text-end px-3 py-2">{isAr ? "معتمد %" : "QC done %"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractReadinessRows.slice(0, 10).map((r) => {
                      const warn =
                        r.inClosureWindow && r.readiness < 30 && r.total >= 5;
                      return (
                      <tr key={`${r.contractNo}-${r.contractor}`} className={`border-b last:border-0 ${warn ? "bg-red-50/40" : ""}`}>
                        <td className="px-3 py-2 font-mono">
                          {r.contractNo}
                          {warn && <span className="ms-1 text-red-500 text-[10px]">⚠</span>}
                        </td>
                        <td className="px-3 py-2">{r.contractor}</td>
                        <td className="px-3 py-2 text-center font-semibold">{r.total}</td>
                        <td className="px-3 py-2 text-center text-blue-700 font-semibold">{r.pending + r.inProgress}</td>
                        <td className="px-3 py-2 text-center text-amber-700 font-semibold">{r.waitingReview}</td>
                        <td className="px-3 py-2 text-center text-green-700 font-semibold">{r.completed}</td>
                        <td className="px-3 py-2 text-center text-red-700 font-semibold">{r.rejected}</td>
                        <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                          {r.endDate
                            ? formatDateForLang(r.endDate, lang)
                            : "—"}
                          {r.daysUntilEnd != null && r.inClosureWindow && (
                            <span className={`block text-[10px] font-semibold ${r.daysUntilEnd < 0 ? "text-red-600" : "text-amber-700"}`}>
                              {r.daysUntilEnd < 0
                                ? isAr
                                  ? `متأخر ${Math.abs(r.daysUntilEnd)} ي`
                                  : `${Math.abs(r.daysUntilEnd)}d overdue`
                                : r.daysUntilEnd === 0
                                  ? isAr
                                    ? "اليوم"
                                    : "Today"
                                  : isAr
                                    ? `${r.daysUntilEnd} ي`
                                    : `${r.daysUntilEnd}d left`}
                            </span>
                          )}
                        </td>
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
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{isAr ? "الفحوصات" : "Tests"}</CardTitle>
            <CardDescription className="mt-1.5 text-xs">
              {isAr
                ? "مفتوح = لم يُرسل بعد. مُرسل = أنهى الفني. النجاح والرسوب من نتيجة المكعبات أو نموذج الفحص بعد الإرسال، وليس من المسودة."
                : "Open = not submitted yet. Submitted = technician finished. Pass and fail come from the saved cube or test form after submit, not from a draft."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(followUp?.byTest.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{isAr ? "لا توجد فحوصات مكلّفة" : "No assigned tests"}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start py-2 px-3 text-muted-foreground font-medium">{isAr ? "الفحص" : "Test"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "مفتوح" : "Open"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "مُرسل" : "Submitted"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "ناجح" : "Pass"}</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">{isAr ? "راسب" : "Fail"}</th>
                      <th className="text-end py-2 px-3 text-muted-foreground font-medium">{isAr ? "النجاح" : "Pass rate"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUp?.byTest.map((row) => {
                      const decided = row.passed + row.failed;
                      const pr = decided > 0 ? Math.round((row.passed / decided) * 100) : null;
                      return (
                        <tr key={row.code} className="border-b last:border-0">
                          <td className="py-2 px-3 font-medium">{isAr ? row.nameAr || row.nameEn : row.nameEn}</td>
                          <td className="py-2 px-3 text-center text-blue-700 font-semibold">{row.open}</td>
                          <td className="py-2 px-3 text-center font-semibold">{row.submitted}</td>
                          <td className="py-2 px-3 text-center text-green-700 font-semibold">{row.passed}</td>
                          <td className="py-2 px-3 text-center text-red-700 font-semibold">{row.failed}</td>
                          <td className="py-2 px-3 text-end text-muted-foreground">{pr == null ? "—" : `${pr}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VAT / TRN Settings */}
        <LabTaxSettingsCard lang={lang as "ar" | "en"} />

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
