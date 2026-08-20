import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar.jsx';
import { adminService, reportService } from '../../services.js';

const STATUS_OPTIONS = ['All', 'Submitted', 'AI Analyzed', 'Under Review', 'Assigned', 'En Route', 'In Progress', 'Resolved'];
const SEVERITY_OPTIONS = ['All', 'Critical', 'High', 'Medium', 'Low'];

const STATUS_COLORS = {
  submitted: 'bg-blue-50 text-blue-600 border border-blue-200',
  ai_analyzed: 'bg-purple-50 text-purple-600 border border-purple-200',
  under_review: 'bg-amber-50 text-amber-600 border border-amber-200',
  assigned: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
  en_route: 'bg-cyan-50 text-cyan-600 border border-cyan-200',
  in_progress: 'bg-orange-50 text-orange-600 border border-orange-200',
  resolved: 'bg-green-50 text-green-600 border border-green-200',
};

const SEVERITY_COLORS = {
  critical: 'text-red-500',
  high: 'text-red-400',
  medium: 'text-amber-500',
  low: 'text-green-500',
};

function timeSince(isoString) {
  if (!isoString) return '—';
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ScoreCircle({ score }) {
  const dashArray = `${score}, 100`;
  const strokeColor = score >= 90 ? 'text-red-500' : score >= 75 ? 'text-amber-500' : 'text-primary';
  return (
    <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
      <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path className="text-surface-container-highest" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray="100, 100" strokeWidth="3" />
        <path className={strokeColor} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={dashArray} strokeWidth="3" style={{ transition: 'stroke-dasharray 1s ease-in-out' }} />
      </svg>
      <span className={`text-[12px] font-extrabold ${strokeColor} leading-none`}>{score ?? '—'}</span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-surface rounded-2xl p-4 flex items-center gap-4 border border-black/[0.03] shadow-sm animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-surface-container-highest shrink-0" />
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="h-3.5 bg-surface-container-highest rounded-lg w-1/3" />
        <div className="h-3 bg-surface-container-highest rounded-lg w-2/5" />
      </div>
      <div className="w-16 h-5 bg-surface-container-highest rounded-lg shrink-0 hidden sm:block" />
      <div className="w-11 h-11 rounded-full bg-surface-container-highest shrink-0 hidden md:block" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl p-4 flex flex-col gap-3 border border-black/[0.03] shadow-sm animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-surface-container-highest shrink-0" />
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="h-3.5 bg-surface-container-highest rounded-lg w-2/3" />
          <div className="h-3 bg-surface-container-highest rounded-lg w-3/5" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-14 h-5 bg-surface-container-highest rounded-lg" />
        <div className="w-10 h-5 bg-surface-container-highest rounded-lg" />
        <div className="w-16 h-5 bg-surface-container-highest rounded-lg" />
      </div>
    </div>
  );
}

export default function ComplaintQueue() {
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchComplaints = async (overrides = {}) => {
    setLoading(true);
    try {
      const filters = {};
      const s = overrides.status !== undefined ? overrides.status : statusFilter;
      const sv = overrides.severity !== undefined ? overrides.severity : severityFilter;
      const q = overrides.search !== undefined ? overrides.search : search;
      if (s && s !== 'All') filters.status = s.toLowerCase().replace(/\s+/g, '_');
      if (sv && sv !== 'All') filters.severity = sv.toLowerCase();
      if (q && q.trim()) filters.search = q.trim();
      const data = await adminService.getComplaints(filters);
      setComplaints(data.complaints || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch complaints:', err);
      setComplaints([]);
      setTotal(0);
    }
    setLoading(false);
  };

  useEffect(() => { fetchComplaints(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchComplaints({ search }); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => { fetchComplaints({ status: statusFilter }); }, [statusFilter]);
  useEffect(() => { fetchComplaints({ severity: severityFilter }); }, [severityFilter]);

  const handleRowClick = (report) => {
    navigate(`/admin/complaints/${report.id}`, { state: { report } });
  };

  const formatVolume = (vol) => {
    if (!vol) return '—';
    const map = { small: 'S', medium: 'M', large: 'L', extra_large: 'XL' };
    return map[vol?.toLowerCase()] || vol?.replace(/_/g, ' ').toUpperCase().slice(0, 2) || '—';
  };

  const formatStatus = (status) => {
    if (!status) return '—';
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="complaints" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        <div className="max-w-[900px] mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-extrabold text-on-surface tracking-tight">Complaint Queue</h1>
              {!loading && (
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[13px] font-extrabold">{total}</span>
              )}
            </div>
            <p className="text-[14px] text-on-surface-variant">All complaints across the city in one place.</p>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by location or complaint ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-surface rounded-2xl border border-black/[0.06] text-[14px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {search && (
              <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="mb-5">
            <span className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2 block">Status</span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {STATUS_OPTIONS.map((opt) => {
                const isActive = statusFilter === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setStatusFilter(opt)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-surface text-on-surface-variant border-black/[0.06] hover:bg-surface-container hover:border-black/[0.1]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-5">
            <span className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2 block">Severity</span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {SEVERITY_OPTIONS.map((opt) => {
                const isActive = severityFilter === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setSeverityFilter(opt)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all border whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-surface text-on-surface-variant border-black/[0.06] hover:bg-surface-container hover:border-black/[0.1]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex flex-col gap-2.5">
              <div className="hidden md:flex flex-col gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </div>
              <div className="md:hidden flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </div>
          ) : complaints.length === 0 ? (
            <div className="bg-surface rounded-3xl p-12 text-center border border-dashed border-outline-variant/60 flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant/30 text-[48px]">search_off</span>
              <p className="text-[15px] font-bold text-on-surface-variant">No complaints match your filters</p>
              <p className="text-[13px] text-on-surface-variant/70">Try adjusting your search or filter criteria.</p>
              <button onClick={() => { setSearch(''); setStatusFilter('All'); setSeverityFilter('All'); }} className="mt-2 px-4 py-2 bg-primary text-white rounded-xl text-[13px] font-bold shadow-sm hover:opacity-90 transition-opacity">
                Clear All Filters
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:flex flex-col gap-2">
                {complaints.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => handleRowClick(report)}
                    className="bg-surface rounded-2xl p-3.5 flex items-center gap-4 border border-black/[0.03] shadow-sm hover:shadow-md hover:bg-surface-container-low transition-all cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-surface-container flex items-center justify-center border border-black/[0.04]">
                      {report.image
                        ? <div className="bg-cover bg-center w-full h-full" style={{ backgroundImage: `url('${report.image}')` }} />
                        : <span className="material-symbols-outlined text-on-surface-variant text-[20px]">photo</span>
                      }
                    </div>

                    {/* Waste Type + Location */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-bold text-on-surface truncate">{report.wasteType?.replace(/_/g, ' ') || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[13px]">location_on</span>
                        <span className="text-[12px] truncate">{report.address || 'No location'}</span>
                      </div>
                    </div>

                    {/* Volume Badge */}
                    <span className="shrink-0 px-2.5 py-1 bg-surface-container rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant hidden lg:flex">
                      {formatVolume(report.estimatedVolume)}
                    </span>

                    {/* Time */}
                    <span className="shrink-0 text-[12px] text-on-surface-variant font-medium w-16 text-right hidden lg:block">
                      {timeSince(report.createdAt || report.timestamp)}
                    </span>

                    {/* Status Badge */}
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider hidden sm:flex ${STATUS_COLORS[report.status] || 'bg-surface-container text-on-surface-variant'}`}>
                      {formatStatus(report.status)}
                    </span>

                    {/* Assigned Team */}
                    <span className="shrink-0 text-[12px] text-on-surface-variant font-medium w-24 truncate hidden lg:block text-right">
                      {report.assignedTeamName || report.teamName || <span className="text-on-surface-variant/40">Unassigned</span>}
                    </span>

                    {/* Priority Score */}
                    <ScoreCircle score={report.priorityScore ?? report.aiPriorityScore} />

                    {/* Arrow */}
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden flex flex-col gap-3">
                {complaints.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => handleRowClick(report)}
                    className="bg-surface rounded-2xl p-4 border border-black/[0.03] shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-surface-container flex items-center justify-center border border-black/[0.04]">
                        {report.image
                          ? <div className="bg-cover bg-center w-full h-full" style={{ backgroundImage: `url('${report.image}')` }} />
                          : <span className="material-symbols-outlined text-on-surface-variant text-[20px]">photo</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-bold text-on-surface truncate block">{report.wasteType?.replace(/_/g, ' ') || 'Unknown'}</span>
                        <span className="text-[12px] text-on-surface-variant truncate flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[13px]">location_on</span>{report.address || 'No location'}
                        </span>
                      </div>
                      <ScoreCircle score={report.priorityScore ?? report.aiPriorityScore} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${STATUS_COLORS[report.status] || 'bg-surface-container text-on-surface-variant'}`}>
                        {formatStatus(report.status)}
                      </span>
                      <span className="px-2.5 py-1 bg-surface-container rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                        {formatVolume(report.estimatedVolume)}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-medium ml-auto flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {timeSince(report.createdAt || report.timestamp)}
                      </span>
                    </div>
                    {report.assignedTeamName || report.teamName ? (
                      <div className="mt-2.5 flex items-center gap-1.5 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[14px]">group</span>
                        <span className="text-[12px] font-medium">{report.assignedTeamName || report.teamName}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
