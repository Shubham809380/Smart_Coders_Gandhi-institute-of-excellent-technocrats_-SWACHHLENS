import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon, Skeleton, EmptyState, ErrorState, relativeTime } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const KIND_META = {
  hazard: { icon: "alert", color: "var(--adm-danger)", bg: "rgba(220,38,38,0.12)", label: "Hazard" },
  critical: { icon: "flame", color: "var(--adm-warn)", bg: "rgba(245,158,11,0.14)", label: "Critical" },
  escalation: { icon: "trendUp", color: "var(--adm-info)", bg: "rgba(59,130,246,0.12)", label: "Escalation" },
};

export default function AlertsCenter() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setAlerts(await adminService.getAlerts(60));
    } catch (err) {
      setError(err.message || "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["waste:new", "waste:updated"], { pollMs: 45000, poll: load });

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Alerts</h2>
            <p className="text-sm adm-muted mt-0.5">{loading ? "Loading…" : `${alerts.length} active signal${alerts.length !== 1 ? "s" : ""}`}</p>
          </div>
          <Chip tone="danger" dot>Live</Chip>
        </div>

        {loading && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={56} /></div>)}</div>}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && alerts.length === 0 && (
          <div className="adm-card"><EmptyState icon="check" title="All clear" body="No hazard, critical or escalation signals right now." /></div>
        )}

        <ul className="space-y-2">
          {alerts.map((a, i) => {
            const meta = KIND_META[a.kind] || KIND_META.escalation;
            return (
              <li key={`${a.reportId}-${i}`}>
                <Link to={`/admin/complaints/${a.reportId}`} className="adm-card p-3.5 flex items-start gap-3 hover:-translate-y-px transition-transform" style={{ textDecoration: "none", borderLeft: `3px solid ${meta.color}` }}>
                  <span className="mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>
                    <Icon name={meta.icon} size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-bold adm-text">{a.title}</p>
                      <Chip tone="neutral">{meta.label}</Chip>
                    </div>
                    <p className="text-xs adm-muted truncate mt-0.5">{a.body}</p>
                  </div>
                  <span className="text-[11px] adm-muted shrink-0">{relativeTime(a.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AdminLayout>
  );
}
