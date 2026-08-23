// SwachhLens AI Provider - ONNX inference inside the Node/Vercel serverless
// function. Faithful port of the Python pipeline (swachhlens-ai/main.py +
// models/*) so the live demo needs no separate Python service:
//
//   1. Classification : trained EfficientNet-B0 (best_classifier.onnx) with the
//                       calibrated unknown-rejection rule from thresholds.json.
//   2. Detection      : HSV colour-region heuristic (port of detector.py
//                       _heuristic_detect) for bbox/detectionSummary.
//   3. Volume         : Canny-edge coverage heuristic (port of volume.py
//                       _heuristic_volume).
//   4. Severity       : rule-based scorer (port of severity.py).
//   5. Dispatch       : rules engine (port of dispatch.py).
//
// Preprocessing matches training exactly: Resize((192,192)) squashed,
// ToTensor([0,1]), ImageNet mean/std normalisation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECKPOINT_CANDIDATES = [
  path.join(process.cwd(), "swachhlens-ai", "checkpoints"),
  path.resolve(__dirname, "..", "..", "swachhlens-ai", "checkpoints"),
];

function findCheckpointDir() {
  for (const dir of CHECKPOINT_CANDIDATES) {
    if (fs.existsSync(path.join(dir, "best_classifier.onnx"))) return dir;
  }
  throw new Error(`best_classifier.onnx not found in: ${CHECKPOINT_CANDIDATES.join(", ")}`);
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const IMG_SIZE = 192;

let _sessionPromise = null;
let _assets = null;

async function getSession() {
  if (!_sessionPromise) {
    const ort = await import("onnxruntime-node");
    const modelPath = path.join(findCheckpointDir(), "best_classifier.onnx");
    _sessionPromise = ort.InferenceSession.create(modelPath, { graphOptimizationLevel: "all" });
  }
  return _sessionPromise;
}

function loadAssets() {
  if (_assets) return _assets;
  const dir = findCheckpointDir();
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "onnx_meta.json"), "utf8"));
  let thresholds = { conf_threshold: 0.6, margin_threshold: 0.05 };
  try {
    const t = JSON.parse(fs.readFileSync(path.join(dir, "thresholds.json"), "utf8"));
    thresholds.conf_threshold = t.conf_threshold ?? thresholds.conf_threshold;
    thresholds.margin_threshold = t.margin_threshold ?? thresholds.margin_threshold;
  } catch {
    // calibrated thresholds missing -> classifier.py defaults
  }
  _assets = { meta, thresholds };
  return _assets;
}

function softmax(logits) {
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  const exp = logits.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / sum);
}

async function preprocessToTensor(imageBuffer) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .removeAlpha()
    .resize(IMG_SIZE, IMG_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const plane = IMG_SIZE * IMG_SIZE;
  const floats = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    floats[i] = data[i * info.channels] / 255;
    floats[plane + i] = data[i * info.channels + 1] / 255;
    floats[2 * plane + i] = data[i * info.channels + 2] / 255;
  }
  for (let c = 0; c < 3; c++) {
    const mean = IMAGENET_MEAN[c];
    const std = IMAGENET_STD[c];
    const off = c * plane;
    for (let i = 0; i < plane; i++) floats[off + i] = (floats[off + i] - mean) / std;
  }
  return floats;
}

// Returns the same contract as models/classifier.py classify_image().
export async function classifyBuffer(imageBuffer) {
  const st = loadAssets();
  try {
    const ort = await import("onnxruntime-node");
    const session = await getSession();
    const input = new ort.Tensor("float32", await preprocessToTensor(imageBuffer), [1, 3, IMG_SIZE, IMG_SIZE]);
    const { logits } = await session.run({ input });
    const probs = softmax(Array.from(logits.data));

    const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    const topPredictions = order.slice(0, 3).map(([p, i]) => ({
      class: st.meta.classes[i],
      confidence: Math.round(p * 1000) / 10,
    }));

    const bestP = order[0][0];
    const secondP = order.length > 1 ? order[1][0] : 1.0;
    const margin = bestP - secondP;
    const ct = st.thresholds.conf_threshold;
    const mt = st.thresholds.margin_threshold;
    const accepted = bestP >= ct && margin >= mt;
    const category = accepted ? st.meta.classes[order[0][1]] : "unknown";

    return {
      checked: true,
      is_waste: accepted,
      category,
      wasteType: accepted ? (st.meta.op_map[category] || "garbage_dump") : "unknown",
      confidence: Math.round(bestP * 1000) / 10,
      status: accepted ? "accepted" : "rejected",
      rejection_reason: accepted ? null : bestP < ct ? "low_confidence" : "ambiguous_margin",
      top_predictions: topPredictions,
      decision_rule: { conf_threshold: ct, margin_threshold: mt },
    };
  } catch (err) {
    console.warn("[AI:onnx] classifyBuffer failed (fail-open):", err.message);
    return { checked: false };
  }
}

// ---------------------------------------------------------------------------
// Image analysis helpers on full-resolution pixels
// ---------------------------------------------------------------------------

async function loadRawRGB(imageBuffer, maxSide = 1024) {
  const sharp = (await import("sharp")).default;
  const img = sharp(imageBuffer).rotate();
  const meta = await img.metadata();
  const scale = Math.min(1, maxSide / Math.max(meta.width || 1, meta.height || 1));
  const w = Math.max(1, Math.round((meta.width || 1) * scale));
  const h = Math.max(1, Math.round((meta.height || 1) * scale));
  const { data } = await img
    .removeAlpha()
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w, h };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hDeg = 0;
  if (d > 0) {
    if (max === r) hDeg = ((g - b) / d) % 6;
    else if (max === g) hDeg = (b - r) / d + 2;
    else hDeg = (r - g) / d + 4;
    hDeg *= 60;
    if (hDeg < 0) hDeg += 360;
  }
  const s = max === 0 ? 0 : d / max;
  // OpenCV convention: H in [0,180], S/V in [0,255]
  return { h: hDeg / 2, s: s * 255, v: max * 255 };
}

// Port of models/detector.py _heuristic_detect(): colour-area classification.
async function heuristicDetect(imageBuffer) {
  try {
    const { data, w, h } = await loadRawRGB(imageBuffer);
    let greenArea = 0;
    let brownArea = 0;
    let whiteArea = 0;
    for (let i = 0; i < w * h; i++) {
      const { h: hv, s, v } = rgbToHsv(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
      if (hv >= 30 && hv <= 85 && s >= 30 && v >= 30) greenArea++;
      else if (hv >= 10 && hv <= 25 && s >= 30 && s <= 200 && v >= 30 && v <= 200) brownArea++;
      else if (s <= 30 && v >= 180) whiteArea++;
    }
    const total = w * h;

    const edges = cannyEdges(await toGrayBlurred(imageBuffer));
    const largeContours = countLargeComponents(edges, w, h, total * 0.01);

    if (greenArea / total > 0.15) {
      return { class: "organic_waste", confidence: 0.72, bbox: [0, 0, w, h] };
    }
    if (brownArea / total > 0.1) {
      return { class: "construction_debris", confidence: 0.68, bbox: [0, 0, w, h] };
    }
    if (whiteArea / total > 0.08 && largeContours > 2) {
      return { class: "plastic_waste", confidence: 0.65, bbox: [0, 0, w, h] };
    }
    return { class: "garbage_dump", confidence: 0.6, bbox: [0, 0, w, h] };
  } catch (err) {
    console.warn("[AI:onnx] heuristicDetect failed:", err.message);
    return null;
  }
}

function toGrayBlurred(imageBuffer, maxSide = 768) {
  return (async () => {
    const sharp = (await import("sharp")).default;
    const img = sharp(imageBuffer).rotate().greyscale();
    const meta = await img.metadata();
    const scale = Math.min(1, maxSide / Math.max(meta.width || 1, meta.height || 1));
    const w = Math.max(1, Math.round((meta.width || 1) * scale));
    const h = Math.max(1, Math.round((meta.height || 1) * scale));
    const { data } = await img
      .resize(w, h, { fit: "fill" })
      .blur(1.4) // ~ cv2.GaussianBlur(5x5)
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { gray: data, w, h };
  })();
}

// Canny edge detector (Sobel -> NMS -> double threshold + hysteresis),
// equivalent of cv2.Canny(blurred, 50, 150).
function cannyEdges({ gray, w, h }) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] =
        -gray[i - w - 1] + gray[i - w + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + w - 1] + gray[i + w + 1];
      gy[i] =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
    }
  }

  const mag = new Float32Array(w * h);
  const dir = new Uint8Array(w * h); // quantised 0/45/90/135
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      mag[i] = Math.hypot(gx[i], gy[i]);
      const ang = ((Math.atan2(gy[i], gx[i]) * 180) / Math.PI + 180) % 180;
      dir[i] = ang < 22.5 ? 0 : ang < 67.5 ? 45 : ang < 112.5 ? 90 : ang < 157.5 ? 135 : 0;
    }
  }

  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      let a;
      let b;
      switch (dir[i]) {
        case 0: a = mag[i - 1]; b = mag[i + 1]; break;
        case 45: a = mag[i - w + 1]; b = mag[i + w - 1]; break;
        case 90: a = mag[i - w]; b = mag[i + w]; break;
        default: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
      }
      nms[i] = m >= a && m >= b ? m : 0;
    }
  }

  const LOW = 50;
  const HIGH = 150;
  const edges = new Uint8Array(w * h);
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (nms[i] >= HIGH) {
      edges[i] = 255;
      stack.push(i);
    } else if (nms[i] >= LOW) {
      edges[i] = 128; // weak
    }
  }
  while (stack.length) {
    const i = stack.pop();
    const y = Math.floor(i / w);
    const x = i % w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (edges[j] === 128) {
          edges[j] = 255;
          stack.push(j);
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (edges[i] !== 255) edges[i] = 0;
  }
  return edges;
}

// 8-connected components over an edge map; returns bounding boxes.
function edgeComponents(edges, w, h) {
  const visited = new Uint8Array(w * h);
  const boxes = [];
  for (let start = 0; start < w * h; start++) {
    if (!edges[start] || visited[start]) continue;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    const queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const i = queue.pop();
      const y = Math.floor(i / w);
      const x = i % w;
      area++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (edges[j] && !visited[j]) {
            visited[j] = 1;
            queue.push(j);
          }
        }
      }
    }
    boxes.push({ minX, minY, maxX, maxY, area });
  }
  return boxes;
}

function countLargeComponents(edges, w, h, minArea) {
  return edgeComponents(edges, w, h).filter(
    (b) => (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) > minArea,
  ).length;
}

// Port of models/volume.py _heuristic_volume(): Canny contour coverage.
async function heuristicVolume(imageBuffer, bbox) {
  try {
    const { gray, w, h } = await toGrayBlurred(imageBuffer);
    const edges = cannyEdges({ gray, w, h });
    const boxes = edgeComponents(edges, w, h);

    const x1 = Math.round(bbox[0]);
    const y1 = Math.round(bbox[1]);
    const x2 = Math.round(bbox[2]);
    const y2 = Math.round(bbox[3]);
    const roiArea = Math.max(1, (x2 - x1) * (y2 - y1));

    // cv2.contourArea of a closed outline ~= enclosed fill; approximate with
    // component bounding-box area (upper bound) scaled by edge-pixel density.
    let wasteArea = 0;
    for (const b of boxes) {
      if (b.minX >= x1 && b.minY >= y1) {
        const boxArea = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
        wasteArea += Math.min(boxArea, roiArea);
      }
    }
    const coverage = roiArea > 0 ? wasteArea / roiArea : 0;
    const volumeScore = coverage * 10000;

    let category;
    if (volumeScore < 2000) category = "small";
    else if (volumeScore < 8000) category = "medium";
    else if (volumeScore < 25000) category = "large";
    else category = "very_large";
    return { category, score: volumeScore };
  } catch (err) {
    console.warn("[AI:onnx] heuristicVolume failed, defaulting medium:", err.message);
    return { category: "medium", score: 5000 };
  }
}

const VOLUME_RANGES = {
  small: "0.1 - 0.5 cubic meters",
  medium: "0.5 - 1.5 cubic meters",
  large: "1.5 - 3.0 cubic meters",
  very_large: "3.0+ cubic meters",
};

const RISK_MAP = {
  hazardous_waste: "Hazardous material, Public health exposure, Environmental contamination",
  drain_blockage: "Drain blockage, Flooding risk, Mosquito breeding",
  e_waste: "Electronic waste toxins, Heavy metal leaching",
  construction_debris: "Structural hazard, Pedestrian obstruction",
  organic_waste: "Odor, Pest attraction, Area hygiene deterioration",
  plastic_waste: "Pedestrian obstruction, Environmental pollution, Microplastic risk",
  overflowing_bin: "Area hygiene deterioration, Pest attraction",
  garbage_dump: "Area hygiene deterioration, Public health risk",
};

const HAZARDOUS_TYPES = ["hazardous_waste", "e_waste"];
const HIGH_RISK_TYPES = ["construction_debris", "drain_blockage"];
const VOLUME_WEIGHTS = { small: 1, medium: 2, large: 3, very_large: 4 };

// Port of models/severity.py _rule_based_severity().
function ruleBasedSeverity(wasteType, volumeCategory, confidence,
  reportFrequency = 1, ageHours = 0, locationSensitivity = 0.3) {
  let score = 0;
  if (HAZARDOUS_TYPES.includes(wasteType)) score += 35;
  else if (HIGH_RISK_TYPES.includes(wasteType)) score += 25;
  else score += 10;

  score += (VOLUME_WEIGHTS[volumeCategory] ?? 2) * 5;
  score += Math.min((confidence / 100) * 10, 10);
  score += Math.min(reportFrequency * 3, 15);
  if (ageHours > 24) score += 10;
  else if (ageHours > 12) score += 5;
  score += locationSensitivity * 15;

  let level;
  if (score >= 70) level = "critical";
  else if (score >= 50) level = "high";
  else if (score >= 30) level = "medium";
  else level = "low";

  const jitter = Math.floor(Math.random() * 10) - 5; // np.random.randint(-5, 5)
  const confidencePct = Math.min(95, Math.max(60, Math.trunc(score + jitter)));
  return { severity: level, confidence: confidencePct, score: Math.round(score * 10) / 10, method: "rule_based" };
}

// Port of models/dispatch.py recommend_action().
function recommendAction(wasteType, volumeCategory, severity) {
  if (wasteType === "hazardous_waste" || severity === "critical") {
    return {
      team: "special_hazmat_team", vehicle: "hazmat_van", sla_hours: 2,
      priority: "immediate",
      instructions: "Hazardous material detected. Deploy hazmat-trained team with proper PPE. Cordon off area.",
      required_ppe: ["gloves", "mask", "goggles", "protective_suit"],
    };
  }
  if (wasteType === "drain_blockage") {
    return {
      team: "drain_clearing_unit", vehicle: "mini_truck", sla_hours: 4,
      priority: "high",
      instructions: "Drain blockage detected. Deploy drain clearing crew with jetting equipment and mini tipper.",
      required_ppe: ["gloves", "boots"],
    };
  }
  if (wasteType === "e_waste") {
    return {
      team: "e_waste_recycling_partner", vehicle: "recycling_truck", sla_hours: 24,
      priority: "medium",
      instructions: "E-waste detected. Route to certified e-waste recycling partner. Handle with care.",
      required_ppe: ["gloves"],
    };
  }
  if (wasteType === "construction_debris" && ["large", "very_large"].includes(volumeCategory)) {
    return {
      team: "heavy_cleanup_crew", vehicle: "dump_truck", sla_hours: 6,
      priority: "high",
      instructions: "Large construction debris. Deploy heavy crew with dump truck and loading equipment.",
      required_ppe: ["helmet", "gloves", "boots"],
    };
  }
  if (wasteType === "plastic_waste" && ["large", "very_large"].includes(volumeCategory)) {
    return {
      team: "recycling_partner", vehicle: "recycling_truck", sla_hours: 24,
      priority: "medium",
      instructions: "Large plastic waste volume. Assign sorting-capable team with recycling truck.",
      required_ppe: ["gloves"],
    };
  }
  if (["large", "very_large"].includes(volumeCategory)) {
    return {
      team: "extended_cleanup_crew", vehicle: "mini_truck", sla_hours: 6,
      priority: "medium",
      instructions: "Large waste volume detected. Deploy extended crew with mini truck.",
      required_ppe: ["gloves", "boots"],
    };
  }
  if (severity === "high") {
    return {
      team: "priority_cleanup_team", vehicle: "standard_van", sla_hours: 4,
      priority: "high",
      instructions: "High-severity waste reported. Assign priority cleanup team.",
      required_ppe: ["gloves"],
    };
  }
  return {
    team: "standard_cleanup_team", vehicle: null, sla_hours: 24,
    priority: "low",
    instructions: "Standard cleanup. Assign to next available team in the ward.",
    required_ppe: ["gloves"],
  };
}

function dataUrlToBuffer(dataUrl) {
  const str = String(dataUrl || "");
  const match = str.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    if (!str.startsWith("data:")) throw new Error("No valid image provided. Please capture or upload a photo.");
    throw new Error("Invalid image format. Please retake the photo.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 10 * 1024 * 1024) throw new Error("Image is too large. Please capture a smaller photo (under 10MB).");
  return { mimeType: match[1], buffer };
}

export class OnnxAIProvider {
  async analyzeWaste(payload) {
    const image = dataUrlToBuffer(payload.image);
    const started = Date.now();

    const cls = await classifyBuffer(image.buffer);
    if (cls.checked && !cls.is_waste) {
      throw Object.assign(
        new Error("No waste detected in image. Please upload a photo of actual garbage/waste."),
        { statusCode: 400 },
      );
    }

    const topDetection = await heuristicDetect(image.buffer);
    if (!cls.checked && !topDetection) {
      throw new Error("No waste detected in image. Please try a clearer photo.");
    }

    let wasteType;
    let category;
    let confidence;
    let topPredictions;
    if (cls.checked) {
      wasteType = cls.wasteType;
      category = cls.category;
      confidence = cls.confidence / 100;
      topPredictions = cls.top_predictions;
    } else {
      wasteType = topDetection.class;
      category = topDetection.class;
      confidence = topDetection.confidence;
      topPredictions = [{ class: category, confidence: Math.round(confidence * 1000) / 10 }];
    }

    const bbox = topDetection ? topDetection.bbox : null;
    const detectorMethod = "opencv_heuristic"; // no YOLO inside serverless

    const { category: volumeCategory, score: volumeScore } =
      await heuristicVolume(image.buffer, bbox || [0, 0, 1, 1]);
    const volumeRange = VOLUME_RANGES[volumeCategory] || "0.5 - 1.5 cubic meters";
    const coveragePercent = Math.min(100, Math.round(volumeScore / 100));

    const severityResult = ruleBasedSeverity(wasteType, volumeCategory, confidence * 100);
    const dispatch = recommendAction(wasteType, volumeCategory, severityResult.severity);
    const potentialRisk = RISK_MAP[wasteType] || "Area hygiene deterioration";
    const needsReview = confidence < 0.3 || detectorMethod === "opencv_heuristic";

    const processingTime = (Date.now() - started) / 1000;
    console.log(`[AI:onnx] ${category} (${(confidence * 100).toFixed(1)}%) vol=${volumeCategory} ` +
      `sev=${severityResult.severity} in ${processingTime.toFixed(2)}s`);

    return {
      wasteType,
      is_waste: true,
      category,
      confidence: Math.round(confidence * 1000) / 10,
      status: "accepted",
      top_predictions: topPredictions,
      estimatedVolume: volumeCategory,
      estimatedVolumeRange: volumeRange,
      volumeScore: Math.round(volumeScore * 10) / 10,
      severity: severityResult.severity,
      severityConfidence: severityResult.confidence,
      severityMethod: severityResult.method,
      potentialRisk,
      potentialRisks: potentialRisk.split(", "),
      recommendation: `Assign ${dispatch.team} within ${dispatch.sla_hours} hours. ${dispatch.instructions}`,
      dispatch,
      needsReview,
      detectionSummary: {
        count: 1,
        classes: [category],
        topConfidence: Math.round(confidence * 1000) / 10,
        coveragePercent,
        recyclableHeavy: wasteType === "plastic_waste",
      },
      aiVerified: true,
      processingTime: Math.round(processingTime * 100) / 100,
      models: {
        detector: detectorMethod,
        classifier: Boolean(cls.checked),
        volume: "contour_heuristic",
        duplicate: "phash",
        severity: "rule_based",
        dispatch: "rules",
      },
    };
  }
}

export class OnnxAIProviderWithFallback {
  constructor() {
    this._onnx = new OnnxAIProvider();
    this._consecutiveFailures = 0;
  }
  async analyzeWaste(payload) {
    try {
      const result = await this._onnx.analyzeWaste(payload);
      this._consecutiveFailures = 0;
      return result;
    } catch (err) {
      this._consecutiveFailures++;
      console.error(`[AI:onnx] inference error (attempt ${this._consecutiveFailures}):`, err.message);
      const { MockAIProvider } = await import("./provider.js");
      return new MockAIProvider().analyzeWaste(payload);
    }
  }
}

