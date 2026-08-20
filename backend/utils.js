import { randomBytes } from "node:crypto";
import { extname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import bcrypt from "bcryptjs";
import { PRIORITY_WEIGHTS, REPORT_STATUSES } from "./constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadsRoot = join(__dirname, "uploads");

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSessionToken() {
  return randomBytes(24).toString("hex");
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
  if (analysis.potentialRisks.some((risk) => /road|pedestrian|obstruction/i.test(risk))) {
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
  return {
    id: report.id,
    userId: report.citizenId,
    image: report.media?.imageUrl || "",
    video: report.media?.videoUrl || "",
    mediaType: report.media?.videoUrl ? "video" : "image",
    latitude: report.location?.latitude,
    longitude: report.location?.longitude,
    address: report.location?.address || "",
    timestamp: report.createdAt,
    wasteType: report.aiAnalysis?.wasteType || "other",
    aiConfidence: report.aiAnalysis?.confidence || 0,
    estimatedVolume: report.aiAnalysis?.estimatedVolume || "small",
    estimatedVolumeRange: report.aiAnalysis?.estimatedVolumeRange || "",
    severity: report.aiAnalysis?.severity || "low",
    priorityScore: report.priority?.score || 0,
    potentialRisk: (report.aiAnalysis?.potentialRisks || []).join(", "),
    recommendation: report.aiAnalysis?.recommendation || "",
    duplicateProbability: report.duplicate?.similarityScore || 0,
    comment: report.citizenComment || "",
    status: report.status,
    assignedTeam: report.assignedTeamId,
    beforeImage: report.media?.imageUrl || "",
    afterImage: report.afterMedia?.imageUrl || "",
    rejectionReason: report.rejectionReason || "",
    workerNotes: report.workerNotes || "",
    actualVolume: report.actualVolume || "",
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
    members: team.memberIds.length,
    vehicle: team.vehicle.type,
    currentLocation: team.currentLocation.label,
    availability: team.status,
    currentTask: team.currentAssignmentId,
    tasksCompletedToday: team.completedToday,
    status: team.status,
    etaMinutes: team.etaMinutes,
    distanceKm: team.distanceKm,
    aiMatchScore: team.aiMatchScore,
  };
}

export function saveDataUrlMedia(dataUrl, relativePathPrefix) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return { url: "", storagePath: "" };
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("invalid-media");
  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : mimeType.includes("mp4") ? ".mp4" : ".jpg";
  const storagePath = `${relativePathPrefix}${ext}`;
  const absolutePath = join(uploadsRoot, storagePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, Buffer.from(base64, "base64"));
  return { url: `/uploads/${storagePath.replace(/\\/g, "/")}`, storagePath };
}

export function cleanObject(value) {
  return JSON.parse(JSON.stringify(value));
}
