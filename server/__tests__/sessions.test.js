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
