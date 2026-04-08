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
Check if Superpowers skills exist:
```bash
ls ~/.claude/skills/superpowers/skills/ 2>/dev/null || echo "NOT_INSTALLED"
```

If NOT_INSTALLED:
```bash
echo "📦 Installing Superpowers..."
mkdir -p ~/.claude/skills
git clone https://github.com/obra/superpowers.git ~/.claude/skills/superpowers

# Create skill symlinks
cd ~/.claude/skills
for skill in brainstorming using-git-worktrees writing-plans \
  test-driven-development requesting-code-review \
  finishing-a-development-branch subagent-driven-development \
  systematic-debugging verification-before-completion; do
  ln -sf superpowers/skills/$skill $skill 2>/dev/null || true
done
echo "✅ Superpowers installed"
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
# OpenSpec AutoDev workflow state
.claude/workflow-state.json
.claude/workflow-metrics.log
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

## Step 6: Verification

Report setup results:

```
=== OpenSpec AutoDev Setup Complete ===

✅ OpenSpec: v{version}
✅ Superpowers: installed ({N} skills)
✅ OpenSpec initialized: openspec/
✅ CLAUDE.md: configured
✅ .gitignore: updated

📋 Detected project:
   Language: {detected}
   Test framework: {detected}
   Formatter: {detected}

🚀 Ready! Use /openspec-autodev:auto-dev <feature-name> to start developing.
```
