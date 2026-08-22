import { query, getPool } from "./db.js";
import { calculatePriority, nowIso } from "./utils.js";

function rowToUser(row) {
  if (!row) return null;
  return {
    uid: row.uid, name: row.name, email: row.email, phone: row.phone,
    role: row.role, wardId: row.ward_id, isActive: row.is_active,
    language: row.language, locationName: row.location_name, photoURL: row.photo_url,
    dutyStatus: row.duty_status || "off_duty",
    currentLocation: row.current_lat != null && row.current_lng != null
      ? { latitude: Number(row.current_lat), longitude: Number(row.current_lng), at: row.last_location_at }
      : null,
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
    aiAnalysis: {
      wasteType: row.ai_waste_type, confidence: row.ai_confidence,
      estimatedVolume: row.ai_estimated_volume, estimatedVolumeRange: row.ai_estimated_volume_range,
      severity: row.ai_severity, potentialRisks: row.ai_potential_risks || [],
      recommendation: row.ai_recommendation,
      hazardFlag: Boolean(row.ai_hazard_flag),
      recyclableHeavy: Boolean(row.ai_recyclable_heavy),
      detectionSummary: typeof row.ai_detection_summary === "string" ? JSON.parse(row.ai_detection_summary || "null") : row.ai_detection_summary || null,
    },
    priority: { score: row.priority_score, level: row.priority_level, reasons: row.priority_reasons || [] },
    duplicate: { isPotentialDuplicate: row.duplicate_is_potential, primaryReportId: row.duplicate_primary_report_id, similarityScore: row.duplicate_similarity_score, distanceMeters: row.duplicate_distance_meters },
    status: row.status, assignedTeamId: row.assigned_team_id,
    afterMedia: { imageUrl: row.after_image_url, storagePath: row.after_storage_path },
    rejectionReason: row.rejection_reason || "",
    workerNotes: row.worker_notes || "",
    actualVolume: row.actual_volume || "",
    escalated: Boolean(row.escalated),
    escalatedAt: row.escalated_at || null,
    feedbackRating: row.feedback_rating ?? null,
    feedbackComment: row.feedback_comment || "",
    feedbackAt: row.feedback_at || null,
    recyclingStatus: row.recycling_status || "",
    recyclingPartner: row.recycling_partner || "",
    recyclingRoutedAt: row.recycling_routed_at || null,
    aiAfterAnalysis: typeof row.ai_after_analysis === "string" ? JSON.parse(row.ai_after_analysis || "null") : row.ai_after_analysis || null,
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

  async createUser({ uid, name, email, phone, passwordHash, salt, role, photoUrl, termsAccepted, termsAcceptedAt }) {
    await query(
      `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, photo_url, terms_accepted, terms_accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (email) DO NOTHING`,
      [uid, name, email.toLowerCase(), phone, passwordHash, salt, role || "citizen", photoUrl || "", Boolean(termsAccepted), termsAcceptedAt || null]
    );
    return this.getUserByEmail(email.toLowerCase());
  },

  async updateUserPassword(uid, passwordHash, salt) {
    await query("UPDATE users SET password_hash = $1, salt = $2, updated_at = NOW() WHERE uid = $3", [passwordHash, salt, uid]);
    return this.getUserByUid(uid);
  },

  async getPasswordHashByUid(uid) {
    const res = await query("SELECT password_hash FROM users WHERE uid = $1", [uid]);
    return res.rows[0]?.password_hash || "";
  },

  // Invalidates any previous pending tokens for the user, then stores the new one.
  async createPasswordReset({ uid, tokenHash, expiresAt }) {
    await query("DELETE FROM password_reset_tokens WHERE uid = $1", [uid]);
    await query(
      "INSERT INTO password_reset_tokens (uid, token_hash, expires_at) VALUES ($1, $2, $3)",
      [uid, tokenHash, expiresAt]
    );
  },

  // Atomically consume a token: single-use AND unexpired, else no row returns.
  async consumePasswordReset(tokenHash) {
    const res = await query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING uid`,
      [tokenHash]
    );
    return res.rows[0] || null;
  },

  async deletePasswordResetsForUser(uid) {
    await query("DELETE FROM password_reset_tokens WHERE uid = $1", [uid]);
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
    const user = await this.getUserByUid(row.uid);
    if (!user) return null;
    await query("UPDATE sessions SET last_activity_at = NOW() WHERE token = $1", [token]);
    return user;
  },

  async deleteSession(token) {
    await query("DELETE FROM sessions WHERE token = $1", [token]);
  },

  async cleanExpiredSessions() {
    await query("DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days'");
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
      `INSERT INTO reports (id, citizen_id, media_image_url, media_video_url, media_thumbnail_url, media_storage_path, location_latitude, location_longitude, location_address, location_ward_id, location_locality, citizen_comment, ai_waste_type, ai_confidence, ai_estimated_volume, ai_estimated_volume_range, ai_severity, ai_potential_risks, ai_recommendation, ai_hazard_flag, ai_recyclable_heavy, ai_detection_summary, priority_score, priority_level, priority_reasons, duplicate_is_potential, duplicate_primary_report_id, duplicate_similarity_score, duplicate_distance_meters, status, status_timeline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [r.id, r.citizenId, r.media?.imageUrl || "", r.media?.videoUrl || "", r.media?.thumbnailUrl || "", r.media?.storagePath || "", r.location?.latitude || 0, r.location?.longitude || 0, r.location?.address || "", r.location?.wardId || "", r.location?.locality || "", r.citizenComment || "", r.aiAnalysis?.wasteType || "", Math.round(Number(r.aiAnalysis?.confidence) || 0), r.aiAnalysis?.estimatedVolume || "", r.aiAnalysis?.estimatedVolumeRange || "", r.aiAnalysis?.severity || "", r.aiAnalysis?.potentialRisks || [], r.aiAnalysis?.recommendation || "", Boolean(r.aiAnalysis?.hazardFlag), Boolean(r.aiAnalysis?.recyclableHeavy), r.aiAnalysis?.detectionSummary ? JSON.stringify(r.aiAnalysis.detectionSummary) : null, Math.round(Number(r.priority?.score) || 0), r.priority?.level || "low", r.priority?.reasons || [], r.duplicate?.isPotentialDuplicate || false, r.duplicate?.primaryReportId || "", Number(r.duplicate?.similarityScore) || 0, Number(r.duplicate?.distanceMeters) || 0, r.status, JSON.stringify(r.statusTimeline || [])]
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
      "aiAnalysis.hazardFlag": "ai_hazard_flag", "aiAnalysis.recyclableHeavy": "ai_recyclable_heavy",
      "aiAnalysis.detectionSummary": "ai_detection_summary",
      "priority.score": "priority_score", "priority.level": "priority_level", "priority.reasons": "priority_reasons",
      "duplicate.isPotentialDuplicate": "duplicate_is_potential", "duplicate.primaryReportId": "duplicate_primary_report_id",
      "duplicate.similarityScore": "duplicate_similarity_score", "duplicate.distanceMeters": "duplicate_distance_meters",
      escalated: "escalated", escalatedAt: "escalated_at",
      recyclingStatus: "recycling_status", recyclingPartner: "recycling_partner", recyclingRoutedAt: "recycling_routed_at",
      duplicateGroupDismissed: "duplicate_group_dismissed",
      aiAfterAnalysis: "ai_after_analysis",
      statusTimeline: "status_timeline",
      feedbackRating: "feedback_rating", feedbackComment: "feedback_comment", feedbackAt: "feedback_at",
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
      await client.query(
        "UPDATE reports SET assigned_team_id = $1, status = 'assigned', updated_at = NOW(), status_timeline = status_timeline || $2::jsonb WHERE id = $3",
        [teamId, JSON.stringify([{ status: "assigned", at: nowIso() }]), reportId]
      );
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
    const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await query(
      "INSERT INTO notifications (id, user_id, title, body, kind, report_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, payload.userId || "", payload.title, payload.body, payload.kind || "info", payload.reportId || ""]
    );
    return { id, ...payload };
  },

  async savePushSubscription({ userId, endpoint, p256dh, auth }) {
    const existing = await query("SELECT id, user_id FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
    if (existing.rows.length > 0) {
      await query("UPDATE push_subscriptions SET user_id = $1, p256dh = $2, auth = $3 WHERE endpoint = $4", [userId, p256dh, auth, endpoint]);
      return existing.rows[0].id;
    }
    const id = `push-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await query(
      "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4,$5)",
      [id, userId, endpoint, p256dh, auth]
    );
    return id;
  },

  async deletePushSubscription(endpoint) {
    await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  },

  async getPushSubscriptionsForUsers(userIds) {
    if (!userIds || userIds.length === 0) return [];
    const res = await query("SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::text[])", [userIds]);
    return res.rows.map((r) => ({ userId: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
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
    if (filters.status) {
      if (filters.status === "open") sql += ` AND status NOT IN ('resolved', 'rejected', 'duplicate')`;
      else if (String(filters.status).includes(",")) {
        const list = String(filters.status).split(",").map((s) => s.trim()).filter(Boolean);
        sql += ` AND status = ANY($${i++})`;
        params.push(list);
      }
      else { sql += ` AND status = $${i++}`; params.push(filters.status); }
    }
    if (filters.severity) { sql += ` AND ai_severity = $${i++}`; params.push(filters.severity); }
    if (filters.wardId) { sql += ` AND location_ward_id = $${i++}`; params.push(filters.wardId); }
    if (filters.wasteType) { sql += ` AND ai_waste_type = $${i++}`; params.push(filters.wasteType); }
    if (filters.escalated === "true") sql += ` AND escalated = true`;
    if (filters.hazard === "true") sql += ` AND ai_hazard_flag = true`;
    if (filters.recyclable === "true") sql += ` AND ai_recyclable_heavy = true`;
    if (filters.minPriority) { sql += ` AND priority_score >= $${i++}`; params.push(Number(filters.minPriority) || 0); }
    if (filters.search) { sql += ` AND (id ILIKE $${i} OR location_address ILIKE $${i})`; params.push(`%${filters.search}%`); i++; }
    if (filters.dateFrom) { sql += ` AND created_at >= $${i++}`; params.push(filters.dateFrom); }
    if (filters.dateTo) { sql += ` AND created_at <= $${i++}`; params.push(filters.dateTo); }
    const sort = String(filters.sort || "priority");
    const sorts = {
      priority: "priority_score DESC, created_at DESC",
      newest: "created_at DESC",
      oldest: "created_at ASC",
      status: "status ASC, priority_score DESC",
    };
    sql += ` ORDER BY ${sorts[sort] || sorts.priority}`;
    if (filters.limit) {
      sql += ` LIMIT $${i++}`;
      params.push(Math.max(1, Number(filters.limit) || 50));
    }
    const res = await query(sql, params);
    return res.rows.map(rowToReport);
  },

  async getVerificationQueue() {
    const res = await query("SELECT * FROM reports WHERE status = 'verification' ORDER BY updated_at DESC");
    return res.rows.map(rowToReport);
  },

  async getDuplicateGroups() {
    const res = await query(
      `SELECT duplicate_primary_report_id AS group_id, array_agg(id) AS report_ids, COUNT(*) AS member_count, MAX(duplicate_similarity_score) AS max_similarity
       FROM reports WHERE duplicate_is_potential = true AND duplicate_primary_report_id != ''
       GROUP BY duplicate_primary_report_id HAVING COUNT(*) > 1 ORDER BY max_similarity DESC`
    );
    const groups = [];
    for (const row of res.rows) {
      const reportsRes = await query("SELECT * FROM reports WHERE id = ANY($1) OR id = $2 ORDER BY created_at ASC", [row.report_ids, row.group_id]);
      groups.push({
        groupId: row.group_id,
        reports: reportsRes.rows.map(rowToReport),
        count: Number(row.member_count),
        maxSimilarity: Number(row.max_similarity || 0),
      });
    }
    return groups;
  },

  async mergeDuplicates(groupId, keepId) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const others = await client.query("SELECT id, citizen_id FROM reports WHERE duplicate_primary_report_id = $1 AND id != $2", [groupId, keepId]);
      for (const r of others.rows) {
        await client.query("UPDATE reports SET status = 'duplicate', updated_at = NOW() WHERE id = $1", [r.id]);
      }
      // Merging confirms real duplication: bump the root's report frequency so its
      // priority score genuinely rises (duplicateSupport factor).
      const rootRes = await client.query("SELECT * FROM reports WHERE id = $1", [keepId]);
      if (rootRes.rows[0]) {
        const root = rowToReport(rootRes.rows[0]);
        const supportCount = others.rows.length;
        const priority = calculatePriority(root.aiAnalysis, {
          address: root.location?.address || "",
          duplicateSupportCount: supportCount,
          ageHours: (Date.now() - new Date(root.createdAt).getTime()) / 3600000,
        });
        await client.query("UPDATE reports SET priority_score = $1, priority_level = $2, priority_reasons = $3, updated_at = NOW() WHERE id = $4", [priority.score, priority.level, priority.reasons, keepId]);
      }
      await client.query("COMMIT");
      return { merged: others.rows.length, kept: keepId };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async dismissDuplicateGroup(groupId) {
    const res = await query(
      "UPDATE reports SET duplicate_group_dismissed = true, updated_at = NOW() WHERE (id = $1 OR duplicate_primary_report_id = $1)",
      [groupId]
    );
    return { dismissed: res.rowCount };
  },

  async markAsDuplicate(reportId, primaryReportId) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE reports SET status = 'duplicate', duplicate_is_potential = true, duplicate_primary_report_id = $2, updated_at = NOW() WHERE id = $1",
        [reportId, primaryReportId]
      );
      const dupRes = await client.query("SELECT * FROM reports WHERE id = $1", [reportId]);
      const dup = rowToReport(dupRes.rows[0]);
      const rootRes = await client.query("SELECT * FROM reports WHERE id = $1", [primaryReportId]);
      if (rootRes.rows[0]) {
        const root = rowToReport(rootRes.rows[0]);
        const countRes = await client.query(
          "SELECT COUNT(*)::int AS n FROM reports WHERE duplicate_primary_report_id = $1 AND status = 'duplicate'",
          [primaryReportId]
        );
        const priority = calculatePriority(root.aiAnalysis, {
          address: root.location?.address || "",
          duplicateSupportCount: Number(countRes.rows[0]?.n || 0),
          ageHours: (Date.now() - new Date(root.createdAt).getTime()) / 3600000,
        });
        await client.query(
          "UPDATE reports SET priority_score = $1, priority_level = $2, priority_reasons = $3, updated_at = NOW() WHERE id = $4",
          [priority.score, priority.level, priority.reasons, primaryReportId]
        );
      }
      await client.query("COMMIT");
      return { report: dup };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async getHotspotCells() {
    const res = await query(`
      SELECT
        ROUND(location_latitude / 0.004)::int AS lat_cell,
        ROUND(location_longitude / 0.004)::int AS lng_cell,
        AVG(location_latitude) AS latitude,
        AVG(location_longitude) AS longitude,
        COUNT(*)::int AS report_count,
        MAX(priority_score)::int AS max_priority,
        MODE() WITHIN GROUP (ORDER BY ai_waste_type) AS top_waste_type,
        SUM(
          GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - created_at)) / 259200.0)
          + priority_score / 100.0
        ) AS intensity
      FROM reports
      WHERE status NOT IN ('resolved', 'rejected', 'duplicate')
        AND location_latitude != 0 AND location_longitude != 0
      GROUP BY lat_cell, lng_cell
    `);
    return res.rows.map((r) => ({
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      reportCount: Number(r.report_count),
      maxPriority: Number(r.max_priority),
      intensity: Number(Number(r.intensity || 0).toFixed(2)),
      topWasteType: r.top_waste_type || "unknown",
    }));
  },

  async getTeamsWithLoad() {
    const teamsRes = await query("SELECT * FROM teams ORDER BY name ASC");
    const loadRes = await query(
      `SELECT assigned_team_id AS team_id, COUNT(*)::int AS active_tasks
       FROM reports WHERE assigned_team_id IS NOT NULL AND assigned_team_id != ''
       AND status NOT IN ('resolved', 'rejected', 'duplicate')
       GROUP BY assigned_team_id`
    );
    const doneRes = await query(
      `SELECT assigned_team_id AS team_id, COUNT(*)::int AS completed_tasks
       FROM reports WHERE assigned_team_id IS NOT NULL AND assigned_team_id != '' AND status = 'resolved'
       GROUP BY assigned_team_id`
    );
    const activeMap = Object.fromEntries(loadRes.rows.map((r) => [r.team_id, Number(r.active_tasks)]));
    const doneMap = Object.fromEntries(doneRes.rows.map((r) => [r.team_id, Number(r.completed_tasks)]));
    return teamsRes.rows.map((row) => ({
      ...rowToTeam(row),
      activeTasks: activeMap[row.id] || 0,
      completedTasks: doneMap[row.id] || 0,
    }));
  },

  async createTeam({ id, name, leaderId, memberIds, wardIds, vehicleType, vehicleCapacity, status }) {
    const teamId = id || `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await query(
      `INSERT INTO teams (id, name, leader_id, member_ids, ward_ids, vehicle_type, vehicle_capacity, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [teamId, name, leaderId || "", memberIds || [], wardIds || [], vehicleType || "", vehicleCapacity || "", status || "available"]
    );
    const res = await query("SELECT * FROM teams WHERE id = $1", [teamId]);
    return rowToTeam(res.rows[0]);
  },

  async updateTeam(id, updates) {
    const fieldMap = {
      name: "name", leaderId: "leader_id", memberIds: "member_ids", wardIds: "ward_ids",
      vehicleType: "vehicle_type", vehicleCapacity: "vehicle_capacity", status: "status",
    };
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [key, val] of Object.entries(updates)) {
      const col = fieldMap[key];
      if (!col) continue;
      setClauses.push(`${col} = $${i}`);
      values.push(typeof val === "object" ? JSON.stringify(val) : val);
      i++;
    }
    if (!setClauses.length) return this.getTeamById(id);
    setClauses.push("updated_at = NOW()");
    values.push(id);
    await query(`UPDATE teams SET ${setClauses.join(", ")} WHERE id = $${i}`, values);
    return this.getTeamById(id);
  },

  async getTeamById(id) {
    const res = await query("SELECT * FROM teams WHERE id = $1", [id]);
    return rowToTeam(res.rows[0]);
  },

  async deleteTeam(id) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE reports SET assigned_team_id = NULL, status = 'under_review', updated_at = NOW() WHERE assigned_team_id = $1 AND status IN ('assigned', 'en_route')",
        [id]
      );
      await client.query("DELETE FROM vehicles WHERE team_id = $1", [id]);
      await client.query("DELETE FROM teams WHERE id = $1", [id]);
      await client.query("COMMIT");
      return { ok: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async getRecyclingQueue() {
    const res = await query(
      `SELECT * FROM reports
       WHERE ai_recyclable_heavy = true AND status != 'duplicate'
       ORDER BY (recycling_status = '') DESC, priority_score DESC, created_at DESC`
    );
    return res.rows.map(rowToReport);
  },

  async routeToRecycler(reportId, partner) {
    await query(
      "UPDATE reports SET recycling_status = 'routed', recycling_partner = $2, recycling_routed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [reportId, partner]
    );
    return this.getReportById(reportId);
  },

  async getAdminAlerts(limit = 40) {
    const res = await query(`
      SELECT id, 'escalation' AS kind, 'Complaint escalated' AS title,
        COALESCE(NULLIF(location_address, ''), id) AS body, escalated_at AS created_at
      FROM reports WHERE escalated = true AND escalated_at IS NOT NULL
      UNION ALL
      SELECT id, 'hazard', 'Hazardous waste reported',
        COALESCE(NULLIF(location_address, ''), id), created_at
      FROM reports WHERE ai_hazard_flag = true AND status NOT IN ('resolved', 'rejected', 'duplicate')
      UNION ALL
      SELECT id, 'critical', 'Critical priority complaint open',
        COALESCE(NULLIF(location_address, ''), id), created_at
      FROM reports WHERE priority_score >= 80 AND status NOT IN ('resolved', 'rejected', 'duplicate') AND NOT ai_hazard_flag
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, reportId: r.id, createdAt: r.created_at }));
  },

  async getAnalytics() {
    const [
      totalRes, statusRes, categoryRes, severityRes, wardRes, timelineRes,
      openCurRes, openPrevRes, avgResCurRes, avgResPrevRes,
      escCurRes, escPrevRes, resTodayRes, resYesterdayRes, criticalOpenRes,
      resolutionBucketsRes, hotspotGrowthRes, recyclableRes,
      topCitizensRes, reportersRes, citizensCountRes, dupRes,
      slaRes, breachRes, teamPerfRes,
    ] = await Promise.all([
      query("SELECT COUNT(*)::int AS total FROM reports"),
      query("SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status ORDER BY count DESC"),
      query("SELECT ai_waste_type AS category, COUNT(*)::int AS count FROM reports WHERE status != 'duplicate' GROUP BY ai_waste_type ORDER BY count DESC"),
      query("SELECT ai_severity AS severity, COUNT(*)::int AS count FROM reports WHERE ai_severity != '' GROUP BY ai_severity ORDER BY count DESC"),
      query("SELECT COALESCE(NULLIF(location_ward_id, ''), 'unknown') AS ward, COUNT(*)::int AS count FROM reports GROUP BY ward ORDER BY count DESC"),
      query("SELECT DATE(created_at) AS date, COUNT(*)::int AS count FROM reports WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC"),
      // KPI: open complaints now vs as-of 7 days ago
      query("SELECT COUNT(*)::int AS n FROM reports WHERE status NOT IN ('resolved','rejected','duplicate')"),
      query(`SELECT COUNT(*)::int AS n FROM reports
             WHERE created_at < NOW() - INTERVAL '7 days'
             AND (status NOT IN ('resolved','rejected','duplicate') OR updated_at > NOW() - INTERVAL '7 days')`),
      // KPI: average resolution time (resolved in last 14d) vs prior 14d
      query("SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60), 0)::int AS mins FROM reports WHERE status = 'resolved' AND updated_at > NOW() - INTERVAL '14 days'"),
      query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60), 0)::int AS mins FROM reports
             WHERE status = 'resolved' AND updated_at <= NOW() - INTERVAL '14 days' AND updated_at > NOW() - INTERVAL '28 days'`),
      // KPI: escalations last 7d vs prior 7d
      query("SELECT COUNT(*)::int AS n FROM reports WHERE escalated = true AND escalated_at > NOW() - INTERVAL '7 days'"),
      query("SELECT COUNT(*)::int AS n FROM reports WHERE escalated = true AND escalated_at <= NOW() - INTERVAL '7 days' AND escalated_at > NOW() - INTERVAL '14 days'"),
      // KPI: resolved today vs yesterday
      query("SELECT COUNT(*)::int AS n FROM reports WHERE status = 'resolved' AND updated_at::date = CURRENT_DATE"),
      query("SELECT COUNT(*)::int AS n FROM reports WHERE status = 'resolved' AND updated_at::date = CURRENT_DATE - 1"),
      query("SELECT COUNT(*)::int AS n FROM reports WHERE status NOT IN ('resolved','rejected','duplicate') AND (priority_level IN ('high','critical') OR ai_hazard_flag = true)"),
      // Resolution-time distribution histogram
      query(`SELECT CASE
          WHEN mins < 120 THEN '0-2h'
          WHEN mins < 360 THEN '2-6h'
          WHEN mins < 720 THEN '6-12h'
          WHEN mins < 1440 THEN '12-24h'
          WHEN mins < 2880 THEN '1-2d'
          WHEN mins < 5760 THEN '2-4d'
          ELSE '4d+' END AS bucket,
        MIN(mins)::int AS ord, COUNT(*)::int AS count
        FROM (SELECT EXTRACT(EPOCH FROM (updated_at - created_at))/60 AS mins
              FROM reports WHERE status = 'resolved') t
        GROUP BY bucket ORDER BY ord ASC`),
      // Hotspot growth per week for top 5 zones
      query(`WITH top_zones AS (
          SELECT COALESCE(NULLIF(location_ward_id, ''), 'unknown') AS zone
          FROM reports GROUP BY zone ORDER BY COUNT(*) DESC LIMIT 5
        )
        SELECT tz.zone, DATE_TRUNC('week', r.created_at) AS week_start, COUNT(*)::int AS count
        FROM reports r
        JOIN top_zones tz ON tz.zone = COALESCE(NULLIF(r.location_ward_id, ''), 'unknown')
        WHERE r.created_at > NOW() - INTERVAL '42 days'
        GROUP BY tz.zone, week_start ORDER BY week_start ASC, tz.zone ASC`),
      query("SELECT COUNT(*)::int AS n FROM reports WHERE ai_recyclable_heavy = true AND status != 'duplicate' AND recycling_status = ''"),
      // ---- Role-wise: citizen engagement ----
      query(`SELECT u.uid, u.name, u.email, COUNT(r.id)::int AS reports,
               SUM(CASE WHEN r.status = 'resolved' THEN 1 ELSE 0 END)::int AS resolved
             FROM reports r JOIN users u ON r.citizen_id = u.uid
             GROUP BY u.uid, u.name, u.email ORDER BY reports DESC LIMIT 5`),
      query("SELECT COUNT(DISTINCT citizen_id)::int AS n FROM reports"),
      query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'citizen'"),
      query("SELECT COUNT(*)::int AS n FROM reports WHERE status = 'duplicate'"),
      // ---- Role-wise: SLA compliance (24h target, resolved last 30d) ----
      query(`SELECT COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (updated_at - created_at)) <= 86400)::int AS within_sla,
               COUNT(*)::int AS total
             FROM reports WHERE status = 'resolved' AND updated_at > NOW() - INTERVAL '30 days'`),
      query(`SELECT COUNT(*)::int AS n FROM reports
             WHERE status NOT IN ('resolved','rejected','duplicate') AND created_at < NOW() - INTERVAL '48 hours'`),
      // ---- Role-wise: per-team performance ----
      query(`SELECT t.name,
               COUNT(r.id)::int AS assigned,
               SUM(CASE WHEN r.status = 'resolved' THEN 1 ELSE 0 END)::int AS resolved,
               COALESCE(AVG(CASE WHEN r.status = 'resolved' THEN EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/60 END), 0)::int AS avg_mins
             FROM teams t LEFT JOIN reports r ON r.assigned_team_id = t.id
             GROUP BY t.id, t.name ORDER BY assigned DESC, t.name ASC`),
    ]);

    const trend = (current, previous) => {
      current = Number(current || 0); previous = Number(previous || 0);
      if (!previous) return { direction: current > 0 ? "up" : "flat", percent: null };
      const percent = Math.round(((current - previous) / previous) * 100);
      return { direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat", percent: Math.abs(percent) };
    };

    return {
      total: Number(totalRes.rows[0]?.total || 0),
      byStatus: statusRes.rows,
      byCategory: categoryRes.rows,
      bySeverity: severityRes.rows,
      byWard: wardRes.rows,
      timeline: timelineRes.rows,
      kpis: {
        openComplaints: { value: Number(openCurRes.rows[0]?.n || 0), trend: trend(openCurRes.rows[0]?.n, openPrevRes.rows[0]?.n) },
        avgResolutionMinutes: { value: Number(avgResCurRes.rows[0]?.mins || 0), trend: trend(avgResCurRes.rows[0]?.mins, avgResPrevRes.rows[0]?.mins) },
        escalatedCount: { value: Number(escCurRes.rows[0]?.n || 0), trend: trend(escCurRes.rows[0]?.n, escPrevRes.rows[0]?.n) },
        resolvedToday: { value: Number(resTodayRes.rows[0]?.n || 0), trend: trend(resTodayRes.rows[0]?.n, resYesterdayRes.rows[0]?.n) },
        criticalOpen: Number(criticalOpenRes.rows[0]?.n || 0),
        pendingRecycling: Number(recyclableRes.rows[0]?.n || 0),
      },
      resolutionBuckets: resolutionBucketsRes.rows.map((r) => ({ bucket: r.bucket, count: Number(r.count) })),
      hotspotGrowth: hotspotGrowthRes.rows.map((r) => ({ zone: r.zone, week: r.week_start, count: Number(r.count) })),
      // ---- Role-wise breakdowns (all computed live from DB) ----
      citizens: {
        totalReporters: Number(reportersRes.rows[0]?.n || 0),
        totalCitizens: Number(citizensCountRes.rows[0]?.n || 0),
        topContributors: topCitizensRes.rows.map((r) => ({
          uid: r.uid, name: r.name || "Citizen", email: r.email || "",
          reports: Number(r.reports || 0), resolved: Number(r.resolved || 0),
        })),
      },
      sla: {
        resolvedWithin24hPct: (() => {
          const w = Number(slaRes.rows[0]?.within_sla || 0);
          const t = Number(slaRes.rows[0]?.total || 0);
          return t ? Math.round((w / t) * 100) : null;
        })(),
        openBreached48h: Number(breachRes.rows[0]?.n || 0),
      },
      duplicateRatePct: (() => {
        const total = Number(totalRes.rows[0]?.total || 0);
        return total ? Math.round((Number(dupRes.rows[0]?.n || 0) / total) * 100) : 0;
      })(),
      teamPerformance: teamPerfRes.rows.map((r) => {
        const assigned = Number(r.assigned || 0);
        const resolved = Number(r.resolved || 0);
        return {
          name: r.name,
          assigned,
          resolved,
          resolutionRatePct: assigned ? Math.round((resolved / assigned) * 100) : 0,
          avgResolutionMins: Number(r.avg_mins || 0),
        };
      }),
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

  // Throttled by the caller; keeps the last-known position for dispatch queries.
  async saveWorkerLocation(uid, latitude, longitude) {
    await query(
      "UPDATE users SET current_lat = $1, current_lng = $2, last_location_at = NOW(), updated_at = NOW() WHERE uid = $3",
      [latitude, longitude, uid]
    );
  },

  // On-duty workers with a fresh GPS fix, nearest to the given point.
  async getNearbyWorkers(latitude, longitude, maxKm = 10) {
    const res = await query(
      `SELECT u.*, 
              (6371 * acos(least(1, greatest(-1,
                cos(radians($1)) * cos(radians(current_lat)) * cos(radians(current_lng) - radians($2))
                + sin(radians($1)) * sin(radians(current_lat)))))) AS distance_km
       FROM users u
       WHERE u.role = 'cleanup_worker' AND u.is_active <> false
         AND u.current_lat IS NOT NULL AND u.current_lng IS NOT NULL
         AND u.last_location_at > NOW() - INTERVAL '2 hours'
       ORDER BY distance_km ASC`,
      [latitude, longitude]
    );
    return res.rows
      .map((row) => ({ ...rowToUser(row), distanceKm: Math.round(Number(row.distance_km) * 100) / 100 }))
      .filter((w) => w.distanceKm <= maxKm);
  },
};
