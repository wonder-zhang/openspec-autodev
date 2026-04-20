# Distributed Multi-Developer Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional self-hosted coordination server and modify existing hooks to support real-time cross-machine multi-developer collaboration.

**Architecture:** A Node.js + SQLite REST server (`server/`) provides centralized session, file claim, and spec synchronization. Client hooks (`hooks/`) are modified to call the server API with transparent fallback to local-only logic when the server is unavailable or not configured.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, Jest + supertest (server tests), curl (client HTTP calls)

**Design Spec:** `docs/superpowers/specs/2026-04-20-distributed-collaboration-design.md`

---

## File Structure

### New Files (Server)

| File | Responsibility |
|------|---------------|
| `server/package.json` | Server dependencies and scripts |
| `server/index.js` | Express app entry, middleware, route mounting, stale cleanup scheduler |
| `server/db.js` | SQLite initialization, schema migration, query helpers |
| `server/middleware/auth.js` | API Key validation middleware |
| `server/routes/projects.js` | Project CRUD + API key generation |
| `server/routes/sessions.js` | Session register/update/heartbeat/deregister/list |
| `server/routes/claims.js` | File claim check/register/release/transfer |
| `server/routes/specs.js` | Spec sync/list/get/changes |
| `server/jobs/stale-cleanup.js` | Periodic stale session cleanup |
| `server/Dockerfile` | Docker image definition |
| `server/__tests__/sessions.test.js` | Session API tests |
| `server/__tests__/claims.test.js` | Claims API tests |
| `server/__tests__/specs.test.js` | Specs API tests |
| `server/__tests__/projects.test.js` | Projects API tests |
| `server/__tests__/stale-cleanup.test.js` | Stale cleanup tests |
| `server/__tests__/helpers.js` | Test setup: in-memory DB, test app factory, seed data |

### Modified Files (Client)

| File | Changes |
|------|---------|
| `hooks/session-utils.sh` | Add `load_coordination_config()`, `coord_api()`, remote variants of session/claim functions |
| `hooks/session-start.sh` | Add remote session registration with local fallback |
| `hooks/pre-tool-use.sh` | Add remote claim check with local fallback |
| `hooks/post-tool-use.sh` | Add remote heartbeat with local fallback |
| `skills/setup/SKILL.md` | Add Step 7: optional coordination server setup |
| `skills/status/SKILL.md` | Add remote-first data fetching |
| `skills/claim/SKILL.md` | Add remote sync for all claim operations |

---

## Task 1: Server Scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/db.js`
- Create: `server/__tests__/helpers.js`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "openspec-autodev-server",
  "version": "1.0.0",
  "description": "Coordination server for openspec-autodev multi-developer collaboration",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "jest --verbose --forceExit"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd server && npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 3: Create `server/db.js`**

```js
const Database = require("better-sqlite3");
const path = require("path");

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
```

- [ ] **Step 4: Create `server/__tests__/helpers.js`**

```js
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
```

- [ ] **Step 5: Create `server/index.js` (minimal, routes added later)**

```js
const express = require("express");
const cors = require("cors");
const path = require("path");
const { createDb } = require("./db");
const { startStaleCleanup } = require("./jobs/stale-cleanup");

const PORT = process.env.PORT || 9527;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "coordination.db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const fs = require("fs");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = createDb(DB_PATH);
app.locals.db = db;

const auth = require("./middleware/auth");
app.use("/api/v1/projects", require("./routes/projects"));
app.use("/api/v1", auth);
app.use("/api/v1/sessions", require("./routes/sessions"));
app.use("/api/v1/claims", require("./routes/claims"));
app.use("/api/v1/specs", require("./routes/specs"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

startStaleCleanup(db);

app.listen(PORT, () => {
  console.log(`openspec-autodev-server listening on port ${PORT}`);
});

module.exports = app;
```

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/index.js server/db.js server/__tests__/helpers.js server/package-lock.json
git commit -m "feat(server): scaffold coordination server with SQLite schema"
```

---

## Task 2: Auth Middleware

**Files:**
- Create: `server/middleware/auth.js`

- [ ] **Step 1: Create `server/middleware/auth.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/auth.js
git commit -m "feat(server): add API key auth middleware"
```

---

## Task 3: Projects API

**Files:**
- Create: `server/routes/projects.js`
- Create: `server/__tests__/projects.test.js`

- [ ] **Step 1: Write failing tests for `server/__tests__/projects.test.js`**

```js
const request = require("supertest");
const { createTestDb, seedProject, createTestApp } = require("./helpers");

describe("Projects API", () => {
  let db, app;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  afterEach(() => db.close());

  test("POST /api/v1/projects creates project and returns api_key", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .send({ id: "my-app", name: "My App" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("my-app");
    expect(res.body.api_key).toBeDefined();
    expect(res.body.api_key).toMatch(/^oadev_/);
  });

  test("POST /api/v1/projects rejects duplicate id", async () => {
    seedProject(db, { id: "dup" });
    const res = await request(app)
      .post("/api/v1/projects")
      .send({ id: "dup", name: "Dup" });
    expect(res.status).toBe(409);
  });

  test("GET /api/v1/projects/:id/dashboard returns overview", async () => {
    const proj = seedProject(db);
    seedProject(db, { id: "other", name: "Other", api_key: "other-key" });
    const res = await request(app)
      .get(`/api/v1/projects/${proj.id}/dashboard`)
      .set("Authorization", `Bearer ${proj.api_key}`)
      .set("X-Project", proj.id);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sessions");
    expect(res.body).toHaveProperty("specs");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/projects.test.js --verbose`
Expected: FAIL — Cannot find module `../routes/projects`

- [ ] **Step 3: Implement `server/routes/projects.js`**

```js
const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");

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

router.get("/:id/dashboard", (req, res) => {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest __tests__/projects.test.js --verbose`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/projects.js server/__tests__/projects.test.js
git commit -m "feat(server): add projects API with key generation"
```

---

## Task 4: Sessions API

**Files:**
- Create: `server/routes/sessions.js`
- Create: `server/__tests__/sessions.test.js`

- [ ] **Step 1: Write failing tests for `server/__tests__/sessions.test.js`**

```js
const request = require("supertest");
const { createTestDb, seedProject, seedSession, createTestApp } = require("./helpers");

describe("Sessions API", () => {
  let db, app, project;
  const auth = () => ({ Authorization: "Bearer test-key-123", "X-Project": "test-project" });

  beforeEach(() => {
    db = createTestDb();
    project = seedProject(db);
    app = createTestApp(db);
  });

  afterEach(() => db.close());

  test("POST /sessions registers a new session", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set(auth())
      .send({ id: "bob-100", user: "bob" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("bob-100");
    expect(res.body.status).toBe("idle");
  });

  test("PUT /sessions/:id updates fields", async () => {
    seedSession(db);
    const res = await request(app)
      .put("/api/v1/sessions/alice-1713600000")
      .set(auth())
      .send({ feature: "new-feature", phase: 2, status: "active" });
    expect(res.status).toBe(200);
    expect(res.body.feature).toBe("new-feature");
    expect(res.body.phase).toBe(2);
  });

  test("PUT /sessions/:id/heartbeat updates last_heartbeat", async () => {
    seedSession(db);
    const res = await request(app)
      .put("/api/v1/sessions/alice-1713600000/heartbeat")
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.last_heartbeat).toBeDefined();
  });

  test("GET /sessions lists active sessions for project", async () => {
    seedSession(db);
    seedSession(db, { id: "bob-100", user: "bob", feature: "payment" });
    const res = await request(app)
      .get("/api/v1/sessions")
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test("DELETE /sessions/:id removes session", async () => {
    seedSession(db);
    const res = await request(app)
      .delete("/api/v1/sessions/alice-1713600000")
      .set(auth());
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT id FROM sessions WHERE id = ?").get("alice-1713600000");
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/sessions.test.js --verbose`
Expected: FAIL — Cannot find module `../routes/sessions`

- [ ] **Step 3: Implement `server/routes/sessions.js`**

```js
const { Router } = require("express");
const router = Router();

router.post("/", (req, res) => {
  const db = req.app.locals.db;
  const { id, user } = req.body;

  if (!id || !user) {
    return res.status(400).json({ error: "id and user are required" });
  }

  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, project_id, user)
    VALUES (?, ?, ?)
  `).run(id, req.projectId, user);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
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
    return res.status(400).json({ error: "No valid fields to update" });
  }

  updates.push("last_heartbeat = datetime('now')");
  values.push(req.params.id, req.projectId);

  db.prepare(`
    UPDATE sessions SET ${updates.join(", ")}
    WHERE id = ? AND project_id = ?
  `).run(...values);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

router.put("/:id/heartbeat", (req, res) => {
  const db = req.app.locals.db;
  const result = db.prepare(`
    UPDATE sessions SET last_heartbeat = datetime('now')
    WHERE id = ? AND project_id = ?
  `).run(req.params.id, req.projectId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Session not found" });
  }

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  res.json(session);
});

router.delete("/:id", (req, res) => {
  const db = req.app.locals.db;
  db.prepare("DELETE FROM sessions WHERE id = ? AND project_id = ?").run(
    req.params.id, req.projectId
  );
  res.json({ deleted: req.params.id });
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest __tests__/sessions.test.js --verbose`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/sessions.js server/__tests__/sessions.test.js
git commit -m "feat(server): add sessions API (register/update/heartbeat/list/delete)"
```

---

## Task 5: Claims API (Critical Hot Path)

**Files:**
- Create: `server/routes/claims.js`
- Create: `server/__tests__/claims.test.js`

- [ ] **Step 1: Write failing tests for `server/__tests__/claims.test.js`**

```js
const request = require("supertest");
const { createTestDb, seedProject, seedSession, createTestApp } = require("./helpers");

describe("Claims API", () => {
  let db, app;
  const auth = () => ({ Authorization: "Bearer test-key-123", "X-Project": "test-project" });

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    app = createTestApp(db);
  });

  afterEach(() => db.close());

  describe("GET /claims/check", () => {
    test("returns no conflict when file is unclaimed", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      const res = await request(app)
        .get("/api/v1/claims/check")
        .query({ file: "src/payment/index.ts", session_id: "bob-1" })
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.conflict).toBe(false);
    });

    test("returns conflict when file matches another session's claim", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      const res = await request(app)
        .get("/api/v1/claims/check")
        .query({ file: "src/search/index.ts", session_id: "bob-1" })
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.conflict).toBe(true);
      expect(res.body.claimed_by.session_id).toBe("alice-1");
      expect(res.body.claimed_by.user).toBe("alice");
    });

    test("ignores claims from the requesting session itself", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      const res = await request(app)
        .get("/api/v1/claims/check")
        .query({ file: "src/search/index.ts", session_id: "alice-1" })
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.conflict).toBe(false);
    });

    test("ignores stale session claims", async () => {
      seedSession(db, { id: "stale-1", file_claims: '["src/search/*"]' });
      db.prepare(`
        UPDATE sessions SET last_heartbeat = datetime('now', '-60 minutes')
        WHERE id = 'stale-1'
      `).run();
      const res = await request(app)
        .get("/api/v1/claims/check")
        .query({ file: "src/search/index.ts", session_id: "bob-1" })
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.conflict).toBe(false);
    });

    test("matches exact file paths in claims", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/shared/utils.ts"]' });
      const res = await request(app)
        .get("/api/v1/claims/check")
        .query({ file: "src/shared/utils.ts", session_id: "bob-1" })
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.conflict).toBe(true);
    });
  });

  describe("POST /claims/:sessionId", () => {
    test("registers file claims for a session", async () => {
      seedSession(db, { id: "bob-1", user: "bob", file_claims: "[]" });
      const res = await request(app)
        .post("/api/v1/claims/bob-1")
        .set(auth())
        .send({ claims: ["src/payment/*", "src/shared/types.ts"] });
      expect(res.status).toBe(200);
      expect(res.body.file_claims).toContain("src/payment/*");
      expect(res.body.file_claims).toContain("src/shared/types.ts");
    });

    test("rejects claims that conflict with another session", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      seedSession(db, { id: "bob-1", user: "bob", file_claims: "[]" });
      const res = await request(app)
        .post("/api/v1/claims/bob-1")
        .set(auth())
        .send({ claims: ["src/search/index.ts"] });
      expect(res.status).toBe(409);
      expect(res.body.conflicts).toBeDefined();
    });

    test("accepts claims with force flag even on conflict", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      seedSession(db, { id: "bob-1", user: "bob", file_claims: "[]" });
      const res = await request(app)
        .post("/api/v1/claims/bob-1")
        .set(auth())
        .send({ claims: ["src/search/index.ts"], force: true });
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /claims/:sessionId", () => {
    test("releases all claims for a session", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      const res = await request(app)
        .delete("/api/v1/claims/alice-1")
        .set(auth());
      expect(res.status).toBe(200);
      const row = db.prepare("SELECT file_claims FROM sessions WHERE id = ?").get("alice-1");
      expect(JSON.parse(row.file_claims)).toEqual([]);
    });
  });

  describe("PUT /claims/transfer", () => {
    test("transfers claim from one session to another", async () => {
      seedSession(db, { id: "alice-1", file_claims: '["src/search/*"]' });
      seedSession(db, { id: "bob-1", user: "bob", file_claims: "[]" });
      const res = await request(app)
        .put("/api/v1/claims/transfer")
        .set(auth())
        .send({ from: "alice-1", to: "bob-1", pattern: "src/search/*" });
      expect(res.status).toBe(200);
      const alice = db.prepare("SELECT file_claims FROM sessions WHERE id = ?").get("alice-1");
      const bob = db.prepare("SELECT file_claims FROM sessions WHERE id = ?").get("bob-1");
      expect(JSON.parse(alice.file_claims)).not.toContain("src/search/*");
      expect(JSON.parse(bob.file_claims)).toContain("src/search/*");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/claims.test.js --verbose`
Expected: FAIL — Cannot find module `../routes/claims`

- [ ] **Step 3: Implement `server/routes/claims.js`**

```js
const { Router } = require("express");
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
    return res.status(400).json({ error: "file query parameter is required" });
  }

  const claimedBy = findConflict(db, req.projectId, file, session_id || "");
  if (claimedBy) {
    return res.json({ conflict: true, claimed_by: claimedBy });
  }
  res.json({ conflict: false });
});

router.post("/:sessionId", (req, res) => {
  const db = req.app.locals.db;
  const { sessionId } = req.params;
  const { claims, force } = req.body;

  if (!claims || !Array.isArray(claims)) {
    return res.status(400).json({ error: "claims array is required" });
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
      return res.status(409).json({ error: "File claim conflicts detected", conflicts });
    }
  }

  const session = db.prepare("SELECT file_claims FROM sessions WHERE id = ? AND project_id = ?")
    .get(sessionId, req.projectId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const existing = JSON.parse(session.file_claims || "[]");
  const merged = [...new Set([...existing, ...claims])];

  db.prepare("UPDATE sessions SET file_claims = ?, last_heartbeat = datetime('now') WHERE id = ?")
    .run(JSON.stringify(merged), sessionId);

  res.json({ session_id: sessionId, file_claims: merged });
});

router.delete("/:sessionId", (req, res) => {
  const db = req.app.locals.db;
  db.prepare("UPDATE sessions SET file_claims = '[]' WHERE id = ? AND project_id = ?")
    .run(req.params.sessionId, req.projectId);
  res.json({ session_id: req.params.sessionId, file_claims: [] });
});

router.put("/transfer", (req, res) => {
  const db = req.app.locals.db;
  const { from, to, pattern } = req.body;

  if (!from || !to || !pattern) {
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
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = router;
```

All claim routes are mounted under `/api/v1/claims` via `app.use("/api/v1/claims", claimsRouter)`:
- `GET /api/v1/claims/check` — conflict check
- `POST /api/v1/claims/:sessionId` — register claims
- `DELETE /api/v1/claims/:sessionId` — release claims
- `PUT /api/v1/claims/transfer` — transfer ownership

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest __tests__/claims.test.js --verbose`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/claims.js server/__tests__/claims.test.js
git commit -m "feat(server): add claims API with conflict detection and transfer"
```

---

## Task 6: Specs API

**Files:**
- Create: `server/routes/specs.js`
- Create: `server/__tests__/specs.test.js`

- [ ] **Step 1: Write failing tests for `server/__tests__/specs.test.js`**

```js
const request = require("supertest");
const { createTestDb, seedProject, createTestApp } = require("./helpers");

describe("Specs API", () => {
  let db, app;
  const auth = () => ({ Authorization: "Bearer test-key-123", "X-Project": "test-project" });

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    app = createTestApp(db);
  });

  afterEach(() => db.close());

  test("POST /specs/sync creates specs for a feature", async () => {
    const res = await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        session_id: "alice-1",
        files: [
          { file_type: "proposal", content: "# Proposal\nUser search feature" },
          { file_type: "specs", content: "# Specs\nEndpoint: GET /search" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(2);
  });

  test("POST /specs/sync updates existing specs and increments version", async () => {
    await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        files: [{ file_type: "proposal", content: "v1 content" }],
      });

    const res = await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        files: [{ file_type: "proposal", content: "v2 content" }],
      });
    expect(res.status).toBe(200);

    const spec = db.prepare(
      "SELECT version, content FROM specs WHERE slug = ? AND file_type = ?"
    ).get("user-search", "proposal");
    expect(spec.version).toBe(2);
    expect(spec.content).toBe("v2 content");
  });

  test("GET /specs lists all specs for project", async () => {
    await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        files: [
          { file_type: "proposal", content: "content" },
          { file_type: "specs", content: "content" },
        ],
      });

    const res = await request(app).get("/api/v1/specs").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty("slug");
    expect(res.body[0]).toHaveProperty("version");
    expect(res.body[0]).not.toHaveProperty("content");
  });

  test("GET /specs/:slug/:file_type returns full content", async () => {
    await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        files: [{ file_type: "proposal", content: "# Full content here" }],
      });

    const res = await request(app)
      .get("/api/v1/specs/user-search/proposal")
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("# Full content here");
  });

  test("GET /specs/changes returns specs updated after timestamp", async () => {
    await request(app)
      .post("/api/v1/specs/sync")
      .set(auth())
      .send({
        feature: "user-search",
        files: [{ file_type: "proposal", content: "content" }],
      });

    const pastDate = new Date(Date.now() - 60000).toISOString();
    const res = await request(app)
      .get("/api/v1/specs/changes")
      .query({ since: pastDate })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest __tests__/specs.test.js --verbose`
Expected: FAIL — Cannot find module `../routes/specs`

- [ ] **Step 3: Implement `server/routes/specs.js`**

```js
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
        req.projectId, session_id || null, feature, slug,
        file.file_type, file.content, req.body.user || null
      );
    }
  });

  syncAll();
  res.json({ synced: files.length, slug });
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

router.get("/changes", (req, res) => {
  const db = req.app.locals.db;
  const { since } = req.query;

  if (!since) {
    return res.status(400).json({ error: "since query parameter is required" });
  }

  const specs = db
    .prepare(`
      SELECT slug, feature, file_type, content, version, updated_by, updated_at
      FROM specs WHERE project_id = ? AND updated_at > ?
      ORDER BY updated_at DESC
    `)
    .all(req.projectId, since);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest __tests__/specs.test.js --verbose`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/specs.js server/__tests__/specs.test.js
git commit -m "feat(server): add specs API with sync, list, and incremental changes"
```

---

## Task 7: Stale Cleanup Job

**Files:**
- Create: `server/jobs/stale-cleanup.js`
- Create: `server/__tests__/stale-cleanup.test.js`

- [ ] **Step 1: Write failing test for `server/__tests__/stale-cleanup.test.js`**

```js
const { createTestDb, seedProject, seedSession } = require("./helpers");
const { cleanupStaleSessions } = require("../jobs/stale-cleanup");

describe("Stale cleanup", () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
  });

  afterEach(() => db.close());

  test("marks sessions stale and clears claims after 30 min inactivity", () => {
    seedSession(db, { id: "old-1", file_claims: '["src/old/*"]' });
    db.prepare(`
      UPDATE sessions SET last_heartbeat = datetime('now', '-60 minutes')
      WHERE id = 'old-1'
    `).run();

    seedSession(db, { id: "active-1", file_claims: '["src/active/*"]' });

    const cleaned = cleanupStaleSessions(db);
    expect(cleaned).toBe(1);

    const old = db.prepare("SELECT status, file_claims FROM sessions WHERE id = ?").get("old-1");
    expect(old.status).toBe("stale");
    expect(JSON.parse(old.file_claims)).toEqual([]);

    const active = db.prepare("SELECT status, file_claims FROM sessions WHERE id = ?").get("active-1");
    expect(active.status).not.toBe("stale");
    expect(JSON.parse(active.file_claims)).toEqual(["src/active/*"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest __tests__/stale-cleanup.test.js --verbose`
Expected: FAIL — Cannot find module `../jobs/stale-cleanup`

- [ ] **Step 3: Implement `server/jobs/stale-cleanup.js`**

```js
const STALE_THRESHOLD_MINUTES = 30;
const CLEANUP_INTERVAL_MS = 60 * 1000;

function cleanupStaleSessions(db) {
  const result = db.prepare(`
    UPDATE sessions
    SET status = 'stale', file_claims = '[]'
    WHERE status != 'stale'
      AND last_heartbeat < datetime('now', '-${STALE_THRESHOLD_MINUTES} minutes')
  `).run();

  if (result.changes > 0) {
    console.log(`[stale-cleanup] Marked ${result.changes} session(s) as stale`);
  }

  return result.changes;
}

function startStaleCleanup(db) {
  setInterval(() => cleanupStaleSessions(db), CLEANUP_INTERVAL_MS);
  console.log(`[stale-cleanup] Running every ${CLEANUP_INTERVAL_MS / 1000}s`);
}

module.exports = { cleanupStaleSessions, startStaleCleanup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest __tests__/stale-cleanup.test.js --verbose`
Expected: 1 test PASS

- [ ] **Step 5: Commit**

```bash
git add server/jobs/stale-cleanup.js server/__tests__/stale-cleanup.test.js
git commit -m "feat(server): add stale session cleanup job"
```

---

## Task 8: Dockerfile

**Files:**
- Create: `server/Dockerfile`
- Create: `server/.dockerignore`

- [ ] **Step 1: Create `server/Dockerfile`**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=9527
ENV DATA_DIR=/data

EXPOSE 9527

CMD ["node", "index.js"]
```

- [ ] **Step 2: Create `server/.dockerignore`**

```
node_modules
__tests__
*.test.js
.dockerignore
```

- [ ] **Step 3: Verify Docker build**

Run: `cd server && docker build -t openspec-autodev-server .`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add server/Dockerfile server/.dockerignore
git commit -m "feat(server): add Dockerfile for coordination server"
```

---

## Task 9: Run All Server Tests

- [ ] **Step 1: Run full server test suite**

Run: `cd server && npx jest --verbose --forceExit`
Expected: ALL tests PASS (at least 18 tests across 5 files)

- [ ] **Step 2: Fix any failures, then commit if any fixes were needed**

---

## Task 10: Client — Coordination Config Loader & API Helper

**Files:**
- Modify: `hooks/session-utils.sh`

- [ ] **Step 1: Add coordination functions to `hooks/session-utils.sh`**

Append the following functions **after** the existing `cleanup_stale_sessions` function (line 309):

```bash
# ============================================================
# Remote Coordination API Support
# ============================================================

COORD_ENABLED="false"
COORD_SERVER=""
COORD_PROJECT_ID=""
COORD_API_KEY=""
COORD_TIMEOUT=3

load_coordination_config() {
  local config_file=".claude/coordination.json"
  if [ ! -f "$config_file" ]; then
    COORD_ENABLED="false"
    return
  fi

  if command -v node &>/dev/null; then
    eval "$(node -e "
      try {
        const c = JSON.parse(require('fs').readFileSync('${config_file}', 'utf8'));
        console.log('COORD_ENABLED=' + (c.enabled ? 'true' : 'false'));
        console.log('COORD_SERVER=' + (c.server || ''));
        console.log('COORD_PROJECT_ID=' + (c.projectId || ''));
        console.log('COORD_API_KEY=' + (c.apiKey || ''));
        console.log('COORD_TIMEOUT=' + (c.timeout ? Math.ceil(c.timeout / 1000) : 3));
      } catch(e) {
        console.log('COORD_ENABLED=false');
      }
    " 2>/dev/null)"
  elif command -v python3 &>/dev/null; then
    eval "$(python3 -c "
import json
try:
    c = json.load(open('${config_file}'))
    print(f\"COORD_ENABLED={'true' if c.get('enabled') else 'false'}\")
    print(f\"COORD_SERVER={c.get('server', '')}\")
    print(f\"COORD_PROJECT_ID={c.get('projectId', '')}\")
    print(f\"COORD_API_KEY={c.get('apiKey', '')}\")
    t = c.get('timeout', 3000)
    print(f\"COORD_TIMEOUT={-(-t // 1000)}\")
except:
    print('COORD_ENABLED=false')
" 2>/dev/null)"
  fi
}

coord_api() {
  local method="$1"
  local path="$2"
  local body="$3"

  if [ "$COORD_ENABLED" != "true" ]; then
    return 1
  fi

  local curl_args=(
    -s -m "$COORD_TIMEOUT"
    -X "$method"
    -H "Authorization: Bearer ${COORD_API_KEY}"
    -H "X-Project: ${COORD_PROJECT_ID}"
    -H "Content-Type: application/json"
  )

  if [ -n "$body" ]; then
    curl_args+=(-d "$body")
  fi

  curl "${curl_args[@]}" "${COORD_SERVER}${path}" 2>/dev/null
}

coord_offline_warning() {
  local marker=".claude/.coord-offline"
  if [ ! -f "$marker" ]; then
    echo "⚠️ Coordination server unreachable, using local mode. Remote claims may be stale."
    touch "$marker" 2>/dev/null
  fi
}

coord_online_clear() {
  rm -f ".claude/.coord-offline" 2>/dev/null
}
```

- [ ] **Step 2: Verify script still sources without errors**

Run: `bash -c "source hooks/session-utils.sh && echo OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add hooks/session-utils.sh
git commit -m "feat(hooks): add coordination API helper functions to session-utils"
```

---

## Task 11: Client — session-start.sh Remote Integration

**Files:**
- Modify: `hooks/session-start.sh`

- [ ] **Step 1: Replace the session registration block in `hooks/session-start.sh`**

Replace lines 11-24 with:

```bash
# --- Session Management ---
mkdir -p .claude/sessions

# Load coordination config
load_coordination_config

# Clean up stale sessions (inactive > 30 min)
cleanup_stale_sessions

# Register this session
SID=$(generate_session_id)
register_session "$SID"
echo "📍 Session: ${SID}"

# Remote registration (if coordination enabled)
if [ "$COORD_ENABLED" = "true" ]; then
  local_user=$(whoami 2>/dev/null || echo "unknown")
  REMOTE_RESULT=$(coord_api POST "/api/v1/sessions" \
    "{\"id\": \"${SID}\", \"user\": \"${local_user}\"}")
  if [ -n "$REMOTE_RESULT" ]; then
    coord_online_clear
    echo "🌐 Registered with coordination server"
  else
    coord_offline_warning
  fi
fi

# Show active sessions
echo "--- Active Sessions ---"
if [ "$COORD_ENABLED" = "true" ]; then
  REMOTE_SESSIONS=$(coord_api GET "/api/v1/sessions")
  if [ -n "$REMOTE_SESSIONS" ] && command -v node &>/dev/null; then
    coord_online_clear
    node -e "
      const sessions = JSON.parse(process.argv[1]);
      if (sessions.length === 0) { console.log('  No active sessions.'); process.exit(0); }
      for (const s of sessions) {
        const marker = s.id === '${SID}' ? ' ← (you)' : '';
        const claims = (s.file_claims || []).length;
        const claimsStr = claims > 0 ? ' [' + claims + ' files claimed]' : '';
        console.log('  👤 ' + s.user + ': ' + (s.feature || '-') +
          ' (' + (s.workflow_type || '-') + ', ' + (s.phase != null ? 'Phase ' + s.phase : '-') +
          ', ' + s.status + ')' + claimsStr + ' — ' + s.id + marker);
      }
    " "$REMOTE_SESSIONS" 2>/dev/null || list_active_sessions
  else
    list_active_sessions
  fi
else
  list_active_sessions
fi
```

- [ ] **Step 2: Verify the hook runs without errors (no server)**

Run: `cd /tmp/test-proj && mkdir -p .claude && bash /path/to/hooks/session-start.sh`
Expected: Runs normally, shows local sessions, no crash

- [ ] **Step 3: Commit**

```bash
git add hooks/session-start.sh
git commit -m "feat(hooks): add remote session registration to SessionStart hook"
```

---

## Task 12: Client — pre-tool-use.sh Remote Claim Check

**Files:**
- Modify: `hooks/pre-tool-use.sh`

- [ ] **Step 1: Replace the claim check block in `hooks/pre-tool-use.sh`**

Replace the file claim check section (lines 27-33) with:

```bash
# Check file claims from other sessions
load_coordination_config

if [ "$COORD_ENABLED" = "true" ]; then
  MY_SID=$(get_session_id)
  ENCODED_FILE=$(node -e "console.log(encodeURIComponent('${FILE}'))" 2>/dev/null || echo "$FILE")
  REMOTE_CHECK=$(coord_api GET "/api/v1/claims/check?file=${ENCODED_FILE}&session_id=${MY_SID}")

  if [ -n "$REMOTE_CHECK" ]; then
    coord_online_clear
    CONFLICT=$(node -e "
      const r = JSON.parse(process.argv[1]);
      if (r.conflict) {
        console.log('CONFLICT: File ' + '${FILE}' + ' is claimed by session ' +
          r.claimed_by.session_id + ' (user: ' + r.claimed_by.user +
          ', feature: ' + (r.claimed_by.feature || 'unknown') + ')');
      }
    " "$REMOTE_CHECK" 2>/dev/null)

    if [ -n "$CONFLICT" ]; then
      echo "⚠️ ${CONFLICT}"
      echo "Use /openspec-autodev:claim to negotiate file ownership, or /openspec-autodev:status to see all sessions."
      exit 2
    fi
    exit 0
  else
    coord_offline_warning
  fi
fi

# Fallback: local claim check
CONFLICT_MSG=$(check_file_claim "$FILE")
if [ $? -ne 0 ]; then
  echo "⚠️ ${CONFLICT_MSG}"
  echo "Use /openspec-autodev:claim to negotiate file ownership, or /openspec-autodev:status to see all sessions."
  exit 2
fi

exit 0
```

- [ ] **Step 2: Verify the hook runs without errors (no server)**

Run: `bash hooks/pre-tool-use.sh "src/test.ts"`
Expected: Exits with 0, falls back to local check

- [ ] **Step 3: Commit**

```bash
git add hooks/pre-tool-use.sh
git commit -m "feat(hooks): add remote claim check to PreToolUse with local fallback"
```

---

## Task 13: Client — post-tool-use.sh Remote Heartbeat

**Files:**
- Modify: `hooks/post-tool-use.sh`

- [ ] **Step 1: Add remote heartbeat after local heartbeat in `hooks/post-tool-use.sh`**

After line 12 (`update_heartbeat`), insert:

```bash
# Remote heartbeat (if coordination enabled)
load_coordination_config
if [ "$COORD_ENABLED" = "true" ]; then
  MY_SID=$(get_session_id)
  if [ -n "$MY_SID" ]; then
    RESULT=$(coord_api PUT "/api/v1/sessions/${MY_SID}/heartbeat")
    if [ -n "$RESULT" ]; then
      coord_online_clear
    fi
  fi
fi
```

- [ ] **Step 2: Verify the hook runs without errors**

Run: `bash hooks/post-tool-use.sh ""`
Expected: Exits with 0, no errors

- [ ] **Step 3: Commit**

```bash
git add hooks/post-tool-use.sh
git commit -m "feat(hooks): add remote heartbeat to PostToolUse hook"
```

---

## Task 14: Skill Updates — setup/SKILL.md

**Files:**
- Modify: `skills/setup/SKILL.md`

- [ ] **Step 1: Add Step 8 (renumber existing Step 7: Verification → Step 8) and insert new Step 7 for coordination setup**

Insert after Step 6 and before the current Step 7 (Verification):

```markdown
## Step 7: Configure Coordination Server (Optional)

Ask the user:
```
👥 Multi-person collaboration: Do you want to connect to a coordination server
   for cross-machine real-time collaboration?
   (Required only if multiple developers work on separate machines)
   
   → y: Configure coordination server
   → n: Skip (local-only collaboration, works for same-machine sessions)
```

If user chooses **n**, skip to Step 8.

If user chooses **y**:

### 7.1 Collect server information

Ask for:
1. **Server URL** (e.g., `http://192.168.1.100:9527`)
2. **Project ID** (e.g., `my-app`)
3. **API Key** (obtained from server admin page)

### 7.2 Verify connection

```bash
curl -s -m 5 \
  -H "Authorization: Bearer <api-key>" \
  -H "X-Project: <project-id>" \
  "<server-url>/api/v1/sessions" 2>/dev/null
```

If connection fails, show error and offer to retry or skip.

### 7.3 Write configuration

Write `.claude/coordination.json`:
```json
{
  "enabled": true,
  "server": "<server-url>",
  "projectId": "<project-id>",
  "apiKey": "<api-key>",
  "timeout": 3000
}
```

### 7.4 Update .gitignore

Ensure `.claude/coordination.json` is in `.gitignore` (contains API key).

Report:
```
✅ Coordination server: connected (<server-url>)
   Project: <project-id>
   Cross-machine collaboration: enabled
```
```

Also update the existing Step 7 → Step 8 header, and add coordination status to the verification output:

```
👥 Multi-person support:
   Coordination server: connected / not configured
   Each session gets isolated state under .claude/sessions/
   Use /openspec-autodev:status to see all active sessions.
```

- [ ] **Step 2: Commit**

```bash
git add skills/setup/SKILL.md
git commit -m "feat(skills): add coordination server setup step to setup skill"
```

---

## Task 15: Skill Updates — status/SKILL.md

**Files:**
- Modify: `skills/status/SKILL.md`

- [ ] **Step 1: Update Step 1 in `skills/status/SKILL.md` to try remote first**

Add a new section before the existing Step 1:

```markdown
## Step 0: Check Coordination Server

Check if `.claude/coordination.json` exists and `enabled` is true.

If coordination is enabled, fetch remote data first:
```bash
# Fetch all sessions from coordination server
curl -s -m 3 \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-Project: <projectId>" \
  "<server>/api/v1/sessions"

# Fetch all specs
curl -s -m 3 \
  -H "Authorization: Bearer <apiKey>" \
  -H "X-Project: <projectId>" \
  "<server>/api/v1/specs"
```

If remote data is available, use it for the dashboard (it includes cross-machine sessions).
If remote is unavailable, fall back to local `.claude/sessions/` data and note:
```
⚠️ Coordination server unreachable — showing local data only.
```
```

Also update Step 2 dashboard to show a 🌐 indicator for remote-sourced data:

```
=== OpenSpec AutoDev — Session Dashboard ===
🌐 Data source: coordination server (http://192.168.1.100:9527)
```

- [ ] **Step 2: Commit**

```bash
git add skills/status/SKILL.md
git commit -m "feat(skills): add remote-first data fetching to status skill"
```

---

## Task 16: Skill Updates — claim/SKILL.md

**Files:**
- Modify: `skills/claim/SKILL.md`

- [ ] **Step 1: Add remote sync instructions to `skills/claim/SKILL.md`**

Add a new section at the top after "Parse Arguments":

```markdown
## Remote Sync Check

Before any claim operation, check if coordination is enabled:
```bash
cat .claude/coordination.json 2>/dev/null
```

If enabled, **all claim operations must sync to the remote server** in addition to local files:

- **add**: `POST <server>/api/v1/claims/sessions/<session-id>` with `{ "claims": ["<pattern>"] }`
  - If server returns 409 (conflict), show the remote conflict info
- **release**: `DELETE <server>/api/v1/claims/sessions/<session-id>`
- **transfer**: `PUT <server>/api/v1/claims/transfer` with `{ "from": "<id>", "to": "<id>", "pattern": "<pattern>" }`
- **list**: `GET <server>/api/v1/sessions` and display all sessions' claims

If the server is unreachable, perform the operation locally and warn:
```
⚠️ Coordination server unreachable — change applied locally only.
   Run /openspec-autodev:status when server is back to verify sync.
```
```

- [ ] **Step 2: Commit**

```bash
git add skills/claim/SKILL.md
git commit -m "feat(skills): add remote sync to claim management skill"
```

---

## Task 17: Update .gitignore

**Files:**
- Modify: `.gitignore` (if exists at project root, or note for setup skill)

- [ ] **Step 1: Ensure coordination files are gitignored**

Add to `.gitignore`:

```
# Coordination server credentials (per-developer)
.claude/coordination.json
.claude/.coord-offline
.claude/remote-specs/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add coordination config files to gitignore"
```

---

## Task 18: Final Integration Test

- [ ] **Step 1: Start the server locally**

```bash
cd server && node index.js &
```

- [ ] **Step 2: Create a test project via API**

```bash
curl -s -X POST http://localhost:9527/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"id": "test", "name": "Test Project"}'
```

Expected: Returns `{ "id": "test", "api_key": "oadev_..." }`

- [ ] **Step 3: Write a test `coordination.json`**

```bash
echo '{"enabled":true,"server":"http://localhost:9527","projectId":"test","apiKey":"<key-from-step-2>","timeout":3000}' > .claude/coordination.json
```

- [ ] **Step 4: Run session-start hook and verify remote registration**

```bash
bash hooks/session-start.sh
```

Expected: Shows `🌐 Registered with coordination server` and lists sessions from remote

- [ ] **Step 5: Run pre-tool-use hook and verify remote check**

```bash
bash hooks/pre-tool-use.sh "src/unclaimed.ts"
```

Expected: Exits 0 (no conflict, remote check succeeded)

- [ ] **Step 6: Stop server, verify graceful degradation**

```bash
kill %1
bash hooks/pre-tool-use.sh "src/unclaimed.ts"
```

Expected: Shows offline warning, falls back to local, exits 0

- [ ] **Step 7: Clean up test artifacts**

```bash
rm .claude/coordination.json .claude/.coord-offline 2>/dev/null
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: distributed multi-developer collaboration support

Add self-hosted coordination server (Node.js + SQLite) and modify client
hooks to support real-time cross-machine session, file claim, and spec
synchronization with transparent local fallback."
```
