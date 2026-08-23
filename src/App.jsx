import { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter, Route, Routes, Navigate, useParams } from "react-router-dom";
import { ProtectedRoute, ReconnectingScreen } from "./components/ProtectedRoute";
import { appService, authService } from "./services.js";
import { APP_STATES } from "./data.js";
import logo from "./logo.svg";

const SplashScreen = lazy(() => import("./pages/SplashScreen"));
const PermissionFlow = lazy(() => import("./pages/PermissionFlow"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const AdminLoginPage = lazy(() => import("./pages/auth/AdminLoginPage"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const TermsPage = lazy(() => import("./pages/auth/Legal").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./pages/auth/Legal").then((m) => ({ default: m.PrivacyPage })));
const HomePage = lazy(() => import("./pages/citizen/HomePage"));
const ExploreMap = lazy(() => import("./pages/citizen/ExploreMap"));
const CaptureWaste = lazy(() => import("./pages/citizen/CaptureWaste"));
const AnalyzingWaste = lazy(() => import("./pages/citizen/AnalyzingWaste"));
const AIResults = lazy(() => import("./pages/citizen/AIResults"));
const SuccessPage = lazy(() => import("./pages/citizen/SuccessPage"));
const TrackingCleanup = lazy(() => import("./pages/citizen/TrackingCleanup"));
const MyReports = lazy(() => import("./pages/citizen/MyReports"));
const Profile = lazy(() => import("./pages/citizen/Profile"));
const NotificationsPage = lazy(() => import("./pages/citizen/NotificationsPage"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const LiveMap = lazy(() => import("./pages/admin/LiveMap"));
const PriorityQueue = lazy(() => import("./pages/admin/PriorityQueue"));
const ComplaintDetail = lazy(() => import("./pages/admin/ComplaintDetail"));
const DuplicateReview = lazy(() => import("./pages/admin/DuplicateReview"));
const VerificationQueue = lazy(() => import("./pages/admin/VerificationQueue"));
const TeamsFleet = lazy(() => import("./pages/admin/TeamsFleet"));
const RecyclingRouting = lazy(() => import("./pages/admin/RecyclingRouting"));
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const AlertsCenter = lazy(() => import("./pages/admin/AlertsCenter"));
const UsersManagement = lazy(() => import("./pages/admin/UsersManagement"));

const WorkerTasks = lazy(() => import("./pages/worker/WorkerTasks"));
const TaskDetail = lazy(() => import("./pages/worker/TaskDetail"));
const CompleteCleanup = lazy(() => import("./pages/worker/CompleteCleanup"));
const WorkerMap = lazy(() => import("./pages/worker/WorkerMap"));
const WorkerHistory = lazy(() => import("./pages/worker/WorkerHistory"));
const WorkerProfile = lazy(() => import("./pages/worker/WorkerProfile"));

function ComplaintDetailWrapper() {
  const { reportId } = useParams();
  return <ComplaintDetail reportId={reportId} />;
}

// Admin routes live behind a dedicated login-only portal at /admin/login —
// no signup, no Google. Unauthenticated visitors land there instead of /login.
function AdminRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={ADMIN_ROLES} loginPath="/admin/login">
      {children}
    </ProtectedRoute>
  );
}

// Profile is role-scoped: workers get their own duty-toggle profile,
// everyone else the standard one.
function ProfilePage() {
  const role = authService.getSessionSnapshot().role || authService.getCurrentRole();
  return role === "cleanup_worker" ? <WorkerProfile /> : <Profile />;
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src={logo} alt="SwachhLens" className="w-16 h-16 object-contain" />
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

const CITIZEN_ROLES = ["citizen"];
const WORKER_ROLES = ["cleanup_worker"];
const ADMIN_ROLES = ["admin", "super_admin", "ward_officer", "sanitation_supervisor"];

export default function App() {
  const [ready, setReady] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [slowBoot, setSlowBoot] = useState(false);

  useEffect(() => {
    const hintTimer = setTimeout(() => setSlowBoot(true), 10000);
    appService.initialize().then((snap) => {
      clearTimeout(hintTimer);
      setReady(true);
      if (snap.appState === APP_STATES.RECONNECTING) {
        setReconnecting(true);
        appService.startAutoRetry(10);
      }
    }).catch((err) => {
      clearTimeout(hintTimer);
      console.error("[boot] initialize crashed:", err);
      setReady(true);
    });
    return () => clearTimeout(hintTimer);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src={logo} alt="SwachhLens" className="w-16 h-16 object-contain" />
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          {slowBoot && (
            <p className="text-xs text-gray-400 text-center max-w-[240px]" style={{ fontFamily: "Manrope" }}>
              Taking longer than usual — the server may be waking up. Retrying automatically…
            </p>
          )}
        </div>
      </div>
    );
  }
  if (reconnecting) {
    return (
      <BrowserRouter>
        <ReconnectingScreen />
      </BrowserRouter>
    );
  }
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<SplashScreen />} />
          <Route path="/permissions" element={<PermissionFlow />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy-policy" element={<PrivacyPage />} />

          {/* Citizen Routes */}
          <Route path="/home" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <HomePage />
            </ProtectedRoute>
          } />
          <Route path="/explore" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <ExploreMap />
            </ProtectedRoute>
          } />
          <Route path="/report-waste" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <CaptureWaste />
            </ProtectedRoute>
          } />
          <Route path="/analyzing" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <AnalyzingWaste />
            </ProtectedRoute>
          } />
          <Route path="/ai-results" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <AIResults />
            </ProtectedRoute>
          } />
          <Route path="/success" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <SuccessPage />
            </ProtectedRoute>
          } />
          <Route path="/tracking" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <TrackingCleanup />
            </ProtectedRoute>
          } />
          <Route path="/my-reports" element={
            <ProtectedRoute allowedRoles={CITIZEN_ROLES}>
              <MyReports />
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute allowedRoles={[...CITIZEN_ROLES, ...WORKER_ROLES, ...ADMIN_ROLES]}>
              <NotificationsPage />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={[...CITIZEN_ROLES, ...WORKER_ROLES, ...ADMIN_ROLES]}>
              <ProfilePage />
            </ProtectedRoute>
          } />

          {/* Worker Routes */}
          <Route path="/worker/home" element={
            <ProtectedRoute allowedRoles={WORKER_ROLES}>
              <WorkerTasks />
            </ProtectedRoute>
          } />
          <Route path="/worker/tasks/:reportId" element={
            <ProtectedRoute allowedRoles={WORKER_ROLES}>
              <TaskDetail />
            </ProtectedRoute>
          } />
          <Route path="/worker/complete/:reportId" element={
            <ProtectedRoute allowedRoles={WORKER_ROLES}>
              <CompleteCleanup />
            </ProtectedRoute>
          } />
          <Route path="/worker/map" element={
            <ProtectedRoute allowedRoles={WORKER_ROLES}>
              <WorkerMap />
            </ProtectedRoute>
          } />
          <Route path="/worker/history" element={
            <ProtectedRoute allowedRoles={WORKER_ROLES}>
              <WorkerHistory />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/map" element={<AdminRoute><LiveMap /></AdminRoute>} />
          <Route path="/admin/queue" element={<AdminRoute><PriorityQueue /></AdminRoute>} />
          {/* Legacy routes → consolidated screens */}
          <Route path="/admin/ai-priority-queue" element={<Navigate to="/admin/queue" replace />} />
          <Route path="/admin/smart-dispatch" element={<Navigate to="/admin/queue" replace />} />
          <Route path="/admin/complaints" element={<Navigate to="/admin/queue" replace />} />
          <Route path="/admin/workers" element={<Navigate to="/admin/teams" replace />} />
          <Route path="/admin/complaints/:reportId" element={<AdminRoute><ComplaintDetailWrapper /></AdminRoute>} />
          <Route path="/admin/duplicates" element={<AdminRoute><DuplicateReview /></AdminRoute>} />
          <Route path="/admin/verification" element={<AdminRoute><VerificationQueue /></AdminRoute>} />
          <Route path="/admin/teams" element={<AdminRoute><TeamsFleet /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UsersManagement /></AdminRoute>} />
          <Route path="/admin/recycling" element={<AdminRoute><RecyclingRouting /></AdminRoute>} />
          <Route path="/admin/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
          <Route path="/admin/alerts" element={<AdminRoute><AlertsCenter /></AdminRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
