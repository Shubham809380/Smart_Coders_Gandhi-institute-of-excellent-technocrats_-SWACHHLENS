import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService, authService } from "../../services.js";
import { haversineKm, timeSince } from "../../utils/helpers.js";

const severityColor = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-400", low: "bg-emerald-400" };
const statusLabel = { assigned: "New", en_route: "Accepted", cleanup_in_progress: "In Progress" };
const statusColor = { assigned: "bg-blue-100 text-blue-700 border-blue-200", en_route: "bg-amber-100 text-amber-700 border-amber-200", cleanup_in_progress: "bg-emerald-100 text-emerald-700 border-emerald-200" };
const volLabel = { small: "S", medium: "M", large: "L", very_large: "XL" };

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-4 animate-pulse">
      <div className="w-16 h-16 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </div>
    </div>
  );
}

export default function WorkerTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dutyStatus, setDutyStatus] = useState("off_duty");
  const [sortBy, setSortBy] = useState("priority");
  const [workerLoc, setWorkerLoc] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("");
  const touchStartY = useRef(0);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await workerService.getTasks();
      setTasks(data.tasks || []);
      setDutyStatus(data.dutyStatus || "off_duty");
      const snap = authService.getSessionSnapshot();
      setUserName(snap.currentUser?.name || "Worker");
    } catch (e) { console.error(e); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let settled = false;
    const timeoutId = setTimeout(function () {
      if (!settled) { settled = true; setWorkerLoc(null); }
    }, 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          setWorkerLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      },
      () => { if (!settled) { settled = true; clearTimeout(timeoutId); setWorkerLoc(null); } },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
    );
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 80 && containerRef.current?.scrollTop <= 0) onRefresh();
  };

  const assigned = tasks.filter((t) => t.status === "assigned").length;
  const inProgress = tasks.filter((t) => ["en_route", "cleanup_in_progress"].includes(t.status)).length;
  const completedToday = tasks.filter((t) => t.status === "resolved").length;

  const sorted = [...tasks].sort((a, b) => {
    if (sortBy === "priority") return (b.priorityScore || 0) - (a.priorityScore || 0);
    if (workerLoc && a.latitude && b.latitude) {
      return haversineKm(workerLoc, a) - haversineKm(workerLoc, b);
    }
    return 0;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24" ref={containerRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-3">
          <div className="flex items-center justify-between pt-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "linear-gradient(135deg, #006b2c, #00a843)" }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-gray-900">{userName}</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-2 h-2 rounded-full ${dutyStatus === "on_duty" ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                  <span className={`text-xs font-bold ${dutyStatus === "on_duty" ? "text-emerald-600" : "text-gray-400"}`}>
                    {dutyStatus === "on_duty" ? "On Duty" : "Off Duty"}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onRefresh} className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 active:bg-gray-200 transition-colors">
              <span className={`material-symbols-outlined text-gray-600 text-[22px] ${refreshing ? "animate-spin" : ""}`}>refresh</span>
            </button>
          </div>
        </div>
      </div>

      {dutyStatus === "off_duty" && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-amber-600">work_off</span>
          <span className="text-sm font-bold text-amber-800">You're off duty. Turn on to receive tasks.</span>
        </div>
      )}

      <div className="px-4 mt-4 flex gap-3 overflow-x-auto no-scrollbar">
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 min-w-[110px] flex flex-col items-center shrink-0">
          <span className="text-2xl font-extrabold text-orange-600">{assigned}</span>
          <span className="text-[11px] font-bold text-orange-500 mt-1">Assigned</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 min-w-[110px] flex flex-col items-center shrink-0">
          <span className="text-2xl font-extrabold text-blue-600">{inProgress}</span>
          <span className="text-[11px] font-bold text-blue-500 mt-1">In Progress</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 min-w-[110px] flex flex-col items-center shrink-0">
          <span className="text-2xl font-extrabold text-emerald-600">{completedToday}</span>
          <span className="text-[11px] font-bold text-emerald-500 mt-1">Completed</span>
        </div>
      </div>

      <div className="px-4 mt-4 flex gap-2">
        <button onClick={() => setSortBy("priority")} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${sortBy === "priority" ? "bg-green-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>
          Priority First
        </button>
        <button onClick={() => setSortBy("nearest")} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${sortBy === "nearest" ? "bg-green-600 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"}`}>
          Nearest First
        </button>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 mt-4">
            <span className="material-symbols-outlined text-[48px] text-gray-300 block mb-3">inbox</span>
            <p className="text-base font-bold text-gray-400">No tasks assigned</p>
            <p className="text-sm text-gray-300 mt-1">Ask your supervisor to assign tasks</p>
          </div>
        ) : (
          sorted.map((task) => {
            const dist = workerLoc && task.latitude ? haversineKm(workerLoc, task) : null;
            return (
              <div
                key={task.id}
                onClick={() => navigate(`/worker/tasks/${task.id}`, { state: { report: task } })}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className={`w-2 shrink-0 ${severityColor[task.severity] || "bg-gray-300"}`} />
                <div className="flex-1 flex items-center p-4 gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-100">
                    {task.image ? (
                      <img src={task.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-300">photo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-extrabold text-gray-900 truncate capitalize">
                        {(task.wasteType || "waste").replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${statusColor[task.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {statusLabel[task.status] || task.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400 mb-1">
                      <span className="material-symbols-outlined text-[13px]">location_on</span>
                      <span className="text-xs font-medium truncate">{task.address || "Unknown"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {dist !== null && (
                        <span className="text-[11px] font-bold text-gray-400 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">near_me</span>
                          {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-gray-300">•</span>
                      <span className="text-[11px] font-bold text-gray-400">{volLabel[task.estimatedVolume] || "M"}</span>
                      <span className="text-[11px] font-bold text-gray-300">•</span>
                      <span className="text-[11px] font-bold text-gray-400">{timeSince(task.createdAt)}</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 shrink-0">chevron_right</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <WorkerBottomNav active="tasks" />
    </div>
  );
}
