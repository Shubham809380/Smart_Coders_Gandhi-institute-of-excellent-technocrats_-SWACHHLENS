import { ROLES, ADMIN_ROLES, REPORT_STATUSES, PRIORITY_WEIGHTS } from "./constants.js";
import { getAIProvider, MockAIProvider } from "./ai/provider.js";
import { verifyCleanupCompletion, detectBinType } from "./ai/geminiVerifier.js";
import { checkWasteImage } from "./ai/wasteGatekeeper.js";
import { resolveEnsemble } from "./ai/arbitration.js";
import { buildRescuedAnalysis } from "./ai/onnxProvider.js";
import { detectWaste as runHybridPipeline } from "./ai/pipeline/index.js";
import { getBinGuidance } from "./binMapping.js";
import { store } from "./store.js";
import { publish } from "./events.js";
import {
  calculatePriority,
  computePriorityBreakdown,
  createId,
  createPasswordHash,
  createResetToken,
  createSessionToken,
  formatReportForClient,
  formatTeamForClient,
  hammingHex,
  haversineMeters,
  nowIso,
  passwordMatches,
  relativeTimeLabel,
  sanitizeUser,
  saveDataUrlMedia,
  sha256Hex,
  validateStatusTransition,
  validateGPSCoordinates,
} from "./utils.js";
import { welcomeEmail, signInAlertEmail, reportReceivedEmail, teamAssignedEmail, reportResolvedEmail, passwordResetEmail } from "./mailer.js";
import { appConfig } from "./config.js";
import { updateWorkerLocation, getAlerts as getProximityAlerts, dismissAlert as dismissProximityAlert, dismissAllAlerts as dismissAllProximityAlerts, dismissForReport } from "./proximity.js";
import { sendPushToUser } from "./push.js";

// Fetch a stored image (Postgres blob, legacy disk path or remote URL) and
// return it as a data URL for Gemini. Returns null on any failure —
// verification proceeds without the before photo instead of erroring out.
async function toDataUrlIfLocal(url) {
  try {
    if (!url) return null;
    let buffer;
    let mimeType = "image/jpeg";
    if (/^https?:\/\//i.test(url)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      mimeType = res.headers.get("content-type") || mimeType;
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      const rel = String(url).replace(/^\/uploads\//, "");
      const { readStoredMedia, resolveUploadsRoot } = await import("./utils.js");
      const blob = await readStoredMedia(rel).catch(() => null);
      if (blob) {
        mimeType = blob.mimeType || mimeType;
        buffer = blob.buffer;
      } else {
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        buffer = await readFile(join(resolveUploadsRoot(), rel));
      }
    }
    if (!buffer || buffer.length > 8 * 1024 * 1024) return null;
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn("[Gemini] could not load before image:", err.message);
    return null;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'SwachhLens/1.0' }, signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { throw new Error("invalid-json"); }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function getSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const user = await store.getSession(token);
  if (!user) return null;
  return { token, user };
}

async function requireAuth(req, res) {
  const auth = await getSession(req);
  if (!auth) { json(res, 401, { error: { code: "UNAUTHORIZED", message: "Please sign in to continue." } }); return null; }
  return auth;
}

async function requireRoles(req, res, roles) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!roles.includes(auth.user.role)) { json(res, 403, { error: { code: "FORBIDDEN", message: "You do not have access to this action." } }); return null; }
  return auth;
}

// ---------------------------------------------------------------------------
// Realtime notification helper — the single place where a user-facing
// notification is persisted AND pushed over Socket.IO (and optionally Web
// Push). Database stays the source of truth; sockets only synchronize UIs.
// ---------------------------------------------------------------------------
async function notifyUser(uid, { title, body, kind = "info", reportId = "", push = false, pushUrl = "" }) {
  if (!uid) return;
  try {
    await store.createNotification({ userId: uid, title, body, kind, reportId });
  } catch (err) {
    console.error("[notify] persist failed:", err?.message);
  }
  publish("notification:new", { uid, title, body, kind, reportId, at: nowIso() }, { uids: [uid] });
  if (push) {
    sendPushToUser(uid, { title, body, url: pushUrl || (reportId ? `/tracking?reportId=${reportId}` : "/"), tag: reportId || title }).catch(() => {});
  }
}

// All admin-variant accounts (new complaint/alert fan-out must reach every one).
async function getAdminUids() {
  const users = await store.getAllUsers();
  return users.filter((u) => ADMIN_ROLES.includes(u.role) && u.isActive !== false).map((u) => u.uid);
}

// UIDs of every cleanup worker belonging to the team assigned to a report.
async function getAssignedWorkerUids(report) {
  if (!report?.assignedTeamId) return [];
  const team = await store.getTeamById(report.assignedTeamId);
  if (!team) return [];
  return [...new Set([team.leaderId, ...(team.memberIds || [])].filter(Boolean))];
}

// Per-process GPS write throttle for worker locations (serverless-safe: worst
// case a cold instance writes once more).
const LOCATION_WRITE_TS = new Map();

// Duplicate detection pipeline (real, layered):
//   1. Coarse filter: same waste category + GPS within 700 m + created in the
//      last 48 h (haversine).
//   2. Hotspot detection: 3+ reports of same type in same area within 24h
//      indicate a persistent problem (not duplicate) — suppress duplicate flag.
//   3. Image evidence: 64-bit dHash comparison of both photos. Hamming
//      distance <= 8 confirms the two photos show the same scene and yields
//      a genuine perceptual-similarity score; otherwise the match stays
//      geo/time-based with an honestly-labelled similarity proxy.
// Reports whose duplicate group was already reviewed/dismissed never re-flag.
async function findDuplicateMatch(incoming) {
  const state = await store.getState();
  const lookbackMs = 1000 * 60 * 60 * 48;
  const incomingHash = incoming.aiAnalysis?.detectionSummary?.phash || "";
  const candidates = state.reports.filter((report) => {
    if (report.duplicateGroupDismissed) return false;
    const reportAgeMs = Date.now() - new Date(report.createdAt).getTime();
    if (reportAgeMs > lookbackMs) return false;
    if (!report.location?.latitude || !incoming.location?.latitude) return false;
    const dist = haversineMeters(report.location, incoming.location);
    return dist <= 700 && report.aiAnalysis?.wasteType === incoming.aiAnalysis?.wasteType;
  });
  if (!candidates.length) {
    return { isPotentialDuplicate: false, primaryReportId: null, similarityScore: 0.14, distanceMeters: 0, method: incomingHash ? "dhash+geo" : "geo_time_category" };
  }
  // Hotspot detection: 3+ distinct-citizen reports of same type in same area
  // within 24h means a genuine persistent problem, not duplicates.
  const hotspotLookbackMs = 1000 * 60 * 60 * 24;
  const recentSameType = state.reports.filter((report) => {
    const reportAgeMs = Date.now() - new Date(report.createdAt).getTime();
    if (reportAgeMs > hotspotLookbackMs) return false;
    if (!report.location?.latitude || !incoming.location?.latitude) return false;
    const dist = haversineMeters(report.location, incoming.location);
    return dist <= 700 && report.aiAnalysis?.wasteType === incoming.aiAnalysis?.wasteType;
  });
  const uniqueCitizens = new Set(recentSameType.map((r) => r.citizenId));
  if (uniqueCitizens.size >= 3) {
    return { isPotentialDuplicate: false, primaryReportId: null, similarityScore: 0.14, distanceMeters: 0, method: "hotspot_detected", hotspotCount: uniqueCitizens.size };
  }

  const scored = candidates.map((r) => ({
    r,
    d: Math.round(haversineMeters(r.location, incoming.location)),
    hashDist: incomingHash && r.aiAnalysis?.detectionSummary?.phash
      ? hammingHex(incomingHash, r.aiAnalysis.detectionSummary.phash)
      : null,
  }));
  // Prefer visually-confirmed matches; fall back to nearest geo match.
  // Threshold: 8 bits (tighter than before to reduce false positives).
  const HASH_DUP_MAX_BITS = 8;
  const confirmed = scored
    .filter((s) => s.hashDist != null && s.hashDist <= HASH_DUP_MAX_BITS)
    .sort((a, b) => (a.hashDist - b.hashDist) || (a.d - b.d))[0];
  if (confirmed) {
    const similarity = Number(Math.min(0.99, 0.99 - confirmed.hashDist / 64).toFixed(2));
    return { isPotentialDuplicate: true, primaryReportId: confirmed.r.id, similarityScore: similarity, distanceMeters: confirmed.d, method: "dhash" };
  }
  const match = scored.slice().sort((a, b) => a.d - b.d)[0];
  return {
    isPotentialDuplicate: true,
    primaryReportId: match.r.id,
    similarityScore: Number(Math.min(0.72, 0.35 + (700 - match.d) / 1000).toFixed(2)),
    distanceMeters: match.d,
    method: "geo_time_category",
  };
}

// ---------------------------------------------------------------------------
// Automatic SLA escalation sweep. High/critical complaints open > 12h, medium
// > 24h and low > 48h are escalated automatically: flagged on the report,
// citizens notified, admins alerted live. Throttled to one run per 5 minutes
// and additionally triggered by the /api/cron/escalate cron endpoint.
// ---------------------------------------------------------------------------
let lastSweepAt = 0;
let sweepInFlight = null;
async function runEscalationSweep({ force = false } = {}) {
  if (!force && Date.now() - lastSweepAt < 5 * 60 * 1000) return { skipped: true, escalated: 0 };
  if (sweepInFlight) return sweepInFlight;
  lastSweepAt = Date.now();
  sweepInFlight = (async () => {
    const stale = await store.getStaleOpenReports().catch(() => []);
    let escalated = 0;
    for (const report of stale) {
      try {
        const ageHours = Math.max(1, Math.round((Date.now() - new Date(report.createdAt).getTime()) / 3600000));
        // Compute LIVE priority to decide SLA breach (not the stale stored value).
        const breakdown = computePriorityBreakdown(report);
        const liveLevel = breakdown.level;
        const slaBreached =
          (liveLevel === "critical" && ageHours > 12) ||
          (liveLevel === "high" && ageHours > 12) ||
          (liveLevel === "medium" && ageHours > 24) ||
          (liveLevel === "low" && ageHours > 48);
        if (!slaBreached) continue;
        await store.updateReport(report.id, {
          escalated: true,
          escalatedAt: nowIso(),
          statusTimeline: [...(report.statusTimeline || []), { status: "escalated", at: nowIso() }],
        });
        escalated++;
        await store.createNotification({
          userId: report.citizenId,
          title: "Complaint auto-escalated",
          body: `${report.id} has been pending for ~${ageHours}h and was escalated for priority action.`,
          kind: "escalation",
          reportId: report.id,
        });
        publish("complaint:escalated", { id: report.id, reason: "sla_breach", ageHours }, { roles: [...ADMIN_ROLES] });
        publish("waste:updated", { id: report.id, escalated: true }, { roles: [...ADMIN_ROLES] });
      } catch (err) {
        console.warn(`[escalation] failed for ${report.id}:`, err?.message);
      }
    }
    if (escalated > 0) {
      console.log(`[escalation] auto-escalated ${escalated} SLA-breached complaint(s)`);
      await store.createNotification({
        userId: "user-admin",
        title: "SLA escalation sweep",
        body: `${escalated} overdue complaint(s) auto-escalated (high/critical >12h, medium >24h, low >48h).`,
        kind: "escalation",
      }).catch(() => {});
    }
    return { skipped: false, escalated };
  })().finally(() => { sweepInFlight = null; });
  return sweepInFlight;
}

function buildDashboard(state) {  const reports = state.reports;
  const open = reports.filter((r) => ![REPORT_STATUSES.RESOLVED, REPORT_STATUSES.REJECTED].includes(r.status));
  const critical = reports.filter((r) => r.priority?.level === "critical");
  const resolvedToday = reports.filter((r) => r.status === REPORT_STATUSES.RESOLVED && new Date(r.updatedAt).toDateString() === new Date().toDateString());
  const resolved = reports.filter((r) => r.status === REPORT_STATUSES.RESOLVED);
  let avgResolutionTime = 0;
  if (resolved.length > 0) {
    const totalMinutes = resolved.reduce((sum, r) => {
      const created = new Date(r.createdAt).getTime();
      const updated = new Date(r.updatedAt).getTime();
      return sum + Math.max(1, (updated - created) / 60000);
    }, 0);
    avgResolutionTime = Math.round(totalMinutes / resolved.length);
  }
  return {
    openComplaints: open.length,
    criticalComplaints: critical.length,
    resolvedToday: resolvedToday.length,
    availableTeams: state.teams.filter((t) => t.status === "available").length,
    averageResolutionTime: avgResolutionTime,
    urgentComplaints: reports.filter((r) => ["high", "critical"].includes(r.priority?.level)).length,
    aiPriorityQueue: reports
      .filter((r) => [REPORT_STATUSES.SUBMITTED, REPORT_STATUSES.AI_ANALYZED, REPORT_STATUSES.UNDER_REVIEW].includes(r.status))
      .sort((a, b) => (b.priority?.score || 0) - (a.priority?.score || 0))
      .map(formatReportForClient),
    alerts: critical.slice(0, 3).map((r) => ({ id: r.id, title: "Critical waste report", body: `${r.id} needs urgent review.` })),
  };
}

const aiProvider = getAIProvider();

// ---- Password reset constants & abuse guard ----
const RESET_TOKEN_TTL_MIN = 30;
const rateBuckets = new Map();
function allowRate(key, limit, windowMs) {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) { rateBuckets.set(key, hits); return false; }
  hits.push(now);
  rateBuckets.set(key, hits);
  return true;
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.socket?.remoteAddress || "unknown";
}

if (process.env.NODE_ENV !== "test") {
  const configured = String(process.env.AI_PROVIDER || "").toLowerCase();
  console.log(`[AI] AI_PROVIDER=${configured || "(unset)"} | Gemini gatekeeper=${process.env.GEMINI_API_KEY ? "on" : "off"} | Web push=${process.env.VAPID_PUBLIC_KEY ? "on" : "off"}`);
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return json(res, 200, { ok: true, mode: "neon-db", date: new Date().toISOString() });
    }

    // ---- Cron entrypoint (Vercel Cron sends GET with Bearer $CRON_SECRET) ----
    if (pathname === "/api/cron/escalate" && (req.method === "GET" || req.method === "POST")) {
      const secret = process.env.CRON_SECRET || "";
      const provided = getBearerToken(req) || req.headers["x-cron-secret"] || "";
      if (secret && provided !== secret) {
        const auth = await requireRoles(req, res, ADMIN_ROLES);
        if (!auth) return;
      } else if (!secret) {
        const auth = await requireRoles(req, res, ADMIN_ROLES);
        if (!auth) return;
      }
      const result = await runEscalationSweep({ force: true });
      return json(res, 200, { ok: true, ...result });
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      // Server-computed civic stats (single source of truth for all clients).
      let stats = null;
      try {
        if (auth.user.role === ROLES.CITIZEN) stats = await store.getCitizenStats(auth.user.uid);
      } catch (statsErr) {
        console.warn("[auth/me] stats failed:", statsErr?.message);
      }
      return json(res, 200, { currentUser: sanitizeUser(auth.user), role: auth.user.role, isAuthenticated: true, loading: false, error: "", stats });
    }

    if (pathname === "/api/auth/signup" && req.method === "POST") {
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const phone = String(body.phone || "").trim();
      // Security: public signup may only create citizen/worker accounts.
      // Privileged roles are provisioned out-of-band (seed/admin tooling), never via this endpoint.
      const role = ["citizen", "cleanup_worker"].includes(body.role) ? body.role : "citizen";
      if (!name || !email || !password) return json(res, 400, { error: { code: "VALIDATION", message: "Name, email, and password are required." } });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: { code: "VALIDATION", message: "Please enter a valid email address." } });
      if (password.length < 8) return json(res, 400, { error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters." } });
      if (body.termsAccepted !== true) {
        return json(res, 400, { error: { code: "TERMS_REQUIRED", message: "You must accept the Terms of Service and Privacy Policy to create an account." } });
      }
      const existing = await store.getUserByEmail(email);
      if (existing) return json(res, 409, { error: { code: "ACCOUNT_EXISTS", message: "An account with this email already exists." } });
      const uid = createId("user");
      const { salt, passwordHash } = await createPasswordHash(password);
      let user = await store.createUser({ uid, name, email, phone, passwordHash, salt, role, termsAccepted: true, termsAcceptedAt: new Date().toISOString() });
      if (role === ROLES.CLEANUP_WORKER) {
        // New workers start on duty and join the default ward crew so
        // admin-assigned work lands on their panel immediately.
        user = await store.toggleDutyStatus(uid, "on_duty");
        await store.ensureWorkerOnTeam(uid);
      }
      welcomeEmail(user);
      const token = createSessionToken();
      await store.createSession(token, uid);
      return json(res, 201, { sessionToken: token, currentUser: sanitizeUser(user), role: user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      // Brute-force guard: 10 attempts / minute per IP and 5 per account / 15 min.
      const ip = clientIp(req);
      if (!allowRate(`login:ip:${ip}`, 10, 60 * 1000)) {
        return json(res, 429, { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Please wait a moment." } });
      }
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!allowRate(`login:email:${email}`, 5, 15 * 60 * 1000)) {
        return json(res, 429, { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts for this account. Try again in a few minutes." } });
      }
      const user = await store.getUserByEmail(email);
      if (!user) return json(res, 401, { error: { code: "INVALID_CREDENTIAL", message: "Incorrect email or password." } });
      const pool = (await import("./db.js")).getPool();
      const accRes = await pool.query("SELECT password_hash, salt FROM users WHERE uid = $1", [user.uid]);
      const acc = accRes.rows[0];
      if (!acc || !(await passwordMatches({ passwordHash: acc.password_hash, salt: acc.salt }, password))) {
        return json(res, 401, { error: { code: "INVALID_CREDENTIAL", message: "Incorrect email or password." } });
      }
      const token = createSessionToken();
      await store.createSession(token, user.uid);
      // Login audit trail (powers the admin dashboard "logins today" counter).
      store.logActivity({ actor: user.uid, role: user.role, action: "login" }).catch(() => {});
      signInAlertEmail({ email: user.email, name: user.name, method: "email & password" });
      return json(res, 200, { sessionToken: token, currentUser: sanitizeUser(user), role: user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      await store.deleteSession(auth.token);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/auth/google" && req.method === "POST") {
      const body = await readJson(req);
      const credential = String(body.credential || "");
      let accessToken = String(body.accessToken || "");
      const authCode = String(body.code || "");
      const requestedRole = body.role === "cleanup_worker" ? "cleanup_worker" : "citizen";
      if (!credential && !accessToken && !authCode) return json(res, 400, { error: { code: "VALIDATION", message: "Google credential is required." } });

      if (!accessToken && authCode) {
        try {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code: authCode,
              client_id: process.env.GOOGLE_CLIENT_ID,
              client_secret: process.env.GOOGLE_CLIENT_SECRET,
              redirect_uri: body.redirectUri || "postmessage",
              grant_type: "authorization_code",
            }),
          });
          const tokenData = await tokenRes.json();
          if (!tokenData.access_token) throw new Error("token exchange failed");
          accessToken = tokenData.access_token;
        } catch {
          return json(res, 401, { error: { code: "GOOGLE_TOKEN_EXCHANGE_FAILED", message: "Failed to exchange Google authorization code." } });
        }
      }

      let email, name, avatar;

      if (accessToken) {
        try {
          const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!googleRes.ok) throw new Error("userinfo failed");
          const googleUser = await googleRes.json();
          if (!googleUser.email) throw new Error("no email");
          email = googleUser.email.toLowerCase();
          name = googleUser.name || email.split("@")[0];
          avatar = googleUser.picture || "";
        } catch {
          return json(res, 401, { error: { code: "INVALID_GOOGLE_TOKEN", message: "Invalid Google access token." } });
        }
      } else if (credential) {
        try {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
          const tokenInfo = await googleRes.json();
          if (tokenInfo.error_description || !tokenInfo.email) throw new Error("invalid token");
          if (clientId && tokenInfo.aud !== clientId) throw new Error("audience mismatch");
          const nowSec = Math.floor(Date.now() / 1000);
          if (tokenInfo.exp && Number(tokenInfo.exp) < nowSec) throw new Error("token expired");
          email = tokenInfo.email.toLowerCase();
          name = tokenInfo.name || email.split("@")[0];
          avatar = tokenInfo.picture || "";
        } catch {
          return json(res, 401, { error: { code: "INVALID_GOOGLE_TOKEN", message: "Invalid Google credential." } });
        }
      }

      let user = await store.getUserByEmail(email);
      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        const uid = createId("user");
        const { passwordHash, salt } = await createPasswordHash("google-oauth-" + uid);
        user = await store.createUser({ uid, name, email, phone: "", passwordHash, salt, role: requestedRole, photoUrl: avatar });
        if (requestedRole === ROLES.CLEANUP_WORKER) {
          // New Google workers start on duty and join the default crew so
          // their panel shows real assigned work right away.
          user = await store.toggleDutyStatus(uid, "on_duty");
          await store.ensureWorkerOnTeam(uid);
        }
      } else {
        // Role rules for returning Google users:
        // - Privileged roles (admin/officer/supervisor) are NEVER overwritten
        //   — no silent demotion via social sign-in. Promotions/demotions for
        //   staff happen exclusively through the admin console.
        // - A citizen who explicitly picks the Worker tab becomes a worker,
        //   mirroring public signup which already allows choosing this role.
        const updates = {};
        if (requestedRole === ROLES.CLEANUP_WORKER && user.role === ROLES.CITIZEN) updates.role = ROLES.CLEANUP_WORKER;
        if (user.name !== name) updates.name = name;
        if (avatar && user.photoURL !== avatar) updates.photo_url = avatar;
        if (Object.keys(updates).length > 0) {
          user = await store.updateUserProfile(user.uid, updates);
        }
        if (user.role === ROLES.CLEANUP_WORKER && updates.role) {
          // Freshly converted worker: flip duty on and attach to a crew.
          if (user.dutyStatus !== "on_duty") user = await store.toggleDutyStatus(user.uid, "on_duty");
          await store.ensureWorkerOnTeam(user.uid);
        }
      }

      const token = createSessionToken();
      await store.createSession(token, user.uid);
      if (isNewUser) welcomeEmail(user);
      else signInAlertEmail({ email: user.email, name: user.name, method: "Google sign-in" });
      return json(res, 200, { sessionToken: token, currentUser: sanitizeUser(user), role: user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      // Generic response no matter what — never reveal whether an account exists.
      const GENERIC = "If an account exists with this email, a password reset link has been sent.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(res, 200, { message: GENERIC });
      }
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
      // Abuse guard: 3 per email/hour, 10 per IP/hour. Silently throttled with the same generic reply.
      if (!allowRate(`fp:email:${email}`, 3, 60 * 60 * 1000) || !allowRate(`fp:ip:${ip}`, 10, 60 * 60 * 1000)) {
        console.warn(`[auth] forgot-password throttled (${email ? "email hit" : "ip hit"}): ${ip}`);
        return json(res, 429, { error: { code: "RATE_LIMITED", message: "Too many reset requests. Please try again later." } });
      }
      try {
        const user = await store.getUserByEmail(email);
        // Google-only accounts authenticate via Google; a password reset link is meaningless for them,
        // and skipping keeps the response identical from the outside.
        if (user && !String(await store.getPasswordHashByUid(user.uid)).startsWith("google-oauth-")) {
          const token = createResetToken();
          const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000).toISOString();
          await store.createPasswordReset({ uid: user.uid, tokenHash: sha256Hex(token), expiresAt });
          const base = appConfig.frontendUrl || String(req.headers.origin || "").replace(/\/+$/, "");
          if (base) {
            passwordResetEmail({ email: user.email, name: user.name, resetUrl: `${base}/reset-password/${token}`, expiryMinutes: RESET_TOKEN_TTL_MIN });
          } else {
            console.error("[auth] FRONTEND_URL/Origin missing — reset email not sent, token left unconsumable.");
          }
        }
      } catch (mailErr) {
        // Never leak internals; the user still gets the generic success.
        console.error("[auth] forgot-password processing failed:", mailErr.message);
      }
      return json(res, 200, { message: GENERIC });
    }

    if (pathname === "/api/auth/reset-password" && req.method === "POST") {
      const body = await readJson(req);
      const token = String(body.token || "").trim();
      const password = String(body.password || "");
      if (!token) return json(res, 400, { error: { code: "VALIDATION", message: "Reset token is missing or invalid." } });
      if (password.length < 8) return json(res, 400, { error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters." } });
      // Atomic consume: fails when the token is unknown, expired, or already used.
      let uid;
      try {
        const row = await store.consumePasswordReset(sha256Hex(token));
        uid = row?.uid;
      } catch (dbErr) {
        console.error("[auth] reset-password db failure:", dbErr.message);
        return json(res, 500, { error: { code: "DB_FAILED", message: "Something went wrong on our side. Please try again." } });
      }
      if (!uid) {
        return json(res, 400, { error: { code: "INVALID_TOKEN", message: "This reset link is invalid, expired, or has already been used. Please request a new one." } });
      }
      const { salt, passwordHash } = await createPasswordHash(password);
      await store.updateUserPassword(uid, passwordHash, salt);
      await store.deletePasswordResetsForUser(uid);
      publish("user:update", { uid });
      return json(res, 200, { message: "Password reset successfully. Please sign in with your new password." });
    }

    if (pathname === "/api/auth/profile" && req.method === "PUT") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const languageOnly = !name && ["en", "hi", "or"].includes(body.language);
      if (!name && !languageOnly) return json(res, 400, { error: { code: "VALIDATION", message: "Name is required." } });
      const updates = {};
      if (name) updates.name = name;
      if (phone) updates.phone = phone;
      // Language preference drives the UI localization (en | hi | or).
      if (["en", "hi", "or"].includes(body.language)) updates.language = body.language;
      const updated = await store.updateUserProfile(auth.user.uid, updates);
      return json(res, 200, { currentUser: sanitizeUser(updated) });
    }

    if (pathname === "/api/auth/change-password" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (!currentPassword || !newPassword) return json(res, 400, { error: { code: "VALIDATION", message: "Current and new password are required." } });
      if (newPassword.length < 8) return json(res, 400, { error: { code: "WEAK_PASSWORD", message: "New password must be at least 8 characters." } });
      const pool = (await import("./db.js")).getPool();
      const accRes = await pool.query("SELECT password_hash, salt FROM users WHERE uid = $1", [auth.user.uid]);
      const acc = accRes.rows[0];
      if (!acc) return json(res, 404, { error: { code: "NOT_FOUND", message: "User account not found." } });
      if (acc.password_hash.startsWith("google-oauth-")) {
        return json(res, 400, { error: { code: "GOOGLE_ACCOUNT", message: "This account uses Google sign-in. Password cannot be changed." } });
      }
      const valid = await passwordMatches({ passwordHash: acc.password_hash, salt: acc.salt }, currentPassword);
      if (!valid) return json(res, 401, { error: { code: "INVALID_PASSWORD", message: "Current password is incorrect." } });
      const { salt: newSalt, passwordHash: newHash } = await createPasswordHash(newPassword);
      await store.updateUserProfile(auth.user.uid, { password_hash: newHash, salt: newSalt });
      return json(res, 200, { ok: true, message: "Password changed successfully." });
    }

    // ---- Hybrid Gemini+CNN pipeline (multi-label, review-flagged) ----
    if (pathname === "/api/detect-waste" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      if (!body.image || !body.image.startsWith("data:")) {
        return json(res, 400, { error: { code: "NO_IMAGE", message: "Please capture or upload a photo before analyzing." } });
      }
      if (body.image.length > 10 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Image is too large. Please capture a smaller photo." } });
      }
      const imageBuffer = Buffer.from(body.image.split(",").pop(), "base64");
      let result;
      try {
        result = await runHybridPipeline({ imageBuffer });
      } catch (err) {
        console.error("[detect-waste] pipeline error:", err.message);
        return json(res, 500, { error: { code: "PIPELINE_FAILED", message: "Analysis could not be completed. Please try again." } });
      }
      if (!result.accepted) {
        // Hard-negative mining feed: rejections are logged with their trace so
        // corrected outcomes can be mined back into the next training round
        // (see TRAINING GUIDANCE in ai/pipeline/config.js).
        store.logInference({
          userId: auth.user.uid,
          outcome: "hybrid_rejected",
          provider: "hybrid_gemini_cnn",
          reason: result.rejected?.reason || "",
        }).catch(() => {});
      }
      const { mapHybridToApp } = await import("./ai/pipeline/mapToApp.js");
      const analysis = await mapHybridToApp(result);
      if (!analysis.valid_waste_image) {
        return json(res, 200, analysis);
      }
      // Duplicate detection parity with the legacy analyze flow.
      let duplicateMatch = null;
      try {
        const duplicate = await findDuplicateMatch({ location: body.location || null, aiAnalysis: analysis.result });
        const priority = calculatePriority(analysis.result, { address: body.location?.address || "", duplicateSupportCount: duplicate.isPotentialDuplicate ? 1 : 0, ageHours: 0 });
        analysis.result.priorityScore = priority.score;
        if (duplicate.isPotentialDuplicate) {
          duplicateMatch = { reportId: duplicate.primaryReportId, distance: `${duplicate.distanceMeters}m away`, status: "Possible duplicate" };
        }
      } catch (dupErr) {
        console.warn("[detect-waste] duplicate check failed:", dupErr.message);
      }
      store.logInference({
        userId: auth.user.uid,
        outcome: result.requires_human_review ? "hybrid_review" : "hybrid_accepted",
        provider: "hybrid_gemini_cnn",
        wasteType: analysis.result.wasteType || "",
        confidence: analysis.result.confidence || 0,
        processingMs: result.processing_ms || 0,
      }).catch(() => {});
      return json(res, 200, { ...analysis, duplicateMatch });
    }

    if (pathname === "/api/ai/analyze" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      if (!body.image || !body.image.startsWith("data:")) {
        return json(res, 400, { error: { code: "NO_IMAGE", message: "Please capture or upload a photo before analyzing." } });
      }
      if (body.image.length > 10 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Image is too large. Please capture a smaller photo." } });
      }
      // Gemini gatekeeper pre-check: reject photos that clearly contain no waste
      // before the YOLO/volume/severity pipeline runs. Fails open on any error.
      let lowImageWarning = "";
      let gateVerdict = null;
      try {
        const gate = await checkWasteImage({ image: body.image });
        gateVerdict = gate;
        if (gate.checked && !gate.isWaste) {
          console.log(`[AI] Gate rejected non-waste image (${gate.confidence}): ${gate.reason}`);
          store.logInference({ userId: auth.user.uid, outcome: "gate_rejected", provider: "gemini_gatekeeper", reason: gate.reason || "" }).catch(() => {});
          return json(res, 200, {
            valid_waste_image: false,
            reason: gate.reason || "No waste is visible in this photo.",
            message: "We couldn't detect any waste in this photo. Please retake a clear photo of the waste you'd like to report.",
          });
        }
        if (gate.checked && gate.isWaste && gate.confidence === "low") {
          lowImageWarning = "This photo isn't very clear — please make sure the waste is fully visible.";
          console.log(`[AI] Gate passed with low confidence, soft warning attached.`);
        } else if (gate.checked) {
          console.log(`[AI] Gate passed (${gate.confidence}${gate.cached ? ", cached" : ""}).`);
        }
      } catch (gateErr) {
        console.warn("[AI] Gate skipped (fail-open):", gateErr.message);
      }
      let analysis;
      try {
        analysis = await aiProvider.analyzeWaste(body);
      } catch (aiErr) {
        // Calibrated classifier rejection (below conf/margin thresholds): surface
        // it honestly instead of substituting a mock result — unless Gemini can
        // rescue it (gatekeeper saw real waste with known materials).
        if (aiErr?.statusCode === 400) {
          console.log(`[AI] Classifier rejected image: ${aiErr.message}`);
          let rescued = null;
          try {
            rescued = gateVerdict ? await buildRescuedAnalysis(body, gateVerdict) : null;
          } catch (rescueErr) {
            console.warn("[AI] Gemini rescue failed:", rescueErr.message);
          }
          if (rescued) {
            analysis = rescued;
            store.logInference({ userId: auth.user.uid, outcome: "gemini_rescued", provider: "gemini_rescue", wasteType: rescued.wasteType || "" }).catch(() => {});
          } else {
            store.logInference({ userId: auth.user.uid, outcome: "rejected", provider: aiProvider.constructor?.name || "unknown", reason: aiErr.message }).catch(() => {});
            return json(res, 200, {
              valid_waste_image: false,
              reason: aiErr.message,
              message: "This photo doesn't clearly contain recognizable waste. Please retake a closer, clearer photo.",
            });
          }
        }
        console.warn("[AI] Primary provider failed, using fallback:", aiErr.message);
        try {
          const fallback = new MockAIProvider();
          analysis = await fallback.analyzeWaste(body);
          store.logInference({ userId: auth.user.uid, outcome: "mock_fallback", provider: "mock", reason: aiErr.message }).catch(() => {});
        } catch (fallbackErr) {
          console.error("[AI] Fallback also failed:", fallbackErr.message);
          return json(res, 500, { error: { code: "AI_FAILED", message: "Analysis could not be completed. Please try again." } });
        }
      }
      // Gemini × CNN ensemble arbitration: consensus boost, material override
      // when the models disagree, and strict-mode rejection when the gatekeeper
      // was unavailable (blocks confident-but-wrong CNN verdicts on people etc).
      const ensemble = await resolveEnsemble({ analysis, gate: gateVerdict });
      if (ensemble.rejected) {
        console.log(`[AI] Ensemble rejected image.`);
        store.logInference({ userId: auth.user.uid, outcome: "ensemble_rejected", provider: "gemini+cnn_ensemble", reason: ensemble.rejected.reason || "" }).catch(() => {});
        return json(res, 200, ensemble.rejected);
      }
      analysis = ensemble.analysis;
      // Scene-aware category refinement: the CNN is a material classifier, but
      // three problem-statement categories (drain_blockage, overflowing_bin,
      // construction_debris) are scenes no material class can express. The
      // gatekeeper's Gemini verdict recognises them for free on the same call;
      // when it confidently sees one, override the label and recompute
      // severity + dispatch with the same rule engine.
      if (gateVerdict?.checked && gateVerdict?.isWaste && gateVerdict.scene) {
        const scene = gateVerdict.scene;
        analysis.detectionSummary = {
          ...(analysis.detectionSummary || {}),
          sceneDetection: { scene, confidence: gateVerdict.confidence || "medium", model: "gemini_gatekeeper" },
        };
        if (scene !== analysis.wasteType) {
          console.log(`[AI] Scene override: ${analysis.wasteType} -> ${scene} (Gemini ${gateVerdict.confidence})`);
          analysis.wasteType = scene;
          try {
            const { ruleBasedSeverity, recommendAction } = await import("./ai/onnxProvider.js");
            const sev = ruleBasedSeverity(scene, analysis.estimatedVolume || "medium", Number(analysis.confidence) || 70, 1, 0, 0.3, analysis.volumeConfidence || "none");
            analysis.severity = sev.severity;
            analysis.dispatch = recommendAction(scene, analysis.estimatedVolume || "medium", sev.severity);
            analysis.recommendation = `Assign ${analysis.dispatch.team} within ${analysis.dispatch.sla_hours} hours. ${analysis.dispatch.instructions}`;
            if (sev.confidence) analysis.severityConfidence = sev.confidence;
          } catch (sevErr) {
            console.warn("[AI] scene severity recompute failed:", sevErr.message);
          }
        }
      }
      const duplicate = await findDuplicateMatch({ location: body.location || null, aiAnalysis: analysis });
      const priority = calculatePriority(analysis, { address: body.location?.address || "", comment: body.comment || "", duplicateSupportCount: duplicate.isPotentialDuplicate ? 1 : 0, ageHours: 0 });
      store.logInference({
        userId: auth.user.uid,
        outcome: "accepted",
        provider: aiProvider.constructor?.name || "unknown",
        wasteType: analysis.wasteType || "",
        confidence: Number(analysis.confidence) || 0,
        processingMs: Math.round((Number(analysis.processingTime) || 0) * 1000),
      }).catch(() => {});
      return json(res, 200, {
        result: {
          wasteType: analysis.wasteType,
          confidence: analysis.confidence,
          estimatedVolume: analysis.estimatedVolume,
          estimatedVolumeRange: analysis.estimatedVolumeRange,
          severity: analysis.severity,
          potentialRisk: (analysis.potentialRisks || []).join(", "),
          potentialRisks: analysis.potentialRisks || [],
          recommendation: analysis.recommendation,
          hazardFlag: Boolean(analysis.hazardFlag),
          recyclableHeavy: Boolean(analysis.recyclableHeavy),
          priorityScore: priority.score,
          dispatch: analysis.dispatch || null,
          detectionSummary: analysis.detectionSummary || null,
          mixedComposition: analysis.mixedComposition || null,
          needsReview: Boolean(analysis.needsReview),
          processingTime: analysis.processingTime || null,
          models: analysis.models || null,
          imageWarning: lowImageWarning || null,
        },
        duplicateMatch: duplicate.isPotentialDuplicate ? { reportId: duplicate.primaryReportId, distance: `${duplicate.distanceMeters}m away`, status: "Possible duplicate" } : null,
      });
    }

    // ---- Worker-only Gemini endpoints ----
    if (pathname === "/api/ai/verify-cleanup" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      if (!body.afterImage || !String(body.afterImage).startsWith("data:")) {
        return json(res, 400, { error: { code: "NO_IMAGE", message: "An after-cleanup photo is required for verification." } });
      }
      if (body.afterImage.length > 10 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Photo is too large. Please capture a smaller one." } });
      }
      let beforeImage = null;
      if (body.reportId) {
        const report = await store.getReportById(String(body.reportId));
        if (report && report.media && report.media.imageUrl) beforeImage = await toDataUrlIfLocal(report.media.imageUrl);
      }
      const verdict = await verifyCleanupCompletion({ beforeImage, afterImage: body.afterImage, wasteType: body.wasteType || "", comment: body.comment || "" });
      const bin = getBinGuidance(body.wasteType || "");
      return json(res, 200, { verification: verdict, disposal: { bin: bin.bin, binLabel: bin.binLabel, color: bin.color, handling: bin.handling } });
    }

    if (pathname === "/api/ai/bin-type" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      if (!body.image || !String(body.image).startsWith("data:")) {
        return json(res, 400, { error: { code: "NO_IMAGE", message: "A photo is required to detect the dustbin type." } });
      }
      if (body.image.length > 10 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Photo is too large. Please capture a smaller one." } });
      }
      const detection = await detectBinType({ image: body.image });
      const guidance = getBinGuidance(body.wasteType || "");
      return json(res, 200, { detection, recommendedDisposal: { bin: guidance.bin, binLabel: guidance.binLabel, color: guidance.color, handling: guidance.handling } });
    }

    if (pathname === "/api/reports" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reports = await store.getReportsForUser(auth.user.uid, auth.user.role);
      return json(res, 200, { reports: reports.map(formatReportForClient) });
    }

    if (pathname === "/api/reports" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CITIZEN, ...ADMIN_ROLES]);
      if (!auth) return;
      const body = await readJson(req);
      const payload = body || {};
      if (!payload.aiResult || !payload.location) return json(res, 400, { error: { code: "VALIDATION", message: "Waste analysis and location are required." } });
      // GPS spoofing detection: validate coordinates before processing.
      const gpsCheck = validateGPSCoordinates(payload.location.latitude, payload.location.longitude);
      if (!gpsCheck.valid) {
        console.warn(`[GPS] Invalid coordinates from ${auth.user.uid}: ${gpsCheck.reason}`);
        // Still accept the report but flag it for admin review.
      }
      // Impossible-jump detection: if user reported from a very different location recently, flag it.
      if (gpsCheck.valid) {
        try {
          const userReports = await store.getReportsForUser(auth.user.uid);
          const recentReport = userReports.find((r) => {
            const ageMs = Date.now() - new Date(r.createdAt).getTime();
            return ageMs < 1000 * 60 * 60 && r.location?.latitude && r.location?.longitude;
          });
          if (recentReport) {
            const jumpKm = haversineMeters(recentReport.location, payload.location) / 1000;
            if (jumpKm > 100) {
              console.warn(`[GPS] Impossible jump detected for ${auth.user.uid}: ${jumpKm.toFixed(0)}km in <1h`);
              gpsCheck.flagged = true;
              gpsCheck.reason = `impossible_jump_${Math.round(jumpKm)}km`;
            }
          }
        } catch { /* best effort */ }
      }
      if (payload.image && payload.image.length > 8 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Image is too large. Please capture a smaller photo." } });
      }
      const reportId = `REP-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const beforeMedia = await saveDataUrlMedia(payload.image, `reports/${auth.user.uid}/${reportId}/before`);
      const videoMedia = await saveDataUrlMedia(payload.video, `reports/${auth.user.uid}/${reportId}/before-video`);
      const aiAnalysis = { wasteType: payload.aiResult.wasteType, confidence: Math.round(Number(payload.aiResult.confidence) || 0), estimatedVolume: payload.aiResult.estimatedVolume, estimatedVolumeRange: payload.aiResult.estimatedVolumeRange, severity: payload.aiResult.severity, potentialRisks: String(payload.aiResult.potentialRisk || "").split(",").map((s) => s.trim()).filter(Boolean), recommendation: payload.aiResult.recommendation };
      // Persist the full AI verdict so recycling routing, hazard alerts and the
      // gauge all work from stored data (not just the transient analyze response).
      if (payload.aiResult.hazardFlag !== undefined) aiAnalysis.hazardFlag = Boolean(payload.aiResult.hazardFlag);
      if (payload.aiResult.recyclableHeavy !== undefined) aiAnalysis.recyclableHeavy = Boolean(payload.aiResult.recyclableHeavy);
      if (payload.aiResult.detectionSummary) aiAnalysis.detectionSummary = payload.aiResult.detectionSummary;
      // Attach GPS validation flag to detection summary for admin review.
      if (gpsCheck && (gpsCheck.flagged || !gpsCheck.valid)) {
        aiAnalysis.detectionSummary = {
          ...(aiAnalysis.detectionSummary || {}),
          gpsValidation: { valid: gpsCheck.valid, reason: gpsCheck.reason, flagged: Boolean(gpsCheck.flagged) },
        };
      }

      let resolvedAddress = payload.location.address || "";
      if ((!resolvedAddress || resolvedAddress.startsWith("Detected location")) && payload.location.latitude && payload.location.longitude) {
        const geoAddress = await reverseGeocode(payload.location.latitude, payload.location.longitude);
        if (geoAddress) resolvedAddress = geoAddress;
      }

      const baseReport = {
        id: reportId, citizenId: auth.user.uid,
        media: { imageUrl: beforeMedia.url, videoUrl: videoMedia.url, thumbnailUrl: beforeMedia.url, storagePath: beforeMedia.storagePath },
        location: { latitude: payload.location.latitude, longitude: payload.location.longitude, address: resolvedAddress, wardId: payload.location.wardId || auth.user.wardId || "ward-unassigned", locality: payload.location.locality || auth.user.locationName || "Unknown" },
        citizenComment: String(payload.comment || ""), aiAnalysis,
        priority: calculatePriority(aiAnalysis, { address: payload.location.address || "", comment: payload.comment || "", duplicateSupportCount: 0, ageHours: 0 }),
        duplicate: { isPotentialDuplicate: false, primaryReportId: null, similarityScore: 0, distanceMeters: 0 },
        status: REPORT_STATUSES.SUBMITTED, statusTimeline: [{ status: REPORT_STATUSES.SUBMITTED, at: nowIso() }],
      };
      const dup = await findDuplicateMatch(baseReport);
      baseReport.duplicate = dup;
      if (dup.isPotentialDuplicate) baseReport.priority = calculatePriority(aiAnalysis, { address: payload.location.address || "", duplicateSupportCount: 1, ageHours: 0 });
      const created = await store.createReport(baseReport);
      // DB write succeeded — only now fan out notifications and live events.
      notifyUser(auth.user.uid, {
        title: "Report submitted",
        body: `${reportId} is now in the AI review queue.`,
        kind: "success", reportId,
      });
      const adminUids = await getAdminUids();
      for (const uid of adminUids) {
        await store.createNotification({ userId: uid, title: "New complaint received", body: `${reportId} needs municipal review.`, kind: "info", reportId });
        publish("notification:new", { uid, title: "New complaint received", body: `${reportId} needs municipal review.`, kind: "info", reportId, at: nowIso() }, { uids: [uid] });
      }
      publish("waste:new", {
        id: reportId, wardId: baseReport.location.wardId, locality: baseReport.location.locality,
        status: created.status, wasteType: aiAnalysis.wasteType, severity: aiAnalysis.severity,
        priorityLevel: baseReport.priority.level, latitude: baseReport.location.latitude, longitude: baseReport.location.longitude,
        createdAt: created.createdAt,
      }, { roles: [...ADMIN_ROLES] });
      // On-duty cleanup crews hear about fresh reports immediately so field
      // workers see live pickups without waiting for a dispatch assignment.
      try {
        const onDutyUids = await store.getOnDutyWorkerUids();
        const workerNotice = {
          title: "New waste reported",
          body: `${reportId} · ${aiAnalysis.severity || "medium"} severity · ${baseReport.location.locality}`,
          kind: "info", reportId,
        };
        for (const uid of onDutyUids) {
          await store.createNotification({ userId: uid, ...workerNotice });
          publish("notification:new", { uid, ...workerNotice, at: nowIso() }, { uids: [uid] });
        }
      } catch (workerNotifyErr) {
        console.error("[reports] worker notification fanout failed:", workerNotifyErr?.message || workerNotifyErr);
      }
      reportReceivedEmail({ email: auth.user.email, name: auth.user.name, reportId, address: resolvedAddress, priority: baseReport.priority.level || "medium" });
      return json(res, 201, { report: formatReportForClient(created) });
    }

    if (pathname.startsWith("/api/reports/") && pathname.split("/").length === 4 && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = pathname.split("/").pop();
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      // Ownership/RBAC scoping: citizens see only their own reports, workers
      // only reports assigned to their team, staff everything.
      const isStaff = ADMIN_ROLES.includes(auth.user.role);
      const isOwner = report.citizenId === auth.user.uid;
      let isAssignedWorker = false;
      if (!isStaff && !isOwner && auth.user.role === ROLES.CLEANUP_WORKER) {
        isAssignedWorker = (await getAssignedWorkerUids(report)).includes(auth.user.uid);
      }
      if (!isStaff && !isOwner && !isAssignedWorker) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "You do not have access to this report." } });
      }
      return json(res, 200, { report: formatReportForClient(report) });
    }

    if (pathname.match(/^\/api\/reports\/[^/]+$/) && pathname.split("/").length === 4 && req.method === "PUT") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = pathname.split("/").pop();
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      if (report.citizenId !== auth.user.uid && !ADMIN_ROLES.includes(auth.user.role)) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "You can only edit your own reports." } });
      }
      if (report.status !== "submitted") {
        return json(res, 400, { error: { code: "CANNOT_EDIT", message: "Only submitted reports can be edited." } });
      }
      const body = await readJson(req);
      const updates = {};
      if (body.comment !== undefined) updates.citizenComment = String(body.comment || "");
      if (Object.keys(updates).length === 0) return json(res, 400, { error: { code: "VALIDATION", message: "No fields to update." } });
      const updated = await store.updateReport(reportId, updates);
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    if (pathname.match(/^\/api\/reports\/[^/]+$/) && pathname.split("/").length === 4 && req.method === "DELETE") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = pathname.split("/").pop();
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      if (report.citizenId !== auth.user.uid && !ADMIN_ROLES.includes(auth.user.role)) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "You can only delete your own reports." } });
      }
      if (report.status !== "submitted") {
        return json(res, 400, { error: { code: "CANNOT_DELETE", message: "Only submitted reports can be deleted." } });
      }
      const pool = (await import("./db.js")).getPool();
      await pool.query("DELETE FROM reports WHERE id = $1", [reportId]);
      return json(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/reports\/[^/]+\/status$/) && req.method === "PATCH") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = pathname.split("/")[3];
      const body = await readJson(req);
      const nextStatus = body.status;
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      let allowed = ADMIN_ROLES.includes(auth.user.role) || (auth.user.role === ROLES.CITIZEN && [REPORT_STATUSES.REOPENED].includes(nextStatus));
      if (!allowed && auth.user.role === ROLES.CLEANUP_WORKER) {
        // Workers may only transition reports actually assigned to their team.
        if (report.assignedTeamId) {
          allowed = (await getAssignedWorkerUids(report)).includes(auth.user.uid);
        }
      }
      if (!allowed) return json(res, 403, { error: { code: "FORBIDDEN", message: "Not allowed." } });
      if (!validateStatusTransition(report.status, nextStatus)) return json(res, 400, { error: { code: "INVALID_TRANSITION", message: `Cannot transition from ${report.status} to ${nextStatus}.` } });
      const timeline = [...(report.statusTimeline || []), { status: nextStatus, at: nowIso() }];
      const updates = { status: nextStatus, statusTimeline: timeline };
      // Persist the Gemini cleanup verification verdict alongside the report
      // so admins see the advisory without re-running it.
      if (body.aiVerification) updates.aiAfterAnalysis = body.aiVerification;
      if (body.afterImage) {
        const afterMedia = await saveDataUrlMedia(body.afterImage, `cleanup/${reportId}/after`);
        updates["afterMedia.imageUrl"] = afterMedia.url;
        updates["afterMedia.storagePath"] = afterMedia.storagePath;
      }
      const updated0 = await store.updateReport(reportId, updates);
      // Single-submit completion: workers may include notes + actual volume
      // with the status change so the cleanup flow is one round-trip.
      let updated = updated0;
      if (body.workerNotes !== undefined || body.actualVolume !== undefined) {
        const noteUpdates = {};
        if (body.workerNotes !== undefined) noteUpdates.workerNotes = body.workerNotes;
        if (body.actualVolume !== undefined) noteUpdates.actualVolume = body.actualVolume;
        updated = await store.updateWorkerReport(reportId, noteUpdates);
      }
      const statusLabel = nextStatus.replace(/_/g, " ");
      // Live sync: everyone authorized to watch this report + all admins.
      const targets = { roles: [...ADMIN_ROLES], rooms: [`report:${reportId}`] };
      const workerUids = await getAssignedWorkerUids(updated);
      targets.uids = workerUids;
      publish("waste:status:update", { id: reportId, status: nextStatus, updatedAt: updated.updatedAt, teamId: updated.assignedTeamId }, targets);
      notifyUser(report.citizenId, {
        title: `Report ${statusLabel}`,
        body: `${reportId} is now ${statusLabel}.`,
        kind: "status", reportId,
        push: true,
      });
      // Worker-facing notice when an admin moves a case (e.g. reopen).
      if (ADMIN_ROLES.includes(auth.user.role) && workerUids.length) {
        for (const uid of workerUids) {
          if (uid === report.citizenId) continue;
          notifyUser(uid, { title: `Report ${statusLabel}`, body: `${reportId} was updated by dispatch.`, kind: "status", reportId });
        }
      }
      if (nextStatus === REPORT_STATUSES.RESOLVED) {
        publish("feedback:requested", { reportId, citizenId: report.citizenId }, { uids: [report.citizenId] });
        notifyUser(report.citizenId, {
          title: "How clean was the cleanup?",
          body: `Rate the cleanup for ${reportId} to help us improve.`,
          kind: "feedback", reportId,
        });
        const citizen = await store.getUserByUid(report.citizenId);
        if (citizen) reportResolvedEmail({ email: citizen.email, name: citizen.name, reportId });
        dismissForReport(reportId); // auto-dismiss any proximity alert for this task
      }
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    if (pathname === "/api/teams" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const teams = await store.getTeams();
      return json(res, 200, { teams: teams.map(formatTeamForClient) });
    }

    if (pathname === "/api/teams/assign" && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const reportId = String(body.reportId || "");
      const teamId = String(body.teamId || "");
      const before = await store.getReportById(reportId);
      if (!before) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      if (["resolved", "rejected"].includes(before.status)) {
        return json(res, 400, { error: { code: "ALREADY_CLOSED", message: "This report is already closed." } });
      }
      const team = (await store.getTeams()).find((t) => t.id === teamId);
      if (!team) return json(res, 404, { error: { code: "NOT_FOUND", message: "Team not found." } });
      if ((team.memberIds || []).length === 0 && !team.leaderId) {
        return json(res, 400, { error: { code: "EMPTY_TEAM", message: "This team has no workers to assign." } });
      }
      await store.assignTeam(reportId, teamId); // transactional: report -> assigned + team booked
      const report = await store.getReportById(reportId);
      const formatted = formatReportForClient(report);
      // DB is updated — now tell the assigned workers in real time.
      const memberUids = [...new Set([team.leaderId, ...(team.memberIds || [])].filter(Boolean))];
      for (const uid of memberUids) {
        notifyUser(uid, {
          title: "New task assigned",
          body: `${reportId} · ${formatted.address?.slice(0, 80) || "see details"}`,
          kind: "assignment", reportId,
          push: true,
        });
        publish("task:assigned", { reportId, teamId, teamName: team.name, report: formatted, at: nowIso() }, { uids: [uid] });
      }
      notifyUser(report.citizenId, {
        title: "Cleanup team assigned",
        body: `${team.name} is now assigned to ${reportId}.`,
        kind: "info", reportId, push: true,
      });
      publish("waste:updated", { id: reportId, status: report.status, teamId }, { roles: [...ADMIN_ROLES] });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `assigned_team:${teamId}`, reportId });
      return json(res, 200, { report: formatted, team: formatTeamForClient(team) });
    }

    if (pathname === "/api/notifications" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const notifications = await store.getNotifications(auth.user.uid, auth.user.role);
      return json(res, 200, {
        notifications: notifications.map((n) => ({
          id: n.id, title: n.title, body: n.body,
          kind: n.kind || "info", reportId: n.reportId || "",
          isRead: Boolean(n.isRead), time: relativeTimeLabel(n.createdAt), createdAt: n.createdAt,
        })),
        unreadCount: notifications.filter((n) => !n.isRead).length,
      });
    }

    if (pathname === "/api/notifications/read-all" && req.method === "PUT") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const result = await store.markAllNotificationsRead(auth.user.uid);
      publish("notification:read", { uid: auth.user.uid }, { uids: [auth.user.uid] });
      return json(res, 200, { ok: true, ...result });
    }

    if (pathname === "/api/push/subscribe" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const subscription = body.subscription || {};
      const endpoint = String(subscription.endpoint || "");
      const keys = subscription.keys || {};
      if (!endpoint || !keys.p256dh || !keys.auth) {
        return json(res, 400, { error: { code: "VALIDATION", message: "subscription.endpoint and subscription.keys.{p256dh,auth} are required." } });
      }
      await store.savePushSubscription({ userId: auth.user.uid, endpoint, p256dh: String(keys.p256dh), auth: String(keys.auth) });
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/push/unsubscribe" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const endpoint = String(body.endpoint || "");
      if (endpoint) await store.deletePushSubscription(endpoint);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/dashboard" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      runEscalationSweep().catch(() => {});
      const [state, peopleStats, categoryMix, aiHealth] = await Promise.all([
        store.getState(),
        store.getPeopleStats().catch(() => null),
        store.getCategoryMix(6).catch(() => []),
        store.getInferenceStats().catch(() => null),
      ]);
      return json(res, 200, { dashboard: { ...buildDashboard(state), people: peopleStats, categoryMix, ai: aiHealth } });
    }

    if (pathname === "/api/hotspots" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const hotspots = await store.getHotspots();
      return json(res, 200, { hotspots });
    }

    if (pathname === "/api/vehicles" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const vehicles = await store.getVehicles();
      return json(res, 200, { vehicles });
    }

    if (pathname.match(/^\/api\/vehicles\/[^/]+$/) && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const vehicleId = pathname.split("/").pop();
      const vehicle = await store.getVehicleById(vehicleId);
      if (!vehicle) return json(res, 404, { error: { code: "NOT_FOUND", message: "Vehicle not found." } });
      return json(res, 200, { vehicle });
    }

    if (pathname.match(/^\/api\/vehicles\/[^/]+\/location$/) && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const vehicleId = pathname.split("/")[3];
      const { latitude, longitude, label, speedKmh, heading, status } = body;
      if (!latitude || !longitude) return json(res, 400, { error: { code: "VALIDATION", message: "Latitude and longitude are required." } });
      const vehicle = await store.updateVehicleLocation(vehicleId, { latitude, longitude, label, speedKmh, heading, status });
      if (!vehicle) return json(res, 404, { error: { code: "NOT_FOUND", message: "Vehicle not found." } });
      return json(res, 200, { vehicle });
    }

    if (pathname === "/api/reports/all" && req.method === "GET") {
      // Full report list is an operations view — citizens/workers use their
      // role-scoped endpoints instead.
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const state = await store.getState();
      return json(res, 200, { reports: state.reports.map(formatReportForClient) });
    }

    if (pathname === "/api/waste-hotspots" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const state = await store.getState();
      const hotspots = state.reports.filter((r) => r.status !== "resolved" && r.status !== "rejected");
      return json(res, 200, { hotspots: hotspots.map(formatReportForClient) });
    }

    if (pathname === "/api/heartbeat" && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      return json(res, 200, { ok: true, timestamp: nowIso() });
    }

    if (pathname === "/api/citizen/dashboard" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reports = await store.getReportsForUser(auth.user.uid, auth.user.role);
      const notifications = await store.getNotifications(auth.user.uid, auth.user.role);
      const open = reports.filter((r) => r.status !== "resolved" && r.status !== "rejected");
      const resolved = reports.filter((r) => r.status === "resolved");
      const inProgress = reports.filter((r) => ["assigned", "en_route", "in_progress", "cleanup_in_progress"].includes(r.status));
      const urgent = open.filter((r) => r.priority?.level === "critical" || r.priority?.level === "high");
      return json(res, 200, {
        stats: {
          total: reports.length,
          resolved: resolved.length,
          inProgress: inProgress.length,
          urgent: urgent.length,
        },
        recentReports: reports.slice(0, 5).map(formatReportForClient),
        urgentReports: urgent.slice(0, 3).map(formatReportForClient),
        notificationCount: notifications.length,
      });
    }

    if (pathname === "/api/admin/complaints" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      runEscalationSweep().catch(() => {});
      const filters = {
        status: url.searchParams.get("status") || undefined,
        severity: url.searchParams.get("severity") || undefined,
        wardId: url.searchParams.get("wardId") || undefined,
        wasteType: url.searchParams.get("wasteType") || undefined,
        search: url.searchParams.get("search") || undefined,
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
        escalated: url.searchParams.get("escalated") || undefined,
        hazard: url.searchParams.get("hazard") || undefined,
        recyclable: url.searchParams.get("recyclable") || undefined,
        minPriority: url.searchParams.get("minPriority") || undefined,
        sort: url.searchParams.get("sort") || undefined,
        limit: url.searchParams.get("limit") || undefined,
      };
      const reports = await store.getComplaints(filters);
      return json(res, 200, { reports: reports.map(formatReportForClient), total: reports.length });
    }

    const complaintIdMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)$/);
    if (complaintIdMatch && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const report = await store.getReportById(decodeURIComponent(complaintIdMatch[1]));
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      return json(res, 200, { report: formatReportForClient(report) });
    }

    if (complaintIdMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(complaintIdMatch[1]);
      const body = await readJson(req);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      const updates = {};
      if (body.status && validateStatusTransition(report.status, body.status)) {
        updates.status = body.status;
        updates.statusTimeline = [...(report.statusTimeline || []), { status: body.status, at: nowIso() }];
      }
      if (body.adminNotes !== undefined) updates.workerNotes = String(body.adminNotes);
      if (!Object.keys(updates).length) return json(res, 400, { error: { code: "VALIDATION", message: "No valid fields to update." } });
      const updated = await store.updateReport(reportId, updates);
      publish("waste:updated", { id: reportId }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    // ---- Fleet-aware dispatch suggestions: ranks real crews by ward fit,
    // availability, vehicle capability vs volume, live workload and proximity.
    if (pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/dispatch-suggest$/) && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/dispatch-suggest$/)[1]);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      const teams = await store.getTeamsWithLoad();
      const wasteType = report.aiAnalysis?.wasteType || "";
      const volume = report.aiAnalysis?.estimatedVolume || "small";
      const needsHeavyVehicle = ["large", "very_large"].includes(volume);
      const wantsRecycler = Boolean(report.aiAnalysis?.recyclableHeavy) || wasteType === "plastic_waste" || wasteType === "e_waste";
      const wantsDrain = wasteType === "drain_blockage";
      const wantsHazmat = Boolean(report.aiAnalysis?.hazardFlag) || ["hazardous_waste", "e_waste"].includes(wasteType);
      const scored = teams.map((team) => {
        let score = 50;
        const reasons = [];
        if (report.location?.wardId && (team.wardIds || []).includes(report.location.wardId)) {
          score += 20; reasons.push("Covers this ward");
        }
        if (team.status === "available") { score += 15; reasons.push("Available now"); }
        else if ((team.activeTasks || 0) <= 1) { score += 5; reasons.push("Light workload"); }
        score -= Math.min(20, (team.activeTasks || 0) * 5);
        if ((team.activeTasks || 0) > 0) reasons.push(`${team.activeTasks} active task(s)`);
        const vehicleType = String(team.vehicleType || "").toLowerCase();
        const capacity = String(team.vehicleCapacity || "").toLowerCase();
        if (needsHeavyVehicle && /truck|tipper|lorry/.test(vehicleType)) { score += 15; reasons.push("Heavy vehicle for large volume"); }
        else if (needsHeavyVehicle && /large|heavy/.test(capacity)) { score += 10; }
        else if (needsHeavyVehicle) { score -= 8; reasons.push("Small vehicle vs volume"); }
        if (wantsRecycler && /recycl|scrap/.test(`${vehicleType} ${team.name}`.toLowerCase())) { score += 12; reasons.push("Recycling-capable crew"); }
        if (wantsDrain && /drain/.test(team.name.toLowerCase())) { score += 18; reasons.push("Specialised drain unit"); }
        if (wantsHazmat && /hazmat|hazard/.test(team.name.toLowerCase())) { score += 18; reasons.push("Hazmat-trained team"); }
        try {
          if (report.location?.latitude && team.currentLocation?.latitude && team.currentLocation.latitude !== 0) {
            const km = haversineMeters(report.location, team.currentLocation) / 1000;
            score += Math.max(0, 15 - km * 1.5);
            if (km < 3) reasons.push(`Only ${km.toFixed(1)} km away`);
            else reasons.push(`${km.toFixed(1)} km away`);
          }
        } catch {}
        return { team: formatTeamForClient(team), score: Math.round(score), reasons };
      });
      scored.sort((a, b) => b.score - a.score);
      return json(res, 200, { reportId, suggestions: scored.slice(0, 3) });
    }

    const assignMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/assign$/);    if (assignMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(assignMatch[1]);
      const body = await readJson(req);
      const teamId = String(body.teamId || "");
      const team = await store.getTeamById(teamId);
      if (!team) return json(res, 404, { error: { code: "NOT_FOUND", message: "Team not found." } });
      await store.assignTeam(reportId, teamId);
      const report = await store.getReportById(reportId);
      await store.createNotification({ userId: report.citizenId, title: "Cleanup team assigned", body: `${team.name} is now assigned to ${reportId}.`, kind: "assignment", reportId });
      const citizen = await store.getUserByUid(report.citizenId);
      if (citizen) teamAssignedEmail({ email: citizen.email, name: citizen.name, reportId, teamName: team.name });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `assigned_${teamId}_to_${reportId}` });
      publish("waste:updated", { id: reportId, teamId }, { roles: [...ADMIN_ROLES] });
      publish("team:update", { teamId }, { roles: [...ADMIN_ROLES] });
return json(res, 200, { report: formatReportForClient(report), team: formatTeamForClient(team) });
    }

    const escalateMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/escalate$/);
    if (escalateMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(escalateMatch[1]);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      const updated = await store.updateReport(reportId, {
        escalated: true,
        escalatedAt: nowIso(),
        statusTimeline: [...(report.statusTimeline || []), { status: "escalated", at: nowIso() }],
      });
      await store.createNotification({ userId: report.citizenId, title: "Complaint escalated", body: `${reportId} has been escalated for priority action.`, kind: "escalation", reportId });
      await store.createNotification({ userId: "user-admin", title: "Complaint escalated", body: `${auth.user.name} escalated ${reportId}.`, kind: "escalation", reportId });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `escalated_${reportId}` });
      publish("complaint:escalated", { id: reportId }, { roles: [...ADMIN_ROLES] });
      publish("waste:updated", { id: reportId, escalated: true }, { roles: [...ADMIN_ROLES] });
return json(res, 200, { report: formatReportForClient(updated) });
    }

    const markDupMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/duplicate$/);
    if (markDupMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(markDupMatch[1]);
      const body = await readJson(req);
      const primaryReportId = String(body.primaryReportId || "");
      if (primaryReportId === reportId) return json(res, 400, { error: { code: "VALIDATION", message: "A complaint cannot be a duplicate of itself." } });
      const primary = await store.getReportById(primaryReportId);
      if (!primary) return json(res, 404, { error: { code: "NOT_FOUND", message: "Primary complaint not found." } });
      const { report } = await store.markAsDuplicate(reportId, primaryReportId);
      await store.createNotification({ userId: report.citizenId, title: "Merged with existing complaint", body: `${reportId} was merged into ${primaryReportId}. You will get updates on the original complaint.`, kind: "duplicate", reportId: primaryReportId });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `marked_${reportId}_duplicate_of_${primaryReportId}` });
      publish("waste:updated", { id: reportId, duplicateOf: primaryReportId }, { roles: [...ADMIN_ROLES] });
return json(res, 200, { ok: true, report: formatReportForClient(report) });
    }

    const recycleMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/recycle$/);
    if (recycleMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(recycleMatch[1]);
      const body = await readJson(req);
      const partner = String(body.partner || "").trim();
      if (!partner) return json(res, 400, { error: { code: "VALIDATION", message: "Recycling partner is required." } });
      const updated = await store.routeToRecycler(reportId, partner);
      if (!updated) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `routed_${reportId}_to_recycler_${partner}` });
      publish("waste:updated", { id: reportId, recyclingPartner: partner }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    const verifyAiMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/verify-ai$/);
    if (verifyAiMatch && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reportId = decodeURIComponent(verifyAiMatch[1]);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Complaint not found." } });
      if (report.aiAfterAnalysis) return json(res, 200, { analysis: report.aiAfterAnalysis, cached: true });
      if (!report.afterMedia?.imageUrl) {
        return json(res, 400, { error: { code: "NO_AFTER_PHOTO", message: "No after-cleanup photo submitted yet for this complaint." } });
      }
      try {
        // toDataUrlIfLocal reads Postgres blobs directly — relative /uploads/
        // URLs cannot be fetched from inside a serverless function.
        const dataUrl = await toDataUrlIfLocal(report.afterMedia.imageUrl);
        if (!dataUrl) throw new Error("after-photo is not readable");
        const analysis = await aiProvider.analyzeWaste({ image: dataUrl });
        await store.updateReport(reportId, { aiAfterAnalysis: analysis });
        return json(res, 200, { analysis, cached: false });
      } catch (err) {
        console.warn("[AI] After-photo verification failed:", err.message);
        return json(res, 502, { error: { code: "AI_FAILED", message: "After-photo analysis is unavailable right now. Please try again later." } });
      }
    }

    if (pathname === "/api/admin/bulk-assign" && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const teamId = String(body.teamId || "");
      const reportIds = Array.isArray(body.reportIds) ? body.reportIds.filter(Boolean) : [];
      const team = await store.getTeamById(teamId);
      if (!team) return json(res, 404, { error: { code: "NOT_FOUND", message: "Team not found." } });
      if (!reportIds.length) return json(res, 400, { error: { code: "VALIDATION", message: "Select at least one complaint to assign." } });
      const assigned = [];
      for (const reportId of reportIds) {
        try {
          await store.assignTeam(reportId, teamId);
          const report = await store.getReportById(reportId);
          assigned.push(formatReportForClient(report));
          await store.createNotification({ userId: report.citizenId, title: "Cleanup team assigned", body: `${team.name} is now assigned to ${reportId}.`, kind: "assignment", reportId });
        } catch (err) {
          console.warn(`[bulk-assign] Failed for ${reportId}:`, err.message);
        }
      }
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `bulk_assigned_${assigned.length}_reports_to_${teamId}` });
      if (assigned.length) {
        publish("waste:updated", { ids: reportIds, teamId }, { roles: [...ADMIN_ROLES] });
        publish("team:update", { teamId }, { roles: [...ADMIN_ROLES] });
      }
return json(res, 200, { assignedCount: assigned.length, reports: assigned, team: formatTeamForClient(team) });
    }

    if (pathname === "/api/admin/hotspots" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const cells = await store.getHotspotCells();
      return json(res, 200, { cells });
    }

    if (pathname === "/api/admin/alerts" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 40));
      const alerts = await store.getAdminAlerts(limit);
      return json(res, 200, { alerts });
    }

    if (pathname === "/api/admin/teams" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const teams = await store.getTeamsWithLoad();
      return json(res, 200, { teams: teams.map((t) => ({ ...formatTeamForClient(t), activeTasks: t.activeTasks, completedTasks: t.completedTasks })) });
    }

    if (pathname === "/api/admin/teams" && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      if (!name) return json(res, 400, { error: { code: "VALIDATION", message: "Team name is required." } });
      const team = await store.createTeam({
        name,
        leaderId: body.leaderId || "",
        memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
        wardIds: Array.isArray(body.wardIds) ? body.wardIds : [],
        vehicleType: body.vehicleType || "",
        vehicleCapacity: body.vehicleCapacity || "",
        status: ["available", "assigned", "en_route", "off_duty"].includes(body.status) ? body.status : "available",
      });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `created_team_${team.id}` });
      publish("team:update", { teamId: team.id }, { roles: [...ADMIN_ROLES] });
      return json(res, 201, { team: formatTeamForClient(team) });
    }

    const adminTeamMatch = pathname.match(/^\/api\/admin\/teams\/([^/]+)$/);
    if (adminTeamMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const teamId = decodeURIComponent(adminTeamMatch[1]);
      const body = await readJson(req);
      const updates = {};
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.leaderId !== undefined) updates.leaderId = body.leaderId;
      if (Array.isArray(body.memberIds)) updates.memberIds = body.memberIds;
      if (Array.isArray(body.wardIds)) updates.wardIds = body.wardIds;
      if (body.vehicleType !== undefined) updates.vehicleType = body.vehicleType;
      if (body.vehicleCapacity !== undefined) updates.vehicleCapacity = body.vehicleCapacity;
      if (body.status && ["available", "assigned", "en_route", "off_duty"].includes(body.status)) updates.status = body.status;
      if (!Object.keys(updates).length) return json(res, 400, { error: { code: "VALIDATION", message: "No valid fields to update." } });
      const team = await store.updateTeam(teamId, updates);
      if (!team) return json(res, 404, { error: { code: "NOT_FOUND", message: "Team not found." } });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `updated_team_${teamId}` });
      publish("team:update", { teamId }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, { team: formatTeamForClient(team) });
    }

    if (adminTeamMatch && req.method === "DELETE") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const teamId = decodeURIComponent(adminTeamMatch[1]);
      const existing = await store.getTeamById(teamId);
      if (!existing) return json(res, 404, { error: { code: "NOT_FOUND", message: "Team not found." } });
      await store.deleteTeam(teamId);
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `deleted_team_${teamId}` });
      publish("team:deleted", { teamId }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/duplicates/dismiss" && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const groupId = String(body.groupId || "");
      if (!groupId) return json(res, 400, { error: { code: "VALIDATION", message: "Duplicate group id is required." } });
      const result = await store.dismissDuplicateGroup(groupId);
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `dismissed_duplicate_group_${groupId}` });
      publish("waste:updated", { dismissedGroup: groupId }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, result);
    }

    if (pathname === "/api/admin/users" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const users = await store.getAllUsers();
      return json(res, 200, { users: users.map(sanitizeUser) });
    }

    if (pathname.match(/^\/api\/admin\/users\/[^/]+$/) && req.method === "PUT") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const uid = pathname.split("/").pop();
      const body = await readJson(req);
      const updates = {};
      // Privilege hygiene: only super_admin may grant/modify privileged roles.
      // Regular admins are limited to non-privileged roles.
      if (body.role) {
        const PRIVILEGED = ["admin", "super_admin", "ward_officer", "sanitation_supervisor"];
        const target = String(body.role);
        if (PRIVILEGED.includes(target) && auth.user.role !== "super_admin") {
          return json(res, 403, { error: { code: "FORBIDDEN", message: "Only a super admin can grant privileged roles." } });
        }
        updates.role = target;
      }
      if (body.isActive !== undefined) updates.is_active = body.isActive;
      if (body.wardId) updates.ward_id = body.wardId;
      const updated = await store.updateUserProfile(uid, updates);
      return json(res, 200, { user: sanitizeUser(updated) });
    }

    if (pathname === "/api/admin/verification-queue" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const reports = await store.getVerificationQueue();
      return json(res, 200, { reports: reports.map(formatReportForClient) });
    }

    if (pathname === "/api/admin/duplicates" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const groups = await store.getDuplicateGroups();
      return json(res, 200, { groups: groups.map((g) => ({ ...g, reports: g.reports.map(formatReportForClient) })) });
    }

    if (pathname === "/api/admin/duplicates/merge" && req.method === "POST") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const body = await readJson(req);
      const result = await store.mergeDuplicates(body.groupId, body.keepId);
      const kept = await store.getReportById(body.keepId);
      const mergedReports = await store.getComplaints({ status: "duplicate" });
      for (const r of mergedReports.filter((r) => r.duplicate?.primaryReportId === body.keepId)) {
        await store.createNotification({ userId: r.citizenId, title: "Merged with existing complaint", body: `${r.id} was confirmed as a duplicate of ${body.keepId}.`, kind: "duplicate", reportId: body.keepId });
      }
      publish("waste:updated", { mergedGroup: body.groupId, keepId: body.keepId }, { roles: [...ADMIN_ROLES] });
      return json(res, 200, result);
    }

    if (pathname === "/api/admin/analytics" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      runEscalationSweep().catch(() => {});
      const [analytics, aiHealth, peopleStats, categoryMix] = await Promise.all([
        store.getAnalytics(),
        store.getInferenceStats().catch(() => null),
        store.getPeopleStats().catch(() => null),
        store.getCategoryMix(6).catch(() => []),
      ]);
      return json(res, 200, { analytics: { ...analytics, ai: aiHealth, people: peopleStats, categoryMix } });
    }

    if (pathname === "/api/admin/activity-logs" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const logs = await store.getActivityLogs();
      return json(res, 200, { logs });
    }

    if (pathname === "/api/admin/workers" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const workers = await store.getWorkerStats();
      const teams = await store.getTeams();
      return json(res, 200, { workers: workers.map((w) => {
        const team = teams.find(t => t.leaderId === w.uid || t.memberIds.includes(w.uid));
        return { ...sanitizeUser(w), completedTasks: w.completedTasks, activeTasks: w.activeTasks, totalTasks: w.totalTasks, teamName: team?.name || null, teamId: team?.id || null };
      }) });
    }

    const workerDutyMatch = pathname.match(/^\/api\/admin\/workers\/([^/]+)\/duty$/);
    if (workerDutyMatch && req.method === "PATCH") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const uid = decodeURIComponent(workerDutyMatch[1]);
      const body = await readJson(req);
      const dutyStatus = body.dutyStatus === "on_duty" ? "on_duty" : "off_duty";
      const updated = await store.toggleDutyStatus(uid, dutyStatus);
      if (!updated) return json(res, 404, { error: { code: "NOT_FOUND", message: "Worker not found." } });
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `admin_toggled_duty_${dutyStatus}` });
      return json(res, 200, { user: sanitizeUser(updated) });
    }

    if (pathname === "/api/worker/tasks" && req.method === "GET") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const tasks = await store.getWorkerTasks(auth.user.uid);
      const user = await store.getUserByUid(auth.user.uid);
      return json(res, 200, { tasks: tasks.map(formatReportForClient), dutyStatus: user?.dutyStatus || "off_duty" });
    }

    if (pathname === "/api/worker/stats" && req.method === "GET") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const summary = await store.getWorkerSummary(auth.user.uid);
      return json(res, 200, { stats: summary });
    }

    if (pathname === "/api/worker/history" && req.method === "GET") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const tasks = await store.getWorkerHistory(auth.user.uid);
      return json(res, 200, { tasks: tasks.map(formatReportForClient) });
    }

    if (pathname === "/api/worker/duty" && req.method === "PUT") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      const dutyStatus = body.dutyStatus === "on_duty" ? "on_duty" : "off_duty";
      const updated = await store.toggleDutyStatus(auth.user.uid, dutyStatus);
      return json(res, 200, { user: sanitizeUser(updated) });
    }

    if (pathname === "/api/worker/report-notes" && req.method === "PUT") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      const reportId = body.reportId;
      const report = reportId ? await store.getReportById(String(reportId)) : null;
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      // Authorization: notes only on reports assigned to the worker's team.
      if (!(await getAssignedWorkerUids(report)).includes(auth.user.uid)) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "This report is not assigned to you." } });
      }
      const updates = {};
      if (body.workerNotes !== undefined) updates.workerNotes = body.workerNotes;
      if (body.actualVolume !== undefined) updates.actualVolume = body.actualVolume;
      const updated = await store.updateWorkerReport(reportId, updates);
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    if (pathname === "/api/worker/report-issue" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      const { reportId, reason } = body;
      if (!reportId || !reason) return json(res, 400, { error: { code: "VALIDATION", message: "reportId and reason are required." } });
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      // Authorization: the worker may only flag reports assigned to their team.
      const workerUids = await getAssignedWorkerUids(report);
      if (!workerUids.includes(auth.user.uid)) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "This report is not assigned to you." } });
      }
      const updated = await store.updateWorkerReport(reportId, { rejectionReason: reason });
      publish("complaint:escalated", { id: reportId, reason }, { roles: [...ADMIN_ROLES] });
      const adminUids = await getAdminUids();
      for (const uid of adminUids) {
        notifyUser(uid, {
          title: "Worker flagged issue",
          body: `${auth.user.name} flagged ${reportId}: ${String(reason).slice(0, 120)}`,
          kind: "escalation", reportId,
        });
      }
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    // ---- Worker location pings: persist last-known position + live map feed ----
    if (pathname === "/api/worker/location" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const body = await readJson(req);
      const latitude = Number(body.latitude), longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return json(res, 400, { error: { code: "VALIDATION", message: "latitude and longitude are required." } });
      }
      // Throttle DB writes (~1/minute/worker) — GPS fires far more often.
      const now = Date.now();
      const last = LOCATION_WRITE_TS.get(auth.user.uid) || 0;
      if (now - last > 60_000) {
        LOCATION_WRITE_TS.set(auth.user.uid, now);
        store.saveWorkerLocation(auth.user.uid, latitude, longitude).catch((err) =>
          console.error("[worker-location] persist failed:", err?.message));
      }
      // Live dispatch-map update for admins only — never broadcast publicly.
      publish("worker:location", { workerId: auth.user.uid, name: auth.user.name, latitude, longitude, at: nowIso() }, { roles: [...ADMIN_ROLES] });
      const tasks = await store.getWorkerTasks(auth.user.uid); // open assigned tasks only
      const { raised } = updateWorkerLocation(auth.user.uid, { latitude, longitude }, tasks.map((t) => ({
        id: t.id,
        latitude: t.location?.latitude,
        longitude: t.location?.longitude,
        wasteType: t.aiAnalysis?.wasteType,
        address: t.location?.address,
        severity: t.aiAnalysis?.severity,
      })));
      for (const alert of raised) {
        publish("worker:proximity", { workerId: auth.user.uid, ...alert }, { roles: [...ADMIN_ROLES] });
      }
      return json(res, 200, { ok: true, raised, activeAlerts: getProximityAlerts(auth.user.uid).length });
    }

    // ---- Nearby available workers for manual dispatch ----
    if (pathname === "/api/admin/workers/nearby" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const q = url.searchParams;
      const latitude = Number(q.get("latitude")), longitude = Number(q.get("longitude"));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return json(res, 400, { error: { code: "VALIDATION", message: "latitude and longitude query params are required." } });
      }
      const maxKm = Number(q.get("maxKm")) || 10;
      const nearby = await store.getNearbyWorkers(latitude, longitude, maxKm);
      const stats = await store.getWorkerStats();
      const statByUid = new Map(stats.map((s) => [s.uid, s]));
      return json(res, 200, {
        workers: nearby.map((w) => {
          const s = statByUid.get(w.uid) || {};
          const activeTasks = Number(s.activeTasks) || 0;
          return {
            uid: w.uid,
            name: w.name,
            distanceKm: w.distanceKm,
            dutyStatus: w.dutyStatus,
            activeTasks,
            completedTasks: Number(s.completedTasks) || 0,
            // Assignable = on duty and not overloaded.
            available: w.dutyStatus === "on_duty" && activeTasks < 3,
            lastLocationAt: w.currentLocation?.at || null,
          };
        }),
      });
    }

    // ---- Citizen feedback (post-resolution quality rating) ----
    const feedbackMatch = pathname.match(/^\/api\/reports\/([^/]+)\/feedback$/);
    if (feedbackMatch && req.method === "POST") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = decodeURIComponent(feedbackMatch[1]);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      if (report.citizenId !== auth.user.uid) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "Only the reporting citizen can leave feedback." } });
      }
      if (report.status !== REPORT_STATUSES.RESOLVED) {
        return json(res, 400, { error: { code: "NOT_COMPLETED", message: "Feedback opens once the cleanup is completed." } });
      }
      if (report.feedbackRating != null) {
        return json(res, 409, { error: { code: "ALREADY_FEEDBACK", message: "Feedback was already submitted for this report." } });
      }
      const body = await readJson(req);
      const rating = Math.round(Number(body.rating));
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json(res, 400, { error: { code: "VALIDATION", message: "Rating must be an integer from 1 to 5." } });
      }
      const comment = String(body.comment || "").slice(0, 1000);
      const updated = await store.updateReport(reportId, {
        feedbackRating: rating,
        feedbackComment: comment,
        feedbackAt: nowIso(),
      });
      publish("feedback:submitted", { reportId, rating }, { roles: [...ADMIN_ROLES] });
      const adminUids = await getAdminUids();
      for (const uid of adminUids) {
        notifyUser(uid, {
          title: `Citizen rated ${reportId}`,
          body: `${rating}/5${comment ? ` · "${comment.slice(0, 60)}"` : ""}`,
          kind: "feedback", reportId,
        });
      }
      // Close the loop: the cleanup crew sees the citizen's rating in real time.
      const ratedWorkerUids = await getAssignedWorkerUids(updated);
      publish("feedback:submitted", { reportId, rating }, { uids: ratedWorkerUids });
      for (const uid of ratedWorkerUids) {
        notifyUser(uid, {
          title: rating >= 4 ? "Great work — citizen loved it!" : "Citizen rated your cleanup",
          body: `${reportId} · ${rating}/5${comment ? ` · "${comment.slice(0, 60)}"` : ""}`,
          kind: "feedback", reportId,
        });
      }
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    if (feedbackMatch && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = decodeURIComponent(feedbackMatch[1]);
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
      const isOwner = report.citizenId === auth.user.uid;
      if (!isOwner && !ADMIN_ROLES.includes(auth.user.role)) {
        return json(res, 403, { error: { code: "FORBIDDEN", message: "Not allowed." } });
      }
      return json(res, 200, { feedback: { rating: report.feedbackRating, comment: report.feedbackComment, at: report.feedbackAt } });
    }

    if (pathname === "/api/worker/proximity-alerts" && req.method === "GET") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      return json(res, 200, { alerts: getProximityAlerts(auth.user.uid) });
    }

    const proximityDismissMatch = pathname.match(/^\/api\/worker\/proximity-alerts\/([^/]+)\/dismiss$/);
    if (proximityDismissMatch && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const reportId = decodeURIComponent(proximityDismissMatch[1]);
      const removed = dismissProximityAlert(auth.user.uid, reportId);
      return json(res, 200, { ok: true, removed });
    }

    if (pathname === "/api/worker/proximity-alerts/dismiss-all" && req.method === "POST") {
      const auth = await requireRoles(req, res, [ROLES.CLEANUP_WORKER]);
      if (!auth) return;
      const removed = dismissAllProximityAlerts(auth.user.uid);
      return json(res, 200, { ok: true, removed });
    }

    return json(res, 404, { error: { code: "NOT_FOUND", message: "Endpoint not found." } });
  } catch (error) {
    console.error("API Error:", error);
    return json(res, 500, { error: { code: "SERVER_ERROR", message: error.message || "Internal server error." } });
  }
}
