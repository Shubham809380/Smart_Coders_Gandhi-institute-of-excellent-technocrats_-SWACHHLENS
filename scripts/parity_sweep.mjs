// Decision-level parity sweep: Node ONNX vs saved torch results.
import fs from "node:fs";
import { classifyBuffer } from "../backend/ai/onnxProvider.js";

const torch = JSON.parse(fs.readFileSync("C:/Users/VICTUS/AppData/Local/Temp/opencode/torch_parity.json", "utf8"));
let agree = 0;
for (const t of torch) {
  if (!fs.existsSync(t.path)) { console.log(`SKIP ${t.label}`); continue; }
  const n = await classifyBuffer(fs.readFileSync(t.path));
  const same = Boolean(n.is_waste) === Boolean(t.is_waste) && n.category === t.category;
  const confDelta = Math.abs((n.confidence || 0) - (t.conf || 0));
  if (same) agree++;
  console.log(
    `${t.label.padEnd(12)} torch=${String(t.category).padEnd(10)}@${String(t.conf).padEnd(6)} ` +
    `node=${String(n.category).padEnd(10)}@${String(n.confidence).padEnd(6)} ` +
    `Δconf=${confDelta.toFixed(1)} ${same ? "OK" : "** MISMATCH **"}`,
  );
}
console.log(`\n${agree}/${torch.length} decisions match`);
