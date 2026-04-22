const request = require("supertest");
const express = require("express");
const path = require("path");

describe("Admin static UI", () => {
  const app = express();
  app.use(express.static(path.join(__dirname, "..", "public")));

  test("GET / returns HTML", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("openspec-autodev");
  });

  test("GET /styles.css", async () => {
    const res = await request(app).get("/styles.css");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/css/);
  });

  test("GET /app.js", async () => {
    const res = await request(app).get("/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/javascript/);
  });
});
