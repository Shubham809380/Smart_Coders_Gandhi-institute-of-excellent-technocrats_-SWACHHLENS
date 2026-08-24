import { createHash } from "node:crypto";
import { appConfig } from "../config.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Keep this gate fast — it runs BEFORE the main analysis, so it must feel instant.
const GATE_TIMEOUT_MS = Number(process.env.WASTE_GATE_TIMEOUT_MS || 6000);
// Identical image retries (user taps analyze again) reuse the verdict.
const CACHE_TTL_MS = Number(process.env.WASTE_GATE_CACHE_TTL_MS || 10 * 60 * 1000);

const verdictCache = new Map();

function authParams() {
  const key = appConfig.geminiApiKey;
  // New-format AI Studio keys ("AQ....") use the x-goog-api-key header.
  if (key.startsWith("AQ.")) return { keyParam: "", headers: { "x-goog-api-key": key } };
  // Standard API keys start with "AIza" and go in the query string;
  // OAuth-style tokens must be sent as a Bearer header.
  if (key.startsWith("AIza")) return { keyParam: `?key=${encodeURIComponent(key)}`, headers: {} };
  return { keyParam: "", headers: { Authorization: `Bearer ${key}` } };
}

function dataUrlToPart(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload.");
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

function sha256ofImage(dataUrl) {
  const base64 = String(dataUrl || "").split(",").pop() || "";
  return createHash("sha256").update(base64).digest("hex");
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

async function callGemini(parts) {
  const { keyParam, headers } = authParams();
  // One fast retry on transient network/5xx failures — the gate is the only
  // thing standing between a selfie and the classifier, so a silent timeout
  // must not degrade us to fail-open on the very first blip.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATE_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${BASE}/${appConfig.geminiModel}:generateContent${keyParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            // Deterministic verdicts: fixed seed + no thinking so retries and
            // identical images always land on the same answer.
            seed: 42,
            ...(appConfig.geminiModel.startsWith("gemini-2.5") || appConfig.geminiModel.startsWith("gemini-3")
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      continue; // timeout / network error -> retry once
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err = new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 160)}`);
      if (response.status >= 500 || response.status === 429) { lastErr = err; continue; }
      throw err;
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text).filter(Boolean).join("") || "";
    if (!text) throw new Error("Gemini returned an empty response.");
    return text;
  }
  throw lastErr || new Error("Gemini call failed.");
}

export function gatekeeperStatus() {
  return {
    configured: Boolean(appConfig.geminiApiKey),
    model: appConfig.geminiModel,
    timeoutMs: GATE_TIMEOUT_MS,
    cacheEntries: verdictCache.size,
  };
}

/**
 * Pre-check that an uploaded photo actually contains waste before the
 * expensive classification pipeline runs. NEVER throws and NEVER blocks
 * the report on its own failure (fail-open): any API/timeout/parse error
 * returns checked:false so the caller proceeds with the normal pipeline.
 *
 * Returns { checked, isWaste?, confidence?, reason?, cached? } or
 *         { checked:false, skipReason } when unavailable/skipped.
 */
export async function checkWasteImage({ image }) {
  if (!appConfig.geminiApiKey) {
    return { checked: false, skipReason: "GEMINI_API_KEY not configured" };
  }

  // Cost guard: same image within TTL reuses the previous verdict.
  const hash = sha256ofImage(image);
  const hit = verdictCache.get(hash);
  if (hit && hit.expires > Date.now()) return { ...hit.verdict, cached: true };

  const parts = [
    { text: "Photo to validate:" },
    dataUrlToPart(image),
    {
      text: 'Look at this image carefully. Decide whether it shows real waste, garbage, litter or debris that needs municipal cleanup.\n\nVALID (answer is_waste=true): garbage piles of any size, litter scattered anywhere, illegal dumping, an overflowing bin, construction rubble, a clogged/blocked drain packed with waste. A MIXED PILE containing several different materials together (e.g. plastic + paper + cloth + metal + food waste in one heap) is valid and common — do NOT reject it just because many material types are mixed. Waste is valid even when partially visible, far away, or when people/animals also appear in the frame, as long as actual trash is genuinely present.\n\nINVALID (answer is_waste=false): photos where the subject is a PERSON (selfie, portrait, group photo) with no genuine trash visible, body parts, pets/animals, clean streets, landscapes, buildings, vehicles without trash, food plates that are simply a meal, documents, screenshots, or indoor rooms that are untidy but contain no trash. A person posing with or near garbage is VALID only if trash is clearly visible.\n\nAlso answer:\n- "people_present": true if one or more humans are clearly visible in the frame.\n- "scene": best match among "none", "drain_blockage" (clogged storm drain/gutter), "overflowing_bin" (dustbin overflowing beyond its rim), "construction_debris" (rubble/sand/bricks dumped).\n- "materials": every waste material you can actually see, from this exact list only: ["plastic", "paper", "cardboard", "metal", "glass", "organic", "vegetation", "textile", "battery"]. For a mixed pile list ALL visible types; for a single-item photo list just that type. Empty array only when is_waste is false.\n\nAnswer strictly in this JSON format only, no extra text: {"is_waste": true/false, "reason": "one short sentence explaining what you actually see", "confidence": "high/medium/low", "people_present": true/false, "scene": "none|drain_blockage|overflowing_bin|construction_debris", "materials": ["plastic", ...]}',
    },
  ];

  try {
    const text = await callGemini(parts);
    const parsed = parseJsonLoose(text);
    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
    const allowedScenes = ["none", "drain_blockage", "overflowing_bin", "construction_debris"];
    const scene = allowedScenes.includes(parsed.scene) ? parsed.scene : "none";
    // Material vocabulary must match the CNN's unified class list exactly so
    // the arbitration layer can compare Gemini's reading with the CNN verdict.
    const MATERIALS = ["plastic", "paper", "cardboard", "metal", "glass", "organic", "vegetation", "textile", "battery"];
    const materials = Array.isArray(parsed.materials)
      ? [...new Set(parsed.materials.filter((m) => MATERIALS.includes(m)))]
      : [];
    const verdict = {
      checked: true,
      isWaste: Boolean(parsed.is_waste),
      confidence,
      peoplePresent: Boolean(parsed.people_present),
      materials: Boolean(parsed.is_waste) ? materials : [],
      reason: String(parsed.reason || "").slice(0, 300),
      ...(scene !== "none" && Boolean(parsed.is_waste) ? { scene } : {}),
      model: appConfig.geminiModel,
    };
    verdictCache.set(hash, { expires: Date.now() + CACHE_TTL_MS, verdict });
    if (verdictCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of verdictCache) if (v.expires <= now) verdictCache.delete(k);
    }
    return verdict;
  } catch (err) {
    console.warn("[Gate] waste pre-check failed (fail-open):", err.message);
    return { checked: false, skipReason: `unavailable: ${err.message}` };
  }
}
