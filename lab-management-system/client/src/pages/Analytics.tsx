import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import {
  FlaskConical, TrendingUp, CheckCircle2, XCircle, Clock,
  DollarSign, Filter, RotateCcw, ChevronDown, ChevronUp, Printer,
} from "lucide-react";

// ─── Category labels ──────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  concrete:   { ar: "خرسانة",  en: "Concrete",   color: "#3b82f6" },
  soil:       { ar: "تربة",    en: "Soil",        color: "#f59e0b" },
  steel:      { ar: "حديد",    en: "Steel",       color: "#6b7280" },
  asphalt:    { ar: "أسفلت",   en: "Asphalt",     color: "#1f2937" },
  aggregates: { ar: "ركام",    en: "Aggregates",  color: "#10b981" },
};

const MONTH_LABELS: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل",
  "05": "مايو",  "06": "يونيو",  "07": "يوليو", "08": "أغسطس",
  "09": "سبتمبر","10": "أكتوبر","11": "نوفمبر","12": "ديسمبر",
};

function formatMonth(m: string, lang: string) {
  const [year, mon] = m.split("-");
  return lang === "ar" ? `${MONTH_LABELS[mon]} ${year}` : m;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────────────────────────────
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
        <span className="font-semibold text-slate-800">{name}</span>
      </div>
      <div className="text-slate-600">عدد الاختبارات: <span className="font-bold text-slate-900">{value}</span></div>
    </div>
  );
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-slate-600">عدد الاختبارات: <span className="font-bold text-blue-700">{payload[0].value}</span></p>
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color ?? "text-slate-900"}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { lang } = useLanguage();

  // ─── Filters ───────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [contractId, setContractId] = useState<string>("all");
  const [contractorId, setContractorId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [testTypeCode, setTestTypeCode] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const queryInput = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    contractId: contractId !== "all" ? Number(contractId) : undefined,
    contractorId: contractorId !== "all" ? Number(contractorId) : undefined,
    category: (category !== "all" ? category : undefined) as any,
    testTypeCode: testTypeCode !== "all" ? testTypeCode : undefined,
  }), [dateFrom, dateTo, contractId, contractorId, category, testTypeCode]);

  const { data, isLoading, refetch } = trpc.analytics.testStats.useQuery(queryInput);

  const resetFilters = () => {
    setDateFrom(""); setDateTo("");
    setContractId("all"); setContractorId("all");
    setCategory("all"); setTestTypeCode("all");
  };

  // Pie chart data
  const pieData = (data?.byCategory ?? []).map(c => ({
    name: lang === "ar" ? (CATEGORY_LABELS[c.category]?.ar ?? c.category) : (CATEGORY_LABELS[c.category]?.en ?? c.category),
    value: c.count,
    color: CATEGORY_LABELS[c.category]?.color ?? "#94a3b8",
  }));

  // Bar chart data (by month)
  const barData = (data?.byMonth ?? []).map(m => ({
    name: formatMonth(m.month, lang),
    count: m.count,
  }));

  // Group byTestType by category for the table
  const groupedByCategory = useMemo(() => {
    type TestTypeRow = NonNullable<typeof data>["byTestType"][number];
    const map: Record<string, TestTypeRow[]> = {};
    for (const t of (data?.byTestType ?? [])) {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    }
    return map;
  }, [data?.byTestType]);

  const contractOptions = useMemo(
    () =>
      (data?.contracts ?? []).map((c) => ({
        value: String(c.id),
        label: `${c.contractNumber} — ${c.name}`,
        searchText: `${c.contractNumber} ${c.name}`,
      })),
    [data?.contracts]
  );

  const contractorOptions = useMemo(
    () =>
      (data?.contractors ?? []).map((c) => ({
        value: String(c.id),
        label: c.name,
        searchText: c.name,
      })),
    [data?.contractors]
  );

  const categoryOptions = useMemo(
    () =>
      Object.entries(CATEGORY_LABELS).map(([k, v]) => ({
        value: k,
        label: lang === "ar" ? v.ar : v.en,
        searchText: `${v.ar} ${v.en}`,
      })),
    [lang]
  );

  const testTypeOptions = useMemo(
    () =>
      (data?.testTypes ?? [])
        .filter((t) => category === "all" || t.category === category)
        .map((t) => ({
          value: t.code,
          label: lang === "ar" ? (t.nameAr || t.nameEn) : t.nameEn,
          searchText: `${t.code} ${t.nameEn} ${t.nameAr ?? ""}`,
        })),
    [data?.testTypes, category, lang]
  );

  return (
    <DashboardLayout>
      {/* Print header — only visible when printing */}
      <div className="hidden print:block mb-6">
        <div className="border-t-4 border-gray-900 pt-3 flex justify-between items-center">
          <div>
            <h1 className="text-[18px] font-extrabold text-gray-900">مختبر الإنشاءات والمواد الهندسية</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">Construction Materials &amp; Engineering Laboratory</p>
          </div>
          <div className="flex flex-col items-center px-5 border-x border-gray-300">
            <div className="w-12 h-12 rounded-full border-2 border-gray-800 flex items-center justify-center text-xl font-black">م</div>
            <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
          </div>
          <div className="text-left text-[12px] text-gray-600">
            <div>التاريخ: {new Date().toLocaleDateString("ar-AE")}</div>
          </div>
        </div>
        <div className="bg-gray-900 text-white text-center py-2.5 mt-3 mb-4">
          <p className="text-[15px] font-bold">تقرير الإحصائيات</p>
          <p className="text-[10px] text-gray-300 mt-0.5 tracking-wider uppercase">Analytics Report</p>
        </div>
      </div>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              {lang === "ar" ? "الإحصائيات والتقارير" : "Analytics & Reports"}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {lang === "ar" ? "تحليل شامل لجميع الاختبارات حسب الفترة والمشروع والنوع" : "Comprehensive test analysis by period, project, and type"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="w-4 h-4 me-1" />
              {lang === "ar" ? "تحديث" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer className="w-4 h-4 me-1" />
              {lang === "ar" ? "طباعة" : "Print"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setFiltersOpen(v => !v)}>
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                {lang === "ar" ? "الفلاتر" : "Filters"}
              </span>
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
          {filtersOpen && (
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Date From */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "من تاريخ" : "From"}</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs h-8" />
                </div>
                {/* Date To */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "إلى تاريخ" : "To"}</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs h-8" />
                </div>
                {/* Contract */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "العقد" : "Contract"}</Label>
                  <SearchableSelect
                    value={contractId}
                    onValueChange={setContractId}
                    allOption={{
                      value: "all",
                      label: lang === "ar" ? "جميع العقود" : "All Contracts",
                    }}
                    options={contractOptions}
                    placeholder={lang === "ar" ? "جميع العقود" : "All Contracts"}
                    searchPlaceholder={lang === "ar" ? "بحث بالعقد أو المشروع…" : "Search contract or project…"}
                    emptyText={lang === "ar" ? "لا توجد عقود" : "No contracts found"}
                  />
                </div>
                {/* Contractor */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "المقاول" : "Contractor"}</Label>
                  <SearchableSelect
                    value={contractorId}
                    onValueChange={setContractorId}
                    allOption={{
                      value: "all",
                      label: lang === "ar" ? "جميع المقاولين" : "All Contractors",
                    }}
                    options={contractorOptions}
                    placeholder={lang === "ar" ? "جميع المقاولين" : "All Contractors"}
                    searchPlaceholder={lang === "ar" ? "بحث بالمقاول…" : "Search contractor…"}
                    emptyText={lang === "ar" ? "لا يوجد مقاولون" : "No contractors found"}
                  />
                </div>
                {/* Category */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "الفئة" : "Category"}</Label>
                  <SearchableSelect
                    value={category}
                    onValueChange={(v) => { setCategory(v); setTestTypeCode("all"); }}
                    allOption={{
                      value: "all",
                      label: lang === "ar" ? "جميع الفئات" : "All Categories",
                    }}
                    options={categoryOptions}
                    placeholder={lang === "ar" ? "جميع الفئات" : "All Categories"}
                    searchPlaceholder={lang === "ar" ? "بحث بالفئة…" : "Search category…"}
                    emptyText={lang === "ar" ? "لا توجد فئات" : "No categories found"}
                  />
                </div>
                {/* Test Type */}
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "ar" ? "نوع الاختبار" : "Test Type"}</Label>
                  <SearchableSelect
                    value={testTypeCode}
                    onValueChange={setTestTypeCode}
                    allOption={{
                      value: "all",
                      label: lang === "ar" ? "جميع الأنواع" : "All Types",
                    }}
                    options={testTypeOptions}
                    placeholder={lang === "ar" ? "جميع الأنواع" : "All Types"}
                    searchPlaceholder={lang === "ar" ? "بحث بنوع الاختبار…" : "Search test type…"}
                    emptyText={lang === "ar" ? "لا توجد أنواع" : "No test types found"}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-slate-500">
                  <RotateCcw className="w-3 h-3 me-1" />
                  {lang === "ar" ? "مسح الفلاتر" : "Clear Filters"}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <FlaskConical className="w-8 h-8 animate-pulse me-2" />
            {lang === "ar" ? "جاري تحميل الإحصائيات..." : "Loading analytics..."}
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label={lang === "ar" ? "إجمالي الاختبارات" : "Total Tests"}
                value={data?.summary.total ?? 0}
                color="text-slate-900"
              />
              <StatCard
                label={lang === "ar" ? "مطابق" : "Passed"}
                value={data?.summary.passed ?? 0}
                sub={data?.summary.total ? `${Math.round(((data.summary.passed) / data.summary.total) * 100)}%` : undefined}
                color="text-green-700"
              />
              <StatCard
                label={lang === "ar" ? "غير مطابق" : "Failed"}
                value={data?.summary.failed ?? 0}
                sub={data?.summary.total ? `${Math.round(((data.summary.failed) / data.summary.total) * 100)}%` : undefined}
                color="text-red-700"
              />
              <StatCard
                label={lang === "ar" ? "قيد الفحص" : "Pending"}
                value={data?.summary.pending ?? 0}
                color="text-amber-700"
              />
              <StatCard
                label={lang === "ar" ? "القيمة الإجمالية (AED)" : "Total Value (AED)"}
                value={Number(data?.summary.totalAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                color="text-blue-700"
              />
            </div>

            {/* Charts Row */}
            {(data?.summary.total ?? 0) > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pie: by category */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-800">
                      {lang === "ar" ? "توزيع الاختبارات حسب الفئة" : "Tests by Category"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          strokeWidth={2}
                          stroke="#fff"
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                        <Legend content={<CustomLegend />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Bar: by month */}
                {barData.length > 1 ? (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-slate-800">
                        {lang === "ar" ? "الاختبارات حسب الشهر" : "Tests by Month"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={barData} margin={{ top: 5, right: 16, left: -8, bottom: 5 }} barCategoryGap="35%">
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip content={<BarTooltip />} cursor={{ fill: "#f1f5f9", radius: 4 }} />
                          <Bar
                            dataKey="count"
                            radius={[5, 5, 0, 0]}
                            fill="url(#barGradient)"
                          />
                          <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.7} />
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-0 shadow-sm flex items-center justify-center">
                    <CardContent className="py-16 text-center text-slate-400">
                      <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{lang === "ar" ? "بيانات شهرية غير كافية" : "Not enough monthly data"}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Detailed Table: by category → by test type */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  {lang === "ar" ? "تفصيل الاختبارات حسب الفئة والنوع" : "Tests Breakdown by Category & Type"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data?.summary.total ?? 0) === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>{lang === "ar" ? "لا توجد بيانات بهذه الفلاتر" : "No data for selected filters"}</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {Object.entries(groupedByCategory)
                      .sort((a, b) => {
                        const order = ["concrete", "soil", "steel", "asphalt", "aggregates"];
                        return order.indexOf(a[0]) - order.indexOf(b[0]);
                      })
                      .map(([cat, tests]) => {
                        const catLabel = lang === "ar" ? (CATEGORY_LABELS[cat]?.ar ?? cat) : (CATEGORY_LABELS[cat]?.en ?? cat);
                        const catColor = CATEGORY_LABELS[cat]?.color ?? "#94a3b8";
                        const catTotal = tests.reduce((s, t) => s + t.count, 0);
                        const catAmount = tests.reduce((s, t) => s + t.amount, 0);
                        const isExpanded = expandedCategory === cat;
                        return (
                          <div key={cat}>
                            {/* Category header row */}
                            <button
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-start"
                              onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                                <span className="font-semibold text-sm">{catLabel}</span>
                                <Badge variant="secondary" className="text-xs">{catTotal} {lang === "ar" ? "اختبار" : "tests"}</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span>{catAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED</span>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                            </button>
                            {/* Expanded: test type rows */}
                            {isExpanded && (
                              <div className="bg-slate-50/60">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200">
                                      <th className="text-start px-6 py-2 text-slate-500 font-medium">{lang === "ar" ? "نوع الاختبار" : "Test Type"}</th>
                                      <th className="text-center px-3 py-2 text-slate-500 font-medium">{lang === "ar" ? "العدد" : "Count"}</th>
                                      <th className="text-center px-3 py-2 text-green-700 font-medium">{lang === "ar" ? "مطابق" : "Pass"}</th>
                                      <th className="text-center px-3 py-2 text-red-700 font-medium">{lang === "ar" ? "غير مطابق" : "Fail"}</th>
                                      <th className="text-center px-3 py-2 text-amber-700 font-medium">{lang === "ar" ? "قيد الفحص" : "Pending"}</th>
                                      <th className="text-end px-4 py-2 text-slate-500 font-medium">{lang === "ar" ? "القيمة (AED)" : "Amount (AED)"}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tests.map((t, i) => (
                                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-white/80">
                                        <td className="px-6 py-2 font-medium">
                                          {lang === "ar" ? (t.nameAr || t.nameEn) : t.nameEn}
                                          {t.code && <span className="ms-2 text-slate-400 font-mono text-[10px]">{t.code}</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-slate-800">{t.count}</td>
                                        <td className="px-3 py-2 text-center text-green-700 font-semibold">{t.passed}</td>
                                        <td className="px-3 py-2 text-center text-red-700 font-semibold">{t.failed}</td>
                                        <td className="px-3 py-2 text-center text-amber-700 font-semibold">{t.pending}</td>
                                        <td className="px-4 py-2 text-end text-slate-600">{t.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      </tr>
                                    ))}
                                    {/* Category subtotal */}
                                    <tr className="bg-slate-100/80 font-semibold">
                                      <td className="px-6 py-2 text-slate-700">{lang === "ar" ? `إجمالي ${catLabel}` : `${catLabel} Total`}</td>
                                      <td className="px-3 py-2 text-center text-slate-900">{catTotal}</td>
                                      <td className="px-3 py-2 text-center text-green-700">{tests.reduce((s, t) => s + t.passed, 0)}</td>
                                      <td className="px-3 py-2 text-center text-red-700">{tests.reduce((s, t) => s + t.failed, 0)}</td>
                                      <td className="px-3 py-2 text-center text-amber-700">{tests.reduce((s, t) => s + t.pending, 0)}</td>
                                      <td className="px-4 py-2 text-end text-slate-700">{catAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {/* Grand Total */}
                    <div className="flex items-center justify-between px-4 py-3 bg-primary/5 font-bold text-sm">
                      <span className="text-slate-900">{lang === "ar" ? "المجموع الكلي" : "Grand Total"}</span>
                      <div className="flex items-center gap-6">
                        <span className="text-slate-700">{data?.summary.total} {lang === "ar" ? "اختبار" : "tests"}</span>
                        <span className="text-blue-700">
                          {Number(data?.summary.totalAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Contract Table */}
            {(data?.byContract ?? []).length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{lang === "ar" ? "ملخص حسب المشروع/العقد" : "Summary by Project / Contract"}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-start px-4 py-2">{lang === "ar" ? "رقم العقد" : "Contract No."}</th>
                        <th className="text-start px-4 py-2">{lang === "ar" ? "اسم المشروع" : "Project Name"}</th>
                        <th className="text-center px-4 py-2">{lang === "ar" ? "عدد الاختبارات" : "Tests"}</th>
                        <th className="text-end px-4 py-2">{lang === "ar" ? "القيمة (AED)" : "Amount (AED)"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.byContract ?? []).map((c, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono font-semibold text-primary">{c.contractNumber}</td>
                          <td className="px-4 py-2">{c.contractName}</td>
                          <td className="px-4 py-2 text-center font-bold">{c.count}</td>
                          <td className="px-4 py-2 text-end">{c.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
