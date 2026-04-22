const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const { createDb } = require("./db");
const { startStaleCleanup } = require("./jobs/stale-cleanup");
const logger = require("./lib/logger");

const PORT = process.env.PORT || 9527;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "coordination.db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const morganFormat = process.env.MORGAN_FORMAT || "tiny";
app.use(
  morgan(morganFormat, {
    skip: (req) => req.path === "/health",
    stream: { write: (line) => process.stdout.write(line) },
  })
);

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

const server = app.listen(PORT, () => {
  logger.info(`openspec-autodev-server listening`, { port: PORT, dataDir: DATA_DIR, logLevel: process.env.LOG_LEVEL || "info" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Error: port ${PORT} is already in use. Kill the existing process or use PORT=<other> npm start`);
  } else {
    console.error("Server error:", err.message);
  }
  process.exit(1);
});

module.exports = app;
