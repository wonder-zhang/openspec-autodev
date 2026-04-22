---
name: setup
description: "一键初始化项目：自动安装 OpenSpec/Superpowers 依赖并配置工作流环境"
argument-hint: "[project-type]"
---

# OpenSpec AutoDev Setup

You are the project setup assistant for the OpenSpec + Superpowers automated development workflow.

## Step 1: Check and Install Dependencies

### 1.1 Check OpenSpec
Run: `npm list -g @fission-ai/openspec 2>/dev/null || echo "NOT_INSTALLED"`

If NOT_INSTALLED:
```bash
echo "📦 Installing OpenSpec..."
npm install -g @fission-ai/openspec@latest
```

Verify: `openspec --version`

### 1.2 Check Superpowers
Check if Superpowers is installed via the Claude Code plugin system:
```bash
# Check plugin system installation (primary method)
ls ~/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/ 2>/dev/null && echo "INSTALLED_VIA_PLUGIN" || echo "NOT_INSTALLED_PLUGIN"
```

Also check `~/.claude/plugins/installed_plugins.json` for an entry matching `superpowers@claude-plugins-official`.

On Windows, the path uses backslashes:
```powershell
Test-Path "$env:USERPROFILE\.claude\plugins\cache\claude-plugins-official\superpowers\*\skills"
```

If **both checks** show NOT_INSTALLED, tell the user:
```
📦 Superpowers is not installed. Please install it via:
   /plugin marketplace install superpowers
   (from the claude-plugins-official marketplace)
```

**Do NOT attempt to git clone or create symlinks** — Superpowers should be managed by Claude Code's plugin system.

If Superpowers IS found via the plugin system, report:
```
✅ Superpowers: installed via plugin system
```

### 1.3 Check Git
Verify Git is available: `git --version`
If not available, STOP and tell the user to install Git.

## Step 2: Initialize OpenSpec

If `openspec/` directory does not exist in the project root:
```bash
openspec init
```

Confirm the following structure was created:
```
openspec/
├── AGENTS.md
├── project.md
├── specs/
├── changes/
└── archive/
```

## Step 3: Write CLAUDE.md

Read the CLAUDE.md file from the plugin directory:
```bash
cat "${CLAUDE_PLUGIN_ROOT}/CLAUDE.md"
```

Write this content to the project root's `CLAUDE.md`.

If the project already has a `CLAUDE.md`, **append** the plugin's content under a `## OpenSpec AutoDev Workflow` section header, preserving existing content.

## Step 4: Configure .gitignore

Ensure the following entries exist in `.gitignore` (create if needed):

```
# OpenSpec AutoDev workflow state (session-based)
.claude/sessions/
.claude/current-session-id
.claude/workflow-metrics.log
# Legacy (pre-session) state files
.claude/workflow-state.json
.claude/current-plan.md
.claude/results/
```

## Step 5: Auto-detect Project Settings

Analyze the project structure to detect:

1. **Language/Framework**: Check for `package.json` (Node.js), `requirements.txt` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `pom.xml` (Java), etc.
2. **Test framework**: Check for jest.config, vitest.config, pytest.ini, etc.
3. **Existing lint/format config**: Check for .prettierrc, .eslintrc, etc.

Update the `CLAUDE.md` Technical Constraints section with detected values:
- Replace `[Auto-detected or user-specified]` with actual values

## Step 6: Configure `.claude/settings.json` (permissions + hooks)

项目里的 `.claude/settings.json` 必须包含两部分，插件才能正常工作：

1. **`permissions`**：非交互自动化所需的 Bash / 工具白名单（与 Step 5 检测到的栈合并）。
2. **`hooks`**：由插件在 `SessionStart` / `PreToolUse` / `PostToolUse` / `SubagentStop` 调用 `hooks/*.sh`（Session 注册、文件 claim、心跳、子代理结束等）。**若缺少 `hooks`，多 Session、协调服务、PreToolUse 拦截都不会生效。**

**推荐做法**：先读插件自带完整配置，再合并进项目（避免与下文模板长期漂移）：

```bash
cat "${CLAUDE_PLUGIN_ROOT}/settings.json"
```

将其中 **`defaultMode`**、**`hooks`** 以及需要的 **`permissions.allow` / `permissions.deny`** 合并到项目 `.claude/settings.json`。插件根目录的 `settings.json` 与下文模板在语义上应一致。

### 6.1 新建项目：完整模板

若 `.claude/settings.json` **不存在**，可直接写入下面整块（已含 `defaultMode`、`permissions`、`hooks`，与仓库根目录 `settings.json` 对齐；`hooks` 中的路径使用 `${CLAUDE_PLUGIN_ROOT}`，由 Claude Code 在加载插件时解析）。

```json
{
  "defaultMode": "auto",
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Task",
      "Bash(npm run *)",
      "Bash(npm test *)",
      "Bash(npm install *)",
      "Bash(npm list *)",
      "Bash(npm init -y *)",
      "Bash(npm exec *)",
      "Bash(npx -y *)",
      "Bash(npx --yes *)",
      "Bash(yarn *)",
      "Bash(pnpm *)",
      "Bash(node *)",
      "Bash(git status *)",
      "Bash(git diff *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git branch *)",
      "Bash(git checkout *)",
      "Bash(git switch *)",
      "Bash(git worktree *)",
      "Bash(git log *)",
      "Bash(git push *)",
      "Bash(git pull *)",
      "Bash(git merge *)",
      "Bash(git stash *)",
      "Bash(git remote *)",
      "Bash(git tag *)",
      "Bash(git rev-parse *)",
      "Bash(git show *)",
      "Bash(openspec *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(head *)",
      "Bash(tail *)",
      "Bash(wc *)",
      "Bash(find *)",
      "Bash(grep *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(mv *)",
      "Bash(touch *)",
      "Bash(echo *)",
      "Bash(printf *)",
      "Bash(pwd)",
      "Bash(which *)",
      "Bash(test *)",
      "Bash(cd * && *)",
      "Bash(CI=true *)",
      "Bash(tsc *)",
      "Bash(eslint *)",
      "Bash(prettier *)",
      "Bash(jest *)",
      "Bash(vitest *)",
      "Bash(pytest *)",
      "Bash(python *)",
      "Bash(pip install *)",
      "Bash(cargo *)",
      "Bash(go *)",
      "Bash(gradlew *)",
      "Bash(pod install *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf /*)",
      "Bash(rm -rf ~)",
      "Bash(rm -rf ~/*)",
      "Bash(rm -rf $HOME)",
      "Bash(rm -rf $HOME/*)",
      "Bash(sudo *)",
      "Bash(su *)",
      "Bash(chmod 777 *)",
      "Bash(chmod -R 777 *)",
      "Bash(curl * | bash*)",
      "Bash(curl * | sh*)",
      "Bash(wget * | bash*)",
      "Bash(wget * | sh*)",
      "Bash(eval *)",
      "Bash(:(){ :|:& };:*)",
      "Bash(mkfs *)",
      "Bash(dd if=*)",
      "Bash(format *)",
      "Bash(diskpart *)",
      "Bash(shutdown *)",
      "Bash(reboot *)",
      "Bash(reg delete *)",
      "Bash(reg add *)",
      "Bash(net user *)",
      "Bash(net localgroup *)",
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/credentials*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/*.crt)",
      "Read(**/*secret*)",
      "Read(**/*token*)",
      "Edit(.env)",
      "Edit(.env.*)",
      "Edit(**/credentials*)",
      "Edit(**/*.pem)",
      "Edit(**/*.key)",
      "Edit(**/*.crt)",
      "Edit(**/*secret*)",
      "Edit(**/*token*)",
      "Edit(.claude/settings.json)",
      "Write(.env)",
      "Write(.env.*)",
      "Write(**/credentials*)",
      "Write(**/*.pem)",
      "Write(**/*.key)",
      "Write(**/*.crt)",
      "Write(.claude/settings.json)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.sh\" \"$TOOL_INPUT_FILE_PATH\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.sh\" \"$TOOL_INPUT_FILE_PATH\""
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date '+%Y-%m-%d %H:%M:%S')] Subagent completed\" >> .claude/workflow-metrics.log && bash \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.sh\" \"\""
          }
        ]
      }
    ]
  }
}
```

### 6.2 已有 `.claude/settings.json`：合并规则

- **`permissions`**：与现有规则 **合并**（去重后追加 `allow`，`deny` 取并集或保留更严的一方），不要整文件覆盖以免丢掉团队已有配置。
- **`defaultMode`**：若缺失，设为 `"auto"`（与插件一致）。
- **`hooks`**：
  - 若 **没有 `hooks` 键**：整段写入 6.1 模板中的 `hooks` 对象。
  - 若 **已有 `hooks`**：在 **不删除** 用户自定义 hook 的前提下，为 `SessionStart`、`PostToolUse`、`PreToolUse`、`SubagentStop` 各追加一条指向 `"${CLAUDE_PLUGIN_ROOT}/hooks/..."` 的 `command`（若已存在相同命令则跳过）。若用户 hook 与插件 hook 冲突，向用户说明并保留用户选择。

### 6.3 Step 5 补充的 allow 规则

在 6.1 的 `permissions.allow` 基础上，按检测结果追加（若尚未存在）：

- **Node.js/TypeScript**：`Bash(tsc *)`, `Bash(eslint *)`, `Bash(prettier *)`, `Bash(jest *)`, `Bash(vitest *)`
- **Python**：`Bash(pytest *)`, `Bash(python *)`, `Bash(pip install *)`
- **Go**：`Bash(go *)`
- **Rust**：`Bash(cargo *)`
- **Java/Kotlin**：`Bash(gradlew *)`, `Bash(mvn *)`
- **React Native**：`Bash(pod install *)`, `Bash(react-native *)`

（6.1 模板已含部分通用项；仅追加检测到的、且列表中尚未出现的项。）

Also ensure `.claude/settings.json` is **NOT** in `.gitignore` — this file should be shared with the team.

## Step 7: Configure Coordination Server (Optional)

Ask the user:
```
👥 Multi-person collaboration: Do you want to connect to a coordination server
   for cross-machine real-time collaboration?
   (Required only if multiple developers work on separate machines)
   
   → y: Configure coordination server
   → n: Skip (local-only collaboration, works for same-machine sessions)
```

If user chooses **n**, skip to Step 8.

If user chooses **y**:

### 7.1 Collect server information

Ask for:
1. **Server URL** (e.g., `http://192.168.1.100:9527`)
2. **Project ID** (e.g., `my-app`)
3. **API Key** (obtained from server admin page)

### 7.2 Verify connection

```bash
curl -s -m 5 \
  -H "Authorization: Bearer <api-key>" \
  -H "X-Project: <project-id>" \
  "<server-url>/api/v1/sessions"
```

If connection fails, show error and offer to retry or skip.

### 7.3 Write configuration

Write `.claude/coordination.json`:
```json
{
  "enabled": true,
  "server": "<server-url>",
  "projectId": "<project-id>",
  "apiKey": "<api-key>",
  "timeout": 3000
}
```

若 `permissions.allow` 中尚无 `Bash(curl *)`，请追加该项；`session-utils.sh` 等脚本会用 `curl` 访问协调服务，缺少白名单时容易在非交互场景下反复触发权限确认。

### 7.4 Update .gitignore

Ensure `.claude/coordination.json` is in `.gitignore` (contains API key).

Report:
```
✅ Coordination server: connected (<server-url>)
   Project: <project-id>
   Cross-machine collaboration: enabled
```

## Step 8: Verification

Report setup results:

```
=== OpenSpec AutoDev Setup Complete ===

✅ OpenSpec: v{version}
✅ Superpowers: installed ({N} skills)
✅ OpenSpec initialized: openspec/
✅ CLAUDE.md: configured
✅ .gitignore: updated
✅ .claude/settings.json: permissions configured (auto mode + allow/deny rules)

📋 Detected project:
   Language: {detected}
   Test framework: {detected}
   Formatter: {detected}

🔒 Permission rules:
   Allow: {N} rules (dev commands auto-approved)
   Deny:  {N} rules (destructive ops blocked)
   Mode:  auto (AI risk assessment for unlisted commands)

🚀 Ready! Use /openspec-autodev:auto-dev <feature-name> to start developing.
   All automated phases will run without permission prompts.

👥 Multi-person support:
   Coordination server: {connected <url> / not configured}
   Each session gets isolated state under .claude/sessions/
   Use /openspec-autodev:status to see all active sessions.
   Use /openspec-autodev:claim to manage file ownership.
```
