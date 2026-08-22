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
  const { event, payload } = req.body || {};
  if (typeof event !== "string" || !EVENT_NAME_RE.test(event)) {
    return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid event name." } });
  }
  try {
    io.emit(event, payload ?? {});
    return res.status(200).json({ ok: true, event, deliveredTo: io.engine.clientsCount ?? 0 });
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
// Live events are global broadcasts today (same semantics as the previous SSE
// hub), so the server only fans out; no client->server events are accepted.
io.on("connection", (socket) => {
  console.log(`[socket] connected id=${socket.id} uid=${socket.data.uid} role=${socket.data.role} total=${io.engine.clientsCount}`);

  socket.once("disconnect", (reason) => {
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
