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

  test("does nothing when no sessions are stale", () => {
    seedSession(db, { id: "fresh-1", file_claims: '["src/fresh/*"]' });
    const cleaned = cleanupStaleSessions(db);
    expect(cleaned).toBe(0);
  });

  test("does not re-mark already stale sessions", () => {
    seedSession(db, { id: "already-stale", status: "stale", file_claims: "[]" });
    db.prepare(`
      UPDATE sessions SET last_heartbeat = datetime('now', '-120 minutes')
      WHERE id = 'already-stale'
    `).run();

    const cleaned = cleanupStaleSessions(db);
    expect(cleaned).toBe(0);
  });
});
