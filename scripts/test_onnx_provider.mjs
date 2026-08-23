// Quick local harness: run the ONNX provider against dataset images.
import fs from "node:fs";
import path from "node:path";
import { OnnxAIProvider } from "../backend/ai/onnxProvider.js";

const manifest = JSON.parse(fs.readFileSync("swachhlens-ai/training/manifest.json", "utf8"));
const testRecs = manifest.records.filter((r) => r.split === "test");

const seen = new Set();
const picked = [];
for (const r of testRecs) {
  if (!seen.has(r.label)) {
    seen.add(r.label);
    picked.push(r);
  }
  if (picked.length >= Number(process.argv[2] || 4)) break;
}

const provider = new OnnxAIProvider();
for (const rec of picked) {
  const imgPath = path.resolve(rec.path);
  if (!fs.existsSync(imgPath)) {
    console.log(`SKIP ${rec.label} (${imgPath} missing)`);
    continue;
  }
  const b64 = fs.readFileSync(imgPath).toString("base64");
  const ext = path.extname(imgPath).slice(1) || "jpeg";
  const dataUrl = `data:image/${ext};base64,${b64}`;
  try {
    const t0 = Date.now();
    const res = await provider.analyzeWaste({ image: dataUrl });
    console.log(JSON.stringify({
      label: rec.label,
      ms: Date.now() - t0,
      wasteType: res.wasteType,
      category: res.category,
      confidence: res.confidence,
      estimatedVolume: res.estimatedVolume,
      volumeScore: res.volumeScore,
      severity: res.severity,
      dispatchTeam: res.dispatch?.team,
      detectionSummary: res.detectionSummary,
      processingTime: res.processingTime,
    }));
  } catch (err) {
    console.log(`${rec.label}: REJECTED - ${err.message}`);
  }
}
