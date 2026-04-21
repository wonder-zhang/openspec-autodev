# openspec-autodev

> OpenSpec + Superpowers 全自动开发工作流 Claude Code 插件  
> 支持多子代理并行批次执行，多人 Vibe Coding 协作，一键安装即用

## ✨ 特性

- **一键安装**：安装插件后运行 `/openspec-autodev:setup` 即可完成所有配置
- **全自动开发**：从需求确认到代码完成，仅需一个人工确认节点
- **并行执行**：基于依赖分析的多子代理并行批次执行，大幅缩短开发时间
- **多人协作**：Session 隔离 + 文件占用声明 + 可选的跨机器协调服务，多人同时 Vibe Coding 同一项目不冲突
- **TDD 驱动**：严格遵循 Red-Green-Refactor 循环
- **断点恢复**：工作流中断后可从断点继续，支持跨 Session 恢复
- **安全防护**：自动阻止修改敏感文件，自动格式化代码

## 🚀 快速开始

### Step 1：安装插件

**方式一：Plugin Marketplace（推荐）**
```
# 1. 注册插件市场源
/plugin marketplace add https://github.com/<your-repo>/openspec-autodev

# 2. 从市场中安装插件
/plugin install openspec-autodev
```

**方式二：手动安装**
```bash
# 克隆到 Claude Code 插件目录
git clone https://github.com/<your-repo>/openspec-autodev.git ~/.claude/plugins/openspec-autodev
```

### Step 2：初始化项目

**推荐：跳过权限确认模式**

为了在整个流程中不被打断，建议运行claude code 时使用：

```bash
claude --dangerously-skip-permissions
```
>当然，如果你不想使用这个flag，在项目初始化的过程中也会通过`.claude/settings.json`中加入一些细粒度的权限来跳过指定的权限确认弹窗。

在 Claude Code 中进入你的项目目录，执行：
```
/openspec-autodev:setup
```

这会自动：
- ✅ 检测并安装 OpenSpec（如未安装）
- ✅ 检测并安装 Superpowers 技能包（如未安装）
- ✅ 初始化 `openspec/` 目录
- ✅ 配置 `CLAUDE.md` 项目宪法
- ✅ 更新 `.gitignore`（包含 Session 状态文件）
- ✅ 自动检测项目语言和测试框架
- ✅ 可选：配置跨机器协调服务（多人远程协作时需要）

### Step 3：开始开发

```
/openspec-autodev:auto-dev 用户搜索功能
```

然后就可以放手了！整个流程自动执行：

```
需求澄清 → 规格生成 → 环境准备 → 并行TDD开发 → 验证收尾 → 等待确认
   人工          自动        自动         自动           自动       人工
```

## 📋 命令列表

| 命令 | 说明 |
|------|------|
| `/openspec-autodev:setup` | 一键初始化项目（首次使用必须执行） |
| `/openspec-autodev:auto-dev <feature>` | 启动全自动开发工作流 |
| `/openspec-autodev:resume` | 恢复中断的工作流（支持跨 Session 恢复） |
| `/openspec-autodev:iterate <feature> [vN]` | 基于已完成功能进行迭代开发 |
| `/openspec-autodev:bugfix <bug-description>` | 轻量级 Bug 修复（TDD + 追溯记录） |
| `/openspec-autodev:parallel-dev <feature>` | 生成外部 CLI 并行执行脚本 |
| `/openspec-autodev:status` | 查看所有活跃 Session 和文件占用情况 |
| `/openspec-autodev:claim <action> <pattern>` | 管理文件占用声明（add/release/transfer） |

## 👥 多人 Vibe Coding

插件支持两种多人协作模式：

| 模式 | 适用场景 | 需要额外部署 |
|------|---------|------------|
| **本地模式**（默认） | 同一台机器多个终端 | 否 |
| **远程模式** | 不同机器各自编码，推同一仓库 | 需部署协调服务 |

### 本地模式

当多个开发者在**同一台机器**上同时用 Claude Code 开发时，通过本地文件系统协调：

```
┌─────────────────────────────────────────────────────────┐
│                    共享项目仓库                            │
│                                                         │
│  .claude/sessions/                                      │
│  ├── alice-1713600000.json    ← Alice 的 Session 注册    │
│  ├── alice-1713600000/        ← Alice 的工作流状态        │
│  │   ├── workflow-state.json                            │
│  │   └── current-plan.md                                │
│  ├── bob-1713600100.json      ← Bob 的 Session 注册      │
│  └── bob-1713600100/          ← Bob 的工作流状态          │
│      ├── workflow-state.json                            │
│      └── current-plan.md                                │
└─────────────────────────────────────────────────────────┘
```

### 远程模式（跨机器协作）

当开发者在**各自的机器**上编码并推送到同一 Git 仓库时，需要部署协调服务来实时同步状态：

```
Developer A (Machine A)              Developer B (Machine B)
┌────────────────────┐               ┌────────────────────┐
│ Claude Code        │               │ Claude Code        │
│  ├─ SessionStart   │               │  ├─ SessionStart   │
│  ├─ PreToolUse     │    REST API   │  ├─ PreToolUse     │
│  └─ PostToolUse    │◄─────────────►│  └─ PostToolUse    │
└────────┬───────────┘               └──────────┬─────────┘
         │                                      │
         └──────────────┬───────────────────────┘
                        ▼
              ┌──────────────────┐
              │ openspec-autodev │
              │     -server      │
              │   (自托管 Docker) │
              │   Node.js+SQLite │
              └──────────────────┘
```

#### 部署协调服务

```bash
# Docker 一键部署
docker run -d --name oadev-server -p 9527:9527 -v oadev-data:/data openspec-autodev-server

# 或直接运行（Node.js 18+）
cd server && npm install && npm start
```

访问 `http://localhost:9527` 创建项目并获取 API Key。

#### 客户端连接

每个开发者在 `/openspec-autodev:setup` 的 Step 7 中输入服务器地址和 API Key 即可。也可以手动创建 `.claude/coordination.json`：

```json
{
  "enabled": true,
  "server": "http://192.168.1.100:9527",
  "projectId": "my-app",
  "apiKey": "oadev_xxxxxxxxxxxxx",
  "timeout": 3000
}
```

#### 离线降级

协调服务不可达时，所有 Hook 自动回退到本地模式，不会阻塞开发。

### 三层保护机制

**1. Session 隔离**：每个 Claude Code 会话拥有独立的状态目录，工作流状态互不干扰。

**2. 文件占用声明（File Claims）**：Phase 2 自动分析微任务涉及的文件，注册到 Session 中。编辑文件前自动检查是否被其他 Session 占用。远程模式下 claim 实时同步到协调服务。

**3. 冲突检测与协商**：
- 启动新工作流时检查其他 Session 的文件占用
- 编辑时 PreToolUse hook 实时拦截冲突写入（本地或远程）
- 支持手动 claim/release/transfer 文件所有权
- 远程模式额外支持：跨机器的 OpenSpec 规格同步，避免接口定义冲突

### 多人开发流程

```bash
# === Alice 的终端（Machine A）===
claude
/openspec-autodev:auto-dev 用户搜索功能
# Alice 自动获得 src/search/ 相关文件的占用

# === Bob 的终端（Machine B，同时）===
claude
/openspec-autodev:status              # 查看 Alice 在做什么（远程实时）
/openspec-autodev:auto-dev 支付功能    # Bob 开发不冲突的功能
# Bob 自动获得 src/payment/ 相关文件的占用

# === 如果 Bob 需要修改 Alice 占用的文件 ===
/openspec-autodev:claim add src/shared/utils.ts
# 系统提示: ⚠️ 该文件被 Alice 的 session 占用
# Bob 可以选择等待、强制占用、或与 Alice 协商
```

### Session 生命周期

| 事件 | 行为 |
|------|------|
| 启动 Claude Code | 自动注册新 Session（本地 + 远程），显示其他活跃 Session |
| 启动工作流 | 检查冲突、注册文件占用、同步 OpenSpec 规格 |
| 编辑文件 | 检查文件占用（远程优先）、更新心跳 |
| 完成工作流 | 释放文件占用、标记 Session 完成 |
| Session 空闲 >30 分钟 | 服务端标记为 stale，自动释放文件占用 |
| 恢复中断的 Session | 支持从当前/指定/遗留 Session 恢复 |

## 🔄 迭代开发模式

当第一次 `auto-dev` 完成后需要迭代，使用 `iterate` 命令：

```bash
# 默认自动递增版本号
/openspec-autodev:iterate user-search

# 指定版本号
/openspec-autodev:iterate user-search v3
```

`iterate` 与 `auto-dev` 的区别：
- ✅ 从归档规格恢复上下文，不从零开始
- ✅ 增量式 spec 更新（保留已有、只改变化部分）
- ✅ 只分解 delta 任务，不重复已完成工作
- ✅ 使用 `iter/<feature>-v<N>` 分支命名

## 🐛 Bug 修复模式

对于简单的 bug 修复，使用轻量级 `bugfix` 命令：

```bash
/openspec-autodev:bugfix 登录页空邮箱崩溃
```

精简的 3 步流程：
```
根因分析 → TDD 修复 → 提交确认
  自动        自动       人工
```

特点：
- ✅ 无需完整 spec generation
- ✅ 创建独立 `fix/<bug-name>` 分支
- ✅ 生成轻量级 OpenSpec 记录，方便追溯
- ✅ 严格 TDD：先写复现测试，再修复

## ⚡ 并行执行模式

### 方案 A：内置并行（默认）

插件在 Phase 3 中自动分析微任务依赖关系，将独立任务分组为并行批次，同一批次内的子代理**同时执行**：

```
Batch 1 (并行): T1-1, T2-1, T3-1  ← 同时启动 3 个子代理
    ↓ 全部完成
Batch 2 (并行): T1-2, T2-2        ← 同时启动 2 个子代理
    ↓ 全部完成
Batch 3 (串行): T1-3 → T4-1       ← 依次执行
```

### 方案 B：外部 CLI 并行（大规模任务）

对于超过 8 个微任务的大型功能，使用 `/openspec-autodev:parallel-dev` 生成独立的并行执行脚本：

```bash
# 自动生成 parallel-dev.sh
/openspec-autodev:parallel-dev user-search

# 在 Git Bash 终端中执行
bash parallel-dev.sh
```

## 🔄 工作流架构

```
用户输入需求
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Phase 0  需求澄清（brainstorming + /opsx:explore）│  ← 人工参与
└─────────────────────────────────────────────────────┘
    │ 用户确认
    ▼
┌─────────────────────────────────────────────────────┐
│  Phase 1  规格生成（/opsx:new + /opsx:ff）        │  ← 全自动
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Phase 2  环境准备 + 依赖分析 + 并行分组 + 文件占用  │  ← 全自动
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Phase 3  TDD 开发（按批次并行子代理执行）          │  ← 全自动
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Phase 4  开发收尾 → 释放占用 → 等待用户确认        │  ← 人工确认
└─────────────────────────────────────────────────────┘
```

## 🛡️ 内置安全防护

- **敏感文件保护**：自动阻止修改 `.env`、密钥、证书等文件
- **OpenSpec 保护**：阻止直接修改 `openspec/specs/`（必须通过 `/opsx:archive`）
- **自动格式化**：编辑文件后自动运行 Prettier + ESLint
- **文件冲突防止**：并行执行时自动检测文件冲突，必要时降级为串行
- **跨 Session 保护**：文件占用声明机制防止多人同时修改相同文件（支持跨机器实时同步）

## 📊 断点恢复

如果工作流中断（网络断开、会话超时等），重新打开 Claude Code 时会自动提示：

```
⚠️ 检测到未完成的工作流：
  功能：user-search | 阶段：Phase 3 | 批次：Batch 2/4
  Session：alice-1713600000
  → 使用 /openspec-autodev:resume 继续
```

支持恢复场景：
- ✅ 当前 Session 的工作流
- ✅ 同一用户的遗留 Session（自动检测）
- ✅ 指定 Session ID 恢复：`/openspec-autodev:resume --session <id>`
- ✅ 旧版（pre-session）工作流自动迁移

## 🔧 前置依赖

| 依赖 | 说明 | 安装方式 |
|------|------|---------|
| Claude Code | CLI 工具 | [docs.anthropic.com](https://docs.anthropic.com/claude-code) |
| Git | 版本控制 | [git-scm.com](https://git-scm.com) |
| Node.js ≥ 18 | 运行时 | [nodejs.org](https://nodejs.org) |
| OpenSpec | 规格驱动 | `setup` 命令自动安装 |
| Superpowers | TDD 技能包 | `setup` 命令自动安装 |
| Docker（可选） | 协调服务部署 | [docker.com](https://docker.com)，仅跨机器协作需要 |

## 📝 License

MIT
