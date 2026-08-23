import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reportService } from '../../services.js';
import { useLive } from '../../hooks/useLive.js';
import { formatDateTime } from '../../utils/helpers.js';

// The six-step cleanup workflow, in order. `STAGE_ALIASES` maps every known
// backend status to its stage; unknown statuses gracefully fall back to 0.
const STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'ai_analysis', label: 'AI Analysis' },
  { key: 'team_dispatched', label: 'Team Dispatched' },
  { key: 'en_route', label: 'En Route' },
  { key: 'cleanup_in_progress', label: 'Cleanup in Progress' },
  { key: 'resolved', label: 'Resolved' },
];
const STAGE_ALIASES = {
  submitted: ['submitted', 'draft'],
  ai_analysis: ['ai_analyzing', 'ai_analyzed', 'under_review'],
  team_dispatched: ['assigned'],
  en_route: ['en_route'],
  cleanup_in_progress: ['cleanup_in_progress'],
  resolved: ['resolved'],
};
const STATUS_TO_STAGE = {};
Object.entries(STAGE_ALIASES).forEach(([stage, statuses]) => {
  statuses.forEach((s) => { STATUS_TO_STAGE[s] = STAGES.findIndex((st) => st.key === stage); });
});
function getStageIndex(status) {
  return STATUS_TO_STAGE[status] ?? 0;
}

export default function SuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  // Live cleanup status — single source of truth for the progress timeline.
  const [status, setStatus] = useState('submitted');
  const [report, setReport] = useState(null);

  // Accept the report id from navigation state (in-app taps); without one we
  // stay on the initial state instead of fetching a placeholder id.
  const rawReportId = location.state?.reportId || '';
  const reportId = rawReportId || 'SWL-00000';

  const fetchData = useCallback(async () => {
    if (!rawReportId) return;
    try {
      const d = await reportService.getReportById(rawReportId);
      if (d) {
        setReport(d);
        if (d.status) setStatus(d.status);
      }
    } catch { /* keep last known status — never crash the page */ }
  }, [rawReportId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime updates via the project's existing transport (Socket.IO push,
  // SSE fallback, poll-only-while-disconnected resilience net). No fake timers.
  useLive(
    useCallback((evt, payload) => {
      const pid = payload?.reportId || payload?.id;
      if (pid && rawReportId && pid !== rawReportId) return;
      fetchData();
    }, [rawReportId, fetchData]),
    ['waste:status:update', 'waste:updated', 'notification:new'],
    { pollMs: 30000, poll: fetchData },
  );

  const currentIdx = getStageIndex(status);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(reportId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-background min-h-screen pb-8">
      <main className="flex flex-col items-center px-4 pt-12 pb-6 gap-6 max-w-lg mx-auto w-full">

        <div className="flex flex-col items-center gap-3">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
            <span className="absolute inset-1 rounded-full bg-green-500/10 animate-pulse" />
            <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
              <span className="material-symbols-outlined text-white text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">Report Submitted!</h1>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            Your report has been received and is being processed.
          </p>
        </div>

        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-gray-400 text-xl">
            tag
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">Report ID</p>
            <p className="text-sm font-bold text-gray-900 font-mono tracking-wide truncate">{reportId}</p>
            {report?.createdAt && (
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                Uploaded {formatDateTime(report.createdAt)}
              </p>
            )}
          </div>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:scale-95 border"
            style={{
              backgroundColor: copied ? '#f0fdf4' : '#f9fafb',
              borderColor: copied ? '#bbf7d0' : '#e5e7eb',
              color: copied ? '#16a34a' : '#6b7280',
            }}
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-5">Report Progress</h2>
          <div className="flex flex-col">
            {STAGES.map((stage, i) => {
              const isLast = i === STAGES.length - 1;
              const isCompleted = i < currentIdx;
              const isCurrent = i === currentIdx;
              // Final step doubles as terminal: once reached it shows its check.
              const showCheck = isCompleted || (isCurrent && isLast);
              return (
                <div key={stage.key} className="flex items-stretch gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`relative w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        showCheck
                          ? 'bg-green-500'
                          : isCurrent
                            ? 'border-2 border-green-500 bg-white'
                            : 'border-2 border-gray-300 bg-white'
                      }`}
                    >
                      {showCheck && (
                        <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check
                        </span>
                      )}
                      {showCheck && (
                        <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30" />
                      )}
                      {isCurrent && !showCheck && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-[32px] ${isCompleted ? 'bg-green-500' : isCurrent ? 'bg-green-500/40' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                    <p
                      className={`text-sm font-semibold ${
                        isCompleted || isCurrent ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-green-600 font-medium mt-0.5">Current step</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full flex flex-col gap-3 mt-2">
          <button
            onClick={() => navigate('/tracking', { state: { reportId } })}
            className="w-full h-13 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-green-600 text-white shadow-lg shadow-green-600/25 hover:bg-green-700"
          >
            <span className="material-symbols-outlined text-lg">progress_activity</span>
            Track Progress
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full h-13 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
