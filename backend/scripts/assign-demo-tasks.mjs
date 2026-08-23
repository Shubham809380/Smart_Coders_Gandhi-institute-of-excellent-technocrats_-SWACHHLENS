import pg from "pg";

// One-off ops task: give the demo cleanup crew real, open work from the
// live queue (same as an admin assigning via the console).
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TEAM_ID = "team-ward12";
const LIMIT = 3;

const candidates = await pool.query(
  `SELECT id, status_timeline FROM reports
   WHERE status = 'submitted' AND assigned_team_id IS NULL
   ORDER BY priority_score DESC NULLS LAST, created_at DESC
   LIMIT $1`,
  [LIMIT]
);

for (const r of candidates.rows) {
  let timeline = [];
  try { timeline = JSON.parse(r.status_timeline || "[]"); } catch {}
  timeline.push({ status: "assigned", at: new Date().toISOString() });
  await pool.query(
    `UPDATE reports
     SET assigned_team_id = $1, status = 'assigned', status_timeline = $2, updated_at = NOW()
     WHERE id = $3`,
    [TEAM_ID, JSON.stringify(timeline), r.id]
  );
  console.log(`ASSIGNED ${r.id} -> ${TEAM_ID}`);
}

await pool.query("UPDATE users SET duty_status = 'on_duty', updated_at = NOW() WHERE uid = 'user-worker'");
console.log("user-worker set ON DUTY");

const check = await pool.query(`SELECT id, status FROM reports WHERE assigned_team_id = $1`, [TEAM_ID]);
console.log("team-ward12 now owns:", JSON.stringify(check.rows));
await pool.end();
