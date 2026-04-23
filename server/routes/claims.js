const { Router } = require("express");
const logger = require("../lib/logger");
const router = Router();

const STALE_THRESHOLD_MINUTES = 30;

function matchesClaim(file, pattern) {
  if (file === pattern) return true;
  if (pattern.endsWith("/*") || pattern.endsWith("*")) {
    const prefix = pattern.replace(/\*$/, "").replace(/\/\*$/, "/");
    return file.startsWith(prefix);
  }
  return false;
}

function findConflict(db, projectId, file, excludeSessionId) {
  const sessions = db
    .prepare(`
      SELECT id, user, feature, file_claims FROM sessions
      WHERE project_id = ? AND id != ? AND status != 'stale'
        AND last_heartbeat > datetime('now', '-${STALE_THRESHOLD_MINUTES} minutes')
    `)
    .all(projectId, excludeSessionId);

  for (const session of sessions) {
    const claims = JSON.parse(session.file_claims || "[]");
    for (const pattern of claims) {
      if (matchesClaim(file, pattern)) {
        return {
          session_id: session.id,
          user: session.user,
          feature: session.feature,
        };
      }
    }
  }
  return null;
}

router.get("/check", (req, res) => {
  const db = req.app.locals.db;
  const { file, session_id } = req.query;

  if (!file) {
    logger.warn("claims/check rejected: missing file query", { projectId: req.projectId });
    return res.status(400).json({ error: "file query parameter is required" });
  }

  const claimedBy = findConflict(db, req.projectId, file, session_id || "");
  if (claimedBy) {
    logger.debug("claims/check conflict", { projectId: req.projectId, file, claimedBy: claimedBy.session_id });
    return res.json({ conflict: true, claimed_by: claimedBy });
  }
  logger.debug("claims/check ok", { projectId: req.projectId, file, session_id: session_id || null });
  res.json({ conflict: false });
});

router.post("/:sessionId", (req, res) => {
  const db = req.app.locals.db;
  const { sessionId } = req.params;
  const { claims, force, replace } = req.body;

  if (!claims || !Array.isArray(claims)) {
    logger.warn("claims register rejected: invalid body", { projectId: req.projectId, sessionId });
    return res.status(400).json({ error: "claims array is required" });
  }

  const session = db.prepare("SELECT file_claims FROM sessions WHERE id = ? AND project_id = ?")
    .get(sessionId, req.projectId);
  if (!session) {
    logger.warn("claims register: session not found", { projectId: req.projectId, sessionId });
    return res.status(404).json({ error: "Session not found" });
  }

  if (replace === true) {
    if (!force) {
      const conflicts = [];
      for (const claim of claims) {
        const conflict = findConflict(db, req.projectId, claim, sessionId);
        if (conflict) {
          conflicts.push({ pattern: claim, ...conflict });
        }
      }
      if (conflicts.length > 0) {
        logger.warn("claims replace rejected: conflicts", { projectId: req.projectId, sessionId, conflictCount: conflicts.length });
        return res.status(409).json({ error: "File claim conflicts detected", conflicts });
      }
    }
    const normalized = [...new Set(claims)];
    db.prepare("UPDATE sessions SET file_claims = ?, last_heartbeat = datetime('now') WHERE id = ?")
      .run(JSON.stringify(normalized), sessionId);
    logger.info("claims replaced", { projectId: req.projectId, sessionId, count: normalized.length, force: Boolean(force) });
    return res.json({ session_id: sessionId, file_claims: normalized });
  }

  if (!force) {
    const conflicts = [];
    for (const claim of claims) {
      const conflict = findConflict(db, req.projectId, claim, sessionId);
      if (conflict) {
        conflicts.push({ pattern: claim, ...conflict });
      }
    }
    if (conflicts.length > 0) {
      logger.warn("claims register rejected: conflicts", { projectId: req.projectId, sessionId, conflictCount: conflicts.length });
      return res.status(409).json({ error: "File claim conflicts detected", conflicts });
    }
  }

  const existing = JSON.parse(session.file_claims || "[]");
  const merged = [...new Set([...existing, ...claims])];

  db.prepare("UPDATE sessions SET file_claims = ?, last_heartbeat = datetime('now') WHERE id = ?")
    .run(JSON.stringify(merged), sessionId);

  logger.info("claims registered", { projectId: req.projectId, sessionId, count: claims.length, force: Boolean(force) });
  res.json({ session_id: sessionId, file_claims: merged });
});

router.delete("/:sessionId", (req, res) => {
  const db = req.app.locals.db;
  db.prepare("UPDATE sessions SET file_claims = '[]' WHERE id = ? AND project_id = ?")
    .run(req.params.sessionId, req.projectId);
  logger.info("claims released", { projectId: req.projectId, sessionId: req.params.sessionId });
  res.json({ session_id: req.params.sessionId, file_claims: [] });
});

router.put("/transfer", (req, res) => {
  const db = req.app.locals.db;
  const { from, to, pattern } = req.body;

  if (!from || !to || !pattern) {
    logger.warn("claims transfer rejected: missing fields", { projectId: req.projectId });
    return res.status(400).json({ error: "from, to, and pattern are required" });
  }

  const transfer = db.transaction(() => {
    const fromSession = db.prepare("SELECT file_claims FROM sessions WHERE id = ? AND project_id = ?")
      .get(from, req.projectId);
    const toSession = db.prepare("SELECT file_claims FROM sessions WHERE id = ? AND project_id = ?")
      .get(to, req.projectId);

    if (!fromSession || !toSession) {
      return { error: "Session not found", status: 404 };
    }

    const fromClaims = JSON.parse(fromSession.file_claims || "[]").filter((c) => c !== pattern);
    const toClaims = [...new Set([...JSON.parse(toSession.file_claims || "[]"), pattern])];

    db.prepare("UPDATE sessions SET file_claims = ? WHERE id = ?").run(JSON.stringify(fromClaims), from);
    db.prepare("UPDATE sessions SET file_claims = ? WHERE id = ?").run(JSON.stringify(toClaims), to);

    return { from: { id: from, file_claims: fromClaims }, to: { id: to, file_claims: toClaims } };
  });

  const result = transfer();
  if (result.error) {
    logger.warn("claims transfer failed", { projectId: req.projectId, error: result.error });
    return res.status(result.status).json({ error: result.error });
  }
  logger.info("claims transferred", { projectId: req.projectId, from, to, pattern });
  res.json(result);
});

module.exports = router;
