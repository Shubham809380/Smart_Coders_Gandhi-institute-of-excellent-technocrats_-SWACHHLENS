// Adversarial evaluation runner — drives REAL images through the ACTUAL
// hybrid pipeline (Stage-0 -> ONNX -> router -> [Gemini] -> fusion) and scores
// outcomes against the expectations in adversarial/cases.json.
//
//   node scripts/adversarial_eval.mjs [--cases ../adversarial] [--online]
//
// --online enables live Gemini verification for verify-path cases (costs a few
// calls); default runs CNN-only so it is free and deterministic.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const online = args.includes("--online");
// --skip-quality disables Stage-0 so person/OOD cases actually REACH the CNN
// and router. Without it, low-texture portraits get rejected by the blur gate
// and the trained non_waste head is never exercised (a dishonest pass).
const skipQuality = args.includes("--skip-quality");
if (skipQuality) {
  process.env.QG_MIN_LAPLACIAN_VAR = "0";
  process.env.QG_MIN_LUMA = "1";
}

const repoRoot = process.cwd();
const casesDir = path.resolve(repoRoot, getArg("--cases", "adversarial"));
let cases = JSON.parse(fs.readFileSync(path.join(casesDir, "cases.json"), "utf8"));
if (skipQuality) {
  cases = cases.filter((c) => !c.type.startsWith("quality_"));
}

// minimal .env loader so the pipeline can reach Gemini when --online is set
if (!process.env.GEMINI_API_KEY) {
  try {
    for (const line of fs.readFileSync(path.join(repoRoot, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m && !line.trim().startsWith("#")) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* .env optional */ }
}
if (!online && !process.env.SWACHH_TEST_OFFLINE) {
  // force the offline path deterministically when not explicitly online
  delete process.env.GEMINI_API_KEY;
}

const { detectWaste } = await import("../backend/ai/pipeline/index.js");

function judge(expected, r) {
  switch (expected) {
    case "reject_any":     return r.accepted === false;
    case "reject_quality": return r.accepted === false && r.rejected?.stage === "quality";
    case "accept_waste":   return Boolean(r.accepted && (r.categories?.length ?? 0) >= 1);
    case "mixed_detected": return Boolean(r.accepted && r.mixed_waste === true &&
                                          (r.categories?.length ?? 0) >= 2);
    case "waste_survives": return Boolean(r.accepted &&
                                          r.categories?.some((c) => c.class !== "non_waste"));
    default:               return false;
  }
}

const rows = [];
for (const c of cases) {
  const buf = fs.readFileSync(path.join(casesDir, c.file));
  let r;
  try {
    r = await detectWaste({ imageBuffer: buf });
  } catch (err) {
    r = { accepted: false, rejected: { stage: "crash", reason: err.message }, categories: [] };
  }
  const pass = judge(c.expected, r);
  rows.push({
    id: c.id,
    type: c.type,
    expected: c.expected,
    outcome: r.accepted
      ? `accept(${(r.categories || []).map((x) => x.class).join("+")})` +
        `${r.mixed_waste ? " MIXED" : ""}${r.requires_human_review ? " REVIEW" : ""}${r.provisional ? " PROVISIONAL" : ""}`
      : `reject[${r.rejected?.stage}] ${r.rejected?.reason || ""}`.slice(0, 70),
    pass,
    review: Boolean(r.requires_human_review),
    nonWaste: r.model_trace?.nonWasteScore ?? null,
  });
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.id.padEnd(14)} ${c.expected.padEnd(15)} ${rows.at(-1).outcome}`);
}

const byType = {};
for (const row of rows) {
  byType[row.type] ??= { total: 0, passed: 0 };
  byType[row.type].total++;
  byType[row.type].passed += row.pass;
}
console.log("\n=== SUMMARY ===");
for (const [t, s] of Object.entries(byType)) console.log(`${t.padEnd(20)} ${s.passed}/${s.total}`);
const totalPass = rows.filter((r) => r.pass).length;
console.log(`TOTAL ${totalPass}/${rows.length} (${Math.round((100 * totalPass) / rows.length)}%)`);

fs.writeFileSync(path.join(casesDir, skipQuality ? "results_skipq.json" : "results.json"),
                 JSON.stringify({ mode: online ? "online" : "offline",
                                  skipQuality, rows, byType,
                                  totalPass, total: rows.length }, null, 1));
if (!online && totalPass < rows.length) {
  console.log("\n(note) offline mode: person/ood rejections rely on the trained");
  console.log("non_waste head only. Run with --online to exercise Gemini veto paths.");
}
