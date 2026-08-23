import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { authService } from "../../services.js";
import { LegalModal } from "./Legal.jsx";
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

function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "#ba1a1a" };
  if (score <= 2) return { score: 2, label: "Fair", color: "#e8a317" };
  if (score <= 3) return { score: 3, label: "Good", color: "#7ffc97" };
  return { score: 4, label: "Strong", color: "#006b2c" };
}

export default function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // "terms" | "privacy" | null

  const passwordStrength = useMemo(function () {
    return getPasswordStrength(password);
  }, [password]);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Everything except the terms checkbox — drives the "please accept" hint.
  const isFormValidExceptTerms = name.trim().length > 0
    && emailValid
    && password.length >= 6
    && password === confirmPassword
    && role !== "";

  const isFormValid = isFormValidExceptTerms && termsAccepted;

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError("");
      try {
        const selectedRole = role === "worker" ? "cleanup_worker" : "citizen";
        const snapshot = await authService.googleLogin(tokenResponse.access_token, selectedRole);
        const route = snapshot.role === "cleanup_worker" ? "/worker/home" : snapshot.role !== "citizen" ? "/admin/dashboard" : "/home";
        navigate(route);
      } catch (err) {
        setError(authService.getFriendlyError(err));
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError("Google sign-up was cancelled or failed.");
    },
  });

  async function handleEmailSignUp(e) {
    e.preventDefault();
    if (!termsAccepted) {
      setError("Please accept the Terms of Service and Privacy Policy to create your account.");
      return;
    }
    if (!isFormValid) return;

    setLoading(true);
    setError("");
    try {
      const selectedRole = role === "worker" ? "cleanup_worker" : "citizen";
      const snapshot = await authService.signup({ name, email, password, phone: "", role: selectedRole, termsAccepted: true });
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
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes shimmerHover {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
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
        .stagger-8 { animation: fadeInUp 0.4s ease-out 350ms both; }
        .stagger-9 { animation: fadeInUp 0.4s ease-out 400ms both; }
        .stagger-10 { animation: fadeInUp 0.4s ease-out 450ms both; }
      `}</style>

      {/* Left Brand Panel - Desktop Only */}
      <div
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(160deg, #001a0d, #003319)" }}
      >
        <BrandPanel />
      </div>

      {/* Right Side - Sign Up Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Mobile Brand Header */}
        <div
          className="lg:hidden flex items-center justify-center py-6 px-6"
          style={{ background: "linear-gradient(160deg, #001a0d, #003319)" }}
        >
          <div className="flex items-center gap-3">
            <img src={logo} alt="SwachhLens" className="w-10 h-10 rounded-xl object-contain" />
            <span className="text-xl font-bold text-white" style={{ fontFamily: "Manrope" }}>
              SwachhLens
            </span>
          </div>
        </div>

        {/* Scrollable Form Area */}
        <div className="flex-1 flex items-start lg:items-center justify-center p-6 sm:p-8 overflow-y-auto">
          <div className="w-full max-w-md py-4">
            <div className="stagger-1">
              <h2 className="text-3xl font-extrabold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>
                Create your account
              </h2>
              <p className="text-on-surface-variant mb-8" style={{ fontFamily: "Manrope" }}>
                Join the movement for cleaner cities
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-slide mb-6 flex items-start gap-3 bg-error-container text-on-error-container rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">error</span>
                <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>{error}</span>
              </div>
            )}

            {/* Google Sign-Up */}
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
                or sign up with email
              </span>
              <div className="flex-1 h-px bg-outline-variant" />
            </div>

            {/* Sign-Up Form */}
            <form onSubmit={handleEmailSignUp} className="flex flex-col gap-4">
              {/* Full Name */}
              <div className="stagger-4">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    person
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={function (e) { setName(e.target.value); }}
                    placeholder="Full name"
                    className="w-full pl-12 pr-4 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    style={{ fontFamily: "Manrope" }}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="stagger-5">
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
              <div className="stagger-6">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={function (e) { setPassword(e.target.value); }}
                    placeholder="Create password"
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
                {/* Password Strength Bar */}
                {password.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(function (level) {
                        return (
                          <div
                            key={level}
                            className="h-1 flex-1 rounded-full transition-all duration-300"
                            style={{
                              backgroundColor: level <= passwordStrength.score ? passwordStrength.color : "#e0e3e5",
                            }}
                          />
                        );
                      })}
                    </div>
                    <span
                      className="text-xs font-medium"
                      style={{ fontFamily: "Manrope", color: passwordStrength.color }}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="stagger-7">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                    lock
                  </span>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={function (e) { setConfirmPassword(e.target.value); }}
                    placeholder="Confirm password"
                    className="w-full pl-12 pr-12 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    style={{ fontFamily: "Manrope" }}
                  />
                  <button
                    type="button"
                    onClick={function () { setShowConfirmPassword(!showConfirmPassword); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[22px]">
                      {showConfirmPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                {/* Password Match Indicator */}
                {confirmPassword.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className="material-symbols-outlined text-[16px]"
                      style={{ color: passwordsMatch ? "#006b2c" : "#ba1a1a" }}
                    >
                      {passwordsMatch ? "check_circle" : "cancel"}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ fontFamily: "Manrope", color: passwordsMatch ? "#006b2c" : "#ba1a1a" }}
                    >
                      {passwordsMatch ? "Passwords match" : "Passwords don't match"}
                    </span>
                  </div>
                )}
              </div>

              {/* Role Selection */}
              <div className="stagger-8">
                <p className="text-sm font-semibold text-on-surface mb-3" style={{ fontFamily: "Manrope" }}>
                  I want to use SwachhLens as:
                </p>
                <div className="flex gap-3">
                  {/* Citizen Card */}
                  <button
                    type="button"
                    onClick={function () { setRole("citizen"); }}
                    className={
                      "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:scale-[1.02] " +
                      (role === "citizen"
                        ? "border-primary bg-primary-container/10"
                        : "border-outline-variant bg-surface-container")
                    }
                  >
                    <div
                      className={
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 " +
                        (role === "citizen" ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant")
                      }
                    >
                      <span className="material-symbols-outlined text-[20px]">person</span>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ fontFamily: "Manrope", color: role === "citizen" ? "#006b2c" : "#191c1e" }}
                    >
                      Citizen
                    </span>
                    <span className="text-xs text-on-surface-variant text-center leading-tight" style={{ fontFamily: "Manrope" }}>
                      Report waste & track cleanup
                    </span>
                  </button>

                  {/* Worker Card */}
                  <button
                    type="button"
                    onClick={function () { setRole("worker"); }}
                    className={
                      "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:scale-[1.02] " +
                      (role === "worker"
                        ? "border-primary bg-primary-container/10"
                        : "border-outline-variant bg-surface-container")
                    }
                  >
                    <div
                      className={
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 " +
                        (role === "worker" ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant")
                      }
                    >
                      <span className="material-symbols-outlined text-[20px]">engineering</span>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ fontFamily: "Manrope", color: role === "worker" ? "#006b2c" : "#191c1e" }}
                    >
                      Worker
                    </span>
                    <span className="text-xs text-on-surface-variant text-center leading-tight" style={{ fontFamily: "Manrope" }}>
                      Manage tasks & cleanup operations
                    </span>
                  </button>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="stagger-9">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={function (e) { setTermsAccepted(e.target.checked); }}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-outline-variant bg-surface-container peer-checked:bg-primary peer-checked:border-primary transition-all duration-200 flex items-center justify-center">
                      {termsAccepted && (
                        <span className="material-symbols-outlined text-on-primary" style={{ fontSize: "16px" }}>
                          check
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-on-surface-variant leading-snug" style={{ fontFamily: "Manrope" }}>
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={function (e) { e.preventDefault(); e.stopPropagation(); setLegalModal("terms"); }}
                      className="text-primary font-semibold hover:underline align-baseline"
                      style={{ fontFamily: "Manrope" }}
                    >
                      Terms of Service
                    </button>
                    {" "}and{" "}
                    <button
                      type="button"
                      onClick={function (e) { e.preventDefault(); e.stopPropagation(); setLegalModal("privacy"); }}
                      className="text-primary font-semibold hover:underline align-baseline"
                      style={{ fontFamily: "Manrope" }}
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
                {/* Validation hint: everything else valid but terms unchecked */}
                {!termsAccepted && isFormValidExceptTerms && (
                  <div
                    className="mt-2.5 flex items-start gap-2 bg-surface-container border border-outline-variant rounded-xl px-3 py-2.5"
                    style={{ animation: "slideDown 0.25s ease-out" }}
                  >
                    <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0" style={{ color: "#e8a317" }}>
                      gavel
                    </span>
                    <span className="text-xs font-medium text-on-surface-variant leading-snug" style={{ fontFamily: "Manrope" }}>
                      Please accept the Terms of Service and Privacy Policy above to enable the Sign Up button.
                    </span>
                  </div>
                )}
              </div>

              {/* Sign Up Button */}
              <div className="stagger-10">
                <button
                  type="submit"
                  disabled={loading || !isFormValid}
                  className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ fontFamily: "Manrope" }}
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-on-primary" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    "Sign Up"
                  )}
                </button>
              </div>
            </form>

            {/* Footer */}
            <p className="text-center text-sm text-on-surface-variant mt-8 pb-4" style={{ fontFamily: "Manrope" }}>
              Already have an account?{" "}
              <button
                onClick={function () { navigate("/login"); }}
                className="text-primary font-semibold hover:underline transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Terms / Privacy viewer — keeps signup form state intact */}
      <LegalModal open={legalModal !== null} kind={legalModal} onClose={function () { setLegalModal(null); }} />
    </div>
  );
}
