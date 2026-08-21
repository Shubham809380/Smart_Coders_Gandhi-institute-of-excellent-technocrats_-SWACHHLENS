import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { tmpdir } from "node:os";
import { initDatabase } from "../backend/db.js";
import { seedDatabase, seedVehicles } from "../backend/seed-neon.js";
import { handleApiRequest } from "../backend/router.js";

let initPromise = null;

function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await initDatabase();
        await seedDatabase();
        await seedVehicles();
        console.log("API initialized.");
      } catch (err) {
        console.error("Database init failed:", err.message);
      }
    })();
  }
  return initPromise;
}

const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4",
};

const repoUploadsRoot = join(process.cwd(), "backend", "uploads");
const tmpUploadsRoot = join(tmpdir(), "swachhlens-uploads");

function serveUpload(req, res, pathname) {
  const relative = pathname.replace(/^\/uploads\//, "");
  const safeRelative = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  for (const root of [tmpUploadsRoot, repoUploadsRoot]) {
    const absolutePath = join(root, safeRelative);
    if (!absolutePath.startsWith(root + sep)) continue;
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      res.writeHead(200, {
        "Content-Type": contentTypes[extname(absolutePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      });
      createReadStream(absolutePath).pipe(res);
      return;
    }
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Media not found." } }));
}

export default async function handler(req, res) {
  await ensureInitialized();
  const urlPath = req.url?.split("?")[0] || "/";
  if (urlPath.startsWith("/uploads/")) {
    serveUpload(req, res, urlPath);
    return;
  }
  await handleApiRequest(req, res);
}
