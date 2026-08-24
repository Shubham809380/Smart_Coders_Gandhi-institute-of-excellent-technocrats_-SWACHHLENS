// Stage-1 — ONNX CNN Wrapper (multi-label sigmoid head)
// ======================================================
// Outputs INDEPENDENT per-class sigmoid probabilities, not a softmax
// distribution: mixed waste (plastic+paper+cloth in one pile) must be able to
// light up several classes at once. See TRAINING GUIDANCE in config.js for the
// BCE retraining that makes this head fully native.
//
// Legacy checkpoints (10 softmax-trained outputs, no non_waste class) are
// supported via a documented proxy:
//   non_waste_proxy = clamp01(1 - top_softmax_prob / temperature)
// i.e. "how far is the best waste explanation from explaining the pixels".
// Once a non_waste-trained checkpoint is deployed (11 outputs) the proxy is
// bypassed automatically — mode flips from legacy_proxy to trained_multilabel.

import path from "node:path";
import fs from "node:fs";
import { pipelineConfig, WASTE_CLASSES, NON_WASTE_CLASS } from "./config.js";

let _session = null;
const IMG_SIZE = pipelineConfig.onnx.imgSize;
const T = Math.max(0.1, pipelineConfig.onnx.temperature);

async function getSession() {
  if (_session) return _session;
  const ort = await import("onnxruntime-node");
  _session = await ort.InferenceSession.create(
    pipelineConfig.onnx.modelPath,
    { graphOptimizationLevel: "all" },
  );
  return _session;
}

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * @param {Buffer} imageBuffer raw image bytes
 * @returns {{ mode:string, temperature:number,
 *             scores: Record<string,number>,          // every class incl non_waste
 *             present: string[],                       // prob >= router.mixedOverlapThreshold
 *             topClass:string, topProb:number,
 *             secondClass:string, secondProb:number,
 *             margin:number,                           // top1 - top2 sigmoid gap
 *             nonWasteScore:number }}
 */
export async function classifyMultiLabel(imageBuffer) {
  const { preprocessToTensor } = await import("../onnxProvider.js");
  const session = await getSession();
  const ort = await import("onnxruntime-node");
  const tensor = new ort.Tensor("float32", await preprocessToTensor(imageBuffer), [1, 3, IMG_SIZE, IMG_SIZE]);
  const { logits } = await session.run({ [session.inputNames[0]]: tensor });
  const raw = Array.from(logits.data);

  const modelClasses = pipelineConfig.onnx.classes;      // what the checkpoint was trained on
  const trainedMultilabel = raw.length > WASTE_CLASSES.length;

  // Temperature-scale logits, then independent sigmoids => multi-label probs.
  let scores = {};
  let maxSoftmax = 0;
  if (trainedMultilabel) {
    raw.forEach((z, i) => { scores[modelClasses[i]] = sigmoid(z / T); });
  } else {
    // Softmax over T-scaled logits just to obtain a calibrated confidence for
    // the proxy; per-class presence still uses sigmoids below.
    const exps = raw.map((z) => Math.exp(z / T - Math.max(...raw) / T));
    const sum = exps.reduce((a, b) => a + b, 0);
    const soft = exps.map((e) => e / sum);
    maxSoftmax = Math.max(...soft);
    raw.forEach((z, i) => { scores[modelClasses[i]] = sigmoid(z / T); });
  }

  // Ensure the mandatory reject class exists (proxy or real).
  let nonWasteScore = scores[NON_WASTE_CLASS];
  if (nonWasteScore === undefined) {
    nonWasteScore = Math.min(1, Math.max(0, 1 - maxSoftmax));
    scores[NON_WASTE_CLASS] = nonWasteScore;
  }

  const ranked = Object.entries(scores)
    .filter(([c]) => c !== NON_WASTE_CLASS)
    .sort((a, b) => b[1] - a[1]);
  const presenceCut = pipelineConfig.router.mixedOverlapThreshold;
  const present = ranked.filter(([, p]) => p >= presenceCut).map(([c]) => c);
  // non_waste counts toward "present" for ambiguity purposes when in gray zone.
  if (nonWasteScore >= pipelineConfig.router.nonWasteGrayLow) present.push(NON_WASTE_CLASS);

  const [topClass, topProbRaw] = ranked[0];
  const [secondClass, secondProbRaw] = ranked[1] || ["", 0];

  return {
    mode: trainedMultilabel ? "trained_multilabel" : "legacy_proxy",
    temperature: T,
    scores,
    present,
    topClass,
    topProb: Math.round(topProbRaw * 1000) / 1000,
    secondClass,
    secondProb: Math.round(secondProbRaw * 1000) / 1000,
    margin: Math.round((topProbRaw - secondProbRaw) * 1000) / 1000,
    nonWasteScore: Math.round(nonWasteScore * 1000) / 1000,
  };
}
