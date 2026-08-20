import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reportService, teamService } from '../../services.js';
import GoogleMap from '../../components/GoogleMap.jsx';

const TIMELINE_STEPS = [
  { key: 'submitted', label: 'Submitted', icon: 'flag' },
  { key: 'ai_analyzed', label: 'AI Analysis', icon: 'smart_toy' },
  { key: 'assigned', label: 'Team Dispatched', icon: 'group' },
  { key: 'en_route', label: 'En Route', icon: 'route' },
  { key: 'cleanup_in_progress', label: 'Cleanup in Progress', icon: 'cleaning_services' },
  { key: 'resolved', label: 'Resolved', icon: 'check_circle' },
];

const STATUS_TO_STEP = {
  submitted: 0, ai_analyzed: 1, under_review: 1,
  assigned: 2, en_route: 3, cleanup_in_progress: 4,
  verification: 5, resolved: 5,
};

function getTimelineIndex(status) {
  return STATUS_TO_STEP[status] ?? 0;
}

function getProgressPercent(status) {
  const idx = getTimelineIndex(status);
  return Math.round((idx / (TIMELINE_STEPS.length - 1)) * 100);
}

function formatStatus(status) {
  return (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function formatShortAddress(addr) {
  if (!addr) return '';
  const parts = addr.split(',').map(s => s.trim());
  if (parts.length <= 2) return addr;
  return parts.slice(0, 2).join(', ');
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

export default function TrackingCleanup() {
  const navigate = useNavigate();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayAddress, setDisplayAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [prevTimelineIdx, setPrevTimelineIdx] = useState(-1);
  const [completedBounce, setCompletedBounce] = useState(new Set());
  const pollRef = useRef(null);

  const reportId = location.state?.reportId;

  const fetchData = useCallback(async () => {
    try {
      if (!reportId) { setLoading(false); return; }
      const reportData = await reportService.getReportById(reportId);
      if (reportData) {
        setReport(prev => {
          if (prev && prev.status !== reportData.status) {
            const newIdx = getTimelineIndex(reportData.status);
            setPrevTimelineIdx(getTimelineIndex(prev.status));
            setCompletedBounce(prevSet => {
              const next = new Set(prevSet);
              next.add(newIdx);
              return next;
            });
          }
          return reportData;
        });
        if (reportData?.assignedTeam) {
          try {
            const teams = await teamService.getTeams();
            const match = teams.find(t => t.id === reportData.assignedTeam);
            if (match) setTeam(match);
          } catch {}
        }
        if (reportData?.latitude && reportData?.longitude && !reportData.address) {
          const addr = await reverseGeocode(reportData.latitude, reportData.longitude);
          if (addr) setDisplayAddress(addr);
        } else if (reportData.address) {
          setDisplayAddress(reportData.address);
        }
      }
    } catch (err) {
      console.error('Failed to fetch report:', err);
    }
    setLoading(false);
  }, [reportId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!reportId || report?.status === 'resolved') return;
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [reportId, report?.status, fetchData]);

  const currentStatus = report?.status || 'submitted';
  const timelineIdx = getTimelineIndex(currentStatus);
  const progressPct = getProgressPercent(currentStatus);
  const severityMap = { low: 'text-green-600 bg-green-50', medium: 'text-amber-600 bg-amber-50', high: 'text-orange-600 bg-orange-50', critical: 'text-red-600 bg-red-50' };
  const coords = (report?.latitude && report?.longitude) ? { lat: report.latitude, lng: report.longitude } : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" style={{ fontFamily: 'Manrope' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <span className="absolute inset-0 rounded-full bg-green-500/10 animate-ping" />
            <div className="relative w-14 h-14 rounded-full bg-white border-[3px] border-green-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-gray-900">Loading report</p>
            <p className="text-xs text-gray-400 mt-0.5">Fetching latest status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: 'Manrope' }}>
      <style>{`
        @keyframes pulseRing {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes bounceIn {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fillLine {
          from { height: 0%; }
          to { height: var(--fill-target, 100%); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tl-bounce { animation: bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .tl-fill { animation: fillLine 0.6s ease-out forwards; }
        .tl-pulse-ring { animation: pulseRing 2s ease-out infinite; }
        .tl-slide { animation: slideDown 0.3s ease-out both; }
      `}</style>

      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-gray-600 text-xl">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-gray-900 truncate">Track Report</h1>
          </div>
          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{report?.id?.slice(-8) || ''}</span>
        </div>
      </header>

      <main className="px-4 pb-8 max-w-lg mx-auto">
        <div className="flex flex-col gap-4 pt-4">

          {/* Live status badge */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-100">
            <span className="relative flex h-3 w-3">
              {currentStatus !== 'resolved' && <span className="tl-pulse-ring absolute inline-flex h-full w-full rounded-full bg-green-400" />}
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-700">{formatStatus(currentStatus)}</p>
            </div>
            <span className="text-[11px] font-medium text-green-500">{progressPct}%</span>
          </div>

          {/* Report card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {report?.image && (
              <div className="relative h-48 bg-gray-100">
                <img src={report.image} alt="Report" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                {report.severity && (
                  <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-lg ${severityMap[report.severity] || 'text-gray-600 bg-gray-100'}`}>
                    {report.severity?.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900">{report?.wasteType || 'Unknown Waste'}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="material-symbols-outlined text-gray-400 text-base">location_on</span>
                    {displayAddress ? (
                      <p
                        className="text-[12px] text-gray-500 leading-snug"
                        style={{ display: '-webkit-box', WebkitLineClamp: addressExpanded ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: addressExpanded ? 'visible' : 'hidden' }}
                        onClick={() => setAddressExpanded(!addressExpanded)}
                      >
                        {displayAddress}
                        {!addressExpanded && displayAddress.length > 40 && <span className="text-green-600 font-bold ml-1">more</span>}
                      </p>
                    ) : coords ? (
                      <p className="text-[12px] text-gray-500">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
                    ) : (
                      <p className="text-[12px] text-gray-400 italic">Location unavailable</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-green-500 text-base">psychology</span>
                  <span className="text-[12px] font-bold text-gray-700">{report?.aiConfidence || '—'}%</span>
                  <span className="text-[11px] text-gray-400">AI Conf.</span>
                </div>
                {report?.severity && (
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-orange-500 text-base">priority_high</span>
                    <span className="text-[12px] font-bold text-gray-700 capitalize">{report.severity}</span>
                  </div>
                )}
                {report?.estimatedVolume && (
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-blue-500 text-base">scale</span>
                    <span className="text-[12px] font-bold text-gray-700">{report.estimatedVolume}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team card */}
          {team && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-green-500/20">
                  <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-gray-900 truncate">{team.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[12px] text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-gray-400 text-sm">directions_car</span>
                      {team.vehicle || 'Vehicle'}
                    </span>
                    <span className="text-[12px] text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-gray-400 text-sm">group</span>
                      {team.members || 0} members
                    </span>
                  </div>
                </div>
                {team.etaMinutes && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-[18px] font-extrabold text-green-600">{team.etaMinutes}</p>
                    <p className="text-[10px] text-gray-400 font-medium -mt-0.5">MIN ETA</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map */}
          <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 shadow-sm">
            {coords ? (
              <>
                <GoogleMap
                  center={coords}
                  zoom={15}
                  markers={[{ lat: coords.lat, lng: coords.lng, severity: report.severity, label: report.wasteType }]}
                  className="w-full h-full"
                />
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm z-10">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-gray-700">Tracking Active</span>
                </div>
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm z-10">
                  <span className="text-[10px] font-mono text-gray-500">{coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}</span>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-green-600 text-xl">map</span>
                </div>
                <span className="text-[12px] text-green-700 font-semibold">No location data</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-gray-900">Progress</h3>
              <span className="text-[13px] font-bold text-green-600">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-[15px] font-bold text-gray-900 mb-5">Timeline</h3>
            <div className="relative">
              {TIMELINE_STEPS.map((step, i) => {
                const isCompleted = i < timelineIdx;
                const isCurrent = i === timelineIdx;
                const isPending = i > timelineIdx;
                const isLast = i === TIMELINE_STEPS.length - 1;

                const timelineEntry = report?.statusTimeline?.find(t => {
                  if (i === 0) return t.status === 'submitted';
                  if (i === 1) return t.status === 'ai_analyzed' || t.status === 'under_review';
                  if (i === 2) return t.status === 'assigned';
                  if (i === 3) return t.status === 'en_route';
                  if (i === 4) return t.status === 'cleanup_in_progress';
                  if (i === 5) return t.status === 'resolved' || t.status === 'verification';
                  return false;
                });

                const justCompleted = completedBounce.has(i) && isCompleted;

                return (
                  <div key={step.key} className={`relative flex gap-4 ${isLast ? '' : 'pb-6'}`} style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="relative z-10">
                        {isCompleted && (
                          <div className={`w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-sm shadow-green-500/25 ${justCompleted ? 'tl-bounce' : ''}`}>
                            <span className="material-symbols-outlined text-white text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                          </div>
                        )}
                        {isCurrent && (
                          <div className="relative">
                            <span className="tl-pulse-ring absolute inset-0 rounded-full bg-green-400/40" />
                            <div className="relative w-7 h-7 rounded-full bg-white border-[2.5px] border-green-500 flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            </div>
                          </div>
                        )}
                        {isPending && (
                          <div className="w-7 h-7 rounded-full bg-white border-[2px] border-gray-200 flex items-center justify-center">
                            <span className="material-symbols-outlined text-gray-300 text-[13px]">{step.icon}</span>
                          </div>
                        )}
                      </div>
                      {!isLast && (
                        <div className="w-[2px] flex-1 min-h-[20px] mt-1">
                          <div className="w-full h-full bg-gray-200 rounded-full relative overflow-hidden">
                            {isCompleted && (
                              <div className="absolute inset-0 bg-green-500 rounded-full tl-fill" style={{ '--fill-target': '100%' }} />
                            )}
                            {isCurrent && (
                              <div className="absolute top-0 left-0 w-full bg-gradient-to-b from-green-500 to-green-200 rounded-full tl-fill" style={{ '--fill-target': '60%' }} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="pt-0.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[13px] font-bold ${isCurrent ? 'text-green-600' : isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                        {timelineEntry?.at && (
                          <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">{formatTime(timelineEntry.at)}</span>
                        )}
                      </div>
                      {isCurrent && (
                        <p className="text-[12px] text-green-500 font-medium mt-0.5">Current step</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          {report?.comment && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-gray-400 text-base">chat_bubble</span>
                <span className="text-[13px] font-bold text-gray-900">Your Note</span>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed">{report.comment}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => navigate('/home')}
              className="w-full h-12 rounded-2xl bg-gray-100 text-gray-700 text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">home</span>
              Back to Home
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
