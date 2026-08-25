import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, LinearProgress, Chip, IconButton, keyframes } from "@mui/material";
import {
  Memory as ChipIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Search as ScanIcon,
  Category as CategoryIcon,
  Scale as ScaleIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
  Replay as RetryIcon,
  ArrowBack as BackIcon,
  Cancel as CancelIcon,
  NoPhotography as NoPhotoIcon,
  PhotoCamera as RetakeIcon,
} from "@mui/icons-material";
import { aiService, reportService } from "../../services.js";

const STEPS = [
  { label: "Detecting waste boundaries", keywords: ["detect", "waste", "boundary"] },
  { label: "Classifying waste type", keywords: ["classif", "category", "type"] },
  { label: "Estimating volume", keywords: ["volume", "estimat"] },
  { label: "Checking severity level", keywords: ["sever", "level", "risk"] },
  { label: "Generating priority score", keywords: ["prior", "score", "duplicate"] },
];

const pulseRing = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.08); opacity: 0.7; }
`;

const scanSweep = keyframes`
  0% { top: -10%; opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { top: 110%; opacity: 0; }
`;

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const stepSlide = keyframes`
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
`;

export default function AnalyzingWaste() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(-1);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [rejected, setRejected] = useState(null);
  // Snapshot once — getDraft() returns a fresh clone each call, and a new
  // reference here would recreate runAnalysis and re-fire the effect loop.
  const [draft] = useState(() => reportService.getDraft());
  const progress = completed ? 100 : Math.max(0, ((currentStep + 1) / STEPS.length) * 100);
  const runAnalysis = useCallback(async (cancelled) => {
    try {
      const result = await aiService.analyzeWaste({
        ...draft,
        onProgress: (step) => {
          if (cancelled.current) return;
          const lower = step.toLowerCase();
          const idx = STEPS.findIndex((s) => s.keywords.some((kw) => lower.includes(kw)));
          setCurrentStep((prev) => {
            if (idx >= 0) return Math.max(prev, idx);
            return Math.min(prev + 1, STEPS.length - 1);
          });
        },
      });
      if (cancelled.current) return;
      // Gemini gatekeeper: photo clearly contains no waste — block submission.
      if (result.valid_waste_image === false) {
        setRejected({ reason: result.reason || "", message: result.message || "We couldn't detect any waste in this photo. Please retake a clear photo of the waste you'd like to report." });
        return;
      }
      setCurrentStep(STEPS.length - 1);
      reportService.updateDraft({ aiResult: result.result, duplicateMatch: result.duplicateMatch });
      setCompleted(true);
      setTimeout(() => navigate("/ai-results"), 900);
    } catch (err) {
      if (!cancelled.current) {
        const msg = err.message || "Analysis failed";
        if (msg.includes("Network") || msg.includes("fetch") || msg.includes("connect")) {
          setError("Could not connect to the server. Please check your internet connection and try again.");
        } else {
          setError(msg);
        }
      }
    }
  }, [draft, navigate]);

  useEffect(() => {
    const cancelled = { current: false };
    runAnalysis(cancelled);
    return () => { cancelled.current = true; };
  }, [runAnalysis]);

  const handleRetry = () => {
    setError("");
    setCurrentStep(-1);
    setCompleted(false);
    const cancelled = { current: false };
    runAnalysis(cancelled);
  };

  if (error) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", px: 3, animation: `${fadeInUp} 0.4s ease` }}>
        <Box sx={{ width: 88, height: 88, borderRadius: "50%", bgcolor: "error.light", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <ErrorIcon sx={{ fontSize: 42, color: "error.main" }} />
        </Box>
        <Typography variant="h6" fontWeight={700} textAlign="center" gutterBottom>Analysis Failed</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: { xs: 280, sm: 360 }, mb: 4 }}>{error}</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%", maxWidth: { xs: 280, sm: 360 } }}>
          <Box component="button" onClick={handleRetry} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, width: "100%", py: 2.25, borderRadius: 3, bgcolor: "primary.main", color: "white", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 8px 24px -4px rgba(0,107,44,0.3)", "&:hover": { transform: "translateY(-1px)" }, "&:active": { transform: "scale(0.98)" } }}>
            <RetryIcon fontSize="small" /> Retry Analysis
          </Box>
          <Box component="button" onClick={() => navigate("/report-waste")} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, width: "100%", py: 2.25, borderRadius: 3, bgcolor: "grey.100", color: "text.primary", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", transition: "all 0.2s", "&:active": { transform: "scale(0.98)" } }}>
            <BackIcon fontSize="small" /> Go Back
          </Box>
        </Box>
      </Box>
    );
  }

  if (rejected) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", px: 3, animation: `${fadeInUp} 0.4s ease` }}>
        <Box sx={{ width: 88, height: 88, borderRadius: "50%", bgcolor: "rgba(255,152,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
          <NoPhotoIcon sx={{ fontSize: 42, color: "#ED6C02" }} />
        </Box>
        <Typography variant="h6" fontWeight={700} textAlign="center" gutterBottom>Not a Waste Photo</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: { xs: 280, sm: 360 }, mb: 1.5 }}>{rejected.message}</Typography>
        {rejected.reason && (
          <Typography variant="caption" color="text.disabled" textAlign="center" sx={{ maxWidth: { xs: 280, sm: 340 }, mb: 4, fontStyle: "italic" }}>AI: {rejected.reason}</Typography>
        )}
        {!rejected.reason && <Box sx={{ height: 32 }} />}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%", maxWidth: { xs: 280, sm: 360 } }}>
          <Box component="button" onClick={() => { reportService.updateDraft({ image: "", video: "", aiResult: null, duplicateMatch: null }); navigate("/report-waste"); }} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, width: "100%", py: 2.25, borderRadius: 3, bgcolor: "primary.main", color: "white", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 8px 24px -4px rgba(0,107,44,0.3)", "&:hover": { transform: "translateY(-1px)" }, "&:active": { transform: "scale(0.98)" } }}>
            <RetakeIcon fontSize="small" /> Retake Photo
          </Box>
          <Box component="button" onClick={() => navigate("/home")} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, width: "100%", py: 2.25, borderRadius: 3, bgcolor: "grey.100", color: "text.primary", fontWeight: 700, fontSize: 14, border: "1px solid", borderColor: "grey.300", cursor: "pointer", transition: "all 0.2s", "&:hover": { bgcolor: "grey.200", borderColor: "grey.400" }, "&:active": { transform: "scale(0.98)" } }}>
            <BackIcon fontSize="small" /> Cancel Report
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Main content */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", px: 3, pt: "env(safe-area-inset-top, 0px)" }}>
        {/* Circular scanner */}
        <Box sx={{ position: "relative", width: { xs: 180, sm: 200 }, height: { xs: 180, sm: 200 }, display: "flex", alignItems: "center", justifyContent: "center", mb: 4, animation: `${scaleIn} 0.6s ease` }}>
          {/* Glow */}
          <Box sx={{ position: "absolute", inset: -4, borderRadius: "50%", background: "linear-gradient(135deg, primary.main, secondary.main)", opacity: 0.15, filter: "blur(18px)", animation: `${pulseRing} 3s ease-in-out infinite` }} />

          {/* Outer ring */}
          <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(from 0deg, primary.main, primary-fixed-dim, primary-container, primary.main)", p: "3px" }}>
            <Box sx={{ width: "100%", height: "100%", borderRadius: "50%", bgcolor: "background.default" }} />
          </Box>

          {/* Scan line */}
          <Box sx={{ position: "absolute", inset: 8, borderRadius: "50%", overflow: "hidden", pointerEvents: "none" }}>
            <Box sx={{ position: "absolute", left: 0, right: 0, height: "30%", background: "linear-gradient(180deg, transparent, rgba(0,107,44,0.06), rgba(98,223,125,0.12), rgba(0,107,44,0.06), transparent)", animation: `${scanSweep} 2.2s cubic-bezier(0.4,0,0.2,1) infinite` }} />
          </Box>

          {/* Faint image */}
          {draft.image && (
            <Box sx={{ position: "absolute", inset: 3, borderRadius: "50%", overflow: "hidden", zIndex: 0 }}>
              <Box component="img" src={draft.image} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.15 }} />
            </Box>
          )}

          {/* Center icon */}
          <Box sx={{ position: "relative", zIndex: 1, width: 64, height: 64, borderRadius: "50%", bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center", animation: `${pulseRing} 2s ease-in-out infinite`, boxShadow: "0 0 24px rgba(0,107,44,0.2)" }}>
            <ChipIcon sx={{ fontSize: 32, color: "white" }} />
          </Box>

          {/* Completion check */}
          {completed && (
            <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", bgcolor: "rgba(0,107,44,0.08)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, animation: `${scaleIn} 0.4s cubic-bezier(0.22,1,0.36,1)` }}>
              <CheckIcon sx={{ fontSize: 52, color: "primary.main" }} />
            </Box>
          )}
        </Box>

        {/* Title */}
        <Typography variant="h6" fontWeight={700} textAlign="center" sx={{ animation: `${fadeInUp} 0.5s ease 0.1s both` }}>
          {completed ? "Analysis Complete" : "AI Analysis in Progress"}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 0.75, maxWidth: { xs: 260, sm: 340 }, animation: `${fadeInUp} 0.5s ease 0.2s both` }}>
          {completed ? "Redirecting to results..." : "Processing image data with our AI models."}
        </Typography>

        {/* Steps */}
        <Box sx={{ width: "100%", maxWidth: { xs: 340, sm: 420 }, mt: 4, display: "flex", flexDirection: "column", gap: 0.5 }}>
          {STEPS.map((step, i) => {
            const done = i < currentStep || completed;
            const active = i === currentStep && !completed;
            const pending = i > currentStep && !completed;
            return (
              <Box
                key={i}
                sx={{
                  display: "flex", alignItems: "center", gap: 2, py: 1.5, px: 2, borderRadius: 2,
                  bgcolor: active ? "rgba(0,107,44,0.04)" : "transparent",
                  opacity: pending ? 0.35 : 1,
                  transition: "all 0.3s ease",
                  animation: `${stepSlide} 0.4s ease ${0.15 + i * 0.08}s both`,
                }}
              >
                {/* Step circle */}
                <Box sx={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: done ? "primary.main" : active ? "primary.main" : "grey.200",
                  boxShadow: done ? "0 2px 8px rgba(0,107,44,0.25)" : "none",
                  transition: "all 0.3s ease",
                }}>
                  {done && <CheckIcon sx={{ fontSize: 16, color: "white" }} />}
                  {active && (
                    <Box sx={{ width: 14, height: 14, borderRadius: "50%", border: "2.5px solid", borderColor: "primary.main", borderTopColor: "transparent", animation: `${spin} 0.8s linear infinite` }} />
                  )}
                  {pending && (
                    <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {[<ScanIcon fontSize="small" />, <CategoryIcon fontSize="small" />, <ScaleIcon fontSize="small" />, <WarningIcon fontSize="small" />, <SpeedIcon fontSize="small" />][i]}
                    </Box>
                  )}
                </Box>

                {/* Label */}
                <Typography variant="body2" fontWeight={600} sx={{ color: done || active ? "text.primary" : "text.secondary", transition: "color 0.3s" }}>
                  {step.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Bottom progress */}
      <Box sx={{ px: 3, pb: 3, pt: 2 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 6, borderRadius: 3, bgcolor: "grey.200",
            "& .MuiLinearProgress-bar": {
              borderRadius: 3,
              background: "linear-gradient(90deg, primary.main, primary-fixed-dim)",
              boxShadow: completed ? "0 0 12px rgba(0,107,44,0.4)" : "none",
              transition: "all 0.5s ease",
            },
          }}
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mt: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ letterSpacing: "0.05em", textTransform: "uppercase", flexShrink: 0 }}>
            {completed ? "Done" : currentStep < 0 ? "Initializing..." : `${Math.round(progress)}%`}
          </Typography>
          <Box component="button" disabled={completed} onClick={() => navigate("/report-waste")} sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, px: 2.5, py: 1.25, borderRadius: 3, bgcolor: "grey.100", color: "text.primary", fontWeight: 700, fontSize: 13, border: "none", cursor: completed ? "default" : "pointer", opacity: completed ? 0.4 : 1, transition: "all 0.2s", "&:hover": completed ? {} : { bgcolor: "grey.200" }, "&:active": completed ? {} : { transform: "scale(0.97)" } }}>
            <CancelIcon sx={{ fontSize: 16 }} /> Cancel Report
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
