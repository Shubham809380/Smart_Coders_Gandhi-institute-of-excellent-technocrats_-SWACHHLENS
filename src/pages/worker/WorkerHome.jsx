import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkerBottomNav from '../../components/WorkerBottomNav.jsx';
import { reportService, authService } from '../../services.js';

export default function WorkerHome() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    try {
      const reports = await reportService.getReports();
      setTasks(reports);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const completed = tasks.filter(t => t.status === 'resolved').length;
  const pending = tasks.filter(t => t.status === 'assigned' || t.status === 'submitted').length;
  const inProgress = tasks.filter(t => ['en_route', 'cleanup_in_progress'].includes(t.status)).length;

  const severityBar = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-amber-400';
      default: return 'bg-sky-400';
    }
  };

  const displayTasks = tasks.slice(0, 3);

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="relative w-full">
        <div className="flex flex-col gap-5 px-4 pt-safe pb-4">

          <div className="flex items-center justify-between pt-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-cyan-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-cyan-700 text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>engineering</span>
              </div>
              <h1 className="text-[18px] font-extrabold text-on-background">Worker Dashboard</h1>
            </div>
            <button
              onClick={() => navigate("/profile")}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
              style={{ background: "linear-gradient(135deg, #006b2c, #00a843)" }}
            >
              {authService.getSessionSnapshot().currentUser?.name?.charAt(0)?.toUpperCase() || "W"}
            </button>
          </div>

          <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #00687a, #0097a7)", boxShadow: "0 16px 32px -8px rgba(0,104,122,0.35)" }}>
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/[0.08] rounded-full" />
            <div className="absolute right-10 bottom-0 w-16 h-16 bg-white/[0.05] rounded-full" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
                <span className="text-[11px] font-extrabold text-white/80 tracking-[0.1em] uppercase">Active Shift</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <span className="text-[28px] font-extrabold text-white leading-none">{loading ? '—' : completed}</span>
                  <span className="text-[11px] text-white/60 mt-1.5 font-medium">Completed</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[28px] font-extrabold text-white leading-none">{loading ? '—' : pending}</span>
                  <span className="text-[11px] text-white/60 mt-1.5 font-medium">Pending</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[28px] font-extrabold text-white leading-none">{loading ? '—' : inProgress}</span>
                  <span className="text-[11px] text-white/60 mt-1.5 font-medium">In Progress</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('/worker/tasks')} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 items-start hover:shadow-md transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-700 text-[20px]">assignment</span>
              </div>
              <span className="text-[14px] font-bold text-on-surface">View Tasks</span>
            </button>
            <button onClick={() => navigate('/worker/map')} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3 items-start hover:shadow-md transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-cyan-700 text-[20px]">map</span>
              </div>
              <span className="text-[14px] font-bold text-on-surface">Area Map</span>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-on-background">Today's Tasks</h2>
              <button onClick={() => navigate('/worker/tasks')} className="text-[13px] font-bold text-primary flex items-center gap-0.5 hover:gap-1.5 transition-all duration-200">
                View All<span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>

            {displayTasks.length > 0 && displayTasks.map((task) => (
              <div key={task.id} onClick={() => navigate('/worker/task-in-progress', { state: { report: task } })} className="bg-white rounded-2xl shadow-sm border border-gray-100 flex overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md active:scale-[0.98]">
                <div className={`w-1.5 shrink-0 ${severityBar(task.severity)}`} />
                <div className="flex-1 flex items-center p-3.5 gap-3 min-w-0">
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[14px] font-bold text-on-surface truncate">{task.wasteType?.replace(/_/g, ' ') || 'Waste Report'}</span>
                    <div className="flex items-center gap-1 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[13px]">location_on</span>
                      <span className="text-[12px] truncate font-medium">{task.address || 'Unknown location'}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 ${
                    ['en_route', 'cleanup_in_progress'].includes(task.status)
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}>
                    {['en_route', 'cleanup_in_progress'].includes(task.status) ? 'Active' : 'Pending'}
                  </span>
                </div>
              </div>
            ))}

            {!loading && displayTasks.length === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
                <span className="material-symbols-outlined text-[40px] text-gray-300 block mb-3">inbox</span>
                <p className="text-[14px] text-gray-400 font-medium">No tasks assigned yet.</p>
              </div>
            )}
          </div>

        </div>
      </main>
      <WorkerBottomNav active="tasks" />
    </div>
  );
}
