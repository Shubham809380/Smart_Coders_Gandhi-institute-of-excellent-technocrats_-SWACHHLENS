import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EMAIL = "admin@swachhlens.demo";
const PASSWORD = "admin@809";

const salt = await bcrypt.genSalt(10);
const passwordHash = await bcrypt.hash(PASSWORD, salt);

const existing = await pool.query("SELECT uid FROM users WHERE email = $1", [EMAIL]);
if (existing.rowCount) {
  const r = await pool.query(
    `UPDATE users
     SET password_hash = $1, salt = $2, role = 'super_admin', is_active = true, updated_at = NOW()
     WHERE email = $3 RETURNING uid, name, email, role`,
    [passwordHash, salt, EMAIL]
  );
  console.log(`UPDATED: ${JSON.stringify(r.rows[0])}`);
} else {
  const uid = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await pool.query(
    `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, terms_accepted, terms_accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', true, NOW())
     RETURNING uid, name, email, role`,
    [uid, "Command Center Admin", EMAIL, "+919812340000", passwordHash, salt]
  );
  console.log(`CREATED: ${JSON.stringify(r.rows[0])}`);
}
await pool.end();
