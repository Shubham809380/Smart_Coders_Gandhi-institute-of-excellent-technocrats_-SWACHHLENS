// Stage-1 — ONNX CNN Wrapper (multi-label sigmoid head)
// ======================================================
// Outputs INDEPENDENT per-class sigmoid probabilities, not a softmax
// distribution: mixed waste (plastic+paper+cloth in one pile) must be able to
// light up several classes at once. See TRAINING GUIDANCE in config.js for the
// BCE retraining that makes this head fully native.
//
// Legacy checkpoints (10 softmax-trained outputs, no non_waste class) are
// supported via a documented proxy anchored to the EMPIRICALLY CALIBRATED
// accept boundary (checkpoints/thresholds.json, fitted against CIFAR
// negatives — 84% unknown-rejection there):
//   non_waste_proxy = clamp01((confThreshold - maxCalibratedSoftmax) / confThreshold)
// i.e. 0 once the model is as confident as its own calibrated accept bar,
// rising linearly as the best waste explanation weakens. A naive
// `1 - maxSoftmax` runs hot on pile-mix soft-target checkpoints (their
// softmax is intentionally flatter), dragging normal photos into Gemini.
// Once a non_waste-trained checkpoint ships (11 outputs) the proxy is
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

function loadConfThreshold() {
  try {
    const t = JSON.parse(fs.readFileSync(path.join(pipelineConfig.onnx.checkpointDir, "thresholds.json"), "utf8"));
    return Number(t.conf_threshold) || 0.8;
  } catch {
    return 0.8;
  }
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
    const confThreshold = loadConfThreshold();
    nonWasteScore = Math.min(1, Math.max(0, (confThreshold - maxSoftmax) / confThreshold));
    scores[NON_WASTE_CLASS] = nonWasteScore;
  }

  const ranked = Object.entries(scores)
    .filter(([c]) => c !== NON_WASTE_CLASS)
    .sort((a, b) => b[1] - a[1]);
  // Co-present classes must clear BOTH the absolute bar and a relative bar
  // against the top class (see mixedDominanceRatio in config).
  const presenceCut = pipelineConfig.router.mixedOverlapThreshold;
  const dominanceCut = ranked[0][1] * pipelineConfig.router.mixedDominanceRatio;
  const present = ranked.filter(([, p]) => p >= Math.max(presenceCut, dominanceCut)).map(([c]) => c);
  // non_waste counts toward "present" for ambiguity purposes when in gray zone.
  if (nonWasteScore >= pipelineConfig.router.nonWasteGrayLow) present.push(NON_WASTE_CLASS);

  const [topClass, topProbRaw] = ranked[0];
  const [secondClass, secondProbRaw] = ranked[1] || ["", 0];

  // Routing signals. On the BCE-trained head the sigmoids ARE the calibrated
  // probabilities (temperature + threshold sweep fitted on exactly this
  // formulation), so softmaxTop/softmaxMargin carry the top sigmoid and the
  // top1-top2 sigmoid gap for the decision router's fast path. Legacy
  // checkpoints keep using their T-scaled softmax, which is what THEY were
  // calibrated against.
  let softmaxTop = maxSoftmax;
  let softmaxMargin = 0;
  if (trainedMultilabel) {
    softmaxTop = topProbRaw;
    softmaxMargin = topProbRaw - secondProbRaw;
  } else if (raw.length > 1) {
    const exps = raw.map((z) => Math.exp(z / T - Math.max(...raw) / T));
    const sum = exps.reduce((a, b) => a + b, 0);
    const soft = exps.map((e) => e / sum).sort((a, b) => b - a);
    softmaxTop = soft[0];
    softmaxMargin = soft.length > 1 ? soft[0] - soft[1] : soft[0];
  }

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
    softmaxTop: Math.round(softmaxTop * 1000) / 1000,
    softmaxMargin: Math.round(softmaxMargin * 1000) / 1000,
    nonWasteScore: Math.round(nonWasteScore * 1000) / 1000,
  };
}
