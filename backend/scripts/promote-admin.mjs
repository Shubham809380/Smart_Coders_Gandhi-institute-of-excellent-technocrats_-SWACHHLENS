import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EMAILS = process.argv.slice(2);
if (!EMAILS.length) {
  console.error("Usage: node promote-admin.mjs <email> [email2...]");
  process.exit(1);
}

for (const email of EMAILS) {
  const r = await pool.query(
    `UPDATE users SET role = 'super_admin', updated_at = NOW()
     WHERE email = $1 RETURNING uid, name, email, role`,
    [email.toLowerCase()]
  );
  console.log(r.rowCount ? `PROMOTED: ${JSON.stringify(r.rows[0])}` : `NOT FOUND: ${email}`);
}
await pool.end();
