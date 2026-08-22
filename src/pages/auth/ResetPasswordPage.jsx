import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authService } from "../../services.js";
import logo from "../../logo.svg";

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

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length >= 6 && password === confirmPassword && !loading;

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => {
      navigate("/login", { state: { resetMessage: "Password reset successfully. Please sign in with your new password." } });
    }, 2200);
    return () => clearTimeout(t);
  }, [done, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!token) {
      setError("This reset link is invalid. Please request a new one.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter them.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(authService.getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex flex-col font-display">
        <style>{`@keyframes drawCheck { from { stroke-dashoffset: 48; } to { stroke-dashoffset: 0; } } @keyframes popIn { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }`}</style>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm" style={{ animation: "popIn .4s cubic-bezier(0.22,1,0.36,1)" }}>
            <div className="mx-auto w-20 h-20 rounded-full bg-primary-container flex items-center justify-center mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M4 12.5l5 5L20 6.5" stroke="#006b2c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ strokeDasharray: 48, animation: "drawCheck .5s ease-out .15s both" }} />
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>
              Password updated
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6" style={{ fontFamily: "Manrope" }}>
              Your password has been changed successfully. Taking you to sign in…
            </p>
            <div className="flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-display">
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-4px)} 20%,40%,60%,80%{transform:translateX(4px)} }
        @keyframes slideDown { from { opacity:0; transform:translateY(-12px);} to { opacity:1; transform:translateY(0);} }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(12px);} to { opacity:1; transform:translateY(0);} }
        .error-slide { animation: slideDown .3s ease-out, shake .4s ease-in-out; }
        .stagger-1 { animation: fadeInUp .4s ease-out 0ms both; }
        .stagger-2 { animation: fadeInUp .4s ease-out 60ms both; }
        .stagger-3 { animation: fadeInUp .4s ease-out 120ms both; }
      `}</style>

      {/* Mobile brand header */}
      <div className="lg:hidden flex items-center justify-center py-6 px-6" style={{ background: "linear-gradient(160deg,#001a0d,#003319)" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="SwachhLens" className="w-10 h-10 rounded-xl object-contain" />
          <span className="text-xl font-bold text-white" style={{ fontFamily: "Manrope" }}>SwachhLens</span>
        </div>
      </div>

      <div className="flex-1 flex items-start lg:items-center justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-md py-4">
          <div className="stagger-1 mb-8">
            <button
              onClick={() => navigate("/login")}
              className="w-11 h-11 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all mb-6"
              aria-label="Back to sign in"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="w-14 h-14 rounded-2xl bg-primary-container flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-primary text-[28px]">lock_reset</span>
            </div>
            <h2 className="text-3xl font-extrabold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>
              Set a new password
            </h2>
            <p className="text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
              Choose a strong password you haven't used elsewhere.
            </p>
          </div>

          {!token && (
            <div className="mb-5 flex items-start gap-3 bg-error-container text-on-error-container rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">link_off</span>
              <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>
                This link is missing its security token. Please request a fresh reset email.
              </span>
            </div>
          )}

          {error && (
            <div className="error-slide mb-5 flex items-start gap-3 bg-error-container text-on-error-container rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">error</span>
              <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* New password */}
            <div className="stagger-2">
              <label htmlFor="rp-password" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2" style={{ fontFamily: "Manrope" }}>
                New password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">lock</span>
                <input
                  id="rp-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                  placeholder="At least 6 characters"
                  className="w-full pl-12 pr-12 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  style={{ fontFamily: "Manrope" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-symbols-outlined text-[22px]">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ backgroundColor: level <= passwordStrength.score ? passwordStrength.color : "#e0e3e5" }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium" style={{ fontFamily: "Manrope", color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="stagger-2">
              <label htmlFor="rp-confirm" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2" style={{ fontFamily: "Manrope" }}>
                Confirm password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">lock</span>
                <input
                  id="rp-confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError(""); }}
                  placeholder="Re-enter new password"
                  className="w-full pl-12 pr-12 py-3 bg-surface-container border border-outline-variant rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                  style={{ fontFamily: "Manrope" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-symbols-outlined text-[22px]">{showConfirmPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]" style={{ color: passwordsMatch ? "#006b2c" : "#ba1a1a" }}>
                    {passwordsMatch ? "check_circle" : "cancel"}
                  </span>
                  <span className="text-xs font-medium" style={{ fontFamily: "Manrope", color: passwordsMatch ? "#006b2c" : "#ba1a1a" }}>
                    {passwordsMatch ? "Passwords match" : "Passwords don't match"}
                  </span>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="stagger-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ fontFamily: "Manrope" }}
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-on-primary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    Reset Password
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-xs text-on-surface-variant mt-1" style={{ fontFamily: "Manrope" }}>
              Link expired or already used?{" "}
              <button type="button" onClick={() => navigate("/forgot-password")} className="text-primary font-semibold hover:underline">
                Request a new one
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
