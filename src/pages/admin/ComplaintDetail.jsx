import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import { adminService, reportService, teamService } from "../../services.js";

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "ai_analyzed", label: "AI Analyzed" },
  { value: "under_review", label: "Under Review" },
  { value: "assigned", label: "Assigned" },
  { value: "en_route", label: "En Route" },
  { value: "cleanup_in_progress", label: "Cleanup In Progress" },
  { value: "verification", label: "Verification" },
  { value: "resolved", label: "Resolved" },
  { value: "reopened", label: "Reopened" },
];

const STATUS_BADGE_COLORS = {
  submitted: "bg-gray-100 text-gray-700 border-gray-200",
  analyzing: "bg-blue-50 text-blue-600 border-blue-200",
  ai_analyzed: "bg-blue-50 text-blue-600 border-blue-200",
  analysis_failed: "bg-red-50 text-red-600 border-red-200",
  duplicate: "bg-purple-50 text-purple-600 border-purple-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  assigned: "bg-indigo-50 text-indigo-600 border-indigo-200",
  en_route: "bg-cyan-50 text-cyan-700 border-cyan-200",
  cleanup_in_progress: "bg-blue-50 text-blue-600 border-blue-200",
  verification: "bg-purple-50 text-purple-600 border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reopened: "bg-red-50 text-red-600 border-red-200",
};

const SEVERITY_BADGE_COLORS = {
  critical: "bg-red-500 text-white",
  high: "bg-red-50 text-red-600 border border-red-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

function getPriorityColor(score) {
  if (score < 45) return { bg: "bg-emerald-500", ring: "ring-emerald-200", text: "text-emerald-700", label: "Low" };
  if (score < 75) return { bg: "bg-amber-500", ring: "ring-amber-200", text: "text-amber-700", label: "Medium" };
  return { bg: "bg-red-500", ring: "ring-red-200", text: "text-red-700", label: "High" };
}

function formatDate(dateStr) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ComplaintDetail() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [assigningTeam, setAssigningTeam] = useState(null);

  useEffect(() => { fetchData(); }, [reportId]);

  const fetchData = async () => {
    try {
      const [reportData, teamData] = await Promise.all([
        reportService.getReportById(reportId),
        teamService.getTeams(),
      ]);
      setReport(reportData);
      setTeams(teamData || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!newStatus || newStatus === report?.status) return;
    setStatusUpdating(true);
    try {
      const updated = await reportService.updateReportStatus(reportId, newStatus);
      setReport((prev) => ({ ...prev, ...updated }));
    } catch (err) { console.error(err); }
    setStatusUpdating(false);
  };

  const handleAssignTeam = async (teamId) => {
    setAssigningTeam(teamId);
    try { await teamService.assignTeam(reportId, teamId); await fetchData(); }
    catch (err) { console.error(err); }
    setAssigningTeam(null);
  };

  const pColor = getPriorityColor(report?.priorityScore ?? 0);
  const timeline = report?.statusTimeline || [];

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading complaint...</span>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant/30 text-[48px]">error_outline</span>
          <span className="text-[15px] font-bold text-on-surface-variant">Complaint not found</span>
          <button onClick={() => navigate(-1)} className="mt-2 px-4 py-2 bg-primary text-white rounded-xl text-[13px] font-bold">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="complaints" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface hover:bg-surface-container transition-colors border border-black/[0.04] shrink-0">
            <span className="material-symbols-outlined text-on-surface text-[20px]">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[24px] font-extrabold text-on-surface tracking-tight">Complaint Detail</h1>
            <p className="text-[13px] text-on-surface-variant font-medium">{report.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Image Section */}
            {report.image && (
              <div className="bg-surface rounded-2xl overflow-hidden shadow-sm border border-black/[0.03]">
                {report.afterImage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                    <div className="relative">
                      <img className="w-full aspect-video object-cover" alt="Before cleanup" src={report.image} />
                      <span className="absolute top-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-sm text-white text-[11px] font-extrabold uppercase tracking-wider rounded-lg">Before</span>
                    </div>
                    <div className="relative">
                      <img className="w-full aspect-video object-cover" alt="After cleanup" src={report.afterImage} />
                      <span className="absolute top-3 left-3 px-3 py-1 bg-emerald-600/80 backdrop-blur-sm text-white text-[11px] font-extrabold uppercase tracking-wider rounded-lg">After</span>
                    </div>
                  </div>
                ) : (
                  <img className="w-full max-h-96 object-cover" alt="Waste report" src={report.image} />
                )}
              </div>
            )}

            {/* Report Info Card */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                <h2 className="text-[16px] font-extrabold text-on-surface">Report Information</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Report ID</span>
                  <span className="text-[14px] font-bold text-on-surface">{report.id}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Status</span>
                  <span className={`inline-flex self-start px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border ${STATUS_BADGE_COLORS[report.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {report.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Created</span>
                  <span className="text-[14px] text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">schedule</span>
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Waste Type</span>
                  <span className="text-[14px] font-bold text-on-surface capitalize">{report.wasteType?.replace(/_/g, " ") || "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Volume</span>
                  <span className="text-[14px] text-on-surface">{report.estimatedVolume || "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Severity</span>
                  <span className={`inline-flex self-start px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider ${SEVERITY_BADGE_COLORS[report.severity] || "bg-gray-100 text-gray-600"}`}>
                    {report.severity || "\u2014"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">AI Confidence</span>
                  <span className="text-[14px] font-bold text-on-surface">{report.aiConfidence ? `${report.aiConfidence}%` : "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Location</span>
                  <span className="text-[14px] text-on-surface flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant mt-0.5 shrink-0">location_on</span>
                    <span>{report.address || "\u2014"}</span>
                  </span>
                </div>
              </div>
              {report.comment && (
                <div className="mt-4 pt-4 border-t border-surface-container-high">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Citizen Comment</span>
                  <div className="bg-surface-container rounded-xl p-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/40" />
                    <p className="text-[14px] text-on-surface-variant italic pl-3 leading-relaxed">&ldquo;{report.comment}&rdquo;</p>
                  </div>
                </div>
              )}
            </div>

            {/* AI Analysis Card */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-cyan-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <h2 className="text-[16px] font-extrabold text-on-surface">AI Analysis</h2>
              </div>
              <div className="flex items-center gap-4 mb-5">
                <div className="relative flex items-center justify-center w-16 h-16">
                  <div className={`absolute inset-0 rounded-full ${pColor.bg} opacity-15`} />
                  <div className={`absolute inset-1 rounded-full ring-4 ${pColor.ring} bg-surface`} />
                  <span className={`relative text-[22px] font-extrabold ${pColor.text}`}>{report.priorityScore ?? "\u2014"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider self-start ${pColor.bg} text-white`}>
                    {pColor.label} Priority
                  </span>
                  <span className="text-[12px] text-on-surface-variant font-medium">Priority Score</span>
                </div>
              </div>

              {report.priorityReasons && report.priorityReasons.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">Priority Reasons</h3>
                  <div className="flex flex-col gap-2">
                    {report.priorityReasons.map((reason, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-surface-container rounded-xl">
                        <span className="material-symbols-outlined text-cyan-600 mt-0.5 text-[18px]">science</span>
                        <span className="text-[13px] text-on-surface-variant leading-relaxed">{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.potentialRisk && (
                <div className="mb-4">
                  <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">Potential Risks</h3>
                  <p className="text-[14px] text-on-surface-variant leading-relaxed bg-red-50/60 p-3 rounded-xl border border-red-100">{report.potentialRisk}</p>
                </div>
              )}

              {report.recommendation && (
                <div>
                  <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-2">AI Recommendation</h3>
                  <p className="text-[14px] text-on-surface-variant leading-relaxed bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">{report.recommendation}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* Status Change */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">swap_horiz</span>
                <h2 className="text-[16px] font-extrabold text-on-surface">Change Status</h2>
              </div>
              <div className="relative">
                <select
                  value={report.status || ""}
                  onChange={handleStatusChange}
                  disabled={statusUpdating}
                  className="w-full appearance-none bg-surface-container border border-surface-container-high rounded-xl px-4 py-3 pr-10 text-[14px] font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 cursor-pointer"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[20px] pointer-events-none">expand_more</span>
              </div>
              {statusUpdating && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[12px] text-on-surface-variant font-medium">Updating status...</span>
                </div>
              )}
            </div>

            {/* Assign Team */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">group</span>
                <h2 className="text-[16px] font-extrabold text-on-surface">Assign Team</h2>
              </div>
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
                {teams.length === 0 && (
                  <div className="text-center py-6">
                    <span className="material-symbols-outlined text-on-surface-variant/30 text-[32px] block mb-2">group_off</span>
                    <span className="text-[13px] text-on-surface-variant font-medium">No teams available</span>
                  </div>
                )}
                {teams.map((team) => {
                  const isAvailable = team.status === "available";
                  const isAssigned = assigningTeam === team.id;
                  return (
                    <div key={team.id} className={`p-3.5 rounded-xl border transition-all ${isAvailable ? "bg-surface-container-low border-black/[0.04] hover:shadow-sm" : "bg-surface-container/50 border-black/[0.03] opacity-60"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isAvailable ? "bg-primary/10" : "bg-surface-container-highest"}`}>
                            <span className={`material-symbols-outlined text-[18px] ${isAvailable ? "text-primary" : "text-on-surface-variant/50"}`}>local_shipping</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-on-surface">{team.name}</span>
                            <span className="text-[11px] text-on-surface-variant">{team.vehicle || "\u2014"}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                            {team.status || "unknown"}
                          </span>
                          {isAvailable && (
                            <button
                              onClick={() => handleAssignTeam(team.id)}
                              disabled={assigningTeam !== null}
                              className="bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
                            >
                              {isAssigned ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">send</span>
                              )}
                              {isAssigned ? "..." : "Assign"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status Timeline */}
            <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">timeline</span>
                <h2 className="text-[16px] font-extrabold text-on-surface">Status Timeline</h2>
              </div>
              {timeline.length === 0 ? (
                <div className="text-center py-6">
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-[32px] block mb-2">history</span>
                  <span className="text-[13px] text-on-surface-variant font-medium">No timeline data</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  {timeline.map((entry, i) => {
                    const isLast = i === timeline.length - 1;
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full shrink-0 ${isLast ? "bg-primary ring-4 ring-primary/15" : "bg-surface-container-highest"}`} />
                          {!isLast && <div className="w-px flex-1 bg-surface-container-highest my-1" />}
                        </div>
                        <div className={isLast ? "pb-0" : "pb-5"}>
                          <span className={`text-[13px] font-bold capitalize ${isLast ? "text-primary" : "text-on-surface"}`}>
                            {entry.status?.replace(/_/g, " ")}
                          </span>
                          <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">{formatShortTime(entry.at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
