import { ROLES, ADMIN_ROLES, REPORT_STATUSES, PRIORITY_WEIGHTS } from "./constants.js";
import { getAIProvider, MockAIProvider } from "./ai/provider.js";
import { store } from "./store.js";
import { publish } from "./events.js";
import {
  calculatePriority,
  createId,
  createPasswordHash,
  createSessionToken,
  formatReportForClient,
  formatTeamForClient,
  haversineMeters,
  nowIso,
  passwordMatches,
  relativeTimeLabel,
  sanitizeUser,
  saveDataUrlMedia,
  validateStatusTransition,
} from "./utils.js";

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

async function findDuplicateMatch(incoming) {
  const state = await store.getState();
  const lookbackMs = 1000 * 60 * 60 * 48;
  const candidates = state.reports.filter((report) => {
    const reportAgeMs = Date.now() - new Date(report.createdAt).getTime();
    if (reportAgeMs > lookbackMs) return false;
    if (!report.location?.latitude || !incoming.location?.latitude) return false;
    const dist = haversineMeters(report.location, incoming.location);
    return dist <= 700 && report.aiAnalysis?.wasteType === incoming.aiAnalysis?.wasteType;
  });
  if (!candidates.length) return { isPotentialDuplicate: false, primaryReportId: null, similarityScore: 0.14, distanceMeters: 0 };
  const match = candidates.map((r) => ({ r, d: Math.round(haversineMeters(r.location, incoming.location)) })).sort((a, b) => a.d - b.d)[0];
  return { isPotentialDuplicate: true, primaryReportId: match.r.id, similarityScore: Number(Math.min(0.92, 0.35 + (700 - match.d) / 1000).toFixed(2)), distanceMeters: match.d };
}

function buildDashboard(state) {
  const reports = state.reports;
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

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return json(res, 200, { ok: true, mode: "neon-db", date: new Date().toISOString() });
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      return json(res, 200, { currentUser: sanitizeUser(auth.user), role: auth.user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/signup" && req.method === "POST") {
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const phone = String(body.phone || "").trim();
      const role = body.role || "citizen";
      if (!name || !email || !password) return json(res, 400, { error: { code: "VALIDATION", message: "Name, email, and password are required." } });
      if (password.length < 6) return json(res, 400, { error: { code: "WEAK_PASSWORD", message: "Password must be at least 6 characters." } });
      const existing = await store.getUserByEmail(email);
      if (existing) return json(res, 409, { error: { code: "ACCOUNT_EXISTS", message: "An account with this email already exists." } });
      const uid = createId("user");
      const { salt, passwordHash } = await createPasswordHash(password);
      const user = await store.createUser({ uid, name, email, phone, passwordHash, salt, role });
      const token = createSessionToken();
      await store.createSession(token, uid);
      return json(res, 201, { sessionToken: token, currentUser: sanitizeUser(user), role: user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
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
      if (!user) {
        const uid = createId("user");
        const { passwordHash, salt } = await createPasswordHash("google-oauth-" + uid);
        user = await store.createUser({ uid, name, email, phone: "", passwordHash, salt, role: requestedRole, photoUrl: avatar });
      } else {
        const updates = {};
        if (user.role !== requestedRole) updates.role = requestedRole;
        if (user.name !== name) updates.name = name;
        if (avatar && user.photoURL !== avatar) updates.photo_url = avatar;
        if (Object.keys(updates).length > 0) {
          user = await store.updateUserProfile(user.uid, updates);
        }
      }

      const token = createSessionToken();
      await store.createSession(token, user.uid);
      return json(res, 200, { sessionToken: token, currentUser: sanitizeUser(user), role: user.role, isAuthenticated: true, loading: false, error: "" });
    }

    if (pathname === "/api/auth/reset-password" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const user = await store.getUserByEmail(email);
      if (!user) return json(res, 404, { error: { code: "NOT_FOUND", message: "We could not find an account with that email." } });
      const pool = (await import("./db.js")).getPool();
      const accRes = await pool.query("SELECT password_hash FROM users WHERE uid = $1", [user.uid]);
      const acc = accRes.rows[0];
      if (acc && acc.password_hash.startsWith("google-oauth-")) {
        return json(res, 400, { error: { code: "GOOGLE_ACCOUNT", message: "This account uses Google sign-in. Please sign in with Google instead." } });
      }
      return json(res, 200, { message: `A password reset link has been prepared for ${email}.` });
    }

    if (pathname === "/api/auth/profile" && req.method === "PUT") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = await readJson(req);
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name) return json(res, 400, { error: { code: "VALIDATION", message: "Name is required." } });
      const updates = { name };
      if (phone) updates.phone = phone;
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
      if (newPassword.length < 6) return json(res, 400, { error: { code: "WEAK_PASSWORD", message: "New password must be at least 6 characters." } });
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
      let analysis;
      try {
        analysis = await aiProvider.analyzeWaste(body);
      } catch (aiErr) {
        console.warn("[AI] Primary provider failed, using fallback:", aiErr.message);
        try {
          const fallback = new MockAIProvider();
          analysis = await fallback.analyzeWaste(body);
        } catch (fallbackErr) {
          console.error("[AI] Fallback also failed:", fallbackErr.message);
          return json(res, 500, { error: { code: "AI_FAILED", message: "Analysis could not be completed. Please try again." } });
        }
      }
      const duplicate = await findDuplicateMatch({ location: body.location || null, aiAnalysis: analysis });
      const priority = calculatePriority(analysis, { address: body.location?.address || "", duplicateSupportCount: duplicate.isPotentialDuplicate ? 1 : 0, ageHours: 0 });
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
          processingTime: analysis.processingTime || null,
          models: analysis.models || null,
        },
        duplicateMatch: duplicate.isPotentialDuplicate ? { reportId: duplicate.primaryReportId, distance: `${duplicate.distanceMeters}m away`, status: "Possible duplicate" } : null,
      });
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
      if (payload.image && payload.image.length > 8 * 1024 * 1024) {
        return json(res, 400, { error: { code: "IMAGE_TOO_LARGE", message: "Image is too large. Please capture a smaller photo." } });
      }
      const reportId = `REP-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const beforeMedia = saveDataUrlMedia(payload.image, `reports/${auth.user.uid}/${reportId}/before`);
      const videoMedia = saveDataUrlMedia(payload.video, `reports/${auth.user.uid}/${reportId}/before-video`);
      const aiAnalysis = { wasteType: payload.aiResult.wasteType, confidence: Math.round(Number(payload.aiResult.confidence) || 0), estimatedVolume: payload.aiResult.estimatedVolume, estimatedVolumeRange: payload.aiResult.estimatedVolumeRange, severity: payload.aiResult.severity, potentialRisks: String(payload.aiResult.potentialRisk || "").split(",").map((s) => s.trim()).filter(Boolean), recommendation: payload.aiResult.recommendation };

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
        priority: calculatePriority(aiAnalysis, { address: payload.location.address || "", duplicateSupportCount: 0, ageHours: 0 }),
        duplicate: { isPotentialDuplicate: false, primaryReportId: null, similarityScore: 0, distanceMeters: 0 },
        status: REPORT_STATUSES.SUBMITTED, statusTimeline: [{ status: REPORT_STATUSES.SUBMITTED, at: nowIso() }],
      };
      const dup = await findDuplicateMatch(baseReport);
      baseReport.duplicate = dup;
      if (dup.isPotentialDuplicate) baseReport.priority = calculatePriority(aiAnalysis, { address: payload.location.address || "", duplicateSupportCount: 1, ageHours: 0 });
      const created = await store.createReport(baseReport);
      await store.createNotification({ userId: auth.user.uid, title: "Report submitted", body: `${reportId} is now in the AI review queue.` });
      await store.createNotification({ userId: "user-admin", title: "New complaint received", body: `${reportId} needs municipal review.` });
      publish("waste:new", { id: reportId, wardId: baseReport.location.wardId });
      return json(res, 201, { report: formatReportForClient(created) });
    }

    if (pathname.startsWith("/api/reports/") && pathname.split("/").length === 4 && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const reportId = pathname.split("/").pop();
      const report = await store.getReportById(reportId);
      if (!report) return json(res, 404, { error: { code: "NOT_FOUND", message: "Report not found." } });
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
      const allowed = ADMIN_ROLES.includes(auth.user.role) || (auth.user.role === ROLES.CLEANUP_WORKER && report.assignedTeamId) || (auth.user.role === ROLES.CITIZEN && [REPORT_STATUSES.REOPENED].includes(nextStatus));
      if (!allowed) return json(res, 403, { error: { code: "FORBIDDEN", message: "Not allowed." } });
      if (!validateStatusTransition(report.status, nextStatus)) return json(res, 400, { error: { code: "INVALID_TRANSITION", message: `Cannot transition from ${report.status} to ${nextStatus}.` } });
      const timeline = [...(report.statusTimeline || []), { status: nextStatus, at: nowIso() }];
      const updates = { status: nextStatus, statusTimeline: timeline };
      if (body.afterImage) {
        const afterMedia = saveDataUrlMedia(body.afterImage, `cleanup/${reportId}/after`);
        updates["afterMedia.imageUrl"] = afterMedia.url;
        updates["afterMedia.storagePath"] = afterMedia.storagePath;
      }
      const updated = await store.updateReport(reportId, updates);
      await store.createNotification({ userId: report.citizenId, title: `Report ${nextStatus.replace(/_/g, " ")}`, body: `${reportId} is now ${nextStatus.replace(/_/g, " ")}.` });
      publish("waste:status:update", { id: reportId, status: nextStatus });
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
      await store.assignTeam(reportId, teamId);
      const report = await store.getReportById(reportId);
      const teams = await store.getTeams();
      const team = teams.find((t) => t.id === teamId);
      await store.createNotification({ userId: report.citizenId, title: "Cleanup team assigned", body: `${team?.name || teamId} is now assigned to ${reportId}.` });
      return json(res, 200, { report: formatReportForClient(report), team: team ? formatTeamForClient(team) : null });
    }

    if (pathname === "/api/notifications" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const notifications = await store.getNotifications(auth.user.uid, auth.user.role);
      return json(res, 200, { notifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, time: relativeTimeLabel(n.createdAt) })) });
    }

    if (pathname === "/api/admin/dashboard" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const state = await store.getState();
      return json(res, 200, { dashboard: buildDashboard(state) });
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
      const body = await readJson(req);
      const vehicleId = pathname.split("/")[3];
      const { latitude, longitude, label, speedKmh, heading, status } = body;
      if (!latitude || !longitude) return json(res, 400, { error: { code: "VALIDATION", message: "Latitude and longitude are required." } });
      const vehicle = await store.updateVehicleLocation(vehicleId, { latitude, longitude, label, speedKmh, heading, status });
      if (!vehicle) return json(res, 404, { error: { code: "NOT_FOUND", message: "Vehicle not found." } });
      return json(res, 200, { vehicle });
    }

    if (pathname === "/api/reports/all" && req.method === "GET") {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const state = await store.getState();
      return json(res, 200, { reports: state.reports.map(formatReportForClient) });
    }

    if (pathname === "/api/waste-hotspots" && req.method === "GET") {
      const auth = await requireAuth(req, res);
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
      publish("waste:updated", { id: reportId });
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    const assignMatch = pathname.match(/^\/api\/admin\/complaints\/([^/]+)\/assign$/);
    if (assignMatch && req.method === "PATCH") {
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
      await store.logActivity({ actor: auth.user.uid, role: auth.user.role, action: `assigned_${teamId}_to_${reportId}` });
      publish("waste:updated", { id: reportId, teamId });
      publish("team:update", { teamId });
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
      publish("complaint:escalated", { id: reportId });
      publish("waste:updated", { id: reportId, escalated: true });
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
      publish("waste:updated", { id: reportId, duplicateOf: primaryReportId });
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
      publish("waste:updated", { id: reportId, recyclingPartner: partner });
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
        const imgRes = await fetch(report.afterMedia.imageUrl);
        if (!imgRes.ok) throw new Error(`image fetch failed (${imgRes.status})`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get("content-type") || "image/jpeg";
        const analysis = await aiProvider.analyzeWaste({ image: `data:${mime};base64,${buf.toString("base64")}` });
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
        publish("waste:updated", { ids: reportIds, teamId });
        publish("team:update", { teamId });
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
      publish("team:update", { teamId: team.id });
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
      publish("team:update", { teamId });
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
      publish("team:deleted", { teamId });
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
      publish("waste:updated", { dismissedGroup: groupId });
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
      if (body.role) updates.role = body.role;
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
      publish("waste:updated", { mergedGroup: body.groupId, keepId: body.keepId });
      return json(res, 200, result);
    }

    if (pathname === "/api/admin/analytics" && req.method === "GET") {
      const auth = await requireRoles(req, res, ADMIN_ROLES);
      if (!auth) return;
      const analytics = await store.getAnalytics();
      return json(res, 200, { analytics });
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
      const updated = await store.updateWorkerReport(reportId, { rejectionReason: reason });
      await store.createNotification({ userId: "user-admin", title: "Worker flagged issue", body: `Worker ${auth.user.name} flagged ${reportId}: ${reason}` });
      return json(res, 200, { report: formatReportForClient(updated) });
    }

    return json(res, 404, { error: { code: "NOT_FOUND", message: "Endpoint not found." } });
  } catch (error) {
    console.error("API Error:", error);
    return json(res, 500, { error: { code: "SERVER_ERROR", message: error.message || "Internal server error." } });
  }
}
