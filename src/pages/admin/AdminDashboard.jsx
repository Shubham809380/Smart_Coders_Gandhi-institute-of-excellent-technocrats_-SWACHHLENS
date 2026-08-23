import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, StatusChip, Icon, Skeleton, ErrorState, relativeTime, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const QUICK_LINKS = [
  { to: "/admin/map", icon: "map", label: "Live Map", desc: "Hotspots & field units" },
  { to: "/admin/queue", icon: "queue", label: "Priority Queue", desc: "Dispatch & bulk assign" },
  { to: "/admin/verification", icon: "eye", label: "Verification", desc: "Cleanup proof review" },
  { to: "/admin/duplicates", icon: "copy", label: "Duplicates", desc: "AI-flagged merge review" },
  { to: "/admin/recycling", icon: "recycle", label: "Recycling", desc: "Route heavy recyclables" },
  { to: "/admin/teams", icon: "users", label: "Teams & Fleet", desc: "Crews, vehicles, loads" },
];

function fmtMins(m) {
  if (!m) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.round((m / 60) * 10) / 10;
  return h < 48 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`;
}

export default function AdminDashboard() {
  const [kpiData, setKpiData] = useState(null);
  const [topReports, setTopReports] = useState([]);
  const [teams, setTeams] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [analytics, reports, teamList, alertList] = await Promise.all([
        adminService.getAnalytics(),
        adminService.getComplaints({ sort: "priority", limit: 6 }),
        adminService.getTeamsWithLoad(),
        adminService.getAlerts(6),
      ]);
      setKpiData(analytics);
      setTopReports(reports.reports || []);
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
          {/* Top priorities */}
          <section className="adm-card p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold">Top priorities</h3>
              <Link to="/admin/queue" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>View full queue →</Link>
            </div>
            {topReports.length === 0 ? (
              <p className="text-sm adm-muted py-6 text-center">No open complaints.</p>
            ) : (
              <ul className="divide-y adm-divide">
                {topReports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/complaints/${r.id}`} className="flex items-center gap-3 py-2.5 group" style={{ textDecoration: "none" }}>
                      <img src={r.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" style={{ background: "var(--adm-surface-2)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-bold group-hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</span>
                          <StatusChip status={r.status} />
                          {r.hazardFlag && <Chip tone="danger">Hazard</Chip>}
                        </div>
                        <p className="text-xs adm-muted truncate">{wasteTypeLabel(r.wasteType)} · {r.address || "Unknown location"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <PriorityBadge score={r.effectivePriority?.score ?? r.priorityScore} />
                        <p className="text-[10px] adm-muted mt-0.5">{relativeTime(r.createdAt)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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

            {/* Team load */}
            <section className="adm-card p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-extrabold">Team load</h3>
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
                      <span className="tabular-nums adm-muted">{t.activeTasks ?? 0} open</span>
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
