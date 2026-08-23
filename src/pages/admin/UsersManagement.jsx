import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon, Skeleton, EmptyState, ErrorState, relativeTime } from "../../components/admin/ui.jsx";
import { adminService, authService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const ROLE_OPTIONS = [
  { value: "citizen", label: "Citizen" },
  { value: "cleanup_worker", label: "Worker" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

const ROLE_TONE = {
  citizen: "info",
  cleanup_worker: "ok",
  admin: "warn",
  super_admin: "danger",
};

export default function UsersManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [meUid] = useState(() => authService.getSessionSnapshot().currentUser?.uid || null);

  const load = useCallback(async () => {
    try {
      setError("");
      setUsers(await adminService.getUsers());
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLive(() => load(), ["waste:new"], { pollMs: 60000, poll: load });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === "all" ? true : u.role === roleFilter))
      .filter((u) => !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [users, query, roleFilter]);

  async function patchUser(uid, updates) {
    setBusyId(uid);
    try {
      const updated = await adminService.updateUser(uid, updates);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...updated } : u)));
    } catch (err) {
      alert(err.message || "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  function handleRoleChange(u, role) {
    if (role === u.role) return;
    if (!confirm(`Change ${u.name}'s role from ${u.role} to ${role}?`)) return;
    patchUser(u.uid, { role });
  }

  function handleToggleActive(u) {
    const next = !(u.isActive ?? true);
    if (!next && !confirm(`Deactivate ${u.name}? They will lose access immediately.`)) return;
    if (next && u.isActive === false && !confirm(`Reactivate ${u.name}?`)) return;
    patchUser(u.uid, { isActive: next });
  }

  const counts = useMemo(() => {
    const c = { all: users.length, citizen: 0, cleanup_worker: 0, admin: 0 };
    for (const u of users) if (c[u.role] !== undefined) c[u.role] += 1;
    return c;
  }, [users]);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Users</h2>
            <p className="text-sm adm-muted mt-0.5">{loading ? "Loading…" : `${filtered.length} of ${users.length} accounts`}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 adm-muted"><Icon name="search" size={14} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm adm-card border adm-border-c outline-none focus:border-[var(--adm-primary)]"
              style={{ background: "var(--adm-surface)" }}
            />
          </label>
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: "var(--adm-surface-2)" }}>
            {[{ value: "all", label: "All" }, ...ROLE_OPTIONS.filter((r) => r.value !== "super_admin")].map((r) => (
              <button
                key={r.value}
                onClick={() => setRoleFilter(r.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${roleFilter === r.value ? "" : "adm-muted hover:opacity-80"}`}
                style={roleFilter === r.value ? { background: "var(--adm-surface)", color: "var(--adm-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" } : undefined}
              >
                {r.label}{counts[r.value] !== undefined ? ` (${counts[r.value]})` : ""}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={56} /></div>)}</div>
        )}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="adm-card"><EmptyState icon="idCard" title="No users found" body="Try a different search term or role filter." /></div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="adm-card overflow-hidden">
            <ul className="divide-y adm-divide">
              {filtered.map((u) => {
                const active = u.isActive ?? true;
                const isSelf = u.uid && meUid && u.uid === meUid;
                return (
                  <li key={u.uid || u.email} className={`p-3.5 flex flex-wrap items-center gap-3 transition-opacity ${busyId === u.uid ? "opacity-50 pointer-events-none" : ""}`}>
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                      style={{ background: active ? "var(--adm-primary-strong)" : "var(--adm-muted)" }}
                    >
                      {(u.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-bold adm-text truncate">{u.name}</p>
                        <Chip tone={ROLE_TONE[u.role] || "neutral"}>{ROLE_OPTIONS.find((r) => r.value === u.role)?.label || u.role}</Chip>
                        {!active && <Chip tone="neutral">Deactivated</Chip>}
                        {isSelf && <Chip tone="outline">You</Chip>}
                      </div>
                      <p className="text-xs adm-muted truncate">{u.email}{u.wardId ? ` · Ward ${u.wardId}` : ""}</p>
                    </div>
                    <span className="text-[11px] adm-muted shrink-0 hidden md:block">
                      {u.createdAt ? `Joined ${relativeTime(u.createdAt)}` : ""}
                    </span>
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      title={isSelf ? "You cannot change your own role" : "Change role"}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold border adm-border-c outline-none focus:border-[var(--adm-primary)] disabled:opacity-50"
                      style={{ background: "var(--adm-surface)", color: "var(--adm-text)" }}
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={isSelf}
                      title={isSelf ? "You cannot deactivate yourself" : active ? "Deactivate account" : "Reactivate account"}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold border adm-border-c transition-colors disabled:opacity-50 ${active ? "hover:bg-[rgba(220,38,38,0.08)]" : "hover:bg-[rgba(22,163,74,0.08)]"}`}
                      style={{ background: "var(--adm-surface)", color: active ? "var(--adm-danger)" : "var(--adm-ok)" }}
                    >
                      <Icon name={active ? "x" : "check"} size={12} />
                      {active ? "Deactivate" : "Activate"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
