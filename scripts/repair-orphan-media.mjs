import "dotenv/config";
import { getPool } from "../backend/db.js";

// One-time repair: reports created before the Postgres media fix carry
// /uploads/... URLs whose bytes lived on an ephemeral serverless disk and are
// gone forever (permanent 404 -> broken images across citizen/worker/admin).
// Nulling the URL lets every screen fall back to its built-in placeholder.
const p = getPool();

const blobs = await p.query("SELECT storage_path FROM media_blobs");
const paths = new Set(blobs.rows.map((r) => r.storage_path));

const rows = await p.query(
  `SELECT id, media_image_url AS u1, media_thumbnail_url AS u2, after_image_url AS u3
   FROM reports`
);
const broken = [];
for (const row of rows.rows) {
  for (const col of ["u1", "u2", "u3"]) {
    const u = row[col];
    if (!u || !u.startsWith("/uploads/")) continue;
    const path = u.replace("/uploads/", "");
    if (!paths.has(path)) broken.push({ id: row.id, col, url: u });
  }
}

if (!broken.length) {
  console.log("Nothing to repair — all /uploads/ references resolve.");
  process.exit(0);
}

console.log(`Repairing ${broken.length} broken media reference(s):`);
for (const b of broken) console.log(` - ${b.id} ${b.col} -> ${b.url}`);

const ids = [...new Set(broken.map((b) => b.id))];
for (const id of ids) {
  await p.query(
    `UPDATE reports SET
       media_image_url = CASE WHEN media_image_url LIKE '/uploads/%'
                              AND NOT EXISTS (
                                SELECT 1 FROM media_blobs mb
                                WHERE mb.storage_path = replace(media_image_url, '/uploads/', '')
                              ) THEN NULL ELSE media_image_url END,
       media_thumbnail_url = CASE WHEN media_thumbnail_url LIKE '/uploads/%'
                              AND NOT EXISTS (
                                SELECT 1 FROM media_blobs mb
                                WHERE mb.storage_path = replace(media_thumbnail_url, '/uploads/', '')
                              ) THEN NULL ELSE media_thumbnail_url END,
       after_image_url = CASE WHEN after_image_url LIKE '/uploads/%'
                              AND NOT EXISTS (
                                SELECT 1 FROM media_blobs mb
                                WHERE mb.storage_path = replace(after_image_url, '/uploads/', '')
                              ) THEN NULL ELSE after_image_url END
     WHERE id = $1`,
    [id]
  );
  console.log(` repaired ${id}`);
}

// Verify
const after = await p.query(
  `SELECT count(*) AS n FROM reports r
   WHERE (r.media_image_url LIKE '/uploads/%' AND NOT EXISTS (SELECT 1 FROM media_blobs mb WHERE mb.storage_path = replace(r.media_image_url,'/uploads/','')))
      OR (r.after_image_url LIKE '/uploads/%' AND NOT EXISTS (SELECT 1 FROM media_blobs mb WHERE mb.storage_path = replace(r.after_image_url,'/uploads/','')))`
);
console.log("Remaining broken references:", after.rows[0].n);
process.exit(0);
