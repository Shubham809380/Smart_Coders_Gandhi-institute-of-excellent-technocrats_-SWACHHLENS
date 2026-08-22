import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, IconButton, Button, keyframes } from '@mui/material';
import { ArrowBack as BackIcon, Send as SendIcon, Replay as ReplayIcon } from '@mui/icons-material';
import { reportService } from '../../services.js';
import { useTheme } from '../../contexts/ThemeContext.jsx';

const WASTE_ICONS = {
  overflowing_bin: 'delete', garbage_dump: 'delete_sweep', plastic_waste: 'recycling',
  organic_waste: 'compost', construction_debris: 'construction', e_waste: 'devices_other',
  hazardous_waste: 'skull', drain_blockage: 'water_drop', other: 'inventory_2',
};
const WASTE_LABELS = {
  overflowing_bin: 'Overflowing Bin', garbage_dump: 'Garbage Dump', plastic_waste: 'Plastic Waste',
  organic_waste: 'Organic Waste', construction_debris: 'Construction Debris', e_waste: 'E-Waste',
  hazardous_waste: 'Hazardous Waste', drain_blockage: 'Drain Blockage', other: 'Mixed Waste',
};
const SEV = {
  low:      { angle: 30,  label: 'Low Risk',    pct: 25 },
  medium:   { angle: 90,  label: 'Medium Risk',  pct: 55 },
  high:     { angle: 140, label: 'High Risk',    pct: 80 },
  critical: { angle: 170, label: 'Critical',     pct: 95 },
};
const VOLUME_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', very_large: 'Very Large' };

const rm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fadeIn = keyframes`from{opacity:0;transform:translateY(20px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}`;
const scanSweep = keyframes`from{top:-4px}to{top:calc(100% + 4px)}`;
const stampSnap = keyframes`0%{transform:scale(2.5) rotate(-30deg);opacity:0}55%{transform:scale(0.92) rotate(4deg);opacity:1}75%{transform:scale(1.05) rotate(-1deg)}100%{transform:scale(1) rotate(0deg)}`;
const stampGlow = keyframes`0%,100%{box-shadow:0 0 0 0 rgba(76,141,255,0.35)}50%{box-shadow:0 0 0 8px rgba(76,141,255,0)}`;
const radarPing = keyframes`0%{transform:scale(0.5);opacity:0.7}100%{transform:scale(3);opacity:0}`;
const shimmer = keyframes`0%{background-position:-200% 0}100%{background-position:200% 0}`;
const spinAnim = keyframes`to{transform:rotate(360deg)}`;
const checkBounce = keyframes`0%{transform:scale(0);opacity:0}50%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}`;

export default function AIResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitDone, setSubmitDone] = useState(false);
  const [phase, setPhase] = useState(rm ? 'ready' : 'scan');

  useEffect(() => {
    if (rm) return;
    const t1 = setTimeout(() => setPhase('verdict'), 850);
    const t2 = setTimeout(() => setPhase('cards'), 1400);
    const t3 = setTimeout(() => setPhase('ready'), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const routeState = location.state || {};
  const draft = reportService.getDraft();
  const analysis = useMemo(() => {
    if (routeState.analysis) return routeState.analysis;
    const ai = draft.aiResult || {};
    return {
      wasteType: ai.wasteType || 'other', severity: ai.severity || 'medium',
      estimatedVolume: ai.estimatedVolume || 'medium', estimatedVolumeRange: ai.estimatedVolumeRange || '',
      potentialRisk: ai.potentialRisk || ai.potentialRisks?.[0] || '',
      potentialRisks: ai.potentialRisks || [], confidence: ai.confidence || 0,
      recommendation: ai.recommendation || '', duplicateReportExists: Boolean(draft.duplicateMatch),
      detectionSummary: ai.detectionSummary || null, dispatch: ai.dispatch || null,
      processingTime: ai.processingTime || null, models: ai.models || null,
      imageWarning: ai.imageWarning || '',
    };
  }, [routeState, draft]);
  const reportData = useMemo(() => {
    if (routeState.report) return routeState.report;
    return {
      id: draft.id || '', image: draft.image || '',
      address: draft.location?.address || 'Current Location',
      location: draft.location || { latitude: 20.2961, longitude: 85.8245 },
      comment: draft.comment || '',
    };
  }, [routeState, draft]);

  const wasteLabel = analysis.needsReview ? 'Needs Review' : (WASTE_LABELS[analysis.wasteType] || 'Unknown Waste');
  const wasteIcon = WASTE_ICONS[analysis.wasteType] || 'category';
  const confidence = analysis.confidence || 0;
  const severity = analysis.severity || 'medium';
  const sevDef = SEV[severity] || SEV.medium;
  const volumeLabel = VOLUME_LABELS[analysis.estimatedVolume] || String(analysis.estimatedVolume || '').replace('_', ' ');
  const risks = analysis.potentialRisks?.length ? analysis.potentialRisks : (analysis.potentialRisk ? [analysis.potentialRisk] : []);
  const lat = reportData.location?.latitude || 20.2961;
  const lng = reportData.location?.longitude || 85.8245;

  const handleSubmit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const created = await reportService.createReport({
        image: reportData.image, video: draft.video || '',
        aiResult: { wasteType: analysis.wasteType, severity: analysis.severity, estimatedVolume: analysis.estimatedVolume, potentialRisk: risks.join(', '), confidence: analysis.confidence, recommendation: analysis.recommendation },
        location: reportData.location, comment: reportData.comment,
      });
      reportService.resetDraft();
      setSubmitDone(true);
      setTimeout(() => navigate('/success', { state: { reportId: created.id } }), 1200);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit report.');
      setSubmitting(false);
    }
  };

  const T = isDark
    ? { canvas:'#0B1220', surface:'#161B26', glass:'rgba(22,27,38,0.7)', border:'#232A3A', text:'#E8ECF1', muted:'#8791A3', accent:'#4C8DFF',
        sevLow:'#34C77B', sevMed:'#F5A623', sevHigh:'#E5484D', gridColor:'rgba(76,141,255,0.04)' }
    : { canvas:'#F5F7FA', surface:'#FFFFFF', glass:'rgba(255,255,255,0.75)', border:'#E4E8EE', text:'#12151C', muted:'#5B6472', accent:'#2E6BD6',
        sevLow:'#1FAE66', sevMed:'#D98A0E', sevHigh:'#D6393E', gridColor:'rgba(46,107,214,0.04)' };
  const sevColor = severity === 'low' ? T.sevLow : severity === 'medium' ? T.sevMed : T.sevHigh;

  return (
    <Box sx={{ minHeight:'100vh', bgcolor:T.canvas, display:'flex', flexDirection:'column', fontFamily:'"Inter",sans-serif',
      transition:'background-color 0.25s ease' }}>

      {/* ─── Header ─── */}
      <Box sx={{ position:'sticky', top:0, zIndex:50, bgcolor: isDark ? 'rgba(11,18,32,0.92)' : 'rgba(245,247,250,0.92)',
        backdropFilter:'blur(20px)', borderBottom:`1px solid ${T.border}`, WebkitBackdropFilter:'blur(20px)' }}>
        <Box sx={{ height:56, px:2, display:'flex', alignItems:'center', gap:2, pt:'env(safe-area-inset-top,0px)' }}>
          <IconButton onClick={() => navigate(-1)} size="small" sx={{ color:T.muted }}><BackIcon /></IconButton>
          <Box sx={{ flex:1 }}>
            <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:16, color:T.text }}>AI Analysis</span>
            <span style={{ display:'block', fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, letterSpacing:'0.04em' }}>SwachhLens Intelligence</span>
          </Box>
          {/* Wax-seal stamp */}
          <Box sx={{
            width:38, height:38, borderRadius:'50%', border:`2px solid ${!analysis.needsReview ? T.accent : T.sevMed}`,
            display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
            animation: phase !== 'scan' && !rm
              ? `${stampSnap} 0.5s cubic-bezier(0.34,1.56,0.64,1) both, ${stampGlow} 3s ease-in-out 0.5s infinite`
              : 'none',
            boxShadow: phase !== 'scan' && !rm ? `0 0 20px ${isDark ? 'rgba(76,141,255,0.15)' : 'rgba(46,107,214,0.12)'}` : 'none',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:!analysis.needsReview ? T.accent : T.sevMed, fontVariationSettings:"'FILL' 1" }}>
              {!analysis.needsReview ? 'verified' : 'pending'}
            </span>
          </Box>
        </Box>
      </Box>

      {/* ─── Scrollable content ─── */}
      <Box sx={{ flex:1, overflowY:'auto', pb:'120px', position:'relative' }}>

        {/* Low-confidence image soft warning (gatekeeper) */}
        {analysis.imageWarning && phase !== 'scan' && (
          <Box sx={{ mx:2, mt:2, display:'flex', gap:1.5, alignItems:'flex-start', px:1.75, py:1.5, borderRadius:2,
            bgcolor: isDark ? 'rgba(255,179,0,0.08)' : 'rgba(255,179,0,0.14)',
            border:'1px solid rgba(255,179,0,0.4)', animation: rm ? 'none' : `${fadeIn} 0.4s ease` }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'#D48806', fontVariationSettings:"'FILL' 1" }}>warning_amber</span>
            <span style={{ fontSize:12, lineHeight:1.55, color:T.text }}>{analysis.imageWarning}</span>
          </Box>
        )}

        {/* Scan overlay */}
        {!rm && phase === 'scan' && (
          <Box sx={{ position:'absolute', inset:0, zIndex:20, pointerEvents:'none', overflow:'hidden' }}>
            <Box sx={{ position:'absolute', left:0, right:0, height:3, bgcolor:T.accent, opacity:0.7, filter:'blur(2px)',
              boxShadow:`0 0 20px 4px ${T.accent}`, animation:`${scanSweep} 0.8s ease-in-out forwards` }} />
            {/* Grid noise texture */}
            <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity: isDark ? 0.03 : 0.02 }}>
              <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={T.accent} strokeWidth="0.5" />
              </pattern></defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </Box>
        )}

        {/* Hero image */}
        <Box sx={{ position:'relative', width:'100%', aspectRatio:'16/9', maxHeight:220, overflow:'hidden',
          opacity: phase === 'scan' && !rm ? 0.6 : 1, transition:'opacity 0.5s ease' }}>
          {reportData.image ? (
            <Box component="img" src={reportData.image} alt="Waste" sx={{ width:'100%', height:'100%', objectFit:'cover' }} />
          ) : (
            <Box sx={{ width:'100%', height:'100%', bgcolor: isDark ? '#1a2030' : '#E8ECF1', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:48, color: isDark ? '#3a4560' : '#B0B8C4' }}>{wasteIcon}</span>
            </Box>
          )}
          <Box sx={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${T.canvas}, ${isDark ? 'rgba(11,18,32,0.3)' : 'rgba(245,247,250,0.3)'} 50%, transparent)` }} />
          <Box sx={{ position:'absolute', bottom:12, left:16, right:16, display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
            <Box>
              <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em' }}>WASTE TYPE</span>
              <span style={{ display:'block', fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:18, color:T.text }}>{wasteLabel}</span>
            </Box>
            <Box sx={{ bgcolor: isDark ? 'rgba(76,141,255,0.12)' : 'rgba(46,107,214,0.08)', border:`1px solid ${isDark ? 'rgba(76,141,255,0.25)' : 'rgba(46,107,214,0.2)'}`, px:2, py:0.75, borderRadius:1.5 }}>
              <ConfidenceCounter target={confidence} animate={phase !== 'scan'} mono />
            </Box>
          </Box>
        </Box>

        <Box sx={{ px:2.5, pt:2.5, display:'flex', flexDirection:'column', gap:2 }}>

          {/* ─── Severity Dial ─── */}
          <Box sx={{ textAlign:'center', py:2, animation: rm ? 'none' : `${fadeIn} 0.6s ease 0.1s both` }}>
            <SeverityDial severity={severity} animate={phase !== 'scan'} isDark={isDark} sevColor={sevColor} />
            <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:22, color:sevColor, display:'block', mt:1.5,
              textShadow: isDark ? `0 0 20px ${sevColor}40` : 'none' }}>{sevDef.label}</span>
            <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:T.muted, display:'block', mt:0.5 }}>
              Confidence: {confidence}% · Volume: {volumeLabel}
            </span>
          </Box>

          {/* ─── Needs Review Banner ─── */}
          {analysis.needsReview && (
            <GlassCard T={T} delay={0.12} borderLeftColor={T.sevMed}>
              <Box sx={{ display:'flex', alignItems:'flex-start', gap:1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:T.sevMed, mt:0.5 }}>info</span>
                <Box>
                  <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:13, color:T.sevMed }}>Low-Confidence Detection</span>
                  <span style={{ display:'block', fontFamily:'"Inter",sans-serif', fontSize:12, color: isDark ? '#C08B30' : '#9A6B0A', mt:0.5, lineHeight:1.5 }}>Uses COCO-to-waste fallback mapping. Requires fine-tuned model for production accuracy.</span>
                </Box>
              </Box>
            </GlassCard>
          )}

          {/* ─── Classification Card ─── */}
          <GlassCard T={T} title="CLASSIFICATION" icon="category" iconColor={sevColor} delay={0.15}>
            <Box sx={{ display:'flex', alignItems:'center', gap:2, mt:1.5 }}>
              <Box sx={{ width:44, height:44, borderRadius:1.5, bgcolor: isDark ? '#1a2535' : '#F0F3F7', display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}` }}>
                <span className="material-symbols-outlined" style={{ fontSize:24, color:T.text }}>{wasteIcon}</span>
              </Box>
              <Box sx={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:16, color:T.text }}>{wasteLabel}</span>
                <span style={{ display:'block', fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:T.muted, mt:0.25 }}>
                  {analysis.needsReview ? `${confidence}% confidence — review needed` : `${confidence}% match confidence`}
                </span>
              </Box>
            </Box>
          </GlassCard>

          {/* ─── Potential Risk ─── */}
          {risks.length > 0 && (
            <GlassCard T={T} title="POTENTIAL RISK" icon="shield" iconColor={T.sevHigh} delay={0.2}>
              <Box component="ul" sx={{ m:0, pl:2, mt:1.5, display:'flex', flexDirection:'column', gap:0.75, listStyle:'none' }}>
                {risks.map((r, i) => (
                  <Box key={i} component="li" sx={{ display:'flex', alignItems:'flex-start', gap:1.5 }}>
                    <span style={{ color:T.sevHigh, fontSize:8, marginTop:5 }}>&#9679;</span>
                    <span style={{ fontFamily:'"Inter",sans-serif', fontSize:13, color:T.muted, lineHeight:1.6 }}>{r}</span>
                  </Box>
                ))}
              </Box>
            </GlassCard>
          )}

          {/* ─── Recommendation ─── */}
          {analysis.recommendation && (
            <GlassCard T={T} title="RECOMMENDATION" icon="tips_and_updates" iconColor={T.accent} delay={0.25}>
              <p style={{ fontFamily:'"Inter",sans-serif', fontSize:13, color:T.muted, lineHeight:1.7, margin:'12px 0 0' }}>{analysis.recommendation}</p>
            </GlassCard>
          )}

          {/* ─── Dispatch Plan ─── */}
          {analysis.dispatch && (
            <GlassCard T={T} title="DISPATCH PLAN" icon="local_shipping" iconColor={T.sevLow} delay={0.3}>
              <Box sx={{ mt:1.5 }}>
                {analysis.dispatch.team && <FieldRow label="TEAM" value={analysis.dispatch.team} T={T} />}
                {analysis.dispatch.vehicle && <FieldRow label="VEHICLE" value={analysis.dispatch.vehicle} T={T} />}
                {analysis.dispatch.sla_hours && <FieldRow label="SLA" value={`${analysis.dispatch.sla_hours}h`} T={T} mono />}
                {analysis.dispatch.priority && <FieldRow label="PRIORITY" value={analysis.dispatch.priority} T={T} />}
              </Box>
              {analysis.dispatch.instructions && (
                <p style={{ fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, lineHeight:1.6, margin:'8px 0 0' }}>{analysis.dispatch.instructions}</p>
              )}
            </GlassCard>
          )}

          {/* ─── Sensor Readout Strip ─── */}
          {analysis.detectionSummary && analysis.detectionSummary.count > 0 && (
            <Box sx={{ animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.35s both` }}>
              <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em', display:'block', mb:1.5 }}>Detection Details</span>
              <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1 }}>
                {[
                  { label:'OBJECTS', value:analysis.detectionSummary.count, numeric:true },
                  { label:'COVERAGE', value:`${analysis.detectionSummary.coveragePercent}`, suffix:'%', numeric:true },
                  { label:'PROCESSED', value:analysis.processingTime || '—', suffix:analysis.processingTime ? 'ms' : '', numeric:!!analysis.processingTime },
                ].map((item) => (
                  <Box key={item.label} sx={{
                    bgcolor: T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
                    border:`1px solid ${T.border}`, borderRadius:2, p:1.5, textAlign:'center',
                    borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
                  }}>
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:20, fontWeight:700, color:T.text, display:'block' }}>
                      {item.numeric ? <CounterValue target={item.value} animate={phase === 'ready'} /> : item.value}{item.suffix || ''}
                    </span>
                    <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:8, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{item.label}</span>
                  </Box>
                ))}
              </Box>
              {analysis.detectionSummary.classes?.length > 0 && (
                <Box sx={{ mt:1.5, display:'flex', gap:0.75, flexWrap:'wrap' }}>
                  {analysis.detectionSummary.classes.map((cls, i) => (
                    <span key={i} style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted,
                      bgcolor: isDark ? '#1a2535' : '#F0F3F7', border:`1px solid ${T.border}`, borderRadius:4, px:1.5, py:0.5 }}>
                      {WASTE_LABELS[cls] || cls}
                    </span>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* ─── Location ─── */}
          {reportData.address && (
            <Box sx={{
              bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              border:`1px solid ${T.border}`, borderRadius:2, p:2.5, display:'flex', alignItems:'center', gap:2,
              borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
              animation: rm ? 'none' : `${fadeIn} 0.5s ease 0.4s both`,
            }}>
              <Box sx={{ width:40, height:40, borderRadius:1.5, bgcolor: isDark ? '#1a2535' : '#F0F3F7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:`1px solid ${T.border}`, position:'relative' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:T.accent }}>location_on</span>
                {!rm && (
                  <Box sx={{ position:'absolute', inset:-4, borderRadius:'50%', border:`1px solid ${T.accent}`, opacity:0, animation:`${radarPing} 3s ease-out infinite` }} />
                )}
              </Box>
              <Box sx={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em' }}>LOCATION</span>
                <span style={{ display:'block', fontFamily:'"Inter",sans-serif', fontSize:13, color:T.text, fontWeight:500, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{reportData.address}</span>
                <span style={{ display:'block', fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:T.muted, marginTop:2 }}>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
              </Box>
            </Box>
          )}

          {/* ─── Duplicate Warning ─── */}
          {analysis.duplicateReportExists && (
            <GlassCard T={T} delay={0.45} borderLeftColor={T.sevMed}>
              <Box sx={{ display:'flex', gap:2 }}>
                <span className="material-symbols-outlined" style={{ fontSize:20, color:T.sevMed }}>content_copy</span>
                <Box>
                  <span style={{ fontFamily:'"Space Grotesk",sans-serif', fontWeight:700, fontSize:13, color:T.sevMed }}>Similar Report Detected</span>
                  <span style={{ display:'block', fontFamily:'"Inter",sans-serif', fontSize:12, color:T.muted, mt:0.5, lineHeight:1.5 }}>A similar report exists nearby. Submitting may create a duplicate entry.</span>
                </Box>
              </Box>
            </GlassCard>
          )}
        </Box>
      </Box>

      {/* ─── Footer ─── */}
      <Box sx={{ position:'fixed', bottom:0, left:0, right:0, zIndex:50,
        bgcolor: isDark ? 'rgba(11,18,32,0.95)' : 'rgba(245,247,250,0.95)',
        backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
        borderTop:`1px solid ${T.border}`, pb:'env(safe-area-inset-bottom,0px)' }}>
        {submitError && (
          <Box sx={{ px:2.5, pt:2, display:'flex', alignItems:'center', gap:1 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#E5484D' }}>error</span>
            <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:11, color:'#E5484D', fontWeight:600 }}>{submitError}</span>
          </Box>
        )}
        <Box sx={{ px:2.5, py:2, display:'flex', gap:2 }}>
          <Button variant="outlined" startIcon={<ReplayIcon sx={{ animation: submitting ? 'none' : undefined }} />} disabled={submitting}
            onClick={() => navigate('/report-waste')}
            sx={{
              flexShrink:0, borderRadius:2, textTransform:'none', fontWeight:700, fontFamily:'"Space Grotesk",sans-serif',
              borderColor:T.border, color:T.muted, fontSize:13,
              '&:hover': { borderColor:T.muted, bgcolor: isDark ? 'rgba(135,145,163,0.08)' : 'rgba(91,100,114,0.06)' },
              '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 },
            }}>
            Retake
          </Button>
          <Button variant="contained" disabled={submitting || submitDone} onClick={handleSubmit}
            endIcon={submitDone ? null : submitting ? null : <SendIcon />}
            sx={{
              flex:1, borderRadius:2, textTransform:'none', fontWeight:700, fontSize:14, fontFamily:'"Space Grotesk",sans-serif',
              bgcolor: submitDone ? T.sevLow : T.accent, color:'#fff',
              boxShadow: submitDone ? `0 8px 24px -4px ${T.sevLow}40` : isDark ? '0 8px 24px -4px rgba(76,141,255,0.4)' : '0 8px 24px -4px rgba(46,107,214,0.3)',
              transition:'background-color 0.3s, box-shadow 0.3s',
              '&:hover': { bgcolor: submitDone ? T.sevLow : isDark ? '#3a7aee' : '#2560B8' },
              '&:disabled': { bgcolor: isDark ? '#2a3550' : '#C8CDD4', color: isDark ? '#5a6580' : '#8791A3' },
              '&:focus-visible': { outline:`2px solid ${T.accent}`, outlineOffset:2 },
            }}>
            {submitDone ? (
              <Box sx={{ display:'flex', alignItems:'center', gap:1, animation:`${checkBounce} 0.4s ease both` }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, fontVariationSettings:"'FILL' 1" }}>check_circle</span>
                <span style={{ fontFamily:'"Space Grotesk",sans-serif' }}>Submitted</span>
              </Box>
            ) : submitting ? (
              <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                <Box sx={{ width:18, height:18, border:'2px solid', borderColor:'white', borderTopColor:'transparent', borderRadius:'50%', animation:`${spinAnim} 0.8s linear infinite` }} />
                <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:12 }}>Submitting...</span>
              </Box>
            ) : 'Submit Report'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

/* ─── Sub-components ─── */

function SeverityDial({ severity, animate, isDark, sevColor }) {
  const sevDef = SEV[severity] || SEV.medium;
  const r = 52;
  const circ = Math.PI * r;
  const filled = (sevDef.pct / 100) * circ;
  const needleAngle = -90 + sevDef.angle;

  return (
    <Box sx={{ position:'relative', width:160, height:100, mx:'auto' }}>
      {/* Ambient glow behind dial */}
      {!rm && animate && (
        <Box sx={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-30%)', width:120, height:120, borderRadius:'50%',
          background:`radial-gradient(circle, ${sevColor}20 0%, transparent 70%)`, filter:'blur(20px)', pointerEvents:'none' }} />
      )}
      <svg width="160" height="100" viewBox="0 0 160 100">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={isDark ? '#34C77B' : '#1FAE66'} />
            <stop offset="50%" stopColor={isDark ? '#F5A623' : '#D98A0E'} />
            <stop offset="100%" stopColor={isDark ? '#E5484D' : '#D6393E'} />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d="M 14 90 A 66 66 0 0 1 146 90" fill="none" stroke={isDark ? '#232A3A' : '#E4E8EE'} strokeWidth="8" strokeLinecap="round" />
        {/* Filled arc */}
        <path d="M 14 90 A 66 66 0 0 1 146 90" fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={animate ? { transition:'stroke-dasharray 1.4s cubic-bezier(0.22,1,0.36,1)' } : {}} />
        {/* Shimmer on arc */}
        {!rm && animate && (
          <path d="M 14 90 A 66 66 0 0 1 146 90" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${filled} ${circ}`}
            style={{ stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)',
              backgroundSize:'200% 100%', animation:`${shimmer} 4s linear infinite` }} />
        )}
        {/* Tick labels */}
        {['0','25','50','75','100'].map((v, i) => {
          const angle = -180 + (i * 45);
          const rad = (angle * Math.PI) / 180;
          return <text key={i} x={80 + 76 * Math.cos(rad)} y={90 + 76 * Math.sin(rad)} fill={isDark ? '#8791A3' : '#5B6472'}
            fontSize="7" fontFamily='"JetBrains Mono",monospace' textAnchor="middle" dominantBaseline="middle">{v}</text>;
        })}
        {/* Needle with overshoot */}
        <g transform={`rotate(${animate ? needleAngle : -90}, 80, 90)`}
          style={animate ? { transition:'transform 1.4s cubic-bezier(0.34,1.56,0.64,1)', transformOrigin:'80px 90px' } : { transformOrigin:'80px 90px' }}>
          <line x1="80" y1="90" x2="80" y2="34" stroke={sevColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="80" cy="90" r="5" fill={sevColor} />
          <circle cx="80" cy="90" r="2.5" fill={isDark ? '#0B1220' : '#F5F7FA'} />
        </g>
      </svg>
    </Box>
  );
}

function GlassCard({ T, title, icon, iconColor, children, delay, borderLeftColor }) {
  return (
    <Box sx={{
      bgcolor:T.glass, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
      border:`1px solid ${T.border}`, borderTop:`1px solid ${isDark2(T) ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)'}`,
      borderRadius:2, overflow:'hidden', borderLeft: borderLeftColor ? `3px solid ${borderLeftColor}` : undefined,
      boxShadow: isDark2(T) ? 'none' : '0 4px 12px -2px rgba(15,23,42,0.06)',
      animation: rm ? 'none' : `${fadeIn} 0.5s ease ${delay || 0}s both`,
      transition:'transform 0.2s ease, box-shadow 0.2s ease',
      '&:active': { transform:'scale(0.985)', boxShadow: isDark2(T) ? 'none' : '0 2px 8px -2px rgba(15,23,42,0.1)' },
    }}>
      {title && (
        <Box sx={{ px:2.5, pt:2, pb:0, display:'flex', alignItems:'center', gap:1.5 }}>
          {icon && <span className="material-symbols-outlined" style={{ fontSize:18, color:iconColor || T.muted }}>{icon}</span>}
          <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700 }}>{title}</span>
        </Box>
      )}
      <Box sx={{ px:2.5, pb:2.5 }}>{children}</Box>
    </Box>
  );
}

function isDark2(T) { return T.canvas === '#0B1220'; }

function FieldRow({ label, value, T, mono }) {
  return (
    <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', py:1.25, borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>{label}</span>
      <span style={{ fontFamily: mono ? '"JetBrains Mono",monospace' : '"Inter",sans-serif', fontSize:mono ? 13 : 14, color:T.text, fontWeight:600 }}>{value}</span>
    </Box>
  );
}

function CounterValue({ target, animate }) {
  const [val, setVal] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate || rm) { setVal(target); return; }
    const num = Number(target);
    if (isNaN(num)) { setVal(target); return; }
    const duration = 600;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(num * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return <>{val}</>;
}

function ConfidenceCounter({ target, animate, mono }) {
  return <CounterValue target={target} animate={animate} />;
}
