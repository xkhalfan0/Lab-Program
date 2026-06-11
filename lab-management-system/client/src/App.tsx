import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Reception from "./pages/Reception";
import Distribution from "./pages/Distribution";
import Technician from "./pages/Technician";
import BatchOverview from "./pages/BatchOverview";
import BatchReport from "./pages/BatchReport";
import ManagerReview from "./pages/ManagerReview";
import QCReview from "./pages/QCReview";
import Clearance from "./pages/ClearancePage";
import ConcreteTest from "./pages/ConcreteTest";
import ConcreteReport from "./pages/ConcreteReport";
import UserManagement from "./pages/UserManagement";
import AdminDeletionRequests from "./pages/AdminDeletionRequests";
import DeletionLog from "./pages/DeletionLog";
import SampleDetail from "./pages/SampleDetail";
import TestTypesManagement from "./pages/TestTypesManagement";
import TestRouter from "./pages/tests/TestRouter";
import SpecializedTestReport from "./pages/tests/SpecializedTestReport";
import BatchBlockReport from "./pages/tests/BatchBlockReport";
import Notifications from "./pages/Notifications";
import Analytics from "./pages/Analytics";
import SupervisorDashboard from "./pages/SupervisorDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import ChangePassword from "./pages/ChangePassword";
import PrintReceipt from "./pages/PrintReceipt";
import ClearanceArchive from "./pages/ClearanceArchive";
import PrintCertificate from "./pages/PrintCertificate";
import OrderReport from "./pages/OrderReport";
import MonthlyReport from "./pages/MonthlyReport";
import SectorLogin from "./pages/sector/SectorLogin";
import { SectorLangProvider } from "./pages/sector/SectorLayout";
import SectorDashboard from "./pages/sector/SectorDashboard";
import SectorInbox from "./pages/sector/SectorInbox";
import SectorSamples from "./pages/sector/SectorSamples";
import SectorResults from "./pages/sector/SectorResults";
import SectorClearances from "./pages/sector/SectorClearances";
import SectorNotifications from "./pages/sector/SectorNotifications";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

// ─── Role-based redirect map ─────────────────────────────────────────────────
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

// Permission key → page path mapping (ordered by priority)
const PERM_TO_PATH: Array<{ permKey: string; path: string }> = [
  { permKey: "admin_dashboard",    path: "/manager-dashboard" },
  { permKey: "supervisor_dashboard", path: "/supervisor-dashboard" },
  { permKey: "samples",            path: "/reception" },
  { permKey: "distribution",       path: "/distribution" },
  { permKey: "results",            path: "/technician" },
  { permKey: "supervisor",         path: "/manager-review" },
  { permKey: "qc",                 path: "/qc-review" },
  { permKey: "certificates",       path: "/clearance" },
  { permKey: "analytics",          path: "/analytics" },
];

// Resolve the best landing page for a user based on role + custom permissions
function resolveHomePage(user: any): string {
  if (!user) return "/login";
  // Admin always goes to admin dashboard
  if (user.role === "admin") return "/manager-dashboard";
  // Check custom permissions first (user has explicitly granted perms)
  const rawPerms = user?.permissions as Record<string, unknown> | null;
  if (rawPerms && Object.keys(rawPerms).length > 0) {
    for (const { permKey, path } of PERM_TO_PATH) {
      const val = rawPerms[permKey];
      if (val === "view" || val === "edit") return path;
    }
  }
  // Fall back to role default
  return ROLE_HOME[user.role] ?? "/reception";
}

// Pages accessible to specific roles (empty = all authenticated users)
const ROUTE_ROLES: Record<string, string[]> = {
  "/reception": ["admin", "reception", "lab_manager"],
  "/distribution": ["admin", "lab_manager"],
  "/technician": ["admin", "technician", "lab_manager"],
  "/batch/:sampleId/:orderId": ["admin", "technician", "lab_manager"],
  "/batch-report/:sampleId/:orderId": ["admin", "technician", "lab_manager"],
  "/manager-review": ["admin", "sample_manager", "lab_manager"],
  "/qc-review": ["admin", "qc_inspector", "lab_manager"],
  "/clearance": ["admin", "lab_manager", "sample_manager", "accountant"],
  "/manager-dashboard": ["admin", "lab_manager", "supervisor", "sample_manager"],
  "/users": ["admin"],
  "/admin/deletion-requests": ["admin", "lab_manager"],
  "/admin/deletion-log": ["admin", "lab_manager"],
  "/tests-management": ["admin"],
};

// ─── Smart Home Redirect ─────────────────────────────────────────────────
function SmartHomeRedirect() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { setLocation("/login"); return; }
    const dest = resolveHomePage(user);
    setLocation(dest);
  }, [loading, isAuthenticated, user, setLocation]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
  return null;
}

// ─── Sector Portal Guard ────────────────────────────────────────────────────
function SectorGuard({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("sector_token");

  useEffect(() => {
    if (!token) {
      setLocation("/sector/login");
    }
  }, [token, setLocation]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  return <Component />;
}

function SectorPage({ component: Component }: { component: React.ComponentType }) {
  return (
    <SectorLangProvider>
      <SectorGuard component={Component} />
    </SectorLangProvider>
  );
}

function SectorRootRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const token = localStorage.getItem("sector_token");
    setLocation(token ? "/sector/inbox" : "/sector/login");
  }, [setLocation]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

// ─── Protected Route wrapper ─────────────────────────────────────────────────
function ProtectedRoute({ component: Component, path }: { component: React.ComponentType; path: string }) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    // Role-based access control
    const allowedRoles = ROUTE_ROLES[path];
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      // Redirect to role home page
      const home = ROLE_HOME[user.role] ?? "/";
      setLocation(home);
    }
  }, [loading, isAuthenticated, user, path, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const allowedRoles = ROUTE_ROLES[path];
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public route */}
      <Route path="/login" component={Login} />

      {/* Smart home redirect — resolves best landing page per role/permissions */}
      <Route path="/" component={SmartHomeRedirect} />
      <Route path="/reception">
        {() => <ProtectedRoute component={Reception} path="/reception" />}
      </Route>
      <Route path="/distribution">
        {() => <ProtectedRoute component={Distribution} path="/distribution" />}
      </Route>
      <Route path="/technician">
        {() => <ProtectedRoute component={Technician} path="/technician" />}
      </Route>
      <Route path="/batch/:sampleId/:orderId" component={BatchOverview} />
      <Route path="/manager-review">
        {() => <ProtectedRoute component={ManagerReview} path="/manager-review" />}
      </Route>
      <Route path="/qc-review">
        {() => <ProtectedRoute component={QCReview} path="/qc-review" />}
      </Route>
      <Route path="/clearance">
        {() => <ProtectedRoute component={Clearance} path="/clearance" />}
      </Route>
      <Route path="/users">
        {() => <ProtectedRoute component={UserManagement} path="/users" />}
      </Route>
      <Route path="/admin/deletion-requests">
        {() => (
          <ProtectedRoute component={AdminDeletionRequests} path="/admin/deletion-requests" />
        )}
      </Route>
      <Route path="/admin/deletion-log">
        {() => <ProtectedRoute component={DeletionLog} path="/admin/deletion-log" />}
      </Route>
      <Route path="/tests-management">
        {() => <ProtectedRoute component={TestTypesManagement} path="/tests-management" />}
      </Route>
      <Route path="/samples/:id">
        {(params) => <ProtectedRoute component={() => <SampleDetail />} path="/samples/:id" />}
      </Route>
      <Route path="/sample/:id">
        {(params) => <ProtectedRoute component={() => <SampleDetail />} path="/sample/:id" />}
      </Route>
      <Route path="/concrete-test/:distributionId">
        {() => <ProtectedRoute component={ConcreteTest} path="/concrete-test/:distributionId" />}
      </Route>
      <Route path="/concrete-report/:distributionId" component={ConcreteReport} />
      <Route path="/test/:distributionId">
        {() => <ProtectedRoute component={TestRouter} path="/test/:distributionId" />}
      </Route>
      <Route path="/test-report/:distributionId" component={SpecializedTestReport} />
      <Route path="/batch-report/:sampleId/:orderId" component={BatchReport} />
      <Route path="/batch-report/:batchId" component={BatchBlockReport} />
      <Route path="/order-report/:orderId">
        {() => <ProtectedRoute component={OrderReport} path="/order-report/:orderId" />}
      </Route>
      <Route path="/order/:id">
        {() => <ProtectedRoute component={OrderReport} path="/order/:id" />}
      </Route>

      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} path="/notifications" />}
      </Route>

      <Route path="/analytics">
        {() => <ProtectedRoute component={Analytics} path="/analytics" />}
      </Route>

      <Route path="/monthly-report">
        {() => <ProtectedRoute component={MonthlyReport} path="/monthly-report" />}
      </Route>


      <Route path="/supervisor-dashboard">
        {() => <ProtectedRoute component={SupervisorDashboard} path="/supervisor-dashboard" />}
      </Route>

      <Route path="/manager-dashboard">
        {() => <ProtectedRoute component={ManagerDashboard} path="/manager-dashboard" />}
      </Route>

      <Route path="/change-password">
        {() => <ProtectedRoute component={ChangePassword} path="/change-password" />}
      </Route>

      <Route path="/clearance-archive">
        {() => <ProtectedRoute component={ClearanceArchive} path="/clearance-archive" />}
      </Route>

      {/* Print pages — opened in new tab, session cookie is shared */}
      <Route path="/print-receipt/:id" component={PrintReceipt} />
      <Route path="/print-certificate/:id" component={PrintCertificate} />

      {/* /admin redirect → home dashboard */}
      <Route path="/admin">
        {() => <ProtectedRoute component={Home} path="/" />}
      </Route>

      {/* Sector Portal — separate from lab staff (flat routes for reliable matching) */}
      <Route path="/sector/login" component={SectorLogin} />
      <Route path="/sector" component={SectorRootRedirect} />
      <Route path="/sector/inbox">{() => <SectorPage component={SectorInbox} />}</Route>
      <Route path="/sector/dashboard">{() => <SectorPage component={SectorDashboard} />}</Route>
      <Route path="/sector/samples">{() => <SectorPage component={SectorSamples} />}</Route>
      <Route path="/sector/results">{() => <SectorPage component={SectorResults} />}</Route>
      <Route path="/sector/clearances">{() => <SectorPage component={SectorClearances} />}</Route>
      <Route path="/sector/notifications">{() => <SectorPage component={SectorNotifications} />}</Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
