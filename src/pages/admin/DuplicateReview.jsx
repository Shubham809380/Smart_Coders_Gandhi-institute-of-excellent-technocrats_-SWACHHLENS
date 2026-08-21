import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, StatusChip, Icon, Spinner, TableSkeleton, EmptyState, ErrorState, relativeTime, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

function similarityChip(score) {
  const pct = Math.round((Number(score) || 0) * 100);
  if (pct >= 85) return <Chip tone="danger">{pct}% match</Chip>;
  if (pct >= 70) return <Chip tone="warn">{pct}% match</Chip>;
  return <Chip tone="info">{pct}% match</Chip>;
}

export default function DuplicateReview() {
  const [groups, setGroups] = useState([]);
  const [selectedReports, setSelectedReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await adminService.getDuplicateGroups();
      setGroups(data);
      setSelectedRecords(data);
    } catch (err) {
      setError(err.message || "Failed to load duplicate groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  const setSelectedRecords = (data) => {
    const initial = {};
    data.forEach((g) => {
      // Preselect the oldest report as the keeper.
      const sorted = [...g.reports].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (sorted.length > 0) initial[g.groupId] = sorted[0].id;
    });
    setSelectedReports(initial);
  };

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["waste:updated"], { pollMs: 60000, poll: load });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const handleSelect = (groupId, reportId) => {
    setSelectedReports((prev) => ({ ...prev, [groupId]: reportId }));
  };

  const handleKeepSelected = async (groupId) => {
    const keepId = selectedReports[groupId];
    if (!keepId) return;
    setActionLoading(groupId);
    try {
      await adminService.mergeDuplicates(groupId, keepId);
      showToast(`Merged duplicates into ${keepId}.`);
      await load();
    } catch (err) {
      showToast(err.message || "Merge failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkSeparate = async (groupId) => {
    setActionLoading(groupId);
    try {
      await adminService.dismissDuplicateGroup(groupId);
      showToast("Group dismissed — complaints kept separate.");
      await load();
    } catch (err) {
      showToast(err.message || "Dismiss failed.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Duplicate Review</h2>
            <p className="text-sm adm-muted mt-0.5">
              {loading ? "Loading…" : `${groups.length} group${groups.length !== 1 ? "s" : ""} flagged by AI`}
            </p>
          </div>
          <Chip tone="warn" icon={<Icon name="sparkles" size={12} />}>AI Detected</Chip>
        </div>

        {loading && <div className="adm-card"><TableSkeleton rows={3} cols={4} /></div>}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && groups.length === 0 && (
          <div className="adm-card">
            <EmptyState icon="check" title="No duplicates found" body="All complaints have been reviewed. No potential duplicates were detected by AI." />
          </div>
        )}

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.groupId} className="adm-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b adm-border-c" style={{ background: "var(--adm-surface-2)" }}>
                <div className="flex items-center gap-2.5">
                  {similarityChip(group.maxSimilarity)}
                  <span className="text-xs adm-muted">{group.count} reports near same spot</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={actionLoading === group.groupId}
                    onClick={() => handleMarkSeparate(group.groupId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg adm-btn-ghost"
                  >
                    <Icon name="x" size={12} /> Keep separate
                  </button>
                  <button
                    disabled={actionLoading === group.groupId}
                    onClick={() => handleKeepSelected(group.groupId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg adm-btn-primary"
                  >
                    {actionLoading === group.groupId ? <Spinner size={12} /> : <Icon name="merge" size={13} />}
                    Merge into selected
                  </button>
                </div>
              </div>

              <div>
                {group.reports.map((report) => (
                  <label
                    key={report.id}
                    className={`flex items-center gap-3.5 px-4 py-3 border-b adm-border-c last:border-0 cursor-pointer transition-colors ${
                      selectedReports[group.groupId] === report.id ? "bg-[rgba(0,168,150,0.07)]" : "hover:bg-[var(--adm-surface-2)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`group-${group.groupId}`}
                      checked={selectedReports[group.groupId] === report.id}
                      onChange={() => handleSelect(group.groupId, report.id)}
                      className="accent-[var(--adm-primary)] w-4 h-4"
                    />
                    <img
                      src={report.image}
                      alt={`Waste report ${report.id}`}
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                      style={{ background: "var(--adm-surface-2)" }}
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <Link to={`/admin/complaints/${report.id}`} className="text-[13px] font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{report.id}</Link>
                        <span className="text-xs font-semibold capitalize">{wasteTypeLabel(report.wasteType)}</span>
                        <StatusChip status={report.status} />
                      </div>
                      <p className="text-xs adm-muted truncate">{report.address || "Unknown location"}</p>
                    </div>
                    <span className="text-[11px] adm-muted whitespace-nowrap shrink-0">{relativeTime(report.createdAt)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 adm-card px-4 py-3 text-sm font-semibold adm-text animate-slideUp" style={{ boxShadow: "var(--shadow-xl)", borderLeft: "3px solid var(--adm-primary)" }}>
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}
