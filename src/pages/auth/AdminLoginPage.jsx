import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services.js";
import logo from "../../logo.svg";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter both email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const snapshot = await authService.login({ email: email.trim(), password });
      if (!snapshot.role || snapshot.role === "citizen") {
        setError("This portal is for municipal staff only.");
        setLoading(false);
        return;
      }
      if (snapshot.role === "cleanup_worker") {
        setError("This is the admin console. Workers sign in from the main app.");
        setLoading(false);
        return;
      }
      navigate("/admin/dashboard");
    } catch (err) {
      setError(authService.getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden" style={{ background: "#080d16", fontFamily: "Manrope" }}>
      <style>{`
        @keyframes adminFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gridDrift { from { background-position: 0 0; } to { background-position: 56px 56px; } }
        @keyframes shakeX { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-4px); } 40%,80% { transform: translateX(4px); } }
        .admin-grid {
          background-image:
            linear-gradient(rgba(76,141,255,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(76,141,255,0.055) 1px, transparent 1px);
          background-size: 56px 56px;
          animation: gridDrift 12s linear infinite;
        }
        .admin-card { animation: adminFadeUp 0.5s ease-out both; }
        .admin-error { animation: adminFadeUp 0.25s ease-out both, shakeX 0.4s ease-in-out; }
        input:-webkit-autofill { -webkit-text-fill-color: #e8ecf1; transition: background-color 9999s ease-in-out 0s; }
      `}</style>

      {/* Ambient layers */}
      <div className="absolute inset-0 admin-grid pointer-events-none" />
      <div className="absolute w-[420px] h-[420px] rounded-full opacity-25 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(76,141,255,0.35), transparent 65%)", top: "-140px", right: "-120px", filter: "blur(70px)" }} />
      <div className="absolute w-[380px] h-[380px] rounded-full opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(52,199,123,0.3), transparent 65%)", bottom: "-130px", left: "-110px", filter: "blur(70px)" }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 relative" style={{ background: "linear-gradient(135deg, rgba(76,141,255,0.18), rgba(52,199,123,0.15))", border: "1px solid rgba(76,141,255,0.35)", boxShadow: "0 8px 32px rgba(76,141,255,0.15)" }}>
            <img src={logo} alt="SwachhLens" className="w-9 h-9 object-contain" />
            <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "#101828", border: "1px solid rgba(76,141,255,0.4)" }}>
              <span className="material-symbols-outlined text-[13px]" style={{ color: "#4C8DFF" }}>shield_lock</span>
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">SwachhLens Command</h1>
          <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(76,141,255,0.08)", border: "1px solid rgba(76,141,255,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34C77B" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#8791A3" }}>MUNICIPAL ADMIN CONSOLE</span>
          </div>
        </div>

        {/* Card */}
        <div className="admin-card rounded-2xl p-6" style={{ background: "rgba(17,24,39,0.82)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(76,141,255,0.16)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
          {error && (
            <div className="admin-error mb-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(229,72,77,0.1)", border: "1px solid rgba(229,72,77,0.35)" }}>
              <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0" style={{ color: "#E5484D" }}>error</span>
              <span className="text-[13px] font-semibold leading-snug" style={{ color: "#F1A6A8" }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block mb-1.5" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#8791A3" }}>OFFICIAL EMAIL</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px]" style={{ color: "#566179" }}>mail</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@swachhlens.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl text-[14px] font-semibold focus:outline-none focus:border-transparent transition-all"
                  style={{ background: "rgba(8,13,22,0.75)", border: "1px solid rgba(76,141,255,0.18)", color: "#E8ECF1" }}
                  onFocus={(e) => (e.target.style.borderColor = "#4C8DFF")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(76,141,255,0.18)")}
                />
              </div>
            </div>

            <div>
              <label className="block mb-1.5" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#8791A3" }}>PASSWORD</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px]" style={{ color: "#566179" }}>key</span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 rounded-xl text-[14px] font-semibold focus:outline-none transition-all"
                  style={{ background: "rgba(8,13,22,0.75)", border: "1px solid rgba(76,141,255,0.18)", color: "#E8ECF1" }}
                  onFocus={(e) => (e.target.style.borderColor = "#4C8DFF")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(76,141,255,0.18)")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center" style={{ color: "#566179" }}>
                  <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-1 rounded-xl font-extrabold text-[15px] text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #006b2c, #00a843)", boxShadow: "0 8px 24px -6px rgba(0,168,67,0.45)" }}
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[19px]" style={{ fontVariationSettings: "'FILL' 1" }}>admin_panel_settings</span>
                  Access Console
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 flex items-center justify-center gap-1.5" style={{ fontSize: 11, fontWeight: 600, color: "#566179" }}>
          <span className="material-symbols-outlined text-[13px]">lock</span>
          Restricted access · authorised municipal staff only
        </p>
      </div>
    </div>
  );
}
