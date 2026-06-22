import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { FlaskConical, TestTube2, FileCheck2, LogOut, Bell, Globe, Menu, X, LayoutDashboard, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast, Toaster } from "sonner";
import { useSSESectorNotifications } from "@/hooks/useSSESectorNotifications";

const SectorLangContext = createContext<{
  lang: "ar" | "en";
  setLang: (l: "ar" | "en") => void;
}>({
  lang: "ar",
  setLang: () => {},
});

export function SectorLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<"ar" | "en">(() => {
    return (localStorage.getItem("sector_lang") as "ar" | "en") ?? "ar";
  });

  const setLang = (l: "ar" | "en") => {
    localStorage.setItem("sector_lang", l);
    setLangState(l);
  };

  return (
    <SectorLangContext.Provider value={{ lang, setLang }}>
      {children}
    </SectorLangContext.Provider>
  );
}

export function useSectorLang() {
  return useContext(SectorLangContext);
}

export function useSectorAuth() {
  const token = localStorage.getItem("sector_token");
  const info = localStorage.getItem("sector_info");
  return {
    token,
    sector: info ? JSON.parse(info) : null,
    isAuthenticated: !!token,
  };
}

const t = {
  ar: {
    title: "مختبر الإنشاءات",
    subtitle: "بوابة القطاعات",
    home: "الرئيسية",
    samples: "طلبات الفحص",
    results: "نتائج الاختبارات",
    clearances: "طلبات براءة الذمة",
    failedShort: "راسبة",
    logout: "خروج",
    lang: "English",
  },
  en: {
    title: "Construction Lab",
    subtitle: "Sector Portal",
    home: "Home",
    samples: "Test Requests",
    results: "Test Results",
    clearances: "Clearance Requests",
    failedShort: "Failed",
    logout: "Sign Out",
    lang: "عربي",
  },
};

const SECTOR_TOAST = { position: "bottom-right" as const, duration: 2500 };

export function SectorLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sector } = useSectorAuth();
  const { lang, setLang } = useSectorLang();
  const T = t[lang];
  const isRtl = lang === "ar";

  const prevUnreadRef = useRef<number | null>(null);
  const { data: unreadCount } = trpc.sector.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (unreadCount === undefined) return;
    const total = unreadCount.total ?? 0;
    if (prevUnreadRef.current !== null && total > prevUnreadRef.current) {
      const newCount = total - prevUnreadRef.current;
      toast.success(
        isRtl ? `${newCount} ${newCount === 1 ? "تقرير جديد" : "تقارير جديدة"}` : `${newCount} new ${newCount === 1 ? "report" : "reports"}`,
        {
          ...SECTOR_TOAST,
          description: isRtl ? "وصلت نتائج جديدة لقطاعك" : "New results have arrived for your sector",
        }
      );
    }
    prevUnreadRef.current = total;
  }, [unreadCount?.total, isRtl]);

  const { data: notifCount, refetch: refetchNotifCount } = trpc.sector.getNotificationCount.useQuery(undefined, {
    refetchInterval: 60000,
  });

  useSSESectorNotifications({
    sectorId: sector?.id ?? null,
    onNew: (n) => {
      refetchNotifCount();
      toast(n.title, {
        ...SECTOR_TOAST,
        description: n.message?.length > 80 ? n.message.slice(0, 80) + "…" : n.message,
      });
    },
  });

  const homeUnread = (unreadCount?.total ?? 0) + (notifCount?.unread ?? 0);
  const failedCount = unreadCount?.failedResults ?? 0;

  const navItems: {
    path: string;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
    badgeDanger?: boolean;
  }[] = [
    { path: "/sector/dashboard", label: T.home, icon: LayoutDashboard, badge: homeUnread > 0 ? homeUnread : undefined },
    { path: "/sector/samples", label: T.samples, icon: TestTube2 },
    {
      path: "/sector/results",
      label: T.results,
      icon: FlaskConical,
      badge: failedCount > 0 ? failedCount : unreadCount?.results,
      badgeDanger: failedCount > 0,
    },
    { path: "/sector/clearances", label: T.clearances, icon: FileCheck2, badge: unreadCount?.clearances },
  ];

  const handleLogout = () => {
    localStorage.removeItem("sector_token");
    localStorage.removeItem("sector_info");
    setLocation("/sector/login");
  };

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-slate-50">
      <Toaster position="bottom-right" duration={2500} closeButton richColors />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 shadow-xl shadow-slate-900/30">
        <div className="flex h-24 w-full items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <Link href="/sector/dashboard" className="flex items-center gap-3">
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg p-3">
                <FlaskConical className="h-7 w-7 text-white" />
              </div>
              <div className="hidden sm:block">
                <div className="text-lg font-bold leading-tight text-white">{T.title}</div>
                <div className="text-sm text-blue-300 mt-0.5">{T.subtitle}</div>
              </div>
            </Link>
          </div>

          <nav className="hidden items-stretch gap-0.5 self-stretch lg:flex">
            {navItems.map(({ path, label, icon: Icon, badge, badgeDanger }) => {
              const active = location === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={`relative flex flex-col items-center justify-center gap-2 px-8 text-base font-bold transition-all border-b-4 ${
                    active
                      ? "border-b-blue-400 bg-blue-500/20 text-white"
                      : "border-b-transparent text-slate-300 hover:bg-white/8 hover:text-white hover:border-b-white/30"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="whitespace-nowrap">{label}</span>
                  {badge && badge > 0 ? (
                    <span
                      className={`absolute top-3 end-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${
                        badgeDanger ? "animate-pulse bg-red-600 ring-2 ring-red-300" : "bg-red-500"
                      }`}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <Link
                href="/sector/results?filter=fail"
                className="hidden items-center gap-1.5 rounded-lg border border-red-400 bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-700 sm:flex animate-pulse"
              >
                <AlertTriangle className="h-4 w-4" />
                {failedCount} {T.failedShort}
              </Link>
            )}
            {sector && (
              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="max-w-[200px] truncate text-xs font-medium text-white">
                  {isRtl ? sector.nameAr : sector.nameEn}
                </span>
              </div>
            )}

            {(unreadCount?.total ?? 0) > 0 && (
              <div className="relative hidden sm:block">
                <Bell className="h-5 w-5 text-amber-400" />
                <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount!.total > 9 ? "9+" : unreadCount!.total}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" />
              {T.lang}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{T.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 pt-16 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="h-full w-72 space-y-1 border-e border-white/10 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map(({ path, label, icon: Icon, badge, badgeDanger }) => {
              const active = location === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    active ? "bg-blue-500/20 text-white" : "text-slate-300 hover:bg-white/5"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {badge && badge > 0 ? (
                    <span
                      className={`ms-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white ${
                        badgeDanger ? "animate-pulse bg-red-600 ring-2 ring-red-300" : "bg-red-500"
                      }`}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <main className="w-full px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
