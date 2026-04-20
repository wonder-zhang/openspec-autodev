const auth = (req, res, next) => {
  const db = req.app.locals.db;
  const authHeader = req.headers.authorization;
  const projectId = req.headers["x-project"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  if (!projectId) {
    return res.status(401).json({ error: "Missing X-Project header" });
  }

  const apiKey = authHeader.slice(7);
  const project = db
    .prepare("SELECT id FROM projects WHERE id = ? AND api_key = ?")
    .get(projectId, apiKey);

  if (!project) {
    return res.status(403).json({ error: "Invalid project ID or API key" });
  }

  req.projectId = projectId;
  next();
};

module.exports = auth;
