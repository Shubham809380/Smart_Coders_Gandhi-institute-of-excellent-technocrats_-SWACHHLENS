import pg from "pg";
import bcrypt from "bcryptjs";

// TEMPORARY one-off provisioning endpoint. Removed in the next commit.
const TOKEN = "e7c15afd5e274a428ce6e81bfbd50303";

export default async function handler(req, res) {
  const supplied = req.query.token || req.headers["x-oneoff-token"];
  if (supplied !== TOKEN) return res.status(404).json({ ok: false });
  try {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const email = "admin@swachhlens.demo";
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("admin@809", salt);
    let result;
    const existing = await pool.query("SELECT uid FROM users WHERE email = $1", [email]);
    if (existing.rowCount) {
      const r = await pool.query(
        `UPDATE users SET password_hash = $1, salt = $2, role = 'super_admin', is_active = true, updated_at = NOW()
         WHERE email = $3 RETURNING uid, email, role`,
        [passwordHash, salt, email]
      );
      result = { action: "updated", ...r.rows[0] };
    } else {
      const uid = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const r = await pool.query(
        `INSERT INTO users (uid, name, email, phone, password_hash, salt, role, terms_accepted, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', true, NOW())
         RETURNING uid, email, role`,
        [uid, "Command Center Admin", email, "+919812340000", passwordHash, salt]
      );
      result = { action: "created", ...r.rows[0] };
    }
    // Also promote the owner's Gmail account if present in this database.
    const promo = await pool.query(
      `UPDATE users SET role = 'super_admin', updated_at = NOW()
       WHERE email = $1 RETURNING uid, email, role`,
      ["patrashubham031@gmail.com"]
    );
    const promoted = promo.rowCount ? { uid: promo.rows[0].uid } : null;
    const count = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    await pool.end();
    return res.status(200).json({ ok: true, result, promoted, totalUsers: count.rows[0].n });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message) });
  }
}
