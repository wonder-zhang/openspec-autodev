#!/bin/bash
# openspec-autodev: PreToolUse Hook
# Blocks modifications to sensitive files, protected directories,
# and files claimed by other active sessions.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/session-utils.sh"

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

# Block sensitive files
echo "$FILE" | grep -qE '(\.env|\.env\..*|credentials|secrets|id_rsa|\.npmrc|\.pem|\.key|\.crt|\.pfx|\.claude/settings\.json)' && {
  echo "BLOCKED: Cannot modify sensitive file: $FILE"
  exit 2
}

# Block direct modification of openspec/specs/ (must use /opsx:archive)
echo "$FILE" | grep -q 'openspec/specs/' && {
  echo "BLOCKED: Cannot modify openspec/specs/ directly. Use /opsx:archive to promote changes."
  exit 2
}

# Check file claims from other sessions
load_coordination_config

if [ "$COORD_ENABLED" = "true" ]; then
  MY_SID=$(get_session_id)
  ENCODED_FILE="$FILE"
  if command -v node &>/dev/null; then
    ENCODED_FILE=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$FILE" 2>/dev/null || echo "$FILE")
  fi
  REMOTE_CHECK=$(coord_api GET "/api/v1/claims/check?file=${ENCODED_FILE}&session_id=${MY_SID}")

  if [ -n "$REMOTE_CHECK" ]; then
    coord_online_clear
    CONFLICT=$(node -e "
      const r = JSON.parse(process.argv[1]);
      if (r.conflict) {
        console.log('CONFLICT: File ' + process.argv[2] + ' is claimed by session ' +
          r.claimed_by.session_id + ' (user: ' + r.claimed_by.user +
          ', feature: ' + (r.claimed_by.feature || 'unknown') + ')');
      }
    " "$REMOTE_CHECK" "$FILE" 2>/dev/null)

    if [ -n "$CONFLICT" ]; then
      echo "⚠️ ${CONFLICT}"
      echo "Use /openspec-autodev:claim to negotiate file ownership, or /openspec-autodev:status to see all sessions."
      exit 2
    fi
    exit 0
  else
    coord_offline_warning
  fi
fi

# Fallback: local claim check
CONFLICT_MSG=$(check_file_claim "$FILE")
if [ $? -ne 0 ]; then
  echo "⚠️ ${CONFLICT_MSG}"
  echo "Use /openspec-autodev:claim to negotiate file ownership, or /openspec-autodev:status to see all sessions."
  exit 2
fi

exit 0
