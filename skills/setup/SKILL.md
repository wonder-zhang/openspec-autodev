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

## Step 6: Configure Permissions for Non-Interactive Automation

If `.claude/settings.json` does NOT exist, create it with the following permissions template.
If it already exists, **merge** the `permissions` block without overwriting existing rules.

```json
{
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
      "Bash(npx -y *)",
      "Bash(npx --yes *)",
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
      "Bash(openspec *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(echo *)",
      "Bash(cd * && *)",
      "Bash(CI=true *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf /*)",
      "Bash(rm -rf ~)",
      "Bash(rm -rf ~/*)",
      "Bash(sudo *)",
      "Bash(chmod 777 *)",
      "Bash(curl * | bash*)",
      "Bash(curl * | sh*)",
      "Bash(wget * | bash*)",
      "Bash(eval *)",
      "Bash(mkfs *)",
      "Bash(dd if=*)",
      "Bash(shutdown *)",
      "Bash(reboot *)",
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Edit(.env)",
      "Edit(.env.*)",
      "Edit(**/*.pem)",
      "Edit(**/*.key)",
      "Edit(.claude/settings.json)",
      "Write(.env)",
      "Write(.env.*)",
      "Write(.claude/settings.json)"
    ]
  }
}
```

Based on the detected project type (Step 5), **append** framework-specific allow rules:

- **Node.js/TypeScript**: `Bash(tsc *)`, `Bash(eslint *)`, `Bash(prettier *)`, `Bash(jest *)`, `Bash(vitest *)`
- **Python**: `Bash(pytest *)`, `Bash(python *)`, `Bash(pip install *)`
- **Go**: `Bash(go *)`
- **Rust**: `Bash(cargo *)`
- **Java/Kotlin**: `Bash(gradlew *)`, `Bash(mvn *)`
- **React Native**: `Bash(pod install *)`, `Bash(react-native *)`

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
