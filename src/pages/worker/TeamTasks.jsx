import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { reportService } from "../../services.js";

export default function TeamTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const reports = await reportService.getReports();
      const assigned = reports.filter((r) =>
        ["assigned", "en_route", "submitted"].includes(r.status)
      );
      setTasks(assigned.length > 0 ? assigned : reports.slice(0, 5));
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
    setLoading(false);
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-amber-500";
      default:
        return "bg-sky-400";
    }
  };

  const getSeverityBadge = (severity) => {
    const isHigh = severity === "high" || severity === "critical";
    return isHigh
      ? "bg-red-500 text-white"
      : severity === "medium"
        ? "bg-amber-500 text-white"
        : "bg-white/90 text-on-surface backdrop-blur-md";
  };

  const getVolumeLabel = (vol) => {
    switch (vol) {
      case "very_large":
        return "Very Large";
      case "large":
        return "Large";
      case "medium":
        return "Medium";
      default:
        return "Small";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">
            Loading tasks...
          </span>
        </div>
      </div>
    );
  }

  const highPriorityCount = tasks.filter(
    (t) => t.severity === "high" || t.severity === "critical"
  ).length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div
        className="sticky top-0 z-40"
        style={{
          backgroundColor: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div className="px-4 py-4 pt-safe flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00873a]/10 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-[#006b2c] text-[22px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              engineering
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-[18px] font-extrabold text-on-surface">
              Team Tasks
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className="w-2 h-2 rounded-full bg-primary animate-pulse"
                style={{
                  boxShadow: "0 0 6px rgba(0,107,44,0.5)",
                }}
              />
              <span className="text-[12px] font-bold text-on-surface-variant">
                {tasks.length} tasks assigned
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 mt-5 mb-6">
        <div className="bg-white rounded-2xl p-4 flex flex-col gap-1 shadow-sm border border-gray-100">
          <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
            Remaining Tasks
          </span>
          <span className="text-[28px] font-extrabold text-on-surface leading-none mt-1">
            {tasks.length}
          </span>
        </div>
        <div className="bg-white rounded-2xl p-4 flex flex-col gap-1 shadow-sm border border-gray-100">
          <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
            High Priority
          </span>
          <span className="text-[28px] font-extrabold text-red-500 leading-none mt-1">
            {highPriorityCount}
          </span>
        </div>
      </div>

      <div className="flex flex-col px-4 gap-5">
        {tasks.map((task) => {
          const isHigh =
            task.severity === "high" || task.severity === "critical";
          return (
            <div
              key={task.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col relative transition-all duration-200 hover:shadow-md"
            >
              <div
                className={`absolute left-0 top-0 bottom-0 w-1.5 ${getSeverityColor(task.severity)}`}
              />

              <div
                className={`relative w-full ${isHigh ? "h-44" : "h-36"}`}
              >
                {task.image ? (
                  <img
                    className="w-full h-full object-cover"
                    alt={task.wasteType}
                    src={task.image}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[36px] text-gray-300">
                      photo
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div
                  className={`absolute top-3 right-3 px-3 py-1.5 rounded-xl text-[11px] font-extrabold shadow-md flex items-center gap-1.5 ${getSeverityBadge(task.severity)}`}
                >
                  {isHigh && (
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      warning
                    </span>
                  )}
                  {isHigh
                    ? "HIGH PRIORITY"
                    : (task.severity?.toUpperCase() || "MEDIUM")}
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="text-[17px] font-extrabold text-white leading-tight drop-shadow-md">
                    {task.wasteType?.replace(/_/g, " ") || "Waste Report"}
                  </h3>
                  <p className="text-[12px] text-white/80 font-medium flex items-center gap-1 mt-1 drop-shadow-sm">
                    <span className="material-symbols-outlined text-[14px]">
                      location_on
                    </span>
                    {task.address || "Unknown location"}
                  </p>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <div className="bg-gray-50 rounded-2xl p-3.5 flex gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                      view_in_ar
                    </span>
                    <span className="text-[13px] font-bold text-on-surface">
                      {getVolumeLabel(task.estimatedVolume)}
                    </span>
                  </div>
                  <div className="w-px bg-gray-200" />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                      psychology
                    </span>
                    <span className="text-[13px] font-bold text-on-surface">
                      {task.aiConfidence || 0}% confidence
                    </span>
                  </div>
                </div>

                <button
                  onClick={() =>
                    navigate("/worker/task-in-progress", {
                      state: { report: task },
                    })
                  }
                  className={`w-full font-bold text-[14px] h-12 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    isHigh
                      ? "bg-primary text-white shadow-md"
                      : "bg-gray-100 text-on-surface hover:bg-gray-200"
                  }`}
                  style={
                    isHigh
                      ? { boxShadow: "0 6px 16px -4px rgba(0,107,44,0.3)" }
                      : {}
                  }
                >
                  <span className="material-symbols-outlined text-[20px]">
                    navigation
                  </span>
                  Start Task
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <WorkerBottomNav active="tasks" />
    </div>
  );
}
