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
