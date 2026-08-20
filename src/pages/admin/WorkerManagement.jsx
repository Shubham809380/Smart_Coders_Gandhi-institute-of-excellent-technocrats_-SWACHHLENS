import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import { adminService } from "../../services.js";

export default function WorkerManagement() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const data = await adminService.getWorkerStats();
      setWorkers(data || []);
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    }
    setLoading(false);
  };

  const totalWorkers = workers.length;
  const activeWorkers = workers.filter((w) => (w.activeTasks || 0) > 0).length;
  const completedToday = workers.reduce((sum, w) => sum + (w.completedTasks || 0), 0);

  const filtered = workers.filter((w) => {
    const q = search.toLowerCase();
    return (
      (w.name || "").toLowerCase().includes(q) ||
      (w.email || "").toLowerCase().includes(q)
    );
  });

  const getStatus = (worker) => {
    if ((worker.activeTasks || 0) > 0) return { label: "Active", dot: "bg-green-500", text: "text-green-600" };
    if ((worker.completedTasks || 0) > 0) return { label: "Idle", dot: "bg-yellow-500", text: "text-yellow-600" };
    return { label: "Offline", dot: "bg-gray-400", text: "text-gray-500" };
  };

  const getInitial = (name) => {
    return (name || "?").charAt(0).toUpperCase();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading workers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="workers" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-extrabold text-on-surface tracking-tight">Worker Management</h1>
            <p className="text-[15px] text-on-surface-variant max-w-2xl">
              {totalWorkers} worker{totalWorkers !== 1 ? "s" : ""} in the system
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">groups</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-on-surface leading-none">{totalWorkers}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Total Workers</span>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-green-600 text-[22px]">person_check</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-green-600 leading-none">{activeWorkers}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Active Now</span>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-blue-600 text-[22px]">task_alt</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-blue-600 leading-none">{completedToday}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Tasks Completed</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-11 pr-4 py-3 bg-surface rounded-2xl border border-black/[0.06] text-[14px] text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Worker List */}
        {filtered.length === 0 ? (
          <div className="bg-surface rounded-3xl border border-dashed border-outline-variant/60 p-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant text-[32px]">group_off</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[15px] font-bold text-on-surface">No workers found</span>
              <span className="text-[13px] text-on-surface-variant">
                {search ? "Try a different search term." : "There are no workers in the system yet."}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((worker) => {
              const status = getStatus(worker);
              return (
                <div
                  key={worker._id || worker.id}
                  className="bg-surface rounded-3xl p-5 border border-black/[0.03] shadow-sm hover:shadow-md transition-all flex flex-col gap-4"
                >
                  {/* Top Row: Avatar + Name + Status */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[16px] shrink-0"
                      style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
                    >
                      {getInitial(worker.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-on-surface truncate">{worker.name || "Unnamed"}</span>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
                      </div>
                      <span className="text-[12px] text-on-surface-variant truncate block">{worker.email || "No email"}</span>
                    </div>
                  </div>

                  {/* Status + Role */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${status.text}`}>
                      {status.label}
                    </span>
                    {worker.role && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-primary/10 text-primary">
                        {worker.role.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-green-600 text-[18px]">pending</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.activeTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Active</span>
                    </div>
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-blue-600 text-[18px]">check_circle</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.completedTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Done</span>
                    </div>
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">format_list_numbered</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.totalTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total</span>
                    </div>
                  </div>

                  {/* Join Date */}
                  <div className="flex items-center gap-2 pt-1 border-t border-black/[0.04]">
                    <span className="material-symbols-outlined text-on-surface-variant text-[15px]">calendar_today</span>
                    <span className="text-[12px] text-on-surface-variant">
                      Joined {formatDate(worker.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
