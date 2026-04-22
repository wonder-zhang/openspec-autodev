const LS_PROJECT = "oadev_project_id";
const LS_KEY = "oadev_api_key";

function $(id) {
  return document.getElementById(id);
}

function show(el, html, className) {
  el.innerHTML = html;
  el.className = "alert " + (className || "");
  el.hidden = !html;
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body.error || res.statusText || "Request failed");
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function loadSaved() {
  const pid = localStorage.getItem(LS_PROJECT);
  const key = localStorage.getItem(LS_KEY);
  if (pid) $("connectProject").value = pid;
  if (key) $("connectKey").value = key;
}

function saveConnection(projectId, apiKey) {
  localStorage.setItem(LS_PROJECT, projectId);
  localStorage.setItem(LS_KEY, apiKey);
}

function authHeaders(projectId, apiKey) {
  return {
    Authorization: "Bearer " + apiKey,
    "X-Project": projectId,
  };
}

$("formCreate").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("newProjectId").value.trim();
  const name = $("newProjectName").value.trim();
  const msg = $("createMsg");
  msg.hidden = true;
  try {
    const data = await api("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ id, name }),
    });
    show(msg, "项目已创建。请妥善保存 API Key（仅显示一次）。", "success");
    $("keyDisplay").hidden = false;
    $("keyDisplay").querySelector("code").textContent = data.api_key;
    saveConnection(data.id, data.api_key);
    $("connectProject").value = data.id;
    $("connectKey").value = data.api_key;
  } catch (err) {
    show(msg, err.body?.error || err.message, "error");
    $("keyDisplay").hidden = true;
  }
});

$("btnCopyKey").addEventListener("click", () => {
  const code = $("keyDisplay").querySelector("code");
  if (code && code.textContent) {
    navigator.clipboard.writeText(code.textContent);
    $("copyHint").textContent = "已复制";
    setTimeout(() => {
      $("copyHint").textContent = "";
    }, 2000);
  }
});

async function loadDashboard() {
  const projectId = $("connectProject").value.trim();
  const apiKey = $("connectKey").value.trim();
  const msg = $("connectMsg");
  msg.hidden = true;
  if (!projectId || !apiKey) {
    show(msg, "请填写 Project ID 和 API Key", "warn");
    return;
  }
  try {
    const data = await api("/api/v1/projects/" + encodeURIComponent(projectId) + "/dashboard", {
      headers: authHeaders(projectId, apiKey),
    });
    saveConnection(projectId, apiKey);
    show(msg, "已连接并加载看板数据。", "success");
    renderDashboard(data);
  } catch (err) {
    show(msg, (err.body && err.body.error) || err.message, "error");
  }
}

$("formConnect").addEventListener("submit", async (e) => {
  e.preventDefault();
  await loadDashboard();
});

$("btnRefresh").addEventListener("click", () => {
  loadDashboard();
});

function esc(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function renderDashboard(data) {
  $("dashMeta").textContent =
    "project: " + esc(data.project_id) +
    " · sessions: " + (data.sessions?.length || 0) +
    " · specs: " + (data.specs?.length || 0);

  const sess = data.sessions || [];
  if (sess.length === 0) {
    $("sessionsBody").innerHTML = '<tr><td colspan="6" class="empty">暂无 session</td></tr>';
  } else {
    $("sessionsBody").innerHTML = sess
      .map(
        (s) =>
          "<tr><td>" +
          esc(s.id) +
          "</td><td>" +
          esc(s.user) +
          "</td><td>" +
          esc(s.feature) +
          "</td><td>" +
          esc(s.status) +
          "</td><td>" +
          esc(s.phase) +
          "</td><td><code style='font-size:0.7rem'>" +
          esc(s.file_claims) +
          "</code></td></tr>"
      )
      .join("");
  }

  const specs = data.specs || [];
  if (specs.length === 0) {
    $("specsBody").innerHTML = '<tr><td colspan="5" class="empty">暂无已同步的 spec</td></tr>';
  } else {
    $("specsBody").innerHTML = specs
      .map(
        (sp) =>
          "<tr><td>" +
          esc(sp.slug) +
          "</td><td>" +
          esc(sp.file_type) +
          "</td><td>" +
          esc(sp.version) +
          "</td><td>" +
          esc(sp.updated_by) +
          "</td><td>" +
          esc(sp.updated_at) +
          "</td></tr>"
      )
      .join("");
  }

  $("dashboard").hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  loadSaved();
});
