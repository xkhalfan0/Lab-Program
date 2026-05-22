import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, FlaskConical, Shield, Eye, EyeOff } from "lucide-react";

const t = {
  ar: {
    title: "مختبر الإنشاءات والمواد الهندسية",
    subtitle: "بوابة القطاعات",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    login: "دخول",
    logging: "جارٍ الدخول...",
    error: "اسم المستخدم أو كلمة المرور غير صحيحة",
    restricted: "هذه البوابة مخصصة للقطاعات المعتمدة فقط",
    lang: "English",
  },
  en: {
    title: "Construction Materials & Engineering Laboratory",
    subtitle: "Sector Portal",
    username: "Username",
    password: "Password",
    login: "Sign In",
    logging: "Signing in...",
    error: "Invalid username or password",
    restricted: "This portal is restricted to authorized sectors only",
    lang: "عربي",
  },
};

export default function SectorLogin() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const loginMutation = trpc.sector.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("sector_token", data.token);
      localStorage.setItem("sector_info", JSON.stringify(data.sector));
      setLocation("/sector/inbox");
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (msg.includes("sector_accounts") || msg.includes("Failed query")) {
        setError(
          lang === "ar"
            ? "بوابة القطاع غير مهيأة في قاعدة البيانات. شغّل: pnpm db:seed:sectors"
            : "Sector portal database is not set up. Run: pnpm db:seed:sectors",
        );
      } else if (msg.includes("JWT_SECRET")) {
        setError(
          lang === "ar"
            ? "إعدادات الخادم ناقصة (JWT_SECRET)"
            : "Server misconfigured (JWT_SECRET missing)",
        );
      } else {
        setError(t[lang].error);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) return;
    loginMutation.mutate({ username, password });
  };

  const T = t[lang];
  const isRtl = lang === "ar";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen flex"
      style={{
        background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b2a 40%, #1a2744 100%)",
      }}
    >
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        {/* Geometric background pattern */}
        <div className="absolute inset-0">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(99,179,237,0.06)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        {/* Glowing orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }} />

        {/* Content */}
        <div className="relative z-10 text-center px-12">
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #0891b2)", boxShadow: "0 0 40px rgba(59,130,246,0.3)" }}>
              <FlaskConical className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
            {isRtl ? "مختبر الإنشاءات" : "Construction Lab"}
          </h1>
          <h2 className="text-xl font-medium mb-6" style={{ color: "#60a5fa" }}>
            {isRtl ? "والمواد الهندسية" : "& Engineering Materials"}
          </h2>
          <div className="w-16 h-0.5 mx-auto mb-6" style={{ background: "linear-gradient(90deg, transparent, #3b82f6, transparent)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.8)" }}>
            {isRtl
              ? "منصة متكاملة لإدارة نتائج الفحوصات وشهادات الاعتماد للقطاعات الهندسية"
              : "Integrated platform for managing test results and accreditation certificates for engineering sectors"}
          </p>

          {/* Stats */}
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { num: "32", label: isRtl ? "نوع فحص" : "Test Types" },
              { num: "5", label: isRtl ? "قطاعات" : "Sectors" },
              { num: "100%", label: isRtl ? "أمان" : "Secure" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-2xl font-bold" style={{ color: "#60a5fa" }}>{s.num}</div>
                <div className="text-xs mt-1" style={{ color: "rgba(148,163,184,0.7)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Language toggle */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="text-sm px-4 py-1.5 rounded-full transition-all"
              style={{
                color: "#94a3b8",
                border: "1px solid rgba(148,163,184,0.2)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              {T.lang}
            </button>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-8"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            }}>

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center justify-center mb-6">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #0891b2)" }}>
                <FlaskConical className="w-7 h-7 text-white" />
              </div>
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Shield className="w-4 h-4" style={{ color: "#60a5fa" }} />
                <span className="text-xs font-medium tracking-widest uppercase" style={{ color: "#60a5fa" }}>
                  {T.subtitle}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white">{T.title}</h2>
              <p className="text-xs mt-2" style={{ color: "rgba(148,163,184,0.6)" }}>{T.restricted}</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#94a3b8" }}>
                  {T.username}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: "15px",
                  }}
                  onFocus={(e) => {
                    e.target.style.border = "1px solid rgba(59,130,246,0.6)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.border = "1px solid rgba(255,255,255,0.1)";
                    e.target.style.boxShadow = "none";
                  }}
                  placeholder={isRtl ? "sector1" : "sector1"}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#94a3b8" }}>
                  {T.password}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: "15px",
                      paddingInlineEnd: "48px",
                    }}
                    onFocus={(e) => {
                      e.target.style.border = "1px solid rgba(59,130,246,0.6)";
                      e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.border = "1px solid rgba(255,255,255,0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 flex items-center px-3 transition-colors"
                    style={{
                      [isRtl ? "left" : "right"]: 0,
                      color: "rgba(148,163,184,0.6)",
                    }}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg px-4 py-3 text-sm text-center"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loginMutation.isPending || !username || !password}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 mt-2"
                style={{
                  background: loginMutation.isPending || !username || !password
                    ? "rgba(59,130,246,0.3)"
                    : "linear-gradient(135deg, #1d4ed8, #0891b2)",
                  boxShadow: loginMutation.isPending || !username || !password
                    ? "none"
                    : "0 4px 20px rgba(59,130,246,0.4)",
                  cursor: loginMutation.isPending || !username || !password ? "not-allowed" : "pointer",
                }}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {T.logging}
                  </>
                ) : T.login}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-xs" style={{ color: "rgba(100,116,139,0.6)" }}>
                {isRtl ? "© 2026 مختبر الإنشاءات والمواد الهندسية" : "© 2026 Construction Materials & Engineering Laboratory"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
