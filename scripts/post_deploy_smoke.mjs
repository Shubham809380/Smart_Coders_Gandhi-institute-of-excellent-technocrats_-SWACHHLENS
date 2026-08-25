// Post-deployment smoke test against the LIVE Vercel deployment.
//   node scripts/post_deploy_smoke.mjs https://swachhlens-ruddy.vercel.app
//
// Verifies:
//   1. /api/health
//   2. citizen login (seeded demo account)
//   3. POST /api/detect-waste with a real waste image      -> accepted
//   4. POST /api/detect-waste with a person portrait       -> rejected/review
//   5. POST /api/detect-waste with a blurred waste image   -> quality reject
// Each check prints PASS/FAIL; exit code 1 on any failure.

import fs from "node:fs";
import path from "node:path";

const base = (process.argv[2] || "https://swachhlens-ruddy.vercel.app").replace(/\/$/, "");
const casesDir = path.resolve(process.cwd(), "adversarial");

let pass = 0, fail = 0;
function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

async function jfetch(pathname, opts = {}) {
  const res = await fetch(base + pathname, opts);
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text.slice(0, 200) }; }
}

const dataUrl = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}`;

// ---- 1. health ------------------------------------------------------------
{
  const { status, body } = await jfetch("/api/health");
  report("health", status === 200 && body?.ok === true, `status=${status} mode=${body?.mode}`);
}

// ---- 2. login --------------------------------------------------------------
let token = "";
{
  const { status, body } = await jfetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "citizen@swachhlens.app", password: "citizen123" }),
  });
  token = body?.sessionToken || "";
  report("login(citizen)", status === 200 && Boolean(token), status === 200 ? "token acquired" : JSON.stringify(body).slice(0, 120));
}
if (!token) { console.log("cannot continue without auth"); process.exit(1); }

const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// ---- 3-5. detect-waste cases ----------------------------------------------
const cases = [
  ["waste accept", path.join(casesDir, "pile_plastic_paper_07.jpg"), (r) => r.valid_waste_image === true && r.result?.confidence > 0],
  ["person reject", path.join(casesDir, "person_00.jpg"), (r) => r.valid_waste_image === false],
  ["blur quality reject", path.join(casesDir, "blur_24.jpg"), (r) => r.valid_waste_image === false],
];
for (const [name, file, judge] of cases) {
  if (!fs.existsSync(file)) { report(name, false, `missing file ${path.basename(file)}`); continue; }
  const t0 = Date.now();
  const { status, body } = await jfetch("/api/detect-waste", {
    method: "POST", headers: auth,
    body: JSON.stringify({ image: dataUrl(file), location: {} }),
  });
  const ms = Date.now() - t0;
  const ok = status === 200 && judge(body);
  const detail = status === 200
    ? (body.result ? `${body.result.wasteType}@${body.result.confidence}% review=${body.result.needsReview}` : `rejected: ${body.reason}`)
    : `HTTP ${status}`;
  report(`${name} (${ms}ms)`, ok, detail);
}

console.log(`\n${pass}/${pass + fail} smoke checks passed`);
process.exit(fail ? 1 : 0);
