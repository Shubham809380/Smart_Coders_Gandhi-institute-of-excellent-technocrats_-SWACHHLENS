import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar.jsx';
import GoogleMap from '../../components/GoogleMap.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import { reportService, teamService } from '../../services.js';

export default function SmartDispatch() {
  const navigate = useNavigate();
  const location = useLocation();
  const reportId = location.state?.reportId;
  const [report, setReport] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => { fetchData(); }, [reportId]);

  const fetchData = async () => {
    try {
      const [teamData, reports] = await Promise.all([teamService.getTeams(), reportService.getReports()]);
      setTeams(teamData || []);
      if (reportId) {
        const r = await reportService.getReportById(reportId);
        setReport(r);
      } else if (reports.length > 0) {
        setReport(reports[0]);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleDispatch = async (teamId) => {
    if (!report?.id || !teamId) return;
    setDispatching(true);
    try { await teamService.assignTeam(report.id, teamId); fetchData(); }
    catch (err) { console.error(err); }
    setDispatching(false);
  };

  const availableTeams = teams.filter(t => t.status === 'available');
  const bestTeam = availableTeams.sort((a, b) => (b.aiMatchScore || 0) - (a.aiMatchScore || 0))[0];

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading report...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="team-dispatch" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mt-2 mb-6">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface hover:bg-surface-container transition-colors border border-black/[0.04]">
            <span className="material-symbols-outlined text-on-surface text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`px-3 py-1 rounded-xl text-[11px] font-extrabold uppercase tracking-wider ${report?.severity === 'critical' ? 'bg-red-500 text-white' : report?.severity === 'high' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                {report?.severity || 'Priority'}
              </span>
              <span className="text-[12px] font-bold text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span> ID: {report?.id}
              </span>
            </div>
            <h1 className="text-[22px] font-extrabold text-on-surface">{report?.wasteType?.replace(/_/g, ' ') || 'Waste Report'}</h1>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 flex-1">
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
            {/* Report Image */}
            {report?.image && (
              <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-md border border-black/[0.04]" style={{ boxShadow: "0 8px 24px -6px rgba(0,0,0,0.15)" }}>
                <SafeImage className="w-full h-full object-cover" alt="Waste report" src={report.image} iconSize="text-[36px]" />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 border border-black/[0.04]">
                  <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  <span className="text-[12px] font-bold text-on-surface">AI Verified</span>
                </div>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
                <h3 className="text-[14px] font-extrabold text-on-surface mb-3">Location</h3>
                <div className="flex gap-2.5 mb-3">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">location_on</span>
                  <p className="text-[14px] text-on-surface leading-relaxed">{report?.address || 'Location recorded'}</p>
                </div>
                {report?.latitude && report?.longitude && (
                  <div className="w-full h-40 rounded-xl overflow-hidden">
                    <GoogleMap
                      center={{ lat: report.latitude, lng: report.longitude }}
                      zoom={15}
                      markers={[{ lat: report.latitude, lng: report.longitude, severity: report.severity, label: report.wasteType }]}
                      className="w-full h-full"
                    />
                  </div>
                )}
              </div>
              <div className="bg-surface rounded-2xl p-5 shadow-sm border border-black/[0.03]">
                <h3 className="text-[14px] font-extrabold text-on-surface mb-3">Report Details</h3>
                {report?.comment && (
                  <div className="bg-surface-container rounded-xl p-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#6a758a]" />
                    <p className="text-[14px] text-on-surface-variant italic pl-3">"{report.comment}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
            {/* AI Assessment */}
            <div className="bg-surface rounded-3xl p-5 shadow-sm border border-black/[0.03]">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>neurology</span>
                  <h2 className="text-[16px] font-extrabold text-on-surface">AI Assessment</h2>
                </div>
                <span className="text-[24px] font-extrabold text-cyan-600">{report?.aiConfidence || 0}%</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container rounded-xl p-3.5 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Est. Volume</span>
                  <span className="text-[16px] font-bold text-on-surface capitalize">{report?.estimatedVolume?.replace('_', ' ') || 'Unknown'}</span>
                </div>
                <div className="bg-surface-container rounded-xl p-3.5 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Hazard Risk</span>
                  <span className={`text-[16px] font-bold ${report?.severity === 'critical' || report?.severity === 'high' ? 'text-red-500' : 'text-on-surface'}`}>{report?.severity?.toUpperCase() || 'LOW'}</span>
                </div>
              </div>
              {report?.potentialRisk && (
                <div className="mt-4 pt-4 border-t border-surface-container-high">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Risk Assessment</span>
                  <p className="text-[14px] text-on-surface-variant mt-1.5 leading-relaxed">{report.potentialRisk}</p>
                </div>
              )}
            </div>

            {/* Dispatch Panel */}
            <div className="bg-gradient-to-br from-primary/[0.04] to-cyan-500/[0.03] rounded-3xl shadow-sm border-l-4 border-primary p-5 flex flex-col flex-1">
              <h2 className="text-[16px] font-extrabold text-on-surface mb-1">AI Recommended Dispatch</h2>
              <p className="text-[13px] text-on-surface-variant mb-5">Optimal match based on equipment, proximity, and schedule.</p>

              {bestTeam && (
                <div className="bg-surface rounded-2xl p-4 shadow-sm mb-5 border border-black/[0.03]">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#00873a]/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#006b2c] text-[20px]">local_shipping</span>
                      </div>
                      <div>
                        <h3 className="text-[15px] font-bold text-on-surface leading-tight">{bestTeam.name}</h3>
                        <div className="flex items-center gap-1.5 text-on-surface-variant mt-1">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span className="text-[12px] font-medium">Available · {bestTeam.vehicle}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[14px] font-extrabold text-primary">{bestTeam.aiMatchScore}% Match</span>
                      <span className="text-[11px] text-on-surface-variant font-medium">{bestTeam.distanceKm}km away</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2.5">
                {availableTeams.map(team => (
                  <button key={team.id} onClick={() => handleDispatch(team.id)} disabled={dispatching} className="w-full py-3 rounded-2xl bg-primary text-white text-[14px] font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]" style={{ boxShadow: "0 4px 12px -2px rgba(0,107,44,0.3)" }}>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    {dispatching ? 'Dispatching...' : `Dispatch ${team.name}`}
                  </button>
                ))}
                {availableTeams.length === 0 && (
                  <div className="text-center py-4">
                    <span className="material-symbols-outlined text-on-surface-variant/40 text-[32px] block mb-2">group_off</span>
                    <span className="text-[13px] text-on-surface-variant font-medium">No available teams</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
