import { query, getPool } from "./db.js";
import { createPasswordHash } from "./utils.js";
import { REPORT_STATUSES, ROLES } from "./constants.js";

const now = "2026-08-07T12:30:00+05:30";

const seedUsers = [
  { uid: "user-citizen", name: "Ananya Das", email: "citizen@swachhlens.app", phone: "+919876543210", role: ROLES.CITIZEN, ward_id: "ward-12", location_name: "Bhubaneswar, Unit 4" },
  { uid: "user-admin", name: "Municipal Admin", email: "admin@swachhlens.app", phone: "+919812340000", role: ROLES.ADMIN, ward_id: "ward-north", location_name: "Region North" },
  { uid: "user-worker", name: "Team Alpha", email: "worker@swachhlens.app", phone: "+919800001111", role: ROLES.CLEANUP_WORKER, ward_id: "ward-12", location_name: "Ward 12" },
];

const seedPasswords = { "user-citizen": "citizen123", "user-admin": "admin123", "user-worker": "worker123" };

const seedTeams = [
  { id: "team-07", name: "Sanitation Team 07", leader_id: "worker-leader-07", member_ids: ["worker-07-a","worker-07-b","worker-07-c","worker-07-d"], ward_ids: ["ward-12","ward-13"], vehicle_type: "Mini Tipper", vehicle_capacity: "medium", status: "available", current_location_latitude: 20.2978, current_location_longitude: 85.8265, current_location_label: "Ward 12 Depot", completed_today: 6, average_resolution_time: 78, eta_minutes: 12, distance_km: 1.8, ai_match_score: 94 },
  { id: "team-03", name: "Rapid Response 03", leader_id: "worker-leader-03", member_ids: ["worker-03-a","worker-03-b","worker-03-c"], ward_ids: ["ward-north","ward-09"], vehicle_type: "Flatbed", vehicle_capacity: "large", status: "en_route", current_location_latitude: 20.3018, current_location_longitude: 85.8215, current_location_label: "Unit 1 Market", current_assignment_id: "REP-992A", completed_today: 4, average_resolution_time: 92, eta_minutes: 18, distance_km: 3.1, ai_match_score: 82 },
  { id: "team-alpha", name: "Team Alpha", leader_id: "user-worker", member_ids: ["worker-alpha-a","worker-alpha-b","worker-alpha-c","worker-alpha-d"], ward_ids: ["ward-12"], vehicle_type: "Mini Tipper", vehicle_capacity: "medium", status: "assigned", current_location_latitude: 20.2961, current_location_longitude: 85.8245, current_location_label: "1420 Main St", current_assignment_id: "REP-28491", completed_today: 3, average_resolution_time: 86, eta_minutes: 15, distance_km: 1.2, ai_match_score: 91 },
];

const seedReports = [
  { id: "REP-28491", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-28491/before.jpg", location_latitude: 20.2961, location_longitude: 85.8245, location_address: "452 Main St, Alleyway", location_ward_id: "ward-12", location_locality: "Unit 4", citizen_comment: "The pile has grown since yesterday evening.", ai_waste_type: "plastic_waste", ai_confidence: 94, ai_estimated_volume: "large", ai_estimated_volume_range: "2.0 - 2.8 cubic meters", ai_severity: "high", ai_potential_risks: ["Blocked alleyway","Pedestrian obstruction"], ai_recommendation: "Assign mini tipper and 4-worker team within 30 minutes.", priority_score: 88, priority_level: "high", priority_reasons: ["Large waste volume","Road obstruction","Recent duplicate support"], duplicate_is_potential: false, status: REPORT_STATUSES.ASSIGNED, assigned_team_id: "team-07", status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-07T09:14:00+05:30"},{status:"ai_analyzed",at:"2026-08-07T09:15:00+05:30"},{status:"under_review",at:"2026-08-07T09:45:00+05:30"},{status:"assigned",at:"2026-08-07T10:02:00+05:30"}]) },
  { id: "REP-992A", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-992A/before.jpg", location_latitude: 20.3018, location_longitude: 85.8215, location_address: "Behind City Hospital, Sector 2", location_ward_id: "ward-north", location_locality: "Sector 2", citizen_comment: "Sharp materials and red bags are visible.", ai_waste_type: "hazardous_waste", ai_confidence: 97, ai_estimated_volume: "very_large", ai_estimated_volume_range: "2.8 - 3.5 cubic meters", ai_severity: "critical", ai_potential_risks: ["Hazardous material","Hospital proximity"], ai_recommendation: "Escalate to hazardous waste unit immediately.", priority_score: 96, priority_level: "critical", priority_reasons: ["Hazardous waste detected","Hospital nearby","Very large waste volume"], duplicate_is_potential: true, duplicate_primary_report_id: "REP-28491", duplicate_similarity_score: 0.42, duplicate_distance_meters: 480, status: REPORT_STATUSES.UNDER_REVIEW, status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-07T11:20:00+05:30"},{status:"ai_analyzed",at:"2026-08-07T11:22:00+05:30"},{status:"under_review",at:"2026-08-07T11:26:00+05:30"}]) },
  { id: "REP-18012", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-18012/before.jpg", location_latitude: 20.2955, location_longitude: 85.8310, location_address: "Centennial Park", location_ward_id: "ward-12", location_locality: "Park Belt", citizen_comment: "The bin is full every evening.", ai_waste_type: "overflowing_bin", ai_confidence: 89, ai_estimated_volume: "medium", ai_estimated_volume_range: "0.8 - 1.4 cubic meters", ai_severity: "medium", ai_potential_risks: ["Fly infestation"], ai_recommendation: "Standard truck and two-worker pickup this shift.", priority_score: 63, priority_level: "medium", priority_reasons: ["Overflow recurring in a public area"], status: REPORT_STATUSES.RESOLVED, assigned_team_id: "team-03", after_image_url: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80", after_storage_path: "cleanup/REP-18012/after.jpg", status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-05T14:32:00+05:30"},{status:"ai_analyzed",at:"2026-08-05T14:34:00+05:30"},{status:"under_review",at:"2026-08-05T14:50:00+05:30"},{status:"assigned",at:"2026-08-05T15:05:00+05:30"},{status:"en_route",at:"2026-08-05T15:15:00+05:30"},{status:"cleanup_in_progress",at:"2026-08-05T15:32:00+05:30"},{status:"verification",at:"2026-08-05T16:10:00+05:30"},{status:"resolved",at:"2026-08-06T10:15:00+05:30"}]) },
];

const seedNotifications = [
  { id: "note-1", user_id: "user-citizen", title: "Team assigned", body: "Sanitation Team 07 has been assigned to your latest report." },
  { id: "note-2", user_id: "user-admin", title: "Hazard alert", body: "A new hazardous waste complaint needs review." },
];

export async function seedDatabase() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT COUNT(*) FROM users");
    if (Number(existing.rows[0].count) > 0) {
      await client.query("ROLLBACK");
      console.log("Database already seeded, skipping.");
      return;
    }

    for (const u of seedUsers) {
      const { salt, passwordHash } = createPasswordHash(seedPasswords[u.uid]);
      await client.query(
        `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, ward_id, location_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [u.uid, u.name, u.email, u.phone, passwordHash, salt, u.role, u.ward_id, u.location_name]
      );
    }

    for (const t of seedTeams) {
      await client.query(
        `INSERT INTO teams (id, name, leader_id, member_ids, ward_ids, vehicle_type, vehicle_capacity, status, current_location_latitude, current_location_longitude, current_location_label, current_assignment_id, completed_today, average_resolution_time, eta_minutes, distance_km, ai_match_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [t.id, t.name, t.leader_id, t.member_ids, t.ward_ids, t.vehicle_type, t.vehicle_capacity, t.status, t.current_location_latitude, t.current_location_longitude, t.current_location_label, t.current_assignment_id || null, t.completed_today, t.average_resolution_time, t.eta_minutes, t.distance_km, t.ai_match_score]
      );
    }

    for (const r of seedReports) {
      await client.query(
        `INSERT INTO reports (id, citizen_id, media_image_url, media_thumbnail_url, media_storage_path, location_latitude, location_longitude, location_address, location_ward_id, location_locality, citizen_comment, ai_waste_type, ai_confidence, ai_estimated_volume, ai_estimated_volume_range, ai_severity, ai_potential_risks, ai_recommendation, priority_score, priority_level, priority_reasons, duplicate_is_potential, duplicate_primary_report_id, duplicate_similarity_score, duplicate_distance_meters, status, assigned_team_id, after_image_url, after_storage_path, status_timeline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
        [r.id, r.citizen_id, r.media_image_url, r.media_thumbnail_url || "", r.media_storage_path, r.location_latitude, r.location_longitude, r.location_address, r.location_ward_id, r.location_locality, r.citizen_comment, r.ai_waste_type, r.ai_confidence, r.ai_estimated_volume, r.ai_estimated_volume_range, r.ai_severity, r.ai_potential_risks, r.ai_recommendation, r.priority_score, r.priority_level, r.priority_reasons, r.duplicate_is_potential, r.duplicate_primary_report_id || "", r.duplicate_similarity_score || 0, r.duplicate_distance_meters || 0, r.status, r.assigned_team_id || null, r.after_image_url || "", r.after_storage_path || "", r.status_timeline]
      );
    }

    for (const n of seedNotifications) {
      await client.query(
        `INSERT INTO notifications (id, user_id, title, body) VALUES ($1,$2,$3,$4)`,
        [n.id, n.user_id, n.title, n.body]
      );
    }

    await client.query("COMMIT");
    console.log("Database seeded successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
