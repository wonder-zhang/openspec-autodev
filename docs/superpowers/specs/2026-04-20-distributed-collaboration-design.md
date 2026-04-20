# Distributed Multi-Developer Collaboration Design

> openspec-autodev 分布式多人协作方案设计

## 1. 背景与问题

### 当前状态

插件的多人协作机制完全基于本地文件系统（`.claude/sessions/*.json`），通过 PreToolUse hook 在编辑前检查 file claim 冲突。

### 核心问题

当开发者 A 和 B 在**各自的机器**上编码并推送到同一 git 仓库时，现有机制完全失效：

- `.claude/sessions/` 被 gitignore，跨机器不可见
- File claim 检测只扫描本地磁盘，无法感知远程开发者
- OpenSpec 规格文件可能产生冲突（两人定义矛盾的接口）
- 无 git 层面的 merge conflict 辅助

### 目标

在不破坏现有单机体验的前提下，引入一个可选的协调服务，支持跨机器的多人实时协作。

## 2. 设计约束

| 维度 | 决定 | 理由 |
|------|------|------|
| 基础设施 | 自托管协调服务 | 数据可控，团队自主运维 |
| 同步粒度 | Session + File Claims + OpenSpec 规格 | 覆盖文件冲突和规格冲突两个关键痛点 |
| 通信策略 | 事件驱动（Hook 触发时同步） | 与 Claude Code hook 架构天然契合 |
| 技术栈 | Node.js + SQLite | 与插件生态一致，零额外数据库依赖 |
| 兼容性 | 不启用时行为完全不变 | 零破坏性，渐进式采用 |

## 3. 整体架构

```
Developer A (Machine A)              Developer B (Machine B)
┌────────────────────┐               ┌────────────────────┐
│ Claude Code        │               │ Claude Code        │
│  ├─ SessionStart   │               │  ├─ SessionStart   │
│  ├─ PreToolUse     │               │  ├─ PreToolUse     │
│  ├─ PostToolUse    │               │  ├─ PostToolUse    │
│  └─ Phase hooks    │               │  └─ Phase hooks    │
│         │          │               │          │         │
│  .claude/          │               │  .claude/          │
│   coordination.json│               │   coordination.json│
│   sessions/ (cache)│               │   sessions/ (cache)│
└────────┬───────────┘               └──────────┬─────────┘
         │           REST API                    │
         └──────────────┬────────────────────────┘
                        ▼
              ┌──────────────────┐
              │ openspec-autodev │
              │     -server      │
              │  (Docker/Node)   │
              │                  │
              │  SQLite DB       │
              │  ├─ projects     │
              │  ├─ sessions     │
              │  └─ specs        │
              └──────────────────┘
```

## 4. 服务端设计

### 4.1 部署

**Docker（推荐）**：

```bash
docker run -d \
  --name oadev-server \
  -p 9527:9527 \
  -v oadev-data:/data \
  openspec-autodev-server
```

**直接运行（Node.js 18+）**：

```bash
npx openspec-autodev-server --port 9527 --data ./data
```

### 4.2 数据模型

```sql
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  api_key    TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  config     TEXT DEFAULT '{}'
);

CREATE TABLE sessions (
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

CREATE TABLE specs (
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
```

关键设计点：
- `file_claims` 存在 session 行内（JSON 数组），生命周期与 session 一致
- `specs` 有 version 字段，每次更新自增，便于增量拉取
- stale 判定由服务端定时任务负责（每分钟扫描 `last_heartbeat`，超 30 分钟标记 stale 并清空 claims）

### 4.3 认证

轻量级 API Key 认证，通过 HTTP header 传递：

```
Authorization: Bearer <project-api-key>
X-Project: <project-id>
```

### 4.4 REST API

#### Session 管理

| Method | Path | 说明 | 调用时机 |
|--------|------|------|---------|
| `POST` | `/api/v1/sessions` | 注册新 session | SessionStart |
| `PUT` | `/api/v1/sessions/:id/heartbeat` | 更新心跳 | PostToolUse |
| `PUT` | `/api/v1/sessions/:id` | 更新字段 | Phase 切换 |
| `DELETE` | `/api/v1/sessions/:id` | 注销 session | 工作流完成 |
| `GET` | `/api/v1/sessions` | 列出活跃 session | status 命令 |

#### File Claims

| Method | Path | 说明 | 调用时机 |
|--------|------|------|---------|
| `POST` | `/api/v1/sessions/:id/claims` | 批量注册 claims | Phase 2 |
| `GET` | `/api/v1/claims/check?file=<path>` | 检测冲突 | PreToolUse |
| `DELETE` | `/api/v1/sessions/:id/claims` | 释放全部 claims | Phase 4 |
| `PUT` | `/api/v1/claims/transfer` | 转让所有权 | claim transfer |

#### OpenSpec 规格同步

| Method | Path | 说明 | 调用时机 |
|--------|------|------|---------|
| `POST` | `/api/v1/specs/sync` | 批量同步规格 | Phase 1 完成 |
| `GET` | `/api/v1/specs` | 获取规格摘要 | Phase 2 开始 |
| `GET` | `/api/v1/specs/:slug/:file_type` | 获取单个规格 | 按需 |
| `GET` | `/api/v1/specs/changes?since=<ISO>` | 增量变更 | 按需 |

#### 项目管理

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/projects` | 创建项目，返回 API Key |
| `GET` | `/api/v1/projects/:id/dashboard` | 仪表盘概览 |

#### 关键 API 行为

`GET /api/v1/claims/check` 是最高频调用（每次 PreToolUse），要求：
- 响应 < 50ms
- 自动过滤 stale session 的 claims
- 返回格式：

```json
// 有冲突
{
  "conflict": true,
  "claimed_by": {
    "session_id": "bob-1713600100",
    "user": "bob",
    "feature": "payment"
  }
}

// 无冲突
{ "conflict": false }
```

`POST /api/v1/specs/sync` 批量推送：

```json
{
  "feature": "user-search",
  "files": [
    { "file_type": "proposal", "content": "..." },
    { "file_type": "specs", "content": "..." },
    { "file_type": "design", "content": "..." },
    { "file_type": "tasks", "content": "..." }
  ]
}
```

### 4.5 服务端定时任务

Stale session 清理（每 60 秒运行）：

```
扫描 sessions WHERE last_heartbeat < datetime('now', '-30 minutes')
  → 更新 status = 'stale'
  → 清空 file_claims = '[]'
```

不删除 session 记录（保留历史可追溯），只释放占用。

## 5. 客户端改造

### 5.1 配置文件

`.claude/coordination.json`（gitignored）：

```json
{
  "enabled": true,
  "server": "http://192.168.1.100:9527",
  "projectId": "my-app",
  "apiKey": "oadev_xxxxxxxxxxxxx",
  "timeout": 3000
}
```

未启用时所有 hook 行为与当前完全一致。

### 5.2 session-utils.sh 新增函数

```bash
load_coordination_config()
# 读取 coordination.json，设置 COORD_ENABLED / COORD_SERVER 等变量

coord_api() {
  # method, path, body → stdout
  # 统一 curl 调用，超时控制，失败返回空串
}
```

### 5.3 各 Hook 改造逻辑

**SessionStart**：

```
generate_session_id
  → coord_api POST /sessions
  → 成功：同时写本地缓存 + 拉取远程 session 列表
  → 失败：回退到纯本地注册
```

**PreToolUse**（热路径）：

```
coord_api GET /claims/check?file=<path>
  → conflict=true：输出冲突信息，exit 2
  → conflict=false：exit 0
  → API 不可达：回退到本地 check_file_claim()
```

**PostToolUse**：

```
coord_api PUT /sessions/:id/heartbeat
  → 成功：同时更新本地缓存
  → 失败：只更新本地
```

### 5.4 Spec 同步触发点

| 时机 | 动作 |
|------|------|
| Phase 1 完成 | `coord_api POST /specs/sync` 推送全部规格 |
| Phase 2 开始前 | `coord_api GET /specs` 拉取他人规格，分析接口冲突 |

### 5.5 Setup 流程新增 Step 7（可选）

```
提问：是否启用多人协调服务？
  → n：跳过
  → y：输入 server / projectId / apiKey
       → 验证连接 GET /projects/:id/dashboard
       → 写入 .claude/coordination.json
       → 更新 .gitignore
```

## 6. 离线降级与错误处理

### 6.1 三种运行模式

| | 本地模式 | 远程模式 | 降级模式 |
|--|---------|---------|---------|
| 触发条件 | 无 coordination.json | API 正常 | API 不可达 |
| Session 可见性 | 仅本机 | 全团队 | 本机 + 上次缓存 |
| Claim 检测 | 仅本机 | 全团队实时 | 本机 + 缓存（可能过时） |
| Spec 同步 | 无 | 自动推拉 | 仅本地 |
| 用户感知 | 无变化 | 无变化 | 首次降级时一行提示 |

### 6.2 降级状态机

```
coordination.json 存在且 enabled=true?
├─ 否 → 本地模式（当前全部逻辑，不变）
└─ 是 → 调用远程 API
         ├─ 成功 → 远程模式（使用远程结果 + 写本地缓存）
         ├─ 超时/网络错误 → 降级模式（使用本地缓存 + 静默警告）
         └─ 401/403 → 配置错误（警告但不阻塞，降级到本地）
```

### 6.3 本地缓存写入

| 远程操作 | 本地缓存 |
|---------|---------|
| POST /sessions | `.claude/sessions/<id>.json` |
| GET /sessions | `.claude/sessions/_remote-cache.json` |
| GET /claims/check | 不缓存（实时查） |
| POST /specs/sync | 本地文件已存在 |
| GET /specs | `.claude/remote-specs/<feature>/` |

### 6.4 降级提示

首次降级时输出一行提示，后续不重复（通过 `.claude/.coord-offline` 标记文件控制）：

```
⚠️ Coordination server unreachable, using local mode. Remote claims may be stale.
```

### 6.5 边界场景

| 场景 | 处理方式 |
|------|---------|
| 服务端重启，数据丢失 | 客户端 SessionStart 重新注册；暂时看不到他人 claim，不会误阻塞 |
| 两人同时注册同一文件 claim | SQLite 事务保证原子性，先到先得，后到者返回冲突 |
| 开发者换网络（IP 变化） | 认证基于 API Key，不受影响 |
| 终端意外关闭未 deregister | 30 分钟无心跳后服务端自动释放 |
| 客户端/服务端时钟不一致 | 心跳时间以服务端 `datetime('now')` 为准 |

## 7. 目录结构变化

```
openspec-autodev/
├── hooks/                    # 现有，改造
│   ├── session-utils.sh      # +coord_api / load_coordination_config
│   ├── session-start.sh      # +远程注册
│   ├── pre-tool-use.sh       # +远程 claim check
│   └── post-tool-use.sh      # +远程心跳
├── server/                   # 新增
│   ├── index.js              # Express 入口
│   ├── db.js                 # SQLite 初始化 + 迁移
│   ├── routes/
│   │   ├── sessions.js
│   │   ├── claims.js
│   │   ├── specs.js
│   │   └── projects.js
│   ├── middleware/
│   │   └── auth.js
│   ├── jobs/
│   │   └── stale-cleanup.js
│   ├── public/               # 管理页面
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml
├── skills/                   # 现有，更新
│   ├── setup/SKILL.md        # +Step 7
│   ├── status/SKILL.md       # +远程优先
│   └── claim/SKILL.md        # +远程同步
└── ...
```

## 8. 参考

- [Coware](https://coware.team/) — Shared specs for AI coding agents，本设计的 spec 同步部分参考了其 living spec 理念和批量同步 API 模式。
