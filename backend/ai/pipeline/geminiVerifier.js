// Stage-2 — Gemini Vision Verifier
// =================================
// NOT a fallback and NOT called on every request — the decision router summons
// this only for ambiguous / low-confidence / mixed / safety-critical cases.
//
// BEHAVIOUR CONTRACT (enforced by the system instruction AND by strict output
// validation below — the model is never trusted to have self-policed):
//   1. Waste-existence first: no waste => reject with reason.
//   2. Multi-label categories with per-class confidence (0-1). Never force a
//      single label onto a mixed pile.
//   3. Volume (small/medium/large/very_large) ONLY via visible scale
//      references; volume_confidence "none" when none exists — never guess.
//   4. Cross-check vs CNN: significant disagreement => requires_human_review,
//      the verifier must NOT resolve conflicts itself.
//   5. Strict JSON only. Categories limited to the fixed vocabulary.
//   6. Never invent a category not visibly supported.
//   7. Humans/animals/vehicles are background noise, never waste.

import crypto from "node:crypto";
import { appConfig } from "../../config.js";
import { pipelineConfig, WASTE_CLASSES } from "./config.js";

const G = () => pipelineConfig.gemini;

function authParams() {
  const key = appConfig.geminiApiKey;
  if (key.startsWith("AQ.")) return { keyParam: "", headers: { "x-goog-api-key": key } };
  if (key.startsWith("AIza")) return { keyParam: `?key=${encodeURIComponent(key)}`, headers: {} };
  return { keyParam: "", headers: { Authorization: `Bearer ${key}` } };
}

function dataUrlToPart(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image payload.");
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

function parseStrictJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  throw new Error("Gemini verifier returned non-JSON output.");
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * @param {{image:string}} payload           data URL
 * @param {{topClass:string,topProb:number,present:string[]}} cnnSummary
 * @returns {{
 *   called:true, contains_waste:boolean, reject_reason?:string|null,
 *   categories:{category:string,confidence:number}[],
 *   scene:"none"|"drain_blockage"|"overflowing_bin"|"construction_debris",
 *   volume:{"small"|"medium"|"large"|"very_large"|null},
 *   volume_confidence:"high"|"medium"|"low"|"none",
 *   scale_reference:string|null,
 *   requires_human_review:boolean, review_reason?:string|null,
 *   notes?:string|null
 * } | null}  null => verifier unavailable (caller proceeds WITHOUT it)
 */
export async function geminiVerify(payload, cnnSummary) {
  if (!G().apiKeyPresent) return null;

  const cnnLine = cnnSummary
    ? `The fast CNN model read this image as: dominant="${cnnSummary.topClass}" (p=${cnnSummary.topProb}), also-possible=[${(cnnSummary.present || []).join(", ") || "none"}]. Use it as a hint only — your own eyes decide.`
    : "";

  const parts = [
    { text: "Image to verify:" },
    dataUrlToPart(payload.image),
    {
      text: `${cnnLine}
You are the verification stage of a municipal waste-reporting pipeline. Follow these rules EXACTLY:

1. FIRST decide if the image contains actual waste/garbage/litter/debris needing cleanup. If not, set contains_waste=false with a short honest reject_reason, and leave categories empty.
2. If waste IS present: list EVERY waste material you can see as separate entries in "categories" with per-class confidence in [0,1]. A mixed pile (e.g. plastic + paper + cloth together) MUST yield multiple category entries — never collapse it to one label. Allowed categories ONLY: ${WASTE_CLASSES.join(", ")}. Never invent a category that is not visibly supported.
3. People, animals and vehicles are BACKGROUND NOISE — never list them or any body part as a category, and their presence alone never makes an image invalid when real trash is also visible.
4. Estimate physical volume as one of "small"|"medium"|"large"|"very_large" using a VISIBLE scale reference (hand, bottle, dustbin, person, road lane marking...). Name it in scale_reference. If there is genuinely NO scale reference, set volume=null and volume_confidence="none" — NEVER guess size without a reference.
5. Compare your reading with the CNN hint above. If they disagree significantly (different dominant material, or CNN lists materials you cannot see, or you see clear materials the CNN missed), set requires_human_review=true with review_reason. Do NOT try to resolve the disagreement yourself — flag it for humans.
6. Set "scene" to drain_blockage | overflowing_bin | construction_debris | none.

Output STRICT JSON only, no markdown, no extra text:
{"contains_waste":true/false,"reject_reason":null,"categories":[{"category":"plastic","confidence":0.0}],"scene":"none","volume":"medium","volume_confidence":"high","scale_reference":"standard water bottle","requires_human_review":false,"review_reason":null}`,
    },
  ];

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), G().timeoutMs);
  try {
    const { keyParam, headers } = authParams();
    const response = await fetch(`${G().baseUrl}/${G().model}:generateContent${keyParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: G().temperature,
          maxOutputTokens: G().maxOutputTokens,
          responseMimeType: "application/json",
          seed: 42,
          ...((G().model.startsWith("gemini-2.5") || G().model.startsWith("gemini-3"))
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought).map((p) => p.text).filter(Boolean).join("") || "";
    if (!text) throw new Error("Empty verifier response.");

    // ---- Strict validation: clamp, whitelist, drop anything illegal ------
    const p = parseStrictJson(text);
    const allowedVolumes = ["small", "medium", "large", "very_large"];
    const allowedScenes = ["drain_blockage", "overflowing_bin", "construction_debris"];
    const rawCats = Array.isArray(p.categories) ? p.categories : [];
    const seen = new Set();
    const categories = rawCats
      .map((c) => ({
        category: String(c?.category || "").toLowerCase().trim(),
        confidence: clamp01(c?.confidence),
      }))
      .filter((c) => WASTE_CLASSES.includes(c.category) && !seen.has(c.category) && seen.add(c.category))
      .sort((a, b) => b.confidence - a.confidence);

    const containsWaste = Boolean(p.contains_waste) && (categories.length > 0 || Boolean(p.reject_reason));
    const volConf = ["high", "medium", "low", "none"].includes(p.volume_confidence) ? p.volume_confidence : "none";

    return {
      called: true,
      containsWaste,
      rejectReason: p.reject_reason ? String(p.reject_reason).slice(0, 300) : null,
      categories: containsWaste ? categories : [],
      scene: allowedScenes.includes(p.scene) ? p.scene : "none",
      volume: allowedVolumes.includes(p.volume) && volConf !== "none" ? p.volume : null,
      volumeConfidence: volConf,
      scaleReference: p.scale_reference ? String(p.scale_reference).slice(0, 120) : null,
      requiresHumanReview: Boolean(p.requires_human_review),
      reviewReason: p.review_reason ? String(p.review_reason).slice(0, 300) : null,
      latencyMs: Date.now() - started,
      model: G().model,
    };
  } finally {
    clearTimeout(timer);
  }
}
