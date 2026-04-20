---
name: claim
description: "管理文件占用声明：声明、释放、转让文件所有权"
argument-hint: "<add|release|transfer> <file-pattern> [--to session-id]"
---

# File Claim Management: $ARGUMENTS

You are the file ownership manager for multi-session collaboration.
Manage which session owns which files to prevent edit conflicts.

## Parse Arguments

Parse `$ARGUMENTS` to extract:
- **action**: `add`, `release`, `transfer`, or `list` (default: `list`)
- **file-pattern**: glob pattern or file path (e.g., `src/search/*.ts`)
- **--to**: target session ID (only for `transfer`)

## Action: list (default)

Read the current session's file claims from `.claude/sessions/<session-id>.json` and display:
```
=== Your File Claims (session: <session-id>) ===

📁 Claimed files/patterns:
  1. src/search/index.ts
  2. src/search/utils.ts
  3. src/api/search.ts

To release: /openspec-autodev:claim release <pattern>
To add:     /openspec-autodev:claim add <pattern>
```

## Action: add

### Step 1: Conflict Check
Before adding a claim, check all other active sessions for overlapping claims:

```bash
# Read all session files in .claude/sessions/
# For each other active session, check if any of their fileClaims
# overlap with the requested pattern
```

### Step 2: Handle Conflicts

**If no conflict**: Add the pattern to the current session's `fileClaims` array:
```bash
# Update .claude/sessions/<session-id>.json
# Append the new pattern to fileClaims
```

Report: `✅ Claimed: <pattern>`

**If conflict detected**: Report and offer options:
```
⚠️ Conflict: <pattern> overlaps with session <other-id> (<user>, <feature>)

Options:
  1. Force claim — override (the other session will be warned on next edit)
  2. Request transfer — ask the other user to release
  3. Cancel — do not claim

Reply with your choice.
```

If user chooses "Force claim", add the claim and log a warning in the other session's directory:
```bash
echo "WARNING: <your-session> force-claimed <pattern> at <timestamp>" >> .claude/sessions/<other-id>/conflict-log.txt
```

## Action: release

Remove the specified pattern from the current session's `fileClaims`:
```bash
# Update .claude/sessions/<session-id>.json
# Remove matching patterns from fileClaims
```

Report: `✅ Released: <pattern>`

## Action: transfer

Transfer a file claim from the current session to another session:

### Step 1: Verify ownership
Confirm the pattern is in the current session's claims.

### Step 2: Move claim
1. Remove from current session's `fileClaims`
2. Add to target session's `fileClaims`

Report: `✅ Transferred: <pattern> → <target-session-id>`

## Automatic Claims

Note: File claims are typically set **automatically** during Phase 2 (Environment Setup) of auto-dev and iterate workflows. The micro-task decomposition step identifies which files each task modifies, and these are registered as claims for the session.

Manual claim management is for:
- **Resolving conflicts** when two features touch the same files
- **Claiming shared utilities** that multiple features need to modify
- **Releasing files early** when your changes to them are complete
- **Transferring ownership** when handing off work
