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
if [ "$COORD_ENABLED" = "true" ]; then
  MY_SID=$(get_session_id)
  if [ -n "$MY_SID" ]; then
    RESULT=$(coord_api PUT "/api/v1/sessions/${MY_SID}/heartbeat")
    if [ -n "$RESULT" ]; then
      coord_online_clear
    fi
  fi
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

exit 0
