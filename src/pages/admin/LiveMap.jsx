import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import HeatMap from "../../components/admin/HeatMap.jsx";
import { PriorityRing, Chip, StatusChip, Icon, Spinner, Skeleton, EmptyState, ErrorState, relativeTime, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

export default function LiveMap() {
  const [cells, setCells] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);
  const [showPins, setShowPins] = useState(true);
  const mapApiRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [cellData, complaintData] = await Promise.all([
        adminService.getHotspotCells(),
        adminService.getComplaints({ status: "open", sort: "priority" }),
      ]);
      setCells(cellData);
      setReports((complaintData.reports || []).filter((r) => r.latitude && r.longitude));
    } catch (err) {
      setError(err.message || "Failed to load map data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { connected } = useLive(() => load(), ["waste:created", "waste:updated", "waste:status:update"], { pollMs: 45000, poll: load });

  const topList = useMemo(() => reports.slice(0, 12), [reports]);
  const totalOpen = reports.length;
  const hottest = cells[0];

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="adm-card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-widest adm-muted">Open complaints</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{loading ? "…" : totalOpen}</p>
          </div>
          <div className="adm-card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-widest adm-muted">Active hotspots</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{loading ? "…" : cells.length}</p>
          </div>
          <div className="adm-card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-widest adm-muted">Hottest cell</p>
            {hottest ? (
              <p className="text-sm font-bold mt-1 truncate" title={hottest.topWasteType}>
                {wasteTypeLabel(hottest.topWasteType)} · {hottest.reportCount} rpt{hottest.reportCount > 1 ? "s" : ""}
              </p>
            ) : <p className="text-sm adm-muted mt-1">—</p>}
          </div>
          <div className="adm-card p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest adm-muted">Layers</p>
              <p className="text-xs adm-muted mt-0.5">Heat + pins</p>
            </div>
            <button
              onClick={() => setShowPins(!showPins)}
              className={`relative w-10 h-5 rounded-full transition-colors ${showPins ? "" : ""}`}
              style={{ background: showPins ? "var(--adm-primary)" : "var(--adm-border)" }}
              aria-label="Toggle pins"
            >
              <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: showPins ? 22 : 2 }} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          {/* Map */}
          <div className="adm-card overflow-hidden relative" style={{ height: "calc(100vh - 220px)", minHeight: 420 }}>
            {error ? (
              <ErrorState message={error} onRetry={load} />
            ) : loading ? (
              <div className="flex items-center justify-center h-full"><Spinner size={22} /></div>
            ) : (
              <>
                <HeatMap
                  cells={cells}
                  reports={showPins ? reports : []}
                  height="100%"
                  onPinClick={(report) => setFocusId(report.id)}
                />
                {/* Legend — anchored to the map container (parent is relative), never the viewport */}
                <div className="absolute bottom-4 left-4 z-[500] adm-card px-3 py-2.5 text-[11px] space-y-1.5 pointer-events-none max-w-[calc(100%-2rem)]">
                  <p className="font-bold uppercase tracking-widest adm-muted text-[9px]">Density</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-24 h-2 rounded-full" style={{ background: "linear-gradient(90deg, #1A6B9E, #00A896, #D9A40E, #F0763B, #E5484D)" }} />
                    <span>low → high</span>
                  </div>
                  <p className="font-bold uppercase tracking-widest adm-muted text-[9px] pt-1">Status</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[200px]">
                    {[["#4C8DFF", "New"], ["#D9A40E", "Review"], ["#00A896", "In field"], ["#8B5CF6", "Verify"], ["#E5484D", "Reopened"]].map(([c, l]) => (
                      <span key={l} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}</span>
                    ))}
                  </div>
                </div>
                {!connected && (
                  <div className="absolute top-4 right-4 z-[500]">
                    <Chip tone="warn" dot>Offline — polling</Chip>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Synced priority list */}
          <div className="adm-card overflow-hidden flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: 420 }}>
            <div className="px-4 py-3 border-b adm-border-c flex items-center justify-between shrink-0">
              <p className="text-sm font-bold">Top priorities</p>
              <Link to="/admin/queue" className="text-xs font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>Full queue</Link>
            </div>
            <div className="flex-1 overflow-y-auto adm-scroll">
              {loading && <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={52} />)}</div>}
              {!loading && topList.length === 0 && <EmptyState icon="map" title="No open complaints" body="The city map is clear right now." />}
              {topList.map((r) => (
                <div
                  key={r.id}
                  onFocus={() => setFocusId(r.id)}
                  onMouseEnter={() => setFocusId(r.id)}
                  className={`px-4 py-2.5 border-b adm-border-c last:border-0 cursor-pointer transition-colors hover:bg-[var(--adm-surface-2)] ${focusId === r.id ? "bg-[var(--adm-surface-2)]" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <PriorityRing score={r.effectivePriority?.score ?? r.priorityScore} level={r.effectivePriority?.level} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link to={`/admin/complaints/${r.id}`} className="text-[13px] font-bold hover:underline truncate" style={{ color: "var(--adm-primary)" }}>{r.id}</Link>
                        <StatusChip status={r.status} />
                      </div>
                      <p className="text-[11px] adm-muted truncate">{r.address || "Unknown"}</p>
                      <p className="text-[10px] adm-muted">{wasteTypeLabel(r.wasteType)} · {relativeTime(r.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
