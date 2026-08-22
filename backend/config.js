export const appConfig = {
  authProvider: process.env.AUTH_PROVIDER || "neon",
  aiProvider: process.env.AI_PROVIDER || "mock",
  yoloEndpointUrl: process.env.YOLO_ENDPOINT_URL || "",
  yoloApiKey: process.env.YOLO_API_KEY || "",
  yoloTimeoutMs: Number(process.env.YOLO_TIMEOUT_MS || 15000),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 30000),
  frontendUrl: (process.env.FRONTEND_URL || "").replace(/\/+$/, ""),
};
