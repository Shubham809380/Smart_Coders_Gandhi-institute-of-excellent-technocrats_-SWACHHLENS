// Fusion
// =======
// Merges Stage-1 (CNN) and Stage-2 (Gemini) into ONE structured result.
//
// THE INVARIANT: when the two models disagree beyond
// pipelineConfig.fusion.agreementJaccard, the output carries
// requires_human_review=true with both readings attached. We may attach a
// PROVISIONAL dominant label (admin queues need something to render) but it is
// always marked provisional:true and never silently presented as settled.

import { pipelineConfig, WASTE_CLASSES, OPERATIONAL_MAP, SAFETY_CRITICAL_SCENES } from "./config.js";

const F = () => pipelineConfig.fusion;

function jaccard(a, b) {
  if (!a.length && !b.length) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

/**
 * @param {object} cnn      Stage-1 result
 * @param {object|null} gv  Stage-2 result (null => verifier unavailable)
 * @param {{action:string,reason:string}} decision
 */
export function fuseResults(cnn, gv, decision) {
  const f = F();
  const reviewReasons = [];

  // ---------- Gemini unavailable: CNN proceeds ALONE but never silently on
  // cases that justified verification in the first place. -------------------
  if (!gv || !gv.called) {
    // Mirror the router's ambiguity signals exactly: if ANY of them fired,
    // a solo CNN verdict is not strong enough to stand unreviewed.
    const r = pipelineConfig.router;
    const ambiguousSolo =
      cnn.present.filter((c) => c !== "non_waste").length >= 2 ||
      Number.isFinite(cnn.softmaxTop) && cnn.softmaxTop < r.autoAcceptProb ||
      Number.isFinite(cnn.softmaxMargin) && cnn.softmaxMargin < r.fastPathMinMargin ||
      cnn.nonWasteScore >= r.nonWasteGrayLow;
    const reviewReasons2 = [...reviewReasons];
    if (decision.action === "verify_gemini" && ambiguousSolo) {
      reviewReasons2.push("gemini_unavailable_on_ambiguous_case");
    }
    // Multi-label contract holds even solo: report every class above the
    // reporting floor (looser than the routing presence set).
    const soloSource = cnn.reportable?.length ? cnn.reportable : cnn.present.filter((c) => c !== "non_waste");
    const soloCats = soloSource
      .filter((c) => c !== "non_waste" && (cnn.scores[c] ?? 0) >= 0.2)
      .map((c) => ({ category: c, confidence: Math.round(cnn.scores[c] * 1000) / 1000 }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return buildResult(cnn, null, {
      agreement: null,
      provisional: true,
      fusedCategories: soloCats.length ? soloCats : [{ category: cnn.topClass, confidence: cnn.topProb }],
      reviewReasons: reviewReasons2,
      trace: { geminiCalled: false },
      decision,
    });
  }

  // ---------- Existence conflict: verifier is authoritative on "is waste" --
  if (!gv.containsWaste) {
    return {
      accepted: false,
      rejected: { stage: "gemini_verifier", reason: gv.rejectReason || "No waste detected." },
      categories: [],
      requires_human_review: false,
      model_trace: { geminiCalled: true, geminiModel: gv.model, fusionAgreement: null },
    };
  }

  const geminiLabels = gv.categories.map((c) => c.category);
  const cnnLabels = cnn.present.filter((c) => c !== "non_waste");
  const overlap = jaccard(cnnLabels, geminiLabels);

  // ---------- Disagreement beyond threshold => human review, ALWAYS --------
  if (overlap < f.agreementJaccard) {
    reviewReasons.push(
      `model_disagreement (jaccard=${Math.round(overlap * 100)}% < ${f.agreementJaccard})`,
    );
  }
  if (gv.requiresHumanReview) {
    reviewReasons.push(`gemini_flagged: ${gv.reviewReason || "unspecified"}`);
  }

  // Safety-critical scenes are never fast-pathed even under agreement.
  if (SAFETY_CRITICAL_SCENES.includes(gv.scene)) {
    reviewReasons.push(`safety_scene: ${gv.scene}`);
  }

  // ---------- Weighted label merge (union of both readings) -----------------
  const merged = {};
  for (const c of WASTE_CLASSES) merged[c] = { p: 0, w: 0 };
  for (const [cls, prob] of Object.entries(cnn.scores)) {
    if (cls === "non_waste" || !(cls in merged)) continue;
    merged[cls].p += prob * f.cnnWeight;
    merged[cls].w += f.cnnWeight;
  }
  for (const c of gv.categories) {
    if (!(c.category in merged)) continue;
    merged[c.category].p += c.confidence * f.geminiWeight;
    merged[c.category].w += f.geminiWeight;
  }

  const fusedCategories = Object.entries(merged)
    .filter(([, v]) => v.w > 0)
    .map(([cls, v]) => ({ category: cls, confidence: Math.round((v.p / v.w) * 1000) / 1000 }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const provisionalTop = fusedCategories[0];
  // Volume: only Gemini produces scale-referenced volume; honor its honesty.
  const volume = gv.volumeConfidence !== "none" && gv.volume
    ? { category: gv.volume, range: F().volumeRanges[gv.volume], confidence: gv.volumeConfidence, reference: gv.scaleReference }
    : { category: null, range: null, confidence: "none", reference: null };

  return buildResult(cnn, gv, {
    agreement: Math.round(overlap * 1000) / 1000,
    fusedCategories,
    provisional: overlap < f.agreementJaccard,
    volume,
    scene: gv.scene,
    reviewReasons,
    trace: {
      geminiCalled: true,
      geminiModel: gv.model,
      geminiLatencyMs: gv.latencyMs ?? null,
      cnnReading: cnnLabels,
      geminiReading: geminiLabels,
    },
    provisionalTop,
    decision,
  });
}

function buildResult(cnn, gv, opts) {
  const cats = opts.fusedCategories ||
    [{ category: cnn.topClass, confidence: cnn.topProb }];
  const top = opts.provisionalTop || cats[0];
  // Mixed-waste truth lives in the CNN presence set (sigmoid co-presence);
  // the fused-confidence cut alone would hide it when Gemini is offline.
  const cnnMixed = cnn.present.filter((c) => c !== "non_waste").length >= 2;
  const mixed = cnnMixed || cats.filter((c) => c.confidence >= pipelineConfig.router.mixedOverlapThreshold).length >= 2;

  return {
    accepted: true,
    rejected: null,
    provisional: Boolean(opts.provisional),
    waste_type: OPERATIONAL_MAP[top.category] || top.category,
    dominant_class: top.category,
    categories: cats.map((c) => ({
      class: c.category,
      operational: OPERATIONAL_MAP[c.category] || c.category,
      confidence: c.confidence,
    })),
    mixed_waste: mixed,
    volume: opts.volume || null,
    scene: opts.scene || "none",
    requires_human_review: opts.reviewReasons.length > 0,
    review_reasons: opts.reviewReasons,
    model_trace: {
      cnnMode: cnn.mode,
      temperature: cnn.temperature,
      nonWasteScore: cnn.nonWasteScore,
      routerAction: opts.decision?.action,
      routerReason: opts.decision?.reason,
      fusionAgreement: opts.agreement,
      ...opts.trace,
    },
  };
}
