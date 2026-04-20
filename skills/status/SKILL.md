---
name: status
description: "查看所有活跃 session、工作流进度和文件占用情况"
argument-hint: "[--all | --claims | --cleanup]"
---

# Session Status: $ARGUMENTS

You are the multi-session status dashboard for the OpenSpec AutoDev workflow.
Show team members what everyone is working on and identify potential conflicts.

## Step 1: Read Session Data

Scan `.claude/sessions/` for all session JSON files:
```bash
ls -la .claude/sessions/*.json 2>/dev/null
```

For each session file, read and parse it. Determine if it's **active** (lastActivity within 30 minutes) or **stale**.

Also read the current session ID:
```bash
cat .claude/current-session-id 2>/dev/null
```

## Step 2: Display Session Dashboard

Display all sessions in a dashboard format:

```
=== OpenSpec AutoDev — Session Dashboard ===

📍 Current Session: <your-session-id>

👥 Active Sessions:
  👤 alice (alice-1713600000)
     Feature: user-search | Type: auto-dev | Phase: 3 (TDD Execution)
     Branch: feat/user-search | Status: running
     Files claimed: src/search/*.ts, src/api/search.ts (5 files)
     Last activity: 2 min ago

  👤 bob (bob-1713600100) ← (you)
     Feature: payment-flow | Type: auto-dev | Phase: 2 (Environment Setup)
     Branch: feat/payment-flow | Status: running
     Files claimed: src/payment/*.ts (3 files)
     Last activity: just now

  👤 charlie (charlie-1713600200)
     Feature: - | Type: - | Status: idle
     Last activity: 15 min ago

🕐 Stale Sessions (inactive > 30 min):
  👻 dave (dave-1713500000) — last active 2 hours ago
     Feature: old-feature | Unclaimed files: src/old/*.ts
     → Run /openspec-autodev:status --cleanup to remove
```

### If $ARGUMENTS contains "--claims":

Focus on file claims only:
```
=== File Claims ===

📁 Claimed Files:
  src/search/index.ts      → alice (user-search)
  src/search/utils.ts      → alice (user-search)
  src/api/search.ts        → alice (user-search)
  src/payment/checkout.ts  → bob (payment-flow)
  src/payment/cart.ts      → bob (payment-flow)

📂 Unclaimed areas: src/auth/, src/ui/, src/utils/, tests/
```

### If $ARGUMENTS contains "--cleanup":

Remove stale sessions and release their file claims:
```bash
# For each stale session (lastActivity > 30 min ago)
# Remove the session JSON and session directory
```

Report:
```
🧹 Cleaned up:
  Removed: dave-1713500000 (inactive 2 hours)
  Released: 3 file claims
```

### If $ARGUMENTS contains "--all":

Show all sessions including completed ones and detailed workflow state.

## Step 3: Conflict Analysis

After displaying the dashboard, analyze potential conflicts:

1. **File overlap**: Are any two sessions claiming overlapping file paths?
2. **Module proximity**: Are sessions working on closely related modules that might have integration issues?
3. **Branch conflicts**: Are any branches likely to conflict when merged?

If conflicts are detected:
```
⚠️ Potential Conflicts:
  1. alice (user-search) and bob (payment-flow) both modify src/api/
     → Recommend: coordinate API changes, merge user-search first
  2. charlie is idle — consider assigning unowned tasks
```

If no conflicts:
```
✅ No conflicts detected. All sessions are working in isolated areas.
```
