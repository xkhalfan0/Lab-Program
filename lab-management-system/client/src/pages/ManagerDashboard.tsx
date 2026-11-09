import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardReportPreviewDialog, {
  type ReportPreviewPayload,
} from "@/components/DashboardReportPreviewDialog";
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
} from "@shared/dashboardInsights";
import {
  Search, FileText, Users, Eye, Loader2, Settings2,
  ChevronDown, ChevronUp, AlertTriangle,
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

type OpenStage = "all" | "to_start" | "testing" | "manager" | "qc";

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
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-slate-500" />
        {isAr ? "ضريبة القيمة المضافة" : "VAT"}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">
            {isAr ? "النسبة (%)" : "Rate (%)"}
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
          <label className="text-[11px] text-slate-500 block mb-1">
            {isAr ? "الرقم الضريبي" : "Lab TRN"}
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
        <Button size="sm" variant="outline" onClick={handleSave} disabled={updateMut.isPending}>
          {updateMut.isPending ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? "حفظ" : "Save")}
        </Button>
      ) : (
        <p className="text-[11px] text-slate-400">
          {isAr ? "عرض فقط" : "Read-only"}
        </p>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const { lang, dir } = useLanguage();
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
  const [stage, setStage] = useState<OpenStage>("all");
  const [query, setQuery] = useState("");
  const [openContractor, setOpenContractor] = useState<string | null>(null);

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
    sampleCode: o.sampleCode != null ? String(o.sampleCode) : null,
    orderCode: o.orderCode != null ? String(o.orderCode) : null,
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

  const q = query.trim().toLowerCase();

  const workRows = useMemo(() => {
    const rows = [...(followUp?.followUps ?? [])];
    return rows
      .filter((row) => stage === "all" || row.stage === stage)
      .filter((row) => {
        if (!q) return true;
        return [row.sampleCode, row.testName, row.contractor, row.contractNo, row.technician]
          .some((value) => (value ?? "").toLowerCase().includes(q));
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [followUp?.followUps, stage, q]);

  const contractRows = useMemo(() => {
    if (!q) return contractReadinessRows;
    return contractReadinessRows.filter((row) =>
      [row.contractNo, row.contractor, ...row.openSamples, ...row.reviewOrders]
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [contractReadinessRows, q]);

  const toggleSection = (value: string) => {
    setReportSections((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
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
    const sectionsForAlert = ["overview", "scorecard", "readiness"];
    setReportSections((prev) => Array.from(new Set([...prev, ...sectionsForAlert])));
    toast.info(
      isAr ? "أُضيفت أقسام التقرير" : "Report sections added",
      { description: isAr ? "معاينة التقرير في أسفل الصفحة" : "Preview is at the bottom of the page" },
    );
    setTimeout(() => document.getElementById("report-generator")?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const stages: { id: OpenStage; en: string; ar: string; value: number }[] = [
    { id: "all", en: "Open work", ar: "العمل المفتوح", value: (followUp?.toStart ?? 0) + (followUp?.testing ?? 0) + (followUp?.withManager ?? 0) + (followUp?.withQc ?? 0) },
    { id: "to_start", en: "To start", ar: "لم يبدأ", value: followUp?.toStart ?? 0 },
    { id: "testing", en: "In testing", ar: "قيد الفحص", value: followUp?.testing ?? 0 },
    { id: "manager", en: "Your review", ar: "مراجعتك", value: followUp?.withManager ?? 0 },
    { id: "qc", en: "QC", ar: "ضبط الجودة", value: followUp?.withQc ?? 0 },
  ];

  const stageLabel = (value: string) => ({
    to_start: isAr ? "لم يبدأ" : "To start",
    testing: isAr ? "قيد الفحص" : "In testing",
    manager: isAr ? "مراجعتك" : "Your review",
    qc: isAr ? "ضبط الجودة" : "QC",
  }[value] ?? value);

  const stageTone = (value: string) => ({
    to_start: "bg-slate-100 text-slate-700",
    testing: "bg-blue-50 text-blue-700",
    manager: "bg-amber-50 text-amber-800",
    qc: "bg-violet-50 text-violet-700",
  }[value] ?? "bg-slate-100 text-slate-600");

  return (
    <DashboardLayout>
      <div className="space-y-4" dir={dir}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isAr ? "ذكاء الجودة" : "Quality Intelligence"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isAr
                ? `${formatDateForLang(now, lang)} · ${followUp?.receivedToday ?? 0} عينة اليوم · ${followUp?.submittedToday ?? 0} فحص أُرسل`
                : `${formatDateForLang(now, lang)} · ${followUp?.receivedToday ?? 0} received today · ${followUp?.submittedToday ?? 0} tests submitted`}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-end">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{isAr ? "ناجح" : "Passed"}</p>
              <p className="text-lg font-semibold text-emerald-700 tabular-nums">{followUp?.passed ?? 0}</p>
            </div>
            <div className="text-end">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{isAr ? "راسب" : "Failed"}</p>
              <p className="text-lg font-semibold text-red-600 tabular-nums">{followUp?.failed ?? 0}</p>
            </div>
            {(clearanceStats?.totalRequests ?? 0) > 0 && (
              <div className="text-end">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{isAr ? "براءة الذمة" : "Clearance"}</p>
                <p className="text-sm font-medium text-slate-700 tabular-nums">
                  {clearanceStats?.inProgress ?? 0} {isAr ? "جارية" : "open"} · {clearanceStats?.issued ?? 0} {isAr ? "صادرة" : "issued"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "عينة، فحص، مقاول، عقد، أو رقم طلب" : "Sample, test, contractor, contract, or order number"}
            className="ps-9 h-11 bg-white"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {stages.map((item) => {
            const active = stage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setStage(item.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {isAr ? item.ar : item.en}
                <span className={`ms-1.5 tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{item.value}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <section className="xl:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{isAr ? "يحتاج متابعة" : "Needs follow-up"}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isAr ? "الأقدم أولاً. نفس تكليفات الفنيين، بدون النسخ المكررة." : "Oldest first. Real technician assignments only, duplicates hidden."}
                </p>
              </div>
              <span className="text-xs text-slate-400 tabular-nums">{workRows.length}</span>
            </div>
            {workRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-12 text-center">{isAr ? "لا يوجد شيء في هذا العرض" : "Nothing in this view"}</p>
            ) : (
              <div className="overflow-auto max-h-[440px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "العينة" : "Sample"}</th>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "الفحص" : "Test"}</th>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "المقاول" : "Contractor"}</th>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "الفني" : "Technician"}</th>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "المرحلة" : "Stage"}</th>
                      <th className="text-end px-3 py-2 font-medium">{isAr ? "منذ" : "Age"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workRows.map((row) => (
                      <tr key={row.distributionId} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">{row.sampleCode}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{row.testName}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className="block">{row.contractor}</span>
                          <span className="font-mono text-[11px] text-slate-400">{row.contractNo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{row.technician || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${stageTone(row.stage)}`}>
                            {stageLabel(row.stage)}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-end text-xs tabular-nums font-medium ${row.ageDays >= 30 ? "text-red-600" : row.ageDays >= 7 ? "text-amber-700" : "text-slate-500"}`}>
                          {row.ageDays}{isAr ? " ي" : "d"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                {isAr ? "الفنيون اليوم" : "Technicians today"}
              </h2>
              {techWork.length === 0 ? (
                <p className="text-xs text-slate-400 mt-3">{isAr ? "لا يوجد تكليف مفتوح" : "No open assignments"}</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {techWork.map((tech) => (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => setQuery(tech.name)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-start hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium truncate">{tech.name}</span>
                        {tech.specialty ? <span className="block text-[10px] text-slate-400 truncate">{tech.specialty}</span> : null}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-500 shrink-0">
                        {tech.assigned} {isAr ? "مفتوح" : "open"} · {tech.doneToday} {isAr ? "اليوم" : "today"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {isAr ? "تنبيهات" : "Watch"}
              </h2>
              <p className="text-[11px] text-slate-400 mt-1">
                {isAr
                  ? `جودة المقاول، أو الموقع، أو تأخر المختبر خلال ${CONTRACT_CLOSURE_ALERT_DAYS} يوماً من نهاية العقد.`
                  : `Contractor quality, a site issue, or lab backlog within ${CONTRACT_CLOSURE_ALERT_DAYS} days of contract end.`}
              </p>
              {qualityAlerts.length === 0 ? (
                <p className="text-xs text-slate-500 mt-3">{isAr ? "لا شيء يحتاج تنبيهاً" : "Nothing needs a warning"}</p>
              ) : (
                <div className="mt-3 space-y-2 max-h-64 overflow-auto">
                  {qualityAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => handleAlertReport(alert)}
                      className="w-full text-start rounded-lg border border-slate-100 px-2.5 py-2 hover:bg-slate-50"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">{isAr ? alert.titleAr : alert.titleEn}</span>
                        <span className="text-[10px] font-mono text-slate-400">{alert.metric}</span>
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{isAr ? alert.bodyAr : alert.bodyEn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">{isAr ? "الطلبات حسب العقد" : "Orders by contract"}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAr
                ? "معتمد QC بعد الاعتماد فقط. المراجعة = أنهى الفني. الأرقام تحت العدد هي رقم الطلب والعينة."
                : "QC done is approval only. Review means the technician finished. The lines under a count are the order and sample."}
            </p>
          </div>
          {contractRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">{isAr ? "لا توجد عقود" : "No contracts"}</p>
          ) : (
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "العقد" : "Contract"}</th>
                    <th className="text-start px-3 py-2 font-medium">{isAr ? "المقاول" : "Contractor"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "الإجمالي" : "Total"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "في المختبر" : "In lab"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "مراجعة" : "Review"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "معتمد" : "QC done"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "مرفوض" : "Rejected"}</th>
                    <th className="text-center px-3 py-2 font-medium">{isAr ? "النهاية" : "Ends"}</th>
                    <th className="text-end px-3 py-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {contractRows.map((r) => {
                    const warn = r.inClosureWindow && r.readiness < 30 && r.total >= 5 && r.completed > 0;
                    const pctTone = r.completed === 0
                      ? "text-slate-400"
                      : r.readiness >= 80 ? "text-emerald-700" : r.readiness >= 50 ? "text-amber-700" : "text-red-600";
                    return (
                      <tr key={`${r.contractNo}-${r.contractor}`} className={`border-t border-slate-100 ${warn ? "bg-red-50/50" : ""}`}>
                        <td className="px-3 py-2.5 font-mono">
                          {r.contractNo}
                          {warn && <span className="ms-1 text-red-500">⚠</span>}
                        </td>
                        <td className="px-3 py-2.5">{r.contractor}</td>
                        <td className="px-3 py-2.5 text-center font-semibold">{r.total}</td>
                        <td className="px-3 py-2.5 text-center text-blue-700 font-semibold">
                          {r.pending + r.inProgress}
                          {r.openSamples.length > 0 && (
                            <span className="block font-normal text-[10px] text-slate-400">
                              {r.openSamples.slice(0, 2).join(", ")}
                              {r.openSamples.length > 2 ? ` +${r.openSamples.length - 2}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-amber-700 font-semibold">
                          {r.waitingReview}
                          {r.reviewOrders.length > 0 && (
                            <span className="block font-normal text-[10px] text-slate-400">
                              {r.reviewOrders.slice(0, 2).join(", ")}
                              {r.reviewOrders.length > 2 ? ` +${r.reviewOrders.length - 2}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-emerald-700 font-semibold">{r.completed}</td>
                        <td className="px-3 py-2.5 text-center text-red-600 font-semibold">{r.rejected}</td>
                        <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">
                          {r.endDate ? formatDateForLang(r.endDate, lang) : "—"}
                          {r.daysUntilEnd != null && r.inClosureWindow && (
                            <span className={`block text-[10px] font-semibold ${r.daysUntilEnd < 0 ? "text-red-600" : "text-amber-700"}`}>
                              {r.daysUntilEnd < 0
                                ? (isAr ? `متأخر ${Math.abs(r.daysUntilEnd)} ي` : `${Math.abs(r.daysUntilEnd)}d overdue`)
                                : (isAr ? `${r.daysUntilEnd} ي` : `${r.daysUntilEnd}d left`)}
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-end font-semibold tabular-nums ${pctTone}`}>
                          {r.completed === 0 ? "—" : `${r.readiness}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{isAr ? "المقاولون" : "Contractors"}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAr
                  ? "النجاح اعتماد QC فقط. المفتوح ليس 0%."
                  : "Pass is QC approval only. Open orders are not 0%."}
              </p>
            </div>
            {contractorBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">{isAr ? "لا توجد بيانات" : "No data"}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {contractorBreakdown.map((c) => {
                  const open = Math.max(0, c.totalOrders - c.decided);
                  const expanded = openContractor === c.contractor;
                  const label = c.decided === 0
                    ? (isAr ? "بانتظار QC" : "Awaiting QC")
                    : c.insufficientData
                      ? (isAr ? "قراءة أولية" : "Early read")
                      : c.riskLevel === "low"
                        ? (isAr ? "جيد" : "Sound")
                        : c.riskLevel === "medium"
                          ? (isAr ? "متوسط" : "Watch")
                          : (isAr ? "ضعيف" : "Weak");
                  return (
                    <div key={c.contractor}>
                      <button
                        type="button"
                        onClick={() => setOpenContractor(expanded ? null : c.contractor)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-start hover:bg-slate-50"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold truncate">{c.contractor}</span>
                          <span className="block text-[11px] text-slate-400">
                            {c.totalOrders} {isAr ? "طلب" : "orders"} · {c.decided} QC · {open} {isAr ? "مفتوح" : "open"}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
                        <span className={`text-xs font-semibold tabular-nums w-10 text-end ${c.decided === 0 ? "text-slate-300" : c.passRate >= 60 ? "text-emerald-700" : "text-red-600"}`}>
                          {c.decided > 0 ? `${c.passRate}%` : "—"}
                        </span>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                      </button>
                      {expanded && (
                        <div className="px-4 pb-3 space-y-1">
                          <p className="text-[11px] text-slate-500">
                            {c.passed} {isAr ? "نجاح" : "pass"} · {c.failed} {isAr ? "رفض" : "fail"}
                            {c.insufficientData ? (isAr ? " · التقييم يحتاج 3 نتائج" : " · rating needs 3 results") : ""}
                          </p>
                          {c.projects.map((p) => (
                            <div key={p.contractNo} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                              <span className="font-mono truncate">{p.contractNo}</span>
                              <span className="text-slate-500 shrink-0">
                                {p.passed} {isAr ? "نجاح" : "pass"} · {p.failed} {isAr ? "رفض" : "fail"} · {Math.max(0, p.total - p.decided)} {isAr ? "مفتوح" : "open"}
                                <span className="ms-2 font-semibold text-slate-700">{p.decided > 0 ? `${p.passRate}%` : "—"}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{isAr ? "الفحوصات" : "Tests"}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAr
                  ? "النجاح والرسوب من النتيجة بعد الإرسال، وليس من المسودة."
                  : "Pass and fail come from the saved result after submit, not from a draft."}
              </p>
            </div>
            {(followUp?.byTest.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">{isAr ? "لا توجد فحوصات" : "No assigned tests"}</p>
            ) : (
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-start px-3 py-2 font-medium">{isAr ? "الفحص" : "Test"}</th>
                      <th className="text-center px-3 py-2 font-medium">{isAr ? "مفتوح" : "Open"}</th>
                      <th className="text-center px-3 py-2 font-medium">{isAr ? "مُرسل" : "Sent"}</th>
                      <th className="text-center px-3 py-2 font-medium">{isAr ? "ناجح" : "Pass"}</th>
                      <th className="text-center px-3 py-2 font-medium">{isAr ? "راسب" : "Fail"}</th>
                      <th className="text-end px-3 py-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUp?.byTest.map((row) => {
                      const decided = row.passed + row.failed;
                      const pr = decided > 0 ? Math.round((row.passed / decided) * 100) : null;
                      return (
                        <tr key={row.code} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{isAr ? row.nameAr || row.nameEn : row.nameEn}</td>
                          <td className="px-3 py-2 text-center text-blue-700 font-semibold">{row.open}</td>
                          <td className="px-3 py-2 text-center font-semibold">{row.submitted}</td>
                          <td className="px-3 py-2 text-center text-emerald-700 font-semibold">{row.passed}</td>
                          <td className="px-3 py-2 text-center text-red-600 font-semibold">{row.failed}</td>
                          <td className="px-3 py-2 text-end text-slate-500">{pr == null ? "—" : `${pr}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="report-generator">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              {isAr ? "تقرير" : "Report"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {REPORT_SECTIONS.map((sec) => (
                <label key={sec.value} className="flex items-center gap-2 text-xs cursor-pointer text-slate-700">
                  <Checkbox
                    checked={reportSections.includes(sec.value)}
                    onCheckedChange={() => toggleSection(sec.value)}
                  />
                  <span>{isAr ? sec.ar : sec.en}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 text-xs border rounded-md px-2 bg-white"
                value={reportRange}
                onChange={(e) => setReportRange(e.target.value as typeof reportRange)}
              >
                <option value="month">{isAr ? "هذا الشهر" : "This month"}</option>
                <option value="quarter">{isAr ? "هذا الربع" : "This quarter"}</option>
                <option value="year">{isAr ? "هذا العام" : "This year"}</option>
                <option value="custom">{isAr ? "نطاق" : "Custom"}</option>
              </select>
              {reportRange === "custom" && (
                <>
                  <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="h-8 text-xs w-36" />
                  <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="h-8 text-xs w-36" />
                </>
              )}
              <select
                className="h-8 text-xs border rounded-md px-2 bg-white"
                value={reportFormat}
                onChange={(e) => setReportFormat(e.target.value as "pdf" | "excel")}
              >
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
              </select>
              <div className="flex border rounded-md overflow-hidden text-xs h-8">
                {([
                  { value: "ar" as const, label: "AR" },
                  { value: "en" as const, label: "EN" },
                  { value: "both" as const, label: isAr ? "ثنائي" : "Both" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReportLang(opt.value)}
                    className={`px-2.5 h-full font-medium ${reportLang === opt.value ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleGenerate} disabled={generateReport.isPending || reportSections.length === 0}>
                {generateReport.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin me-1" />{isAr ? "جاري الإنشاء..." : "Generating..."}</>
                ) : (
                  <><Eye className="w-4 h-4 me-1" />{isAr ? "معاينة" : "Preview"}</>
                )}
              </Button>
            </div>
          </div>
          <LabTaxSettingsCard lang={lang as "ar" | "en"} />
        </div>

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
