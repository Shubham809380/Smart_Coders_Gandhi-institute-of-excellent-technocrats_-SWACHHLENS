import { randomBytes, createHash } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";
import { existsSync, statSync, createReadStream, constants as fsConstants, accessSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { PRIORITY_WEIGHTS, REPORT_STATUSES } from "./constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveUploadsRoot() {
  const repoRoot = join(__dirname, "uploads");
  try {
    accessSync(repoRoot, fsConstants.W_OK);
    return repoRoot;
  } catch {}
  return join(tmpdir(), "swachhlens-uploads");
}

export { resolveUploadsRoot };

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSessionToken() {
  return randomBytes(24).toString("hex");
}

// Cryptographically secure, URL-safe single-use reset token (sent to user).
export function createResetToken() {
  return randomBytes(32).toString("base64url");
}

// Only the SHA-256 hash of the token is ever stored in the database.
export function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

const BCRYPT_ROUNDS = 10;

export async function createPasswordHash(password) {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  const passwordHash = await bcrypt.hash(password, salt);
  return { salt, passwordHash };
}

export async function passwordMatches(account, password) {
  if (account.passwordHash.startsWith("seed:")) return account.passwordHash === `seed:${password}`;
  return bcrypt.compare(password, account.passwordHash);
}

export function sanitizeUser(profile) {
  if (!profile) return null;
  const { uid, name, email, phone, role, wardId, isActive, language, locationName, photo_url, photoURL, dutyStatus, createdAt, updatedAt } = profile;
  return { uid, name, email, phone, role, wardId, isActive, language, locationName, photoURL: photo_url || photoURL || null, dutyStatus: dutyStatus || "off_duty", createdAt, updatedAt };
}

export function relativeTimeLabel(dateString) {
  const diff = Math.max(1, Math.round((Date.now() - new Date(dateString).getTime()) / 60000));
  if (diff < 60) return `${diff} min ago`;
  const hours = Math.round(diff / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day ago`;
}

export function haversineMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const base = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(base));
}

export function priorityLevel(score) {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function calculatePriority(analysis, context = {}) {
  let score = 0;
  const reasons = [];
  score += PRIORITY_WEIGHTS.volume[analysis.estimatedVolume] || 0;
  score += PRIORITY_WEIGHTS.severity[analysis.severity] || 0;
  if (["hazardous_waste", "e_waste"].includes(analysis.wasteType)) {
    score += PRIORITY_WEIGHTS.hazardousWaste;
    reasons.push("Hazardous waste detected");
  }
  if (analysis.wasteType === "drain_blockage") {
    score += PRIORITY_WEIGHTS.drainBlockage;
    reasons.push("Drain blockage risk");
  }
  if (context.address?.toLowerCase().includes("hospital")) {
    score += PRIORITY_WEIGHTS.hospitalNearby;
    reasons.push("Hospital nearby");
  }
  if (context.address?.toLowerCase().includes("school")) {
    score += PRIORITY_WEIGHTS.schoolNearby;
    reasons.push("School nearby");
  }
  if ((analysis.potentialRisks || []).some((risk) => /road|pedestrian|obstruction/i.test(risk))) {
    score += PRIORITY_WEIGHTS.roadObstruction;
    reasons.push("Road or pedestrian obstruction");
  }
  if ((context.duplicateSupportCount || 0) > 0) {
    score += PRIORITY_WEIGHTS.duplicateSupport;
    reasons.push("Multiple nearby reports");
  }
  if (context.ageHours >= 24) {
    score += PRIORITY_WEIGHTS.ageOver24Hours;
    reasons.push("Complaint aging beyond 24 hours");
  }
  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, level: priorityLevel(clamped), reasons: [...new Set(reasons)] };
}

function ageBonusHours(ageHours) {
  if (ageHours < 24) return 0;
  return Math.min(14, PRIORITY_WEIGHTS.ageOver24Hours + Math.max(0, Math.floor(ageHours / 24) - 1) * 2);
}

// Recomputes the full priority breakdown from persisted AI/state data plus the
// live age of the complaint, so every factor in the score stays auditable.
export function computePriorityBreakdown(report) {
  const analysis = report.aiAnalysis || {};
  const address = String(report.location?.address || "").toLowerCase();
  const ageHours = Math.max(0, (Date.now() - new Date(report.createdAt).getTime()) / 3600000);
  const duplicateSupport = (report.duplicate?.isPotentialDuplicate ? 1 : 0) + (report.duplicateSupportCount || 0);

  const volumePoints = PRIORITY_WEIGHTS.volume[analysis.estimatedVolume] || 0;
  const severityPoints = PRIORITY_WEIGHTS.severity[analysis.severity] || 0;
  const hazardActive = ["hazardous_waste", "e_waste"].includes(analysis.wasteType) || analysis.wasteType === "drain_blockage";
  const hazardPoints = hazardActive ? (analysis.wasteType === "drain_blockage" ? PRIORITY_WEIGHTS.drainBlockage : PRIORITY_WEIGHTS.hazardousWaste) : 0;
  const hospitalNearby = address.includes("hospital");
  const schoolNearby = address.includes("school");
  const sensitivityPoints = (hospitalNearby ? PRIORITY_WEIGHTS.hospitalNearby : 0) + (schoolNearby ? PRIORITY_WEIGHTS.schoolNearby : 0);
  const roadObstruction = (analysis.potentialRisks || []).some((risk) => /road|pedestrian|obstruction/i.test(risk));
  const roadPoints = roadObstruction ? PRIORITY_WEIGHTS.roadObstruction : 0;
  const frequencyPoints = duplicateSupport > 0 ? PRIORITY_WEIGHTS.duplicateSupport : 0;
  const agePoints = ageBonusHours(ageHours);

  const base = volumePoints + severityPoints + hazardPoints + sensitivityPoints + roadPoints + frequencyPoints;
  const escalationBonus = report.escalated ? 10 : 0;
  const score = Math.max(0, Math.min(100, base + agePoints + escalationBonus));

  return {
    score,
    level: priorityLevel(score),
    ageHours: Number(ageHours.toFixed(1)),
    components: [
      { key: "volume", label: `Volume (${analysis.estimatedVolume || "unknown"})`, points: volumePoints },
      { key: "severity", label: `AI severity (${analysis.severity || "unknown"})`, points: severityPoints },
      { key: "hazard", label: analysis.wasteType === "drain_blockage" ? "Drain blockage risk" : "Hazardous waste", points: hazardPoints },
      { key: "sensitivity", label: [hospitalNearby && "Hospital nearby", schoolNearby && "School nearby"].filter(Boolean).join(" · ") || "Location sensitivity", points: sensitivityPoints, active: sensitivityPoints > 0 },
      { key: "road", label: "Road / pedestrian obstruction", points: roadPoints, active: roadObstruction },
      { key: "frequency", label: `Reported ${duplicateSupport > 1 ? `${duplicateSupport} times nearby` : duplicateSupport === 1 ? "twice nearby" : "once"}`, points: frequencyPoints, active: frequencyPoints > 0 },
      { key: "age", label: `Open for ${ageHours < 24 ? `${Math.round(ageHours)}h` : `${Math.floor(ageHours / 24)}d ${Math.round(ageHours % 24)}h`}`, points: agePoints, active: agePoints > 0 },
      ...(escalationBonus ? [{ key: "escalation", label: "Manually escalated", points: escalationBonus, active: true }] : []),
    ],
  };
}

// Priority used for sorting/queues: stored score refreshed with live age/escalation.
export function withEffectivePriority(report) {
  const breakdown = computePriorityBreakdown(report);
  return {
    ...report,
    priority: { ...report.priority, score: breakdown.score, level: breakdown.level },
    priorityBreakdown: breakdown,
  };
}

export function validateStatusTransition(currentStatus, nextStatus) {
  const allowedTransitions = {
    [REPORT_STATUSES.DRAFT]: [REPORT_STATUSES.SUBMITTED],
    [REPORT_STATUSES.SUBMITTED]: [REPORT_STATUSES.AI_ANALYZED, REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.REJECTED, REPORT_STATUSES.DUPLICATE],
    [REPORT_STATUSES.AI_ANALYZED]: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.DUPLICATE],
    [REPORT_STATUSES.UNDER_REVIEW]: [REPORT_STATUSES.ASSIGNED, REPORT_STATUSES.REJECTED, REPORT_STATUSES.DUPLICATE],
    [REPORT_STATUSES.ASSIGNED]: [REPORT_STATUSES.EN_ROUTE, REPORT_STATUSES.REOPENED],
    [REPORT_STATUSES.EN_ROUTE]: [REPORT_STATUSES.CLEANUP_IN_PROGRESS, REPORT_STATUSES.REOPENED],
    [REPORT_STATUSES.CLEANUP_IN_PROGRESS]: [REPORT_STATUSES.VERIFICATION, REPORT_STATUSES.REOPENED],
    [REPORT_STATUSES.VERIFICATION]: [REPORT_STATUSES.RESOLVED, REPORT_STATUSES.REOPENED],
    [REPORT_STATUSES.RESOLVED]: [REPORT_STATUSES.REOPENED],
    [REPORT_STATUSES.REOPENED]: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED],
    [REPORT_STATUSES.REJECTED]: [],
    [REPORT_STATUSES.DUPLICATE]: [REPORT_STATUSES.UNDER_REVIEW],
  };
  return (allowedTransitions[currentStatus] || []).includes(nextStatus);
}

export function formatReportForClient(report) {
  const breakdown = computePriorityBreakdown(report);
  return {
    id: report.id,
    userId: report.citizenId,
    image: report.media?.imageUrl || "",
    video: report.media?.videoUrl || "",
    mediaType: report.media?.videoUrl ? "video" : "image",
    latitude: report.location?.latitude,
    longitude: report.location?.longitude,
    address: report.location?.address || "",
    wardId: report.location?.wardId || "",
    locality: report.location?.locality || "",
    timestamp: report.createdAt,
    wasteType: report.aiAnalysis?.wasteType || "other",
    aiConfidence: report.aiAnalysis?.confidence || 0,
    estimatedVolume: report.aiAnalysis?.estimatedVolume || "small",
    estimatedVolumeRange: report.aiAnalysis?.estimatedVolumeRange || "",
    severity: report.aiAnalysis?.severity || "low",
    hazardFlag: Boolean(report.aiAnalysis?.hazardFlag),
    recyclableHeavy: Boolean(report.aiAnalysis?.recyclableHeavy),
    detectionSummary: report.aiAnalysis?.detectionSummary || null,
    priorityScore: report.priority?.score ?? 0,
    effectivePriority: { score: breakdown.score, level: breakdown.level },
    priorityBreakdown: breakdown,
    potentialRisk: (report.aiAnalysis?.potentialRisks || []).join(", "),
    recommendation: report.aiAnalysis?.recommendation || "",
    duplicateProbability: report.duplicate?.similarityScore || 0,
    duplicate: report.duplicate || { isPotentialDuplicate: false, primaryReportId: "", similarityScore: 0, distanceMeters: 0 },
    comment: report.citizenComment || "",
    status: report.status,
    assignedTeam: report.assignedTeamId,
    beforeImage: report.media?.imageUrl || "",
    afterImage: report.afterMedia?.imageUrl || "",
    rejectionReason: report.rejectionReason || "",
    workerNotes: report.workerNotes || "",
    actualVolume: report.actualVolume || "",
    escalated: Boolean(report.escalated),
    escalatedAt: report.escalatedAt || null,
    feedbackRating: report.feedbackRating ?? null,
    feedbackComment: report.feedbackComment || "",
    feedbackAt: report.feedbackAt || null,
    recyclingStatus: report.recyclingStatus || "",
    recyclingPartner: report.recyclingPartner || "",
    recyclingRoutedAt: report.recyclingRoutedAt || null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    statusTimeline: report.statusTimeline || [],
    priorityReasons: report.priority?.reasons || [],
  };
}

export function formatTeamForClient(team) {
  return {
    id: team.id,
    name: team.name,
    leader: team.leaderId,
    leaderId: team.leaderId,
    memberIds: team.memberIds || [],
    memberCount: (team.memberIds || []).length,
    wardIds: team.wardIds || [],
    vehicle: team.vehicle?.type || "",
    vehicleType: team.vehicle?.type || "",
    vehicleCapacity: team.vehicle?.capacity || "",
    currentLocation: team.currentLocation?.label || "",
    availability: team.status,
    currentTask: team.currentAssignmentId,
    tasksCompletedToday: team.completedToday,
    status: team.status,
    averageResolutionTime: team.averageResolutionTime,
    etaMinutes: team.etaMinutes,
    distanceKm: team.distanceKm,
    aiMatchScore: team.aiMatchScore,
  };
}

const MEDIA_MIME_BY_EXT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".mp4": "video/mp4",
};

// ~9MB of binary after base64 inflation — Vercel's request body limit caps
// uploads well below this anyway; the guard only stops pathological rows.
const MAX_BLOB_CHARS = 12 * 1024 * 1024;

/**
 * Persists a data-URL upload. Media lives in Postgres (media_blobs) because
 * serverless filesystems are ephemeral — files written to /tmp vanish between
 * invocations, which is exactly why report photos went missing in production.
 */
export async function saveDataUrlMedia(dataUrl, relativePathPrefix) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return { url: "", storagePath: "" };
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("invalid-media");
  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : mimeType.includes("mp4") ? ".mp4" : ".jpg";
  const storagePath = `${relativePathPrefix}${ext}`;
  if (base64.length > MAX_BLOB_CHARS) {
    console.warn(`[media] ${storagePath} too large to persist (${Math.round(base64.length / 1024)}KB base64) — skipping`);
    return { url: "", storagePath };
  }
  try {
    await query(
      `INSERT INTO media_blobs (storage_path, mime_type, data_base64, byte_size)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (storage_path) DO UPDATE
         SET mime_type = EXCLUDED.mime_type, data_base64 = EXCLUDED.data_base64, byte_size = EXCLUDED.byte_size`,
      [storagePath, mimeType, base64, Buffer.byteLength(base64)]
    );
  } catch (err) {
    console.error(`[media] DB persist failed for ${storagePath}:`, err?.message || err);
    return { url: "", storagePath };
  }
  return { url: `/uploads/${storagePath}`, storagePath };
}

/** Reads a persisted media blob. Returns { mimeType, buffer } or null. */
export async function readStoredMedia(storagePath) {
  const res = await query("SELECT mime_type, data_base64 FROM media_blobs WHERE storage_path = $1", [storagePath]);
  if (!res.rows.length) return null;
  return { mimeType: res.rows[0].mime_type, buffer: Buffer.from(res.rows[0].data_base64, "base64") };
}

/**
 * Streams an /uploads/* request: Postgres blobs first, legacy disk files
 * second (local dev + anything written before this change). Returns false
 * when nothing was served so callers can send their own 404.
 */
export async function serveStoredMedia(req, res, pathname) {
  void req;
  const relative = String(pathname).replace(/^\/uploads\//, "");
  const safeRelative = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  try {
    const blob = safeRelative ? await readStoredMedia(safeRelative) : null;
    if (blob) {
      res.writeHead(200, {
        "Content-Type": blob.mimeType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      });
      res.end(blob.buffer);
      return true;
    }
  } catch { /* fall through to disk */ }
  for (const root of [join(tmpdir(), "swachhlens-uploads"), join(__dirname, "uploads")]) {
    const absolutePath = join(root, safeRelative);
    if (!absolutePath.startsWith(root + sep)) continue;
    try {
      if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
        res.writeHead(200, {
          "Content-Type": MEDIA_MIME_BY_EXT[extname(absolutePath).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        });
        createReadStream(absolutePath).pipe(res);
        return true;
      }
    } catch { /* try next root */ }
  }
  return false;
}

export function cleanObject(value) {
  return JSON.parse(JSON.stringify(value));
}
