import "dotenv/config";
import { getPool } from "./backend/db.js";
import { passwordMatches } from "./backend/utils.js";

const pool = getPool();
const emails = ["admin@swachhlens.app", "citizen@swachhlens.app", "worker@swachhlens.app"];
const res = await pool.query("SELECT uid, email, role FROM users WHERE email = ANY($1)", [emails]);
console.log("USERS:", JSON.stringify(res.rows));
for (const u of res.rows) {
  const acc = await pool.query("SELECT password_hash, salt FROM users WHERE uid = $1", [u.uid]);
  const okAdmin = await passwordMatches({ passwordHash: acc.rows[0].password_hash, salt: acc.rows[0].salt }, "admin123");
  const okCitizen = await passwordMatches({ passwordHash: acc.rows[0].password_hash, salt: acc.rows[0].salt }, "citizen123");
  const okWorker = await passwordMatches({ passwordHash: acc.rows[0].password_hash, salt: acc.rows[0].salt }, "worker123");
  console.log(u.email, "| admin123:", okAdmin, "| citizen123:", okCitizen, "| worker123:", okWorker);
}
process.exit(0);
