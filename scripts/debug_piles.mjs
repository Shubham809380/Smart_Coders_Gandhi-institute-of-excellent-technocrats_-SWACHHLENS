import fs from "node:fs";
process.env.GEMINI_API_KEY = "";
const { classifyMultiLabel } = await import("../backend/ai/pipeline/cnnStage.js");
for (const f of ["pile_plastic_paper_10", "pile_metal_organic_11", "pile_textile_cardboard_12", "waste_metal_08"]) {
  const buf = fs.readFileSync(`adversarial/${f}.jpg`);
  const r = await classifyMultiLabel(buf);
  const top = Object.entries(r.scores).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(f, "->", top.map(([c, p]) => `${c}:${p}`).join(" "), "| present:", r.present.join("+"));
}
