const { Router } = require("express");
const router = Router();

function featureToSlug(feature) {
  return feature.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

router.post("/sync", (req, res) => {
  const db = req.app.locals.db;
  const { feature, session_id, files } = req.body;

  if (!feature || !files || !Array.isArray(files)) {
    return res.status(400).json({ error: "feature and files array are required" });
  }

  let validSessionId = null;
  if (session_id) {
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(session_id);
    if (session) validSessionId = session_id;
  }

  const slug = featureToSlug(feature);
  const upsert = db.prepare(`
    INSERT INTO specs (project_id, session_id, feature, slug, file_type, content, updated_by, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(project_id, slug, file_type) DO UPDATE SET
      content = excluded.content,
      session_id = excluded.session_id,
      updated_by = excluded.updated_by,
      version = specs.version + 1,
      updated_at = datetime('now')
  `);

  const syncAll = db.transaction(() => {
    for (const file of files) {
      upsert.run(
        req.projectId, validSessionId, feature, slug,
        file.file_type, file.content, req.body.user || null
      );
    }
  });

  syncAll();
  res.json({ synced: files.length, slug });
});

router.get("/changes", (req, res) => {
  const db = req.app.locals.db;
  const { since } = req.query;

  if (!since) {
    return res.status(400).json({ error: "since query parameter is required" });
  }

  const normalizedSince = since.replace("T", " ").replace("Z", "").replace(/\.\d+$/, "");

  const specs = db
    .prepare(`
      SELECT slug, feature, file_type, content, version, updated_by, updated_at
      FROM specs WHERE project_id = ? AND updated_at > ?
      ORDER BY updated_at DESC
    `)
    .all(req.projectId, normalizedSince);
  res.json(specs);
});

router.get("/", (req, res) => {
  const db = req.app.locals.db;
  const specs = db
    .prepare(`
      SELECT slug, feature, file_type, version, updated_by, updated_at
      FROM specs WHERE project_id = ?
      ORDER BY feature, file_type
    `)
    .all(req.projectId);
  res.json(specs);
});

router.get("/:slug/:fileType", (req, res) => {
  const db = req.app.locals.db;
  const spec = db
    .prepare("SELECT * FROM specs WHERE project_id = ? AND slug = ? AND file_type = ?")
    .get(req.projectId, req.params.slug, req.params.fileType);

  if (!spec) return res.status(404).json({ error: "Spec not found" });
  res.json(spec);
});

module.exports = router;
