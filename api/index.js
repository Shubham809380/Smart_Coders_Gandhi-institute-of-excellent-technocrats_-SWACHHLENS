import { initDatabase } from "../backend/db.js";
import { seedDatabase, seedVehicles } from "../backend/seed-neon.js";
import { handleApiRequest } from "../backend/router.js";
import { serveStoredMedia } from "../backend/utils.js";

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

export default async function handler(req, res) {
  await ensureInitialized();
  const urlPath = req.url?.split("?")[0] || "/";
  if (urlPath.startsWith("/uploads/")) {
    if (await serveStoredMedia(req, res, urlPath)) return;
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Media not found." } }));
    return;
  }
  await handleApiRequest(req, res);
}
