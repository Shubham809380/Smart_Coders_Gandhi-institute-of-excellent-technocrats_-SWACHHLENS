import { useNavigate, useLocation } from "react-router-dom";
import { authService } from "../services.js";

const navItems = [
  { key: "tasks", label: "Tasks", icon: "assignment", path: "/worker/home" },
  { key: "map", label: "Map", icon: "map", path: "/worker/map" },
  { key: "history", label: "History", icon: "history", path: "/worker/history" },
];

export default function WorkerBottomNav({ active }) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentActive = active || (() => {
    const path = location.pathname;
    if (path.includes("/worker/home")) return "tasks";
    if (path.includes("/worker/tasks")) return "tasks";
    if (path.includes("/worker/map")) return "map";
    if (path.includes("/worker/history")) return "history";
    if (path.includes("/worker/complete")) return "tasks";
    if (path.includes("/profile")) return "profile";
    return "";
  })();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-gray-100 pb-safe">
      <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = currentActive === item.key;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center gap-1 py-2 px-5 transition-all duration-200 group"
            >
              {isActive && (
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-green-600" />
              )}
              <span
                className={`material-symbols-outlined text-[26px] transition-all duration-200 ${isActive ? "text-green-600" : "text-gray-400 group-hover:text-gray-700"}`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className={`text-[11px] transition-all duration-200 ${isActive ? "text-gray-900 font-bold" : "text-gray-400 font-medium group-hover:text-gray-700"}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => navigate("/profile")}
          className="relative flex flex-col items-center justify-center gap-1 py-2 px-5 transition-all duration-200 group"
        >
          {currentActive === "profile" && (
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-green-600" />
          )}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: "linear-gradient(135deg, #006b2c, #00a843)" }}
          >
            {authService.getSessionSnapshot().currentUser?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className={`text-[11px] transition-all duration-200 ${currentActive === "profile" ? "text-gray-900 font-bold" : "text-gray-400 font-medium group-hover:text-gray-700"}`}>
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
}
