import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, StatusChip, SeverityChip, Icon, Skeleton, ErrorState, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const OPEN_STATUSES = ["submitted", "ai_analyzed", "under_review", "assigned", "en_route", "cleanup_in_progress", "verification", "reopened"];

const QUICK_LINKS = [
  { to: "/admin/map", icon: "map", label: "Live Map", desc: "Hotspots & field units" },
  { to: "/admin/queue", icon: "queue", label: "Priority Queue", desc: "Dispatch & bulk assign" },
  { to: "/admin/verification", icon: "eye", label: "Verification", desc: "Cleanup proof review" },
  { to: "/admin/duplicates", icon: "copy", label: "Duplicates", desc: "AI-flagged merge review" },
  { to: "/admin/recycling", icon: "recycle", label: "Recycling", desc: "Route heavy recyclables" },
  { to: "/admin/users", icon: "idCard", label: "Users", desc: "Accounts & roles" },
];

function fmtMins(m) {
  if (!m) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.round((m / 60) * 10) / 10;
  return h < 48 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`;
}

function fmtAge(iso) {
  const hrs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 3600000);
  if (hrs < 1) return `${Math.round(hrs * 60)}m`;
  if (hrs < 48) return `${Math.floor(hrs)}h`;
  return `${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h`;
}

function ageTone(iso) {
  const hrs = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hrs >= 48) return "danger";
  if (hrs >= 24) return "warn";
  return "ok";
}

export default function AdminDashboard() {
  const [kpiData, setKpiData] = useState(null);
  const [openReports, setOpenReports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [analytics, complaints, teamList, alertList] = await Promise.all([
        adminService.getAnalytics(),
        adminService.getComplaints({ sort: "priority", limit: 200 }),
        adminService.getTeamsWithLoad(),
        adminService.getAlerts(8),
      ]);
      setKpiData(analytics);
      setOpenReports((complaints.reports || []).filter((r) => OPEN_STATUSES.includes(r.status)));
      setTeams(teamList || []);
      setAlerts(alertList || []);
    } catch (err) {
      setError(err.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["waste:new", "waste:updated", "waste:status:update", "team:update"], { pollMs: 45000, poll: load });

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton h={36} w={260} />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={72} /></div>)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={280} /></div>)}</div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !kpiData) {
    return <AdminLayout><div className="adm-card max-w-xl mx-auto"><ErrorState message={error} onRetry={load} /></div></AdminLayout>;
  }

  const k = kpiData?.kpis || {};
  const people = kpiData?.people || null;
  const rawMix = kpiData?.categoryMix || [];
  const mixTotal = Math.max(1, rawMix.reduce((a, c) => a + (c.count || 0), 0));
  const categoryMix = rawMix.map((c) => ({ ...c, share: Math.round(((c.count || 0) / mixTotal) * 100) }));
  const maxCatShare = Math.max(1, ...categoryMix.map((c) => c.share || 0));

  // Aging queue — oldest first, breaches float to the top.
  const aging = [...openReports].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const breachCount = aging.filter((r) => ageTone(r.createdAt) === "danger").length;

  // Ward load from live open reports.
  const wardCounts = new Map();
  for (const r of aging) {
    const w = r.location?.wardId || r.wardId || "unassigned";
    wardCounts.set(w, (wardCounts.get(w) || 0) + 1);
  }
  const wardLoad = [...wardCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w, n]) => ({ ward: w, count: n }));
  const maxWard = Math.max(1, ...wardLoad.map((w) => w.count));

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Operations Command Center</h2>
          <p className="text-sm adm-muted mt-0.5">Real-time overview of municipal waste operations.</p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: "Open complaints", value: k.openComplaints?.value ?? "—", trend: k.openComplaints?.trend, good: "down" },
            { label: "Avg resolution", value: fmtMins(k.avgResolutionMinutes?.value), trend: k.avgResolutionMinutes?.trend, good: "down" },
            { label: "Escalations (7d)", value: k.escalatedCount?.value ?? "—", trend: k.escalatedCount?.trend, good: "down" },
            { label: "Resolved today", value: k.resolvedToday?.value ?? "—", trend: k.resolvedToday?.trend, good: "up" },
          ].map((c) => (
            <div key={c.label} className="adm-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest adm-muted">{c.label}</p>
              <div className="flex items-end justify-between gap-2 mt-1.5">
                <p className="text-2xl font-extrabold tabular-nums leading-none">{c.value}</p>
                {c.trend?.direction !== "flat" && c.trend?.direction && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: c.trend.direction === c.good ? "var(--adm-ok)" : "var(--adm-danger)" }}>
                    <Icon name={c.trend.direction === "up" ? "trendUp" : "trendDown"} size={12} />
                    {c.trend.percent != null ? `${c.trend.percent}%` : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* People strip */}
        {people && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: "zap", label: "Active now", value: people.activeNow ?? 0, hint: `${people.activeToday ?? 0} active today` },
              { icon: "users", label: "Logins today", value: people.loginsToday ?? 0, hint: "recorded sign-ins" },
              { icon: "truck", label: "Workers on duty", value: people.onDutyWorkers ?? 0, hint: `${people.workersWithFreshLocation ?? 0} sharing location` },
              { icon: "idCard", label: "Total users", value: people.totalUsers ?? 0, hint: `${people.citizens ?? 0} citizens · ${people.workers ?? 0} workers` },
            ].map((p) => (
              <div key={p.label} className="adm-card p-3.5 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,168,150,0.12)", color: "var(--adm-primary)" }}>
                  <Icon name={p.icon} size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-extrabold tabular-nums leading-none">{p.value}</p>
                  <p className="text-[11px] font-bold adm-text mt-1">{p.label}</p>
                  <p className="text-[10px] adm-muted truncate">{p.hint}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {QUICK_LINKS.map((q) => (
            <Link key={q.to} to={q.to} className="adm-card p-3.5 flex flex-col gap-1.5 hover:-translate-y-0.5 transition-transform" style={{ textDecoration: "none" }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,168,150,0.12)", color: "var(--adm-primary)" }}>
                <Icon name={q.icon} size={15} />
              </span>
              <p className="text-[13px] font-extrabold adm-text">{q.label}</p>
              <p className="text-[11px] adm-muted leading-tight">{q.desc}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* SLA aging queue */}
          <section className="adm-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold">Aging queue — SLA watch</h3>
                {breachCount > 0 && <Chip tone="danger" dot>{breachCount} breached 48h</Chip>}
              </div>
              <Link to="/admin/queue" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>Dispatch →</Link>
            </div>
            {aging.length === 0 ? (
              <p className="text-sm adm-muted py-6 text-center">No open complaints — all clear.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-widest adm-muted">
                      <th className="pb-2 pr-3">Complaint</th>
                      <th className="pb-2 pr-3 hidden md:table-cell">Ward</th>
                      <th className="pb-2 pr-3 hidden lg:table-cell">Severity</th>
                      <th className="pb-2 pr-3">Priority</th>
                      <th className="pb-2 text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aging.slice(0, 10).map((r) => (
                      <tr key={r.id} className="border-t adm-border-c">
                        <td className="py-2.5 pr-3">
                          <Link to={`/admin/complaints/${r.id}`} className="flex items-center gap-2 group" style={{ textDecoration: "none" }}>
                            <span className="text-[13px] font-bold group-hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</span>
                            <StatusChip status={r.status} />
                          </Link>
                          <p className="text-[11px] adm-muted truncate max-w-[220px]">{wasteTypeLabel(r.wasteType)}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-xs adm-muted hidden md:table-cell">{(r.location?.wardId || r.wardId || "—").replace(/^ward[-_]?/, "W")}</td>
                        <td className="py-2.5 pr-3 hidden lg:table-cell"><SeverityChip severity={r.severity} /></td>
                        <td className="py-2.5 pr-3"><PriorityBadge score={r.effectivePriority?.score ?? r.priorityScore} /></td>
                        <td className="py-2.5 text-right">
                          <Chip tone={ageTone(r.createdAt)}>{fmtAge(r.createdAt)}</Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {aging.length > 10 && (
                  <p className="text-[11px] adm-muted mt-2">+{aging.length - 10} more in queue</p>
                )}
              </div>
            )}
          </section>

          <div className="space-y-3">
            {/* Alerts */}
            <section className="adm-card p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-extrabold">Recent alerts</h3>
                <Link to="/admin/alerts" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>All →</Link>
              </div>
              {alerts.length === 0 ? (
                <p className="text-xs adm-muted py-3 text-center">No active alerts.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.slice(0, 5).map((a, i) => (
                    <li key={`${a.reportId}-${i}`} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                        style={{ background: a.kind === "hazard" ? "rgba(220,38,38,0.12)" : a.kind === "critical" ? "rgba(245,158,11,0.14)" : "rgba(59,130,246,0.12)", color: a.kind === "hazard" ? "var(--adm-danger)" : a.kind === "critical" ? "var(--adm-warn)" : "var(--adm-info)" }}>
                        <Icon name={a.kind === "hazard" ? "alert" : a.kind === "critical" ? "flame" : "trendUp"} size={11} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{a.title}</p>
                        <p className="adm-muted truncate">{a.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Ward load */}
            {wardLoad.length > 0 && (
              <section className="adm-card p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-extrabold">Ward load</h3>
                  <Link to="/admin/map" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>Map →</Link>
                </div>
                <ul className="space-y-2">
                  {wardLoad.map((w) => (
                    <li key={w.ward}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold adm-text">{w.ward.replace(/^ward[-_]?/i, "Ward ")}</span>
                        <span className="tabular-nums adm-muted">{w.count} open</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--adm-surface-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(6, (w.count / maxWard) * 100)}%`, background: w.count >= 5 ? "var(--adm-warn)" : "var(--adm-primary)" }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Team readiness */}
            <section className="adm-card p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-extrabold">Team readiness</h3>
                <Link to="/admin/teams" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>Manage →</Link>
              </div>
              {teams.length === 0 ? (
                <p className="text-xs adm-muted py-3 text-center">No teams configured.</p>
              ) : (
                <ul className="space-y-2.5">
                  {teams.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.availability === "available" ? "var(--adm-ok)" : t.availability === "off_duty" ? "var(--adm-muted)" : "var(--adm-info)" }} />
                      <span className="font-semibold truncate flex-1">{t.name}</span>
                      <span className="tabular-nums adm-muted">{t.activeTasks ?? 0} open · {t.tasksCompletedToday ?? 0} done</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Category mix */}
            {categoryMix.length > 0 && (
              <section className="adm-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-extrabold">Category mix</h3>
                  <Link to="/admin/analytics" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>Analytics →</Link>
                </div>
                <ul className="space-y-2">
                  {categoryMix.map((c) => (
                    <li key={c.category}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold adm-text truncate">{wasteTypeLabel(c.category)}</span>
                        <span className="tabular-nums adm-muted">{c.count} · {c.share}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--adm-surface-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.share / maxCatShare) * 100)}%`, background: "var(--adm-primary)" }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function PriorityBadge({ score }) {
  const s = Number(score) || 0;
  const tone = s >= 80 ? "danger" : s >= 60 ? "warn" : s >= 40 ? "info" : "neutral";
  return <Chip tone={tone}>{s}</Chip>;
}
