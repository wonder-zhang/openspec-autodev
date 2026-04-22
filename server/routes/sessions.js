const { Router } = require("express");
const logger = require("../lib/logger");
const router = Router();

router.post("/", (req, res) => {
  const db = req.app.locals.db;
  const { id, user } = req.body;

  if (!id || !user) {
    logger.warn("session register rejected: missing id or user", { projectId: req.projectId });
    return res.status(400).json({ error: "id and user are required" });
  }

  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, project_id, user)
    VALUES (?, ?, ?)
  `).run(id, req.projectId, user);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  logger.info("session registered", { projectId: req.projectId, sessionId: id, user });
  res.status(201).json(session);
});

router.get("/", (req, res) => {
  const db = req.app.locals.db;
  const sessions = db
    .prepare("SELECT * FROM sessions WHERE project_id = ? AND status != 'stale'")
    .all(req.projectId);

  const parsed = sessions.map((s) => ({
    ...s,
    file_claims: JSON.parse(s.file_claims || "[]"),
  }));
  logger.debug("sessions listed", { projectId: req.projectId, count: parsed.length });
  res.json(parsed);
});

router.put("/:id", (req, res) => {
  const db = req.app.locals.db;
  const allowed = ["feature", "workflow_type", "branch", "phase", "status"];
  const updates = [];
  const values = [];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    logger.warn("session update rejected: no valid fields", { sessionId: req.params.id, projectId: req.projectId });
    return res.status(400).json({ error: "No valid fields to update" });
  }

  updates.push("last_heartbeat = datetime('now')");
  values.push(req.params.id, req.projectId);

  db.prepare(`
    UPDATE sessions SET ${updates.join(", ")}
    WHERE id = ? AND project_id = ?
  `).run(...values);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) {
    logger.warn("session update: not found", { sessionId: req.params.id, projectId: req.projectId });
    return res.status(404).json({ error: "Session not found" });
  }
  logger.info("session updated", { projectId: req.projectId, sessionId: req.params.id, fields: Object.keys(req.body) });
  res.json(session);
});

router.put("/:id/heartbeat", (req, res) => {
  const db = req.app.locals.db;
  const result = db.prepare(`
    UPDATE sessions SET last_heartbeat = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(req.params.id, req.projectId);

  if (result.changes === 0) {
    logger.warn("heartbeat: session not found", { sessionId: req.params.id, projectId: req.projectId });
    return res.status(404).json({ error: "Session not found" });
  }

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  logger.debug("heartbeat", { projectId: req.projectId, sessionId: req.params.id });
  res.json(session);
});

router.delete("/:id", (req, res) => {
  const db = req.app.locals.db;
  db.prepare("DELETE FROM sessions WHERE id = ? AND project_id = ?").run(
    req.params.id, req.projectId
  );
  logger.info("session deleted", { projectId: req.projectId, sessionId: req.params.id });
  res.json({ deleted: req.params.id });
});

module.exports = router;
