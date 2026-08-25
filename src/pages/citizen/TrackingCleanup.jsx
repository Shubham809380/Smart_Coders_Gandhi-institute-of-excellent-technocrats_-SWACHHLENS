import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reportService, teamService } from '../../services.js';
import GoogleMap from '../../components/GoogleMap.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useLive } from '../../hooks/useLive.js';
import { Box, IconButton, Button, keyframes, TextField } from '@mui/material';
import { ArrowBack as BackIcon, Home as HomeIcon } from '@mui/icons-material';

const TIMELINE_STEPS = [
  { key: 'submitted', icon: 'flag', tk: 'timelineStepSubmitted' },
  { key: 'ai_analyzed', icon: 'smart_toy', tk: 'timelineStepAi' },
  { key: 'assigned', icon: 'group', tk: 'timelineStepAssigned' },
  { key: 'en_route', icon: 'route', tk: 'timelineStepEnRoute' },
  { key: 'cleanup_in_progress', icon: 'cleaning_services', tk: 'timelineStepCleaning' },
  { key: 'resolved', icon: 'check_circle', tk: 'timelineStepResolved' },
];
const STATUS_TO_STEP = { submitted:0, ai_analyzed:1, under_review:1, assigned:2, en_route:3, cleanup_in_progress:4, verification:5, resolved:5 };

const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fadeIn = keyframes`from{opacity:0;transform:translateY(16px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}`;
const pulseRing = keyframes`0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.8);opacity:0}`;
const radarPing = keyframes`0%{transform:scale(0.5);opacity:0.7}100%{transform:scale(3);opacity:0}`;
const drawLine = keyframes`from{height:0}to{height:var(--target-h,100%)}`;
const bounceIn = keyframes`0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}`;

function getTimelineIndex(status) { return STATUS_TO_STEP[status] ?? 0; }
function getProgressPercent(status) { return Math.round((getTimelineIndex(status) / (TIMELINE_STEPS.length - 1)) * 100); }
function formatStatus(s) { return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function formatTime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true, month:'short', day:'numeric' }); } catch { return ''; } }
function shortAddr(addr) { if (!addr) return ''; const p = addr.split(',').map(s=>s.trim()); return p.length<=2 ? addr : p.slice(0,2).join(', '); }

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers:{'Accept-Language':'en'}, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return (await r.json()).display_name || null;
  } catch { return null; }
}

function CounterVal({ target, animate }) {
  const [val, setVal] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate || rm) { setVal(target); return; }
    const num = Number(target); if (isNaN(num)) { setVal(target); return; }
    const start = performance.now(); let raf;
    const tick = (now) => { const p = Math.min((now-start)/600,1); setVal(Math.round(num*(1-Math.pow(1-p,3)))); if(p<1) raf=requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return <>{val}</>;
}

export default function TrackingCleanup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [report, setReport] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [displayAddress, setDisplayAddress] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Feedback form state (only relevant once status === resolved).
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbError, setFbError] = useState('');

  // Accept the report id from navigation state (in-app taps) or ?reportId=
  // query param (direct links, page refresh — state survives neither).
  const reportId = location.state?.reportId || new URLSearchParams(location.search).get('reportId');
  const T = isDark
    ? { canvas:'#0B1220', surface:'#161B26', glass:'rgba(22,27,38,0.7)', border:'#232A3A', text:'#E8ECF1', muted:'#8791A3', accent:'#4C8DFF',
        sevLow:'#34C77B', sevMed:'#F5A623', sevHigh:'#E5484D' }
    : { canvas:'#F5F7FA', surface:'#FFFFFF', glass:'rgba(255,255,255,0.75)', border:'#E4E8EE', text:'#12151C', muted:'#5B6472', accent:'#2E6BD6',
        sevLow:'#1FAE66', sevMed:'#D98A0E', sevHigh:'#D6393E' };

  const fetchData = useCallback(async () => {
    try {
      if (!reportId) { setLoading(false); return; }
      const d = await reportService.getReportById(reportId);
      if (d) {
        setReport(d);
        setNotFound(false);
        if (d.assignedTeam) { try { const teams = await teamService.getTeams(); const m = teams.find(t=>t.id===d.assignedTeam); if(m) setTeam(m); } catch {} }
        if (d.latitude && d.longitude && !d.address) { const a = await reverseGeocode(d.latitude, d.longitude); if(a) setDisplayAddress(a); }
        else if (d.address) setDisplayAddress(d.address);
      } else {
        setNotFound(true);
      }
    } catch(e) { console.error('Fetch report error:', e); setNotFound(true); }
    setLoading(false);
  }, [reportId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime updates: the server adds this client to the report:{id} room, so
  // every lifecycle change (status, assignment, resolution) arrives as a push.
  // The poll callback is a resilience net that only runs while disconnected —
  // never alongside a healthy socket connection.
  const { connected } = useLive(
    useCallback((evt, payload) => {
      const pid = payload?.reportId || payload?.id;
      if (pid && pid !== reportId) return;
      if (evt === 'waste:status:update' || evt === 'waste:updated' || evt === 'notification:new' || evt === 'feedback:requested') {
        fetchData();
      }
    }, [reportId, fetchData]),
    ['waste:status:update', 'waste:updated', 'notification:new', 'feedback:requested'],
    { reportId, pollMs: 30000, poll: fetchData },
  );
  useEffect(() => { if (!loading && report) { const t = setTimeout(() => setLoaded(true), rm?0:100); return () => clearTimeout(t); } }, [loading, report]);

  const submitFeedback = async () => {
    if (!rating) { setFbError(t('errorRateFirst')); return; }
    setFbSubmitting(true);
    setFbError('');
    try {
      const updated = await reportService.submitFeedback(reportId, { rating, comment: feedbackComment });
      setReport(updated);
    } catch (e) {
      setFbError(e?.message || 'Failed to submit feedback.');
    } finally {
      setFbSubmitting(false);
    }
  };

  const currentStatus = report?.status || 'submitted';
  const timelineIdx = getTimelineIndex(currentStatus);
  const progressPct = getProgressPercent(currentStatus);
  const coords = (report?.latitude && report?.longitude) ? { lat:report.latitude, lng:report.longitude } : null;

  if (loading) {
    return (
      <Box sx={{ minHeight:'100vh', bgcolor:T.canvas, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Box sx={{ textAlign:'center' }}>
          <Box sx={{ width:56, height:56, mx:'auto', position:'relative' }}>
            <Box sx={{ position:'absolute', inset:0, borderRadius:'50%', border:`3px solid ${T.accent}`, borderTopColor:'transparent', animation:`spin 0.8s linear infinite`,
              '@keyframes spin':{ to:{transform:'rotate(360deg)'} } }} />
          </Box>
          <Box sx={{ mt:3 }}>
            <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text }}>Loading report</span>
            <span style={{ display:'block', fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:T.muted, mt:0.5 }}>Fetching latest status...</span>
          </Box>
        </Box>
      </Box>
    );
  }

  const sevColor = report?.severity === 'low' ? T.sevLow : report?.severity === 'medium' ? T.sevMed : report?.severity === 'high' || report?.severity === 'critical' ? T.sevHigh : T.muted;

  // Missing id or unresolvable report → friendly empty state, never a blank page.
  if (!loading && (!reportId || notFound || !report)) {
    return (
      <Box sx={{ minHeight:'100vh', bgcolor:T.canvas, display:'flex', alignItems:'center', justifyContent:'center', px:2.5,
        fontFamily:'"Inter",sans-serif', transition:'background-color 0.25s ease' }}>
        <Box sx={{ textAlign:'center', maxWidth:340, mx:'auto',
          bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
          border:`1px solid ${T.border}`, borderRadius:2, p:4, width:'100%' }}>
          <Box sx={{ width:64, height:64, borderRadius:'50%', bgcolor:`${T.accent}15`, display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', mb:2.5 }}>
            <span className="material-symbols-outlined" style={{ fontSize:32, color:T.accent }}>search_off</span>
          </Box>
          <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:18, color:T.text, display:'block', mb:1 }}>Report Not Found</span>
          <p style={{ fontFamily:'"Inter",sans-serif', fontSize:13, color:T.muted, lineHeight:1.7, margin:'0 0 20px' }}>
            {reportId
              ? "We couldn't find this report. It may have been removed, or the tracking link is invalid."
              : "We couldn't find a report associated with this tracking link."}
          </p>
          <Button variant="contained" fullWidth onClick={() => navigate('/home')}
            sx={{ height:48, borderRadius:2, textTransform:'none', fontWeight:700, fontSize:14,
              fontFamily:'"Space Grotesk",sans-serif', bgcolor:T.sevLow,
              '&:hover': { bgcolor:T.sevLow },
              '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 } }}>
            Back to Home
          </Button>
          <Button variant="outlined" fullWidth onClick={() => navigate('/my-reports')}
            sx={{ mt:1.5, height:48, borderRadius:2, textTransform:'none', fontWeight:700, fontSize:14,
              fontFamily:'"Space Grotesk",sans-serif', borderColor:T.border, color:T.muted,
              '&:hover': { borderColor:T.muted, bgcolor: isDark ? 'rgba(135,145,163,0.08)' : 'rgba(91,100,114,0.06)' } }}>
            View My Reports
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight:'100vh', bgcolor:T.canvas, display:'flex', flexDirection:'column', fontFamily:'"Inter",sans-serif',
      transition:'background-color 0.25s ease' }}>

      {/* ─── Header ─── */}
      <Box sx={{ position:'sticky', top:0, zIndex:50, bgcolor: isDark ? 'rgba(11,18,32,0.92)' : 'rgba(245,247,250,0.92)',
        backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:`1px solid ${T.border}` }}>
        <Box sx={{ height:56, px:2, display:'flex', alignItems:'center', gap:2, pt:'env(safe-area-inset-top,0px)' }}>
          <IconButton onClick={() => navigate('/home')} size="small" sx={{ color:T.muted }}><BackIcon /></IconButton>
          <Box sx={{ flex:1 }}>
            <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:16, color:T.text }}>Track Report</span>
          </Box>
          {/* Tracking number chip */}
          <Box sx={{ border:`1px solid ${T.border}`, borderRadius:4, px:1.5, py:0.25 }}>
            <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, letterSpacing:'0.06em', fontWeight:600 }}>
              {(report?.id || '').slice(-8).toUpperCase() || '--------'}
            </span>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex:1, overflowY:'auto', pb:24 }}>
        <Box sx={{ px:2.5, pt:2.5, display:'flex', flexDirection:'column', gap:2, maxWidth:480, mx:'auto' }}>

          {/* ─── Status Banner ─── */}
          <Box sx={{
            bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
            border:`1px solid ${T.border}`, borderRadius:2, px:3, py:2.5, display:'flex', alignItems:'center', gap:2,
            borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.05s both`,
          }}>
            <Box sx={{ position:'relative', width:14, height:14, flexShrink:0 }}>
              {currentStatus !== 'resolved' && !rm && (
                <Box sx={{ position:'absolute', inset:-3, borderRadius:'50%', border:`2px solid ${T.sevLow}`, opacity:0, animation:`${pulseRing} 2.5s ease-out infinite` }} />
              )}
              <Box sx={{ width:14, height:14, borderRadius:'50%', bgcolor: currentStatus === 'resolved' ? T.accent : T.sevLow }} />
            </Box>
            <Box sx={{ flex:1 }}>
              <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text }}>{formatStatus(currentStatus)}</span>
            </Box>
            <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:13, fontWeight:700, color:T.sevLow }}>{progressPct}%</span>
          </Box>

          {/* ─── Photo Card ─── */}
          {report?.image && (
            <Box sx={{
              bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:`1px solid ${T.border}`, borderRadius:2, overflow:'hidden',
              borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
              animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.1s both`,
            }}>
              <Box sx={{ position:'relative', height:192, bgcolor: isDark ? '#1a2030' : '#E8ECF1' }}>
                <SafeImage src={report.image} alt="Report" className="w-full h-full object-cover" />
                <Box sx={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${T.canvas}, transparent 45%)` }} />
                {report.severity && (
                  <Box sx={{ position:'absolute', top:12, left:12, bgcolor:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
                    border:`1px solid rgba(255,255,255,0.1)`, borderRadius:1.5, px:2, py:0.75, boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, fontWeight:700, color:sevColor, letterSpacing:'0.05em' }}>{report.severity.toUpperCase()}</span>
                  </Box>
                )}
              </Box>
              <Box sx={{ px:3, pb:2.5, pt:1.5 }}>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:15, color:T.text }}>{report.wasteType || 'Unknown Waste'}</span>
                <Box sx={{ display:'flex', alignItems:'center', gap:1, mt:1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:14, color:T.muted }}>location_on</span>
                  {displayAddress ? (
                    <span onClick={() => setAddressExpanded(!addressExpanded)} style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, cursor:'pointer',
                      display:'-webkit-box', WebkitLineClamp: addressExpanded ? 'unset' : 2, WebkitBoxOrient:'vertical', overflow: addressExpanded ? 'visible' : 'hidden' }}>
                      {displayAddress}
                      {!addressExpanded && displayAddress.length > 40 && <span style={{ color:T.accent, fontWeight:700, marginLeft:4 }}>more</span>}
                    </span>
                  ) : coords ? (
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:12, color:T.muted }}>{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
                  ) : (
                    <span style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, fontStyle:'italic' }}>Location unavailable</span>
                  )}
                </Box>
              </Box>
            </Box>
          )}

          {/* ─── Cleanup Result: Before / After comparison ─── */}
          {report?.afterImage && (
            <Box sx={{
              bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:`1px solid ${T.border}`, borderRadius:2, overflow:'hidden',
              borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
              animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.12s both`,
            }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1.5, px:2.5, pt:2, pb:1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16, color:T.sevLow, fontVariationSettings:"'FILL' 1" }}>compare</span>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text }}>Cleanup Result</span>
                <Box sx={{ ml:'auto', bgcolor:`${T.sevLow}18`, borderRadius:1, px:1, py:0.25 }}>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, fontWeight:700, color:T.sevLow, letterSpacing:'0.05em' }}>VERIFIED BY CREW</span>
                </Box>
              </Box>
              <Box sx={{ px:2.5, pb:2.5, display:'flex', gap:1.5 }}>
                <Box sx={{ flex:1, position:'relative', borderRadius:1.5, overflow:'hidden', bgcolor: isDark ? '#1a2030' : '#E8ECF1' }}>
                  <SafeImage src={report.image || report.beforeImage} alt="Before cleanup" className="w-full h-[130px] object-cover block" iconSize="text-[18px]" />
                  <Box sx={{ position:'absolute', top:6, left:6, bgcolor:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', borderRadius:1, px:1, py:0.25 }}>
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'0.06em' }}>BEFORE</span>
                  </Box>
                </Box>
                <Box sx={{ alignSelf:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:T.sevLow }}>arrow_forward</span>
                </Box>
                <Box sx={{ flex:1, position:'relative', borderRadius:1.5, overflow:'hidden', bgcolor: isDark ? '#1a2030' : '#E8ECF1' }}>
                  <SafeImage src={report.afterImage} alt="After cleanup" className="w-full h-[130px] object-cover block" iconSize="text-[18px]" />
                  <Box sx={{ position:'absolute', top:6, left:6, bgcolor:T.sevLow, borderRadius:1, px:1, py:0.25 }}>
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'0.06em' }}>AFTER</span>
                  </Box>
                </Box>
              </Box>
              {(report.workerNotes || report.actualVolume) && (
                <Box sx={{ px:2.5, pb:2.5, mt:-1 }}>
                  <Box sx={{ border:`1px dashed ${T.border}`, borderRadius:1.5, p:1.5 }}>
                    {report.actualVolume && (
                      <Box sx={{ display:'flex', alignItems:'center', gap:1, mb: report.workerNotes ? 0.75 : 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:13, color:T.muted }}>scale</span>
                        <span style={{ fontFamily:'"Inter",sans-serif', fontSize:11, color:T.muted }}>
                          Volume cleared: <strong style={{ color:T.text, textTransform:'capitalize' }}>{String(report.actualVolume).replace(/_/g,' ')}</strong>
                        </span>
                      </Box>
                    )}
                    {report.workerNotes && (
                      <span style={{ fontFamily:'"Inter",sans-serif', fontSize:11, color:T.muted, lineHeight:1.6, display:'block' }}>
                        Crew note: “{report.workerNotes}”
                      </span>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ─── Stat Strip ─── */}
          <Box sx={{
            bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
            border:`1px solid ${T.border}`, borderRadius:2, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', p:0.5,
            borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.15s both`,
          }}>
            {[
              { icon:'psychology', color:T.accent, value: report?.aiConfidence || '—', label:'AI Conf.', pct: false },
              { icon:'priority_high', color:sevColor, value: report?.severity ? report.severity.charAt(0).toUpperCase()+report.severity.slice(1) : '—', label:'Severity', pct:false },
              { icon:'scale', color:T.sevLow, value: report?.estimatedVolume || '—', label:'Size', pct:false },
            ].map((s,i) => (
              <Box key={i} sx={{ display:'flex', alignItems:'center', gap:1.5, px:1.5, py:2, borderRight: i<2 ? `1px solid ${T.border}` : 'none' }}>
                <Box sx={{ width:32, height:32, borderRadius:'50%', bgcolor:`${s.color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:s.color }}>{s.icon}</span>
                </Box>
                <Box>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:13, fontWeight:700, color:T.text, display:'block' }}>
                    {typeof s.value === 'number' ? <CounterVal target={s.value} animate={loaded} /> : s.value}
                  </span>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, color:T.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</span>
                </Box>
              </Box>
            ))}
          </Box>

          {/* ─── Team Card ─── */}
          {team && (
            <Box sx={{
              bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:`1px solid ${T.border}`, borderRadius:2, p:2.5, display:'flex', alignItems:'center', gap:2,
              borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
              animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.2s both`,
            }}>
              <Box sx={{ width:44, height:44, borderRadius:2, background:`linear-gradient(135deg, ${T.sevLow}, ${isDark ? '#2BA066' : '#18874C'})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                boxShadow:`0 4px 12px ${T.sevLow}30` }}>
                <span className="material-symbols-outlined" style={{ fontSize:22, color:'#fff', fontVariationSettings:"'FILL' 1" }}>local_shipping</span>
              </Box>
              <Box sx={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{team.name}</span>
                <Box sx={{ display:'flex', gap:2, mt:0.5 }}>
                  <span style={{ fontFamily:'"Inter",sans-serif', fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:0.5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:13, color:T.muted }}>directions_car</span>{team.vehicle || 'Vehicle'}
                  </span>
                  <span style={{ fontFamily:'"Inter",sans-serif', fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:0.5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:13, color:T.muted }}>group</span>{team.members || 0} members
                  </span>
                </Box>
              </Box>
              {team.etaMinutes && (
                <Box sx={{ textAlign:'right', flexShrink:0 }}>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:20, fontWeight:700, color:T.sevLow, display:'block' }}>{team.etaMinutes}</span>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:9, color:T.muted, letterSpacing:'0.05em' }}>MIN ETA</span>
                </Box>
              )}
            </Box>
          )}

          {/* ─── Map Card ─── */}
          <Box sx={{
            position:'relative', width:'100%', height:192, borderRadius:2, overflow:'hidden',
            bgcolor: isDark ? '#1a2030' : '#E8ECF1',
            border:`1px solid ${T.border}`,
            borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.25s both`,
          }}>
            {coords ? (
              <>
                <GoogleMap center={coords} zoom={15} markers={[{ lat:coords.lat, lng:coords.lng, severity:report.severity, label:report.wasteType }]} className="w-full h-full" />
                <Box sx={{ position:'absolute', bottom:10, left:10, bgcolor:T.glass, backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
                  border:`1px solid ${T.border}`, borderRadius:1.5, px:2, py:1, display:'flex', alignItems:'center', gap:1.5, zIndex:10 }}>
                  <Box sx={{ position:'relative', width:8, height:8 }}>
                    <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:T.sevLow }} />
                    {!rm && <Box sx={{ position:'absolute', inset:-4, borderRadius:'50%', border:`1px solid ${T.sevLow}`, opacity:0, animation:`${pulseRing} 2.5s ease-out infinite` }} />}
                  </Box>
                  <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:11, color:T.text }}>{connected ? t('trackingActive') : t('liveOffline')}</span>
                </Box>
                <Box sx={{ position:'absolute', top:10, right:10, bgcolor:T.glass, backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
                  border:`1px solid ${T.border}`, borderRadius:1.5, px:2, py:1, zIndex:10 }}>
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted }}>{coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}</span>
                </Box>
              </>
            ) : (
              <Box sx={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
                <span className="material-symbols-outlined" style={{ fontSize:32, color:T.muted }}>map</span>
                <span style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted }}>No location data</span>
              </Box>
            )}
          </Box>

          {/* ─── Segmented Progress ─── */}
          <Box sx={{
            bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
            border:`1px solid ${T.border}`, borderRadius:2, p:2.5,
            borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.3s both`,
          }}>
            <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:2 }}>
              <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text }}>{t('trackingProgress')}</span>
              <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:13, fontWeight:700, color:T.sevLow }}>{progressPct}%</span>
            </Box>
            <Box sx={{ display:'flex', gap:0.75 }}>
              {TIMELINE_STEPS.map((step, i) => {
                const filled = i < timelineIdx;
                const current = i === timelineIdx;
                return (
                  <Box key={step.key} sx={{ flex:1, height:6, borderRadius:3, position:'relative', overflow:'hidden',
                    bgcolor: isDark ? '#1C2233' : '#E4E8EE' }}>
                    {(filled || current) && (
                      <Box sx={{ position:'absolute', inset:0, borderRadius:3,
                        background: filled ? T.sevLow : `linear-gradient(90deg, ${T.sevLow}, ${T.sevLow}60)`,
                        animation: rm ? 'none' : `${fadeIn} 0.4s ease ${0.35 + i*0.08}s both`,
                        transition: 'width 0.6s ease' }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* ─── Timeline ─── */}
          <Box sx={{
            bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
            border:`1px solid ${T.border}`, borderRadius:2, p:2.5,
            borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.35s both`,
          }}>
            <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text, display:'block', mb:2.5 }}>{t('trackingTimeline')}</span>
            {TIMELINE_STEPS.map((step, i) => {
              const isCompleted = i < timelineIdx;
              const isCurrent = i === timelineIdx;
              const isPending = i > timelineIdx;
              const isLast = i === TIMELINE_STEPS.length - 1;
              const entry = report?.statusTimeline?.find(t => {
                if (i===0) return t.status==='submitted';
                if (i===1) return t.status==='ai_analyzed'||t.status==='under_review';
                if (i===2) return t.status==='assigned';
                if (i===3) return t.status==='en_route';
                if (i===4) return t.status==='cleanup_in_progress';
                if (i===5) return t.status==='resolved'||t.status==='verification';
                return false;
              });

              return (
                <Box key={step.key} sx={{ display:'flex', gap:2, animation: rm ? 'none' : `${fadeIn} 0.4s ease ${0.4+i*0.08}s both`,
                  pb: isLast ? 0 : 2.5 }}>
                  {/* Left column: dots + line */}
                  <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center', width:28, flexShrink:0 }}>
                    {isCompleted && (
                      <Box sx={{ width:28, height:28, borderRadius:'50%', bgcolor:T.sevLow, display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow:`0 2px 8px ${T.sevLow}40`, animation: rm ? 'none' : `${bounceIn} 0.5s cubic-bezier(0.34,1.56,0.64,1) both`, animationDelay:`${0.4+i*0.08}s` }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'#fff', fontVariationSettings:"'FILL' 1" }}>check</span>
                      </Box>
                    )}
                    {isCurrent && (
                      <Box sx={{ position:'relative', width:28, height:28 }}>
                        {!rm && <Box sx={{ position:'absolute', inset:-6, borderRadius:'50%', border:`2px solid ${T.sevLow}`, opacity:0, animation:`${pulseRing} 2.5s ease-out infinite` }} />}
                        <Box sx={{ position:'relative', width:28, height:28, borderRadius:'50%', border:`2.5px solid ${T.sevLow}`, bgcolor:T.canvas, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:T.sevLow, animation:'pulse 1.5s ease-in-out infinite',
                            '@keyframes pulse':{ '0%,100%':{opacity:1,transform:'scale(1)'},'50%':{opacity:0.6,transform:'scale(0.8)'} } }} />
                        </Box>
                      </Box>
                    )}
                    {isPending && (
                      <Box sx={{ width:28, height:28, borderRadius:'50%', border:`2px solid ${isDark ? '#232A3A' : '#D6DDE5'}`, bgcolor:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14, color: isDark ? '#3a4560' : '#B0B8C4' }}>{step.icon}</span>
                      </Box>
                    )}
                    {!isLast && (
                      <Box sx={{ width:2, flex:1, minHeight:20, mt:0.75, position:'relative', overflow:'hidden', borderRadius:1, bgcolor: isDark ? '#1C2233' : '#E4E8EE' }}>
                        {(isCompleted || isCurrent) && (
                          <Box sx={{ position:'absolute', top:0, left:0, width:'100%', borderRadius:1, bgcolor: isCompleted ? T.sevLow : `${T.sevLow}50`,
                            animation: rm ? 'none' : `${drawLine} 0.5s ease ${0.5+i*0.08}s both`,
                            '--target-h': isCompleted ? '100%' : '60%' }} />
                        )}
                      </Box>
                    )}
                  </Box>
                  {/* Right column: label + time */}
                  <Box sx={{ pt:0.25, flex:1, minWidth:0 }}>
                    <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:2 }}>
                      <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:13, color: isCurrent ? T.sevLow : isCompleted ? T.text : T.muted }}>
                        {t(step.tk)}
                      </span>
                      {entry?.at && (
                        <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, flexShrink:0 }}>{formatTime(entry.at)}</span>
                      )}
                    </Box>
                    {isCurrent && (
                      <span style={{ fontFamily:'"Inter",sans-serif', fontSize:11, color:T.sevLow, display:'block', mt:0.5, fontWeight:500 }}>{t('trackingCurrentStep')}</span>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* ─── Comment ─── */}
          {report?.comment && (
            <Box sx={{
              bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:`1px solid ${T.border}`, borderRadius:2, p:2.5,
              borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
              animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.5s both`,
            }}>
              <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16, color:T.muted }}>chat_bubble</span>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:13, color:T.text }}>Your Note</span>
              </Box>
              <p style={{ fontFamily:'"Inter",sans-serif', fontSize:13, color:T.muted, lineHeight:1.7, margin:0 }}>{report.comment}</p>
            </Box>
          )}

          {/* ─── Feedback (resolved reports only) ─── */}
          {currentStatus === 'resolved' && (
            report?.feedbackRating ? (
              <Box sx={{
                bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
                border:`1px solid ${T.border}`, borderRadius:2, p:2.5,
                borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
                animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.45s both`,
              }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:1.5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:T.sevLow, fontVariationSettings:"'FILL' 1" }}>thumb_up</span>
                  <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:13, color:T.text }}>{t('feedbackSubmittedTitle')}</span>
                </Box>
                <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                  {[1,2,3,4,5].map((v) => (
                    <span key={v} className="material-symbols-outlined" style={{ fontSize:20, color: v <= report.feedbackRating ? '#F5A623' : T.muted, fontVariationSettings:"'FILL' 1" }}>star</span>
                  ))}
                  <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:T.muted, ml:1 }}>{report.feedbackRating}/5</span>
                </Box>
                {report.feedbackComment && (
                  <p style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, lineHeight:1.7, margin:'10px 0 0' }}>{report.feedbackComment}</p>
                )}
              </Box>
            ) : (
              <Box sx={{
                bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
                border:`1px solid ${T.border}`, borderRadius:2, p:2.5,
                borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
                animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.45s both`,
              }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:T.accent }}>rate_review</span>
                  <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:14, color:T.text }}>{t('feedbackTitle')}</span>
                </Box>
                <p style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, lineHeight:1.6, margin:'0 0 12px' }}>{t('feedbackSubtitle')}</p>
                <Box sx={{ display:'flex', gap:0.5, mb:1.5 }} role="radiogroup" aria-label={t('feedbackTitle')}>
                  {[1,2,3,4,5].map((v) => (
                    <IconButton
                      key={v}
                      onClick={() => { setRating(v); setFbError(''); }}
                      onMouseEnter={() => setHoverRating(v)}
                      onMouseLeave={() => setHoverRating(0)}
                      size="small"
                      aria-label={`${v} star`}
                      aria-pressed={rating === v}
                      sx={{ p:0.5, '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 } }}
                    >
                      <span className="material-symbols-outlined" style={{
                        fontSize:28,
                        color: v <= (hoverRating || rating) ? '#F5A623' : (isDark ? '#3a4560' : '#B0B8C4'),
                        fontVariationSettings:"'FILL' 1",
                        transition:'color 0.15s ease',
                      }}>star</span>
                    </IconButton>
                  ))}
                </Box>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder={t('feedbackCommentPlaceholder')}
                  inputProps={{ maxLength: 1000 }}
                  sx={{
                    mb: fbError ? 1 : 1.5,
                    '& .MuiOutlinedInput-root': { borderRadius:2, fontSize:13, color:T.text,
                      '& fieldset': { borderColor:T.border },
                      '&:hover fieldset': { borderColor:T.muted },
                      '&.Mui-focused fieldset': { borderColor:T.accent } },
                    '& .MuiInputBase-input::placeholder': { color:T.muted, opacity:1 },
                    '& .MuiFormHelperText-root': { color:T.muted },
                  }}
                />
                {fbError && (
                  <span style={{ display:'block', fontFamily:'"Inter",sans-serif', fontSize:12, color:T.sevHigh, mb:1 }}>{fbError}</span>
                )}
                <Button variant="contained" fullWidth disabled={fbSubmitting} onClick={submitFeedback}
                  sx={{ height:44, borderRadius:2, textTransform:'none', fontWeight:700, fontSize:13,
                    fontFamily:'"Space Grotesk",sans-serif', bgcolor:T.sevLow,
                    '&:hover': { bgcolor:T.sevLow }, '&:disabled': { opacity:0.6 },
                    '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 } }}>
                  {fbSubmitting ? t('loading') : t('submitFeedback')}
                </Button>
              </Box>
            )
          )}

          {/* ─── Back to Home ─── */}
          <Box sx={{
            animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.55s both`,
          }}>
            <Button variant="outlined" startIcon={<HomeIcon />} onClick={() => navigate('/home')}
              sx={{
                width:'100%', height:48, borderRadius:2, textTransform:'none', fontWeight:700, fontSize:14,
                fontFamily:'"Space Grotesk",sans-serif', borderColor:T.border, color:T.muted,
                '&:hover': { borderColor:T.muted, bgcolor: isDark ? 'rgba(135,145,163,0.08)' : 'rgba(91,100,114,0.06)' },
                '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 },
              }}>
              Back to Home
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
