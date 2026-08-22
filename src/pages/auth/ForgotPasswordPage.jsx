import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authService } from "../../services.js";
import logo from "../../logo.svg";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const emailValid = EMAIL_RE.test(email.trim());

  async function handleSubmit(e) {
    e.preventDefault();
    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authService.forgotPassword(email.trim());
      // Generic success — never reveal whether the account exists.
      setSent(true);
    } catch (err) {
      setError(authService.getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-display">
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-4px)} 20%,40%,60%,80%{transform:translateX(4px)} }
        @keyframes slideDown { from { opacity:0; transform:translateY(-12px);} to { opacity:1; transform:translateY(0);} }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(12px);} to { opacity:1; transform:translateY(0);} }
        @keyframes drawCheck { from { stroke-dashoffset: 48; } to { stroke-dashoffset: 0; } }
        .error-slide { animation: slideDown .3s ease-out, shake .4s ease-in-out; }
        .stagger-1 { animation: fadeInUp .4s ease-out 0ms both; }
        .stagger-2 { animation: fadeInUp .4s ease-out 60ms both; }
        .stagger-3 { animation: fadeInUp .4s ease-out 120ms both; }
        .stagger-4 { animation: fadeInUp .4s ease-out 180ms both; }
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
          {!sent ? (
            <>
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
                  Forgot password?
                </h2>
                <p className="text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
                  No worries — enter your account email and we'll send you a secure reset link.
                </p>
              </div>

              {error && (
                <div className="error-slide mb-5 flex items-start gap-3 bg-error-container text-on-error-container rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">error</span>
                  <span className="text-sm font-medium" style={{ fontFamily: "Manrope" }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Email */}
                <div className="stagger-2">
                  <label htmlFor="fp-email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2" style={{ fontFamily: "Manrope" }}>
                    Email address
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">mail</span>
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                      placeholder="you@example.com"
                      autoFocus
                      className={"w-full pl-12 pr-4 py-3 bg-surface-container border rounded-xl text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 " +
                        (email.length > 0 && !emailValid ? "border-red-400 focus:border-red-400" : "border-outline-variant focus:border-primary")}
                      style={{ fontFamily: "Manrope" }}
                    />
                  </div>
                  {email.length > 0 && !emailValid && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1" style={{ fontFamily: "Manrope" }}>
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      Enter a valid email like name@example.com
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="stagger-3">
                  <button
                    type="submit"
                    disabled={loading || !emailValid}
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
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        Send Reset Link
                      </>
                    )}
                  </button>
                </div>

                {/* Back to sign in */}
                <div className="stagger-4 text-center mt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="text-sm text-primary font-semibold hover:underline inline-flex items-center gap-1"
                    style={{ fontFamily: "Manrope" }}
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Back to Sign In
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* ---- Success state ---- */
            <div className="stagger-1 text-center py-8">
              <div className="mx-auto w-20 h-20 rounded-full bg-primary-container flex items-center justify-center mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12.5l5 5L20 6.5" stroke="#006b2c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ strokeDasharray: 48, animation: "drawCheck .5s ease-out .15s both" }} />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold text-on-background mb-3" style={{ fontFamily: "Manrope" }}>
                Check your email
              </h2>
              <p className="text-sm text-on-surface-variant leading-relaxed max-w-sm mx-auto mb-2" style={{ fontFamily: "Manrope" }}>
                If an account exists with this email, a password reset link has been sent.
              </p>
              <div className="inline-flex items-center gap-2 bg-primary-container/40 border border-outline-variant rounded-xl px-4 py-2.5 mt-3">
                <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                <span className="text-xs font-medium text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
                  The link expires in 30 minutes and can be used only once.
                </span>
              </div>

              <div className="flex flex-col gap-3 mt-8 max-w-xs mx-auto">
                <button
                  onClick={() => navigate("/login")}
                  className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all"
                  style={{ fontFamily: "Manrope" }}
                >
                  Back to Sign In
                </button>
                <button
                  onClick={() => { setSent(false); setEmail(""); }}
                  className="text-sm text-on-surface-variant hover:text-on-surface font-semibold transition-colors"
                  style={{ fontFamily: "Manrope" }}
                >
                  Didn't get it? Try another email
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
