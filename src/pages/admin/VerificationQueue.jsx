import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import SafeImage from "../../components/SafeImage.jsx";
import { Chip, StatusChip, Icon, Spinner, Skeleton, EmptyState, ErrorState, relativeTime, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

function AiCompare({ report, onAnalyzed }) {
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
      onAnalyzed?.();
    } catch (err) {
      setError(err.message || "AI check unavailable.");
      setState("idle");
    }
  };

  return (
    <div className="mt-2.5 rounded-lg p-3" style={{ background: "var(--adm-surface-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest adm-muted">AI before/after compare</p>
        {state === "done" ? (
          <Chip tone="ok" icon={<Icon name="check" size={10} />}>Verified by AI</Chip>
        ) : (
          <button onClick={run} disabled={state === "running"} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md adm-btn-primary">
            {state === "running" ? <Spinner size={11} /> : <Icon name="sparkles" size={11} />} Run AI check
          </button>
        )}
      </div>
      {error && <p className="text-[11px] mt-1" style={{ color: "var(--adm-danger)" }}>{error}</p>}
      {state === "done" && analysis && (
        <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
          <div className="rounded-md p-2 adm-surface-bg border adm-border-c">
            <p className="font-bold uppercase text-[9px] tracking-widest adm-muted mb-0.5">Before</p>
            <p className="font-semibold">{wasteTypeLabel(report.wasteType)}</p>
            <p className="adm-muted capitalize">{report.severity} severity</p>
          </div>
          <div className="rounded-md p-2 border" style={{ borderColor: "rgba(22,163,74,0.35)", background: "rgba(22,163,74,0.07)" }}>
            <p className="font-bold uppercase text-[9px] tracking-widest mb-0.5" style={{ color: "var(--adm-ok)" }}>After</p>
            <p className="font-semibold">{wasteTypeLabel(analysis.wasteType)}</p>
            <p className="adm-muted capitalize">{analysis.severity} severity</p>
          </div>
          <p className="col-span-2 font-semibold inline-flex items-center gap-1.5" style={{ color: analysis.severity === "low" ? "var(--adm-ok)" : "var(--adm-warn)" }}>
            <Icon name={analysis.severity === "low" ? "check" : "alert"} size={13} />
            {analysis.severity === "low" ? "Cleanup looks effective — safe to resolve." : "Residue may remain — inspect before resolving."}
          </p>
        </div>
      )}
    </div>
  );
}

export default function VerificationQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const reports = await adminService.getVerificationQueue();
      setItems(reports || []);
    } catch (err) {
      setError(err.message || "Failed to load verification queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["waste:updated", "waste:status:update"], { pollMs: 45000, poll: load });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const approve = async (id) => {
    setBusyId(id);
    try {
      await adminService.updateComplaint(id, { status: "resolved" });
      showToast(`${id} resolved.`);
      await load();
    } catch (err) {
      showToast(err.message || "Resolve failed.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget || !rejectNote.trim()) return;
    setBusyId(rejectTarget.id);
    try {
      await adminService.updateComplaint(rejectTarget.id, { status: "reopened", adminNotes: rejectNote.trim() });
      showToast(`${rejectTarget.id} reopened.`);
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (err) {
      showToast(err.message || "Reopen failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Cleanup Verification</h2>
            <p className="text-sm adm-muted mt-0.5">{loading ? "Loading…" : `${items.length} submission${items.length !== 1 ? "s" : ""} awaiting review`}</p>
          </div>
          <Chip tone="info" icon={<Icon name="eye" size={12} />}>Field proof</Chip>
        </div>

        {loading && <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="adm-card"><Skeleton h={180} /></div>)}</div>}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && items.length === 0 && (
          <div className="adm-card"><EmptyState icon="check" title="Nothing to verify" body="All cleanup submissions have been reviewed." /></div>
        )}

        <div className="space-y-4">
          {items.map((r) => (
            <div key={r.id} className="adm-card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Link to={`/admin/complaints/${r.id}`} className="font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</Link>
                <StatusChip status={r.status} />
                <span className="text-xs adm-muted">{wasteTypeLabel(r.wasteType)}</span>
                <span className="text-xs adm-muted ml-auto inline-flex items-center gap-1"><Icon name="clock" size={11} />{relativeTime(r.updatedAt)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[["Before", r.beforeImage], ["After", r.afterImage]].map(([label, src]) => (
                  <figure key={label} className="rounded-lg overflow-hidden border adm-border-c">
                    {src ? <SafeImage src={src} alt={`${label} photo`} className="w-full h-44 object-cover" iconSize="text-[24px]" />
                      : <div className="w-full h-44 flex items-center justify-center adm-raised-bg adm-muted text-xs">No photo</div>}
                    <figcaption className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest adm-muted">{label}</figcaption>
                  </figure>
                ))}
              </div>

              {r.afterImage && <AiCompare report={r} onAnalyzed={load} />}

              {r.workerNotes && (
                <p className="mt-2.5 text-xs"><span className="font-bold uppercase text-[10px] tracking-widest adm-muted mr-2">Worker note</span>{r.workerNotes}</p>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => approve(r.id)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold adm-btn-primary"
                >
                  {busyId === r.id ? <Spinner size={12} /> : <Icon name="check" size={13} />} Approve & resolve
                </button>
                <button
                  onClick={() => setRejectTarget(r)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold adm-btn-ghost"
                  style={{ color: "var(--adm-danger)" }}
                >
                  <Icon name="x" size={13} /> Reject & reopen
                </button>
                <Link to={`/admin/complaints/${r.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold adm-btn-ghost ml-auto">
                  Details <Icon name="chevronRight" size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="relative adm-card w-full max-w-md p-5 space-y-4" style={{ boxShadow: "var(--shadow-xl)" }}>
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(220,38,38,0.12)", color: "var(--adm-danger)" }}>
                <Icon name="alert" size={17} />
              </span>
              <div>
                <h3 className="font-extrabold text-sm">Reject cleanup</h3>
                <p className="text-xs adm-muted">{rejectTarget.id} will be reopened for reassignment</p>
              </div>
            </div>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason for rejection (required)…"
              className="adm-input w-full h-24 p-3 text-sm resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectTarget(null)} className="flex-1 py-2.5 rounded-lg text-sm font-bold adm-btn-ghost">Cancel</button>
              <button
                onClick={reject}
                disabled={!rejectNote.trim() || busyId === rejectTarget.id}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white inline-flex items-center justify-center gap-2"
                style={{ background: "var(--adm-danger)", opacity: !rejectNote.trim() ? 0.5 : 1 }}
              >
                {busyId === rejectTarget.id ? <Spinner size={13} /> : <Icon name="x" size={14} />} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 adm-card px-4 py-3 text-sm font-semibold adm-text animate-slideUp" style={{ boxShadow: "var(--shadow-xl)", borderLeft: "3px solid var(--adm-primary)" }}>
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}
