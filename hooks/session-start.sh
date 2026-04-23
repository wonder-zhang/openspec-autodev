#!/bin/bash
# openspec-autodev: SessionStart Hook
# Registers current session, displays other active sessions,
# loads OpenSpec context, and detects incomplete workflows.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/session-utils.sh"

echo "=== OpenSpec AutoDev ==="

# --- Session Management ---
mkdir -p .claude/sessions

# Load coordination config
load_coordination_config

# Clean up stale sessions (inactive > 30 min)
cleanup_stale_sessions

# Register this session
SID=$(generate_session_id)
register_session "$SID"
echo "📍 Session: ${SID}"

# Remote registration (if coordination enabled)
if [ "$COORD_ENABLED" = "true" ]; then
  local_user=$(whoami 2>/dev/null || echo "unknown")
  REMOTE_RESULT=$(coord_api POST "/api/v1/sessions" \
    "{\"id\": \"${SID}\", \"user\": \"${local_user}\"}")
  if [ -n "$REMOTE_RESULT" ]; then
    coord_online_clear
    echo "🌐 Registered with coordination server"
  else
    coord_offline_warning
  fi
fi

# Show active sessions
echo "--- Active Sessions ---"
if [ "$COORD_ENABLED" = "true" ]; then
  REMOTE_SESSIONS=$(coord_api GET "/api/v1/sessions")
  if [ -n "$REMOTE_SESSIONS" ] && command -v node &>/dev/null; then
    coord_online_clear
    node -e "
      const sessions = JSON.parse(process.argv[1]);
      if (sessions.length === 0) { console.log('  No active sessions.'); process.exit(0); }
      for (const s of sessions) {
        const marker = s.id === '${SID}' ? ' ← (you)' : '';
        const claims = (s.file_claims || []).length;
        const claimsStr = claims > 0 ? ' [' + claims + ' files claimed]' : '';
        console.log('  👤 ' + s.user + ': ' + (s.feature || '-') +
          ' (' + (s.workflow_type || '-') + ', ' + (s.phase != null ? 'Phase ' + s.phase : '-') +
          ', ' + s.status + ')' + claimsStr + ' — ' + s.id + marker);
      }
    " "$REMOTE_SESSIONS" 2>/dev/null || list_active_sessions
  else
    list_active_sessions
  fi
else
  list_active_sessions
fi

# Remote OpenSpec spec cache (design §5.4: GET /specs at session start → .claude/remote-specs/)
if [ "$COORD_ENABLED" = "true" ] && command -v node &>/dev/null; then
  export COORD_SERVER COORD_API_KEY COORD_PROJECT_ID COORD_TIMEOUT
  if node "${SCRIPT_DIR}/coord-specs-cache.cjs" pull >/dev/null 2>&1; then
    coord_online_clear
    echo "📋 Remote OpenSpec cache: .claude/remote-specs/ (GET /api/v1/specs)"
  else
    coord_offline_warning
  fi
fi

# --- OpenSpec Context ---
if [ -f openspec/AGENTS.md ]; then
  echo "--- OpenSpec Context ---"
  cat openspec/AGENTS.md 2>/dev/null
fi

# --- Git Status ---
echo "--- Git Status ---"
git status --short 2>/dev/null | head -20

# --- Workflow Recovery Detection ---
echo "--- Workflow Status ---"
SESSION_DIR=$(get_session_dir)

# Check for workflow state in current session directory
if [ -n "$SESSION_DIR" ] && [ -f "${SESSION_DIR}/workflow-state.json" ]; then
  echo "⚠️ Active workflow detected (current session):"
  cat "${SESSION_DIR}/workflow-state.json"

  FEATURE=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  PHASE=$(grep -o '"currentPhase"[[:space:]]*:[[:space:]]*[0-9]*' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *//')
  STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  WORKFLOW_TYPE=$(grep -o '"workflowType"[[:space:]]*:[[:space:]]*"[^"]*"' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  STEP=$(grep -o '"currentStep"[[:space:]]*:[[:space:]]*[0-9]*' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *//')
  VERSION=$(grep -o '"iterationVersion"[[:space:]]*:[[:space:]]*[0-9]*' "${SESSION_DIR}/workflow-state.json" | head -1 | sed 's/.*: *//')

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

# Backward compatibility: check legacy workflow-state.json at project root
elif [ -f .claude/workflow-state.json ]; then
  echo "⚠️ Legacy workflow state detected (pre-session):"
  cat .claude/workflow-state.json

  FEATURE=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')
  PHASE=$(grep -o '"currentPhase"[[:space:]]*:[[:space:]]*[0-9]*' .claude/workflow-state.json | head -1 | sed 's/.*: *//')
  STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' .claude/workflow-state.json | head -1 | sed 's/.*: *"\(.*\)"/\1/')

  if [ "$STATUS" != "completed" ] && [ "$STATUS" != "" ]; then
    echo ""
    echo "🔄 Incomplete legacy workflow: $FEATURE (Phase $PHASE, Status: $STATUS)"
    echo "   → Use /openspec-autodev:resume to migrate and continue"
  fi
else
  # Scan other sessions for orphaned workflows (user might have lost their session)
  FOUND_ORPHAN=false
  if [ -d ".claude/sessions" ]; then
    for sf in .claude/sessions/*.json; do
      [ -f "$sf" ] || continue
      sid=$(basename "$sf" .json)
      wf_file=".claude/sessions/${sid}/workflow-state.json"
      [ -f "$wf_file" ] || continue
      wf_status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$wf_file" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
      if [ "$wf_status" != "completed" ] && [ -n "$wf_status" ]; then
        if [ "$FOUND_ORPHAN" = false ]; then
          echo "📋 Orphaned workflows from other sessions:"
          FOUND_ORPHAN=true
        fi
        wf_feature=$(grep -o '"feature"[[:space:]]*:[[:space:]]*"[^"]*"' "$wf_file" | head -1 | sed 's/.*: *"\(.*\)"/\1/')
        echo "   Session ${sid}: ${wf_feature} (${wf_status})"
      fi
    done
  fi
  if [ "$FOUND_ORPHAN" = false ]; then
    echo "No active workflow."
  fi
fi

# --- Current Plan ---
if [ -n "$SESSION_DIR" ] && [ -f "${SESSION_DIR}/current-plan.md" ]; then
  echo "--- Current Plan (first 30 lines) ---"
  head -30 "${SESSION_DIR}/current-plan.md"
elif [ -f .claude/current-plan.md ]; then
  echo "--- Current Plan [legacy] (first 30 lines) ---"
  head -30 .claude/current-plan.md
fi

true
