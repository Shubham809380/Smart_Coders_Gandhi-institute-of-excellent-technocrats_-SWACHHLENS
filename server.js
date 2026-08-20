import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import { initDatabase } from "./backend/db.js";
import { seedDatabase } from "./backend/seed-neon.js";
import { handleApiRequest, setSocketIO } from "./backend/router.js";
import { store } from "./backend/store.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = normalize(join(__filename, ".."));
const args = process.argv.slice(2);
const hostIndex = args.findIndex((arg) => arg === "--host");
const portIndex = args.findIndex((arg) => arg === "--port");
const host = process.env.HOST || (hostIndex >= 0 ? args[hostIndex + 1] || "0.0.0.0" : "127.0.0.1");
const defaultPort = Number(process.env.PORT || (portIndex >= 0 ? args[portIndex + 1] : 3000));
const staticRoot = join(rootDir, "dist");
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4",
};

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(filePath).pipe(res);
}

function startServer(portToUse) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = req.url?.split("?")[0] || "/";
      if (urlPath.startsWith("/api/")) {
        await handleApiRequest(req, res);
        return;
      }
      const assetPath = urlPath.startsWith("/uploads/") ? urlPath.replace(/^\/uploads\//, "backend/uploads/") : urlPath === "/" ? "" : urlPath;
      const safePath = normalize(join(rootDir, assetPath || "dist/index.html"));
      if (!safePath.startsWith(rootDir)) { res.writeHead(403); res.end("Forbidden"); return; }
      if (assetPath && existsSync(safePath) && statSync(safePath).isFile()) { sendFile(res, safePath); return; }
      sendFile(res, join(staticRoot, "index.html"));
    } catch (error) {
      console.error("Server error:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "SERVER_ERROR", message: "Internal server error." } }));
    }
  });

  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  setSocketIO(io);

  io.on("connection", (socket) => {
    console.log(`Socket.IO client connected: ${socket.id}`);

    socket.on("vehicle:update_location", async (data) => {
      try {
        if (!data?.id || !data?.latitude || !data?.longitude) return;
        const vehicle = await store.updateVehicleLocation(data.id, {
          latitude: data.latitude, longitude: data.longitude,
          label: data.label, speedKmh: data.speedKmh, heading: data.heading, status: data.status,
        });
        if (vehicle) io.emit("vehicle:location:update", vehicle);
      } catch (err) { console.error("Vehicle location update error:", err); }
    });

    socket.on("disconnect", () => {
      console.log(`Socket.IO client disconnected: ${socket.id}`);
    });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") { console.warn(`Port ${portToUse} in use, retrying ${portToUse + 1}...`); startServer(portToUse + 1); return; }
    console.error("Server error:", error);
    process.exit(1);
  });

  server.listen(portToUse, host, () => {
    console.log(`SwachhLens dev server running on http://${host}:${portToUse}`);
  });
}

async function main() {
  try {
    await initDatabase();
    await seedDatabase();
    await seedVehicles();
    await store.cleanExpiredSessions();
    console.log("Expired sessions cleaned up.");
    setInterval(async () => {
      try { await store.cleanExpiredSessions(); } catch {}
    }, 60 * 60 * 1000);
  } catch (err) {
    console.error("Database init failed:", err.message);
    console.warn("Starting server without database. API calls will fail until DB is reachable.");
  }
  startServer(defaultPort);
}

async function seedVehicles() {
  try {
    const existing = await store.getVehicles();
    if (existing.length > 0) return;
    const seedVehicles = [
      { id: "veh-01", teamId: "team-07", name: "Vehicle 01", vehicleType: "Mini Tipper", status: "collecting", latitude: 20.2978, longitude: 85.8265, label: "Ward 12 Depot", assignedArea: "Ward 12" },
      { id: "veh-02", teamId: "team-03", name: "Vehicle 02", vehicleType: "Flatbed", status: "en_route", latitude: 20.3018, longitude: 85.8215, label: "Unit 1 Market", assignedArea: "Ward North" },
      { id: "veh-03", teamId: "team-alpha", name: "Vehicle 03", vehicleType: "Mini Tipper", status: "collecting", latitude: 20.2961, longitude: 85.8245, label: "1420 Main St", assignedArea: "Ward 12" },
    ];
    for (const v of seedVehicles) {
      await store.createVehicle(v);
    }
    console.log("Seed vehicles created.");
  } catch (err) {
    console.error("Vehicle seed error:", err.message);
  }
}

main();
