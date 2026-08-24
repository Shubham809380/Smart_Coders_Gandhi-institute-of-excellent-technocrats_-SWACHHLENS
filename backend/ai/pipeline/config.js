// SwachhLens Hybrid Detection Pipeline — Config Layer
// =====================================================
// Every tunable in the pipeline lives here. Nothing downstream may hardcode
// a threshold; if you are editing a number inside a stage file, move it here.
//
// ─── TRAINING GUIDANCE (read before retraining the CNN) ─────────────────────
// 1. NON_WASTE CLASS: shipped as a REAL trained class (index 10). Negatives:
//    CIFAR-10 animals/vehicles, synthetic documents/screenshots, STL-10
//    people (training/build_nonwaste_set.py regenerates the set; extend it
//    with production hard negatives mined from inference_logs).
// 2. MULTI-LABEL HEAD: trained with BCE-with-logits on multi-hot targets
//    (--multilabel in train_classifier.py). Legacy 10-output softmax
//    checkpoints still work via cnnStage.js legacy_proxy mode.
// 3. TEMPERATURE + THRESHOLD CALIBRATION: run fit_temperature.py then
//    calibrate_threshold.py AFTER training. calibration.json carries T and
//    router_overrides (autoAcceptProb / fastPathMinMargin); thresholds.json
//    keeps the legacy-proxy accept boundary. MUST be bundled to Vercel —
//    see includeFiles in vercel.json.
// 4. HARD-NEGATIVE MINING: every production false positive is already logged
//    to inference_logs via /api/detect-waste. Periodically export images whose
//    outcome was later corrected (rejected by review/Gemini after a confident
//    CNN accept) and add them to the next training round as negatives or with
//    corrected labels. Close this loop monthly.
// ────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";

// CNN vocabulary — must match training/class_mapping.json unified_classes.
export const WASTE_CLASSES = [
  "plastic", "paper", "cardboard", "metal", "glass",
  "organic", "vegetation", "textile", "battery", "mixed_trash",
];

// Mandatory reject class (index 10). Real once retrained per guidance above.
export const NON_WASTE_CLASS = "non_waste";
export const ALL_CLASSES = [...WASTE_CLASSES, NON_WASTE_CLASS];

// Unified class -> operational category reported to the app/admin queue.
export const OPERATIONAL_MAP = {
  plastic: "plastic_waste",
  paper: "paper_waste",
  cardboard: "cardboard_waste",
  metal: "metal_waste",
  glass: "glass_waste",
  organic: "organic_waste",
  vegetation: "organic_waste",
  textile: "textile_waste",
  battery: "hazardous_waste",
  mixed_trash: "garbage_dump",
};

// Safety-critical predictions are NEVER fast-path accepted; they always earn
// a Gemini double-check (cheap insurance against misrouted hazard crews).
export const SAFETY_CRITICAL_CLASSES = ["battery"];            // hazardous stream (+ e_waste once trained)
export const SAFETY_CRITICAL_SCENES = ["drain_blockage"];      // scene-level hazards

const CKPT_CANDIDATES = [
  path.resolve(process.cwd(), "swachhlens-ai/checkpoints"),
  path.resolve(process.cwd(), "checkpoints"),
];

function findCheckpointDir() {
  for (const dir of CKPT_CANDIDATES) {
    if (fs.existsSync(path.join(dir, "best_classifier.onnx"))) return dir;
  }
  throw new Error(`best_classifier.onnx not found in: ${CKPT_CANDIDATES.join(", ")}`);
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(findCheckpointDir(), file), "utf8"));
  } catch {
    return null;
  }
}

const meta = loadJson("onnx_meta.json") || {};
const calibration = loadJson("calibration.json") || {};

// Router threshold precedence: env var > calibration.json router_overrides >
// hardcoded default. fit_temperature.py writes router_overrides after sweeping
// operating points against real negatives (max rejection s.t. coverage>=80%).
function routerThreshold(name, envVar, fallback) {
  if (process.env[envVar]) return Number(process.env[envVar]);
  const override = calibration.router_overrides?.[name];
  if (typeof override === "number") return override;
  return fallback;
}

export const pipelineConfig = {
  // ---- ONNX model -------------------------------------------------------
  onnx: {
    checkpointDir: findCheckpointDir(),
    modelPath: path.join(findCheckpointDir(), "best_classifier.onnx"),
    classes: meta.classes?.length ? meta.classes : WASTE_CLASSES, // legacy checkpoints ship 10 outputs
    imgSize: Number(meta.img_size || 192),
    normalization: {
      mean: [0.485, 0.456, 0.406],   // ImageNet — matches torchvision training
      std: [0.229, 0.224, 0.225],
    },
    opMap: meta.op_map || OPERATIONAL_MAP,
    // Temperature for logit scaling. Fitted post-training by
    // training/fit_temperature.py; 1.0 = uncalibrated fallback.
    temperature: Number(calibration.temperature || 1.0),
  },

  // ---- Stage-0 quality gate ---------------------------------------------
  qualityGate: {
    minWidth: 64,
    minHeight: 64,
    // Laplacian variance below this => too blurry to classify honestly.
    minLaplacianVariance: Number(process.env.QG_MIN_LAPLACIAN_VAR || 55),
    // Mean luminance (0-255) below this => too dark.
    minMeanLuminance: Number(process.env.QG_MIN_LUMA || 40),
    analysisWidth: 320, // downscaled grayscale width used for the metrics
  },

  // ---- Stage-2 Gemini verifier ------------------------------------------
  gemini: {
    apiKeyPresent: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    timeoutMs: Number(process.env.GEMINI_VERIFY_TIMEOUT_MS || 12000),
    temperature: 0,          // verifier must be deterministic
    maxOutputTokens: 512,
    // A category counts as "present" in Gemini's reading above this conf.
    presenceConfidence: Number(process.env.GEM_PRESENCE_CONF || 0.5),
  },

  // ---- Decision router thresholds ----------------------------------------
  router: {
    // CNN sigmoid prob >= autoAccept AND single-label => skip Gemini (fast path).
    autoAcceptProb: routerThreshold("autoAcceptProb", "ROUTER_AUTO_ACCEPT", 0.82),
    // Sigmoid margin (top1-top2) required for the fast path.
    fastPathMinMargin: routerThreshold("fastPathMinMargin", "ROUTER_FAST_MARGIN", 0.45),
    // Below this the image is hopeless -> honest reject without spending Gemini.
    lowConfidenceFloor: Number(process.env.ROUTER_LOW_FLOOR || 0.28),
    // non_waste score >= this => reject outright (Gemini not called).
    nonWasteReject: Number(process.env.ROUTER_NON_WASTE_REJECT || 0.62),
    // non_waste score in [grayLow, reject) => ambiguous subject -> verify.
    nonWasteGrayLow: Number(process.env.ROUTER_NON_WASTE_GRAY || 0.35),
    // >=2 classes above this prob => mixed waste => always verify.
    mixedOverlapThreshold: Number(process.env.ROUTER_MIXED_OVERLAP || 0.45),
    // A class only counts as co-present if its sigmoid ALSO reaches this
    // fraction of the top class's sigmoid. Saturated multi-label heads keep
    // weak stragglers above any absolute cut; the relative bar kills them
    // without hiding genuine 50/50 piles.
    mixedDominanceRatio: Number(process.env.ROUTER_MIXED_DOMINANCE || 0.7),
  },

  // ---- Fusion --------------------------------------------------------------
  fusion: {
    // Jaccard overlap of CNN vs Gemini label sets below this => disagreement
    // => requires_human_review (we never silently pick a winner).
    agreementJaccard: Number(process.env.FUSION_AGREE_JACCARD || 0.5),
    cnnWeight: Number(process.env.FUSION_CNN_WEIGHT || 0.6),
    geminiWeight: Number(process.env.FUSION_GEMINI_WEIGHT || 0.4),
    volumeCategories: ["small", "medium", "large", "very_large"],
    volumeRanges: {
      small: "0.1 - 0.5 cubic meters",
      medium: "0.5 - 2 cubic meters",
      large: "2 - 6 cubic meters",
      very_large: "6+ cubic meters",
    },
  },
};
