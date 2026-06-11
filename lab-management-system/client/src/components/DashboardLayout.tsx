import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, LogOut, PanelLeft, PanelRight,
  FlaskConical, ClipboardList, Microscope,
  CheckSquare, ShieldCheck, Award, Users, Bell, Languages, TrendingUp, Home, Target, Eye, KeyRound, Archive,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import NotificationBell from "@/components/NotificationBell";

type AllowedRole =
  | "admin"
  | "lab_manager"
  | "supervisor"
  | "sample_manager"
  | "reception"
  | "technician"
  | "qc_inspector"
  | "accountant";

// Each item has: required permission key + minimum level needed ("view" or "edit")
const ALL_MENU_ITEMS = [
  { icon: Target, labelKey: "nav.managerDashboard", path: "/manager-dashboard", permKey: "admin_dashboard", minLevel: "view", allowedRoles: ["admin", "lab_manager", "supervisor", "sample_manager"] as AllowedRole[] },
  { icon: Eye, labelKey: "nav.supervisorDashboard", path: "/supervisor-dashboard", permKey: "supervisor_dashboard", minLevel: "view", allowedRoles: ["admin", "lab_manager", "supervisor", "sample_manager"] as AllowedRole[] },
  { icon: FlaskConical, labelKey: "nav.reception", path: "/reception", permKey: "samples", minLevel: "view", allowedRoles: ["admin", "lab_manager", "reception"] as AllowedRole[] },
  { icon: ClipboardList, labelKey: "nav.distribution", path: "/distribution", permKey: "distribution", minLevel: "view", allowedRoles: ["admin", "lab_manager", "supervisor", "sample_manager"] as AllowedRole[] },
  { icon: Microscope, labelKey: "nav.assignments", path: "/technician", permKey: "results", minLevel: "view", allowedRoles: ["admin", "technician"] as AllowedRole[] },
  { icon: CheckSquare, labelKey: "nav.managerReview", path: "/manager-review", permKey: "supervisor", minLevel: "view", allowedRoles: ["admin", "lab_manager", "supervisor", "sample_manager", "qc_inspector"] as AllowedRole[] },
  { icon: ShieldCheck, labelKey: "nav.qcReview", path: "/qc-review", permKey: "qc", minLevel: "view", allowedRoles: ["admin", "lab_manager", "qc_inspector"] as AllowedRole[] },
  { icon: Award, labelKey: "nav.clearance", path: "/clearance", permKey: "certificates", minLevel: "view", allowedRoles: ["admin", "lab_manager", "accountant", "qc_inspector"] as AllowedRole[] },
  { icon: Archive, labelKey: "nav.clearanceArchive", path: "/clearance-archive", permKey: "cert_archive", minLevel: "view", allowedRoles: ["admin", "lab_manager", "accountant"] as AllowedRole[] },
  { icon: Users, labelKey: "nav.users", path: "/users", permKey: "users", minLevel: "view", allowedRoles: ["admin"] as AllowedRole[] },
  { icon: ShieldCheck, labelKey: "nav.deletionRequests", path: "/admin/deletion-requests", permKey: "deletion_requests", minLevel: "view", allowedRoles: ["admin", "lab_manager"] as AllowedRole[] },
  { icon: FlaskConical, labelKey: "nav.tests", path: "/tests-management", permKey: "settings", minLevel: "view", allowedRoles: ["admin", "lab_manager"] as AllowedRole[] },
  { icon: TrendingUp, labelKey: "nav.analytics", path: "/analytics", permKey: "analytics", minLevel: "view", allowedRoles: ["admin", "lab_manager", "supervisor", "sample_manager"] as AllowedRole[] },
  { icon: TrendingUp, labelKey: "nav.monthlyReport", path: "/monthly-report", permKey: "monthly_report", minLevel: "view", allowedRoles: ["admin", "lab_manager"] as AllowedRole[] },
];

type PermLevel = "view" | "edit" | false;
type PermMap = Record<string, PermLevel>;

// Role-based home page per role
const ROLE_HOME: Record<string, string> = {
  admin: "/manager-dashboard",
  reception: "/reception",
  lab_manager: "/distribution",
  technician: "/technician",
  sample_manager: "/manager-review",
  qc_inspector: "/qc-review",
  accountant: "/clearance",
  user: "/manager-dashboard",
};

// Role-based default permissions — each role sees ONLY the pages needed for their job.
// Admin can grant additional access per user from User Management.
const ROLE_DEFAULT_PERMS: Record<string, PermMap> = {
  // Admin: full access to everything
  admin: {
    admin_dashboard: "edit", supervisor_dashboard: "edit",
    manager_dashboard: "edit", samples: "edit", distribution: "edit", results: "edit",
    supervisor: "edit", qc: "edit", certificates: "edit", cert_archive: "edit",
    users: "edit", settings: "edit", analytics: "edit", monthly_report: "edit", deletion_requests: "edit",
  },
  // Reception: only Sample Reception page
  reception: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: "edit", distribution: false, results: false,
    supervisor: false, qc: false, certificates: false,
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
  // Lab Manager: Distribution + Supervisor Review + Analytics
  lab_manager: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: "edit", results: false,
    supervisor: "edit", qc: false, certificates: false,
    users: false, settings: false, analytics: "view", monthly_report: "view", deletion_requests: "view",
  },
  // Technician: only My Assignments
  technician: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: false, results: "edit",
    supervisor: false, qc: false, certificates: false,
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
  // Sample Manager / Supervisor: only Supervisor Review
  sample_manager: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: false, results: false,
    supervisor: "edit", qc: false, certificates: false,
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
  // QC Inspector: only QC Review
  qc_inspector: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: false, results: false,
    supervisor: false, qc: "edit", certificates: false,
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
  // Accountant: Clearance + Archive
  accountant: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: false, results: false,
    supervisor: false, qc: false, certificates: "edit", cert_archive: "view",
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
  user: {
    admin_dashboard: false, supervisor_dashboard: false,
    manager_dashboard: false, samples: false, distribution: false, results: false,
    supervisor: false, qc: false, certificates: false,
    users: false, settings: false, analytics: false, deletion_requests: false,
  },
};

function hasPermission(user: any, permKey: string | null, minLevel: string | null): boolean {
  // If no permKey defined, always show (shouldn't happen with new config)
  if (!permKey || !minLevel) return true;

  const role = user?.role ?? "user";
  // Admin always has full access
  if (role === "admin") return true;

  const rawPerms = user?.permissions as Record<string, unknown> | null;

  // If user has custom permissions stored in DB, use them
  if (rawPerms && Object.keys(rawPerms).length > 0) {
    // New format: { dashboard: "view", samples: "edit", ... }
    const newFmt = rawPerms[permKey];
    if (newFmt !== undefined) {
      if (!newFmt) return false;
      if (minLevel === "view") return newFmt === "view" || newFmt === "edit";
      if (minLevel === "edit") return newFmt === "edit";
      return false;
    }
    // Old dot-notation format: { "samples.view": true }
    if (minLevel === "view") {
      return rawPerms[`${permKey}.view`] === true || rawPerms[`${permKey}.edit`] === true ||
             rawPerms[`${permKey}.create`] === true;
    }
    if (minLevel === "edit") {
      return rawPerms[`${permKey}.edit`] === true || rawPerms[`${permKey}.create`] === true;
    }
    return false;
  }

  // No custom permissions → use role defaults
  const perms: PermMap = ROLE_DEFAULT_PERMS[role] ?? {};
  const level = perms[permKey];
  if (!level) return false;
  if (minLevel === "view") return level === "view" || level === "edit";
  if (minLevel === "edit") return level === "edit";
  return false;
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const { lang, dir } = useLanguage();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-center">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground text-center">Access to this dashboard requires authentication.</p>
          <Button onClick={() => { window.location.href = "/login"; }} size="lg" className="w-full">Sign in</Button>
        </div>
      </div>
    );
  }

  // Key changes when lang changes to force SidebarProvider to remount with correct side
  return (
    <SidebarProvider
      key={lang}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth} sidebarSide={dir === "rtl" ? "right" : "left"}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type Props = {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
  sidebarSide: "left" | "right";
};

function DashboardLayoutContent({ children, setSidebarWidth, sidebarSide }: Props) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { lang, setLang, t, dir } = useLanguage();

  const currentRole = ((user?.role ?? "user") === "sample_manager" ? "supervisor" : (user?.role ?? "user")) as AllowedRole | "user";
  const menuItems = ALL_MENU_ITEMS.filter((item) => {
    const isAllowedByRole = currentRole === "admin" || item.allowedRoles.includes(currentRole as AllowedRole);
    if (!isAllowedByRole) return false;
    return hasPermission(user, item.permKey, item.minLevel);
  });
  const activeMenuItem = menuItems.find(item => item.path === location);
  // const { data: notifs } = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000 });
  const unreadCount = 0;
  const safeText = (value: unknown): string =>
    value == null ? "" : (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      ? String(value)
      : String(value);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const rect = sidebarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newWidth = sidebarSide === "left"
        ? e.clientX - rect.left
        : rect.right - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth, sidebarSide]);

  const PanelIcon = sidebarSide === "right" ? PanelRight : PanelLeft;

  return (
    <div className="flex min-h-svh w-full" dir={dir}>
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side={sidebarSide}
          collapsible="icon"
          className="border-0"
          disableTransition={isResizing}
        >
          {/* Header */}
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelIcon className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <span className="font-semibold tracking-tight truncate text-sm">
                  {safeText(t("app.title"))}
                </span>
              )}
            </div>
          </SidebarHeader>

          {/* Nav items */}
          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                      <span className="truncate">{safeText(t(item.labelKey))}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Notification banner - DISABLED for diagnostic */}

          {/* Footer / user */}
          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {safeText(user?.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden text-start">
                    <p className="text-sm font-medium truncate leading-none">{safeText(user?.name) || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {safeText((typeof (user as any)?.role === "string" ? (user as any).role.replace(/_/g, " ") : null) ?? user?.email ?? "—")}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={sidebarSide === "right" ? "start" : "end"} className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/change-password")}
                  className="cursor-pointer"
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span>{lang === "ar" ? "تغيير كلمة المرور" : "Change Password"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try { await fetch("/api/auth/local/logout", { method: "POST", credentials: "include" }); } catch {}
                    window.location.href = "/login";
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>{t("nav.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={[
            "absolute top-0 h-full w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-50",
            isCollapsed ? "hidden" : "",
            sidebarSide === "right" ? "left-0" : "right-0",
          ].join(" ")}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
        />
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <SidebarInset className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex border-b h-12 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <span className="text-sm font-medium text-muted-foreground">
              {activeMenuItem ? safeText(t(activeMenuItem.labelKey)) : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Home button — always show for non-admin when not on their home page */}
            {(() => {
              const roleHome = ROLE_HOME[user?.role ?? "user"] ?? "/";
              const isHome = location === roleHome;
              // Always show for non-admin roles (even on dashboard), hide only when already on their home
              if (isHome) return null;
              return (
                <button
                  onClick={() => setLocation(roleHome)}
                  title={lang === "ar" ? "الصفحة الرئيسية" : "Go to my home page"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-sm font-medium"
                >
                  <Home className="w-4 h-4 text-primary" />
                  {!isMobile && <span className="text-primary">{lang === "ar" ? "الرئيسية" : "Home"}</span>}
                </button>
              );
            })()}

            {/* Notification Bell - DISABLED for diagnostic */}
            {/* <NotificationBell isAr={lang === "ar"} /> */}

            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors text-sm font-semibold"
            >
              <Languages className="w-4 h-4 text-primary" />
              <span className="text-primary">{lang === "en" ? "العربية" : "English"}</span>
            </button>
          </div>
        </div>

        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </div>
  );
}
