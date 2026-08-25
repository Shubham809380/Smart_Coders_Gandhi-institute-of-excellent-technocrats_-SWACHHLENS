// Hybrid Detection Pipeline — Orchestrator
// =========================================
//   Stage-0  quality gate          (sharp metrics, no ML)
//   Stage-1  ONNX CNN multi-label  (fast, cheap, always runs)
//   Router   accept / verify / reject        (Gemini is CONDITIONAL)
//   Stage-2  Gemini verifier      (only when the router demands it)
//   Fusion   merge + disagreement => requires_human_review, never a silent pick

import { checkImageQuality } from "./qualityGate.js";
import { classifyMultiLabel } from "./cnnStage.js";
import { routeDecision } from "./decisionRouter.js";
import { geminiVerify } from "./geminiVerifier.js";
import { fuseResults } from "./fusion.js";

/**
 * @param {{imageBuffer:Buffer}} input
 * @returns {Promise<object>} structured result consumed by POST /api/detect-waste
 */
export async function detectWaste({ imageBuffer }) {
  const started = Date.now();

  // ---- Stage-0 ------------------------------------------------------------
  const quality = await checkImageQuality(imageBuffer);
  if (!quality.ok) {
    return {
      accepted: false,
      rejected: { stage: "quality", reason: quality.reason },
      categories: [],
      volume: null,
      requires_human_review: false,
      model_trace: { stage0Metrics: quality.metrics || null },
      processing_ms: Date.now() - started,
    };
  }

  // ---- Stage-1 ------------------------------------------------------------
  const cnn = await classifyMultiLabel(imageBuffer);

  // ---- Decision router ------------------------------------------------------
  const decision = routeDecision(quality, cnn);
  if (decision.action === "reject") {
    return {
      accepted: false,
      rejected: { stage: "router", reason: decision.reason },
      categories: [],
      volume: null,
      requires_human_review: false,
      model_trace: {
        cnnMode: cnn.mode,
        nonWasteScore: cnn.nonWasteScore,
        topClass: cnn.topClass,
        topProb: cnn.topProb,
        routerReason: decision.reason,
      },
      processing_ms: Date.now() - started,
    };
  }

  // ---- Stage-2 (conditional) + fusion --------------------------------------
  let gv = null;
  if (decision.action === "verify_gemini") {
    const cnnHint = { topClass: cnn.topClass, topProb: cnn.topProb, present: cnn.present.filter((c) => c !== "non_waste") };
    try {
      gv = await geminiVerify({ image: imageToDataUrl(imageBuffer) }, cnnHint);
    } catch (err) {
      // First attempt failed — retry once before falling back to CNN-only.
      console.warn("[pipeline] gemini verifier failed (attempt 1), retrying:", err.message);
      try {
        gv = await geminiVerify({ image: imageToDataUrl(imageBuffer) }, cnnHint);
      } catch (retryErr) {
        console.warn("[pipeline] gemini verifier failed (attempt 2), proceeding CNN-only:", retryErr.message);
        gv = null;
      }
    }
  }

  const fused = fuseResults(cnn, gv, decision);
  fused.processing_ms = Date.now() - started;
  return fused;
}

function imageToDataUrl(buffer) {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
