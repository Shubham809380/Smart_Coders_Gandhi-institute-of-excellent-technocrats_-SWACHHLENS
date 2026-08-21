import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon, Spinner, Skeleton, EmptyState, ErrorState, relativeTime, wasteTypeLabel } from "../../components/admin/ui.jsx";
import { adminService } from "../../services.js";
import { useLive } from "../../hooks/useLive.js";

const PARTNERS = ["GreenCycle Pvt Ltd", "EcoWaste Recyclers", "City Material Recovery"];

function PartnerSelect({ value, onRoute, busy }) {
  const [partner, setPartner] = useState(PARTNERS[0]);
  return (
    <div className="flex items-center gap-2">
      <select value={partner} onChange={(e) => setPartner(e.target.value)} className="adm-input px-2 py-1.5 text-xs">
        {PARTNERS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button onClick={() => onRoute(partner)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold adm-btn-primary shrink-0">
        {busy ? <Spinner size={11} /> : <Icon name="recycle" size={12} />} Route
      </button>
    </div>
  );
}

export default function RecyclingRouting() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setItems(await adminService.getRecyclingQueue());
    } catch (err) {
      setError(err.message || "Failed to load recycling queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useLive(() => load(), ["waste:updated"], { pollMs: 60000, poll: load });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const route = async (id, partner) => {
    setBusyId(id);
    try {
      await adminService.routeToRecycler(id, partner);
      showToast(`${id} routed to ${partner}.`);
      await load();
    } catch (err) {
      showToast(err.message || "Routing failed.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = items.filter((r) => r.recyclingStatus === "pending");
  const routed = items.filter((r) => r.recyclingStatus === "routed");

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Recycling Routing</h2>
            <p className="text-sm adm-muted mt-0.5">{loading ? "Loading…" : `${pending.length} pending · ${routed.length} routed`}</p>
          </div>
          <Chip tone="ok" icon={<Icon name="recycle" size={12} />}>Heavy recyclables</Chip>
        </div>

        {loading && <div className="adm-card"><Skeleton h={220} /></div>}
        {!loading && error && <div className="adm-card"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && items.length === 0 && (
          <div className="adm-card"><EmptyState icon="recycle" title="Nothing to recycle" body="No reports flagged with heavy recyclable material right now." /></div>
        )}

        {/* Pending routing */}
        {pending.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest adm-muted">Awaiting routing</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {pending.map((r) => (
                <div key={r.id} className="adm-card p-4 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/complaints/${r.id}`} className="font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</Link>
                    <StatusChipInline status={r.status} />
                    <span className="text-xs font-semibold">{wasteTypeLabel(r.wasteType)}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] adm-muted"><Icon name="clock" size={11} />{relativeTime(r.createdAt)}</span>
                  </div>
                  <p className="text-xs adm-muted truncate">{r.address || "Unknown location"} · {r.locality || ""}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--adm-warn)" }}>
                      <Icon name="alert" size={11} /> Recyclable-heavy material detected
                    </span>
                    <PartnerSelect value="" onRoute={(p) => route(r.id, p)} busy={busyId === r.id} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Routed */}
        {routed.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest adm-muted">Routed to partners</h3>
            <div className="adm-card overflow-x-auto adm-scroll">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest adm-muted border-b adm-border-c">
                    <th className="px-4 py-2.5">Report</th>
                    <th className="px-4 py-2.5">Material</th>
                    <th className="px-4 py-2.5">Partner</th>
                    <th className="px-4 py-2.5">Routed</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routed.map((r) => (
                    <tr key={r.id} className="border-b adm-border-c last:border-0 hover:bg-[var(--adm-surface-2)] transition-colors">
                      <td className="px-4 py-2.5"><Link to={`/admin/complaints/${r.id}`} className="font-bold hover:underline" style={{ color: "var(--adm-primary)" }}>{r.id}</Link></td>
                      <td className="px-4 py-2.5 text-xs">{wasteTypeLabel(r.wasteType)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold">{r.recyclingPartner}</td>
                      <td className="px-4 py-2.5 text-xs adm-muted">{relativeTime(r.recyclingRoutedAt)}</td>
                      <td className="px-4 py-2.5"><Chip tone="ok" dot>Routed</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 adm-card px-4 py-3 text-sm font-semibold adm-text animate-slideUp" style={{ boxShadow: "var(--shadow-xl)", borderLeft: "3px solid var(--adm-primary)" }}>
          {toast}
        </div>
      )}
    </AdminLayout>
  );
}

function StatusChipInline({ status }) {
  const tone = status === "resolved" ? "ok" : status === "rejected" ? "danger" : "info";
  return <Chip tone={tone}>{String(status).replace(/_/g, " ")}</Chip>;
}
