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
          // gemini-2.5+ are "thinking" models; disable thinking so the verdict
          // comes back fast and inside our tight latency budget.
          ...(appConfig.geminiModel.startsWith("gemini-2.5") || appConfig.geminiModel.startsWith("gemini-3")
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 160)}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text).filter(Boolean).join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
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
      text: 'Look at this image carefully. Does it show waste, garbage, litter, illegal dumping, an overflowing bin, construction debris, or any form of trash/rubbish that would need civic cleanup? A photo counts as valid even if the waste is only partially visible or far away, as long as some trash is genuinely present. People, pets, food photos, clean streets, landscapes, buildings, vehicles without trash are NOT valid. Answer strictly in this JSON format only, no extra text: {"is_waste": true/false, "reason": "one short sentence explaining what you actually see in the image", "confidence": "high/medium/low"}',
    },
  ];

  try {
    const text = await callGemini(parts);
    const parsed = parseJsonLoose(text);
    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
    const verdict = {
      checked: true,
      isWaste: Boolean(parsed.is_waste),
      confidence,
      reason: String(parsed.reason || "").slice(0, 300),
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
