import { appConfig } from "../config.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function isConfigured() {
  return Boolean(appConfig.geminiApiKey);
}

function authParams() {
  const key = appConfig.geminiApiKey;
  // Standard API keys start with "AIza" and go in the query string.
  // OAuth-style tokens (e.g. "AQ....") must be sent as a Bearer header.
  if (key.startsWith("AIza")) return { keyParam: `?key=${encodeURIComponent(key)}`, headers: {} };
  return { keyParam: "", headers: { Authorization: `Bearer ${key}` } };
}

function dataUrlToPart(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

async function callGemini(parts, systemInstruction) {
  const { keyParam, headers } = authParams();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), appConfig.geminiTimeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}/${appConfig.geminiModel}:generateContent${keyParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

function parseJsonLoose(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error("Could not parse Gemini JSON response.");
}

/**
 * Verify a worker's cleanup completion by comparing before/after photos.
 * Returns { available, verified, confidence, reason, qualityScore, model }.
 * Never throws — callers get an "unavailable" verdict on any failure so the
 * worker flow is never blocked by an AI outage.
 */
export async function verifyCleanupCompletion({ beforeImage, afterImage, wasteType, comment }) {
  if (!isConfigured()) {
    return { available: false, verified: null, confidence: 0, reason: "Gemini is not configured (GEMINI_API_KEY missing).", qualityScore: null, model: null };
  }
  const parts = [];
  if (beforeImage) parts.push({ text: "BEFORE photo (site with waste):" }, dataUrlToPart(beforeImage));
  parts.push({ text: "AFTER photo (same site after cleanup):" }, dataUrlToPart(afterImage));
  parts.push({
    text: `Task: compare the photos and judge whether the waste visible in the BEFORE photo has been removed${beforeImage ? "" : " (no before photo provided; judge only whether the AFTER site looks clean and waste-free)"}.${wasteType ? ` Reported waste category: ${wasteType}.` : ""}${comment ? ` Worker note: ${comment}.` : ""} Respond ONLY with minified JSON: {"verified":boolean,"confidence":0-100,"qualityScore":0-100,"reason":"one short sentence"}`,
  });

  try {
    const text = await callGemini(parts, "You are a strict municipal sanitation auditor for SwachhLens. Judge photo evidence conservatively. Output only the requested JSON.");
    const parsed = parseJsonLoose(text);
    return {
      available: true,
      verified: Boolean(parsed.verified),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence || 0))),
      qualityScore: parsed.qualityScore != null ? Math.max(0, Math.min(100, Number(parsed.qualityScore))) : null,
      reason: String(parsed.reason || "").slice(0, 300),
      model: appConfig.geminiModel,
    };
  } catch (err) {
    console.error("[Gemini] verifyCleanupCompletion failed:", err.message);
    return { available: false, verified: null, confidence: 0, reason: `Verification unavailable: ${err.message}`, qualityScore: null, model: null };
  }
}

/**
 * Detect the dustbin/waste-stream type from a single photo.
 * Returns { available, binType, binLabel, confidence, reason, model }.
 */
export async function detectBinType({ image }) {
  if (!isConfigured()) {
    return { available: false, binType: null, binLabel: null, confidence: 0, reason: "Gemini is not configured.", model: null };
  }
  const parts = [
    { text: "Photo to classify:" },
    dataUrlToPart(image),
    {
      text: 'Classify the dominant waste/dustbin stream visible. Choose exactly one of: green (wet/organic), blue (dry recyclable), yellow (hazardous/e-waste/biomedical), black (reject/soiled non-recyclable), none (no bin or inert debris like construction material). Respond ONLY with minified JSON: {"binType":"green|blue|yellow|black|none","confidence":0-100,"label":"short description","reason":"one short sentence"}',
    },
  ];

  try {
    const text = await callGemini(parts, "You are a waste-segregation expert following Indian municipal solid waste rules. Output only the requested JSON.");
    const parsed = parseJsonLoose(text);
    const allowed = ["green", "blue", "yellow", "black", "none"];
    const binType = allowed.includes(parsed.binType) ? parsed.binType : null;
    return {
      available: true,
      binType,
      binLabel: String(parsed.label || "").slice(0, 120),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence || 0))),
      reason: String(parsed.reason || "").slice(0, 300),
      model: appConfig.geminiModel,
    };
  } catch (err) {
    console.error("[Gemini] detectBinType failed:", err.message);
    return { available: false, binType: null, binLabel: null, confidence: 0, reason: `Detection unavailable: ${err.message}`, model: null };
  }
}
