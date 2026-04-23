#!/bin/bash
# openspec-autodev: PostToolUse Hook
# Auto-format with Prettier + auto-fix with ESLint after file edits.
# Updates session heartbeat for multi-session liveness tracking.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/session-utils.sh"

FILE="$1"

# Update session heartbeat
update_heartbeat

# Remote heartbeat (if coordination enabled)
load_coordination_config
MY_SID=$(get_session_id)
if [ "$COORD_ENABLED" = "true" ] && [ -n "$MY_SID" ]; then
  RESULT=$(coord_api PUT "/api/v1/sessions/${MY_SID}/heartbeat")
  if [ -n "$RESULT" ]; then
    coord_online_clear
  fi
fi

# Mirror local fileClaims to coordination server when session registration JSON was saved
if [ "$COORD_ENABLED" = "true" ] && [ -n "$MY_SID" ] && [ -n "$FILE" ]; then
  _CLAIM_SYNC_FILE="${FILE//\\//}"
  if [[ "$_CLAIM_SYNC_FILE" == *"/.claude/sessions/${MY_SID}.json" ]] || [[ "$_CLAIM_SYNC_FILE" == ".claude/sessions/${MY_SID}.json" ]]; then
    sync_remote_file_claims_from_local
  fi
  unset _CLAIM_SYNC_FILE
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Auto-format with Prettier (if available)
if command -v npx &>/dev/null; then
  npx prettier --write "$FILE" 2>/dev/null
fi

# Auto-fix with ESLint (only for JS/TS files)
echo "$FILE" | grep -qE '\.(ts|tsx|js|jsx)$' && {
  npx eslint --fix "$FILE" 2>/dev/null
}

# OpenSpec → coordination server (design §5.4: POST /specs/sync; exit 0 only when sync ran)
if [ "$COORD_ENABLED" = "true" ] && command -v node &>/dev/null; then
  _SP_FILE="${FILE//\\//}"
  if [ -f "$FILE" ] && [[ "$_SP_FILE" == openspec/changes/* ]]; then
    export COORD_SERVER COORD_API_KEY COORD_PROJECT_ID COORD_TIMEOUT
    node "${SCRIPT_DIR}/coord-specs-cache.cjs" push --file "$FILE" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      coord_online_clear
    fi
  fi
  unset _SP_FILE
fi

exit 0
