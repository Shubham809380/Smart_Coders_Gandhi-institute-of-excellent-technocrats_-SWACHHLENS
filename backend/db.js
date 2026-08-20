import pg from "pg";
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function initDatabase() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen',
      ward_id TEXT DEFAULT 'ward-unassigned',
      is_active BOOLEAN DEFAULT true,
      language TEXT DEFAULT 'en',
      location_name TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '3 days')
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      citizen_id TEXT NOT NULL REFERENCES users(uid),
      media_image_url TEXT DEFAULT '',
      media_video_url TEXT DEFAULT '',
      media_thumbnail_url TEXT DEFAULT '',
      media_storage_path TEXT DEFAULT '',
      location_latitude DOUBLE PRECISION DEFAULT 0,
      location_longitude DOUBLE PRECISION DEFAULT 0,
      location_address TEXT DEFAULT '',
      location_ward_id TEXT DEFAULT '',
      location_locality TEXT DEFAULT '',
      citizen_comment TEXT DEFAULT '',
      ai_waste_type TEXT DEFAULT '',
      ai_confidence INTEGER DEFAULT 0,
      ai_estimated_volume TEXT DEFAULT '',
      ai_estimated_volume_range TEXT DEFAULT '',
      ai_severity TEXT DEFAULT '',
      ai_potential_risks TEXT[] DEFAULT '{}',
      ai_recommendation TEXT DEFAULT '',
      priority_score INTEGER DEFAULT 0,
      priority_level TEXT DEFAULT 'low',
      priority_reasons TEXT[] DEFAULT '{}',
      duplicate_is_potential BOOLEAN DEFAULT false,
      duplicate_primary_report_id TEXT DEFAULT '',
      duplicate_similarity_score DOUBLE PRECISION DEFAULT 0,
      duplicate_distance_meters INTEGER DEFAULT 0,
      status TEXT DEFAULT 'submitted',
      assigned_team_id TEXT DEFAULT NULL,
      after_image_url TEXT DEFAULT '',
      after_storage_path TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      status_timeline JSONB DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      leader_id TEXT DEFAULT '',
      member_ids TEXT[] DEFAULT '{}',
      ward_ids TEXT[] DEFAULT '{}',
      vehicle_type TEXT DEFAULT '',
      vehicle_capacity TEXT DEFAULT '',
      status TEXT DEFAULT 'available',
      current_location_latitude DOUBLE PRECISION DEFAULT 0,
      current_location_longitude DOUBLE PRECISION DEFAULT 0,
      current_location_label TEXT DEFAULT '',
      current_assignment_id TEXT DEFAULT NULL,
      completed_today INTEGER DEFAULT 0,
      average_resolution_time INTEGER DEFAULT 0,
      eta_minutes INTEGER DEFAULT 0,
      distance_km DOUBLE PRECISION DEFAULT 0,
      ai_match_score INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor TEXT DEFAULT '',
      role TEXT DEFAULT '',
      action TEXT NOT NULL,
      report_id TEXT DEFAULT '',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      team_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      vehicle_type TEXT DEFAULT '',
      status TEXT DEFAULT 'idle',
      current_latitude DOUBLE PRECISION DEFAULT 0,
      current_longitude DOUBLE PRECISION DEFAULT 0,
      current_label TEXT DEFAULT '',
      speed_kmh DOUBLE PRECISION DEFAULT 0,
      heading INTEGER DEFAULT 0,
      assigned_area TEXT DEFAULT '',
      route JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

    console.log("Neon database schema initialized.");

  try {
    await db.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '3 days')");
    await db.query("UPDATE sessions SET expires_at = NOW() + INTERVAL '3 days' WHERE expires_at IS NULL");
    await db.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW()");
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS duty_status TEXT DEFAULT 'off_duty'");
    await db.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT ''");
    await db.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS worker_notes TEXT DEFAULT ''");
    await db.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS actual_volume TEXT DEFAULT ''");
  } catch {}
}
