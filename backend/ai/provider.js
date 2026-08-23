import { appConfig } from "../config.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

class AIProvider {
  async analyzeWaste() { throw new Error("AI provider not implemented."); }
}

class PythonAIProvider extends AIProvider {
  async analyzeWaste(payload) {
    const image = dataUrlToBuffer(payload.image);
    const formData = new FormData();
    const blob = new Blob([image.buffer], { type: image.mimeType });
    formData.append("file", blob, "waste.jpg");
    formData.append("latitude", String(payload.location?.latitude || 0));
    formData.append("longitude", String(payload.location?.longitude || 0));
    formData.append("comment", payload.comment || "");
    formData.append("mediaType", payload.mediaType || "image");

    const AI_TIMEOUT_MS = 120000;
    console.log(`[AI] Request received — calling Python AI service at ${AI_SERVICE_URL}`);
    console.log(`[AI] Image size: ${Math.round(image.buffer.length / 1024)}KB, timeout: ${AI_TIMEOUT_MS / 1000}s`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let response;
    try {
      const t0 = Date.now();
      response = await fetch(`${AI_SERVICE_URL}/api/analyze-waste`, {
        method: "POST", body: formData, signal: controller.signal,
      });
      console.log(`[AI] Python responded with HTTP ${response.status} in ${Date.now() - t0}ms`);
    } catch (err) {
      if (err.name === "AbortError") {
        console.error("[AI] Python request timed out after 120s");
        throw new Error("AI analysis timed out. The models may still be loading on the first run — please try again in a moment.");
      }
      console.error(`[AI] Python service unavailable at ${AI_SERVICE_URL}:`, err.message);
      throw new Error(`Could not connect to AI service at ${AI_SERVICE_URL}. Is the Python backend running? Start it with: cd swachhlens-ai && python main.py`);
    } finally { clearTimeout(timeout); }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error(`[AI] Python returned HTTP ${response.status}:`, errBody.detail || errBody);
      throw new Error(errBody.detail || `AI analysis failed (${response.status})`);
    }

    const result = await response.json();
    console.log(`[AI] Analysis complete: ${result.wasteType}/${result.severity} (${result.processingTime}s)`);
    return {
      wasteType: result.wasteType || "garbage_dump",
      confidence: result.confidence || 0,
      estimatedVolume: result.estimatedVolume || "medium",
      estimatedVolumeRange: result.estimatedVolumeRange || "0.5 - 1.5 cubic meters",
      severity: result.severity || "medium",
      potentialRisks: (result.potentialRisk || "Area hygiene deterioration").split(", "),
      recommendation: result.recommendation || "Assign cleanup team.",
      hazardFlag: result.wasteType === "hazardous_waste" || result.wasteType === "drain_blockage",
      recyclableHeavy: result.wasteType === "plastic_waste",
      needsReview: Boolean(result.needsReview) || (result.confidence || 0) < 30,
      detectionSummary: result.detectionSummary || { count: 1, coveragePercent: 50, classes: [result.wasteType], recyclableHeavy: false },
      aiVerified: true,
      processingTime: result.processingTime,
      dispatch: result.dispatch,
      models: result.models,
    };
  }
}

class MockAIProvider extends AIProvider {
  async analyzeWaste(payload) {
    const text = String(payload.comment || "").toLowerCase();
    const image = String(payload.image || "");
    let wasteType = "garbage_dump";
    let confidence = 78;
    let volume = "medium";
    let severity = "medium";
    let risks = ["Area hygiene deterioration"];
    let recommendation = "Assign standard cleanup team in the next available slot.";

    if (/medical|hazard|sharp|syringe|chemical/i.test(text)) {
      wasteType = "hazardous_waste"; confidence = 94; volume = "very_large"; severity = "critical";
      risks = ["Hazardous material", "Public health exposure", "Environmental contamination"];
      recommendation = "Escalate to hazardous waste unit immediately. Deploy hazmat-trained team with proper PPE.";
    } else if (/drain|waterlog|blocked|sewer|water/i.test(text)) {
      wasteType = "drain_blockage"; confidence = 88; volume = "large"; severity = "high";
      risks = ["Drain blockage", "Flooding risk", "Mosquito breeding"];
      recommendation = "Dispatch drain clearing crew with jetting equipment and mini tipper.";
    } else if (/plastic|bottle|wrapper|polythene|bag/i.test(text)) {
      wasteType = "plastic_waste"; confidence = 91; volume = "large"; severity = "high";
      risks = ["Pedestrian obstruction", "Environmental pollution", "Microplastic risk"];
      recommendation = "Assign sorting-capable team with recycling truck for plastic segregation.";
    } else if (/construction|debris|rubble|brick|concrete|cement/i.test(text)) {
      wasteType = "construction_debris"; confidence = 86; volume = "large"; severity = "high";
      risks = ["Structural hazard", "Pedestrian obstruction"];
      recommendation = "Deploy heavy cleanup crew with dump truck and loading equipment.";
    } else if (/organic|food|vegetable|kitchen|biodegradable|compost/i.test(text)) {
      wasteType = "organic_waste"; confidence = 89; volume = "medium"; severity = "medium";
      risks = ["Odor", "Pest attraction", "Area hygiene deterioration"];
      recommendation = "Assign manual cleanup team. Route organic waste to composting facility.";
    } else if (/electronic|e-waste|computer|phone|laptop|battery|circuit/i.test(text)) {
      wasteType = "e_waste"; confidence = 92; volume = "medium"; severity = "high";
      risks = ["Electronic waste toxins", "Heavy metal leaching"];
      recommendation = "Route to certified e-waste recycling partner. Handle with care.";
    } else if (/bin|dustbin|overflow|trash|garbage can/i.test(text)) {
      wasteType = "overflowing_bin"; confidence = 85; volume = "medium"; severity = "medium";
      risks = ["Area hygiene deterioration", "Pest attraction"];
      recommendation = "Dispatch team to empty bin and sanitize the area.";
    } else {
      const randomTypes = ["garbage_dump", "plastic_waste", "organic_waste", "overflowing_bin"];
      wasteType = randomTypes[Math.floor(Math.random() * randomTypes.length)];
      confidence = 75 + Math.floor(Math.random() * 15);
      const volumes = ["small", "medium", "large"];
      volume = volumes[Math.floor(Math.random() * volumes.length)];
      if (volume === "large") severity = "high";
      else if (volume === "medium") severity = "medium";
      else severity = "low";
    }

    if (image.length > 50000) {
      confidence = Math.min(97, confidence + Math.floor(Math.random() * 5));
    }

    const dispatchRecommendation = this._getDispatch(wasteType, volume, severity);

    return {
      wasteType, confidence, estimatedVolume: volume,
      estimatedVolumeRange: volumeRange(volume), severity,
      potentialRisks: risks, recommendation,
      hazardFlag: wasteType === "hazardous_waste" || wasteType === "drain_blockage",
      recyclableHeavy: wasteType === "plastic_waste",
      needsReview: false,
      detectionSummary: { count: 1 + Math.floor(Math.random() * 3), coveragePercent: 20 + Math.floor(Math.random() * 40), classes: [wasteType], recyclableHeavy: wasteType === "plastic_waste" },
      processingTime: (1.5 + Math.random() * 2).toFixed(2),
      dispatch: dispatchRecommendation,
      models: { detector: "smart_mock", volume: "smart_mock", duplicate: "smart_mock", severity: "rule_based", dispatch: "rules" },
    };
  }

  _getDispatch(wasteType, volume, severity) {
    if (wasteType === "hazardous_waste" || severity === "critical") return { team: "special_hazmat_team", vehicle: "hazmat_van", sla_hours: 2, priority: "immediate", instructions: "Hazardous material detected. Deploy hazmat-trained team with proper PPE." };
    if (wasteType === "drain_blockage") return { team: "drain_clearing_unit", vehicle: "mini_truck", sla_hours: 4, priority: "high", instructions: "Drain blockage detected. Deploy jetting equipment." };
    if (wasteType === "e_waste") return { team: "e_waste_recycling_partner", vehicle: "recycling_truck", sla_hours: 24, priority: "medium", instructions: "E-waste detected. Route to certified recycling partner." };
    if (volume === "large" || volume === "very_large") return { team: "extended_cleanup_crew", vehicle: "mini_truck", sla_hours: 6, priority: "medium", instructions: "Large waste volume. Deploy extended crew." };
    return { team: "standard_cleanup_team", vehicle: null, sla_hours: 24, priority: "low", instructions: "Standard cleanup. Assign to next available team." };
  }
}

class PythonAIProviderWithFallback extends AIProvider {
  constructor() {
    super();
    this._pythonProvider = new PythonAIProvider();
    this._mockProvider = new MockAIProvider();
    this._consecutiveFailures = 0;
  }
  async analyzeWaste(payload) {
    if (this._consecutiveFailures >= 3) {
      console.warn("[AI] Python service failed 3+ times consecutively, using mock provider");
      return this._mockProvider.analyzeWaste(payload);
    }
    try {
      const result = await this._pythonProvider.analyzeWaste(payload);
      this._consecutiveFailures = 0;
      return result;
    } catch (err) {
      this._consecutiveFailures++;
      const msg = err.message || "";
      console.error(`[AI] Python service error (attempt ${this._consecutiveFailures}):`, msg);
      const isUnreachable = msg.includes("connect") || msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("unavailable") || msg.includes("timed out") || msg.includes("abort");
      if (isUnreachable) {
        console.warn("[AI] Python service unreachable, falling back to smart mock provider");
        return this._mockProvider.analyzeWaste(payload);
      }
      console.warn("[AI] Python service returned error, falling back to smart mock provider");
      return this._mockProvider.analyzeWaste(payload);
    }
  }
}

class RealAIProvider extends AIProvider {
  async analyzeWaste(payload) {
    if (!appConfig.yoloEndpointUrl || !appConfig.yoloApiKey) throw new Error("YOLO is not configured. Set YOLO_ENDPOINT_URL and YOLO_API_KEY on the server before enabling AI_PROVIDER=real.");
    const image = dataUrlToBuffer(payload.image);
    const endpoint = new URL(appConfig.yoloEndpointUrl);
    endpoint.searchParams.set("api_key", appConfig.yoloApiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), appConfig.yoloTimeoutMs);
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": image.mimeType }, body: image.buffer, signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("YOLO analysis timed out. Please try again.");
      throw new Error("Could not connect to the YOLO inference service.");
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`YOLO inference failed (${response.status}). Check the endpoint URL and server-side API key.`);
    return buildAnalysisFromPredictions(await response.json());
  }
}

const CATEGORY_MAP = {
  "overflowing bin": "overflowing_bin", overflowing_bin: "overflowing_bin", dustbin: "overflowing_bin", bin: "overflowing_bin",
  garbage: "garbage_dump", trash: "garbage_dump", litter: "garbage_dump", dump: "garbage_dump", garbage_dump: "garbage_dump",
  plastic: "plastic_waste", bottle: "plastic_waste", wrapper: "plastic_waste", plastic_waste: "plastic_waste",
  construction: "construction_debris", debris: "construction_debris", rubble: "construction_debris", construction_debris: "construction_debris",
  organic: "organic_waste", food: "organic_waste", biodegradable: "organic_waste", organic_waste: "organic_waste",
  "e waste": "e_waste", ewaste: "e_waste", electronics: "e_waste", electronic: "e_waste", e_waste: "e_waste",
  hazardous: "hazardous_waste", medical: "hazardous_waste", syringe: "hazardous_waste", chemical: "hazardous_waste", hazardous_waste: "hazardous_waste",
  drain: "drain_blockage", blockage: "drain_blockage", sewer: "drain_blockage", drain_blockage: "drain_blockage",
};

function mockResult(wasteType, confidence, estimatedVolume, severity, potentialRisks, recommendation) {
  return { wasteType, confidence, estimatedVolume, estimatedVolumeRange: volumeRange(estimatedVolume), severity, potentialRisks, recommendation, hazardFlag: wasteType === "hazardous_waste" || wasteType === "drain_blockage", recyclableHeavy: wasteType === "plastic_waste" };
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
function normaliseCategory(label = "") {
  const key = String(label).toLowerCase().replace(/[-_]/g, " ").trim();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  return Object.entries(CATEGORY_MAP).find(([term]) => key.includes(term))?.[1] || "garbage_dump";
}
function volumeRange(category) {
  return { small: "Under 0.5 cubic meters", medium: "0.5 - 1.5 cubic meters", large: "1.5 - 3 cubic meters", very_large: "Over 3 cubic meters" }[category];
}
function buildAnalysisFromPredictions(result) {
  const predictions = Array.isArray(result.predictions) ? result.predictions : [];
  if (!predictions.length) return { wasteType: "garbage_dump", confidence: 0, estimatedVolume: "small", estimatedVolumeRange: volumeRange("small"), severity: "low", potentialRisks: ["No waste object confidently detected"], recommendation: "Route this report for municipal review; the AI could not confirm a waste type.", detectionSummary: { count: 0, coveragePercent: 0, classes: [] } };
  const width = Number(result.image?.width || result.width || 1), height = Number(result.image?.height || result.height || 1);
  const confident = predictions.filter((item) => Number(item.confidence || 0) >= 0.2);
  const items = confident.length ? confident : predictions;
  const top = [...items].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
  const wasteType = normaliseCategory(top.class || top.label);
  const coveragePercent = Math.min(100, items.reduce((sum, item) => sum + Number(item.width || 0) * Number(item.height || 0), 0) / (width * height) * 100);
  const estimatedVolume = coveragePercent < 10 ? "small" : coveragePercent < 25 ? "medium" : coveragePercent < 50 ? "large" : "very_large";
  const recyclableHeavy = items.filter((item) => normaliseCategory(item.class || item.label) === "plastic_waste").length > items.length / 2;
  const severity = wasteType === "hazardous_waste" ? "critical" : ["drain_blockage", "e_waste"].includes(wasteType) || ["large", "very_large"].includes(estimatedVolume) ? "high" : estimatedVolume === "medium" ? "medium" : "low";
  const potentialRisks = wasteType === "hazardous_waste" ? ["Hazardous material", "Public health exposure"] : wasteType === "drain_blockage" ? ["Drain blockage", "Flooding risk"] : ["large", "very_large"].includes(estimatedVolume) ? ["Road or pedestrian obstruction"] : ["Area hygiene deterioration"];
  const recommendation = wasteType === "hazardous_waste" ? "Escalate to the hazardous waste unit immediately." : wasteType === "drain_blockage" ? "Dispatch a drain-clearing crew and mini tipper." : recyclableHeavy ? "Route to a sorting-capable team and recycling partner." : ["large", "very_large"].includes(estimatedVolume) ? "Dispatch extra workers with a mini truck." : "Assign a manual cleanup team in the next available slot.";
  return { wasteType, confidence: Math.round(Number(top.confidence || 0) * 100), estimatedVolume, estimatedVolumeRange: volumeRange(estimatedVolume), severity, potentialRisks, recommendation, hazardFlag: wasteType === "hazardous_waste" || wasteType === "drain_blockage", recyclableHeavy, detectionSummary: { count: items.length, coveragePercent: Number(coveragePercent.toFixed(1)), classes: [...new Set(items.map((item) => normaliseCategory(item.class || item.label)))], recyclableHeavy } };
}

export { MockAIProvider };

export function getAIProvider() {
  const mode = appConfig.aiProvider;
  if (mode === "onnx") {
    // Lazy import keeps onnxruntime-node/sharp out of the mock-mode cold path.
    return { analyzeWaste: async (payload) => {
      const { OnnxAIProviderWithFallback } = await import("./onnxProvider.js");
      return new OnnxAIProviderWithFallback().analyzeWaste(payload);
    } };
  }
  if (mode === "python") return new PythonAIProviderWithFallback();
  if (mode === "real") return new RealAIProvider();
  return new MockAIProvider();
}