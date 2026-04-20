---
name: bugfix
description: "轻量级 Bug 修复：快速根因分析 + TDD 修复循环，独立分支，含 OpenSpec 追溯记录"
argument-hint: "<bug-description or issue-id>"
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep
---

# Bug Fix: $ARGUMENTS

You are the lightweight bug fix assistant for the OpenSpec + Superpowers workflow.
Your goal: quickly diagnose and fix a bug with minimal ceremony — no full spec generation, no parallel batches, no worktree.
Still follows TDD discipline and creates OpenSpec records for traceability.

## ⚠️ Non-Interactive Command Rules (MANDATORY)

**Every command MUST use non-interactive flags.** Never run a command that may prompt for user input.

### Required patterns:
| Tool | ❌ WRONG | ✅ CORRECT |
|------|----------|------------|
| npx | `npx create-vite@latest` | `npx -y create-vite@latest` |
| npm init | `npm init` | `npm init -y` |
| git commit | `git commit` | `git commit --no-edit -m "msg"` |
| General | (any command) | Prefix with `CI=true` when unsure |

## Step 0: Init Workflow State & Create Branch

### 0.1 Parse Bug Name
Extract a short slug from `$ARGUMENTS` for branch naming and OpenSpec records.
For example:
- `"login page crashes on empty email"` → `login-empty-email-crash`
- `"#142 search returns wrong results"` → `issue-142-search-results`

### 0.2 Create Fix Branch
```bash
git checkout -b fix/<bug-slug>
```

### 0.3 Resolve Session Directory
```bash
SESSION_ID=$(cat .claude/current-session-id 2>/dev/null)
SESSION_DIR=".claude/sessions/${SESSION_ID}"
mkdir -p "${SESSION_DIR}"
```

If `.claude/current-session-id` does not exist, generate a new session:
```bash
SESSION_ID="$(whoami)-$(date +%s)"
mkdir -p ".claude/sessions/${SESSION_ID}"
echo "$SESSION_ID" > .claude/current-session-id
```

**All workflow state files go under `${SESSION_DIR}/` — NOT `.claude/` directly.**

### 0.4 Write Workflow State
Write to `${SESSION_DIR}/workflow-state.json`:
```json
{
  "feature": "<bug-slug>",
  "sessionId": "<SESSION_ID>",
  "workflowType": "bugfix",
  "bugDescription": "$ARGUMENTS",
  "currentStep": 0,
  "status": "running",
  "startedAt": "<current ISO timestamp>",
  "branch": "fix/<bug-slug>"
}
```

Update `.claude/sessions/${SESSION_ID}.json`: set `feature: "<bug-slug>"`, `workflowType: "bugfix"`, `status: "running"`, `branch: "fix/<bug-slug>"`.

## Step 1: Root Cause Analysis

Use the `systematic-debugging` skill to perform a 4-stage root cause analysis:

### Stage 1: Information Gathering
- Read any error messages, stack traces, or logs mentioned in the bug description
- Identify the affected files and code paths
- Run existing tests to see if any are already failing:
  ```bash
  npm test 2>&1 | tail -50
  ```

### Stage 2: Hypothesis Formation
- Based on gathered information, form 2-3 hypotheses about the root cause
- Rank hypotheses by likelihood

### Stage 3: Hypothesis Verification
- For each hypothesis (starting with most likely):
  - Add targeted logging/assertions to verify
  - Run the relevant code path
  - Confirm or eliminate the hypothesis

### Stage 4: Root Cause Confirmation
- Document the confirmed root cause
- Identify the exact file(s) and line(s) that need to change
- Assess impact scope (what else might be affected by this bug or the fix)

Update `${SESSION_DIR}/workflow-state.json`: `currentStep: 1, rootCause: "<brief description>"`

## Step 2: Lightweight OpenSpec Record

Create minimal OpenSpec documentation for traceability:

### 2.1 Create Change Directory
```bash
mkdir -p openspec/changes/<bug-slug>/
```

### 2.2 Write proposal.md
```markdown
# Bug Fix: <bug-slug>

## Problem
<description of the bug from $ARGUMENTS>

## Root Cause
<root cause identified in Step 1>

## Impact
<affected components/features>

## Fix Approach
<brief description of the fix strategy>
```

### 2.3 Write specs.md
```markdown
# Bug Fix Specification: <bug-slug>

## Requirements
- [ ] The bug described in the problem statement must be resolved
- [ ] A regression test must be added to prevent recurrence
- [ ] All existing tests must continue to pass
- [ ] No unrelated functionality should be affected

## Acceptance Criteria
<specific, testable criteria for the fix>

## Affected Files
<list of files that will be modified>
```

Update `${SESSION_DIR}/workflow-state.json`: `currentStep: 2`

## Step 3: TDD Fix Cycle

Execute a strict TDD cycle to fix the bug. This is done as a **single agent, serial execution** — no parallel batches needed.

### 3.1 RED — Write Failing Test

Write a test that reproduces the bug:
```
1. Create a test file (or add to existing test file) that exercises the buggy code path
2. The test MUST fail with the current code, proving the bug exists
3. Run tests — confirm the new test FAILS:
```
```bash
npm test -- --testPathPattern="<relevant-test-file>"
```

If the test passes (bug cannot be reproduced in tests):
- Re-examine the root cause analysis
- Try a different reproduction approach
- If still cannot reproduce after 2 attempts, document and proceed to manual fix with extra caution

### 3.2 GREEN — Minimal Fix

Apply the minimum code change to fix the bug:
```
1. Modify ONLY the file(s) identified in the root cause analysis
2. Make the smallest possible change that fixes the bug
3. Run tests — confirm the new test PASSES:
```
```bash
npm test -- --testPathPattern="<relevant-test-file>"
```

### 3.3 REFACTOR — Regression Verification

Verify the fix doesn't break anything else:
```bash
# Run ALL tests, not just the new one
npm test

# Type check (if applicable)
npm run type-check 2>/dev/null

# Lint (if applicable)
npm run lint 2>/dev/null
```

If any pre-existing tests fail:
1. Use `systematic-debugging` to diagnose
2. Adjust the fix
3. Max 3 retries. If still failing after 3 retries, STOP and report to user

Update `${SESSION_DIR}/workflow-state.json`: `currentStep: 3, status: "fix_applied"`

## Step 4: Archive, Commit & Summary

### 4.1 Archive OpenSpec Record
```
/opsx:archive <bug-slug>
```

### 4.2 Commit
```bash
git add .
git commit --no-edit -m "fix(<scope>): <concise description of the fix>"
git push origin fix/<bug-slug>
```

The `<scope>` should be the module or component where the bug was fixed (e.g., `auth`, `search`, `api`).

### 4.3 Show Fix Summary

**STOP and show the user the fix summary:**

```
=== Bug 修复完成，等待确认 ===

🐛 Bug：$ARGUMENTS
🔍 根因：<root cause summary>
🌿 分支：fix/<bug-slug>

📊 质量指标：
  测试：✅ X/X 通过（含 1 个新增回归测试）
  类型检查：✅ 无错误
  Lint：✅ 无警告
  回归验证：✅ 所有原有测试通过

📝 修复内容：
  修改文件：<list of modified files>
  修改行数：+X / -Y

📄 追溯记录：openspec/changes/archive/（执行 openspec list 查看完整路径）

---
确认无问题，回复"确认完成"结束修复。
若有问题，请描述需要调整的内容。
```

**Wait for user confirmation.**

## Step 5: Final Report

After user confirms:

```
=== Bug 修复流程完成 ===
🐛 Bug：<bug-slug>
⏱️ 总耗时：约 X 分钟
🌿 分支：fix/<bug-slug>
📊 回归：X/X 测试通过
📄 记录：openspec/changes/archive/（执行 openspec list 查看完整路径）
```

Update `${SESSION_DIR}/workflow-state.json`: `status: "completed"`
Update session registration: `"status": "completed", "fileClaims": []`
