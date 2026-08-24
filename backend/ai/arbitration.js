// Gemini × CNN Ensemble Arbitration
// ==================================
// The CNN (EfficientNet-B0 ONNX) is a fast single-label material classifier;
// Gemini is a slower but scene-aware vision LLM. Neither is trusted alone:
//
//   - CNN cannot say "not waste" — it must pick one of its 10 classes, so a
//     confident-looking selfie can slip through whenever the gatekeeper is down.
//   - Gemini alone is probabilistic and rate-limited.
//
// This module fuses both verdicts with explicit precedence rules:
//   CONSENSUS   both agree            -> small confidence boost
//   OVERRIDE    CNN confident but contradicted by a high-confidence Gemini
//               material reading      -> trust Gemini's material label
//   STRICT      gatekeeper unavailable-> demand a higher CNN bar so unknown
//                                     subjects (people, food, rooms) reject
//   RESCUE      CNN below thresholds  -> Gemini may still accept the report
//               (handled by buildRescuedAnalysis in onnxProvider.js)

const STRICT_CONF_THRESHOLD = 90;  // percent
const STRICT_MARGIN_THRESHOLD = 12; // percentage points
const CONSENSUS_BOOST = 3;

// Unified CNN class -> operational category (scenes pass through untouched).
let _opMap = null;
async function mapToOperational(unifiedClass) {
  if (!_opMap) {
    try {
      const { loadAssets } = await import("./onnxProvider.js");
      _opMap = loadAssets().meta.op_map || {};
    } catch {
      _opMap = {};
    }
  }
  return _opMap[unifiedClass] || unifiedClass;
}

/**
 * Fuse the accepted CNN analysis with the gatekeeper verdict.
 * Returns { analysis } mutated/enriched, or { rejected } for an honest refusal.
 */
export async function resolveEnsemble({ analysis, gate }) {
  const confidence = Number(analysis.confidence) || 0;
  const margin = Number(analysis.classifierMargin);
  const hasMargin = Number.isFinite(margin);

  // ---- A. Gatekeeper explicitly saw no waste -------------------------
  // (Normally caught pre-pipeline; this guards cached/stale paths.)
  if (gate?.checked && !gate.isWaste && gate.confidence !== "low") {
    console.log(`[AI:ensemble] gate veto: ${gate.reason}`);
    return { rejected: buildRejection(gate.reason || "No waste is visible in this photo.") };
  }

  // ---- B. STRICT MODE: gatekeeper was unavailable ---------------------
  // Without Gemini watching, only accept CNN verdicts that are far from any
  // decision boundary. This is what stops person/portrait photos being filed
  // as "plastic" when Gemini times out.
  if (!gate?.checked && hasMargin &&
      (confidence < STRICT_CONF_THRESHOLD || margin < STRICT_MARGIN_THRESHOLD)) {
    console.log(`[AI:ensemble] strict-mode rejection: conf=${confidence} margin=${margin}`);
    return {
      rejected: buildRejection(
        "This photo doesn't clearly contain recognizable waste. Please retake a closer, clearer photo of the garbage.",
        "strict_mode",
      ),
    };
  }

  // ---- C/D. Material-level consensus / override -----------------------
  const gateMaterials = Array.isArray(gate?.materials) ? gate.materials : [];
  const gateHighConfidence = gate?.checked && gate.isWaste && gate.confidence === "high";
  const cnnCategory = analysis.category;

  if (gate?.checked && gate.isWaste && gateMaterials.length > 0 && cnnCategory) {
    const cnnAgrees = gateMaterials.includes(cnnCategory);

    if (cnnAgrees) {
      // CONSENSUS: both models read the same dominant material.
      analysis.confidence = Math.min(99, Math.round((confidence + CONSENSUS_BOOST) * 10) / 10);
      analysis.models = { ...(analysis.models || {}), arbitration: "gemini_cnn_consensus" };
      console.log(`[AI:ensemble] consensus on "${cnnCategory}" (+${CONSENSUS_BOOST}% conf)`);
    } else if (gateHighConfidence && confidence < 97) {
      // OVERRIDE: Gemini reads the pile confidently and disagrees with the
      // CNN's dominant pick. Gemini wins the label; the CNN reading stays
      // recorded for auditing.
      const newCategory = gateMaterials[0];
      const newWasteType = await mapToOperational(newCategory);
      console.log(`[AI:ensemble] override: CNN="${cnnCategory}" (${confidence}%) -> Gemini="${newCategory}"`);
      analysis.detectionSummary = {
        ...(analysis.detectionSummary || {}),
        cnnVerdict: { category: cnnCategory, confidence },
      };
      analysis.category = newCategory;
      analysis.wasteType = newWasteType;
      analysis.confidence = 86;
      analysis.top_predictions = [
        { class: newCategory, confidence: 86 },
        ...(analysis.top_predictions || []).slice(0, 2),
      ];
      analysis.needsReview = true;
      analysis.models = { ...(analysis.models || {}), arbitration: "gemini_override" };
    } else {
      analysis.models = { ...(analysis.models || {}), arbitration: "cnn_kept_gate_soft" };
    }
  }

  // ---- E. Mixed-composition metadata ----------------------------------
  if (gateMaterials.length >= 2) {
    const mapped = [];
    for (const m of gateMaterials) mapped.push(await mapToOperational(m));
    analysis.mixedComposition = mapped;
    analysis.detectionSummary = {
      ...(analysis.detectionSummary || {}),
      mixedComposition: mapped,
    };
  }
  if (gate?.checked) {
    analysis.models = { ...(analysis.models || {}), gatekeeper: gate.model || "gemini" };
  }

  return { analysis };
}

function buildRejection(reason, variant) {
  return {
    valid_waste_image: false,
    reason,
    message: variant === "strict_mode"
      ? "We couldn't confidently verify waste in this photo. Please retake a clear, close-up photo of the garbage."
      : "We couldn't detect any waste in this photo. Please retake a clear photo of the waste you'd like to report.",
  };
}
