import { query, getPool } from "./db.js";

function rowToUser(row) {
  if (!row) return null;
  return {
    uid: row.uid, name: row.name, email: row.email, phone: row.phone,
    role: row.role, wardId: row.ward_id, isActive: row.is_active,
    language: row.language, locationName: row.location_name, photoURL: row.photo_url,
    dutyStatus: row.duty_status || "off_duty",
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function rowToReport(row) {
  if (!row) return null;
  return {
    id: row.id, citizenId: row.citizen_id,
    media: { imageUrl: row.media_image_url, videoUrl: row.media_video_url, thumbnailUrl: row.media_thumbnail_url, storagePath: row.media_storage_path },
    location: { latitude: row.location_latitude, longitude: row.location_longitude, address: row.location_address, wardId: row.location_ward_id, locality: row.location_locality },
    citizenComment: row.citizen_comment,
    aiAnalysis: { wasteType: row.ai_waste_type, confidence: row.ai_confidence, estimatedVolume: row.ai_estimated_volume, estimatedVolumeRange: row.ai_estimated_volume_range, severity: row.ai_severity, potentialRisks: row.ai_potential_risks || [], recommendation: row.ai_recommendation },
    priority: { score: row.priority_score, level: row.priority_level, reasons: row.priority_reasons || [] },
    duplicate: { isPotentialDuplicate: row.duplicate_is_potential, primaryReportId: row.duplicate_primary_report_id, similarityScore: row.duplicate_similarity_score, distanceMeters: row.duplicate_distance_meters },
    status: row.status, assignedTeamId: row.assigned_team_id,
    afterMedia: { imageUrl: row.after_image_url, storagePath: row.after_storage_path },
    rejectionReason: row.rejection_reason || "",
    workerNotes: row.worker_notes || "",
    actualVolume: row.actual_volume || "",
    createdAt: row.created_at, updatedAt: row.updated_at,
    statusTimeline: typeof row.status_timeline === "string" ? JSON.parse(row.status_timeline) : row.status_timeline || [],
  };
}

function rowToTeam(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, leaderId: row.leader_id, memberIds: row.member_ids || [],
    wardIds: row.ward_ids || [], vehicle: { type: row.vehicle_type, capacity: row.vehicle_capacity },
    status: row.status,
    currentLocation: { latitude: row.current_location_latitude, longitude: row.current_location_longitude, label: row.current_location_label },
    currentAssignmentId: row.current_assignment_id, completedToday: row.completed_today,
    averageResolutionTime: row.average_resolution_time, etaMinutes: row.eta_minutes,
    distanceKm: row.distance_km, aiMatchScore: row.ai_match_score,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export const store = {
  async getState() {
    const [usersRes, reportsRes, teamsRes, notifRes] = await Promise.all([
      query("SELECT * FROM users"),
      query("SELECT * FROM reports ORDER BY created_at DESC"),
      query("SELECT * FROM teams"),
      query("SELECT * FROM notifications ORDER BY created_at DESC"),
    ]);
    return {
      users: Object.fromEntries(usersRes.rows.map((r) => [r.uid, rowToUser(r)])),
      reports: reportsRes.rows.map(rowToReport),
      teams: teamsRes.rows.map(rowToTeam),
      notifications: notifRes.rows.map((r) => ({ id: r.id, userId: r.user_id, title: r.title, body: r.body, createdAt: r.created_at })),
    };
  },

  async getUserByEmail(email) {
    const res = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    return rowToUser(res.rows[0]);
  },

  async getUserByUid(uid) {
    const res = await query("SELECT * FROM users WHERE uid = $1", [uid]);
    return rowToUser(res.rows[0]);
  },

  async createUser({ uid, name, email, phone, passwordHash, salt, role, photoUrl }) {
    await query(
      `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, photo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (email) DO NOTHING`,
      [uid, name, email.toLowerCase(), phone, passwordHash, salt, role || "citizen", photoUrl || ""]
    );
    return this.getUserByEmail(email.toLowerCase());
  },

  async updateUserProfile(uid, updates) {
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [key, val] of Object.entries(updates)) {
      setClauses.push(`${key} = $${i}`);
      values.push(val);
      i++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(uid);
    await query(`UPDATE users SET ${setClauses.join(", ")} WHERE uid = $${i}`, values);
    return this.getUserByUid(uid);
  },

  async createSession(token, uid) {
    await query("INSERT INTO sessions (token, uid, last_activity_at) VALUES ($1, $2, NOW())", [token, uid]);
  },

  async getSession(token) {
    const res = await query("SELECT * FROM sessions WHERE token = $1", [token]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    const lastActivity = new Date(row.last_activity_at || row.created_at).getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastActivity > threeDaysMs) {
      await this.deleteSession(token);
      return null;
    }
    const user = await this.getUserByUid(row.uid);
    if (!user) return null;
    await query("UPDATE sessions SET last_activity_at = NOW(), expires_at = NOW() + INTERVAL '3 days' WHERE token = $1", [token]);
    return user;
  },

  async deleteSession(token) {
    await query("DELETE FROM sessions WHERE token = $1", [token]);
  },

  async cleanExpiredSessions() {
    await query("DELETE FROM sessions WHERE last_activity_at < NOW() - INTERVAL '3 days'");
  },

  async getReportsForUser(uid, role) {
    let res;
    if (role === "admin" || role === "super_admin" || role === "ward_officer" || role === "sanitation_supervisor") {
      res = await query("SELECT * FROM reports ORDER BY created_at DESC");
    } else if (role === "cleanup_worker") {
      res = await query(
        `SELECT r.* FROM reports r JOIN teams t ON r.assigned_team_id = t.id WHERE t.leader_id = $1 OR $1 = ANY(t.member_ids) ORDER BY r.created_at DESC`,
        [uid]
      );
    } else {
      res = await query("SELECT * FROM reports WHERE citizen_id = $1 ORDER BY created_at DESC", [uid]);
    }
    return res.rows.map(rowToReport);
  },

  async getReportById(id) {
    const res = await query("SELECT * FROM reports WHERE id = $1", [id]);
    return rowToReport(res.rows[0]);
  },

  async createReport(report) {
    const r = report;
    await query(
      `INSERT INTO reports (id, citizen_id, media_image_url, media_video_url, media_thumbnail_url, media_storage_path, location_latitude, location_longitude, location_address, location_ward_id, location_locality, citizen_comment, ai_waste_type, ai_confidence, ai_estimated_volume, ai_estimated_volume_range, ai_severity, ai_potential_risks, ai_recommendation, priority_score, priority_level, priority_reasons, duplicate_is_potential, duplicate_primary_report_id, duplicate_similarity_score, duplicate_distance_meters, status, status_timeline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [r.id, r.citizenId, r.media?.imageUrl || "", r.media?.videoUrl || "", r.media?.thumbnailUrl || "", r.media?.storagePath || "", r.location?.latitude || 0, r.location?.longitude || 0, r.location?.address || "", r.location?.wardId || "", r.location?.locality || "", r.citizenComment || "", r.aiAnalysis?.wasteType || "", r.aiAnalysis?.confidence || 0, r.aiAnalysis?.estimatedVolume || "", r.aiAnalysis?.estimatedVolumeRange || "", r.aiAnalysis?.severity || "", r.aiAnalysis?.potentialRisks || [], r.aiAnalysis?.recommendation || "", r.priority?.score || 0, r.priority?.level || "low", r.priority?.reasons || [], r.duplicate?.isPotentialDuplicate || false, r.duplicate?.primaryReportId || "", r.duplicate?.similarityScore || 0, r.duplicate?.distanceMeters || 0, r.status, JSON.stringify(r.statusTimeline || [])]
    );
    return this.getReportById(r.id);
  },

  async updateReport(id, updates) {
    const setClauses = [];
    const values = [];
    let i = 1;
    const fieldMap = {
      status: "status", assignedTeamId: "assigned_team_id", citizenComment: "citizen_comment",
      "media.imageUrl": "media_image_url", "media.videoUrl": "media_video_url",
      "media.thumbnailUrl": "media_thumbnail_url", "media.storagePath": "media_storage_path",
      "afterMedia.imageUrl": "after_image_url", "afterMedia.storagePath": "after_storage_path",
      "aiAnalysis.wasteType": "ai_waste_type", "aiAnalysis.confidence": "ai_confidence",
      "aiAnalysis.estimatedVolume": "ai_estimated_volume", "aiAnalysis.estimatedVolumeRange": "ai_estimated_volume_range",
      "aiAnalysis.severity": "ai_severity", "aiAnalysis.potentialRisks": "ai_potential_risks",
      "aiAnalysis.recommendation": "ai_recommendation",
      "priority.score": "priority_score", "priority.level": "priority_level", "priority.reasons": "priority_reasons",
      "duplicate.isPotentialDuplicate": "duplicate_is_potential", "duplicate.primaryReportId": "duplicate_primary_report_id",
      "duplicate.similarityScore": "duplicate_similarity_score", "duplicate.distanceMeters": "duplicate_distance_meters",
      statusTimeline: "status_timeline",
    };

    for (const [key, val] of Object.entries(updates)) {
      const col = fieldMap[key] || key;
      setClauses.push(`${col} = $${i}`);
      values.push(typeof val === "object" ? JSON.stringify(val) : val);
      i++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    await query(`UPDATE reports SET ${setClauses.join(", ")} WHERE id = $${i}`, values);
    return this.getReportById(id);
  },

  async assignTeam(reportId, teamId) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE reports SET assigned_team_id = $1, status = 'assigned', updated_at = NOW() WHERE id = $2", [teamId, reportId]);
      await client.query("UPDATE teams SET status = 'assigned', current_assignment_id = $1, updated_at = NOW() WHERE id = $2", [reportId, teamId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async getTeams() {
    const res = await query("SELECT * FROM teams");
    return res.rows.map(rowToTeam);
  },

  async createNotification(payload) {
    const id = `note-${Date.now().toString(36)}`;
    await query("INSERT INTO notifications (id, user_id, title, body) VALUES ($1,$2,$3,$4)", [id, payload.userId || "", payload.title, payload.body]);
    return { id, ...payload };
  },

  async getNotifications(userId, role) {
    let res;
    if (role === "admin" || role === "super_admin" || role === "ward_officer" || role === "sanitation_supervisor") {
      res = await query("SELECT * FROM notifications WHERE user_id = $1 OR user_id = 'user-admin' ORDER BY created_at DESC", [userId]);
    } else {
      res = await query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    }
    return res.rows.map((r) => ({ id: r.id, title: r.title, body: r.body, userId: r.user_id, createdAt: r.created_at }));
  },

  async getHotspots() {
    const res = await query("SELECT location_latitude as latitude, location_longitude as longitude, ai_waste_type as wasteType, COUNT(*) as count FROM reports GROUP BY location_latitude, location_longitude, ai_waste_type HAVING COUNT(*) > 1");
    return res.rows;
  },

  async getVehicles() {
    const res = await query("SELECT * FROM vehicles ORDER BY updated_at DESC");
    return res.rows.map((r) => ({
      id: r.id, teamId: r.team_id, name: r.name, vehicleType: r.vehicle_type,
      status: r.status, latitude: r.current_latitude, longitude: r.current_longitude,
      label: r.current_label, speedKmh: r.speed_kmh, heading: r.heading,
      assignedArea: r.assigned_area, route: r.route || [],
      updatedAt: r.updated_at, createdAt: r.created_at,
    }));
  },

  async getVehicleById(id) {
    const res = await query("SELECT * FROM vehicles WHERE id = $1", [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id, teamId: r.team_id, name: r.name, vehicleType: r.vehicle_type,
      status: r.status, latitude: r.current_latitude, longitude: r.current_longitude,
      label: r.current_label, speedKmh: r.speed_kmh, heading: r.heading,
      assignedArea: r.assigned_area, route: r.route || [],
      updatedAt: r.updated_at, createdAt: r.created_at,
    };
  },

  async updateVehicleLocation(id, { latitude, longitude, label, speedKmh, heading, status }) {
    const sets = ["current_latitude = $1", "current_longitude = $2", "updated_at = NOW()"];
    const vals = [latitude, longitude];
    let i = 3;
    if (label !== undefined) { sets.push(`current_label = $${i++}`); vals.push(label); }
    if (speedKmh !== undefined) { sets.push(`speed_kmh = $${i++}`); vals.push(speedKmh); }
    if (heading !== undefined) { sets.push(`heading = $${i++}`); vals.push(heading); }
    if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
    vals.push(id);
    await query(`UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${i}`, vals);
    return this.getVehicleById(id);
  },

  async createVehicle({ id, teamId, name, vehicleType, status, latitude, longitude, label, assignedArea }) {
    await query(
      `INSERT INTO vehicles (id, team_id, name, vehicle_type, status, current_latitude, current_longitude, current_label, assigned_area) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET current_latitude = $6, current_longitude = $7, current_label = $8, status = $5, updated_at = NOW()`,
      [id, teamId || "", name, vehicleType || "", status || "idle", latitude || 0, longitude || 0, label || "", assignedArea || ""]
    );
    return this.getVehicleById(id);
  },

  async getAllUsers() {
    const res = await query("SELECT * FROM users ORDER BY created_at DESC");
    return res.rows.map(rowToUser);
  },

  async getComplaints(filters = {}) {
    let sql = "SELECT * FROM reports WHERE 1=1";
    const params = [];
    let i = 1;
    if (filters.status) { sql += ` AND status = $${i++}`; params.push(filters.status); }
    if (filters.severity) { sql += ` AND ai_severity = $${i++}`; params.push(filters.severity); }
    if (filters.wardId) { sql += ` AND location_ward_id = $${i++}`; params.push(filters.wardId); }
    if (filters.wasteType) { sql += ` AND ai_waste_type = $${i++}`; params.push(filters.wasteType); }
    if (filters.search) { sql += ` AND (id ILIKE $${i} OR location_address ILIKE $${i})`; params.push(`%${filters.search}%`); i++; }
    if (filters.dateFrom) { sql += ` AND created_at >= $${i++}`; params.push(filters.dateFrom); }
    if (filters.dateTo) { sql += ` AND created_at <= $${i++}`; params.push(filters.dateTo); }
    sql += " ORDER BY priority_score DESC, created_at DESC";
    const res = await query(sql, params);
    return res.rows.map(rowToReport);
  },

  async getVerificationQueue() {
    const res = await query("SELECT * FROM reports WHERE status = 'verification' ORDER BY updated_at DESC");
    return res.rows.map(rowToReport);
  },

  async getDuplicateGroups() {
    const res = await query(
      `SELECT duplicate_primary_report_id as groupId, array_agg(id) as reportIds, COUNT(*) as count, MAX(duplicate_similarity_score) as maxSimilarity
       FROM reports WHERE duplicate_is_potential = true AND duplicate_primary_report_id != ''
       GROUP BY duplicate_primary_report_id HAVING COUNT(*) > 1 ORDER BY maxSimilarity DESC`
    );
    const groups = [];
    for (const row of res.rows) {
      const reportsRes = await query("SELECT * FROM reports WHERE id = ANY($1) OR id = $2", [row.reportIds, row.groupId]);
      groups.push({
        groupId: row.groupId,
        reports: reportsRes.rows.map(rowToReport),
        count: Number(row.count),
        maxSimilarity: Number(row.maxSimilarity),
      });
    }
    return groups;
  },

  async mergeDuplicates(groupId, keepId) {
    const otherIds = await query("SELECT id FROM reports WHERE duplicate_primary_report_id = $1 AND id != $2", [groupId, keepId]);
    for (const r of otherIds.rows) {
      await query("UPDATE reports SET status = 'duplicate', updated_at = NOW() WHERE id = $1", [r.id]);
    }
    return { merged: otherIds.rows.length, kept: keepId };
  },

  async getAnalytics() {
    const [totalRes, statusRes, categoryRes, severityRes, wardRes, timelineRes] = await Promise.all([
      query("SELECT COUNT(*) as total FROM reports"),
      query("SELECT status, COUNT(*) as count FROM reports GROUP BY status ORDER BY count DESC"),
      query("SELECT ai_waste_type as category, COUNT(*) as count FROM reports GROUP BY ai_waste_type ORDER BY count DESC"),
      query("SELECT ai_severity as severity, COUNT(*) as count FROM reports WHERE ai_severity != '' GROUP BY ai_severity ORDER BY count DESC"),
      query("SELECT location_ward_id as ward, COUNT(*) as count FROM reports WHERE location_ward_id != '' GROUP BY location_ward_id ORDER BY count DESC"),
      query("SELECT DATE(created_at) as date, COUNT(*) as count FROM reports WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC"),
    ]);
    return {
      total: Number(totalRes.rows[0]?.total || 0),
      byStatus: statusRes.rows,
      byCategory: categoryRes.rows,
      bySeverity: severityRes.rows,
      byWard: wardRes.rows,
      timeline: timelineRes.rows,
    };
  },

  async getActivityLogs(limit = 50) {
    const res = await query("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT $1", [limit]);
    return res.rows;
  },

  async logActivity({ actor, role, action, reportId }) {
    const id = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await query("INSERT INTO activity_logs (id, actor, role, action, report_id) VALUES ($1,$2,$3,$4,$5)", [id, actor || "", role || "", action, reportId || ""]);
  },

  async getWorkerStats() {
    const workersRes = await query("SELECT * FROM users WHERE role = 'cleanup_worker' ORDER BY created_at DESC");
    const workers = workersRes.rows.map(rowToUser);
    const stats = [];
    for (const w of workers) {
      const reportsRes = await query(
        `SELECT r.* FROM reports r JOIN teams t ON r.assigned_team_id = t.id WHERE t.leader_id = $1 OR $1 = ANY(t.member_ids)`,
        [w.uid]
      );
      const reports = reportsRes.rows.map(rowToReport);
      const completed = reports.filter((r) => r.status === "resolved").length;
      const active = reports.filter((r) => r.status !== "resolved" && r.status !== "rejected").length;
      stats.push({ ...w, completedTasks: completed, activeTasks: active, totalTasks: reports.length });
    }
    return stats;
  },

  async getWorkerTasks(uid) {
    const res = await query(
      `SELECT r.* FROM reports r JOIN teams t ON r.assigned_team_id = t.id
       WHERE (t.leader_id = $1 OR $1 = ANY(t.member_ids))
       AND r.status NOT IN ('resolved', 'rejected', 'duplicate')
       ORDER BY r.priority_score DESC, r.created_at DESC`,
      [uid]
    );
    return res.rows.map(rowToReport);
  },

  async getWorkerHistory(uid) {
    const res = await query(
      `SELECT r.* FROM reports r JOIN teams t ON r.assigned_team_id = t.id
       WHERE (t.leader_id = $1 OR $1 = ANY(t.member_ids))
       AND r.status IN ('resolved', 'rejected')
       ORDER BY r.updated_at DESC`,
      [uid]
    );
    return res.rows.map(rowToReport);
  },

  async toggleDutyStatus(uid, dutyStatus) {
    await query("UPDATE users SET duty_status = $1, updated_at = NOW() WHERE uid = $2", [dutyStatus, uid]);
    return this.getUserByUid(uid);
  },

  async updateWorkerReport(reportId, updates) {
    const setClauses = [];
    const values = [];
    let i = 1;
    const fieldMap = {
      workerNotes: "worker_notes",
      actualVolume: "actual_volume",
      rejectionReason: "rejection_reason",
    };
    for (const [key, val] of Object.entries(updates)) {
      const col = fieldMap[key] || key;
      setClauses.push(`${col} = $${i}`);
      values.push(val);
      i++;
    }
    setClauses.push("updated_at = NOW()");
    values.push(reportId);
    await query(`UPDATE reports SET ${setClauses.join(", ")} WHERE id = $${i}`, values);
    return this.getReportById(reportId);
  },
};
