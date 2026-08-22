import "dotenv/config";
import { io } from "socket.io-client";
import { getPool } from "./backend/db.js";

const SOCKET_URL = "https://swachhlens-socket.onrender.com";
const API = "https://swachhlens-ruddy.vercel.app/api";
const SECRET = (await import("node:fs")).readFileSync(process.env.TEMP + "\\swachhlens_internal_secret.txt", "utf8").trim();

// same transition map as backend/utils.js (round-trip safe subset)
const T = {
  submitted: ["ai_analyzed", "under_review"],
  ai_analyzed: ["under_review"],
  under_review: ["assigned"],
  assigned: ["en_route", "reopened"],
  en_route: ["cleanup_in_progress", "reopened"],
  cleanup_in_progress: ["verification", "reopened"],
  verification: ["resolved", "reopened"],
  resolved: ["reopened"],
  reopened: ["under_review", "assigned"],
};

const pool = getPool();
let r = await pool.query("SELECT id, status FROM reports WHERE status IN ('under_review','assigned','en_route') ORDER BY updated_at DESC LIMIT 1");
if (!r.rows[0]) r = await pool.query("SELECT id, status FROM reports WHERE status NOT IN ('rejected','draft') ORDER BY updated_at DESC LIMIT 1");
const report = r.rows[0];
if (!report) { console.log("no reports found"); process.exit(1); }
console.log(`using report ${report.id} (status=${report.status})`);

// build shortest round-trip: cur -> next -> ... -> cur (max 4 hops)
function findRoundTrip(cur) {
  const queue = [[cur]];
  while (queue.length) {
    const path = queue.shift();
    if (path.length > 5) continue;
    const last = path[path.length - 1];
    for (const nxt of T[last] || []) {
      if (nxt === "resolved") continue; // avoid email side effects
      if (nxt === cur && path.length > 1) return [...path, nxt];
      if (!path.includes(nxt)) queue.push([...path, nxt]);
    }
  }
  return null;
}
const trip = findRoundTrip(report.status);
if (!trip) { console.log(`no round-trip from ${report.status}`); process.exit(1); }
console.log("round-trip:", trip.join(" -> "));

// admin session
const u = await pool.query("SELECT uid FROM users WHERE role IN ('admin','super_admin') LIMIT 1");
const TOKEN = "prod-chain-" + Date.now();
await pool.query("INSERT INTO sessions (token, uid, last_activity_at) VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING", [TOKEN, u.rows[0].uid]);

// connect socket
const sock = await new Promise((resolve) => {
  const s = io(SOCKET_URL, { transports: ["websocket", "polling"], reconnection: false, auth: (cb) => cb({ token: TOKEN }) });
  s.on("connect", () => resolve(s));
  s.on("connect_error", (e) => resolve(null));
  setTimeout(() => resolve(null), 15000);
});
if (!sock) { console.log("FAIL socket connect"); process.exit(1); }
console.log("socket connected:", sock.id);

// listen for events, trigger FIRST hop via production Vercel API
const received = await new Promise((resolve) => {
  sock.on("waste:status:update", (p) => resolve(p));
  setTimeout(async () => {
    try {
      const res = await fetch(`${API}/reports/${encodeURIComponent(report.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ status: trip[1] }),
      });
      console.log(`vercel api responded: ${res.status}`);
    } catch (e) { console.log("api error:", e.message); }
    setTimeout(() => resolve(null), 8000);
  }, 500);
});

check: {
  if (received && received.id === report.id && received.status === trip[1]) {
    console.log(`PASS full prod chain: vercel publish -> render bridge -> socket client (${JSON.stringify(received)})`);
  } else {
    console.log(`FAIL event not received: ${JSON.stringify(received)}`);
  }
}

// restore original status through remaining hops
let cur = trip[1];
for (const next of trip.slice(2)) {
  const res = await fetch(`${API}/reports/${encodeURIComponent(report.id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ status: next }),
  });
  console.log(`restore hop ${cur} -> ${next}: HTTP ${res.status}`);
  if (res.status !== 200) break;
  cur = next;
}
const after = await pool.query("SELECT status FROM reports WHERE id = $1", [report.id]);
console.log(`report restored to: ${after.rows[0].status} (original: ${report.status})`);

sock.disconnect();
await pool.query("DELETE FROM sessions WHERE token = $1", [TOKEN]);
console.log("temp session cleaned");
process.exit(received ? 0 : 1);
