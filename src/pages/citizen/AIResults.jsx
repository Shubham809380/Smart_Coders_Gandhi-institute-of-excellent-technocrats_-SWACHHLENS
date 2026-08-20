import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, Chip, IconButton, Paper, Button, LinearProgress, keyframes, Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Memory as MemoryIcon,
  CheckCircle as CheckIcon,
  Category as CategoryIcon,
  ViewInAr as VolumeIcon,
  Warning as SeverityIcon,
  Shield as RiskIcon,
  TipsAndUpdates as RecommendIcon,
  ContentCopy as DupIcon,
  LocationOn as LocationIcon,
  Send as SendIcon,
  Replay as ReplayIcon,
  LocalShipping as DispatchIcon,
  AccessTime as TimeIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { reportService } from '../../services.js';

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

const SEVERITY_MAP = {
  low: { color: 'success', bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', label: 'Low Risk', icon: 'verified', width: 25 },
  medium: { color: 'warning', bg: '#fffbeb', text: '#92400e', border: '#fde68a', label: 'Medium Risk', icon: 'report', width: 50 },
  high: { color: 'error', bg: '#fef2f2', text: '#991b1b', border: '#fecaca', label: 'High Risk', icon: 'priority_high', width: 75 },
  critical: { color: 'error', bg: '#fef2f2', text: '#991b1b', border: '#fca5a5', label: 'Critical', icon: 'emergency', width: 100 },
};

const VOLUME_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', very_large: 'Very Large' };

const fadeIn = keyframes`from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); }`;
const scaleIn = keyframes`from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); }`;
const slideUp = keyframes`from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); }`;

function ConfidenceRing({ value, size = 48 }) {
  const r = (size / 2) - 4;
  const circumference = 2 * Math.PI * r;
  const filled = (value / 100) * circumference;
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={3.5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="primary.main" strokeWidth={3.5}
          strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease-out' }} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" fontWeight={700} fontSize={10}>{value}</Typography>
      </Box>
    </Box>
  );
}

export default function AIResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const routeState = location.state || {};
  const draft = reportService.getDraft();

  const analysis = useMemo(() => {
    if (routeState.analysis) return routeState.analysis;
    const ai = draft.aiResult || {};
    return {
      wasteType: ai.wasteType || 'other',
      severity: ai.severity || 'medium',
      estimatedVolume: ai.estimatedVolume || 'medium',
      estimatedVolumeRange: ai.estimatedVolumeRange || '',
      potentialRisk: ai.potentialRisk || ai.potentialRisks?.[0] || '',
      potentialRisks: ai.potentialRisks || [],
      confidence: ai.confidence || 0,
      recommendation: ai.recommendation || '',
      duplicateReportExists: Boolean(draft.duplicateMatch),
      detectionSummary: ai.detectionSummary || null,
      dispatch: ai.dispatch || null,
      processingTime: ai.processingTime || null,
      models: ai.models || null,
    };
  }, [routeState, draft]);

  const reportData = useMemo(() => {
    if (routeState.report) return routeState.report;
    return {
      id: draft.id || '',
      image: draft.image || '',
      address: draft.location?.address || 'Current Location',
      location: draft.location || { latitude: 20.2961, longitude: 85.8245 },
      comment: draft.comment || '',
    };
  }, [routeState, draft]);

  const wasteLabel = analysis.needsReview
    ? 'Needs Review'
    : (WASTE_LABELS[analysis.wasteType] || 'Unknown Waste');
  const wasteIcon = WASTE_ICONS[analysis.wasteType] || 'category';
  const confidence = analysis.confidence || 0;
  const volume = analysis.estimatedVolume || 'medium';
  const severity = analysis.severity || 'medium';
  const sev = SEVERITY_MAP[severity] || SEVERITY_MAP.medium;
  const volumeLabel = VOLUME_LABELS[volume] || String(volume).replace('_', ' ');
  const risks = analysis.potentialRisks?.length ? analysis.potentialRisks : (analysis.potentialRisk ? [analysis.potentialRisk] : []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await reportService.createReport({
        image: reportData.image,
        video: draft.video || '',
        aiResult: {
          wasteType: analysis.wasteType,
          severity: analysis.severity,
          estimatedVolume: analysis.estimatedVolume,
          potentialRisk: risks.join(', '),
          confidence: analysis.confidence,
          recommendation: analysis.recommendation,
        },
        location: reportData.location,
        comment: reportData.comment,
      });
      reportService.resetDraft();
      navigate('/success', { state: { reportId: created.id } });
    } catch (err) {
      console.error("Report submission failed:", err);
      setSubmitError(err.message || "Failed to submit report. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 50, bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid', borderColor: 'grey.100' }}>
        <Box sx={{ height: 56, px: 2, display: 'flex', alignItems: 'center', gap: 2, pt: 'env(safe-area-inset-top, 0px)' }}>
          <IconButton onClick={() => navigate(-1)} size="small"><BackIcon /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" fontWeight={700} lineHeight={1.2}>AI Analysis</Typography>
            <Typography variant="caption" color="text.secondary" fontSize={11} fontWeight={500}>SwachhLens Intelligence</Typography>
          </Box>
          <Chip
            icon={<Box component="span" className="material-symbols-outlined" sx={{ fontSize: 14, color: analysis.needsReview ? '#92400e' : 'primary.main' }}>
              {analysis.needsReview ? 'pending' : 'check_circle'}
            </Box>}
            label={analysis.needsReview ? 'Needs Review' : 'AI Verified'} size="small"
            sx={{ bgcolor: analysis.needsReview ? 'rgba(234,179,8,0.08)' : 'rgba(0,107,44,0.06)',
              border: '1px solid', borderColor: analysis.needsReview ? 'rgba(234,179,8,0.2)' : 'rgba(0,107,44,0.12)',
              fontWeight: 700, fontSize: 11, color: analysis.needsReview ? '#92400e' : 'primary.dark' }} />
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: '120px' }}>
        {/* Hero image */}
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16/9', maxHeight: 280, overflow: 'hidden', animation: `${scaleIn} 0.5s ease` }}>
          {reportData.image ? (
            <Box component="img" src={reportData.image} alt="Waste" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Box sx={{ width: '100%', height: '100%', bgcolor: 'grey.200', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CategoryIcon sx={{ fontSize: 48, color: 'grey.400' }} />
            </Box>
          )}
          <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0.1) 40%, transparent)' }} />
          <Box sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>
                <Box component="span" className="material-symbols-outlined" sx={{ color: 'white', fontSize: 22 }}>{wasteIcon}</Box>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'block', lineHeight: 1.2 }}>Waste Type</Typography>
                <Typography variant="body1" sx={{ color: 'white', fontWeight: 700, lineHeight: 1.2 }}>{wasteLabel}</Typography>
              </Box>
            </Box>
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', px: 2, py: 0.75, borderRadius: 2, border: '1px solid rgba(255,255,255,0.3)' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'white' }}>{confidence}%</Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ px: 2.5, pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Title */}
          <Box sx={{ animation: `${fadeIn} 0.5s ease 0.1s both` }}>
            <Typography variant="h6" fontWeight={800}>Analysis Complete</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              AI has classified the waste and assessed its impact.
            </Typography>
          </Box>

          {analysis.needsReview && (
            <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'rgba(234,179,8,0.3)', bgcolor: 'rgba(234,179,8,0.04)', animation: `${fadeIn} 0.5s ease 0.12s both`, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 20, color: '#92400e', mt: 0.25 }}>info</Box>
              <Box>
                <Typography variant="body2" fontWeight={700} color="#92400e">Low-confidence detection</Typography>
                <Typography variant="caption" color="#a16207" sx={{ mt: 0.25, display: 'block' }}>
                  The model is not confident about this classification. This result uses a COCO-to-waste fallback mapping. A fine-tuned model is needed for production accuracy.
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Classification card */}
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100', animation: `${fadeIn} 0.5s ease 0.15s both` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CategoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </Box>
                <Typography variant="body2" fontWeight={600} color="text.secondary">Classification</Typography>
              </Box>
              <Chip icon={<Box component="span" className="material-symbols-outlined" sx={{ fontSize: 14, color: sev.text, fontVariationSettings: "'FILL' 1" }}>{sev.icon}</Box>}
                label={sev.label} size="small"
                sx={{ bgcolor: sev.bg, color: sev.text, border: '1px solid', borderColor: sev.border, fontWeight: 700, fontSize: 11, '& .MuiChip-icon': { ml: 0.5 } }} />
            </Box>
            <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', gap: 2.5, border: '1px solid', borderColor: 'grey.100' }}>
              <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0 }}>
                <Box component="span" className="material-symbols-outlined" sx={{ fontSize: 26, color: 'text.primary' }}>{wasteIcon}</Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight={700} noWrap>{wasteLabel}</Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ display: 'block', mt: 0.25 }}>
                  {analysis.needsReview ? `${confidence}% confidence — may need review` : `${confidence}% confidence match`}
                </Typography>
              </Box>
              <ConfidenceRing value={confidence} />
            </Box>
          </Paper>

          {/* Volume + Severity grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, animation: `${fadeIn} 0.5s ease 0.25s both` }}>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <VolumeIcon sx={{ fontSize: 16, color: 'info.main' }} />
                </Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Volume</Typography>
              </Box>
              <Typography variant="h6" fontWeight={800} sx={{ textTransform: 'capitalize' }}>{volumeLabel}</Typography>
              {volume === 'very_large' && (
                <Chip icon={<SeverityIcon sx={{ fontSize: 12 }} />} label="Exceeds normal" size="small"
                  sx={{ mt: 1.5, bgcolor: 'rgba(220,38,38,0.08)', color: 'error.main', border: '1px solid', borderColor: 'rgba(220,38,38,0.15)', fontWeight: 700, fontSize: 10, height: 22 }} />
              )}
              {analysis.estimatedVolumeRange && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{analysis.estimatedVolumeRange}</Typography>
              )}
            </Paper>

            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, bgcolor: sev.bg, border: '1px solid', borderColor: 'grey.100' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SeverityIcon sx={{ fontSize: 16, color: sev.text }} />
                </Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Severity</Typography>
              </Box>
              <Typography variant="h6" fontWeight={800} sx={{ color: sev.text }}>{sev.label}</Typography>
              <LinearProgress variant="determinate" value={sev.width} sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.6)', '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: sev.text } }} />
            </Paper>
          </Box>

          {/* Risk */}
          {risks.length > 0 && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100', animation: `${fadeIn} 0.5s ease 0.3s both` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(220,38,38,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RiskIcon sx={{ fontSize: 18, color: 'error.main' }} />
                </Box>
                <Typography variant="body2" fontWeight={600}>Potential Risk</Typography>
              </Box>
              <Box component="ul" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {risks.map((r, i) => (
                  <Typography key={i} variant="body2" component="li" color="text.secondary" sx={{ lineHeight: 1.6 }}>{r}</Typography>
                ))}
              </Box>
            </Paper>
          )}

          {/* Recommendation */}
          {analysis.recommendation && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100', animation: `${fadeIn} 0.5s ease 0.35s both` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(6,182,212,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RecommendIcon sx={{ fontSize: 18, color: 'info.main' }} />
                </Box>
                <Typography variant="body2" fontWeight={600}>Recommendation</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{analysis.recommendation}</Typography>
            </Paper>
          )}

          {/* Dispatch info */}
          {analysis.dispatch && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'primary.light', bgcolor: 'rgba(0,107,44,0.02)', animation: `${fadeIn} 0.5s ease 0.4s both` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(0,107,44,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DispatchIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                </Box>
                <Typography variant="body2" fontWeight={600}>Dispatch Plan</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {analysis.dispatch.team && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Team</Typography>
                    <Typography variant="body2" fontWeight={600}>{analysis.dispatch.team}</Typography>
                  </Box>
                )}
                {analysis.dispatch.vehicle && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Vehicle</Typography>
                    <Typography variant="body2" fontWeight={600}>{analysis.dispatch.vehicle}</Typography>
                  </Box>
                )}
                {analysis.dispatch.sla_hours && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>SLA</Typography>
                    <Typography variant="body2" fontWeight={600}>{analysis.dispatch.sla_hours}h</Typography>
                  </Box>
                )}
                {analysis.dispatch.priority && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Priority</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>{analysis.dispatch.priority}</Typography>
                  </Box>
                )}
              </Box>
              {analysis.dispatch.instructions && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.6 }}>{analysis.dispatch.instructions}</Typography>
              )}
            </Paper>
          )}

          {/* Detection summary */}
          {analysis.detectionSummary && analysis.detectionSummary.count > 0 && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100', animation: `${fadeIn} 0.5s ease 0.45s both` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(6,182,212,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InfoIcon sx={{ fontSize: 18, color: 'info.main' }} />
                </Box>
                <Typography variant="body2" fontWeight={600}>Detection Details</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Objects</Typography>
                  <Typography variant="body2" fontWeight={600}>{analysis.detectionSummary.count}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>Coverage</Typography>
                  <Typography variant="body2" fontWeight={600}>{analysis.detectionSummary.coveragePercent}%</Typography>
                </Box>
              </Box>
              {analysis.detectionSummary.classes?.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {analysis.detectionSummary.classes.map((cls, i) => (
                    <Chip key={i} label={WASTE_LABELS[cls] || cls} size="small"
                      sx={{ bgcolor: 'grey.100', fontWeight: 600, fontSize: 11 }} />
                  ))}
                </Box>
              )}
            </Paper>
          )}

          {/* Processing time */}
          {analysis.processingTime && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, animation: `${fadeIn} 0.5s ease 0.5s both` }}>
              <TimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">Processed in {analysis.processingTime}ms</Typography>
            </Box>
          )}

          {/* Duplicate warning */}
          {analysis.duplicateReportExists && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(245,158,11,0.06)', border: '1px solid', borderColor: 'rgba(245,158,11,0.2)', display: 'flex', gap: 2, animation: `${fadeIn} 0.5s ease 0.5s both` }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DupIcon sx={{ fontSize: 18, color: 'warning.main' }} />
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={700} color="warning.dark">Similar Report Detected</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', lineHeight: 1.5 }}>
                  A similar report exists nearby. Submitting may create a duplicate entry that will be reviewed by authorities.
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Location */}
          {reportData.address && (
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'grey.100', display: 'flex', alignItems: 'center', gap: 2, animation: `${fadeIn} 0.5s ease 0.55s both` }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LocationIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Location</Typography>
                <Typography variant="body2" fontWeight={500} noWrap sx={{ mt: 0.25 }}>{reportData.address}</Typography>
              </Box>
            </Paper>
          )}
        </Box>
      </Box>

      {/* Bottom bar */}
      <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid', borderColor: 'grey.100', pb: 'env(safe-area-inset-bottom, 0px)' }}>
        {submitError && (
          <Box sx={{ px: 2.5, pt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
            <Typography variant="caption" color="error.main" fontWeight={600}>{submitError}</Typography>
          </Box>
        )}
        <Box sx={{ px: 2.5, py: 2, display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<ReplayIcon />} disabled={submitting} onClick={() => navigate('/report-waste')}
            sx={{ flexShrink: 0, borderRadius: 3, textTransform: 'none', fontWeight: 700, borderColor: 'grey.200', color: 'text.secondary', '&:hover': { borderColor: 'grey.300' } }}>
            Retake
          </Button>
          <Button variant="contained" endIcon={submitting ? null : <SendIcon />} disabled={submitting} onClick={handleSubmit}
            sx={{ flex: 1, borderRadius: 3, textTransform: 'none', fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg, primary.main, secondary.main)', boxShadow: '0 8px 24px -4px rgba(0,135,58,0.35)', '&:hover': { background: 'linear-gradient(135deg, primary.dark, secondary.dark)' } }}>
            {submitting ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 20, height: 20, border: '2px solid', borderColor: 'white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
                Submitting...
              </Box>
            ) : 'Submit Report'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
