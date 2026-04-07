#!/bin/bash
# openspec-autodev: PreToolUse Hook
# Blocks modifications to sensitive files and protected directories

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

exit 0
