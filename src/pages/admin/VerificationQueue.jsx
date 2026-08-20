import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar.jsx';
import { adminService, reportService } from '../../services.js';

function timeAgo(dateStr) {
  if (!dateStr) return 'Unknown';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RejectModal({ reportId, onClose, onConfirm, loading }) {
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!note.trim()) return;
    onConfirm(reportId, note.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5 border border-black/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-500 text-[20px]">warning</span>
          </div>
          <div>
            <h3 className="text-[17px] font-extrabold text-on-surface">Reject Cleanup</h3>
            <p className="text-[12px] text-on-surface-variant">Report will be reopened for reassignment</p>
          </div>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for rejection (required)..."
          className="w-full h-28 rounded-2xl bg-surface-container p-4 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 border border-black/[0.06] focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none resize-none transition-all"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface-variant text-[14px] font-bold border border-black/[0.06] hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !note.trim()}
            className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-[14px] font-bold shadow-md hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">close</span>
            )}
            {loading ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerificationQueue() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [rejectTarget, setRejectTarget] = useState(null);
  const [removingIds, setRemovingIds] = useState(new Set());

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const data = await adminService.getVerificationQueue();
      setItems(data || []);
    } catch (err) {
      console.error('Failed to fetch verification queue:', err);
    }
    setLoading(false);
  };

  const handleApprove = async (reportId) => {
    setActionLoading((prev) => ({ ...prev, [reportId]: 'approve' }));
    try {
      await reportService.updateReportStatus(reportId, 'resolved');
      setRemovingIds((prev) => new Set([...prev, reportId]));
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== reportId));
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(reportId);
          return next;
        });
      }, 400);
    } catch (err) {
      console.error('Failed to approve:', err);
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[reportId];
        return next;
      });
    }
  };

  const handleReject = async (reportId, note) => {
    setActionLoading((prev) => ({ ...prev, [reportId]: 'reject' }));
    try {
      await reportService.updateReportStatus(reportId, 'reopened', { note });
      setRejectTarget(null);
      setRemovingIds((prev) => new Set([...prev, reportId]));
      setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== reportId));
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(reportId);
          return next;
        });
      }, 400);
    } catch (err) {
      console.error('Failed to reject:', err);
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[reportId];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading verification queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="verification" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-extrabold text-on-surface tracking-tight">Verification Queue</h1>
            <p className="text-[15px] text-on-surface-variant">Review completed cleanups before closing complaints.</p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
              <span className="material-symbols-outlined text-primary text-[18px]">pending_actions</span>
              <span className="text-[14px] font-extrabold text-primary">{items.length} pending</span>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <span className="material-symbols-outlined text-green-500 text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
            </div>
            <div className="text-center">
              <h2 className="text-[20px] font-extrabold text-on-surface mb-1">All caught up!</h2>
              <p className="text-[14px] text-on-surface-variant max-w-sm">
                No pending verifications right now. New submissions requiring review will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((item) => {
              const isApproving = actionLoading[item.id] === 'approve';
              const isRejecting = actionLoading[item.id] === 'reject';
              const isRemoving = removingIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`bg-surface rounded-2xl border border-black/[0.04] shadow-sm overflow-hidden transition-all duration-400 ${
                    isRemoving ? 'opacity-0 scale-[0.97] -translate-y-2 max-h-0 mb-0 p-0 border-0 overflow-hidden' : ''
                  }`}
                  style={{ transition: 'opacity 400ms ease, transform 400ms ease, max-height 400ms ease, margin 400ms ease, padding 400ms ease, border 400ms ease' }}
                >
                  <div className="p-4 lg:p-5">
                    <div className="flex flex-col lg:flex-row gap-5">
                      <div className="flex flex-col sm:flex-row gap-3 lg:w-[380px] shrink-0">
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                          <div className="w-full h-40 sm:h-36 lg:h-44 rounded-xl overflow-hidden bg-surface-container border border-black/[0.04] flex items-center justify-center relative">
                            {item.image ? (
                              <img src={item.image} alt="Before cleanup" className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-on-surface-variant/40 text-[36px]">photo</span>
                            )}
                            <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg">
                              Before
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                          <div className="w-full h-40 sm:h-36 lg:h-44 rounded-xl overflow-hidden bg-surface-container border border-black/[0.04] flex items-center justify-center relative">
                            {item.afterImage ? (
                              <img src={item.afterImage} alt="After cleanup" className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-on-surface-variant/30 text-[32px]">add_photo_alternate</span>
                                <span className="text-[11px] text-on-surface-variant/50 font-medium">No after photo</span>
                              </div>
                            )}
                            <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg">
                              After
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-extrabold uppercase tracking-wider border border-primary/20">
                              ID: {item.id?.slice(-8) || item.id}
                            </span>
                            {item.severity && (
                              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border ${
                                item.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-200' :
                                item.severity === 'high' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                item.severity === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                'bg-surface-container text-on-surface-variant border-black/[0.06]'
                              }`}>
                                {item.severity}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <h3 className="text-[16px] font-extrabold text-on-surface truncate">
                              {item.wasteType?.replace(/_/g, ' ') || 'Unknown waste type'}
                            </h3>
                            <p className="text-[13px] text-on-surface-variant flex items-center gap-1.5 truncate">
                              <span className="material-symbols-outlined text-[14px] shrink-0">location_on</span>
                              {item.address || item.location || 'Location not recorded'}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-tertiary-container flex items-center justify-center">
                                <span className="material-symbols-outlined text-on-tertiary-container text-[16px]">person</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-on-surface leading-tight">
                                  {item.workerName || item.citizenId || item.team || 'Unknown worker'}
                                </span>
                                <span className="text-[11px] text-on-surface-variant">Cleanup worker</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-on-surface-variant">
                              <span className="material-symbols-outlined text-[15px]">schedule</span>
                              <span className="text-[12px] font-medium">{timeAgo(item.completedAt || item.updatedAt || item.createdAt)}</span>
                            </div>
                          </div>

                          {(item.aiConfidence != null || item.severity) && (
                            <div className="flex items-center gap-3">
                              {item.aiConfidence != null && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 rounded-lg border border-cyan-200">
                                  <span className="material-symbols-outlined text-cyan-600 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>neurology</span>
                                  <span className="text-[12px] font-bold text-cyan-700">{item.aiConfidence}%</span>
                                  <span className="text-[10px] text-cyan-600/70 font-medium">AI confidence</span>
                                </div>
                              )}
                              {item.severity && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container rounded-lg border border-black/[0.04]">
                                  <span className="material-symbols-outlined text-on-surface-variant text-[14px]">gpp_maybe</span>
                                  <span className="text-[12px] font-bold text-on-surface capitalize">{item.severity}</span>
                                  <span className="text-[10px] text-on-surface-variant/70 font-medium">severity</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-surface-container-high">
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={isApproving || isRejecting}
                            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97]"
                            style={{ boxShadow: '0 4px 12px -2px rgba(0,107,44,0.3)' }}
                          >
                            {isApproving ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            )}
                            {isApproving ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => setRejectTarget(item)}
                            disabled={isApproving || isRejecting}
                            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-transparent text-red-500 text-[13px] font-bold border-2 border-red-300 hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97]"
                          >
                            {isRejecting ? (
                              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <span className="material-symbols-outlined text-[18px]">replay</span>
                            )}
                            {isRejecting ? 'Rejecting...' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rejectTarget && (
          <RejectModal
            reportId={rejectTarget.id}
            onClose={() => setRejectTarget(null)}
            onConfirm={handleReject}
            loading={actionLoading[rejectTarget.id] === 'reject'}
          />
        )}
      </main>
    </div>
  );
}
