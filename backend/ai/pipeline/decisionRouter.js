// Decision Router
// ================
// Per-request gate that keeps Gemini COST-AWARE: the fast/cheap CNN answer is
// accepted directly when it is confident and unambiguous; Gemini is summoned
// only when ambiguity, weak confidence, a mixed pile, or a safety-critical
// class demands a second opinion. Hopeless images are rejected without
// spending a single Gemini token.
//
//   (a) accept_cnn    fast path  (high confidence, single label, not safety)
//   (b) verify_gemini ambiguous / low-conf / mixed / safety-critical / gray zone
//   (c) reject        failed quality gate OR non_waste-dominated OR hopeless

import { pipelineConfig, SAFETY_CRITICAL_CLASSES } from "./config.js";

const R = () => pipelineConfig.router;

/**
 * @param {{ok:boolean, reason?:string}} quality     Stage-0 result
 * @param {object} cnn                               Stage-1 result (classifyMultiLabel)
 * @returns {{action:"accept_cnn"|"verify_gemini"|"reject",
 *            reason:string}}
 */
export function routeDecision(quality, cnn) {
  if (!quality.ok) {
    return { action: "reject", reason: `quality_gate: ${quality.reason}` };
  }

  const r = R();
  const top = cnn.softmaxTop;        // calibrated softmax — routing confidence
  const margin = cnn.softmaxMargin;
  const nonWaste = cnn.nonWasteScore;
  const isMixed = cnn.present.filter((c) => c !== "non_waste").length >= 2;  // sigmoid presence
  const safetyHit =
    SAFETY_CRITICAL_CLASSES.includes(cnn.topClass) ||
    cnn.present.some((c) => SAFETY_CRITICAL_CLASSES.includes(c));

  // ---- (c) outright rejects — no models further down ---------------------
  if (nonWaste >= r.nonWasteReject) {
    return { action: "reject", reason: `non_waste_dominant (${nonWaste})` };
  }
  if (top < r.lowConfidenceFloor && nonWaste < r.nonWasteGrayLow) {
    return { action: "reject", reason: `hopeless_confidence (top=${top})` };
  }

  // ---- (a) fast path ------------------------------------------------------
  // Single clear label, far from every boundary, no reject-class pressure,
  // nothing safety-critical aboard.
  if (
    !isMixed &&
    !safetyHit &&
    top >= r.autoAcceptProb &&
    margin >= r.fastPathMinMargin &&
    nonWaste < r.nonWasteGrayLow
  ) {
    return { action: "accept_cnn", reason: `fast_path (top=${top}, margin=${margin})` };
  }

  // ---- (b) everything else earns verification -----------------------------
  let why = [];
  if (isMixed) why.push("mixed_waste");
  if (safetyHit) why.push("safety_critical");
  if (top < r.autoAcceptProb) why.push(`low_confidence (${top})`);
  if (margin < r.fastPathMinMargin && !isMixed) why.push(`thin_margin (${margin})`);
  if (nonWaste >= r.nonWasteGrayLow) why.push(`subject_ambiguity (non_waste=${nonWaste})`);
  return { action: "verify_gemini", reason: why.join(", ") };
}
