import { io } from "socket.io-client";
import { getPool } from "./backend/db.js";

const URL = "http://localhost:3001";
const SECRET = "dev-secret-123";
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`PASS ${name} ${extra}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
}

async function http(method, path, body, headers = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function connectOnce(opts) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ["websocket"], reconnection: false, timeout: 5000, ...opts });
    const done = (result) => { try { s.disconnect(); } catch {} resolve(result); };
    s.on("connect", () => done({ connected: true, id: s.id }));
    s.on("connect_error", (err) => done({ connected: false, error: String(err?.message || err) }));
    setTimeout(() => done({ connected: false, error: "timeout" }), 6000);
  });
}

// --- 1. Health --------------------------------------------------------------
const health = await http("GET", "/health");
check("health returns 200 + status ok", health.status === 200 && health.json?.status === "ok", JSON.stringify(health.json));

// --- 2. No token -> rejected -------------------------------------------------
const noAuth = await connectOnce({});
check("unauthenticated socket rejected", !noAuth.connected && /authentication required/i.test(noAuth.error), noAuth.error);

// --- 3. Garbage token -> rejected ---------------------------------------------
const badAuth = await connectOnce({ auth: { token: "not-a-real-token" } });
check("invalid session rejected", !badAuth.connected && /invalid|expired/i.test(badAuth.error), badAuth.error);

// --- 4. Forbidden origin -> blocked at handshake ------------------------------
const evilOrigin = await new Promise((resolve) => {
  const s = io(URL, { transports: ["websocket"], reconnection: false, timeout: 5000, extraHeaders: { Origin: "http://evil.example.com" }, auth: { token: "x" } });
  s.on("connect", () => resolve({ blocked: false }));
  s.on("connect_error", (e) => resolve({ blocked: true, msg: String(e?.message || e) }));
  setTimeout(() => resolve({ blocked: true, msg: "timeout/blocked" }), 6000);
});
check("disallowed origin blocked", evilOrigin.blocked, evilOrigin.msg || "");

// --- 5. Valid session -> connected --------------------------------------------
let uid = null;
try {
  const pool = getPool();
  const r = await pool.query("SELECT uid FROM users ORDER BY created_at LIMIT 1");
  uid = r.rows[0]?.uid || null;
} catch (err) {
  console.log("WARN db unreachable, skipping authenticated flow:", err?.message);
}
let validClient = null;
if (uid) {
  const pool = getPool();
  const TOKEN = "itest-" + Date.now();
  await pool.query(
    "INSERT INTO sessions (token, uid, last_activity_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
    [TOKEN, uid]
  );
  const good = await connectOnce({ auth: { token: TOKEN } });
  check("authenticated socket accepted", good.connected, `uid=${uid} id=${good.id || ""}`);

  if (good.connected) {
    // --- 6. Internal emit bridge: wrong secret -> 401 -------------------------
    const badEmit = await http("POST", "/internal/emit", { event: "waste:new", payload: { x: 1 } }, { "x-internal-secret": "wrong" });
    check("internal emit rejects bad secret", badEmit.status === 401, `status=${badEmit.status}`);

    // --- 7. Internal emit bridge: invalid event name -> 400 -------------------
    const badEvent = await http("POST", "/internal/emit", { event: "../etc/passwd" }, { "x-internal-secret": SECRET });
    check("internal emit validates event name", badEvent.status === 400, `status=${badEvent.status}`);

    // --- 8. Valid internal emit -> client receives broadcast ------------------
    const received = await new Promise((resolve) => {
      const s = io(URL, { transports: ["websocket"], reconnection: false, auth: { token: TOKEN } });
      s.on("connect", async () => {
        s.on("waste:new", (payload) => resolve({ got: true, payload }));
        await new Promise((r) => setTimeout(r, 300));
        const res = await http("POST", "/internal/emit", { event: "waste:new", payload: { id: "TEST-1", wardId: "ward-test" } }, { "x-internal-secret": SECRET });
        check("internal emit accepted", res.status === 200, JSON.stringify(res.json));
      });
      setTimeout(() => resolve({ got: false }), 6000);
      globalThis.__cleanupSock = s;
      validClient = TOKEN;
    });
    check("client receives bridged broadcast event", received.got, JSON.stringify(received.payload || {}));
    try { globalThis.__cleanupSock.disconnect(); } catch {}

    await pool.query("DELETE FROM sessions WHERE token = $1", [TOKEN]);
    console.log("cleaned up temp session");
  }
} else if (!fail) {
  console.log("SKIP authenticated flow (no DB)");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
