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
    const res = await request(app)
      .get(`/api/v1/projects/${proj.id}/dashboard`)
      .set("Authorization", `Bearer ${proj.api_key}`)
      .set("X-Project", proj.id);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sessions");
    expect(res.body).toHaveProperty("specs");
  });
});
