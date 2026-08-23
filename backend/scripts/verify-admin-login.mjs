import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const email = "admin@swachhlens.demo";
const res = await pool.query("SELECT uid, email, role, is_active, password_hash, salt FROM users WHERE email = $1", [email]);
if (!res.rowCount) {
  console.log("NOT FOUND in this database");
} else {
  const u = res.rows[0];
  const ok = await bcrypt.compare("admin@809", u.password_hash);
  console.log(JSON.stringify({ uid: u.uid, role: u.role, is_active: u.is_active, hashPrefix: u.password_hash.slice(0, 7), passwordMatches: ok }));
}
const total = await pool.query("SELECT COUNT(*) AS n FROM users");
console.log(`total users in THIS db: ${total.rows[0].n}`);
await pool.end();
