import { Navigate } from "react-router-dom";
import { authService } from "../services.js";

export function ProtectedRoute({ children, allowedRoles }) {
  const role = authService.getCurrentRole();
  const isAuth = authService.getSessionSnapshot().isAuthenticated;

  if (!isAuth) return <Navigate to="/login" replace />;

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
