---
name: iterate
description: "迭代开发：基于已完成功能的归档规格进行增量式迭代，支持版本号参数"
argument-hint: "<feature-name> [vN]"
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep
---

# Iterate Dev: $ARGUMENTS

You are the iteration development orchestrator for the OpenSpec + Superpowers workflow.
Your goal: take an **existing, previously completed** feature and perform incremental iteration — adding, modifying, or extending functionality based on the archived specs and existing codebase.

## ⚠️ Non-Interactive Command Rules (MANDATORY)

All phases after Phase 0 run **fully automatically**. Any interactive prompt will block the pipeline.
**Every command MUST use non-interactive flags.** Never run a command that may prompt for user input.

### Required patterns:
| Tool | ❌ WRONG | ✅ CORRECT |
|------|----------|------------|
| npx | `npx create-vite@latest` | `npx -y create-vite@latest` |
| npm init | `npm init` | `npm init -y` |
| yarn | `yarn create` | `yarn --non-interactive create` |
| pip | `pip install pkg` | `pip install pkg --yes` or `pip install pkg -y` |
| git commit | `git commit` | `git commit --no-edit -m "msg"` |
| git merge | `git merge branch` | `git merge --no-edit branch` |
| General | (any command) | Prefix with `CI=true` when unsure |

### Rules:
1. **ALL `npx` calls MUST use `npx -y`** — never bare `npx`
2. **ALL `npm init` calls MUST use `npm init -y`** — never interactive init
3. **Unknown CLI tools**: check `<tool> --help` for `--yes`, `--non-interactive`, `--no-input`, or `-y` flag before running
4. **Last resort**: pipe `echo y |` before the command, or prefix with `CI=true`

## Step 0: Parse Arguments & Init Workflow State

Parse `$ARGUMENTS` to extract:
- `<feature-name>`: the feature to iterate on (REQUIRED)
- `[vN]`: optional version number (e.g., `v2`, `v3`)

If no version number is provided, auto-detect by scanning existing branches:
```bash
# Find the highest existing version number
git branch -a | grep -oE 'iter/<feature-name>-v([0-9]+)' | grep -oE 'v[0-9]+' | sort -V | tail -1
```
If no prior iteration branch exists, default to `v2` (since `v1` is the original `auto-dev` run).

### Resolve Session Directory

与 `auto-dev` 相同：优先读 hook 写入的 `.claude/current-session-id`；若缺失或为空则生成，并去掉 `\r`，避免 `SESSION_DIR` 指向错误路径。

```bash
SESSION_ID=$(cat .claude/current-session-id 2>/dev/null | tr -d '\r\n' || true)
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(whoami 2>/dev/null || echo unknown)-$(date +%s)"
  mkdir -p ".claude/sessions/${SESSION_ID}"
  printf '%s\n' "$SESSION_ID" > .claude/current-session-id
fi
SESSION_DIR=".claude/sessions/${SESSION_ID}"
mkdir -p "${SESSION_DIR}"
```

**All workflow state files go under `${SESSION_DIR}/` — NOT `.claude/` directly.**

Check for conflicting sessions working on the same feature. If found, warn the user.

Write to `${SESSION_DIR}/workflow-state.json`:
```json
{
  "feature": "<feature-name>",
  "sessionId": "<SESSION_ID>",
  "workflowType": "iterate",
  "iterationVersion": <N>,
  "currentPhase": 0,
  "status": "running",
  "startedAt": "<current ISO timestamp>",
  "executionMode": "parallel-batch"
}
```

Update `.claude/sessions/${SESSION_ID}.json`: set `feature`, `workflowType: "iterate"`, `status: "running"`, `phase: 0`.

## Step 1: Verify Archive Exists

Check that the feature has been previously developed and archived.
OpenSpec CLI archives changes to `openspec/changes/archive/YYYY-MM-DD-<name>/`, so use glob matching to find the latest archived version:
```bash
# Find the latest archive for this feature (matches both original and iteration archives)
# Pattern matches: *-<feature-name> and *-<feature-name>-v<N>
ARCHIVE_DIR=$(ls -dt openspec/changes/archive/*-<feature-name>* 2>/dev/null | head -1)
if [ -z "$ARCHIVE_DIR" ]; then
  echo "No archive found for <feature-name>"
fi
```

If the archive does NOT exist (`$ARCHIVE_DIR` is empty), check `openspec/changes/<feature-name>/`:
- If changes exist → the feature is still in progress, suggest using `/openspec-autodev:resume` instead
- If neither exists → STOP and tell the user: `No prior development found for "<feature-name>". Use /openspec-autodev:auto-dev <feature-name> for first-time development.`

**Store `$ARCHIVE_DIR` for use in subsequent steps.**

## Step 2: Difference Analysis (Phase 0) — Human Checkpoint

### 2.1 Load Archived Context
Read and summarize the archived specs (from `$ARCHIVE_DIR` found in Step 1):
- `$ARCHIVE_DIR/specs/` directory or `$ARCHIVE_DIR/specs.md` — what was specified
- `$ARCHIVE_DIR/design.md` — how it was designed
- `$ARCHIVE_DIR/tasks.md` — what tasks were completed

### 2.2 Analyze Current Codebase
Scan the existing implementation:
- Find all files created/modified for this feature (using git log or file patterns from the archived specs)
- Summarize what's currently implemented and tested

### 2.3 Present Difference Analysis
Display to the user:
```
=== 迭代分析：<feature-name> (v<N>) ===

📦 已有功能（基于归档规格）：
  ✅ <implemented spec item 1>
  ✅ <implemented spec item 2>
  ...

📝 用户迭代需求：
  <user's iteration description from $ARGUMENTS>

🔍 差异分析：
  🔄 需修改：<items that need changes>
  ➕ 需新增：<items that are new>
  ⚠️ 可能影响：<existing items that might be affected>

---
请确认以上分析，回复"确认"开始迭代开发。
若有补充，请说明需要调整的内容。
```

Wait for user confirmation ("确认", "confirm", "开始", "没问题", "ok", "yes").

Update `${SESSION_DIR}/workflow-state.json`: `currentPhase: 0, status: "waiting_confirmation"`

**This is the ONLY point where you wait for open-ended user input.** After confirmation, everything runs automatically until Phase 4 summary.

## Step 3: Incremental Spec Generation (Phase 1)

### 3.1 Restore Change Directory
Copy archived specs back to a new change directory (using `$ARCHIVE_DIR` from Step 1):
```bash
mkdir -p openspec/changes/<feature-name>-v<N>/
cp "$ARCHIVE_DIR"/proposal.md openspec/changes/<feature-name>-v<N>/ 2>/dev/null
# Copy specs — handle both flat file (specs.md) and directory structure (specs/)
if [ -d "$ARCHIVE_DIR/specs" ]; then
  cp -r "$ARCHIVE_DIR"/specs openspec/changes/<feature-name>-v<N>/
fi
if [ -f "$ARCHIVE_DIR/specs.md" ]; then
  cp "$ARCHIVE_DIR"/specs.md openspec/changes/<feature-name>-v<N>/
fi
cp "$ARCHIVE_DIR"/design.md openspec/changes/<feature-name>-v<N>/ 2>/dev/null
cp "$ARCHIVE_DIR"/tasks.md openspec/changes/<feature-name>-v<N>/ 2>/dev/null
```

### 3.2 Incrementally Update Specs
Based on the user's iteration requirements and the difference analysis:

1. **Update `proposal.md`**: Add an "Iteration v<N>" section describing what's changing
2. **Update `specs.md`**: Add/modify specification items. Mark existing items as `[UNCHANGED]`, modified items as `[MODIFIED]`, new items as `[NEW]`
3. **Update `design.md`**: Adjust technical design for the changes. Reference existing code where applicable
4. **Update `tasks.md`**: Create a NEW task list with ONLY the delta work. Do NOT include already-completed tasks. Clearly mark:
   - `[MODIFY]` tasks that change existing code
   - `[NEW]` tasks that add new code
   - `[TEST-UPDATE]` tasks that update existing tests

**Key principle: Only generate tasks for what's changing, not for what already works.**

Update `${SESSION_DIR}/workflow-state.json`: `currentPhase: 1, status: "completed"`

**Proceed to Step 4 immediately. Do NOT wait for user input.**

## Step 4: Environment Setup (Phase 2)

### 4.1 Git Branch & Worktree
Create the iteration branch and worktree:
```bash
git branch iter/<feature-name>-v<N>
git worktree add ../project-<feature-name>-v<N> iter/<feature-name>-v<N>
```

Verify test baseline in the worktree:
```bash
cd ../project-<feature-name>-v<N> && npm test -- --passWithNoTests
```

### 4.2 Micro-task Decomposition
Spawn Task sub-agent with `writing-plans` skill:
- Read `openspec/changes/<feature-name>-v<N>/tasks.md` (the DELTA tasks only)
- Decompose into 2-5 minute micro-tasks
- Each micro-task MUST include: file paths, estimated time, test conditions, acceptance criteria, **dependency relationships**, **target files**
- For `[MODIFY]` tasks: include the existing file paths and what specifically to change
- Write to `${SESSION_DIR}/current-plan.md`

### 4.3 Dependency Analysis & Parallel Batching
Analyze `${SESSION_DIR}/current-plan.md` to generate parallel execution batches (same logic as auto-dev):

**Analysis rules:**
1. If task B explicitly depends on task A → B goes into a later batch
2. If two tasks modify the same file → they go into different batches (sequential)
3. Tasks operating on different modules/layers with no dependencies → same batch (parallel)

Generate batch plan and append to `${SESSION_DIR}/current-plan.md`.

### 4.4 Register File Claims
Extract all target file paths from `${SESSION_DIR}/current-plan.md` and register as file claims in `.claude/sessions/${SESSION_ID}.json`. Check for conflicts with other active sessions before registering. If conflicts exist, warn the user and offer options (skip/force/abort).

**Remote coordination:** If `coordination.json` is enabled, updating `.claude/sessions/${SESSION_ID}.json` automatically syncs `fileClaims` to the server on the next tool completion (`PostToolUse` hook); no manual API call is required after saving that file.

### 4.5 Update workflow state
Update `${SESSION_DIR}/workflow-state.json` with `parallelBatches` array:
```json
{
  "currentPhase": 2,
  "status": "completed",
  "parallelBatches": [
    { "id": 1, "tasks": ["T1-1", "T2-1"], "status": "pending" },
    { "id": 2, "tasks": ["T1-2"], "dependsOn": [1], "status": "pending" }
  ]
}
```

Update session registration: `"phase": 2`

## Step 5: TDD Execution — Parallel Batch Mode (Phase 3)

Update `${SESSION_DIR}/workflow-state.json`: `currentPhase: 3, status: "running"`

**For EACH batch in parallelBatches, in order:**

### If batch mode is "serial":
Execute tasks one by one, each as a separate Task sub-agent.

### If batch mode is "parallel" (default):
Spawn ALL tasks in the batch as **simultaneous** Task sub-agents:

Each sub-agent receives this prompt template:
```
You are a TDD development sub-agent performing an ITERATION task. Execute the following micro-task strictly.

## Context (READ THESE FILES FIRST)
- openspec/changes/<feature-name>-v<N>/specs.md (look for [MODIFIED] and [NEW] items)
- openspec/changes/<feature-name>-v<N>/design.md
- Also review EXISTING code in the files you are modifying

## Your Micro-Task
<specific micro-task description from current-plan.md>

## TDD Protocol (STRICT)
1. RED: Write a failing test first (or update existing test to fail). Run tests — confirm FAIL.
2. GREEN: Write minimum implementation/modification to pass. Run tests — confirm PASS.
3. REFACTOR: Compare against specs.md. Ensure backward compatibility. Run tests — confirm PASS.
4. REVIEW: Use `requesting-code-review` to verify against specs.md.

## Iteration-Specific Rules
- When modifying existing files, preserve ALL existing functionality unless explicitly specified to change
- When updating tests, ensure ALL previous test cases still pass
- Reference the existing codebase to maintain consistent code style

## Failure Protocol
If tests fail after implementation:
1. Use `systematic-debugging` (4-stage root cause analysis)
2. Fix and re-run tests
3. Max 3 retries. If still failing, report failure and stop.

## Rules
- NEVER read conversation history. Only use specs.md, design.md, and existing source code.
- ONLY modify files specified in your micro-task.
- Do NOT modify files outside your assignment.
- ALL npx calls MUST use `npx -y`. ALL npm init MUST use `npm init -y`.
- ALL commands MUST be non-interactive. Use `--yes`, `-y`, `--no-input`, or `CI=true` prefix.
```

**After ALL sub-agents in the current batch complete:**
1. Check results: count completed, failed, skipped
2. Run `git diff` to verify no file conflicts between sub-agents
3. If conflicts detected → queue conflicting tasks for serial re-execution
4. Failed tasks: decide to retry (add to next batch) or skip
5. Update `${SESSION_DIR}/workflow-state.json`: batch status → "completed"
6. Move to next batch

**Continue until all batches are processed.**

Update `${SESSION_DIR}/workflow-state.json`: `currentPhase: 3, status: "completed"`

## Step 6: Development Wrap-up (Phase 4)

### 6.1 Global Verification
Use `verification-before-completion` skill:
```bash
npm test                   # All tests pass (including pre-existing ones)
npm run type-check         # No TypeScript errors (if applicable)
npm run lint               # No lint warnings
```

### 6.2 Backward Compatibility Check
Verify that ALL pre-existing tests still pass — not just the new/modified ones.

### 6.3 Final Code Review
Use `requesting-code-review` skill against the complete `specs.md` (including `[UNCHANGED]` items to verify no regressions).

### 6.4 Spec Archive
```
/opsx:archive <feature-name>-v<N>
```

### 6.5 Finish Branch
Use `finishing-a-development-branch` skill:
```bash
git add .
git commit -m "feat(<feature-name>): iteration v<N> — <auto-generated description>"
git push origin iter/<feature-name>-v<N>
cd ..
git worktree remove ./project-<feature-name>-v<N>
```

### 6.6 Release File Claims
Clear this session's file claims: update `.claude/sessions/${SESSION_ID}.json` with `"fileClaims": [], "status": "completed"`.

## ⏸️ Step 7: PAUSE — Development Summary (Human Checkpoint ①)

**STOP and show the user a complete iteration summary:**

```
=== 迭代开发完成，等待确认 ===

📦 功能：<feature-name>（迭代 v<N>）
🌿 分支：iter/<feature-name>-v<N>

📊 质量指标：
  测试：✅ X/X 通过（含 Y 个新增/修改测试）
  覆盖率：XX%
  类型检查：✅ 无错误
  Lint：✅ 无警告
  向后兼容：✅ 所有原有测试通过

⚡ 执行模式：并行批次（X 个批次，Y 个子代理）

📝 迭代变更：
  🔄 修改：<modified spec items>
  ➕ 新增：<new spec items>
  ✅ 未变更：<unchanged spec items>

⚠️ 跳过的任务（需人工处理）：
  <if any>

📄 规格文档：openspec/changes/archive/（执行 openspec list 查看完整路径）

---
确认无问题，回复"确认完成"结束流程。
若有问题，请描述需要修改的内容。
```

**Wait for user confirmation.**

## Step 8: Final Report

After user confirms:

```
=== 迭代完成 ===
📦 功能：<feature-name>（v<N>）
⏱️ 总耗时：约 X 分钟
⚡ 执行模式：并行批次（X 批次）
🌿 分支：iter/<feature-name>-v<N>
📊 覆盖率：XX%（X/X 测试通过）
🔄 迭代次数：v<N>
```

Update `${SESSION_DIR}/workflow-state.json`: `status: "completed"`

Update session registration: `"status": "completed", "phase": null, "fileClaims": []`
