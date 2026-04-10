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
  WORKFLOW_TYPE=$(grep -o '"workflowType"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  STEP=$(grep -o '"currentStep"[[:space:]]*:[[:space:]]*[0-9]*' .claude/workflow-state.json | head -1 | sed 's/.*: *//')
  VERSION=$(grep -o '"iterationVersion"[[:space:]]*:[[:space:]]*[0-9]*' .claude/workflow-state.json | head -1 | sed 's/.*: *//')

  if [ "$STATUS" != "completed" ] && [ "$STATUS" != "" ]; then
    echo ""
    case "$WORKFLOW_TYPE" in
      iterate)
        echo "🔄 Incomplete iteration workflow: $FEATURE (v$VERSION, Phase $PHASE, Status: $STATUS)"
        ;;
      bugfix)
        echo "🐛 Incomplete bugfix workflow: $FEATURE (Step $STEP, Status: $STATUS)"
        ;;
      *)
        echo "🔄 Incomplete workflow: $FEATURE (Phase $PHASE, Status: $STATUS)"
        ;;
    esac
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
