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
