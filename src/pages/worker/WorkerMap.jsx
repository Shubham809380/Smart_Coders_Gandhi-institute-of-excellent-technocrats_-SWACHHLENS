import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService } from "../../services.js";

function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  return R * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2));
}

const pinColors = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#10b981" };
const pinColorsBg = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-400", low: "bg-emerald-500" };

export default function WorkerMap() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workerLoc, setWorkerLoc] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    workerService.getTasks().then((d) => { setTasks(d.tasks || []); setLoading(false); }).catch(() => setLoading(false));
    if (!navigator.geolocation) {
      setWorkerLoc(null);
      return;
    }
    let settled = false;
    const timeoutId = setTimeout(function () {
      if (!settled) { settled = true; setWorkerLoc(null); }
    }, 10000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          setWorkerLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          setWorkerLoc(null);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const getPinPosition = (task) => {
    if (!workerLoc || !task.latitude || !task.longitude) return null;
    const allLats = [workerLoc.latitude, ...tasks.map((t) => t.latitude).filter(Boolean)];
    const allLngs = [workerLoc.longitude, ...tasks.map((t) => t.longitude).filter(Boolean)];
    const minLat = Math.min(...allLats), maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs), maxLng = Math.max(...allLngs);
    const latRange = maxLat - minLat || 0.01;
    const lngRange = maxLng - minLng || 0.01;
    const pad = 12;
    const x = pad + ((task.longitude - minLng) / lngRange) * (100 - 2 * pad);
    const y = pad + ((maxLat - task.latitude) / latRange) * (100 - 2 * pad);
    return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-3">
          <div className="flex items-center gap-3 pt-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 text-[20px]">map</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-gray-900">Task Map</h1>
              <span className="text-xs font-bold text-gray-400">{tasks.length} assigned tasks</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-200 bg-gradient-to-br from-emerald-50 via-blue-50 to-gray-100 relative" ref={mapRef} style={{ minHeight: "50vh" }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        {!workerLoc && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-blue-50 to-gray-100 z-30">
            <div className="w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm mb-3">
              <span className="material-symbols-outlined text-blue-500 text-[28px]">location_off</span>
            </div>
            <p className="text-sm font-bold text-gray-700 mb-1">Location unavailable</p>
            <p className="text-xs text-gray-400 text-center px-8 mb-4">Enable location access in your browser settings to see your position on the map</p>
            <button
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setWorkerLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                    () => setWorkerLoc(null),
                    { enableHighAccuracy: true, timeout: 8000 }
                  );
                }
              }}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        )}

        {workerLoc && (
          <div className="absolute z-20" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
            <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg">
              <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-40" />
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">You</div>
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-gray-300 mb-2">map_off</span>
            <span className="text-sm font-bold text-gray-400">No tasks to show</span>
          </div>
        )}

        {tasks.map((task) => {
          const pos = getPinPosition(task);
          if (!pos) return null;
          const dist = workerLoc && task.latitude ? haversineKm(workerLoc, task) : null;
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-all active:scale-125"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className={`w-8 h-8 rounded-full ${pinColorsBg[task.severity] || "bg-gray-400"} flex items-center justify-center shadow-lg border-2 border-white`}>
                <span className="text-white text-[10px] font-extrabold">{(task.wasteType || "?").charAt(0).toUpperCase()}</span>
              </div>
              {selectedTask?.id === task.id && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white border-r border-b border-gray-200" />
              )}
            </button>
          );
        })}
      </div>

      {selectedTask && (
        <div className="fixed bottom-20 left-4 right-4 z-30 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl ${pinColorsBg[selectedTask.severity] || "bg-gray-400"} flex items-center justify-center shrink-0`}>
              <span className="material-symbols-outlined text-white text-[20px]">delete</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-extrabold text-gray-900 capitalize block">{(selectedTask.wasteType || "waste").replace(/_/g, " ")}</span>
              <span className="text-xs text-gray-500 truncate block mt-0.5">{selectedTask.address || "Unknown"}</span>
              <div className="flex items-center gap-2 mt-1">
                {workerLoc && selectedTask.latitude && (
                  <span className="text-[11px] font-bold text-gray-400 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px]">near_me</span>
                    {haversineKm(workerLoc, selectedTask).toFixed(1)}km
                  </span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedTask.severity === "critical" ? "bg-red-100 text-red-600" : selectedTask.severity === "high" ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-600"}`}>
                  {(selectedTask.severity || "medium").toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => navigate(`/worker/tasks/${selectedTask.id}`, { state: { report: selectedTask } })} className="w-full h-12 mt-3 rounded-xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
            <span className="material-symbols-outlined text-[18px]">navigation</span>
            Go to Task
          </button>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <WorkerBottomNav active="map" />
    </div>
  );
}
