import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { notificationService } from "../services.js";
import { useLive } from "../hooks/useLive.js";
import { useLanguage } from "../contexts/LanguageContext.jsx";

export default function BottomNav({ active }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [notifCount, setNotifCount] = useState(0);

  const refreshCount = useCallback(() => {
    notificationService.getNotifications()
      .then((n) => setNotifCount(n.filter((x) => !x.isRead).length))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  // Keep the badge live: new notifications increment, opening the
  // notifications screen clears it.
  useLive(
    (evt) => {
      if (evt === "notification:new") refreshCount();
    },
    ["notification:new"],
    { pollMs: 45000, poll: refreshCount }
  );

  const navItems = [
    { key: "home", label: t("navHome"), icon: "home", path: "/home" },
    { key: "explore", label: t("navExplore"), icon: "explore", path: "/explore" },
    { key: "report", label: t("navReport"), icon: "photo_camera", path: "/report-waste" },
    { key: "reports", label: t("navReports"), icon: "assignment", path: "/my-reports" },
  ];

  const currentActive = active || (() => {
    const path = location.pathname;
    if (path === "/home") return "home";
    if (path === "/notifications") return "home";
    if (path === "/explore") return "explore";
    if (path === "/report-waste") return "report";
    if (path === "/my-reports") return "reports";
    if (path === "/success") return "reports";
    if (path === "/profile") return "profile";
    return "";
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-100/80 pb-safe">
      <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = currentActive === item.key;

          if (item.key === "report") {
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className="relative -mt-6 flex flex-col items-center justify-center group"
              >
                <div
                  className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-white transition-all duration-300 group-active:scale-90 group-hover:shadow-xl group-hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #006b2c, #00a843)",
                    boxShadow: "0 6px 20px -2px rgba(0,107,44,0.4), 0 2px 8px -2px rgba(0,107,44,0.2)",
                  }}
                >
                  <span className="material-symbols-outlined text-[26px]">
                    {item.icon}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-gray-500 mt-1">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center gap-1 py-2 px-4 transition-all duration-200 group"
            >
              {isActive && (
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full bg-green-600" />
              )}
              <div className="relative">
                <span
                  className={`material-symbols-outlined text-[24px] transition-all duration-200 ${
                    isActive ? "text-green-600" : "text-gray-500 group-hover:text-gray-900"
                  }`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.key === "reports" && notifCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center ring-1.5 ring-white">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] transition-all duration-200 ${
                  isActive ? "text-gray-900 font-bold" : "text-gray-500 font-medium group-hover:text-gray-900"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => navigate("/profile")}
          className="relative flex flex-col items-center justify-center gap-1 py-2 px-4 transition-all duration-200 group"
        >
          {currentActive === "profile" && (
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full bg-green-600" />
          )}
          <span
            className={`material-symbols-outlined text-[24px] transition-all duration-200 ${
              currentActive === "profile" ? "text-green-600" : "text-gray-500 group-hover:text-gray-900"
            }`}
            style={{ fontVariationSettings: currentActive === "profile" ? "'FILL' 1" : "'FILL' 0" }}
            aria-hidden="true"
          >
            account_circle
          </span>
          <span
            className={`text-[10px] transition-all duration-200 ${
              currentActive === "profile"
                ? "text-gray-900 font-bold"
                : "text-gray-500 font-medium group-hover:text-gray-900"
            }`}
          >
            {t("navProfile")}
          </span>
        </button>
      </div>
    </nav>
  );
}
