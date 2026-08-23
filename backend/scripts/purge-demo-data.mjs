// ONE-OFF: purge demo/seed data from prod Neon so every admin/citizen number
// reflects real usage only. Real signups (team Gmail accounts) and their
// app-created reports are KEPT.
//
//   Dry run :  node backend/scripts/purge-demo-data.mjs
//   Execute :  node backend/scripts/purge-demo-data.mjs --execute
//
// Requires DATABASE_URL in the environment.
import pg from "pg";

const EXECUTE = process.argv.includes("--execute");

// Explicit uid list — no pattern guessing. Verified against prod on 2026-08-23:
// test@*, @test.com inboxes, and throwaway email/fb/lang verification accounts.
const FAKE_UIDS = [
  "user-101cg17f", // Test User <test@swachhlens.app>
  "user-xpsa71zz", // Test User <test@example.com>
  "user-999t0xpl", // Email Test User
  "user-bf1pxggj", // Email Verify User
  "user-45dd9n7z", // Lang Test
  "user-297apifw", // Lang Renamed
  "user-fkx0okde", // FB Test
  "user-25u5pmbe", // FB Test
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing — source .env.purge first.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const count = async (label, sql) => {
  const res = await pool.query(sql);
  console.log(`  ${label}: ${res.rows[0]?.n ?? "?"}`);
};

async function main() {
  console.log(`MODE: ${EXECUTE ? "EXECUTE (destructive)" : "DRY RUN"}\n`);

  console.log("BEFORE:");
  await count("reports", "SELECT COUNT(*)::int AS n FROM reports");
  await count("users", "SELECT COUNT(*)::int AS n FROM users");
  await count("teams", "SELECT COUNT(*)::int AS n FROM teams");
  await count("vehicles", "SELECT COUNT(*)::int AS n FROM vehicles");

  const seedReports = await pool.query(
    `SELECT COUNT(*)::int AS n FROM reports
     WHERE id LIKE 'REP-D%' OR id IN ('REP-28491','REP-992A','REP-18012')`
  );
  const fakeOwned = await pool.query(
    `SELECT id, citizen_id, status, created_at FROM reports
     WHERE citizen_id = ANY($1) AND id NOT LIKE 'REP-D%'
       AND id NOT IN ('REP-28491','REP-992A','REP-18012')`,
    [FAKE_UIDS]
  );
  console.log(`  seeded reports to delete: ${seedReports.rows[0].n}`);
  console.log(`  test-user-owned app reports to delete: ${fakeOwned.rowCount}`);
  for (const r of fakeOwned.rows) console.log(`    - ${r.id} [${r.status}] owner=${r.citizen_id}`);

  const survivors = await pool.query(
    `SELECT uid, name, email, role FROM users WHERE uid <> ALL($1) ORDER BY role, name`,
    [FAKE_UIDS]
  );
  console.log(`\nUSERS KEPT (${survivors.rows.length}):`);
  for (const u of survivors.rows) console.log(`  + [${u.role}] ${u.name} <${u.email}>`);

  if (!EXECUTE) {
    console.log("\nDry run only — re-run with --execute to apply.");
    await pool.end();
    return;
  }

  const q = (label, sql, params) =>
    pool.query(sql, params).then((r) => console.log(`DEL  ${label}: ${r.rowCount}`));

  console.log("\nDELETING…");
  await q(
    "seeded reports",
    `DELETE FROM reports WHERE id LIKE 'REP-D%' OR id IN ('REP-28491','REP-992A','REP-18012')`
  );
  await q("test-user-owned reports", "DELETE FROM reports WHERE citizen_id = ANY($1)", [FAKE_UIDS]);
  await q("notifications (seed/test)", "DELETE FROM notifications");
  await q("activity_logs (seed/test)", "DELETE FROM activity_logs");
  await q("inference_logs (fake owners)", "DELETE FROM inference_logs WHERE user_id = ANY($1)", [FAKE_UIDS]);
  await q("push_subscriptions (fake)", "DELETE FROM push_subscriptions WHERE user_id = ANY($1)", [FAKE_UIDS]);
  await q("sessions (fake)", "DELETE FROM sessions WHERE uid = ANY($1)", [FAKE_UIDS]);
  await q("reset tokens (fake)", "DELETE FROM password_reset_tokens WHERE uid = ANY($1)", [FAKE_UIDS]);
  await q("vehicles (seeded)", "DELETE FROM vehicles");
  await q("teams (seeded)", "DELETE FROM teams");
  await q("users (fake)", "DELETE FROM users WHERE uid = ANY($1)", [FAKE_UIDS]);

  // One clean functional team so the worker login + assign flow still works.
  await pool.query(
    `INSERT INTO teams (id, name, leader_id, member_ids, ward_ids, vehicle_type, vehicle_capacity, status)
     VALUES ('team-ward12', 'Ward 12 Squad', 'user-worker', ARRAY['user-worker']::text[], ARRAY['ward-12','ward-north']::text[], 'Mini Tipper', 'medium', 'available')
     ON CONFLICT (id) DO NOTHING`
  );
  console.log("ADD  team-ward12 (leader: user-worker)");

  console.log("\nAFTER:");
  await count("reports", "SELECT COUNT(*)::int AS n FROM reports");
  await count("users", "SELECT COUNT(*)::int AS n FROM users");
  await count("teams", "SELECT COUNT(*)::int AS n FROM teams");
  await count("vehicles", "SELECT COUNT(*)::int AS n FROM vehicles");
  await count("inference_logs", "SELECT COUNT(*)::int AS n FROM inference_logs");

  await pool.end();
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error("FAILED:", err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
