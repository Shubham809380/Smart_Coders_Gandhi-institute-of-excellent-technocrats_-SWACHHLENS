// In-memory proximity alert engine for cleanup workers.
// Workers POST their location; when they come within PROXIMITY_RADIUS_KM of
// an open assigned task we raise one alert per task (deduped, batched).
// Alerts auto-dismiss when the task is resolved. Ephemeral by design —
// losing them on server restart is acceptable for proximity nudges.

import { haversineMeters } from "./utils.js";

export const PROXIMITY_RADIUS_KM = 0.5;
const RE_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

// uid -> { lastLoc: {lat,lng,at}, alerts: Map<reportId, alert>, alertedAt: Map<reportId, ts> }
const workers = new Map();

function bucket(uid) {
  let w = workers.get(uid);
  if (!w) {
    w = { lastLoc: null, alerts: new Map(), alertedAt: new Map() };
    workers.set(uid, w);
  }
  return w;
}

/**
 * Record a worker location ping and evaluate proximity against their tasks.
 * @param {string} uid worker uid
 * @param {{latitude:number, longitude:number}} loc
 * @param {Array<{id:string, latitude:number, longitude:number, wasteType:string, address:string, severity:string}>} tasks open assigned tasks
 * @returns {{raised: Array<object>} } newly raised alerts
 */
export function updateWorkerLocation(uid, loc, tasks) {
  const w = bucket(uid);
  w.lastLoc = { ...loc, at: Date.now() };
  const raised = [];
  for (const t of tasks) {
    const lat = Number(t.latitude), lng = Number(t.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const meters = haversineMeters({ latitude: w.lastLoc.latitude, longitude: w.lastLoc.longitude }, { latitude: lat, longitude: lng });
    if (meters <= PROXIMITY_RADIUS_KM * 1000) {
      const existing = w.alerts.get(t.id);
      if (existing) {
        existing.distanceMeters = Math.round(meters); // refresh live distance
        continue;
      }
      const last = w.alertedAt.get(t.id) || 0;
      if (Date.now() - last < RE_ALERT_COOLDOWN_MS) continue;
      const alert = {
        alertId: `prox-${t.id}`,
        reportId: t.id,
        wasteType: t.wasteType || "waste",
        address: t.address || "",
        severity: t.severity || "medium",
        distanceMeters: Math.round(meters),
        raisedAt: new Date().toISOString(),
      };
      w.alerts.set(t.id, alert);
      w.alertedAt.set(t.id, Date.now());
      raised.push(alert);
    }
  }
  return { raised };
}

export function getAlerts(uid) {
  return [...(workers.get(uid)?.alerts.values() || [])].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function dismissAlert(uid, reportId) {
  return workers.get(uid)?.alerts.delete(reportId) || false;
}

export function dismissAllAlerts(uid) {
  const w = workers.get(uid);
  const n = w?.alerts.size || 0;
  w?.alerts.clear();
  return n;
}

/** Auto-dismiss the alert for a report (called when it gets resolved). */
export function dismissForReport(reportId) {
  let removed = 0;
  for (const w of workers.values()) {
    if (w.alerts.delete(reportId)) removed++;
  }
  return removed;
}

export function getWorkerLastLocation(uid) {
  return workers.get(uid)?.lastLoc || null;
}
