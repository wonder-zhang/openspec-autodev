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
- `feature`: The feature being developed
- `currentPhase`: Which phase was interrupted (0-4)
- `status`: Current status (running, waiting_confirmation, completed)
- `parallelBatches`: If Phase 3, which batches are completed/running/pending
- `microTasks`: Overall task progress

## Step 3: Display Recovery Options

```
🔄 检测到未完成的工作流：

📦 功能：<feature>
📍 阶段：Phase <N> (<phase description>)
📊 进度：<completed>/<total> 微任务
⚡ 批次：Batch <current>/<total>

选项：
  1. resume  — 从当前位置继续
  2. restart — 重新执行当前阶段
  3. abort   — 放弃工作流（清理 Worktree 和状态文件）
```

If the user provided an argument ($ARGUMENTS), use it directly. Otherwise, wait for user input.

## Step 4: Execute Recovery

### If "resume":

**Phase 0-1 interrupted:** Re-execute the phase (idempotent).

**Phase 2 interrupted:** Re-execute Phase 2 (idempotent — worktree creation and task decomposition are safe to repeat).

**Phase 3 interrupted:**
1. Read `parallelBatches` from workflow-state.json
2. Find the first batch with status != "completed"
3. Resume from that batch, following the same parallel execution logic as auto-dev Step 4
4. Already-completed batches are NOT re-executed

**Phase 4 interrupted:** Re-execute verification and summary.

### If "restart":

Reset the current phase:
- Update workflow-state.json: reset current phase status and all batch statuses within that phase
- Re-execute the entire current phase from scratch

### If "abort":

1. Clean up Git Worktree (if exists):
```bash
WORKTREE=$(jq -r '.worktreePath' .claude/workflow-state.json)
BRANCH=$(jq -r '.branch' .claude/workflow-state.json)
if [ -n "$WORKTREE" ] && [ -d "$WORKTREE" ]; then
  cd ..
  git worktree remove "$WORKTREE" --force 2>/dev/null
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
