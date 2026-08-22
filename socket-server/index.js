import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getPool } from "../backend/db.js";
import { store } from "../backend/store.js";

// Resilience: log transient errors, never crash the realtime service.
process.on("unhandledRejection", (reason) => {
  console.error("[socket-server] unhandled rejection (kept alive):", reason?.code || reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[socket-server] uncaught exception (kept alive):", err?.code || err?.message || err);
});

// --- CORS configuration ----------------------------------------------------
// FRONTEND_URL may contain a single origin or a comma-separated list
// (e.g. production + preview deployments). No wildcard when credentials are used.
function parseAllowedOrigins() {
  return String(process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();
if (!allowedOrigins.length) {
  console.warn("[socket-server] FRONTEND_URL is not set — browser origins will be rejected.");
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser clients (curl, health checks, server-to-server)
  const normalized = origin.trim().replace(/\/+$/, "");
  return allowedOrigins.includes(normalized);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn("[socket-server] CORS blocked origin:", origin || "(none)");
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  credentials: true,
};

// --- HTTP + Socket.IO setup -------------------------------------------------
const app = express();
const httpServer = createServer(app);

app.disable("x-powered-by");

// Express-side CORS (mirrors corsOptions). Rejects disallowed browser origins.
app.use((req, res, next) => {
  const origin = req.get("origin") || "";
  if (origin) {
    if (!isAllowedOrigin(origin)) {
      console.warn("[socket-server] CORS blocked origin:", origin);
      return res.status(403).json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin not allowed." } });
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: "16kb" }));

const io = new Server(httpServer, {
  cors: corsOptions,
  pingInterval: 25000,
  pingTimeout: 20000,
});

// --- Health check (must stay dependency-free and return 200 fast) ----------
let healthy = true;

app.get("/", (req, res) => {
  res.status(200).json({
    service: "socket-server",
    app: "SwachhLens",
    status: healthy ? "ok" : "degraded",
    connectedClients: io.engine.clientsCount ?? 0,
    endpoints: { health: "/health", socket: "/socket.io/" },
    note: "This is the realtime (Socket.IO) service. Browsers connect via WebSocket — nothing to display here.",
  });
});

app.get("/health", (req, res) => {
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "socket-server",
    connectedClients: io.engine.clientsCount ?? 0,
    uptimeSec: Math.round(process.uptime()),
  });
});

// --- Internal bridge endpoint -----------------------------------------------
// The AI/API server runs on Vercel (serverless); it cannot emit into this
// process directly. Mutations there POST the live event here so sockets can
// fan it out to every connected client.
const INTERNAL_SECRET = String(process.env.INTERNAL_API_SECRET || "");
if (!INTERNAL_SECRET) {
  console.warn("[socket-server] INTERNAL_API_SECRET is not set — /internal/emit will reject all requests.");
}

function secretsMatch(candidate) {
  if (!candidate || !INTERNAL_SECRET) return false;
  const a = crypto.createHash("sha256").update(String(candidate)).digest();
  const b = crypto.createHash("sha256").update(INTERNAL_SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

// Event names follow the existing convention: waste:new, team:update, ...
const EVENT_NAME_RE = /^[a-zA-Z0-9:_-]{1,64}$/;

app.post("/internal/emit", (req, res) => {
  if (!secretsMatch(req.get("x-internal-secret") || "")) {
    console.warn("[socket-server] rejected /internal/emit: bad secret");
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid internal secret." } });
  }
  const { event, payload, targets } = req.body || {};
  if (typeof event !== "string" || !EVENT_NAME_RE.test(event)) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid event name." } });
  }
  try {
    let deliveredTo = 0;
    if (targets && typeof targets === "object") {
      const rooms = [];
      for (const uid of Array.isArray(targets.uids) ? targets.uids : []) {
        if (typeof uid === "string" && uid) rooms.push(`user:${uid}`);
      }
      for (const role of Array.isArray(targets.roles) ? targets.roles : []) {
        if (typeof role === "string" && role) rooms.push(`role:${role}`);
      }
      for (const room of Array.isArray(targets.rooms) ? targets.rooms : []) {
        if (typeof room === "string" && room) rooms.push(room);
      }
      const unique = [...new Set(rooms)];
      for (const room of unique) {
        deliveredTo += io.to(room).emit(event, payload ?? {});
      }
      console.log(`[socket] emit ${event} -> rooms=[${unique.join(", ")}] deliveries=${deliveredTo}`);
    } else {
      io.emit(event, payload ?? {});
      deliveredTo = io.engine.clientsCount ?? 0;
      console.log(`[socket] emit ${event} -> broadcast deliveries=${deliveredTo}`);
    }
    return res.status(200).json({ ok: true, event, deliveredTo });
  } catch (err) {
    console.error("[socket-server] emit failed:", event, err?.message);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Emit failed." } });
  }
});

// --- Socket authentication ---------------------------------------------------
// Reuses the project's existing session system: opaque tokens stored in the
// Neon `sessions` table, verified through store.getSession (same as REST).
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const user = await store.getSession(token);
    if (!user) return next(new Error("Invalid or expired session"));
    if (user.isActive === false) return next(new Error("Account disabled"));
    socket.data.uid = user.uid;
    socket.data.role = user.role;
    return next();
  } catch (err) {
    // DB blip — fail closed; the client's automatic reconnection will retry.
    console.error("[socket-server] auth lookup failed:", err?.code || err?.message);
    return next(new Error("Authentication temporarily unavailable"));
  }
});

// --- Connection lifecycle -----------------------------------------------------
// Every authenticated socket is placed into:
//   user:{uid}  – private per-user delivery (notifications, task assignments)
//   role:{role} – role broadcast group (e.g. every admin variant shares role:admin)
// Clients may additionally join report:{reportId} rooms via "report:watch"
// after the server verifies they are allowed to see that report.
const REPORT_WATCHERS = new Map(); // socket.id -> Set(reportId) for cleanup

io.on("connection", (socket) => {
  const { uid, role } = socket.data;
  const rolesToJoin = [role];
  if (["admin", "super_admin", "ward_officer", "sanitation_supervisor"].includes(role)) {
    rolesToJoin.push("admin");
  }
  for (const r of rolesToJoin) {
    if (r) socket.join(`role:${r}`);
  }
  if (uid) socket.join(`user:${uid}`);
  console.log(`[socket] connected id=${socket.id} uid=${uid} role=${role} total=${io.engine.clientsCount}`);

  // Live tracking opt-in: citizen watching own report, worker on assigned team,
  // or any admin. DB-checked on every subscribe so permissions stay current.
  socket.on("report:watch", async (data, ack) => {
    try {
      const reportId = String(data?.reportId || "");
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(reportId)) throw new Error("invalid id");
      const report = await store.getReportById(reportId);
      if (!report) throw new Error("not found");
      let allowed = rolesToJoin.includes("admin");
      if (!allowed && uid && report.citizenId === uid) allowed = true;
      if (!allowed && uid && report.assignedTeamId) {
        const team = await store.getTeamById(report.assignedTeamId);
        allowed = Boolean(team && (team.leaderId === uid || (team.memberIds || []).includes(uid)));
      }
      if (!allowed) throw new Error("forbidden");
      const room = `report:${reportId}`;
      socket.join(room);
      if (!REPORT_WATCHERS.has(socket.id)) REPORT_WATCHERS.set(socket.id, new Set());
      REPORT_WATCHERS.get(socket.id).add(reportId);
      console.log(`[socket] watch ${room} by ${socket.id} (${role})`);
      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.warn(`[socket] report:watch denied for ${socket.id}: ${err?.message}`);
      if (typeof ack === "function") ack({ ok: false, error: err?.message || "denied" });
    }
  });

  socket.on("report:unwatch", (data) => {
    const reportId = String(data?.reportId || "");
    if (!reportId) return;
    socket.leave(`report:${reportId}`);
    REPORT_WATCHERS.get(socket.id)?.delete(reportId);
  });

  socket.once("disconnect", (reason) => {
    REPORT_WATCHERS.delete(socket.id);
    console.log(`[socket] disconnected id=${socket.id} uid=${socket.data.uid} reason=${reason} total=${io.engine.clientsCount}`);
  });
});

io.engine.on("connection_error", (err) => {
  console.warn(`[socket] handshake failed code=${err.code} message=${err.message}`);
});

// --- Bootstrap -----------------------------------------------------------------
async function main() {
  // Warm up the shared DB pool once; socket auth reuses it per connection.
  try {
    await getPool().query("SELECT 1");
    console.log("[socket-server] database reachable.");
  } catch (err) {
    console.error("[socket-server] database unreachable at boot:", err?.code || err?.message);
  }

  const args = process.argv.slice(2);
  const portFlag = args.findIndex((arg) => arg === "--port");
  const PORT = Number(process.env.PORT || (portFlag >= 0 ? args[portFlag + 1] : 3000));
  const HOST = "0.0.0.0";
  httpServer.listen(PORT, HOST, () => {
    console.log(`Socket.IO server running on http://${HOST}:${PORT}`);
    console.log(`[socket-server] allowed origins: ${allowedOrigins.join(", ") || "(none)"}`);
  });
}

function shutdown(signal) {
  console.log(`[socket-server] ${signal} received, shutting down...`);
  healthy = false;
  for (const [_, socket] of io.of("/").sockets) socket.disconnect(true);
  io.close(() => {});
  httpServer.close(() => {});
  const pool = getPool();
  pool.end().catch(() => {}).finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main();
