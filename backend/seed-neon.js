import { query, getPool } from "./db.js";
import { createPasswordHash, passwordMatches, calculatePriority } from "./utils.js";
import { REPORT_STATUSES, ROLES } from "./constants.js";
import { store } from "./store.js";

const seedUsers = [
  { uid: "user-citizen", name: "Ananya Das", email: "citizen@swachhlens.app", phone: "+919876543210", role: ROLES.CITIZEN, ward_id: "ward-12", location_name: "Bhubaneswar, Unit 4" },
  { uid: "user-admin", name: "Command Center Admin", email: "admin@swachhlens.demo", phone: "+919812340000", role: ROLES.SUPER_ADMIN, ward_id: "ward-north", location_name: "Region North" },
  { uid: "user-worker", name: "Team Alpha", email: "worker@swachhlens.app", phone: "+919800001111", role: ROLES.CLEANUP_WORKER, ward_id: "ward-12", location_name: "Ward 12" },
];

const seedPasswords = { "user-citizen": "citizen123", "user-admin": "admin@809", "user-worker": "worker123" };

const seedTeams = [
  { id: "team-07", name: "Sanitation Team 07", leader_id: "worker-leader-07", member_ids: ["worker-07-a","worker-07-b","worker-07-c","worker-07-d"], ward_ids: ["ward-12","ward-13"], vehicle_type: "Mini Tipper", vehicle_capacity: "medium", status: "available", current_location_latitude: 20.2978, current_location_longitude: 85.8265, current_location_label: "Ward 12 Depot", completed_today: 6, average_resolution_time: 78, eta_minutes: 12, distance_km: 1.8, ai_match_score: 94 },
  { id: "team-03", name: "Rapid Response 03", leader_id: "worker-leader-03", member_ids: ["worker-03-a","worker-03-b","worker-03-c"], ward_ids: ["ward-north","ward-09"], vehicle_type: "Flatbed", vehicle_capacity: "large", status: "en_route", current_location_latitude: 20.3018, current_location_longitude: 85.8215, current_location_label: "Unit 1 Market", current_assignment_id: "REP-992A", completed_today: 4, average_resolution_time: 92, eta_minutes: 18, distance_km: 3.1, ai_match_score: 82 },
  { id: "team-alpha", name: "Team Alpha", leader_id: "user-worker", member_ids: ["worker-alpha-a","worker-alpha-b","worker-alpha-c","worker-alpha-d"], ward_ids: ["ward-12"], vehicle_type: "Mini Tipper", vehicle_capacity: "medium", status: "assigned", current_location_latitude: 20.2961, current_location_longitude: 85.8245, current_location_label: "1420 Main St", current_assignment_id: "REP-28491", completed_today: 3, average_resolution_time: 86, eta_minutes: 15, distance_km: 1.2, ai_match_score: 91 },
];

const seedReports = [
  { id: "REP-28491", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-28491/before.jpg", location_latitude: 20.2961, location_longitude: 85.8245, location_address: "452 Main St, Alleyway", location_ward_id: "ward-12", location_locality: "Unit 4", citizen_comment: "The pile has grown since yesterday evening.", ai_waste_type: "plastic_waste", ai_confidence: 94, ai_estimated_volume: "large", ai_estimated_volume_range: "2.0 - 2.8 cubic meters", ai_severity: "high", ai_potential_risks: ["Blocked alleyway","Pedestrian obstruction"], ai_recommendation: "Assign mini tipper and 4-worker team within 30 minutes.", duplicate_is_potential: false, status: REPORT_STATUSES.ASSIGNED, assigned_team_id: "team-07", status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-07T09:14:00+05:30"},{status:"ai_analyzed",at:"2026-08-07T09:15:00+05:30"},{status:"under_review",at:"2026-08-07T09:45:00+05:30"},{status:"assigned",at:"2026-08-07T10:02:00+05:30"}]) },
  { id: "REP-992A", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1584473457493-17c9d39d1f68?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-992A/before.jpg", location_latitude: 20.3018, location_longitude: 85.8215, location_address: "Behind City Hospital, Sector 2", location_ward_id: "ward-north", location_locality: "Sector 2", citizen_comment: "Sharp materials and red bags are visible.", ai_waste_type: "hazardous_waste", ai_confidence: 97, ai_estimated_volume: "very_large", ai_estimated_volume_range: "2.8 - 3.5 cubic meters", ai_severity: "critical", ai_potential_risks: ["Hazardous material","Hospital proximity"], ai_recommendation: "Escalate to hazardous waste unit immediately.", duplicate_is_potential: true, duplicate_primary_report_id: "REP-28491", duplicate_similarity_score: 0.42, duplicate_distance_meters: 480, status: REPORT_STATUSES.UNDER_REVIEW, status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-07T11:20:00+05:30"},{status:"ai_analyzed",at:"2026-08-07T11:22:00+05:30"},{status:"under_review",at:"2026-08-07T11:26:00+05:30"}]) },
  { id: "REP-18012", citizen_id: "user-citizen", media_image_url: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=1200&q=80", media_thumbnail_url: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=400&q=80", media_storage_path: "reports/user-citizen/REP-18012/before.jpg", location_latitude: 20.2955, location_longitude: 85.8310, location_address: "Centennial Park", location_ward_id: "ward-12", location_locality: "Park Belt", citizen_comment: "The bin is full every evening.", ai_waste_type: "overflowing_bin", ai_confidence: 89, ai_estimated_volume: "medium", ai_estimated_volume_range: "0.8 - 1.4 cubic meters", ai_severity: "medium", ai_potential_risks: ["Fly infestation"], ai_recommendation: "Standard truck and two-worker pickup this shift.", duplicate_is_potential: false, status: REPORT_STATUSES.RESOLVED, assigned_team_id: "team-03", after_image_url: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80", after_storage_path: "cleanup/REP-18012/after.jpg", status_timeline: JSON.stringify([{status:"submitted",at:"2026-08-05T14:32:00+05:30"},{status:"ai_analyzed",at:"2026-08-05T14:34:00+05:30"},{status:"under_review",at:"2026-08-05T14:50:00+05:30"},{status:"assigned",at:"2026-08-05T15:05:00+05:30"},{status:"en_route",at:"2026-08-05T15:15:00+05:30"},{status:"cleanup_in_progress",at:"2026-08-05T15:32:00+05:30"},{status:"verification",at:"2026-08-05T16:10:00+05:30"},{status:"resolved",at:"2026-08-06T10:15:00+05:30"}]) },
];

const seedNotifications = [
  { id: "note-1", user_id: "user-citizen", title: "Team assigned", body: "Sanitation Team 07 has been assigned to your latest report." },
  { id: "note-2", user_id: "user-admin", title: "Hazard alert", body: "A new hazardous waste complaint needs review." },
];

// ---- Deterministic PRNG so demo data is stable across reseeds ----
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = [
  { wardId: "ward-12", locality: "Unit 4", lat: 20.2961, lng: 85.8245, addresses: ["452 Main St, Alleyway", "Unit 4 Market Road", "Near Unit 4 Govt School", "Unit 4 Bus Stop Lane", "Sishu Bhavan Square"] },
  { wardId: "ward-north", locality: "Sector 2", lat: 20.3018, lng: 85.8215, addresses: ["Behind City Hospital, Sector 2", "Sector 2 Weekly Market", "VSS Marg Footpath", "Sector 2 Children Park Gate", "Capital Hospital Back Road"] },
  { wardId: "ward-09", locality: "Old Town", lat: 20.2880, lng: 85.8330, addresses: ["Lingaraj Temple Outer Path", "Old Town Post Office Lane", "Bindu Sagar Ghat", "Rameswar Patna Street"] },
  { wardId: "ward-13", locality: "Patia", lat: 20.3080, lng: 85.8180, addresses: ["Patia Chowk Service Road", "KIIT Square Underpass", "Patia Daily Market", "Nandan Vihar Main Gate"] },
  { wardId: "ward-07", locality: "Kharavela Nagar", lat: 20.2760, lng: 85.8400, addresses: ["Kharavela Nagar Park", "BJB College Back Gate", "Ram Mandir Lane", "Master Canteen North Fence"] },
];

const WASTE_PROFILES = [
  { type: "plastic_waste", volumes: ["small", "medium", "large"], severities: ["low", "medium", "high"], recyclableChance: 0.35, labels: [["plastic_bottle", 14], ["carry_bag", 9], ["food_wrapper", 22]] },
  { type: "organic_waste", volumes: ["medium", "large", "very_large"], severities: ["medium", "high"], recyclableChance: 0.05, labels: [["food_waste", 31], ["leaf_litter", 18], ["fruit_peel", 12]] },
  { type: "overflowing_bin", volumes: ["small", "medium"], severities: ["medium"], recyclableChance: 0.2, labels: [["mixed_household", 26], ["bin_overflow", 1]] },
  { type: "construction_debris", volumes: ["large", "very_large"], severities: ["high", "critical"], recyclableChance: 0.55, labels: [["rubble", 40], ["brick_chunk", 15], ["cement_bag", 6]] },
  { type: "e_waste", volumes: ["small", "medium"], severities: ["medium", "high"], recyclableChance: 0.95, labels: [["crt_monitor", 1], ["circuit_board", 4], ["cable_bundle", 8]] },
  { type: "hazardous_waste", volumes: ["medium", "large", "very_large"], severities: ["critical", "high"], recyclableChance: 0.05, labels: [["paint_can", 3], ["battery_pack", 5], ["medical_bag", 2]] },
  { type: "drain_blockage", volumes: ["medium", "large"], severities: ["high", "critical"], recyclableChance: 0, labels: [["silt_mass", 22], ["plastic_clog", 9]] },
];

const BEFORE_IMAGES = [
  "photo-1532996122724-e3c354a0b15b", "photo-1584473457493-17c9d39d1f68", "photo-1492496913980-501348b61469",
  "photo-1618477388954-7852f32655ec", "photo-1605600659908-0ef719419d41", "photo-1523567830207-96731740fa71",
  "photo-1563720223185-11003d516935", "photo-1595267013939-9ab7438e3bdb", "photo-1571727153934-b9e0059b7ab2",
];
const AFTER_IMAGES = [
  "photo-1488521787991-ed7bbaae773c", "photo-1518005020951-eccb494ad742", "photo-1449824913935-59a10b8d2000",
  "photo-1502082553048-f009c37129b9", "photo-1497250681960-ef046c08a56e",
];
const img = (id, w) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

function iso(msAgo) {
  return new Date(Date.now() - msAgo).toISOString();
}

function buildTimeline(status, createdAtMs, rnd) {
  const steps = [];
  const t = (offsetMin) => createdAtMs + offsetMin * 60000;
  let cursor = 0;
  const push = (label, atMs) => { steps.push({ status: label, at: new Date(atMs).toISOString() }); };
  push("submitted", t(cursor));
  cursor += 1 + Math.floor(rnd() * 3);
  push("ai_analyzed", t(cursor));
  const path = {
    submitted: [],
    under_review: [REPORT_STATUSES.UNDER_REVIEW],
    assigned: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED],
    en_route: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED, REPORT_STATUSES.EN_ROUTE],
    cleanup_in_progress: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED, REPORT_STATUSES.EN_ROUTE, REPORT_STATUSES.CLEANUP_IN_PROGRESS],
    verification: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED, REPORT_STATUSES.EN_ROUTE, REPORT_STATUSES.CLEANUP_IN_PROGRESS, REPORT_STATUSES.VERIFICATION],
    resolved: [REPORT_STATUSES.UNDER_REVIEW, REPORT_STATUSES.ASSIGNED, REPORT_STATUSES.EN_ROUTE, REPORT_STATUSES.CLEANUP_IN_PROGRESS, REPORT_STATUSES.VERIFICATION, REPORT_STATUSES.RESOLVED],
    rejected: [REPORT_STATUSES.REJECTED],
    duplicate: [REPORT_STATUSES.DUPLICATE],
  }[status] || [];
  for (const step of path) {
    cursor += 15 + Math.floor(rnd() * 240);
    push(step, t(cursor));
  }
  return { timeline: steps, lastAtMs: t(cursor) };
}

function generateDemoReports(count) {
  const rnd = mulberry32(20260821);
  const reports = [];
  const nowMs = Date.now();
  const dayMs = 86400000;

  // Plan statuses deterministically.
  const plan = [];
  const statusPlan = [
    ...Array(16).fill("resolved"), ...Array(2).fill("verification"),
    ...Array(2).fill("cleanup_in_progress"), ...Array(2).fill("en_route"),
    ...Array(4).fill("assigned"), ...Array(6).fill("under_review"),
    ...Array(5).fill("submitted"), ...Array(2).fill("rejected"),
  ];
  for (let i = 0; i < count - 3; i++) plan.push(statusPlan[i % statusPlan.length]);

  for (let i = 0; i < plan.length; i++) {
    const status = plan[i];
    const zone = ZONES[Math.floor(rnd() * ZONES.length)];
    const profile = WASTE_PROFILES[Math.floor(rnd() * WASTE_PROFILES.length)];
    const address = zone.addresses[Math.floor(rnd() * zone.addresses.length)];
    const volume = profile.volumes[Math.floor(rnd() * profile.volumes.length)];
    const severity = profile.severities[Math.floor(rnd() * profile.severities.length)];
    const ageDays = status === "resolved" ? 1 + rnd() * 29 : rnd() * 6;
    const createdAtMs = nowMs - ageDays * dayMs - Math.floor(rnd() * dayMs);
    const id = `REP-D${String(1000 + i)}`;
    const confidence = 72 + Math.floor(rnd() * 26);
    const hazardFlag = profile.type === "hazardous_waste" || profile.type === "drain_blockage";
    const recyclableHeavy = rnd() < profile.recyclableChance;
    const risks = [];
    if (volume === "large" || volume === "very_large") risks.push("Road obstruction");
    if (/hospital/i.test(address)) risks.push("Hospital proximity");
    if (/school|college/i.test(address)) risks.push("School nearby");
    if (hazardFlag) risks.push("Hazardous material");
    if (!risks.length) risks.push("Hygiene risk to pedestrians");
    const detectionSummary = {
      model: "yolov8n-waste",
      objects: profile.labels.map(([label, areaPct]) => ({ label, approxAreaPct: areaPct })),
      sceneLighting: rnd() > 0.5 ? "daylight" : "low_light",
    };

    const analysis = {
      wasteType: profile.type,
      confidence,
      estimatedVolume: volume,
      estimatedVolumeRange: volume === "very_large" ? "2.8 - 3.5 cubic meters" : volume === "large" ? "2.0 - 2.8 cubic meters" : volume === "medium" ? "0.8 - 1.4 cubic meters" : "0.2 - 0.6 cubic meters",
      severity,
      potentialRisks: risks,
      recommendation: hazardFlag ? "Deploy trained crew with protective equipment." : recyclableHeavy ? "Route recoverable material to recycling partner after pickup." : "Standard pickup within routine SLA.",
      hazardFlag,
      recyclableHeavy,
      detectionSummary,
    };
    const priority = calculatePriority(analysis, { address, duplicateSupportCount: 0, ageHours: 0 });

    const { timeline, lastAtMs } = buildTimeline(status, createdAtMs, rnd);
    const resolved = status === "resolved";
    const afterImage = resolved || status === "verification" ? AFTER_IMAGES[Math.floor(rnd() * AFTER_IMAGES.length)] : null;

    reports.push({
      id,
      citizen_id: "user-citizen",
      media_image_url: img(BEFORE_IMAGES[Math.floor(rnd() * BEFORE_IMAGES.length)], 1200),
      media_thumbnail_url: img(BEFORE_IMAGES[Math.floor(rnd() * BEFORE_IMAGES.length)], 400),
      media_storage_path: `reports/user-citizen/${id}/before.jpg`,
      location_latitude: Number((zone.lat + (rnd() - 0.5) * 0.012).toFixed(6)),
      location_longitude: Number((zone.lng + (rnd() - 0.5) * 0.012).toFixed(6)),
      location_address: address,
      location_ward_id: zone.wardId,
      location_locality: zone.locality,
      citizen_comment: rnd() > 0.4 ? "Requesting quick cleanup, this spot is used by many people daily." : "",
      ai_waste_type: profile.type,
      ai_confidence: confidence,
      ai_estimated_volume: volume,
      ai_estimated_volume_range: analysis.estimatedVolumeRange,
      ai_severity: severity,
      ai_potential_risks: risks,
      ai_recommendation: analysis.recommendation,
      ai_hazard_flag: hazardFlag,
      ai_recyclable_heavy: recyclableHeavy,
      ai_detection_summary: JSON.stringify(detectionSummary),
      priority_score: priority.score,
      priority_level: priority.level,
      priority_reasons: priority.reasons,
      duplicate_is_potential: false,
      status,
      assigned_team_id: ["assigned", "en_route", "cleanup_in_progress", "verification", "resolved"].includes(status) ? ["team-07", "team-03", "team-alpha"][Math.floor(rnd() * 3)] : null,
      after_image_url: afterImage ? img(afterImage, 1200) : "",
      after_storage_path: afterImage ? `cleanup/${id}/after.jpg` : "",
      escalated: false,
      escalated_at: null,
      recycling_status: "",
      recycling_partner: "",
      created_at: new Date(createdAtMs).toISOString(),
      updated_at: new Date(lastAtMs).toISOString(),
      status_timeline: JSON.stringify(timeline),
    });
  }

  // Duplicate clusters: attach 2 potential duplicates to the first two open reports.
  const openRoots = reports.filter((r) => ["submitted", "under_review"].includes(r.status)).slice(0, 2);
  openRoots.forEach((root, idx) => {
    for (let k = 0; k < 2; k++) {
      const dupIdx = reports.length;
      const zone = ZONES.find((z) => z.wardId === root.location_ward_id) || ZONES[0];
      const profile = WASTE_PROFILES.find((p) => p.type === root.ai_waste_type) || WASTE_PROFILES[0];
      const id = `REP-D${String(1000 + dupIdx)}`;
      const createdAtMs = new Date(root.created_at).getTime() + (30 + k * 90) * 60000;
      const { timeline, lastAtMs } = buildTimeline("submitted", createdAtMs, rnd);
      reports.push({
        id,
        citizen_id: "user-citizen",
        media_image_url: root.media_image_url,
        media_thumbnail_url: root.media_thumbnail_url,
        media_storage_path: `reports/user-citizen/${id}/before.jpg`,
        location_latitude: Number((root.location_latitude + (rnd() - 0.5) * 0.004).toFixed(6)),
        location_longitude: Number((root.location_longitude + (rnd() - 0.5) * 0.004).toFixed(6)),
        location_address: root.location_address,
        location_ward_id: zone.wardId,
        location_locality: zone.locality,
        citizen_comment: "Same pile, adding my report too.",
        ai_waste_type: profile.type,
        ai_confidence: 70 + Math.floor(rnd() * 20),
        ai_estimated_volume: root.ai_estimated_volume,
        ai_estimated_volume_range: root.ai_estimated_volume_range,
        ai_severity: root.ai_severity,
        ai_potential_risks: root.ai_potential_risks,
        ai_recommendation: root.ai_recommendation,
        ai_hazard_flag: root.ai_hazard_flag,
        ai_recyclable_heavy: root.ai_recyclable_heavy,
        ai_detection_summary: root.ai_detection_summary,
        priority_score: Math.max(10, root.priority_score - 12),
        priority_level: root.priority_level === "critical" ? "high" : root.priority_level,
        priority_reasons: root.priority_reasons,
        duplicate_is_potential: true,
        duplicate_primary_report_id: root.id,
        duplicate_similarity_score: Number((0.62 + rnd() * 0.28).toFixed(2)),
        duplicate_distance_meters: 60 + Math.floor(rnd() * 320),
        status: "submitted",
        assigned_team_id: null,
        after_image_url: "",
        after_storage_path: "",
        escalated: false,
        escalated_at: null,
        recycling_status: "",
        recycling_partner: "",
        created_at: new Date(createdAtMs).toISOString(),
        updated_at: new Date(lastAtMs).toISOString(),
        status_timeline: JSON.stringify(timeline),
      });
    }
    void idx;
  });

  // One already-merged duplicate for history.
  const mergeRoot = reports.find((r) => r.status === "resolved");
  if (mergeRoot) {
    const id = `REP-D${String(1000 + reports.length)}`;
    const createdAtMs = new Date(mergeRoot.created_at).getTime() + 45 * 60000;
    reports.push({
      id,
      citizen_id: "user-citizen",
      media_image_url: mergeRoot.media_image_url,
      media_thumbnail_url: mergeRoot.media_thumbnail_url,
      media_storage_path: `reports/user-citizen/${id}/before.jpg`,
      location_latitude: Number((mergeRoot.location_latitude + 0.001).toFixed(6)),
      location_longitude: Number((mergeRoot.location_longitude - 0.001).toFixed(6)),
      location_address: mergeRoot.location_address,
      location_ward_id: mergeRoot.location_ward_id,
      location_locality: mergeRoot.location_locality,
      citizen_comment: "",
      ai_waste_type: mergeRoot.ai_waste_type,
      ai_confidence: mergeRoot.ai_confidence,
      ai_estimated_volume: mergeRoot.ai_estimated_volume,
      ai_estimated_volume_range: mergeRoot.ai_estimated_volume_range,
      ai_severity: mergeRoot.ai_severity,
      ai_potential_risks: mergeRoot.ai_potential_risks,
      ai_recommendation: mergeRoot.ai_recommendation,
      ai_hazard_flag: mergeRoot.ai_hazard_flag,
      ai_recyclable_heavy: mergeRoot.ai_recyclable_heavy,
      ai_detection_summary: mergeRoot.ai_detection_summary,
      priority_score: Math.max(10, mergeRoot.priority_score - 15),
      priority_level: mergeRoot.priority_level,
      priority_reasons: mergeRoot.priority_reasons,
      duplicate_is_potential: true,
      duplicate_primary_report_id: mergeRoot.id,
      duplicate_similarity_score: 0.81,
      duplicate_distance_meters: 140,
      status: "duplicate",
      assigned_team_id: null,
      after_image_url: "",
      after_storage_path: "",
      escalated: false,
      escalated_at: null,
      recycling_status: "",
      recycling_partner: "",
      created_at: new Date(createdAtMs).toISOString(),
      updated_at: new Date(createdAtMs + 3600000).toISOString(),
      status_timeline: JSON.stringify([
        { status: "submitted", at: new Date(createdAtMs).toISOString() },
        { status: "ai_analyzed", at: new Date(createdAtMs + 120000).toISOString() },
        { status: "duplicate", at: new Date(createdAtMs + 3600000).toISOString() },
      ]),
    });
  }

  // Escalate 3 high-priority open complaints.
  const escalateTargets = reports.filter((r) => !r.duplicate_is_potential && ["submitted", "under_review", "assigned"].includes(r.status)).slice(0, 3);
  for (const target of escalateTargets) {
    target.escalated = true;
    target.escalated_at = new Date(new Date(target.updated_at).getTime() + 1800000).toISOString();
    target.status_timeline = JSON.stringify([...JSON.parse(target.status_timeline), { status: "escalated", at: target.escalated_at }]);
  }

  // Route a couple of recyclable-heavy resolved reports to partners.
  const recycleTargets = reports.filter((r) => r.ai_recyclable_heavy && r.status === "resolved").slice(0, 2);
  const partners = ["GreenCycle Pvt Ltd", "EcoWaste Processors"];
  recycleTargets.forEach((target, i) => {
    target.recycling_status = "routed";
    target.recycling_partner = partners[i % partners.length];
  });

  return reports;
}

async function ensureDemoPasswords(client) {
  for (const u of seedUsers) {
    const res = await client.query("SELECT password_hash, salt FROM users WHERE uid = $1", [u.uid]);
    const row = res.rows[0];
    if (!row) continue;
    const valid = row.password_hash && row.salt && await passwordMatches({ passwordHash: row.password_hash, salt: row.salt }, seedPasswords[u.uid]);
    if (!valid) {
      const { salt, passwordHash } = await createPasswordHash(seedPasswords[u.uid]);
      await client.query("UPDATE users SET password_hash = $1, salt = $2 WHERE uid = $3", [passwordHash, salt, u.uid]);
      console.log(`Repaired login credentials for ${u.email}.`);
    }
  }
}

// Demo seeding gate: production databases must never auto-fill with fake
// reports/accounts. Seeding runs only outside production, or explicitly via
// SEED_DEMO_DATA=true (e.g. staging/demo deployments).
const SEEDING_ALLOWED =
  process.env.SEED_DEMO_DATA === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_DATA !== "false");

export async function seedDatabase() {
  if (!SEEDING_ALLOWED) {
    console.log("[seed] skipped (production / SEED_DEMO_DATA not enabled).");
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingUsers = await client.query("SELECT COUNT(*) AS n FROM users");
    const isFirstSeed = Number(existingUsers.rows[0].n) === 0;

    if (isFirstSeed) {
      for (const u of seedUsers) {
        const { salt, passwordHash } = await createPasswordHash(seedPasswords[u.uid]);
        await client.query(
          `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, ward_id, location_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [u.uid, u.name, u.email, u.phone, passwordHash, salt, u.role, u.ward_id, u.location_name]
        );
      }
      console.log("Seed users created.");
    } else {
      await ensureDemoPasswords(client);
    }

    for (const t of seedTeams) {
      await client.query(
        `INSERT INTO teams (id, name, leader_id, member_ids, ward_ids, vehicle_type, vehicle_capacity, status, current_location_latitude, current_location_longitude, current_location_label, current_assignment_id, completed_today, average_resolution_time, eta_minutes, distance_km, ai_match_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (id) DO NOTHING`,
        [t.id, t.name, t.leader_id, t.member_ids, t.ward_ids, t.vehicle_type, t.vehicle_capacity, t.status, t.current_location_latitude, t.current_location_longitude, t.current_location_label, t.current_assignment_id || null, t.completed_today, t.average_resolution_time, t.eta_minutes, t.distance_km, t.ai_match_score]
      );
    }

    const existingReports = await client.query("SELECT COUNT(*) AS n FROM reports");
    const reportCount = Number(existingReports.rows[0].n);

    if (reportCount < 10) {
      const baseCount = isFirstSeed ? 0 : reportCount;
      const demoReports = [...seedReports, ...generateDemoReports(Math.max(0, 45 - baseCount))];
      for (const r of demoReports) {
        await client.query(
          `INSERT INTO reports (id, citizen_id, media_image_url, media_thumbnail_url, media_storage_path, location_latitude, location_longitude, location_address, location_ward_id, location_locality, citizen_comment, ai_waste_type, ai_confidence, ai_estimated_volume, ai_estimated_volume_range, ai_severity, ai_potential_risks, ai_recommendation, ai_hazard_flag, ai_recyclable_heavy, ai_detection_summary, priority_score, priority_level, priority_reasons, duplicate_is_potential, duplicate_primary_report_id, duplicate_similarity_score, duplicate_distance_meters, status, assigned_team_id, after_image_url, after_storage_path, escalated, escalated_at, recycling_status, recycling_partner, created_at, updated_at, status_timeline)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
           ON CONFLICT (id) DO NOTHING`,
          [r.id, r.citizen_id, r.media_image_url, r.media_thumbnail_url || "", r.media_storage_path, r.location_latitude, r.location_longitude, r.location_address, r.location_ward_id, r.location_locality, r.citizen_comment || "", r.ai_waste_type, r.ai_confidence, r.ai_estimated_volume, r.ai_estimated_volume_range || "", r.ai_severity, r.ai_potential_risks || [], r.ai_recommendation || "", Boolean(r.ai_hazard_flag), Boolean(r.ai_recyclable_heavy), r.ai_detection_summary || null, r.priority_score, r.priority_level, r.priority_reasons || [], Boolean(r.duplicate_is_potential), r.duplicate_primary_report_id || "", r.duplicate_similarity_score || 0, r.duplicate_distance_meters || 0, r.status, r.assigned_team_id || null, r.after_image_url || "", r.after_storage_path || "", Boolean(r.escalated), r.escalated_at || null, r.recycling_status || "", r.recycling_partner || "", r.created_at, r.updated_at, r.status_timeline]
        );
      }
      console.log(`Seeded ${demoReports.length} demo reports (had ${reportCount}).`);
    } else {
      console.log(`Reports table has ${reportCount} rows, skipping demo data.`);
    }

    for (const n of seedNotifications) {
      await client.query(
        `INSERT INTO notifications (id, user_id, title, body) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [n.id, n.user_id, n.title, n.body]
      );
    }

    await client.query("COMMIT");
    console.log("Database seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function seedVehicles() {
  if (!SEEDING_ALLOWED) return;
  try {
    const existing = await query("SELECT COUNT(*) AS n FROM vehicles");
    if (Number(existing.rows[0].n) > 0) return;
    const seedVehicles = [
      { id: "veh-01", teamId: "team-07", name: "Vehicle 01", vehicleType: "Mini Tipper", status: "collecting", latitude: 20.2978, longitude: 85.8265, label: "Ward 12 Depot", assignedArea: "Ward 12" },
      { id: "veh-02", teamId: "team-03", name: "Vehicle 02", vehicleType: "Flatbed", status: "en_route", latitude: 20.3018, longitude: 85.8215, label: "Unit 1 Market", assignedArea: "Ward North" },
      { id: "veh-03", teamId: "team-alpha", name: "Vehicle 03", vehicleType: "Mini Tipper", status: "collecting", latitude: 20.2961, longitude: 85.8245, label: "1420 Main St", assignedArea: "Ward 12" },
    ];
    for (const v of seedVehicles) {
      await store.createVehicle(v);
    }
    console.log("Seed vehicles created.");
  } catch (err) {
    console.error("Vehicle seed error:", err.message);
  }
}
