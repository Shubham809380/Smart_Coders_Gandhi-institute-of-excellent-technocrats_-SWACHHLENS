import { useState, useEffect } from 'react';
import AdminSidebar from '../../components/AdminSidebar.jsx';
import { adminService, teamService } from '../../services.js';

function ScoreCircle({ score, strokeColor }) {
  const dashArray = `${score}, 100`;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path className="text-surface-container-highest" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray="100, 100" strokeWidth="3" />
        <path className={strokeColor} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={dashArray} strokeWidth="3" style={{ transition: 'stroke-dasharray 1s ease-in-out' }} />
      </svg>
      <span className={`text-[14px] font-extrabold ${strokeColor} leading-none`}>{score}</span>
    </div>
  );
}

export default function AIPriorityQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [teams, setTeams] = useState([]);
  const [dispatching, setDispatching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [dashData, teamData] = await Promise.all([adminService.getDashboard(), teamService.getTeams()]);
      setQueue(dashData.aiPriorityQueue || []);
      setTeams(teamData || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const selectReport = async (item) => {
    setSelected(item);
    setSuggestions([]);
    try { setSuggestions(await teamService.getDispatchSuggestions(item.id)); }
    catch (err) { console.warn('[dispatch-suggest] failed:', err?.message); }
  };

  const handleDispatch = async (reportId, teamId) => {
    setDispatching(true);
    try { await teamService.assignTeam(reportId, teamId); fetchData(); setSelected(null); setSuggestions([]); }
    catch (err) { console.error(err); }
    setDispatching(false);
  };

  const autoDispatchBestMatch = async () => {
    if (!selected) return;
    let targetTeam = null;
    if (suggestions.length > 0) targetTeam = suggestions[0].team;
    else targetTeam = teams.find((t) => t.status === 'available');
    if (!targetTeam) return;
    await handleDispatch(selected.id, targetTeam.id);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return { text: 'text-red-500', stroke: 'text-red-500' };
    if (score >= 75) return { text: 'text-amber-500', stroke: 'text-amber-400' };
    return { text: 'text-primary', stroke: 'text-green-500' };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-on-surface-variant font-medium">Loading queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar active="ai-priority-queue" />
      <main className="ml-0 lg:ml-72 flex-1 pl-16 lg:pl-0 p-4 lg:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[28px] font-extrabold text-on-surface tracking-tight">AI Priority Queue</h1>
            <p className="text-[14px] text-on-surface-variant max-w-2xl mt-1">Reports prioritized by AI based on severity, hazard level, and citizen report frequency.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-8">
          {/* Queue List */}
          <div className="lg:col-span-8 flex flex-col gap-2">
            {queue.length === 0 && (
              <div className="bg-surface rounded-3xl p-10 text-center text-on-surface-variant border border-dashed border-outline-variant/60">No pending reports in queue</div>
            )}
            {queue.map((item) => {
              const colors = getScoreColor(item.priorityScore);
              const isActive = selected?.id === item.id;
              return (
                <div key={item.id} className={`relative grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 rounded-2xl cursor-pointer transition-all duration-200 border ${isActive ? 'bg-surface shadow-md border-cyan-300 ring-1 ring-cyan-200/50' : 'bg-surface border-black/[0.03] hover:bg-surface-container-low shadow-sm'}`} onClick={() => selectReport(item)}>
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-l-2xl shadow-[0_0_8px_rgba(6,182,212,0.6)]" />}

                  <div className="col-span-full lg:col-span-2 flex flex-row lg:flex-col items-center justify-start lg:justify-center gap-3">
                    <ScoreCircle score={item.priorityScore} strokeColor={colors.stroke} />
                  </div>

                  <div className="col-span-full lg:col-span-5 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-surface-container flex items-center justify-center border border-black/[0.04]">
                      {item.image ? <div className="bg-cover bg-center w-full h-full" style={{ backgroundImage: `url('${item.image}')` }} /> : <span className="material-symbols-outlined text-on-surface-variant text-[18px]">photo</span>}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${item.severity === 'critical' ? 'bg-red-50 text-red-600 border border-red-200' : item.severity === 'high' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-surface-container text-on-surface-variant'}`}>{item.severity}</span>
                        <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-lg text-[10px] font-extrabold uppercase tracking-wider">{item.estimatedVolume}</span>
                      </div>
                      <span className="text-[14px] font-bold text-on-surface truncate">{item.wasteType?.replace(/_/g, ' ')}</span>
                      <span className="text-[12px] text-on-surface-variant truncate flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[13px]">location_on</span>{item.address}</span>
                    </div>
                  </div>

                  <div className="col-span-full lg:col-span-3 flex items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span className="text-[12px] font-medium">{item.id}</span>
                  </div>

                  <div className="col-span-full lg:col-span-2 flex items-center justify-start lg:justify-end">
                    <button className="bg-primary text-white px-4 py-2 rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-[0.96]" onClick={(e) => { e.stopPropagation(); selectReport(item); }}>
                      Dispatch<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Analysis Panel */}
          <div className="lg:col-span-4 flex flex-col h-auto lg:h-[calc(100vh-140px)] lg:sticky lg:top-20">
            <div className="bg-surface rounded-3xl shadow-md flex flex-col h-full overflow-hidden border border-black/[0.03]">
              <div className="p-5 border-b border-surface-container-high">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-cyan-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <h2 className="text-[16px] font-extrabold text-on-surface">AI Priority Analysis</h2>
                </div>
                <p className="text-[12px] font-medium text-on-surface-variant">{selected ? `Report: ${selected.id}` : 'Select a report'}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                {selected ? (
                  <>
                    <div className="flex flex-col gap-2.5">
                      <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">Why Priority {selected.priorityScore}?</h3>
                      {(selected.priorityReasons || ['Severity assessment', 'Volume estimation']).map((reason, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-surface-container rounded-xl">
                          <span className="material-symbols-outlined text-cyan-600 mt-0.5 text-[18px]">science</span>
                          <span className="text-[13px] text-on-surface-variant leading-relaxed">{reason}</span>
                        </div>
                      ))}
                    </div>

                    {selected.potentialRisk && (
                      <div className="flex flex-col gap-2">
                        <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">Potential Risk</h3>
                        <p className="text-[14px] text-on-surface-variant leading-relaxed">{selected.potentialRisk}</p>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <h3 className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">Recommendation</h3>
                      <p className="text-[14px] text-on-surface-variant leading-relaxed">{selected.recommendation}</p>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-on-surface-variant text-[13px] font-medium">Select a report to view analysis</div>
                )}
              </div>

              {selected && (
                <div className="p-5 border-t border-surface-container-high">
                  <h3 className="text-[11px] font-extrabold text-cyan-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">psychology</span> AI-Matched Teams
                  </h3>
                  <div className="flex flex-col gap-2 mb-3 max-h-52 overflow-y-auto">
                    {suggestions.length > 0 && suggestions.map((sug, idx) => (
                      <div key={sug.team.id} className={`p-3 rounded-xl border ${idx === 0 ? 'bg-cyan-50/60 border-cyan-200' : 'bg-surface-container'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#00873a]/10 flex items-center justify-center shrink-0 relative">
                              <span className="material-symbols-outlined text-[#006b2c] text-[16px]">group</span>
                              {idx === 0 && <span className="absolute -top-1.5 -right-1.5 px-1 py-px rounded-md bg-cyan-600 text-white text-[8px] font-extrabold">AI</span>}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[13px] font-bold text-on-surface block truncate">{sug.team.name}</span>
                              <span className="text-[10px] font-semibold text-on-surface-variant">Match {Math.min(100, sug.score)}% · {sug.team.vehicle || 'no vehicle'} · {sug.team.activeTasks ?? 0} active</span>
                            </div>
                          </div>
                          <button onClick={() => handleDispatch(selected.id, sug.team.id)} disabled={dispatching} className="bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0">
                            {dispatching ? '...' : 'Dispatch'}
                          </button>
                        </div>
                        {idx === 0 && sug.reasons?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {sug.reasons.slice(0, 4).map((reason, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-cyan-100/70 text-cyan-800 text-[9px] font-bold">{reason}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {suggestions.length === 0 && teams.filter(t => t.status === 'available').map(team => (
                      <div key={team.id} className="flex items-center justify-between p-3 bg-surface-container rounded-xl">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#00873a]/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[#006b2c] text-[16px]">group</span>
                          </div>
                          <div>
                            <span className="text-[13px] font-bold text-on-surface">{team.name}</span>
                            <span className="text-[11px] text-on-surface-variant block">{team.vehicle} · {team.distanceKm}km</span>
                          </div>
                        </div>
                        <button onClick={() => handleDispatch(selected.id, team.id)} disabled={dispatching} className="bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50">
                          {dispatching ? '...' : 'Dispatch'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={autoDispatchBestMatch}
                    disabled={dispatching || (suggestions.length === 0 && teams.filter(t => t.status === 'available').length === 0)}
                    className="w-full bg-primary text-white py-3 rounded-2xl text-[14px] font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                    style={{ boxShadow: "0 6px 16px -4px rgba(0,107,44,0.3)" }}
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span> {dispatching ? 'Dispatching...' : 'Auto-Dispatch Best Match'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
