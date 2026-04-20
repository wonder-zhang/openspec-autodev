const Database = require("better-sqlite3");

function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      api_key    TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      config     TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id             TEXT PRIMARY KEY,
      project_id     TEXT NOT NULL REFERENCES projects(id),
      user           TEXT NOT NULL,
      feature        TEXT,
      workflow_type  TEXT,
      branch         TEXT,
      phase          INTEGER,
      status         TEXT DEFAULT 'idle',
      file_claims    TEXT DEFAULT '[]',
      last_heartbeat TEXT DEFAULT (datetime('now')),
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS specs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      session_id TEXT REFERENCES sessions(id),
      feature    TEXT NOT NULL,
      slug       TEXT NOT NULL,
      file_type  TEXT NOT NULL,
      content    TEXT NOT NULL,
      version    INTEGER DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, slug, file_type)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_specs_project ON specs(project_id);
    CREATE INDEX IF NOT EXISTS idx_specs_slug ON specs(project_id, slug);
  `);

  return db;
}

module.exports = { createDb };
