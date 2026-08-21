import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon, Spinner, Skeleton, EmptyState, ErrorState } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const TEAM_STATUSES = ["available", "assigned", "en_route", "off_duty"];
const VEHICLE_TYPES = ["Mini Tipper", "Flatbed", "Dumper Placer", "Jetting Machine", "Hazard Van"];
const CAPACITIES = ["small", "medium", "large"];

function statusTone(status) {
  return { available: "ok", assigned: "info", en_route: "info", off_duty: "neutral" }[status] || "neutral";
}

function TeamFormModal({ initial, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    leaderId: initial?.leaderId || "",
    memberIds: (initial?.memberIds || []).join(", "),
    wardIds: (initial?.wardIds || []).join(", "),
    vehicleType: initial?.vehicleType || "",
    vehicleCapacity: initial?.vehicleCapacity || "",
    status: initial?.status || "available",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = () => {
    onSave({
      name: form.name.trim(),
      leaderId: form.leaderId.trim(),
      memberIds: form.memberIds.split(",").map((s) => s.trim()).filter(Boolean),
      wardIds: form.wardIds.split(",").map((s) => s.trim()).filter(Boolean),
      vehicleType: form.vehicleType,
      vehicleCapacity: form.vehicleCapacity,
      status: form.status,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative adm-card w-full max-w-lg p-5 space-y-3.5 max-h-[90vh] overflow-y-auto adm-scroll" style={{ boxShadow: "var(--shadow-xl)" }}>
        <h3 className="font-extrabold text-base">{initial ? `Edit ${initial.name}` : "Create team"}</h3>
        <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
          Team name
          <input value={form.name} onChange={set("name")} placeholder="Sanitation Team 12" className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
            Leader ID
            <input value={form.leaderId} onChange={set("leaderId")} placeholder="worker-leader-12" className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
          </label>
          <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
            Status
            <select value={form.status} onChange={set("status")} className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal capitalize">
              {TEAM_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
          Member IDs (comma separated)
          <input value={form.memberIds} onChange={set("memberIds")} placeholder="worker-a, worker-b" className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
        </label>
        <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
          Ward coverage (comma separated)
          <input value={form.wardIds} onChange={set("wardIds")} placeholder="ward-12, ward-13" className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
            Vehicle
            <select value={form.vehicleType} onChange={set("vehicleType")} className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal">
              <option value="">None</option>
              {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-widest adm-muted">
            Capacity
            <select value={form.vehicleCapacity} onChange={set("vehicleCapacity")} className="adm-input w-full mt-1 px-3 py-2 text-sm font-normal normal-case tracking-normal">
              <option value="">—</option>
              {CAPACITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-bold adm-btn-ghost">Cancel</button>
          <button onClick={submit} disabled={!form.name.trim() || saving} className="flex-1 py-2.5 rounded-lg text-sm font-bold adm-btn-primary inline-flex items-center justify-center gap-2">
            {saving ? <Spinner size={13} /> : <Icon name="check" size={14} />} {initial ? "Save changes" : "Create team"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsFleet() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // null | {} | team
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setTeams(await adminService.getTeamsWithLoad());
    } catch (err) {
      setError(err.message || "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["team:update", "team:deleted", "waste:updated"], { pollMs: 45000, poll: load });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const save = async (payload) => {
    setSaving(true);
    try {
      if (modal?.id) {
        await adminService.updateTeam(modal.id, payload);
        showToast("Team updated.");
      } else {
        await adminService.createTeam(payload);
        showToast("Team created.");
      }
      setModal(null);
      await load();
    } catch (err) {
      showToast(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (teamId) => {
    setDeletingId(teamId);
    try {
      await adminService.deleteTeam(teamId);
      showToast("Team deleted; its active tasks were unassigned.");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      showToast(err.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const totals = teams.reduce((acc, t) => ({ active: acc.active + (t.activeTasks || 0), done: acc.done + (t.completedTasks || 0), available: acc.available + (t.availability === "available" ? 1 : 0) }), { active: 0, done: 0, available: 0 });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Teams & Fleet</h2>
            <p className="text-sm adm-muted mt-0.5">{teams.length} teams · {totals.available} available · {totals.active} open tasks</p>
          </div>
          <button onClick={() => setModal({})} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold adm-btn-primary">
            <Icon name="plus" size={14} /> New team
          </button>
        </div>

        {loading && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={150} /></div>)}</div>}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && teams.length === 0 && (
          <div className="adm-card"><EmptyState icon="users" title="No teams yet" body="Create your first sanitation team to start dispatching." action={
            <button onClick={() => setModal({})} className="rounded-lg px-3.5 py-2 text-xs font-bold adm-btn-primary inline-flex items-center gap-1.5"><Icon name="plus" size={13} /> New team</button>
          } /></div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {teams.map((t) => (
            <div key={t.id} className="adm-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold text-sm truncate">{t.name}</p>
                  <p className="text-[11px] font-mono adm-muted">{t.id}</p>
                </div>
                <Chip tone={statusTone(t.availability)} dot>{String(t.availability || "unknown").replace("_", " ")}</Chip>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg py-2" style={{ background: "var(--adm-surface-2)" }}>
                  <p className="text-lg font-extrabold tabular-nums leading-none">{t.activeTasks ?? 0}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest adm-muted mt-1">Open</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: "var(--adm-surface-2)" }}>
                  <p className="text-lg font-extrabold tabular-nums leading-none">{t.completedTasks ?? 0}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest adm-muted mt-1">Done</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: "var(--adm-surface-2)" }}>
                  <p className="text-lg font-extrabold tabular-nums leading-none">{t.etaMinutes != null ? `${t.etaMinutes}m` : "—"}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest adm-muted mt-1">ETA</p>
                </div>
              </div>

              <div className="text-xs space-y-1">
                <p className="flex items-center gap-1.5 adm-muted"><Icon name="truck" size={12} />{t.vehicleType || "No vehicle"}{t.vehicleCapacity ? ` · ${t.vehicleCapacity}` : ""}</p>
                <p className="flex items-center gap-1.5 adm-muted"><Icon name="users" size={12} />{t.memberCount || 0} members{t.leaderId ? ` · lead ${t.leaderId}` : ""}</p>
                <p className="flex items-center gap-1.5 adm-muted"><Icon name="pin" size={12} />{(t.wardIds || []).join(", ") || "No wards"}{t.currentLocation ? ` · @ ${t.currentLocation}` : ""}</p>
              </div>

              <div className="flex gap-2 mt-auto pt-1">
                <button onClick={() => setModal(t)} className="flex-1 rounded-lg py-1.5 text-xs font-bold adm-btn-ghost inline-flex items-center justify-center gap-1.5">
                  <Icon name="edit" size={12} /> Edit
                </button>
                {confirmDelete === t.id ? (
                  <>
                    <button onClick={() => remove(t.id)} disabled={deletingId === t.id} className="flex-1 rounded-lg py-1.5 text-xs font-bold text-white inline-flex items-center justify-center gap-1" style={{ background: "var(--adm-danger)" }}>
                      {deletingId === t.id ? <Spinner size={11} /> : "Confirm delete"}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="rounded-lg py-1.5 px-2.5 text-xs font-bold adm-btn-ghost">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(t.id)} className="rounded-lg py-1.5 px-2.5 text-xs font-bold adm-btn-ghost" style={{ color: "var(--adm-danger)" }} title="Delete team">
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && <TeamFormModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSave={save} saving={saving} />}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 adm-card px-4 py-3 text-sm font-semibold adm-text animate-slideUp" style={{ boxShadow: "var(--shadow-xl)", borderLeft: "3px solid var(--adm-primary)" }}>
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}
