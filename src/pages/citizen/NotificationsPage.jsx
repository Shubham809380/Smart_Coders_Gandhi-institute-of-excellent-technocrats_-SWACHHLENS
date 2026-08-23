import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../../components/BottomNav.jsx";
import { notificationService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";
import { useLanguage } from "../../contexts/LanguageContext.jsx";

const KIND_ICONS = {
  info: { icon: "notifications", cls: "bg-surface-container-high text-on-surface-variant" },
  status_update: { icon: "sync", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  task_assigned: { icon: "assignment", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  feedback_request: { icon: "star", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  escalation: { icon: "warning", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.round(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await notificationService.getNotifications().catch(() => []);
    setNotifications(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates + resilience poll while the socket is down.
  useLive(
    (evt) => {
      if (evt === "notification:new") load();
    },
    ["notification:new"],
    { pollMs: 30000, poll: load }
  );

  // Opening the screen marks everything as read.
  useEffect(() => {
    const timer = setTimeout(async () => {
      await notificationService.markAllAsRead();
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleOpen = (n) => {
    if (n.reportId) navigate("/tracking", { state: { reportId: n.reportId } });
  };

  return (
    <div className="bg-background min-h-screen max-w-lg mx-auto pb-24">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-xl border-b border-outline-variant/40 pt-safe">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 -ml-2 flex items-center justify-center rounded-xl active:bg-surface-container-high transition-all"
            aria-label={t("close")}
          >
            <span className="material-symbols-outlined text-[22px] text-on-surface">arrow_back</span>
          </button>
          <h1 className="text-[17px] font-extrabold text-on-surface tracking-tight">{t("notificationsTitle")}</h1>
        </div>
      </header>

      <main className="px-4 pt-4 flex flex-col gap-2.5">
        {loading && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface rounded-2xl p-4 flex items-start gap-3 border border-outline-variant/30">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high animate-pulse shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="w-2/3 h-4 bg-surface-container-high rounded-md animate-pulse" />
                  <div className="w-full h-3 bg-surface-container-high/60 rounded-md animate-pulse" />
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && notifications.length === 0 && (
          <div className="bg-surface rounded-2xl p-10 text-center border border-dashed border-outline-variant/50 mt-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[32px] text-primary">notifications_off</span>
            </div>
            <p className="text-[15px] text-on-surface font-bold">{t("noNotifications")}</p>
            <p className="text-[13px] text-on-surface-variant mt-1.5 max-w-[240px] mx-auto leading-relaxed">
              {t("noNotificationsHint")}
            </p>
          </div>
        )}

        {!loading && notifications.map((n, idx) => {
          const conf = KIND_ICONS[n.kind] || KIND_ICONS.info;
          return (
            <div
              key={n.id}
              onClick={() => handleOpen(n)}
              style={{ animationDelay: `${idx * 40}ms` }}
              className={`bg-surface rounded-2xl p-4 flex items-start gap-3 border cursor-pointer transition-all duration-200 active:scale-[0.98] hover:shadow-lg ${
                n.isRead ? "border-outline-variant/30 opacity-80" : "border-primary/30 shadow-[0_2px_10px_rgba(0,107,44,0.08)]"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${conf.cls}`}>
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {conf.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-bold text-on-surface truncate">{n.title}</p>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-[12.5px] text-on-surface-variant font-medium leading-snug mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-[10.5px] text-on-surface-variant/70 font-semibold mt-1.5">{timeAgo(n.createdAt)}</p>
              </div>
              {n.reportId && (
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50 shrink-0 mt-1">chevron_right</span>
              )}
            </div>
          );
        })}
      </main>
      <BottomNav />
    </div>
  );
}
