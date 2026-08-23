import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase } from "./backend/db.js";
import { seedDatabase, seedVehicles } from "./backend/seed-neon.js";
import { store } from "./backend/store.js";
import { handleApiRequest } from "./backend/router.js";
import { serveStoredMedia } from "./backend/utils.js";
import { subscribe as subscribeEvents } from "./backend/events.js";

// Resilience: transient DNS/Neon blips must log, never kill the server.
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection (kept alive):", reason?.code || reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception (kept alive):", err?.code || err?.message || err);
});

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
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};
// Source-tree fallback is ONLY for static media referenced before build (e.g. /src/logo.svg).
// Never serve executable source files (.js/.jsx/.ts/.tsx/.html) from outside dist.
const MEDIA_FALLBACK_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".mp4", ".woff", ".woff2"]);

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(filePath).pipe(res);
}

function startServer(portToUse) {
  const server = createServer(async (req, res) => {
    try {
      // Baseline security headers on every response.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy", "geolocation=(self), camera=(self), microphone=()");
      const urlPath = req.url?.split("?")[0] || "/";
      if (urlPath.startsWith("/api/")) {
        if (urlPath === "/api/events") {
          // SSE requires a valid session token (query param works because
          // EventSource cannot set headers).
          try {
            const url = new URL(req.url, "http://localhost");
            const token = url.searchParams.get("token") ||
              (req.headers.authorization || "").replace(/^Bearer /, "");
            if (!token || !(await store.getSession(token))) {
              res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }));
              return;
            }
          } catch {
            res.writeHead(401);
            res.end();
            return;
          }
          subscribeEvents(req, res);
          return;
        }
        await handleApiRequest(req, res);
        return;
      }
      if (urlPath.startsWith("/uploads/")) {
        if (await serveStoredMedia(req, res, urlPath)) return;
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const assetPath = urlPath === "/" ? "" : urlPath;
      // 1) Serve built files from dist/ first (index.html, /assets/*, sw.js, manifest).
      let filePath = normalize(join(staticRoot, assetPath || "index.html"));
      if (!(filePath.startsWith(staticRoot) && existsSync(filePath) && statSync(filePath).isFile())) {
        // 2) Restricted fallback into the source tree for media only.
        const srcPath = normalize(join(rootDir, assetPath));
        const ext = extname(srcPath).toLowerCase();
        filePath =
          assetPath && srcPath.startsWith(rootDir) && MEDIA_FALLBACK_EXTS.has(ext) &&
          existsSync(srcPath) && statSync(srcPath).isFile()
            ? srcPath
            : "";
      }
      if (filePath) { sendFile(res, filePath); return; }
      sendFile(res, join(staticRoot, "index.html"));
    } catch (error) {
      console.error("Server error:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "SERVER_ERROR", message: "Internal server error." } }));
    }
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

main();
