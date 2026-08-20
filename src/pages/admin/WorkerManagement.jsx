import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import { adminService, teamService } from "../../services.js";
import { useTheme } from "../../contexts/ThemeContext.jsx";

export default function WorkerManagement() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [workers, setWorkers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dutyToggling, setDutyToggling] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [workerData, teamData] = await Promise.all([
        adminService.getWorkerStats().catch(() => []),
        teamService.getTeams().catch(() => []),
      ]);
      setWorkers(workerData || []);
      setTeams(teamData || []);
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    }
    setLoading(false);
  };

  const handleDutyToggle = async (worker, e) => {
    e.stopPropagation();
    const newStatus = worker.dutyStatus === "on_duty" ? "off_duty" : "on_duty";
    setDutyToggling(worker.uid);
    try {
      await adminService.toggleWorkerDuty(worker.uid, newStatus);
      setWorkers(prev => prev.map(w => w.uid === worker.uid ? { ...w, dutyStatus: newStatus } : w));
    } catch (err) {
      console.error("Failed to toggle duty:", err);
    }
    setDutyToggling(null);
  };

  const totalWorkers = workers.length;
  const onDutyWorkers = workers.filter((w) => w.dutyStatus === "on_duty").length;
  const totalCompleted = workers.reduce((sum, w) => sum + (w.completedTasks || 0), 0);
  const totalActive = workers.reduce((sum, w) => sum + (w.activeTasks || 0), 0);

  const filtered = workers.filter((w) => {
    const q = search.toLowerCase();
    return (
      (w.name || "").toLowerCase().includes(q) ||
      (w.email || "").toLowerCase().includes(q) ||
      (w.teamName || "").toLowerCase().includes(q) ||
      (w.wardId || "").toLowerCase().includes(q)
    );
  });

  const getDutyLabel = (worker) => {
    return worker.dutyStatus === "on_duty" ? "On Duty" : "Off Duty";
  };

  const getDutyStyle = (worker) => {
    return worker.dutyStatus === "on_duty"
      ? { dot: "bg-green-500", text: "text-green-600", bg: "bg-green-500/10" }
      : { dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-400/10" };
  };

  const getInitial = (name) => (name || "?").charAt(0).toUpperCase();

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
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
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2.5 bg-surface rounded-xl border border-black/[0.06] hover:bg-surface-container transition-colors text-[13px] font-bold text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">groups</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-on-surface leading-none">{totalWorkers}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Total</span>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-green-600 text-[22px]">person_check</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-green-600 leading-none">{onDutyWorkers}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">On Duty</span>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-amber-600 text-[22px]">pending</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-amber-600 leading-none">{totalActive}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Active Tasks</span>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-5 flex items-center gap-4 border border-black/[0.03] shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-blue-600 text-[22px]">task_alt</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[28px] font-extrabold text-blue-600 leading-none">{totalCompleted}</span>
              <span className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Completed</span>
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
              placeholder="Search by name, email, team, or ward..."
              className="w-full pl-11 pr-4 py-3 bg-surface rounded-2xl border border-black/[0.06] text-[14px] text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">close</span>
              </button>
            )}
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
              const dutyStyle = getDutyStyle(worker);
              return (
                <div
                  key={worker.uid}
                  className="bg-surface rounded-3xl p-5 border border-black/[0.03] shadow-sm hover:shadow-md transition-all flex flex-col gap-4"
                >
                  {/* Top Row: Avatar + Name + Duty Toggle */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[16px] shrink-0"
                      style={{ background: worker.dutyStatus === "on_duty" ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #6b7280, #4b5563)" }}
                    >
                      {getInitial(worker.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-on-surface truncate">{worker.name || "Unnamed"}</span>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dutyStyle.dot}`} />
                      </div>
                      <span className="text-[12px] text-on-surface-variant truncate block">{worker.email || "No email"}</span>
                    </div>
                    {/* Duty Toggle */}
                    <button
                      onClick={(e) => handleDutyToggle(worker, e)}
                      disabled={dutyToggling === worker.uid}
                      className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 shrink-0"
                      style={{
                        background: worker.dutyStatus === "on_duty" ? '#22c55e' : (isDark ? '#2a3550' : '#D1D5DB'),
                        opacity: dutyToggling === worker.uid ? 0.5 : 1,
                      }}
                      title={worker.dutyStatus === "on_duty" ? "Set Off Duty" : "Set On Duty"}
                    >
                      <span
                        className="inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-200"
                        style={{ transform: worker.dutyStatus === "on_duty" ? 'translateX(30px)' : 'translateX(4px)' }}
                      />
                    </button>
                  </div>

                  {/* Status + Role + Team */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${dutyStyle.bg} ${dutyStyle.text}`}>
                      {getDutyLabel(worker)}
                    </span>
                    {worker.role && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-primary/10 text-primary">
                        {worker.role.replace(/_/g, " ")}
                      </span>
                    )}
                    {worker.teamName && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-cyan-50 text-cyan-600 border border-cyan-200">
                        {worker.teamName}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-amber-600 text-[18px]">pending</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.activeTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Active</span>
                    </div>
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-green-600 text-[18px]">check_circle</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.completedTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Done</span>
                    </div>
                    <div className="bg-surface-container rounded-2xl p-3 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">format_list_numbered</span>
                      <span className="text-[18px] font-extrabold text-on-surface leading-none">{worker.totalTasks || 0}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total</span>
                    </div>
                  </div>

                  {/* Ward + Join Date */}
                  <div className="flex items-center justify-between pt-1 border-t border-black/[0.04]">
                    <div className="flex items-center gap-2">
                      {worker.wardId && (
                        <>
                          <span className="material-symbols-outlined text-on-surface-variant text-[15px]">location_on</span>
                          <span className="text-[12px] text-on-surface-variant">{worker.wardId}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-[15px]">calendar_today</span>
                      <span className="text-[12px] text-on-surface-variant">
                        Joined {formatDate(worker.createdAt)}
                      </span>
                    </div>
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
