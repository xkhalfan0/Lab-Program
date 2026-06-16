import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorAuth, useSectorLang } from "./SectorLayout";
import { SectorTestResultDialog } from "./SectorTestResultDialog";
import { SectorLoading, sectorTheme } from "./sectorUi";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Bell,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";

const t = {
  ar: {
    failedTitle: "نتيجة راسبة",
    failedTitlePlural: "نتيجتان راسبتان",
    failedSubtitle: "تحتاجان إلى مراجعة أو إعادة فحص",
    failedSubtitleOne: "تحتاج إلى مراجعة أو إعادة فحص",
    viewAll: "عرض الكل",
    viewReport: "عرض التقرير",
    failedResults: "نتائج راسبة",
    readyResults: "نتائج جاهزة",
    underInspection: "قيد الفحص",
    totalSamples: "إجمالي العينات",
    updates: "التحديثات",
    resultsTab: "النتائج",
    clearancesTab: "براءات الذمة",
    noUpdates: "لا توجد تحديثات",
    resultReady: "نتيجة جاهزة للتحميل",
    clearanceIssued: "تم إصدار براءة ذمة",
    retestRegistered: "تم تسجيل إعادة فحص",
    pass: "ناجح",
    fail: "راسب",
    just_now: "الآن",
    minutes_ago: "دقيقة",
    hours_ago: "ساعة",
    days_ago: "يوم",
    ago: "مضى",
    hourAgo: "منذ ساعة",
    yesterday: "أمس",
    outsideLimits: "خارج الحدود المسموحة",
    strengthBelow: "مقاومة أقل من المطلوب",
  },
  en: {
    failedTitle: "Failed Result",
    failedTitlePlural: "Failed Results",
    failedSubtitle: "Need review or re-test",
    failedSubtitleOne: "Needs review or re-test",
    viewAll: "View All",
    viewReport: "View Report",
    failedResults: "Failed Results",
    readyResults: "Ready Results",
    underInspection: "Under Inspection",
    totalSamples: "Total Samples",
    updates: "Updates",
    resultsTab: "Results",
    clearancesTab: "Clearances",
    noUpdates: "No updates yet",
    resultReady: "Result Ready for Download",
    clearanceIssued: "Clearance Certificate Issued",
    retestRegistered: "Re-test Registered",
    pass: "Pass",
    fail: "Fail",
    just_now: "Just now",
    minutes_ago: "min ago",
    hours_ago: "h ago",
    days_ago: "d ago",
    ago: "ago",
    hourAgo: "1 hour ago",
    yesterday: "Yesterday",
    outsideLimits: "Outside acceptable limits",
    strengthBelow: "Strength below required value",
  },
};

type InboxItem = {
  id: string;
  type: "result" | "clearance" | "notification";
  title: string;
  titleEn?: string;
  subtitle?: string;
  status?: string;
  isRead: boolean;
  createdAt: string | Date | null;
  refId: number;
  sampleCode?: string;
};

function timeAgo(dateVal: unknown, lang: "ar" | "en"): string {
  if (!dateVal) return "";
  const T = t[lang];
  const diff = Math.floor((Date.now() - new Date(dateVal as string).getTime()) / 1000);
  if (diff < 60) return T.just_now;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === "ar" ? `${T.ago} ${m} ${T.minutes_ago}` : `${m} ${T.minutes_ago}`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    if (h === 1 && lang === "en") return T.hourAgo;
    return lang === "ar" ? `${T.ago} ${h} ${T.hours_ago}` : `${h} ${T.hours_ago}`;
  }
  const d = Math.floor(diff / 86400);
  if (d === 1 && lang === "en") return T.yesterday;
  return lang === "ar" ? `${T.ago} ${d} ${T.days_ago}` : `${d} ${T.days_ago}`;
}

function isResultFail(item: InboxItem) {
  return item.type === "result" && (item.status === "fail" || item.status === "failed");
}

function activityLabel(item: InboxItem, lang: "ar" | "en"): string {
  const T = t[lang];
  if (item.type === "result") {
    if (isResultFail(item)) return T.failedTitle;
    return T.resultReady;
  }
  if (item.type === "clearance") return T.clearanceIssued;
  const title = lang === "ar" ? item.title : (item.titleEn ?? item.title);
  if (/retest|إعادة/i.test(title)) return T.retestRegistered;
  return title;
}

function FailedAlert({
  items,
  lang,
  onViewReport,
}: {
  items: Array<{
    id: number;
    sampleCode: string;
    testTypeNameAr: string;
    testTypeNameEn: string;
    hint?: string;
    createdAt: string | Date | null;
  }>;
  lang: "ar" | "en";
  onViewReport: (id: number, label: string) => void;
}) {
  const T = t[lang];
  const isRtl = lang === "ar";
  const count = items.length;
  if (count === 0) return null;

  const title =
    lang === "ar"
      ? count === 1
        ? "نتيجة راسبة واحدة"
        : count === 2
          ? T.failedTitlePlural
          : `${count} نتائج راسبة`
      : count === 1
        ? "1 Failed Result"
        : `${count} Failed Results`;

  return (
    <div className="overflow-hidden rounded-2xl border border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-red-200/80 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-800">{title}</h2>
            <p className="mt-0.5 text-sm text-red-600/90">
              {count === 1 ? T.failedSubtitleOne : T.failedSubtitle}
            </p>
          </div>
        </div>
        <Link
          href="/sector/results?filter=fail"
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          {T.viewAll}
        </Link>
      </div>
      <div className="divide-y divide-red-100">
        {items.map((item) => {
          const testLabel = isRtl ? item.testTypeNameAr : item.testTypeNameEn;
          const desc =
            item.hint && /^\d/.test(item.hint)
              ? `${testLabel} — ${T.outsideLimits}`
              : `${testLabel} — ${T.strengthBelow}`;
          return (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-bold text-red-900">{item.sampleCode}</p>
                <p className="mt-0.5 truncate text-xs text-red-700/80">{desc}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-500">{timeAgo(item.createdAt, lang)}</span>
                <button
                  type="button"
                  onClick={() => onViewReport(item.id, testLabel)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {T.viewReport}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "green" | "amber" | "slate";
}) {
  const tones = {
    red: { value: "text-red-600", border: "border-red-100", bg: "bg-red-50/50" },
    green: { value: "text-emerald-600", border: "border-emerald-100", bg: "bg-emerald-50/50" },
    amber: { value: "text-amber-600", border: "border-amber-100", bg: "bg-amber-50/50" },
    slate: { value: "text-slate-800", border: "border-slate-200", bg: "bg-white" },
  };
  const c = tones[tone];
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${c.border} ${c.bg}`}>
      <p className={`text-4xl font-bold tabular-nums ${c.value}`}>{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function ActivityRow({
  item,
  lang,
  onClick,
}: {
  item: InboxItem;
  lang: "ar" | "en";
  onClick: () => void;
}) {
  const T = t[lang];
  const isRtl = lang === "ar";
  const isFail = isResultFail(item);
  const label = activityLabel(item, lang);
  const code = item.sampleCode ?? (isRtl ? item.title : item.titleEn ?? item.title);

  let Icon = Bell;
  let iconBg = "bg-blue-50 border-blue-100";
  let iconColor = "text-blue-600";

  if (item.type === "result") {
    Icon = isFail ? AlertTriangle : CheckCircle2;
    iconBg = isFail ? "bg-red-100 border-red-200" : "bg-emerald-50 border-emerald-100";
    iconColor = isFail ? "text-red-600" : "text-emerald-600";
  } else if (item.type === "clearance") {
    Icon = FileCheck2;
    iconBg = "bg-blue-50 border-blue-100";
    iconColor = "text-blue-600";
  } else if (/retest|إعادة/i.test(item.title)) {
    Icon = RotateCcw;
    iconBg = "bg-amber-50 border-amber-100";
    iconColor = "text-amber-600";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-start transition last:border-0 hover:bg-slate-50 ${
        isFail ? "bg-red-50/60 hover:bg-red-50" : ""
      }`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <span className="w-16 flex-shrink-0 text-xs text-slate-400">{timeAgo(item.createdAt, lang)}</span>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${isFail ? "text-red-800" : "text-slate-800"}`}>{label}</p>
        <p className={`truncate text-xs ${isFail ? "text-red-600" : "text-slate-500"}`}>{code}</p>
      </div>
      {isFail && (
        <span className="flex-shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          {T.fail}
        </span>
      )}
      {isRtl ? (
        <ChevronLeft className="h-4 w-4 flex-shrink-0 text-slate-300" />
      ) : (
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
      )}
    </button>
  );
}

export default function SectorDashboard() {
  const { lang } = useSectorLang();
  const T = t[lang];
  const isRtl = lang === "ar";
  const { sector } = useSectorAuth();
  const [, setLocation] = useLocation();

  const [feedTab, setFeedTab] = useState<"all" | "result" | "clearance">("all");
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [selectedTestLabel, setSelectedTestLabel] = useState("");

  const { data: stats, isLoading: statsLoading } = trpc.sector.getDashboardStats.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const { data: inbox, isLoading: inboxLoading } = trpc.sector.getInbox.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const items: InboxItem[] = inbox?.items ?? [];

  const feedItems = useMemo(() => {
    let list = items;
    if (feedTab === "result") list = items.filter((i) => i.type === "result");
    else if (feedTab === "clearance") list = items.filter((i) => i.type === "clearance");

    return [...list].sort((a, b) => {
      const aFail = isResultFail(a) ? 0 : 1;
      const bFail = isResultFail(b) ? 0 : 1;
      if (aFail !== bFail) return aFail - bFail;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    }).slice(0, 12);
  }, [items, feedTab]);

  const openResult = (id: number, label = "") => {
    setSelectedResultId(id);
    setSelectedTestLabel(label);
  };

  const handleActivityClick = (item: InboxItem) => {
    if (item.type === "result") {
      openResult(item.refId, item.subtitle?.split(" — ").slice(1).join(" — ") ?? "");
    } else if (item.type === "clearance") {
      setLocation("/sector/clearances");
    } else {
      setLocation("/sector/inbox");
    }
  };

  const sectorName = isRtl ? sector?.nameAr : sector?.nameEn;
  const isLoading = statsLoading || inboxLoading;

  const feedTabs = [
    { key: "all" as const, label: T.updates },
    { key: "result" as const, label: T.resultsTab },
    { key: "clearance" as const, label: T.clearancesTab },
  ];

  return (
    <SectorLayout>
      <div className="mx-auto max-w-4xl space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        {sectorName && (
          <p className="text-sm font-medium text-slate-500">
            {isRtl ? `قطاع ${sectorName}` : `${sectorName} Sector`}
          </p>
        )}

        {isLoading ? (
          <SectorLoading />
        ) : (
          <>
            <FailedAlert
              items={stats?.recentFailedResults ?? []}
              lang={lang}
              onViewReport={openResult}
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              <KpiCard label={T.failedResults} value={stats?.failedResults ?? 0} tone="red" />
              <KpiCard label={T.readyResults} value={stats?.readyResults ?? 0} tone="green" />
              <KpiCard label={T.underInspection} value={stats?.pendingSamples ?? 0} tone="amber" />
              <KpiCard label={T.totalSamples} value={stats?.totalSamples ?? 0} tone="slate" />
            </div>

            <div className={`${sectorTheme.card} overflow-hidden`}>
              <div className="flex border-b border-slate-100">
                {feedTabs.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFeedTab(key)}
                    className={`flex-1 px-4 py-3.5 text-sm font-semibold transition ${
                      feedTab === key
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {feedItems.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-slate-400">{T.noUpdates}</p>
              ) : (
                feedItems.map((item) => (
                  <ActivityRow key={item.id} item={item} lang={lang} onClick={() => handleActivityClick(item)} />
                ))
              )}

              {items.length > 12 && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <Link href="/sector/inbox" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    {T.viewAll}
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <SectorTestResultDialog
        resultId={selectedResultId}
        open={!!selectedResultId}
        onClose={() => setSelectedResultId(null)}
        lang={lang}
        testTypeLabel={selectedTestLabel}
      />
    </SectorLayout>
  );
}
