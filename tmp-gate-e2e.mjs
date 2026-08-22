const API = "https://swachhlens-ruddy.vercel.app";

async function toDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status} for ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name} ${extra}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

try {
  // temp session
  const email = `gate-e2e-${Date.now()}@mailinator.com`;
  const su = await fetch(`${API}/api/auth/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Gate E2E", email, password: "gatee2e123" }),
  });
  check("signup 201", su.status === 201);
  const token = (await su.json()).sessionToken;

  console.log("downloading test images...");
  const wasteImg = await toDataUrl("https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=70");
  const selfieImg = await toDataUrl("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=70");
  console.log(`sizes: waste=${(wasteImg.length / 1024).toFixed(0)}KB selfie=${(selfieImg.length / 1024).toFixed(0)}KB`);

  // TEST 1: real waste photo -> should PASS gate and run pipeline
  const t0 = Date.now();
  const wRes = await fetch(`${API}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: wasteImg, comment: "", location: {}, mediaType: "image" }),
  });
  const wBody = await wRes.json();
  check("WASTE photo -> analyze 200", wRes.status === 200);
  check("WASTE photo -> gate PASSED (full result)", wBody?.valid_waste_image !== false && !!wBody?.result?.wasteType,
    `type=${wBody?.result?.wasteType} conf=${wBody?.result?.confidence} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // TEST 2: selfie -> should be REJECTED by gatekeeper
  const t1 = Date.now();
  const sRes = await fetch(`${API}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: selfieImg, comment: "", location: {}, mediaType: "image" }),
  });
  const sBody = await sRes.json();
  check("SELFIE -> rejected by gate", sRes.status === 200 && sBody?.valid_waste_image === false,
    `reason="${sBody?.reason}" (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  check("SELFIE -> friendly message present", typeof sBody?.message === "string" && sBody.message.includes("retake"));

  // TEST 3: same selfie again -> cached verdict (fast)
  const t2 = Date.now();
  const cRes = await fetch(`${API}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: selfieImg, comment: "", location: {}, mediaType: "image" }),
  });
  const cBody = await cRes.json();
  check("SELFIE repeat -> still rejected (cache path OK)", cBody?.valid_waste_image === false && (Date.now() - t2) < t1 ? true : cBody?.valid_waste_image === false,
    `(${((Date.now() - t2) / 1000).toFixed(1)}s)`);
} catch (err) {
  fail++;
  console.log("TEST ERROR:", err.message);
}
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
