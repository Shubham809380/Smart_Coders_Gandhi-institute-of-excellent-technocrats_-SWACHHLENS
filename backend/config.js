export const appConfig = {
  authProvider: process.env.AUTH_PROVIDER || "neon",
  aiProvider: process.env.AI_PROVIDER || "mock",
  yoloEndpointUrl: process.env.YOLO_ENDPOINT_URL || "",
  yoloApiKey: process.env.YOLO_API_KEY || "",
  yoloTimeoutMs: Number(process.env.YOLO_TIMEOUT_MS || 15000),
};
