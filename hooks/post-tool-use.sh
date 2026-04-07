#!/bin/bash
# openspec-autodev: PostToolUse Hook
# Auto-format with Prettier + auto-fix with ESLint after file edits

FILE="$1"

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
