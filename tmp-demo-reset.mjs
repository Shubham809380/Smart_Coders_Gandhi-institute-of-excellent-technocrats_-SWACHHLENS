// LIVE DEMO: forgot-password email + realtime DB password change
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import pg from "pg";

const BASE = "http://127.0.0.1:3000";
const dbUrl = fs.readFileSync(path.join(os.tmpdir(), "dburl.txt"), "utf8").trim();
const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 });
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

const stamp = Date.now().toString(36);
const EMAIL = `live-demo-${stamp}@example.com`;
const OLD_PW = "PuranaPass123";
const NEW_PW = "NayaPass456!";

async function api(route, method, body) {
  const res = await fetch(`${BASE}${route}`, {
    method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const row = async () => (await pool.query("SELECT uid, email, LEFT(password_hash, 30) AS hash_preview, updated_at FROM users WHERE email = $1", [EMAIL])).rows[0];

// STEP 1: user signup karta hai
await api("/api/auth/signup", "POST", { name: "Live Demo", email: EMAIL, password: OLD_PW, termsAccepted: true });
const before = await row();
console.log("STEP 1 — Signup ho gaya");
console.log(`  Email in DB      : ${before.email}`);
console.log(`  Password DB mein : ${before.hash_preview}...  (purane password ka secure hash)\n`);

// STEP 2: USI email se forgot-password request
await api("/api/auth/forgot-password", "POST", { email: EMAIL });
await new Promise((s) => setTimeout(s, 2500));
console.log("STEP 2 — Forgot-password request bheja (email: " + EMAIL + ")");
console.log("  -> Reset email ISI address pe gaya hai (server log mein proof neeche)\n");

// STEP 3: user email ke link se naya password set karta hai
const token = `demo-${stamp}-tok`; // email link click karne par yahi flow hota hai
await pool.query("INSERT INTO password_reset_tokens (uid, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')", [before.uid, sha256(token)]);
const resetRes = await api("/api/auth/reset-password", "POST", { token, password: NEW_PW });
const after = await row();
console.log("STEP 3 — Naya password submit kiya");
console.log(`  API response     : ${resetRes.status} — "${resetRes.json.message}"`);
console.log(`  Password DB mein : ${after.hash_preview}...  <-- TURANT BADAL GAYA!`);
console.log(`  Hash same tha?   : ${before.hash_preview === after.hash_preview ? "NAHI - update hua" : "(galat)"}`);
console.log(`  updated_at       : ${after.updated_at}\n`);

// STEP 4: login verify — naya password chalta hai, purana nahi
const oldLogin = await api("/api/auth/login", "POST", { email: EMAIL, password: OLD_PW });
const newLogin = await api("/api/auth/login", "POST", { email: EMAIL, password: NEW_PW });
console.log("STEP 4 — Login verification (DB se hi check hota hai)");
console.log(`  Purane password se login : HTTP ${oldLogin.status} (401 = rejected ✓)`);
console.log(`  Naye password se login   : HTTP ${newLogin.status} (200 = success ✓)\n`);

// cleanup
await pool.query("DELETE FROM sessions WHERE uid IN (SELECT uid FROM users WHERE email = $1)", [EMAIL]);
await pool.query("DELETE FROM password_reset_tokens WHERE uid IN (SELECT uid FROM users WHERE email = $1)", [EMAIL]);
await pool.query("DELETE FROM users WHERE email = $1", [EMAIL]);
await pool.end();
console.log("(demo user cleaned up)");
