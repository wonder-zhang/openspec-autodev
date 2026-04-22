---
name: resume
description: "恢复中断的自动化开发工作流，支持 Session 感知的断点恢复和遗留工作流迁移"
argument-hint: "[resume|restart|abort] [--session <session-id>]"
---

# Resume Workflow

You are the workflow recovery assistant. Your job is to detect and resume an interrupted OpenSpec AutoDev workflow, with full multi-session awareness.

## Step 1: Locate Workflow State

### 1.1 Resolve Current Session

若文件缺失或 `SESSION_ID` 为空，先生成并落盘，避免 `SESSION_DIR` 变成 `.claude/sessions/` 根目录导致 Priority 1 读错路径。

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

### 1.2 Search for Workflow State (priority order)

**Priority 1 — Current session's state:**
Check `${SESSION_DIR}/workflow-state.json`. If it exists and status != "completed", use it.

**Priority 2 — Specific session (if `--session <id>` argument provided):**
Parse `$ARGUMENTS` for `--session <id>`. Check `.claude/sessions/<id>/workflow-state.json`.
If found, adopt that session: copy its session ID to `.claude/current-session-id` and use its state.

**Priority 3 — Orphaned sessions from same user:**
Scan all `.claude/sessions/*.json` files. Find sessions where:
- `user` matches current `$(whoami)`
- The session has a `workflow-state.json` with status != "completed"
- The session is stale (lastActivity > 30 min ago) — the user likely lost their previous session

If multiple orphaned sessions found, display a selection:
```
📋 Found multiple orphaned workflows for user <username>:

  1. Session <id-1>: <feature-1> (<workflow-type>, Phase <N>)
     Last active: <time ago>
  2. Session <id-2>: <feature-2> (<workflow-type>, Step <N>)
     Last active: <time ago>

Which session do you want to resume? (Enter number or session ID)
```

**Priority 4 — Legacy state (backward compatibility):**
Check `.claude/workflow-state.json` (the old pre-session path). If found:
```
📦 Found legacy workflow state (pre-session format).
   Migrating to session-based format...
```
Create a new session directory, move the legacy files:
```bash
mkdir -p "${SESSION_DIR}"
mv .claude/workflow-state.json "${SESSION_DIR}/workflow-state.json"
mv .claude/current-plan.md "${SESSION_DIR}/current-plan.md" 2>/dev/null
mv .claude/results/ "${SESSION_DIR}/results/" 2>/dev/null
```
Add `sessionId` field to the migrated workflow-state.json.

**If no workflow state found anywhere:**
```
No active workflow found. Use /openspec-autodev:auto-dev <feature> to start a new one.
Use /openspec-autodev:status to see all sessions.
```

## Step 2: Analyze State

Parse the state file and determine:
- `feature`: The feature being developed / bug being fixed
- `sessionId`: The session that owns this workflow
- `workflowType`: Type of workflow — `"auto-dev"` (default/absent), `"iterate"`, or `"bugfix"`
- `currentPhase` / `currentStep`: Which phase/step was interrupted
- `status`: Current status (running, waiting_confirmation, completed)
- `parallelBatches`: If Phase 3, which batches are completed/running/pending
- `microTasks`: Overall task progress
- `iterationVersion`: (iterate only) Which version iteration
- `branch`: The Git branch for this workflow

## Step 3: Display Recovery Options

### For auto-dev and iterate workflows:
```
🔄 检测到未完成的工作流：

📦 功能：<feature>
🔧 类型：<auto-dev | iterate v<N>>
📍 阶段：Phase <N> (<phase description>)
📊 进度：<completed>/<total> 微任务
⚡ 批次：Batch <current>/<total>
🌿 分支：<branch>
📍 Session：<session-id>

选项：
  1. resume  — 从当前位置继续
  2. restart — 重新执行当前阶段
  3. abort   — 放弃工作流（清理 Worktree、Session 和状态文件）
```

### For bugfix workflows:
```
🐛 检测到未完成的 Bug 修复：

🐛 Bug：<bugDescription>
📍 步骤：Step <N> (<step description>)
🌿 分支：<branch>
📍 Session：<session-id>

步骤说明：
  Step 0: 初始化
  Step 1: 根因分析
  Step 2: OpenSpec 记录
  Step 3: TDD 修复
  Step 4: 提交与总结

选项：
  1. resume  — 从当前步骤继续
  2. restart — 重新执行当前步骤
  3. abort   — 放弃修复（清理分支、Session 和状态文件）
```

If the user provided an argument ($ARGUMENTS), use it directly. Otherwise, wait for user input.

## Step 4: Execute Recovery

### If "resume":

**Determine workflow type and resume accordingly:**

#### auto-dev workflows (workflowType absent or "auto-dev"):

**Phase 0-1 interrupted:** Re-execute the phase (idempotent).

**Phase 2 interrupted:** Re-execute Phase 2 (idempotent — worktree creation and task decomposition are safe to repeat).

**Phase 3 interrupted:**
1. Read `parallelBatches` from `${SESSION_DIR}/workflow-state.json`
2. Find the first batch with status != "completed"
3. Resume from that batch, following the same parallel execution logic as auto-dev Step 4
4. Already-completed batches are NOT re-executed

**Phase 4 interrupted:** Re-execute verification and summary.

#### iterate workflows (workflowType = "iterate"):

Same phase-based logic as auto-dev, with these differences:
- Phase 0: Re-display the difference analysis (locate archived specs via glob `openspec/changes/archive/*-<feature>*`)
- Phase 1: Re-execute incremental spec generation (idempotent — copies from archive dir are safe to repeat)
- Phase 2-4: Same as auto-dev recovery
- Branch name uses `iter/<feature>-v<N>` pattern
- Worktree path uses `../project-<feature>-v<N>`

#### bugfix workflows (workflowType = "bugfix"):

**Step 0 interrupted:** Re-create branch (idempotent — `git checkout` to existing branch if it exists).

**Step 1 interrupted:** Re-run root cause analysis from scratch (lightweight, no harm in repeating).

**Step 2 interrupted:** Re-generate OpenSpec records (idempotent — overwrite if exists).

**Step 3 interrupted:** Resume TDD fix cycle. Check test state:
- If the failing test already exists → skip RED, go to GREEN
- If the fix is already applied → skip GREEN, go to REFACTOR
- Otherwise → restart the TDD cycle

**Step 4 interrupted:** Re-execute archive + commit + summary.

**After resuming any workflow**, update the session registration:
- Set `lastActivity` to now
- Set `status` to "running"
- Update `phase` to the current phase

### If "restart":

Reset the current phase/step:
- **auto-dev / iterate**: Update `${SESSION_DIR}/workflow-state.json`: reset current phase status and all batch statuses within that phase. Re-execute the entire current phase from scratch.
- **bugfix**: Update `${SESSION_DIR}/workflow-state.json`: reset current step status. Re-execute the current step from scratch.

### If "abort":

#### For auto-dev and iterate workflows:
1. Clean up Git Worktree (if exists):
```bash
WORKTREE=$(grep -o '"worktreePath"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
BRANCH=$(grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
if [ -n "$WORKTREE" ] && [ -d "$WORKTREE" ]; then
  cd ..
  git worktree remove "$WORKTREE" --force 2>/dev/null
fi
if [ -n "$BRANCH" ]; then
  git branch -D "$BRANCH" 2>/dev/null
fi
```

2. Remove session state files:
```bash
rm -rf "${SESSION_DIR}/"
rm -f ".claude/sessions/${SESSION_ID}.json"
rm -f .claude/current-session-id
```

3. Report: `✅ Workflow aborted and cleaned up. Session deregistered.`

#### For bugfix workflows:
1. Switch back to previous branch and clean up:
```bash
BRANCH=$(grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
git checkout -
if [ -n "$BRANCH" ]; then
  git branch -D "$BRANCH" 2>/dev/null
fi
```

2. Clean up OpenSpec change directory (if exists):
```bash
FEATURE=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
rm -rf "openspec/changes/$FEATURE/"
```

3. Remove session state files:
```bash
rm -rf "${SESSION_DIR}/"
rm -f ".claude/sessions/${SESSION_ID}.json"
rm -f .claude/current-session-id
```

4. Report: `✅ Bug fix aborted and cleaned up. Session deregistered.`
