---
name: auto-dev
description: "全自动开发：从需求确认到开发完成，支持多子代理并行批次执行，仅一个人工确认节点"
argument-hint: "<feature-name or requirement description>"
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep
---

# Auto Dev: $ARGUMENTS

You are the fully automated development orchestrator for the OpenSpec + Superpowers workflow.
Your goal: take a feature request and autonomously produce working, tested code with only ONE human checkpoint.

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
| pod install | `pod install` | `pod install --no-repo-update` |
| General | (any command) | Prefix with `CI=true` when unsure |

### Rules:
1. **ALL `npx` calls MUST use `npx -y`** — never bare `npx`
2. **ALL `npm init` calls MUST use `npm init -y`** — never interactive init
3. **Unknown CLI tools**: check `<tool> --help` for `--yes`, `--non-interactive`, `--no-input`, or `-y` flag before running
4. **Last resort**: pipe `echo y |` before the command, or prefix with `CI=true`
5. **Framework scaffolding** (create-react-app, Vite, Next.js, etc.): always use `npx -y <pkg> ./` with all required flags to skip interactive prompts

## Step 0: Init workflow state

Write to `.claude/workflow-state.json`:
```json
{
  "feature": "$ARGUMENTS",
  "currentPhase": 0,
  "status": "running",
  "startedAt": "<current ISO timestamp>",
  "executionMode": "parallel-batch"
}
```

## Step 1: Requirements Clarification (Phase 0)

Use the `brainstorming` skill (Socratic questioning) to refine the requirement.
Then execute:
```
/opsx:explore $ARGUMENTS
```

Display the generated `proposal.md` to the user and wait for explicit confirmation ("确认", "confirm", "开始", "没问题", "ok", "yes").

Update workflow-state.json: `currentPhase: 0, status: "waiting_confirmation"`

**This is the ONLY point where you wait for open-ended user input.** After confirmation, everything runs automatically until Phase 4 summary.

## Step 2: Spec Generation (Phase 1)

Execute:
```
/opsx:new "$ARGUMENTS"
/opsx:ff
```

Verify all 4 files exist and are non-empty:
- `openspec/changes/<feature>/proposal.md`
- `openspec/changes/<feature>/specs.md`
- `openspec/changes/<feature>/design.md`
- `openspec/changes/<feature>/tasks.md`

Update workflow-state.json: `currentPhase: 1, status: "completed"`

**Proceed to Step 3 immediately. Do NOT wait for user input.**

## Step 3: Environment Setup (Phase 2)

### 3.1 Git Worktree
Spawn Task sub-agent with `using-git-worktrees` skill:
- Create branch `feat/<feature-slug>`
- Create worktree `../project-<feature-slug>`
- Verify test baseline is clean: `npm test -- --passWithNoTests`

### 3.2 Micro-task Decomposition
Spawn Task sub-agent with `writing-plans` skill:
- Read `openspec/changes/<feature>/tasks.md`
- Decompose into 2-5 minute micro-tasks
- Each micro-task MUST include: file paths, estimated time, test conditions, acceptance criteria, **dependency relationships**, **target files**
- Write to `.claude/current-plan.md`

### 3.3 Dependency Analysis & Parallel Batching
Analyze `current-plan.md` to generate parallel execution batches:

**Analysis rules:**
1. If task B explicitly depends on task A → B goes into a later batch
2. If two tasks modify the same file → they go into different batches (sequential)
3. Tasks operating on different modules/layers with no dependencies → same batch (parallel)

Generate batch plan and append to `current-plan.md`:
```
=== Parallel Execution Plan ===
Batch 1 (parallel): T1-1, T2-1, T3-1  ← no dependencies
Batch 2 (parallel): T1-2, T2-2        ← depends on Batch 1
Batch 3 (serial):   T1-3 → T4-1       ← serial chain
Batch 4 (parallel): T3-2, T5-1        ← depends on Batch 2
```

Update workflow-state.json with `parallelBatches` array:
```json
{
  "currentPhase": 2,
  "status": "completed",
  "parallelBatches": [
    { "id": 1, "tasks": ["T1-1", "T2-1", "T3-1"], "status": "pending" },
    { "id": 2, "tasks": ["T1-2", "T2-2"], "dependsOn": [1], "status": "pending" }
  ]
}
```

## Step 4: TDD Execution — Parallel Batch Mode (Phase 3)

Update workflow-state.json: `currentPhase: 3, status: "running"`

**For EACH batch in parallelBatches, in order:**

### If batch mode is "serial":
Execute tasks one by one, each as a separate Task sub-agent.

### If batch mode is "parallel" (default):
Spawn ALL tasks in the batch as **simultaneous** Task sub-agents:

Each sub-agent receives this prompt template:
```
You are a TDD development sub-agent. Execute the following micro-task strictly.

## Context (READ THESE FILES FIRST)
- openspec/changes/<feature>/specs.md
- openspec/changes/<feature>/design.md

## Your Micro-Task
<specific micro-task description from current-plan.md>

## TDD Protocol (STRICT)
1. RED: Write a failing test first. Run tests — confirm FAIL.
2. GREEN: Write minimum implementation to pass. Run tests — confirm PASS.
3. REFACTOR: Compare against specs.md. Add missing edge cases. Run tests — confirm PASS.
4. REVIEW: Use `requesting-code-review` to verify against specs.md.

## Failure Protocol
If tests fail after implementation:
1. Use `systematic-debugging` (4-stage root cause analysis)
2. Fix and re-run tests
3. Max 3 retries. If still failing, report failure and stop.

## Rules
- NEVER read conversation history. Only use specs.md and design.md.
- ONLY modify files specified in your micro-task.
- Do NOT modify files outside your assignment.
- ALL npx calls MUST use `npx -y`. ALL npm init MUST use `npm init -y`.
- ALL commands MUST be non-interactive. Use `--yes`, `-y`, `--no-input`, or `CI=true` prefix.
- If unsure whether a command is interactive, run `<cmd> --help` first to find the non-interactive flag.
```

**After ALL sub-agents in the current batch complete:**
1. Check results: count completed, failed, skipped
2. Run `git diff` to verify no file conflicts between sub-agents
3. If conflicts detected → queue conflicting tasks for serial re-execution
4. Failed tasks: decide to retry (add to next batch) or skip
5. Update workflow-state.json: batch status → "completed"
6. Move to next batch

**Continue until all batches are processed.**

Update workflow-state.json: `currentPhase: 3, status: "completed"`

## Step 5: Development Wrap-up (Phase 4)

### 5.1 Global Verification
Use `verification-before-completion` skill:
```bash
npm test                   # All tests pass
npm run type-check         # No TypeScript errors (if applicable)
npm run lint               # No lint warnings
```

### 5.2 Final Code Review
Use `requesting-code-review` skill against the complete `specs.md`.

### 5.3 Spec Archive
```
/opsx:archive <feature>
```

### 5.4 Finish Branch
Use `finishing-a-development-branch` skill:
```bash
git add .
git commit -m "feat(<feature>): <auto-generated description>"
git push origin feat/<feature>
cd ..
git worktree remove ./project-<feature>
```

## ⏸️ Step 6: PAUSE — Development Summary (Human Checkpoint ①)

**STOP and show the user a complete development summary:**

```
=== 开发阶段完成，等待确认 ===

📦 功能：<feature>
🌿 分支：feat/<feature>

📊 质量指标：
  测试：✅ X/X 通过
  覆盖率：XX%
  类型检查：✅ 无错误
  Lint：✅ 无警告

⚡ 执行模式：并行批次（X 个批次，Y 个子代理）

📝 已实现规格：
  ✅ <spec item 1>
  ✅ <spec item 2>
  ...

⚠️ 跳过的任务（需人工处理）：
  <if any>

📄 规格文档：openspec/changes/archive/（执行 openspec list 查看完整路径）

---
确认无问题，回复"确认完成"结束流程。
若有问题，请描述需要修改的内容。
```

**Wait for user confirmation.**

## Step 7: Final Report

After user confirms:

```
=== 全流程完成 ===
📦 功能：<feature>
⏱️ 总耗时：约 X 分钟
⚡ 执行模式：并行批次（X 批次）
🌿 分支：feat/<feature>
📊 覆盖率：XX%（X/X 测试通过）
```

Update workflow-state.json: `status: "completed"`
