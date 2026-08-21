import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { PriorityRing, Chip, StatusChip, SeverityChip, Icon, Spinner, TableSkeleton, EmptyState, ErrorState, relativeTime, wasteTypeLabel, volumeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const OPEN_STATUSES = "submitted,ai_analyzed,under_review,reopened";

function AssignMenu({ report, teams, onAssign, busy }) {
  const [open, setOpen] = useState(false);
  const available = teams.filter((t) => t.availability !== "off_duty");
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold adm-btn-primary"
      >
        {busy ? <Spinner size={12} /> : <Icon name="check" size={12} />} Assign
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-60 adm-card overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest adm-muted">Teams by load</p>
            {available.length === 0 && <p className="px-3 py-3 text-xs adm-muted">No active teams.</p>}
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => { setOpen(false); onAssign(report.id, t.id); }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--adm-surface-2)] transition-colors flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold truncate">{t.name}</span>
                  <span className="block text-[10px] adm-muted">{t.vehicleType || "—"} · ETA {t.etaMinutes ?? "?"}m</span>
                </span>
                <Chip tone={t.activeTasks >= 4 ? "warn" : t.activeTasks === 0 ? "ok" : "info"}>{t.activeTasks} open</Chip>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PriorityQueue() {
  const [reports, setReports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", severity: "", wardId: "", search: "" });
  const [selected, setSelected] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [bulkTeam, setBulkTeam] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const params = {};
      if (filters.status) params.status = filters.status; else params.status = OPEN_STATUSES;
      if (filters.severity) params.severity = filters.severity;
      if (filters.wardId) params.wardId = filters.wardId;
      if (filters.search) params.search = filters.search;
      const [data, teamData] = await Promise.all([adminService.getComplaints(params), adminService.getTeamsWithLoad()]);
      setReports(data.reports || []);
      setTeams(teamData);
    } catch (err) {
      setError(err.message || "Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const { connected } = useLive(
    () => load(),
    ["waste:new", "waste:updated", "waste:status:update", "complaint:escalated"],
    { pollMs: 30000, poll: load }
  );

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const handleAssign = async (reportId, teamId) => {
    setBusyId(reportId);
    try {
      await adminService.assignComplaint(reportId, teamId);
      showToast(`Assigned ${reportId} to ${teams.find((t) => t.id === teamId)?.name || teamId}.`);
      await load();
    } catch (err) {
      showToast(err.message || "Assignment failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleEscalate = async (reportId) => {
    setBusyId(reportId);
    try {
      await adminService.escalateComplaint(reportId);
      showToast(`${reportId} escalated — priority boosted.`);
      await load();
    } catch (err) {
      showToast(err.message || "Escalation failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkTeam || selected.size === 0) return;
    try {
      const result = await adminService.bulkAssign([...selected], bulkTeam);
      showToast(`${result.assignedCount} complaint(s) assigned.`);
      setSelected(new Set());
      setBulkTeam("");
      await load();
    } catch (err) {
      showToast(err.message || "Bulk assign failed.");
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = reports.length > 0 && reports.every((r) => selected.has(r.id));
  const wards = useMemo(() => [...new Set(reports.map((r) => r.wardId).filter(Boolean))].sort(), [reports]);
  const criticalCount = reports.filter((r) => r.effectivePriority?.level === "critical").length;

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="adm-card p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 adm-muted"><Icon name="search" size={14} /></span>
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search ID or address…"
              className="adm-input w-full pl-8 pr-3 py-2 text-sm"
            />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="adm-input px-2.5 py-2 text-sm font-semibold">
            <option value="">All open</option>
            <option value={OPEN_STATUSES}>Open pipeline</option>
            <option value="verification">Verification</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
          </select>
          <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })} className="adm-input px-2.5 py-2 text-sm font-semibold">
            <option value="">Any severity</option>
            {["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.wardId} onChange={(e) => setFilters({ ...filters, wardId: e.target.value })} className="adm-input px-2.5 py-2 text-sm font-semibold">
            <option value="">All wards</option>
            {wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <Chip tone={connected ? "ok" : "warn"} dot>{connected ? "Live" : "Polling"}</Chip>
          {criticalCount > 0 && <Chip tone="danger" icon={<Icon name="zap" size={11} />}>{criticalCount} critical</Chip>}
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="adm-card p-3 flex flex-wrap items-center gap-3 sticky top-16 z-10" style={{ boxShadow: "var(--shadow-lg)" }}>
            <span className="text-sm font-bold">{selected.size} selected</span>
            <select value={bulkTeam} onChange={(e) => setBulkTeam(e.target.value)} className="adm-input px-2.5 py-1.5 text-sm font-semibold">
              <option value="">Choose team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.activeTasks} open)</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={!bulkTeam} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold adm-btn-primary">
              <Icon name="check" size={13} /> Assign all
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-semibold adm-muted hover:underline">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="adm-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={7} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
          ) : reports.length === 0 ? (
            <EmptyState icon="queue" title="Queue is clear" body="No complaints match the current filters." />
          ) : (
            <div className="overflow-x-auto adm-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider adm-muted border-b adm-border-c" style={{ background: "var(--adm-surface-2)" }}>
                    <th className="pl-4 pr-2 py-2.5 w-8">
                      <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(reports.map((r) => r.id)) : new Set())} className="accent-[var(--adm-primary)]" />
                    </th>
                    <th className="px-2 py-2.5">Priority</th>
                    <th className="px-2 py-2.5">Complaint</th>
                    <th className="px-2 py-2.5">AI Analysis</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Age</th>
                    <th className="px-2 py-2.5">Team</th>
                    <th className="px-2 py-2.5 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const isCritical = r.effectivePriority?.level === "critical";
                    const isHigh = ["critical", "high"].includes(r.effectivePriority?.level);
                    return (
                      <tr
                        key={r.id}
                        className={`border-b adm-border-c last:border-0 transition-colors hover:bg-[var(--adm-surface-2)] ${isCritical ? "animate-[pulse-row_1.6s_ease-in-out_infinite]" : ""}`}
                        style={isHigh && !isCritical ? { background: "rgba(240,118,59,0.04)" } : undefined}
                      >
                        <td className="pl-4 pr-2 py-2.5">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-[var(--adm-primary)]" />
                        </td>
                        <td className="px-2 py-2.5"><PriorityRing score={r.effectivePriority?.score ?? r.priorityScore} level={r.effectivePriority?.level} size={40} /></td>
                        <td className="px-2 py-2.5 max-w-[220px]">
                          <Link to={`/admin/complaints/${r.id}`} className="font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</Link>
                          <p className="text-xs adm-muted truncate">{r.address || "Unknown location"}</p>
                          {r.escalated && <Chip tone="danger" icon={<Icon name="zap" size={10} />}>Escalated</Chip>}
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="text-xs font-semibold">{wasteTypeLabel(r.wasteType)}</p>
                          <p className="text-[11px] adm-muted">{volumeLabel(r.estimatedVolume)} · {r.aiConfidence}% conf.</p>
                          <div className="mt-0.5"><SeverityChip severity={r.severity} /></div>
                        </td>
                        <td className="px-2 py-2.5"><StatusChip status={r.status} /></td>
                        <td className="px-2 py-2.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1 adm-muted"><Icon name="clock" size={11} />{relativeTime(r.createdAt)}</span>
                          {r.priorityBreakdown?.components?.find((c) => c.key === "age")?.points > 0 && (
                            <Chip tone="warn">+{r.priorityBreakdown.components.find((c) => c.key === "age").points} aging</Chip>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-xs">
                          {r.assignedTeam ? <Chip tone="info">{r.assignedTeam}</Chip> : <span className="adm-muted">Unassigned</span>}
                        </td>
                        <td className="px-2 py-2.5 pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {!["resolved", "rejected", "duplicate"].includes(r.status) && (
                              <>
                                <AssignMenu report={r} teams={teams} onAssign={handleAssign} busy={busyId === r.id} />
                                {!r.escalated && (
                                  <button
                                    onClick={() => handleEscalate(r.id)}
                                    disabled={busyId === r.id}
                                    title="Escalate priority"
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold adm-btn-ghost"
                                    style={{ color: "var(--adm-danger)" }}
                                  >
                                    <Icon name="zap" size={12} /> Escalate
                                  </button>
                                )}
                              </>
                            )}
                            <Link to={`/admin/complaints/${r.id}`} title="Open detail" className="inline-flex items-center justify-center w-7 h-7 rounded-lg adm-btn-ghost">
                              <Icon name="chevronRight" size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
