import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar.jsx';
import { adminService } from '../../services.js';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try { const data = await adminService.getDashboard(); setDashboard(data); }
    catch (err) { console.error("Dashboard fetch failed:", err); }
    setLoading(false);
  };

  const d = dashboard || {};
  const urgent = (d.aiPriorityQueue || []).filter(r => r.severity === 'critical' || r.severity === 'high');

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-extrabold text-on-surface tracking-tight">Operations Command Center</h1>
            <p className="text-[15px] text-on-surface-variant max-w-2xl">Real-time overview of municipal waste management operations.</p>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-surface rounded-xl border border-black/[0.04]">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-widest">Live Sync Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8 flex flex-col gap-8">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 bg-surface rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden border border-black/[0.03] shadow-sm">
                <div className="absolute -right-8 -bottom-8 w-28 h-28 bg-primary/[0.04] rounded-full blur-2xl" />
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-[20px]">report_problem</span>
                  </div>
                  <span className="text-[13px] font-bold text-on-surface-variant">Open Complaints</span>
                </div>
                <span className="text-[36px] font-extrabold text-on-surface leading-none relative z-10">{d.openComplaints || 0}</span>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-3xl p-4 flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                  <span className="text-[28px] font-extrabold text-red-600 block leading-none mb-1">{d.criticalComplaints || 0}</span>
                  <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">Critical</span>
                </div>
              </div>
              <div className="bg-[#57dffe]/15 border border-[#57dffe]/30 rounded-3xl p-4 flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                  <span className="text-[28px] font-extrabold text-[#00687a] block leading-none mb-1">{d.resolvedToday || 0}</span>
                  <span className="text-[11px] font-bold text-[#00687a]/70 uppercase tracking-wider">Resolved Today</span>
                </div>
              </div>
              <div className="bg-surface rounded-3xl p-4 flex flex-col justify-between relative overflow-hidden border border-black/[0.03]">
                <div className="relative z-10">
                  <span className="text-[28px] font-extrabold text-on-surface block leading-none mb-1">{d.availableTeams || 0}</span>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Teams Available</span>
                </div>
              </div>
              <div className="bg-surface rounded-3xl p-4 flex flex-col justify-between relative overflow-hidden border border-black/[0.03]">
                <div className="relative z-10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[28px] font-extrabold text-on-surface leading-none mb-1">3.4</span>
                    <span className="text-[14px] font-bold text-on-surface-variant">hrs</span>
                  </div>
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Avg Resolution</span>
                </div>
              </div>
            </div>

            {/* Urgent Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-extrabold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
                  Requires Immediate Attention
                </h2>
                <button onClick={() => navigate('/admin/ai-priority-queue')} className="text-[13px] font-bold text-primary hover:text-primary-container transition-colors">View All</button>
              </div>

              <div className="flex flex-col gap-2.5">
                {urgent.length === 0 && (
                  <div className="bg-surface rounded-2xl p-6 text-center text-on-surface-variant border border-dashed border-outline-variant/60">No urgent complaints</div>
                )}
                {urgent.slice(0, 3).map((report) => (
                  <div key={report.id} className="bg-surface rounded-2xl p-3.5 flex items-center gap-3.5 hover:shadow-md transition-all cursor-pointer group border border-black/[0.03] shadow-sm" onClick={() => navigate('/admin/smart-dispatch', { state: { reportId: report.id } })}>
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 relative bg-surface-container flex items-center justify-center border border-black/[0.04]">
                      {report.image ? <div className="bg-cover bg-center w-full h-full" style={{ backgroundImage: `url('${report.image}')` }} /> : <span className="material-symbols-outlined text-on-surface-variant text-[22px]">photo</span>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${report.severity === 'critical' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{report.severity}</span>
                        <span className="text-[11px] font-medium text-on-surface-variant truncate">ID: {report.id}</span>
                      </div>
                      <h3 className="text-[15px] font-bold text-on-surface truncate">{report.wasteType?.replace(/_/g, ' ')}</h3>
                      <p className="text-[12px] text-on-surface-variant truncate flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[13px]">location_on</span>{report.address}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm shrink-0">
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Priority Queue Sidebar */}
          <div className="lg:col-span-4 flex flex-col h-full min-h-[300px] lg:min-h-[600px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-extrabold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-600 text-[20px]">explore</span> AI Priority Queue
              </h2>
              <button onClick={() => navigate('/admin/ai-priority-queue')} className="text-[13px] font-bold text-primary">View All</button>
            </div>
            <div className="flex-1 w-full bg-surface rounded-3xl overflow-hidden border border-black/[0.03] shadow-sm p-4 flex flex-col gap-2.5">
              {(d.aiPriorityQueue || []).slice(0, 5).map((item) => (
                <div key={item.id} className="bg-surface-container-low rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-container transition-colors border border-black/[0.02]" onClick={() => navigate('/admin/smart-dispatch', { state: { reportId: item.id } })}>
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-surface-container-high flex items-center justify-center border border-black/[0.04]">
                    {item.image ? <div className="bg-cover bg-center w-full h-full" style={{ backgroundImage: `url('${item.image}')` }} /> : <span className="material-symbols-outlined text-on-surface-variant text-[18px]">photo</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-bold text-on-surface truncate block">{item.wasteType?.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-on-surface-variant truncate block mt-0.5">{item.address}</span>
                  </div>
                  <span className={`text-[14px] font-extrabold ${item.priorityScore >= 90 ? 'text-red-500' : item.priorityScore >= 75 ? 'text-amber-500' : 'text-primary'}`}>{item.priorityScore}</span>
                </div>
              ))}
              {(!d.aiPriorityQueue || d.aiPriorityQueue.length === 0) && (
                <div className="flex-1 flex items-center justify-center text-on-surface-variant text-[13px]">No pending reports</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
