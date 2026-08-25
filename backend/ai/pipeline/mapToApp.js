// Maps hybrid-pipeline output -> the app's legacy analysis contract so the
// citizen flow can switch to POST /api/detect-waste without touching UI code.
//
// Legacy consumers expect: valid_waste_image / reason / message on reject,
// and result{wasteType, confidence, estimatedVolume, severity, dispatch,
// needsReview, mixedComposition, ...} on accept. Scene verdicts from Gemini
// (drain_blockage etc.) override the material label exactly like the legacy
// gatekeeper did, with recomputed severity/dispatch.

import { pipelineConfig } from "./config.js";

const FRIENDLY = {
  quality: "Please retake a steady, well-lit photo of the waste.",
  router: "This photo doesn't clearly contain recognizable waste. Please retake a closer, clearer photo.",
  gemini_verifier: "We couldn't confirm waste in this photo. Please retake a clear photo of the waste.",
};

// Scene categories recognised by the Gemini verifier — scenes, not materials.
const SCENE_CATEGORIES = ["drain_blockage", "overflowing_bin", "construction_debris"];

export async function mapHybridToApp(fused, ctx = {}) {
  if (!fused.accepted) {
    const stage = fused.rejected?.stage || "router";
    return {
      valid_waste_image: false,
      reason: fused.rejected?.reason || "No waste detected.",
      message: FRIENDLY[stage] || FRIENDLY.router,
      model_trace: fused.model_trace || null,
    };
  }

  const { ruleBasedSeverity, recommendAction } = await import("../onnxProvider.js");

  const cats = Array.isArray(fused.categories) ? fused.categories : [];
  const topCat = cats[0]?.class || fused.dominant_class || "mixed_trash";
  // Problem-scene categories are scenes, not materials — they win the label.
  const scene = fused.scene && SCENE_CATEGORIES.includes(fused.scene) ? fused.scene : null;
  const wasteType = scene || pipelineConfig.onnx.opMap[topCat] || topCat;

  const volumeRaw = fused.volume?.category || null;
  const volumeConf = fused.volume?.confidence || "none";
  // Only treat as estimated when confidence is not "none"; otherwise downstream
  // consumers see "unknown" instead of silently inheriting a wrong "medium".
  const volumeCategory = volumeRaw && volumeConf !== "none" ? volumeRaw : null;
  const confidence = Math.round((cats[0]?.confidence ?? 0) * 100);
  const sev = ruleBasedSeverity(wasteType, volumeCategory || "medium", Math.max(confidence, 40), 1, 0, 0.3, volumeConf);
  const dispatch = recommendAction(wasteType, volumeCategory || "medium", sev.severity);

  return {
    valid_waste_image: true,
    result: {
      wasteType,
      confidence,
      estimatedVolume: volumeCategory || "unknown",
      estimatedVolumeRange: fused.volume?.range || null,
      volumeConfidence: volumeConf,
      severity: sev.severity,
      severityConfidence: sev.confidence || null,
      potentialRisk: (sev.risks || []).join(", "),
      potentialRisks: sev.risks || [],
      recommendation: dispatch
        ? `Assign ${dispatch.team} within ${dispatch.sla_hours} hours. ${dispatch.instructions}`
        : "",
      hazardFlag: Boolean(sev.hazardFlag),
      recyclableHeavy: Boolean(sev.recyclableHeavy),
      dispatch: dispatch || null,
      priorityScore: ctx.priorityScore ?? null,
      detectionSummary: null,   // no YOLO detector in the hybrid path
      mixedComposition: fused.mixed_waste
        ? cats.slice(0, 4).map((c) => c.class)
        : null,
      needsReview: Boolean(fused.requires_human_review),
      reviewReasons: fused.review_reasons || [],
      provisional: Boolean(fused.provisional),
      processingTime: fused.processing_ms || null,
      models: {
        cnnMode: fused.model_trace?.cnnMode,
        temperature: fused.model_trace?.temperature,
        nonWasteScore: fused.model_trace?.nonWasteScore,
        routerAction: fused.model_trace?.routerAction,
        fusionAgreement: fused.model_trace?.fusionAgreement,
        geminiCalled: fused.model_trace?.geminiCalled,
      },
    },
    duplicateMatch: ctx.duplicateMatch || null,
  };
}
