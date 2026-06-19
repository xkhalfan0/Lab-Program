import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SectorLayout, useSectorLang, useSectorAuth } from "./SectorLayout";
import { Bell, CheckCheck, FlaskConical, FileText, ClipboardCheck, ShieldCheck, Package, Clock, Filter } from "lucide-react";
import { toast } from "sonner";
import { useSSESectorNotifications } from "@/hooks/useSSESectorNotifications";

// ─── Type → icon mapping ──────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, { icon: React.ReactNode; labelAr: string; labelEn: string }> = {
  sample_received:   { icon: <Package size={16} />,       labelAr: "استلام عينة",      labelEn: "Sample Received" },
  result_issued:     { icon: <FileText size={16} />,      labelAr: "نتيجة اختبار",     labelEn: "Test Result" },
  clearance_started: { icon: <ClipboardCheck size={16} />, labelAr: "بدء براءة الذمة", labelEn: "Clearance Started" },
  clearance_issued:  { icon: <ShieldCheck size={16} />,   labelAr: "صدور براءة الذمة", labelEn: "Clearance Issued" },
};

function getTypeInfo(type?: string | null) {
  if (type && TYPE_ICONS[type]) return TYPE_ICONS[type];
  return { icon: <Bell size={16} />, labelAr: "إشعار", labelEn: "Notification" };
}

// ─── Color system ─────────────────────────────────────────────────────────────
// 🔵 Blue  = new / unread
// 🟠 Orange = opened but no action yet
// ⚫ Gray  = informational / done
function getRowStyle(n: { isRead?: boolean | null; notificationType?: string | null }) {
  if (!n.isRead) return { borderLeft: "4px solid #3b82f6", background: "rgba(59,130,246,0.06)" };
  return { borderLeft: "4px solid #fb923c", background: "rgba(251,146,60,0.04)" };
}

function getDotColor(n: { isRead?: boolean | null }) {
  if (!n.isRead) return "#3b82f6";
  return "#fb923c";
}

function timeAgo(date: Date | string | null | undefined, isRtl: boolean): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isRtl ? "الآن" : "Just now";
  if (mins < 60) return isRtl ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isRtl ? `منذ ${hrs} ساعة` : `${hrs}h ago`;
  return isRtl ? `منذ ${Math.floor(hrs / 24)} يوم` : `${Math.floor(hrs / 24)}d ago`;
}

const FILTER_OPTIONS = [
  { key: "all",    labelAr: "الكل",    labelEn: "All" },
  { key: "unread", labelAr: "جديد",    labelEn: "New" },
  { key: "read",   labelAr: "مفتوح",   labelEn: "Opened" },
];

export default function SectorNotifications() {
  const { lang } = useSectorLang();
  const { sector } = useSectorAuth();
  const isRtl = lang === "ar";
  const [filter, setFilter] = useState("all");

  const { data: notifs = [], refetch } = trpc.sector.getNotifications.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const markRead    = trpc.sector.markNotificationRead.useMutation({ onSuccess: () => refetch() });
  const markAllRead = trpc.sector.markAllNotificationsRead.useMutation({
    onSuccess: () => {
      toast.success(isRtl ? "تم تحديد الكل كمقروء" : "All marked as read");
      refetch();
    },
  });

  // Real-time SSE
  useSSESectorNotifications({
    sectorId: sector?.id ?? null,
    onNew: () => refetch(),
  });

  const unreadCount = notifs.filter((n: any) => !n.isRead).length;

  const filtered = notifs.filter((n: any) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "read")   return n.isRead;
    return true;
  });

  return (
    <SectorLayout>
      <div dir={isRtl ? "rtl" : "ltr"} className="w-full space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5" style={{ color: "#f59e0b" }} />
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#1e293b" }}>
                {isRtl ? "التنبيهات" : "Notifications"}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                {unreadCount > 0
                  ? isRtl ? `${unreadCount} تنبيه جديد` : `${unreadCount} new`
                  : isRtl ? "جميع التنبيهات مقروءة" : "All caught up"}
              </p>
            </div>
            {unreadCount > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-white text-xs font-bold flex items-center justify-center"
                style={{ background: "#3b82f6" }}>
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", color: "#3b82f6" }}>
              <CheckCheck className="w-4 h-4" />
              {isRtl ? "تحديد الكل كمقروء" : "Mark all as read"}
            </button>
          )}
        </div>

        {/* Color legend */}
        <div className="rounded-xl px-4 py-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#64748b" }}>
            <Filter size={12} />
            {isRtl ? "دليل الألوان" : "Color Guide"}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#3b82f6" }} />
              <span className="text-xs" style={{ color: "#475569" }}>
                {isRtl ? "جديد — لم يُفتح بعد" : "New — not yet opened"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#fb923c" }} />
              <span className="text-xs" style={{ color: "#475569" }}>
                {isRtl ? "مفتوح — بانتظار اتخاذ إجراء" : "Opened — awaiting action"}
              </span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={
                filter === opt.key
                  ? { background: "#1d4ed8", color: "#fff", border: "1px solid #1d4ed8" }
                  : { background: "#fff", color: "#64748b", border: "1px solid #e2e8f0" }
              }>
              {isRtl ? opt.labelAr : opt.labelEn}
              {opt.key === "unread" && unreadCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px]"
                  style={{ background: "#3b82f6" }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#fff" }}>
          {filtered.length === 0 ? (
            <div className="p-14 text-center">
              <Bell className="w-12 h-12 mx-auto mb-3" style={{ color: "#cbd5e1" }} />
              <p className="text-sm" style={{ color: "#94a3b8" }}>
                {isRtl ? "لا توجد تنبيهات" : "No notifications"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((n: any) => {
                const typeInfo = getTypeInfo(n.notificationType);
                const rowStyle = getRowStyle(n);
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-5 py-4 cursor-pointer transition-all hover:brightness-95"
                    style={rowStyle}
                    onClick={() => { if (!n.isRead) markRead.mutate({ notificationId: n.id }); }}
                  >
                    {/* Dot */}
                    <div className="mt-1.5 flex-shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full block"
                        style={{ background: getDotColor(n), boxShadow: !n.isRead ? `0 0 6px ${getDotColor(n)}` : "none" }} />
                    </div>

                    {/* Icon */}
                    <div className="mt-0.5 flex-shrink-0" style={{ color: !n.isRead ? "#3b82f6" : "#fb923c" }}>
                      {typeInfo.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className={`text-sm ${!n.isRead ? "font-semibold" : "font-normal"}`} style={{ color: "#1e293b" }}>
                          {n.title}
                        </p>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: !n.isRead ? "rgba(59,130,246,0.1)" : "rgba(251,146,60,0.1)",
                            color: !n.isRead ? "#3b82f6" : "#fb923c",
                            border: `1px solid ${!n.isRead ? "rgba(59,130,246,0.2)" : "rgba(251,146,60,0.2)"}`,
                          }}>
                          {isRtl ? (n.isRead ? "مفتوح" : "جديد") : (n.isRead ? "Opened" : "New")}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f1f5f9", color: "#64748b" }}>
                          {isRtl ? typeInfo.labelAr : typeInfo.labelEn}
                        </span>
                      </div>
                      {n.message && (
                        <p className="text-xs line-clamp-2" style={{ color: "#64748b" }}>{n.message}</p>
                      )}
                      <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "#94a3b8" }}>
                        <Clock size={9} />
                        {timeAgo(n.createdAt, isRtl)}
                      </p>
                    </div>

                    {/* Mark read button */}
                    {!n.isRead && (
                      <button
                        className="shrink-0 text-xs px-2 py-1 rounded-lg transition-all"
                        style={{ color: "#64748b", border: "1px solid #e2e8f0", background: "#fff" }}
                        onClick={(e) => { e.stopPropagation(); markRead.mutate({ notificationId: n.id }); }}>
                        {isRtl ? "تحديد كمقروء" : "Mark read"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SectorLayout>
  );
}
