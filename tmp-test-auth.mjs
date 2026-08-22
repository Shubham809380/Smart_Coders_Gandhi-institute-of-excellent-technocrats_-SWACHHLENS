// Temporary auth test suite — run against local server on :3001, then delete.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import pg from "pg";

const BASE = "http://127.0.0.1:3000";
const dbUrl = fs.readFileSync(path.join(os.tmpdir(), "dburl.txt"), "utf8").trim();
const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const stamp = Date.now().toString(36);
const EMAIL = `qa-reset-${stamp}@example.com`;
const PASSWORD = "OldPass123!";
const NEW_PASSWORD = "NewSecure456!";

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`); }
}

async function api(route, method, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* html/empty */ }
  return { status: res.status, json };
}

console.log(`Test user email: ${EMAIL}\n`);

// ---------- SIGNUP VALIDATION ----------
console.log("[signup validation]");
let r = await api("/api/auth/signup", "POST", { name: "", email: "", password: "" });
check("missing fields -> 400 VALIDATION", r.status === 400 && r.json?.error?.code === "VALIDATION", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Bot", email: "not-an-email", password: PASSWORD, termsAccepted: true });
check("invalid email format -> 400 VALIDATION", r.status === 400 && r.json?.error?.code === "VALIDATION", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Bot", email: EMAIL, password: "123", termsAccepted: true });
check("weak password -> 400 WEAK_PASSWORD", r.status === 400 && r.json?.error?.code === "WEAK_PASSWORD", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Bot", email: EMAIL, password: PASSWORD });
check("terms missing -> 400 TERMS_REQUIRED", r.status === 400 && r.json?.error?.code === "TERMS_REQUIRED", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Bot", email: EMAIL, password: PASSWORD, termsAccepted: false });
check("terms false -> 400 TERMS_REQUIRED", r.status === 400 && r.json?.error?.code === "TERMS_REQUIRED", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Admin Try", email: `qa-admin-${stamp}@example.com`, password: PASSWORD, role: "admin", termsAccepted: true });
check("role=admin request downgraded -> citizen", r.status === 201 && r.json?.currentUser?.role === "citizen", JSON.stringify(r.json));

r = await api("/api/auth/signup", "POST", { name: "QA Bot", email: EMAIL, password: PASSWORD, termsAccepted: true });
check("valid signup -> 201 authenticated", r.status === 201 && r.json?.isAuthenticated === true && r.json?.sessionToken, JSON.stringify(r.json));
const uid = r.json?.currentUser?.uid;

const dbUser = await pool.query("SELECT terms_accepted, terms_accepted_at, role FROM users WHERE uid = $1", [uid]);
check("DB terms_accepted=true + timestamp", dbUser.rows[0]?.terms_accepted === true && !!dbUser.rows[0]?.terms_accepted_at, JSON.stringify(dbUser.rows[0]));

r = await api("/api/auth/signup", "POST", { name: "QA Dup", email: EMAIL, password: PASSWORD, termsAccepted: true });
check("duplicate email -> 409 ACCOUNT_EXISTS", r.status === 409 && r.json?.error?.code === "ACCOUNT_EXISTS", JSON.stringify(r.json));

// ---------- FORGOT PASSWORD ----------
console.log("\n[forgot-password]");
r = await api("/api/auth/forgot-password", "POST", { email: `nobody-${stamp}@example.com` });
check("unknown email -> generic 200", r.status === 200 && r.json?.message === "If an account exists with this email, a password reset link has been sent.", JSON.stringify(r.json));

r = await api("/api/auth/forgot-password", "POST", { email: EMAIL.toUpperCase() });
check("known email (mixed case) -> generic 200", r.status === 200 && !!r.json?.message, JSON.stringify(r.json));

await new Promise((s) => setTimeout(s, 500));
const tokenRows = await pool.query("SELECT token_hash FROM password_reset_tokens WHERE uid = $1", [uid]);
check("hashed token row stored in DB", tokenRows.rowCount === 1, `rows=${tokenRows.rowCount}`);
const storedHash = tokenRows.rows[0]?.token_hash;
check("stored value is sha256 hash (64 hex chars), not plaintext URL token", /^[a-f0-9]{64}$/.test(storedHash || ""), storedHash);

// Rate limit: 2 more OK (email count 3), then 4th same-email attempt -> 429
r = await api("/api/auth/forgot-password", "POST", { email: EMAIL });
check("forgot #2 -> 200", r.status === 200, JSON.stringify(r.json));
r = await api("/api/auth/forgot-password", "POST", { email: EMAIL });
check("forgot #3 -> 200", r.status === 200, JSON.stringify(r.json));
r = await api("/api/auth/forgot-password", "POST", { email: EMAIL });
check("forgot #4 same email within hour -> 429 RATE_LIMITED", r.status === 429 && r.json?.error?.code === "RATE_LIMITED", JSON.stringify(r.json));

// ---------- RESET PASSWORD ----------
console.log("\n[reset-password]");
r = await api("/api/auth/reset-password", "POST", { token: "garbage-token-xyz", password: NEW_PASSWORD });
check("unknown token -> 400 INVALID_TOKEN", r.status === 400 && r.json?.error?.code === "INVALID_TOKEN", JSON.stringify(r.json));
r = await api("/api/auth/reset-password", "POST", { token: "", password: NEW_PASSWORD });
check("empty token -> 400 VALIDATION", r.status === 400 && r.json?.error?.code === "VALIDATION", JSON.stringify(r.json));
r = await api("/api/auth/reset-password", "POST", { token: "whatever", password: "abc" });
check("weak new password -> 400 WEAK_PASSWORD (before consume)", r.status === 400 && r.json?.error?.code === "WEAK_PASSWORD", JSON.stringify(r.json));

// Expired token: inject row with past expiry
const expiredToken = `expired-${stamp}-tok`;
await pool.query(
  "INSERT INTO password_reset_tokens (uid, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')",
  [uid, sha256(expiredToken)]
);
r = await api("/api/auth/reset-password", "POST", { token: expiredToken, password: NEW_PASSWORD });
check("expired token -> 400 INVALID_TOKEN", r.status === 400 && r.json?.error?.code === "INVALID_TOKEN", JSON.stringify(r.json));

// Valid token lifecycle (injected AFTER all forgot calls since createPasswordReset clears prior rows)
const validToken = `valid-${stamp}-tok`;
await pool.query(
  "INSERT INTO password_reset_tokens (uid, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')",
  [uid, sha256(validToken)]
);

r = await api("/api/auth/reset-password", "POST", { token: validToken, password: NEW_PASSWORD });
check("valid token -> 200 success message", r.status === 200 && /reset successfully/i.test(r.json?.message || ""), JSON.stringify(r.json));

r = await api("/api/auth/login", "POST", { email: EMAIL, password: PASSWORD });
check("old password rejected after reset -> 401", r.status === 401 && r.json?.error?.code === "INVALID_CREDENTIAL", JSON.stringify(r.json));

r = await api("/api/auth/login", "POST", { email: EMAIL, password: NEW_PASSWORD });
check("new password accepted -> 200", r.status === 200 && r.json?.isAuthenticated === true, JSON.stringify(r.json));

r = await api("/api/auth/reset-password", "POST", { token: validToken, password: "Another789!" });
check("token reuse blocked -> 400 INVALID_TOKEN", r.status === 400 && r.json?.error?.code === "INVALID_TOKEN", JSON.stringify(r.json));

const leftovers = await pool.query("SELECT * FROM password_reset_tokens WHERE uid = $1", [uid]);
check("all reset rows purged for user after success", leftovers.rowCount === 0, `rows=${leftovers.rowCount}`);

// ---------- CLEANUP ----------
await pool.query("DELETE FROM users WHERE uid IN ($1, (SELECT uid FROM users WHERE email = $2))", [uid, `qa-admin-${stamp}@example.com`]).catch(() => {});
await pool.query("DELETE FROM sessions WHERE uid = ANY($1::text[])", [[uid]]).catch(() => {});
await pool.end();

console.log(`\n========== RESULTS: ${passed} passed, ${failed} failed ==========`);
process.exit(failed > 0 ? 1 : 0);
