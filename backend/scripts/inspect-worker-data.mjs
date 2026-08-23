import pg from "pg";

// Inspect live DB: teams + unassigned open reports (read-only).
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const teams = await pool.query("SELECT id, name, leader_id, member_ids FROM teams");
console.log("TEAMS:", JSON.stringify(teams.rows.map((t) => ({ id: t.id, leader: t.leader_id })), null, 0));

const open = await pool.query(
  `SELECT id, status, assigned_team_id, created_at FROM reports
   WHERE status IN ('submitted','under_review','assigned','en_route','cleanup_in_progress')
   ORDER BY created_at DESC LIMIT 20`
);
console.log("OPEN REPORTS:", JSON.stringify(open.rows.map((r) => ({ id: r.id, st: r.status, team: r.assigned_team_id })), null, 0));

const w = await pool.query("SELECT uid, email, duty_status FROM users WHERE uid = 'user-worker'");
console.log("WORKER:", JSON.stringify(w.rows));
await pool.end();
