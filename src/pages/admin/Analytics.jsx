import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon, Skeleton, ErrorState, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { LineChart, DonutChart, BarChart, Histogram } from "../../components/admin/charts.jsx";
import { adminService } from "../../services.js";

const PALETTE = ["#00A896", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#10B981", "#EC4899", "#64748B"];

function fmtMins(m) {
  if (!m) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.round((m / 60) * 10) / 10;
  if (h < 48) return `${h}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

function KpiCard({ label, value, trend, goodDirection = "down" }) {
  const good = trend && trend.direction === goodDirection;
  return (
    <div className="adm-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest adm-muted">{label}</p>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <p className="text-2xl font-extrabold tabular-nums leading-none">{value}</p>
        {trend?.direction !== "flat" && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: good ? "var(--adm-ok)" : "var(--adm-danger)" }}>
            <Icon name={trend.direction === "up" ? "trendUp" : "trendDown"} size={12} />
            {trend.percent != null ? `${trend.percent}%` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await adminService.getAnalytics());
    } catch (err) {
      setError(err.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton h={36} w={220} />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={72} /></div>)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={260} /></div>)}</div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return <AdminLayout><div className="adm-card max-w-xl mx-auto"><ErrorState message={error || "No data."} onRetry={load} /></div></AdminLayout>;
  }

  const k = data.kpis || {};
  const timeline = (data.timeline || []).map((r) => ({ label: String(r.date).slice(5), value: r.count }));
  const categories = (data.byCategory || []).map((r) => ({ label: wasteTypeLabel(r.category), value: r.count }));
  const wards = (data.byWard || []).slice(0, 8).map((r) => ({ label: r.ward.replace(/^ward[-_]?/i, "W") || "—", value: r.count }));
  const severities = (data.bySeverity || []).filter((r) => r.severity).map((r) => ({ label: r.severity, value: r.count }));
  const buckets = (data.resolutionBuckets || []).map((r) => ({ label: r.bucket, value: r.count }));

  // Pivot hotspot growth rows into per-zone series
  const zoneMap = new Map();
  for (const row of data.hotspotGrowth || []) {
    if (!zoneMap.has(row.zone)) zoneMap.set(row.zone, []);
    zoneMap.get(row.zone).push(row.count);
  }
  const hotspots = [...zoneMap.entries()].slice(0, 5).map(([zone, counts], i) => ({ name: zone.replace(/^ward[-_]?/i, "W"), color: PALETTE[i % PALETTE.length], points: counts }));

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Analytics</h2>
            <p className="text-sm adm-muted mt-0.5">{data.total} total reports · live Neon data</p>
          </div>
          <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold adm-btn-ghost">
            <Icon name="refresh" size={13} /> Refresh
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard label="Open complaints" value={k.openComplaints?.value ?? "—"} trend={k.openComplaints?.trend} goodDirection="down" />
          <KpiCard label="Avg resolution" value={fmtMins(k.avgResolutionMinutes?.value)} trend={k.avgResolutionMinutes?.trend} goodDirection="down" />
          <KpiCard label="Escalations (7d)" value={k.escalatedCount?.value ?? "—"} trend={k.escalatedCount?.trend} goodDirection="down" />
          <KpiCard label="Resolved today" value={k.resolvedToday?.value ?? "—"} trend={k.resolvedToday?.trend} goodDirection="up" />
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="adm-card p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(220,38,38,0.12)", color: "var(--adm-danger)" }}><Icon name="alert" size={16} /></span>
            <div><p className="text-lg font-extrabold tabular-nums leading-none">{k.criticalOpen ?? 0}</p><p className="text-[10px] font-bold uppercase tracking-widest adm-muted mt-1">Critical open</p></div>
          </div>
          <div className="adm-card p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(22,163,74,0.12)", color: "var(--adm-ok)" }}><Icon name="recycle" size={16} /></span>
            <div><p className="text-lg font-extrabold tabular-nums leading-none">{k.pendingRecycling ?? 0}</p><p className="text-[10px] font-bold uppercase tracking-widest adm-muted mt-1">Pending recycling</p></div>
          </div>
          {(data.byStatus || []).slice(0, 2).map((s) => (
            <div key={s.status} className="adm-card p-4 flex items-center gap-3">
              <Chip tone="info">{String(s.status).replace(/_/g, " ")}</Chip>
              <p className="ml-auto text-lg font-extrabold tabular-nums">{s.count}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Reports — last 30 days</h3>
            <LineChart data={timeline} height={200} color="#00A896" />
          </section>

          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Waste type mix</h3>
            <DonutChart data={categories} size={170} thickness={30} centerLabel={`${categories.reduce((a, c) => a + c.value, 0)}`} centerSub="reports" />
          </section>

          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Reports by ward (top 8)</h3>
            <BarChart data={wards} height={210} color="#00A896" />
          </section>

          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Resolution time distribution</h3>
            <Histogram data={buckets} height={210} />
          </section>

          <section className="adm-card p-4 lg:col-span-2">
            <h3 className="text-sm font-extrabold mb-3">Hotspot growth — weekly volume by zone (6 weeks)</h3>
            <LineChart series={hotspots} height={220} />
          </section>

          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Severity split</h3>
            <DonutChart data={severities} size={150} thickness={26} colors={{ low: "#22C55E", medium: "#F59E0B", high: "#EF4444", critical: "#B91C1C" }} centerLabel={`${severities.reduce((a, c) => a + c.value, 0)}`} centerSub="classified" />
          </section>

          <section className="adm-card p-4">
            <h3 className="text-sm font-extrabold mb-3">Status pipeline</h3>
            <div className="space-y-2">
              {(data.byStatus || []).map((s) => {
                const pct = data.total ? Math.round((s.count / data.total) * 100) : 0;
                return (
                  <div key={s.status}>
                    <div className="flex justify-between text-[11px] font-semibold mb-1">
                      <span className="capitalize">{String(s.status).replace(/_/g, " ")}</span>
                      <span className="tabular-nums adm-muted">{s.count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--adm-surface-2)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--adm-primary)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
