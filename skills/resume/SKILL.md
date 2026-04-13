---
name: resume
description: "恢复中断的自动化开发工作流，从最后未完成的阶段/批次继续"
argument-hint: "[resume|restart|abort]"
---

# Resume Workflow

You are the workflow recovery assistant. Your job is to detect and resume an interrupted OpenSpec AutoDev workflow.

## Step 1: Read Workflow State

Read `.claude/workflow-state.json`. If it does not exist, report:
```
No active workflow found. Use /openspec-autodev:auto-dev <feature> to start a new one.
```

## Step 2: Analyze State

Parse the state file and determine:
- `feature`: The feature being developed / bug being fixed
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

选项：
  1. resume  — 从当前位置继续
  2. restart — 重新执行当前阶段
  3. abort   — 放弃工作流（清理 Worktree 和状态文件）
```

### For bugfix workflows:
```
🐛 检测到未完成的 Bug 修复：

🐛 Bug：<bugDescription>
📍 步骤：Step <N> (<step description>)
🌿 分支：<branch>

步骤说明：
  Step 0: 初始化
  Step 1: 根因分析
  Step 2: OpenSpec 记录
  Step 3: TDD 修复
  Step 4: 提交与总结

选项：
  1. resume  — 从当前步骤继续
  2. restart — 重新执行当前步骤
  3. abort   — 放弃修复（清理分支和状态文件）
```

If the user provided an argument ($ARGUMENTS), use it directly. Otherwise, wait for user input.

## Step 4: Execute Recovery

### If "resume":

**Determine workflow type and resume accordingly:**

#### auto-dev workflows (workflowType absent or "auto-dev"):

**Phase 0-1 interrupted:** Re-execute the phase (idempotent).

**Phase 2 interrupted:** Re-execute Phase 2 (idempotent — worktree creation and task decomposition are safe to repeat).

**Phase 3 interrupted:**
1. Read `parallelBatches` from workflow-state.json
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

### If "restart":

Reset the current phase/step:
- **auto-dev / iterate**: Update workflow-state.json: reset current phase status and all batch statuses within that phase. Re-execute the entire current phase from scratch.
- **bugfix**: Update workflow-state.json: reset current step status. Re-execute the current step from scratch.

### If "abort":

#### For auto-dev and iterate workflows:
1. Clean up Git Worktree (if exists):
```bash
WORKTREE=$(grep -o '"worktreePath"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
BRANCH=$(grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
if [ -n "$WORKTREE" ] && [ -d "$WORKTREE" ]; then
  cd ..
  git worktree remove "$WORKTREE" --force 2>/dev/null
fi
if [ -n "$BRANCH" ]; then
  git branch -D "$BRANCH" 2>/dev/null
fi
```

2. Remove state files:
```bash
rm -f .claude/workflow-state.json
rm -f .claude/current-plan.md
rm -rf .claude/results/
```

3. Report: `✅ Workflow aborted and cleaned up.`

#### For bugfix workflows:
1. Switch back to previous branch and clean up:
```bash
BRANCH=$(grep -o '"branch"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
git checkout -
if [ -n "$BRANCH" ]; then
  git branch -D "$BRANCH" 2>/dev/null
fi
```

2. Clean up OpenSpec change directory (if exists):
```bash
FEATURE=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
rm -rf "openspec/changes/$FEATURE/"
```

3. Remove state files:
```bash
rm -f .claude/workflow-state.json
```

4. Report: `✅ Bug fix aborted and cleaned up.`

