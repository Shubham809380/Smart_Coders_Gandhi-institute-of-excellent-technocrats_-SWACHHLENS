import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { workerService } from "../../services.js";
import { timeSince } from "../../utils/helpers.js";

function groupByDate(tasks) {
  const groups = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  for (const t of tasks) {
    const d = new Date(t.updatedAt || t.createdAt).toDateString();
    let label = d;
    if (d === today) label = "Today";
    else if (d === yesterday) label = "Yesterday";
    else label = new Date(t.updatedAt || t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(t);
  }
  return groups;
}

export default function WorkerHistory() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workerService.getHistory().then((t) => { setTasks(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const approved = tasks.filter((t) => t.status === "resolved").length;
  const rejected = tasks.filter((t) => t.status === "rejected").length;
  const rate = tasks.length > 0 ? Math.round((approved / tasks.length) * 100) : 0;
  const groups = groupByDate(tasks);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="px-4 pt-[env(safe-area-inset-top)] pb-3">
          <div className="flex items-center gap-3 pt-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-purple-600 text-[20px]">history</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-gray-900">History</h1>
              <span className="text-xs font-bold text-gray-400">{tasks.length} completed tasks</span>
            </div>
          </div>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="px-4 mt-4 flex gap-3">
          <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <span className="text-lg font-extrabold text-emerald-600">{approved}</span>
            <span className="text-[10px] font-bold text-emerald-500 block mt-0.5">Approved</span>
          </div>
          <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <span className="text-lg font-extrabold text-red-600">{rejected}</span>
            <span className="text-[10px] font-bold text-red-500 block mt-0.5">Rejected</span>
          </div>
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <span className="text-lg font-extrabold text-blue-600">{rate}%</span>
            <span className="text-[10px] font-bold text-blue-500 block mt-0.5">Approval Rate</span>
          </div>
        </div>
      )}

      <div className="px-4 mt-5">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-20 h-20 rounded-xl bg-gray-200" />
                  <div className="w-20 h-20 rounded-xl bg-gray-200" />
                  <div className="flex-1 flex flex-col gap-2 justify-center">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200 mt-4">
            <span className="material-symbols-outlined text-[48px] text-gray-300 block mb-3">history</span>
            <p className="text-base font-bold text-gray-400">No completed tasks yet</p>
            <p className="text-sm text-gray-300 mt-1">Your cleanup history will appear here</p>
          </div>
        ) : (
          Object.entries(groups).map(([dateLabel, items]) => (
            <div key={dateLabel} className="mb-6">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3 px-1">{dateLabel}</h3>
              <div className="flex flex-col gap-3">
                {items.map((task) => (
                  <div key={task.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${task.status === "rejected" ? "border-red-200" : "border-gray-100"}`}>
                    <div className="flex gap-3 p-4">
                      {task.image && (
                        <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 relative">
                          <img src={task.image} alt="Before" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-[8px] font-bold text-white text-center py-0.5">Before</span>
                        </div>
                      )}
                      {task.afterImage && (
                        <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 relative">
                          <img src={task.afterImage} alt="After" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 left-0 right-0 bg-emerald-600/80 text-[8px] font-bold text-white text-center py-0.5">After</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <span className="text-sm font-bold text-gray-900 capitalize truncate">{(task.wasteType || "waste").replace(/_/g, " ")}</span>
                        <span className="text-xs text-gray-400 truncate mt-0.5">{task.address || "Unknown"}</span>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${task.status === "resolved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {task.status === "resolved" ? "Approved" : "Rejected"}
                          </span>
                          <span className="text-[11px] text-gray-300">{timeSince(task.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    {task.status === "rejected" && task.rejectionReason && (
                      <div className="px-4 pb-4">
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="material-symbols-outlined text-red-500 text-[14px]">info</span>
                            <span className="text-[11px] font-bold text-red-600">Rejection Reason</span>
                          </div>
                          <p className="text-xs text-red-700 leading-relaxed">{task.rejectionReason}</p>
                          <button onClick={() => navigate(`/worker/tasks/${task.id}`, { state: { report: task } })} className="mt-2 h-9 px-4 rounded-lg bg-amber-500 text-white text-xs font-bold flex items-center gap-1 active:bg-amber-600 transition-colors">
                            <span className="material-symbols-outlined text-[14px]">refresh</span>
                            Redo Task
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <WorkerBottomNav active="history" />
    </div>
  );
}
