import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { authService, popSessionExpired } from "../../services.js";
import logo from "../../logo.svg";

function BrandPanel() {
  return (
    <>
      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -40px) scale(1.1); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, 30px) scale(1.05); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15px, 20px) scale(0.95); }
        }
        @keyframes float4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-25px, -20px) scale(1.08); }
        }
        @keyframes iconGlow {
          0%, 100% { filter: drop-shadow(0 0 20px rgba(98,223,125,0.4)); }
          50% { filter: drop-shadow(0 0 40px rgba(98,223,125,0.7)); }
        }
        @keyframes shimmerHover {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>

      {/* Floating blurred shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-64 h-64 rounded-full opacity-15"
          style={{
            background: "radial-gradient(circle, #62df7d, transparent)",
            top: "10%",
            left: "20%",
            filter: "blur(60px)",
            animation: "float1 8s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-48 h-48 rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #acedff, transparent)",
            top: "55%",
            right: "15%",
            filter: "blur(50px)",
            animation: "float2 10s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-56 h-56 rounded-full opacity-12"
          style={{
            background: "radial-gradient(circle, #7ffc97, transparent)",
            bottom: "15%",
            left: "10%",
            filter: "blur(55px)",
            animation: "float3 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-40 h-40 rounded-full opacity-8"
          style={{
            background: "radial-gradient(circle, #006b2c, transparent)",
            top: "30%",
            right: "30%",
            filter: "blur(45px)",
            animation: "float4 9s ease-in-out infinite",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-8">
        <div
          className="w-28 h-28 rounded-3xl flex items-center justify-center mb-8"
          style={{
            background: "linear-gradient(135deg, rgba(98,223,125,0.2), rgba(0,107,44,0.3))",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(98,223,125,0.3)",
            animation: "iconGlow 3s ease-in-out infinite",
          }}
        >
          <img src={logo} alt="SwachhLens" className="w-16 h-16 object-contain" />
        </div>

        <h1 className="text-4xl font-extrabold text-white mb-3 tracking-tight" style={{ fontFamily: "Manrope" }}>
          SwachhLens
        </h1>
        <p className="text-lg text-primary-fixed-dim/80 max-w-xs leading-relaxed" style={{ fontFamily: "Manrope" }}>
          AI-Powered Waste Response Ecosystem
        </p>
      </div>

      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
        <div className="flex items-center gap-2 text-white/50">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>
            Trusted by 50,000+ citizens
          </span>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginMode, setLoginMode] = useState("citizen");
  const [sessionExpired, setSessionExpired] = useState(false);
  const resetMessage = location.state?.resetMessage || "";

  useEffect(() => {
    if (popSessionExpired()) setSessionExpired(true);
    // Clear the one-time reset banner from history so refresh/back doesn't re-show it.
    if (resetMessage) window.history.replaceState({}, "");
  }, []);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError("");
      try {
        const accessToken = tokenResponse?.access_token;
        if (!accessToken) {
          setError("Google sign-in failed: no token received. Try again.");
          setLoading(false);
          return;
        }
        const requestedRole = loginMode === "admin" ? "admin" : loginMode === "worker" ? "cleanup_worker" : "citizen";
        const snapshot = await authService.googleLogin(accessToken, requestedRole);
        const route = snapshot.role === "cleanup_worker" ? "/worker/home" : snapshot.role !== "citizen" ? "/admin/dashboard" : "/home";
        navigate(route);
      } catch (err) {
        console.error("Google login failed:", err);
        setError(authService.getFriendlyError(err));
      } finally {
        setLoading(false);
      }
    },
    onError: (err) => {
      console.error("Google OAuth error:", err);
      setError("Google sign-in was cancelled or failed. Try again.");
    },
  });

  async function handleEmailSignIn(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const snapshot = await authService.login({ email, password });
      const route = snapshot.role === "cleanup_worker" ? "/worker/home" : snapshot.role !== "citizen" ? "/admin/dashboard" : "/home";
      navigate(route);
    } catch (err) {
      setError(authService.getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex font-display">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes shimmerHover {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .google-btn-shimmer:hover {
          background-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0,0,0,0.03) 40%,
            rgba(0,0,0,0.06) 50%,
            rgba(0,0,0,0.03) 60%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmerHover 1.5s ease-in-out infinite;
        }
        .error-slide {
          animation: slideDown 0.3s ease-out, shake 0.4s ease-in-out;
        }
        .stagger-1 { animation: fadeInUp 0.4s ease-out 0ms both; }
        .stagger-2 { animation: fadeInUp 0.4s ease-out 50ms both; }
        .stagger-3 { animation: fadeInUp 0.4s ease-out 100ms both; }
        .stagger-4 { animation: fadeInUp 0.4s ease-out 150ms both; }
        .stagger-5 { animation: fadeInUp 0.4s ease-out 200ms both; }
        .stagger-6 { animation: fadeInUp 0.4s ease-out 250ms both; }
        .stagger-7 { animation: fadeInUp 0.4s ease-out 300ms both; }
      `}</style>

      {/* Left Brand Panel - Desktop Only */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(160deg, #001a0d, #003319)" }}
      >
        <BrandPanel />
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Mobile Brand Header */}
        <div
          className="lg:hidden flex items-center justify-center py-8 px-6"
          style={{ background: "linear-gradient(160deg, #001a0d, #003319)" }}
        >
          <div className="flex items-center gap-3">
            <img src={logo} alt="SwachhLens" className="w-10 h-10 rounded-xl object-contain" />
            <span className="text-xl font-bold text-white" style={{ fontFamily: "Manrope" }}>
              SwachhLens
            </span>
          </div>
        </div>

        {/* Form Area */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-md">
            <div className="stagger-1">
              <h2 className="text-3xl font-extrabold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>
                Welcome back
              </h2>
              <p className="text-on-surface-variant mb-6" style={{ fontFamily: "Manrope" }}>
                Sign in to continue
              </p>
            </div>

            {/* Role Selector */}
            <div className="stagger-2 mb-6">
              <p className="text-xs font-semibold text-on-surface-variant mb-2.5 uppercase tracking-wider" style={{ fontFamily: "Manrope" }}>
                Sign in as
              </p>
              <div className="flex bg-surface-container rounded-xl p-1 gap-1">
                {[
                  { key: "citizen", label: "Citizen", icon: "person" },
                  { key: "worker", label: "Worker", icon: "engineering" },
                  { key: "admin", label: "Admin", icon: "admin_panel_settings" },
                ].map(function (opt) {
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={function () { setLoginMode(opt.key); setError(""); }}
                      className={
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 " +
                        (loginMode === opt.key
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-on-surface-variant hover:bg-surface-container-high")
                      }
                      style={{ fontFamily: "Manrope" }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                        {opt.icon}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password Reset Success Notice */}
            {resetMessage && (
              <div className="mb-4 flex items-start gap-3 bg-primary-container/40 border border-outline-variant rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0" style={{ color: "#006b2c" }}>check_circle</span>
                <span className="text-sm font-medium text-on-background" style={{ fontFamily: "Manrope" }}>{resetMessage}</span>
              </div>
            )}

            {/* Session Expired Notice */}
            {sessionExpired && (
              <div className="mb-4 flex items-start gap-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">schedule</span>
                <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>Your session has expired. Please log in again.</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="error-slide mb-6 flex items-start gap-3 bg-error-container text-on-error-container rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">error</span>
                <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>{error}</span>
              </div>
            )}

            {/* Google Sign-In */}
            <div className="stagger-2">
              <button
                onClick={() => googleLogin()}
                disabled={loading}
                className="google-btn-shimmer w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3 px-4 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: "Manrope" }}>
                  Continue with Google
                </span>
              </button>
            </div>

            {/* Divider */}
            <div className="stagger-3 flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-outline-variant" />
              <span className="text-xs text-on-surface-variant whitespace-nowrap" style={{ fontFamily: "Manrope" }}>
                or continue with email
              </span>
              <div className="flex-1 h-px bg-outline-variant" />
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSignIn} className="flex flex-col gap-4">
              {/* Email */}
              <div className="stagger-4">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    mail
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={function (e) { setEmail(e.target.value); }}
                    placeholder="Email address"
                    className="w-full pl-12 pr-4 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    style={{ fontFamily: "Manrope" }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="stagger-5">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={function (e) { setPassword(e.target.value); }}
                    placeholder="Password"
                    className="w-full pl-12 pr-12 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    style={{ fontFamily: "Manrope" }}
                  />
                  <button
                    type="button"
                    onClick={function () { setShowPassword(!showPassword); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[22px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot password */}
              <div className="stagger-6 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={function (e) { setRememberMe(e.target.checked); }}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-outline-variant bg-surface-container peer-checked:bg-primary peer-checked:border-primary transition-all duration-200 flex items-center justify-center">
                      {rememberMe && (
                        <span className="material-symbols-outlined text-on-primary" style={{ fontSize: "16px" }}>
                          check
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-sm text-primary font-semibold hover:underline transition-colors"
                  style={{ fontFamily: "Manrope" }}
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <div className="stagger-7">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ fontFamily: "Manrope" }}
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-on-primary" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            </form>

            {/* Footer */}
            <p className="text-center text-sm text-on-surface-variant mt-8" style={{ fontFamily: "Manrope" }}>
              Don't have an account?{" "}
              <button
                onClick={function () { navigate("/signup"); }}
                className="text-primary font-semibold hover:underline transition-colors"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
