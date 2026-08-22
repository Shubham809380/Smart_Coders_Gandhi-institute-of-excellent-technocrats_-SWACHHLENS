import "dotenv/config";
import { getPool } from "./backend/db.js";
const r = await getPool().query("SELECT uid, name FROM users WHERE email = $1", ["shubhampatra299@gmail.com"]);
console.log(r.rows.length ? `EXISTS uid=${r.rows[0].uid}` : "NOT_REGISTERED");
process.exit(0);
