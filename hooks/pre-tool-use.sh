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
CONFLICT_MSG=$(check_file_claim "$FILE")
if [ $? -ne 0 ]; then
  echo "⚠️ ${CONFLICT_MSG}"
  echo "Use /openspec-autodev:claim to negotiate file ownership, or /openspec-autodev:status to see all sessions."
  exit 2
fi

exit 0
