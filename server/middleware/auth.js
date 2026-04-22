const logger = require("../lib/logger");

const auth = (req, res, next) => {
  const db = req.app.locals.db;
  const authHeader = req.headers.authorization;
  const projectId = req.headers["x-project"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("auth rejected: missing Authorization", { path: req.originalUrl || req.url });
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  if (!projectId) {
    logger.warn("auth rejected: missing X-Project", { path: req.originalUrl || req.url });
    return res.status(401).json({ error: "Missing X-Project header" });
  }

  const apiKey = authHeader.slice(7);
  const project = db
    .prepare("SELECT id FROM projects WHERE id = ? AND api_key = ?")
    .get(projectId, apiKey);

  if (!project) {
    logger.warn("auth rejected: invalid credentials", { projectId, path: req.originalUrl || req.url });
    return res.status(403).json({ error: "Invalid project ID or API key" });
  }

  req.projectId = projectId;
  next();
};

module.exports = auth;
