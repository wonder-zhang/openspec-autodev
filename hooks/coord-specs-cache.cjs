#!/usr/bin/env node
/**
 * Coordination server OpenSpec cache (design: POST /specs/sync on change, GET /specs on session start).
 * Invoked from session-utils consumers (session-start, post-tool-use). Requires env:
 * COORD_SERVER, COORD_API_KEY, COORD_PROJECT_ID, COORD_TIMEOUT (seconds, optional).
 */
const fs = require("fs");
const path = require("path");

function timeoutMs() {
  const s = parseInt(process.env.COORD_TIMEOUT || "3", 10);
  return Math.max(1, s) * 1000;
}

function buildUrl(pathname) {
  const base = (process.env.COORD_SERVER || "").replace(/\/?$/, "/");
  return new URL(pathname.replace(/^\//, ""), base).toString();
}

async function coordFetch(method, pathname, jsonBody) {
  const url = buildUrl(pathname);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.COORD_API_KEY || ""}`,
        "X-Project": process.env.COORD_PROJECT_ID || "",
        "Content-Type": "application/json",
      },
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

function parseChangeFile(filePath) {
  const norm = String(filePath).replace(/\\/g, "/");
  const m = norm.match(/openspec\/changes\/([^/]+)\/(proposal|specs|design|tasks)\.md$/i);
  if (!m) return null;
  const featureDir = m[1];
  if (featureDir === "archive") return null;
  return { featureDir, changeDir: path.join("openspec", "changes", featureDir) };
}

async function cmdPush() {
  const idx = process.argv.indexOf("--file");
  const filePath = idx >= 0 ? process.argv[idx + 1] : "";
  if (!filePath) {
    process.stderr.write("coord-specs-cache: push requires --file <path>\n");
    process.exit(1);
  }
  const meta = parseChangeFile(filePath);
  if (!meta) process.exit(2);

  const types = ["proposal", "specs", "design", "tasks"];
  const files = [];
  for (const ft of types) {
    const fp = path.join(meta.changeDir, `${ft}.md`);
    if (fs.existsSync(fp)) {
      files.push({ file_type: ft, content: fs.readFileSync(fp, "utf8") });
    }
  }
  if (files.length === 0) process.exit(2);

  let session_id = null;
  try {
    session_id = fs.readFileSync(path.join(".claude", "current-session-id"), "utf8").trim() || null;
  } catch {
    session_id = null;
  }

  const body = {
    feature: meta.featureDir,
    session_id,
    user: process.env.USER || process.env.USERNAME || null,
    files,
  };

  await coordFetch("POST", "/api/v1/specs/sync", body);
  process.exit(0);
}

async function cmdPull() {
  const list = await coordFetch("GET", "/api/v1/specs");
  const outRoot = path.join(".claude", "remote-specs");
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, "_summary.json"), JSON.stringify(list, null, 2));

  if (!Array.isArray(list) || list.length === 0) {
    process.exit(0);
  }

  const seen = new Set();
  for (const row of list) {
    const key = `${row.slug}\t${row.file_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const detail = await coordFetch("GET", `/api/v1/specs/${encodeURIComponent(row.slug)}/${encodeURIComponent(row.file_type)}`);
    const content = detail.content != null ? String(detail.content) : "";
    const dir = path.join(outRoot, row.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${row.file_type}.md`), content);
  }
  process.exit(0);
}

async function main() {
  const cmd = process.argv[2];
  if (!process.env.COORD_SERVER || !process.env.COORD_API_KEY || !process.env.COORD_PROJECT_ID) {
    process.exit(1);
  }
  try {
    if (cmd === "pull") await cmdPull();
    else if (cmd === "push") await cmdPush();
    else {
      process.stderr.write("Usage: coord-specs-cache.cjs pull | push --file <path>\n");
      process.exit(1);
    }
  } catch (e) {
    process.exit(1);
  }
}

main();
