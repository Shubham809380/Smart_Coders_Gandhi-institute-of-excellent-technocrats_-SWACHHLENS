import sharp from "sharp";
import { routeDecision } from "./backend/ai/pipeline/decisionRouter.js";
import { fuseResults } from "./backend/ai/pipeline/fusion.js";
import { detectWaste } from "./backend/ai/pipeline/index.js";
import fs from "node:fs";

const mkCnn = (over = {}) => ({
  mode: "legacy_proxy", temperature: 0.85,
  scores: { plastic: 0.9, non_waste: 0.05 },
  present: ["plastic"], topClass: "plastic", topProb: 0.9,
  secondClass: "paper", secondProb: 0.2, margin: 0.7, nonWasteScore: 0.05,
  softmaxTop: 0.9, softmaxMargin: 0.7, ...over,
});

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL:", name); } };

check("fast-path", routeDecision({ ok: true }, mkCnn()).action === "accept_cnn");
check("person-reject", routeDecision({ ok: true }, mkCnn({ scores: { plastic: 0.3, non_waste: 0.75 }, nonWasteScore: 0.75, topProb: 0.3, softmaxTop: 0.2 })).action === "reject");
check("mixed-verify", routeDecision({ ok: true }, mkCnn({ present: ["plastic", "paper"], scores: { plastic: 0.6, paper: 0.55 } })).action === "verify_gemini");
check("quality-reject", routeDecision({ ok: false }, mkCnn()).action === "reject");
check("safety-verify", routeDecision({ ok: true }, mkCnn({ topClass: "battery", present: ["battery"], scores: { battery: 0.95, non_waste: 0 } })).action === "verify_gemini");

let f = fuseResults(mkCnn(), null, { action: "accept_cnn", reason: "" });
check("gemini-offline-fastpath-no-review", f.requires_human_review === false);
f = fuseResults(mkCnn({ softmaxTop: 0.6, softmaxMargin: 0.2, topProb: 0.6 }), null, { action: "verify_gemini", reason: "" });
check("gemini-offline-ambiguous-review", f.requires_human_review === true);
f = fuseResults(mkCnn(), { called: true, containsWaste: false, rejectReason: "portrait", categories: [] }, {});
check("existence-veto", f.accepted === false);
f = fuseResults(mkCnn(), { called: true, containsWaste: true, categories: [{ category: "metal", confidence: 0.85 }], scene: "none", volume: null, volumeConfidence: "none", requiresHumanReview: false }, { action: "verify_gemini", reason: "" });
check("disagreement-review", f.requires_human_review && f.provisional);
check("provisional-label-present", Boolean(f.waste_type));
f = fuseResults(mkCnn(), { called: true, containsWaste: true, categories: [{ category: "plastic", confidence: 0.88 }], scene: "drain_blockage", volume: "large", volumeConfidence: "high", scaleReference: "bin", requiresHumanReview: false }, { action: "verify_gemini", reason: "" });
check("safety-scene-review", f.requires_human_review);
check("volume-from-gemini", f.volume.category === "large" && f.volume.confidence === "high");

const src = fs.readdirSync("garbage_classification/plastic").filter((x) => /\.(jpg|jpeg|png|webp)$/i.test(x))[0];
const buf = await sharp("garbage_classification/plastic/" + src).jpeg().toBuffer();
const q1 = await detectWaste({ imageBuffer: await sharp(buf).blur(8).jpeg().toBuffer() });
check("e2e-blur-reject", !q1.accepted && q1.rejected.stage === "quality");
const q2 = await detectWaste({ imageBuffer: buf });
check("e2e-clean-accept", q2.accepted && q2.categories.length >= 1);

console.log(`RESULT: ${pass}/${pass + fail} passed`);
