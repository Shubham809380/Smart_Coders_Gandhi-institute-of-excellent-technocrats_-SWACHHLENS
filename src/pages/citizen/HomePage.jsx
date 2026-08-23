import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../../components/BottomNav.jsx";
import { reportService, authService, notificationService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";
import { useLanguage } from "../../contexts/LanguageContext.jsx";

const STATUS_CONFIG = {
  resolved: { label: "Resolved", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  assigned: { label: "Assigned", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  en_route: { label: "En Route", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
  in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  cleanup_in_progress: { label: "Cleaning", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  under_review: { label: "Under Review", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  submitted: { label: "Submitted", bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
  verification: { label: "Verification", bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" },
  reopened: { label: "Reopened", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
};

function getStatusStyle(status) {
  return STATUS_CONFIG[status] || { label: status?.replace(/_/g, " ") || "Unknown", bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" };
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.round(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const start = display;
    const end = value;
    if (start === end) return;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <span>{display}</span>;
}

function SkeletonCard({ className = "" }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-200/60 rounded-2xl h-full w-full" />
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, value, label, loading }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 min-w-[130px] snap-start shrink-0 transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.97]">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
        <span className={`material-symbols-outlined text-[20px] ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
          {icon}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[24px] font-extrabold text-gray-900 leading-none tracking-tight">
          {loading ? (
            <span className="inline-block w-8 h-6 bg-gray-200/60 rounded-md animate-pulse" />
          ) : (
            <AnimatedNumber value={value} />
          )}
        </span>
        <span className="text-[11px] font-semibold text-gray-400 mt-1.5 uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const pullStartY = useRef(0);
  const pullDist = useRef(0);
  const [pullOffset, setPullOffset] = useState(0);
  const isPulling = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [reportsData, snap] = await Promise.all([
        reportService.getReports(),
        authService.getSessionSnapshot(),
      ]);
      setReports(reportsData);
      setCurrentUser(snap.currentUser);
      // Unread badge — refreshed by the live hook on notification:new.
      const notifs = await notificationService.getNotifications().catch(() => []);
      setNotifCount(notifs.filter((n) => !n.isRead).length);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: a fresh notification bumps the bell badge instantly.
  useLive(
    (evt) => {
      if (evt === "notification:new") loadData(true);
      if (evt === "waste:status:update") loadData();
    },
    ["notification:new", "waste:status:update"],
    { pollMs: 45000, poll: () => loadData() }
  );

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY <= 0) {
      pullStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current) return;
    pullDist.current = e.touches[0].clientY - pullStartY.current;
    if (pullDist.current > 0 && pullDist.current < 150) {
      setPullOffset(pullDist.current * 0.4);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isPulling.current = false;
    if (pullDist.current > 60) {
      loadData(true);
    }
    setPullOffset(0);
    pullDist.current = 0;
  }, [loadData]);

  const resolved = reports.filter((r) => r.status === "resolved").length;
  const inProgress = reports.filter((r) =>
    ["assigned", "en_route", "in_progress", "cleanup_in_progress"].includes(r.status)
  ).length;
  const critical = reports.filter((r) =>
    r.priority?.level === "critical" || r.priority?.level === "high"
  ).length;

  const h = new Date().getHours();
  const greeting = h < 12 ? t("greetingMorning") : h < 17 ? t("greetingAfternoon") : t("greetingEvening");
  const userName = currentUser?.name?.split(" ")[0] || "there";

  const recentReports = reports.slice(0, 5);
  const unresolvedReports = reports.filter((r) => r.status !== "resolved" && r.status !== "rejected");
  const urgentReports = unresolvedReports
    .filter((r) => r.priority?.level === "critical" || r.priority?.level === "high")
    .slice(0, 3);

  return (
    <div
      className="bg-background min-h-screen max-w-lg mx-auto pb-24 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullOffset > 0 && (
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] transition-all duration-100"
          style={{ opacity: Math.min(pullOffset / 40, 1) }}
        >
          <div
            className={`w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center transition-transform duration-100 ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: `rotate(${pullOffset * 3}deg)` }}
          >
            <span className="material-symbols-outlined text-green-600 text-[20px]">
              {refreshing ? "sync" : "arrow_downward"}
            </span>
          </div>
        </div>
      )}

      <main className="relative w-full" style={{ transform: `translateY(${pullOffset}px)` }}>
        <div className="flex flex-col gap-5 px-4 pt-safe pb-4">

          {/* Header */}
          <div className="flex items-center justify-between pt-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">
                  {greeting}
                </h1>
                <span className="text-[22px]" role="img" aria-label="wave">
                  {(h < 12) ? "\u{1F31E}" : (h < 17) ? "\u{2600}\u{FE0F}" : "\u{1F319}"}
                </span>
              </div>
              <p className="text-[13px] text-on-surface-variant font-medium">
                {t("homeTagline", { name: userName })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/notifications")}
                className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-gray-600 text-[22px]">notifications</span>
                {notifCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-[0_2px_8px_rgba(0,107,44,0.3)] active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #006b2c, #00a843)" }}
              >
                {currentUser?.name?.charAt(0)?.toUpperCase() || "U"}
              </button>
            </div>
          </div>

          {/* Hero Banner */}
          <div
            className="relative overflow-hidden rounded-[24px] p-6 transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, #004d20 0%, #007a35 40%, #00a843 70%, #0891b2 100%)",
              boxShadow: "0 16px 40px -8px rgba(0,77,32,0.35), 0 4px 12px -4px rgba(0,77,32,0.15)",
            }}
          >
            {/* Decorative elements */}
            <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/[0.07] rounded-full" />
            <div className="absolute right-16 bottom-[-12px] w-20 h-20 bg-white/[0.05] rounded-full" />
            <div className="absolute left-[60%] top-4 w-14 h-14 bg-white/[0.04] rounded-full" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.06]" preserveAspectRatio="none" viewBox="0 0 400 220">
              <path d="M0,80 C100,160 200,20 400,100 L400,220 L0,220 Z" fill="currentColor" />
              <path d="M0,120 C150,60 300,180 400,140 L400,220 L0,220 Z" fill="currentColor" opacity="0.5" />
            </svg>

            <div className="relative z-10 flex flex-col gap-3.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <span className="material-symbols-outlined text-white/90 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    psychology
                  </span>
                </div>
                <span className="text-[10px] font-extrabold text-white/60 tracking-[0.12em] uppercase">
                  {t("aiPoweredBadge")}
                </span>
              </div>
              <p className="text-[19px] font-bold leading-[1.25] text-white max-w-[28ch]">
                {t("heroHeadline")}
              </p>
              <button
                onClick={() => navigate("/report-waste")}
                className="mt-1 self-start flex items-center justify-center gap-2.5 bg-white text-[#006b2c] font-bold px-6 py-3 rounded-2xl transition-all duration-200 active:scale-[0.96] hover:shadow-xl hover:shadow-white/20"
              >
                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                <span className="text-[14px]">{t("reportNow")}</span>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory hide-scrollbar">
            <StatCard
              icon="assignment"
              iconBg="bg-cyan-50"
              iconColor="text-cyan-600"
              value={reports.length}
              label={t("statReports")}
              loading={loading}
            />
            <StatCard
              icon="check_circle"
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              value={resolved}
              label={t("statResolved")}
              loading={loading}
            />
            <StatCard
              icon="pending"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              value={inProgress}
              label={t("statInProgress")}
              loading={loading}
            />
            <StatCard
              icon="priority_high"
              iconBg="bg-red-50"
              iconColor="text-red-600"
              value={critical}
              label={t("statUrgent")}
              loading={loading}
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/my-reports")}
              className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 p-4 flex items-center gap-3 active:scale-[0.97] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100/50 text-cyan-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">list_alt</span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900">{t("myReports")}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5">{t("quickTotalCount", { n: reports.length })}</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/explore")}
              className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 p-4 flex items-center gap-3 active:scale-[0.97] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 text-green-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">explore</span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900">{t("quickExploreMap")}</p>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5">{t("quickNearbyIssues")}</p>
              </div>
            </button>
          </div>

          {/* Urgent Reports */}
          {urgentReports.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <h2 className="text-[16px] font-extrabold text-gray-900">{t("urgentAttention")}</h2>
                </div>
                <button
                  onClick={() => navigate("/my-reports")}
                  className="text-[12px] font-bold text-green-700 flex items-center gap-0.5 hover:gap-1.5 transition-all duration-200"
                >
                  {t("viewAll")}
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory hide-scrollbar">
                {urgentReports.map((report) => {
                  const st = getStatusStyle(report.status);
                  return (
                    <div
                      key={report.id}
                      onClick={() => navigate("/tracking", { state: { reportId: report.id } })}
                      className="snap-start shrink-0 w-[240px] bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 active:scale-[0.97] cursor-pointer transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                    >
                      {report.image && (
                        <div className="w-full h-28 bg-gray-100 overflow-hidden">
                          <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${report.image}')` }} />
                        </div>
                      )}
                      <div className="p-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-bold text-gray-900 truncate">
                            {report.wasteType?.replace(/_/g, " ") || "Waste"}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.bg} ${st.text} border ${st.border}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <span className="material-symbols-outlined text-[12px]">location_on</span>
                          <span className="text-[11px] truncate font-medium">{report.address || "Location"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-gray-400">{timeAgo(report.createdAt)}</span>
                          {report.priority?.level === "critical" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">CRITICAL</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Reports */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold text-gray-900">{t("recentReports")}</h2>
              <button
                onClick={() => navigate("/my-reports")}
                className="text-[12px] font-bold text-green-700 flex items-center gap-0.5 hover:gap-1.5 transition-all duration-200"
              >
                {t("viewAll")}
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {loading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-2xl p-3.5 flex items-center gap-3 border border-gray-100/80">
                      <div className="w-12 h-12 rounded-xl bg-gray-200/60 animate-pulse shrink-0" />
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="w-3/4 h-4 bg-gray-200/60 rounded-md animate-pulse" />
                        <div className="w-1/2 h-3 bg-gray-200/40 rounded-md animate-pulse" />
                      </div>
                      <div className="w-16 h-6 bg-gray-200/60 rounded-full animate-pulse" />
                    </div>
                  ))}
                </>
              )}

              {!loading && recentReports.map((report, idx) => {
                const st = getStatusStyle(report.status);
                return (
                  <div
                    key={report.id}
                    onClick={() => navigate("/tracking", { state: { reportId: report.id } })}
                    className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80 flex items-center p-3.5 gap-3.5 active:scale-[0.98] cursor-pointer transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {report.image ? (
                        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${report.image}')` }} />
                      ) : (
                        <span className="material-symbols-outlined text-gray-300 text-[22px]">photo</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-[14px] font-bold text-gray-900 truncate capitalize">
                        {report.wasteType?.replace(/_/g, " ") || "Waste Report"}
                      </span>
                      <div className="flex items-center gap-1 text-gray-400">
                        <span className="material-symbols-outlined text-[13px]">location_on</span>
                        <span className="text-[12px] truncate font-medium">{report.address || "Location"}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-300">{timeAgo(report.createdAt)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text} border ${st.border}`}>
                          {st.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && reports.length === 0 && (
                <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-[32px] text-green-400">eco</span>
                  </div>
                  <p className="text-[15px] text-gray-700 font-bold">{t("noReportsYet")}</p>
                  <p className="text-[13px] text-gray-400 mt-1.5 max-w-[240px] mx-auto leading-relaxed">
                    {t("noReportsHint")}
                  </p>
                  <button
                    onClick={() => navigate("/report-waste")}
                    className="mt-5 inline-flex items-center gap-2 bg-green-600 text-white font-bold px-5 py-2.5 rounded-xl text-[13px] active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                    {t("reportNowShort")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer spacer */}
          <div className="h-2" />
        </div>
      </main>
      <BottomNav active="home" />
    </div>
  );
}
