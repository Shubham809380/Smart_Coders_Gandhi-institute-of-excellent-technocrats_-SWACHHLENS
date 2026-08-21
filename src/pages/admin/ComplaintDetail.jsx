import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { PriorityRing, Chip, StatusChip, SeverityChip, Icon, Spinner, Skeleton, ErrorState, relativeTime, wasteTypeLabel, volumeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PriorityBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const max = Math.max(1, ...breakdown.components.map((c) => c.points));
  return (
    <div className="adm-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold">Why this score</p>
        <Chip tone={breakdown.level === "critical" || breakdown.level === "high" ? "danger" : breakdown.level === "medium" ? "warn" : "ok"}>
          {breakdown.level} · {breakdown.score}/100
        </Chip>
      </div>
      <ul className="space-y-2">
        {breakdown.components.map((c) => (
          <li key={c.key} className="text-xs">
            <div className="flex items-center justify-between mb-0.5">
              <span className={c.points > 0 ? "font-semibold adm-text" : "adm-muted"}>{c.label}</span>
              <span className="font-bold tabular-nums" style={{ color: c.points > 0 ? "var(--adm-primary)" : "var(--adm-muted)" }}>+{c.points}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--adm-surface-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(c.points / max) * 100}%`, background: c.points > 0 ? "var(--adm-primary)" : "var(--adm-border)" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiVerifyPanel({ report, onDone }) {
  const [state, setState] = useState(report.aiAfterAnalysis ? "done" : "idle");
  const [analysis, setAnalysis] = useState(report.aiAfterAnalysis);
  const [error, setError] = useState("");

  const run = async () => {
    setState("running");
    setError("");
    try {
      const data = await adminService.verifyWithAI(report.id);
      setAnalysis(data.analysis);
      setState("done");
      onDone?.();
    } catch (err) {
      setError(err.message || "AI verification failed.");
      setState("idle");
    }
  };

  if (!report.afterImage) {
    return (
      <div className="adm-card p-4">
        <p className="text-sm font-bold mb-1">AI cleanup verification</p>
        <p className="text-xs adm-muted">Available once the field team submits an after-cleanup photo.</p>
      </div>
    );
  }

  return (
    <div className="adm-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">AI cleanup verification</p>
        {state === "done"
          ? <Chip tone="ok" icon={<Icon name="check" size={11} />}>Analyzed</Chip>
          : <button onClick={run} disabled={state === "running"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold adm-btn-primary">
              {state === "running" ? <Spinner size={12} /> : <Icon name="sparkles" size={13} />} Run AI check
            </button>}
      </div>
      {error && <p className="text-xs" style={{ color: "var(--adm-danger)" }}>{error}</p>}
      {state === "done" && analysis && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg p-2.5" style={{ background: "var(--adm-surface-2)" }}>
            <p className="font-bold uppercase tracking-wider adm-muted text-[10px] mb-1">Before</p>
            <p>{wasteTypeLabel(report.wasteType)}</p>
            <p className="adm-muted">{volumeLabel(report.estimatedVolume)} · severity {report.severity}</p>
          </div>
          <div className="rounded-lg p-2.5" style={{ background: "rgba(22,163,74,0.08)" }}>
            <p className="font-bold uppercase tracking-wider text-[10px] mb-1" style={{ color: "var(--adm-ok)" }}>After</p>
            <p>{wasteTypeLabel(analysis.wasteType)}</p>
            <p className="adm-muted">{volumeLabel(analysis.estimatedVolume)} · severity {analysis.severity}</p>
            <p className="mt-1 font-semibold" style={{ color: analysis.severity === "low" ? "var(--adm-ok)" : "var(--adm-warn)" }}>
              {analysis.severity === "low" ? "Cleanup looks effective" : "Residue may remain — recheck"}
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {[["Before", report.beforeImage], ["After", report.afterImage]].map(([label, src]) => src && (
          <figure key={label} className="rounded-lg overflow-hidden border adm-border-c">
            <img src={src} alt={`${label} cleanup`} className="w-full h-36 object-cover" loading="lazy" />
            <figcaption className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest adm-muted">{label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export default function ComplaintDetail() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [dupPrimaryId, setDupPrimaryId] = useState("");
  const [dupMode, setDupMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([adminService.getComplaint(reportId), adminService.getTeamsWithLoad()]);
      setReport(r);
      setTeams(t);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load complaint.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useLive((evt, payload) => {
    if ((evt === "waste:updated" || evt === "waste:status:update") && payload?.id === reportId) {
      setReport(payload);
    }
  }, ["waste:updated", "waste:status:update"], { pollMs: 45000, poll: load });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const act = async (name, fn) => {
    setBusy(name);
    try {
      await fn();
      await load();
    } catch (err) {
      showToast(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4 max-w-6xl mx-auto">
          <Skeleton h={40} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            <div className="space-y-4"><Skeleton h={300} /><Skeleton h={180} /></div>
            <div className="space-y-4"><Skeleton h={220} /><Skeleton h={260} /></div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !report) {
    return (
      <AdminLayout>
        <ErrorState message={error || "Complaint not found."} onRetry={() => { setLoading(true); load(); }} />
      </AdminLayout>
    );
  }

  const openTeams = teams.filter((t) => t.availability !== "off_duty");

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-semibold adm-muted hover:underline">
            <Icon name="chevronRight" size={14} className="rotate-180" /> Back
          </button>
          <h2 className="text-xl font-extrabold tracking-tight">{report.id}</h2>
          <StatusChip status={report.status} />
          {report.escalated && <Chip tone="danger" icon={<Icon name="zap" size={11} />}>Escalated</Chip>}
          {report.hazardFlag && <Chip tone="danger" icon={<Icon name="shieldAlert" size={11} />}>Hazard</Chip>}
          {report.recyclableHeavy && <Chip tone="info" icon={<Icon name="recycle" size={11} />}>Recyclable</Chip>}
          <div className="ml-auto flex items-center gap-2">
            {!["resolved", "rejected", "duplicate"].includes(report.status) && !report.escalated && (
              <button
                onClick={() => act("escalate", () => adminService.escalateComplaint(report.id))}
                disabled={busy === "escalate"}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold adm-btn-ghost"
                style={{ color: "var(--adm-danger)" }}
              >
                {busy === "escalate" ? <Spinner size={12} /> : <Icon name="zap" size={13} />} Escalate
              </button>
            )}
            <button
              onClick={() => setDupMode(!dupMode)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold adm-btn-ghost"
            >
              <Icon name="copy" size={13} /> Mark duplicate
            </button>
          </div>
        </div>

        {dupMode && (
          <div className="adm-card p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">Merge this complaint into primary:</span>
            <input
              value={dupPrimaryId}
              onChange={(e) => setDupPrimaryId(e.target.value.toUpperCase())}
              placeholder="REP-XXXXXXXX"
              className="adm-input px-2.5 py-1.5 text-sm w-44 font-mono"
            />
            <button
              onClick={() => act("dup", async () => { await adminService.markDuplicate(report.id, dupPrimaryId); setDupMode(false); showToast("Merged as duplicate."); })}
              disabled={!dupPrimaryId || busy === "dup"}
              className="rounded-lg px-3 py-1.5 text-xs font-bold adm-btn-primary inline-flex items-center gap-1.5"
            >
              {busy === "dup" ? <Spinner size={12} /> : <Icon name="merge" size={13} />} Confirm merge
            </button>
            <button onClick={() => setDupMode(false)} className="text-xs adm-muted hover:underline">Cancel</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
          {/* Left column */}
          <div className="space-y-4">
            {/* Photos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <figure className="adm-card overflow-hidden">
                <img src={report.beforeImage} alt="Before cleanup" className="w-full h-64 object-cover" />
                <figcaption className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest adm-muted">Reported photo</figcaption>
              </figure>
              <figure className="adm-card overflow-hidden">
                {report.afterImage ? (
                  <img src={report.afterImage} alt="After cleanup" className="w-full h-64 object-cover" />
                ) : (
                  <div className="w-full h-64 flex flex-col items-center justify-center adm-raised-bg adm-muted gap-2">
                    <Icon name="eye" size={22} />
                    <span className="text-xs">Awaiting after-cleanup photo</span>
                  </div>
                )}
                <figcaption className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest adm-muted">After cleanup</figcaption>
              </figure>
            </div>

            {/* AI analysis */}
            <div className="adm-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold flex items-center gap-1.5"><Icon name="sparkles" size={15} /> AI Analysis</p>
                <Chip tone="info">{report.aiConfidence}% confidence</Chip>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ["Waste type", wasteTypeLabel(report.wasteType)],
                  ["Volume", `${volumeLabel(report.estimatedVolume)}${report.estimatedVolumeRange ? ` (${report.estimatedVolumeRange})` : ""}`],
                  ["Severity", report.severity],
                  ["Location", report.address || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg p-2.5" style={{ background: "var(--adm-surface-2)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest adm-muted mb-0.5">{k}</p>
                    <p className="font-semibold capitalize">{v}</p>
                  </div>
                ))}
              </div>
              {(report.potentialRisk || report.recommendation) && (
                <div className="mt-3 space-y-2 text-xs">
                  {report.potentialRisk && (
                    <p><span className="font-bold adm-muted uppercase text-[10px] tracking-widest mr-2">Risks</span>{report.potentialRisk}</p>
                  )}
                  {report.recommendation && (
                    <p><span className="font-bold adm-muted uppercase text-[10px] tracking-widest mr-2">Recommendation</span>{report.recommendation}</p>
                  )}
                </div>
              )}
              {report.detectionSummary?.objects?.length > 0 && (
                <div className="mt-3 pt-3 border-t adm-border-c">
                  <p className="text-[10px] font-bold uppercase tracking-widest adm-muted mb-1.5">Detected objects ({report.detectionSummary.model || "vision model"})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {report.detectionSummary.objects.map((o, i) => (
                      <Chip key={`${o.label}-${i}`} tone="outline">{o.label} · ~{o.approxAreaPct}% area</Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Citizen comment */}
            {report.comment && (
              <div className="adm-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest adm-muted mb-1">Citizen note</p>
                <p className="text-sm">“{report.comment}”</p>
              </div>
            )}

            <AiVerifyPanel report={report} onDone={load} />

            {/* Recycling routing */}
            {report.recyclableHeavy && (
              <div className="adm-card p-4">
                <p className="text-sm font-bold flex items-center gap-1.5 mb-2"><Icon name="recycle" size={15} /> Recycling routing</p>
                {report.recyclingStatus === "routed" ? (
                  <div className="flex items-center gap-2 text-xs">
                    <Chip tone="ok" dot>Routed</Chip>
                    <span><b>{report.recyclingPartner}</b> · since {formatDate(report.recyclingRoutedAt)}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {["GreenCycle Pvt Ltd", "EcoWaste Processors", "ReMaterial Hub"].map((p) => (
                      <button
                        key={p}
                        onClick={() => act(`recycle-${p}`, () => adminService.routeToRecycler(report.id, p))}
                        disabled={Boolean(busy)}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold adm-btn-ghost"
                      >
                        {busy === `recycle-${p}` ? <Spinner size={12} /> : p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <PriorityBreakdown breakdown={report.priorityBreakdown} />

            {/* Dispatch */}
            {!["resolved", "rejected", "duplicate"].includes(report.status) && (
              <div className="adm-card p-4">
                <p className="text-sm font-bold mb-2.5">Dispatch</p>
                {report.assignedTeam ? (
                  <div className="flex items-center justify-between text-xs">
                    <span>Assigned to <b>{report.assignedTeam}</b></span>
                    <Chip tone="info" dot>Active</Chip>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {openTeams.length === 0 && <p className="text-xs adm-muted">No teams available.</p>}
                    {openTeams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => act(`assign-${t.id}`, () => adminService.assignComplaint(report.id, t.id))}
                        disabled={Boolean(busy)}
                        className="w-full text-left rounded-lg px-3 py-2 border adm-border-c hover:bg-[var(--adm-surface-2)] transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-bold truncate">{t.name}</span>
                          <span className="block text-[10px] adm-muted">{t.vehicleType || "—"} · ETA {t.etaMinutes ?? "?"}m</span>
                        </span>
                        {busy === `assign-${t.id}` ? <Spinner size={13} /> : <Chip tone={t.activeTasks >= 4 ? "warn" : "ok"}>{t.activeTasks} open</Chip>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="adm-card p-4">
              <p className="text-sm font-bold mb-3">Timeline</p>
              <ol className="relative ml-1.5 border-l adm-border-c space-y-3.5">
                {(report.statusTimeline || []).map((step, i) => (
                  <li key={`${step.status}-${i}`} className="pl-4 relative">
                    <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2" style={{ background: i === (report.statusTimeline.length - 1) ? "var(--adm-primary)" : "var(--adm-border)", borderColor: "var(--adm-surface)" }} />
                    <p className="text-xs font-bold capitalize">{String(step.status).replace(/_/g, " ")}</p>
                    <p className="text-[10px] adm-muted">{formatDate(step.at)}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 pt-3 border-t adm-border-c text-[10px] adm-muted">
                Reported {relativeTime(report.createdAt)} · last update {relativeTime(report.updatedAt)}
              </p>
            </div>

            {/* Meta */}
            <div className="adm-card p-4 text-xs space-y-1.5">
              <p className="flex justify-between"><span className="adm-muted">Complaint ID</span><button onClick={() => navigator.clipboard?.writeText(report.id)} className="font-mono font-bold hover:underline" title="Copy">{report.id} <Icon name="copy" size={11} className="inline" /></button></p>
              <p className="flex justify-between"><span className="adm-muted">Coordinates</span><span className="font-mono">{Number(report.latitude).toFixed(5)}, {Number(report.longitude).toFixed(5)}</span></p>
              <p className="flex justify-between"><span className="adm-muted">Ward</span><span className="font-semibold">{report.wardId || "—"}</span></p>
              {report.duplicate?.isPotentialDuplicate && (
                <p className="flex justify-between"><span className="adm-muted">Duplicate of</span>
                  <Link to={`/admin/complaints/${report.duplicate.primaryReportId}`} className="font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{report.duplicate.primaryReportId || "—"}</Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 adm-card px-4 py-3 text-sm font-semibold adm-text animate-slideUp" style={{ boxShadow: "var(--shadow-xl)", borderLeft: "3px solid var(--adm-danger)" }}>
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}
