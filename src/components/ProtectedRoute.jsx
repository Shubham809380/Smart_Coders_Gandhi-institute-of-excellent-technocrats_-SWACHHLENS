import { Navigate } from "react-router-dom";
import { authService, appService } from "../services.js";
import { APP_STATES } from "../data.js";

export function ReconnectingScreen() {
  const handleRetry = async () => {
    const snap = await appService.retryInitialization();
    if (snap.appState !== APP_STATES.RECONNECTING) window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <span className="material-symbols-outlined text-amber-500 text-[32px]">cloud_off</span>
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: "Manrope" }}>
          Server Waking Up
        </h2>
        <p className="text-sm text-gray-500 mb-6" style={{ fontFamily: "Manrope" }}>
          The backend server is starting up. This usually takes 30-60 seconds on first load.
        </p>
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <button
          onClick={handleRetry}
          className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors"
          style={{ fontFamily: "Manrope" }}
        >
          Retry Now
        </button>
        <button
          onClick={() => { try { localStorage.removeItem("swachhlens-session-token"); } catch {} window.location.href = "/login"; }}
          className="w-full mt-3 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-colors"
          style={{ fontFamily: "Manrope" }}
        >
          Login with Different Account
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, allowedRoles, loginPath = "/login" }) {
  const snapshot = authService.getSessionSnapshot();
  const role = snapshot.role || authService.getCurrentRole();
  const isAuth = snapshot.isAuthenticated;
  const appState = snapshot.appState;

  if (appState === APP_STATES.RECONNECTING) {
    return <ReconnectingScreen />;
  }

  if (!isAuth) return <Navigate to={loginPath} replace />;

  if (allowedRoles && !allowedRoles.includes(role)) {
    const roleHome = {
      citizen: "/home",
      cleanup_worker: "/worker/home",
      admin: "/admin/dashboard",
      super_admin: "/admin/dashboard",
      ward_officer: "/admin/dashboard",
      sanitation_supervisor: "/admin/dashboard",
    };
    return <Navigate to={roleHome[role] || "/home"} replace />;
  }

  return children;
}
