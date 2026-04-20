const { createDb } = require("../db");
const express = require("express");

function createTestDb() {
  return createDb(":memory:");
}

function seedProject(db, overrides = {}) {
  const project = {
    id: "test-project",
    name: "Test Project",
    api_key: "test-key-123",
    ...overrides,
  };
  db.prepare(
    "INSERT INTO projects (id, name, api_key) VALUES (?, ?, ?)"
  ).run(project.id, project.name, project.api_key);
  return project;
}

function seedSession(db, overrides = {}) {
  const session = {
    id: "alice-1713600000",
    project_id: "test-project",
    user: "alice",
    feature: "user-search",
    status: "active",
    file_claims: '["src/search/*"]',
    ...overrides,
  };
  db.prepare(`
    INSERT INTO sessions (id, project_id, user, feature, status, file_claims)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    session.id, session.project_id, session.user,
    session.feature, session.status, session.file_claims
  );
  return session;
}

function createTestApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  const authMiddleware = require("../middleware/auth");
  app.use("/api/v1", authMiddleware);

  app.use("/api/v1/projects", require("../routes/projects"));
  app.use("/api/v1/sessions", require("../routes/sessions"));
  app.use("/api/v1/claims", require("../routes/claims"));
  app.use("/api/v1/specs", require("../routes/specs"));

  return app;
}

module.exports = { createTestDb, seedProject, seedSession, createTestApp };
