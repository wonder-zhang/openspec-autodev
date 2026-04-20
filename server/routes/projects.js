const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const auth = require("../middleware/auth");

const router = Router();

router.post("/", (req, res) => {
  const db = req.app.locals.db;
  const { id, name } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: "id and name are required" });
  }

  const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
  if (existing) {
    return res.status(409).json({ error: "Project already exists" });
  }

  const apiKey = `oadev_${uuidv4().replace(/-/g, "")}`;
  db.prepare("INSERT INTO projects (id, name, api_key) VALUES (?, ?, ?)").run(
    id, name, apiKey
  );

  res.status(201).json({ id, name, api_key: apiKey });
});

router.get("/:id/dashboard", auth, (req, res) => {
  const db = req.app.locals.db;
  const projectId = req.params.id;

  const sessions = db
    .prepare("SELECT * FROM sessions WHERE project_id = ? AND status != 'stale'")
    .all(projectId);

  const specs = db
    .prepare("SELECT slug, file_type, version, updated_by, updated_at FROM specs WHERE project_id = ?")
    .all(projectId);

  res.json({ project_id: projectId, sessions, specs });
});

module.exports = router;
