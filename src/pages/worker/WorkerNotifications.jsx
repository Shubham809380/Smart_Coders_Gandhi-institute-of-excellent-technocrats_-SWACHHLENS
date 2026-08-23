import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { notificationService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const KIND_STYLE = {
  info: { icon: "campaign", cls: "bg-emerald-50 text-emerald-600" },
  status: { icon: "sync", cls: "bg-blue-50 text-blue-600" },
  success: { icon: "check_circle", cls: "bg-emerald-50 text-emerald-600" },
  warning: { icon: "warning", cls: "bg-amber-50 text-amber-600" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.max(1, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  const hrs = Math.round(diff / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function WorkerNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await notificationService.getNotifications().catch(() => []);
    setNotifications(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates + resilience poll while the socket is down.
  useLive(
    (evt) => { if (evt === "notification:new") load(); },
    ["notification:new"],
    { pollMs: 30000, poll: load },
  );

  // Opening the screen marks everything as read.
  useEffect(() => {
    const timer = setTimeout(() => { notificationService.markAllAsRead().catch(() => {}); }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="px-4 pt-[env(safe-area-inset-top)] flex items-center h-14">
          <button onClick={() => navigate(-1)} className="w-10 h-10 -ml-2 flex items-center justify-center rounded-xl active:bg-gray-100" aria-label="Back">
            <span className="material-symbols-outlined text-gray-700">arrow_back</span>
          </button>
          <h1 className="flex-1 text-center text-lg font-extrabold text-gray-900">Notifications</h1>
          <span className="w-8" />
        </div>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto px-4 pt-4 pb-8 flex flex-col gap-2.5">
        {loading && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 flex items-start gap-3 border border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="w-2/3 h-4 bg-gray-100 rounded-md animate-pulse" />
                  <div className="w-full h-3 bg-gray-100/70 rounded-md animate-pulse" />
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && notifications.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 mt-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[32px] text-emerald-600">notifications_off</span>
            </div>
            <p className="text-base font-extrabold text-gray-900">You're all caught up</p>
            <p className="text-sm text-gray-400 mt-1.5 max-w-[240px] mx-auto leading-relaxed">
              New waste reports and task updates will appear here instantly.
            </p>
          </div>
        )}

        {!loading && notifications.map((n, idx) => {
          const conf = KIND_STYLE[n.kind] || KIND_STYLE.info;
          return (
            <div
              key={n.id}
              style={{ animationDelay: `${idx * 40}ms`, animation: "toastIn 0.25s ease both" }}
              className={`bg-white rounded-2xl p-4 flex items-start gap-3 border cursor-default ${
                n.isRead ? "border-gray-100 opacity-80" : "border-emerald-200"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${conf.cls}`}>
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{conf.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-extrabold text-gray-900 truncate">{n.title}</p>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-green-600 shrink-0" />}
                </div>
                <p className="text-[12.5px] text-gray-500 font-medium leading-snug mt-0.5">{n.body}</p>
                <p className="text-[10.5px] text-gray-400 font-semibold mt-1.5">{timeAgo(n.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
