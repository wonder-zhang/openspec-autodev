#!/bin/bash
# openspec-autodev: SessionStart Hook
# Loads OpenSpec context, Git status, and detects incomplete workflows

echo "=== OpenSpec AutoDev ==="

# 1. Load OpenSpec AGENTS.md if present
if [ -f openspec/AGENTS.md ]; then
  echo "--- OpenSpec Context ---"
  cat openspec/AGENTS.md 2>/dev/null
fi

# 2. Show Git status
echo "--- Git Status ---"
git status --short 2>/dev/null | head -20

# 3. Check for active workflow
echo "--- Workflow Status ---"
if [ -f .claude/workflow-state.json ]; then
  echo "⚠️ Active workflow detected:"
  cat .claude/workflow-state.json

  # Extract key info
  FEATURE=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  PHASE=$(grep -o '"currentPhase"[[:space:]]*:[[:space:]]*[0-9]*' .claude/workflow-state.json | head -1 | sed 's/.*: *//')
  STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')

  if [ "$STATUS" != "completed" ] && [ "$STATUS" != "" ]; then
    echo ""
    echo "🔄 Incomplete workflow: $FEATURE (Phase $PHASE, Status: $STATUS)"
    echo "   → Use /openspec-autodev:resume to continue"
    echo "   → Or reply 'abort' to clean up"
  fi
else
  echo "No active workflow."
fi

# 4. Show current plan if exists
if [ -f .claude/current-plan.md ]; then
  echo "--- Current Plan (first 30 lines) ---"
  head -30 .claude/current-plan.md
fi

true
