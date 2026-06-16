import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlaskConical, Loader2, Eye, EyeOff, AlertCircle, CheckCircle2, Settings } from "lucide-react";
import { effectiveUserRole } from "@/lib/labTypes";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Setup Admin state
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  // Role-based redirect map
  const ROLE_HOME: Record<string, string> = {
    admin: "/manager-dashboard",
    reception: "/reception",
    lab_manager: "/distribution",
    technician: "/technician",
    qc_inspector: "/qc-review",
    accountant: "/clearance",
    user: "/manager-dashboard",
  };

  // Check if admin exists on mount
  useEffect(() => {
    fetch("/api/auth/local/has-admin", { credentials: "include" })
      .then(r => r.json())
      .then(d => setHasAdmin(d.hasAdmin ?? true))
      .catch(() => setHasAdmin(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed. Please try again.");
        return;
      }
      const role = data.user?.role ?? "user";
      const home = ROLE_HOME[effectiveUserRole(role)] ?? "/";
      window.location.href = home;
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!setupUsername.trim() || !setupPassword) {
      setError("Username and password are required.");
      return;
    }
    if (setupPassword !== setupConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (setupPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/local/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: setupName.trim() || "Admin",
          username: setupUsername.trim().toLowerCase(),
          password: setupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
        return;
      }
      setSuccess("Admin account created successfully! You can now sign in.");
      setHasAdmin(true);
      setShowSetup(false);
      setUsername(setupUsername.trim().toLowerCase());
      setPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <FlaskConical className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Construction Materials Lab</h1>
          <p className="text-sm text-slate-500 mt-1">Laboratory Management System</p>
        </div>

        {/* Setup Admin Card */}
        {showSetup ? (
          <Card className="shadow-xl border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 justify-center">
                <Settings className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg text-center">Initial Setup</CardTitle>
              </div>
              <CardDescription className="text-center text-xs">
                Create the first administrator account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetupAdmin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-name" className="text-sm font-medium">Full Name</Label>
                  <Input
                    id="setup-name"
                    type="text"
                    placeholder="e.g. Lab Administrator"
                    value={setupName}
                    onChange={e => setSetupName(e.target.value)}
                    disabled={setupLoading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-username" className="text-sm font-medium">Username <span className="text-red-500">*</span></Label>
                  <Input
                    id="setup-username"
                    type="text"
                    placeholder="e.g. admin"
                    value={setupUsername}
                    onChange={e => setSetupUsername(e.target.value)}
                    autoFocus
                    disabled={setupLoading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-password" className="text-sm font-medium">Password <span className="text-red-500">*</span></Label>
                  <Input
                    id="setup-password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={setupPassword}
                    onChange={e => setSetupPassword(e.target.value)}
                    disabled={setupLoading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-confirm" className="text-sm font-medium">Confirm Password <span className="text-red-500">*</span></Label>
                  <Input
                    id="setup-confirm"
                    type="password"
                    placeholder="Re-enter password"
                    value={setupConfirm}
                    onChange={e => setSetupConfirm(e.target.value)}
                    disabled={setupLoading}
                    className="h-10"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={() => { setShowSetup(false); setError(null); }}
                    disabled={setupLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-10 bg-blue-600 hover:bg-blue-700"
                    disabled={setupLoading}
                  >
                    {setupLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
                    ) : (
                      "Create Admin"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xl border-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-center">Sign In</CardTitle>
              <CardDescription className="text-center text-xs">
                Enter your credentials to access the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={loading}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{success}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
                  ) : (
                    "Sign In"
                  )}
                </Button>

                {/* Show Setup button only if no admin exists */}
                {hasAdmin === false && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 text-center mb-2">
                      No admin account found. Set up the system first.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-9 text-sm border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => { setShowSetup(true); setError(null); setSuccess(null); }}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Initial System Setup
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Internal network access only · Contact admin for account issues
        </p>
      </div>
    </div>
  );
}
